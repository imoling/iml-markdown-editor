import { app, dialog, ipcMain, BrowserWindow, shell, systemPreferences, utilityProcess, type UtilityProcess } from 'electron';
import { scheduler } from '../localModel/scheduler';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ASR_RUNTIME_VERSION, GLUE_PACKAGE, MODEL_FILES, SPEAKER_MODEL, nativePackageFor, nativeDirName, npmTarballUrls, totalDownloadBytes, type AsrDownload } from './catalog';
import { downloadFile, DownloadError } from '../localModel/download';
import { extractArchive } from '../localModel/runtime';
import { resolveModelUrl } from '../localModel/catalog';
import { getDownloadSettings } from '../localModel';
import { AUDIO_EXT_RE } from '../assets';

/**
 * 实时转写（26.3）：管下载、管识别进程、在渲染进程和识别进程之间转发音频与文字。
 * 音频只在本机三个进程之间走：渲染进程采集 → 主进程转发 → 识别进程；不落盘、不联网。
 */

export type AsrSessionStatus = 'idle' | 'starting' | 'recording' | 'stopping';

/** 系统层面的麦克风授权。unknown：这个平台没有这道关（Linux），当作放行 */
export type MicAccess = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown';

export interface AsrState {
  /** 这个平台有没有对应的原生模块 */
  supported: boolean;
  installed: boolean;
  /** 总共要下载多少字节（界面上告诉用户） */
  downloadBytes: number;
  /** 已下载的识别组件 + 语音模型占了多少磁盘 */
  installedBytes: number;
  runtimeVersion: string;
  micAccess: MicAccess;
  /** 区分说话人用的声纹模型：可选组件，单独下载 */
  speaker: { installed: boolean; bytes: number; install: { active: boolean; received: number; total: number; error: string | null } | null };
  install: { active: boolean; received: number; total: number; step: string; error: string | null } | null;
  session: AsrSessionStatus;
  error: string | null;
}

interface Deps { isAiEnabled: () => boolean }

let deps: Deps | null = null;
let worker: UtilityProcess | null = null;
let session: AsrSessionStatus = 'idle';
let lastError: string | null = null;
let install: AsrState['install'] = null;
let installController: AbortController | null = null;
let speakerInstall: AsrState['speaker']['install'] = null;
let speakerController: AbortController | null = null;

const rootDir = () => path.join(app.getPath('userData'), 'asr');
const runtimeDir = () => path.join(rootDir(), 'runtime', ASR_RUNTIME_VERSION);
const modelsDir = () => path.join(rootDir(), 'models');
const glueDir = () => path.join(runtimeDir(), 'sherpa-onnx-node');
const nativeDir = () => path.join(runtimeDir(), nativeDirName(process.platform, process.arch));
const modelPath = (file: string) => path.join(modelsDir(), file);

function isSpeakerInstalled(): boolean {
  try { return fs.statSync(modelPath(SPEAKER_MODEL.file)).size === SPEAKER_MODEL.size; } catch { return false; }
}

function isInstalled(): boolean {
  return fs.existsSync(path.join(glueDir(), 'sherpa-onnx.js'))
    && fs.existsSync(path.join(nativeDir(), 'sherpa-onnx.node'))
    && MODEL_FILES.every((f) => { try { return fs.statSync(modelPath(f.file)).size === f.size; } catch { return false; } });
}

function micAccess(): MicAccess {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return 'unknown';
  try { return systemPreferences.getMediaAccessStatus('microphone') as MicAccess; } catch { return 'unknown'; }
}

export function getAsrState(): AsrState {
  const installed = isInstalled();
  return {
    supported: !!nativePackageFor(process.platform, process.arch),
    installed,
    downloadBytes: totalDownloadBytes(process.platform, process.arch),
    installedBytes: installed ? totalDownloadBytes(process.platform, process.arch) : 0,
    runtimeVersion: ASR_RUNTIME_VERSION,
    micAccess: micAccess(),
    speaker: { installed: isSpeakerInstalled(), bytes: SPEAKER_MODEL.size, install: speakerInstall },
    install,
    session,
    error: lastError,
  };
}

let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const state = getAsrState();
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('asr:state', state);
  }, 100);
}

const sendEvent = (event: unknown) => {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('asr:event', event);
};

// ── 下载与安装 ───────────────────────────────────────────────────────────────

async function fetchWithFallback(urls: string[], dest: string, spec: AsrDownload, signal: AbortSignal, onBytes: (received: number) => void) {
  let lastErr: unknown = null;
  for (const url of urls) {
    // 每个地址给几次机会：小文件在镜像站上偶尔会卡住，断点续传接着下
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await downloadFile(url, dest, { expectedSize: spec.size, sha256: spec.sha256, signal, onProgress: (p) => onBytes(p.received ?? 0) });
        return;
      } catch (err) {
        lastErr = err;
        if (err instanceof DownloadError && err.code === 'aborted') throw err;
        if (!(err instanceof DownloadError) || err.code !== 'network') break;   // 校验不过、404 之类的换下一个地址
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }
  throw lastErr;
}

/** npm 的 tgz 解出来是一个 package/ 目录：解到临时目录，再把 package 挪成目标目录名 */
async function unpackNpm(archive: string, target: string) {
  const tmp = `${target}.unpack`;
  await fs.promises.rm(tmp, { recursive: true, force: true });
  await fs.promises.mkdir(tmp, { recursive: true });
  await extractArchive(archive, tmp);
  await fs.promises.rm(target, { recursive: true, force: true });
  await fs.promises.rename(path.join(tmp, 'package'), target);
  await fs.promises.rm(tmp, { recursive: true, force: true });
  await fs.promises.rm(archive, { force: true });
}

async function runInstall() {
  const native = nativePackageFor(process.platform, process.arch);
  if (!native) throw new Error('这个平台暂不支持实时转写');
  const controller = new AbortController();
  installController = controller;
  const total = totalDownloadBytes(process.platform, process.arch);
  let done = 0;
  const step = (name: string, received: number) => { install = { active: true, received: done + received, total, step: name, error: null }; broadcast(); };
  const { source, customBase } = getDownloadSettings();
  const preferOfficial = source === 'huggingface';

  await fs.promises.mkdir(runtimeDir(), { recursive: true });
  await fs.promises.mkdir(modelsDir(), { recursive: true });

  // 先下小的（运行时），再下大的（模型）：万一平台包有问题，不用等 200 多 MB 下完才知道
  for (const [pkg, target, label] of [[GLUE_PACKAGE, glueDir(), '识别组件'], [native, nativeDir(), '识别组件']] as const) {
    const archive = path.join(runtimeDir(), `${pkg.pkg}.tgz`);
    if (!fs.existsSync(path.join(target, pkg === GLUE_PACKAGE ? 'sherpa-onnx.js' : 'sherpa-onnx.node'))) {
      await fetchWithFallback(npmTarballUrls(pkg.pkg, preferOfficial), archive, pkg, controller.signal, (r) => step(label, r));
      step('解压', pkg.size);
      await unpackNpm(archive, target);
    }
    done += pkg.size;
  }
  for (const file of MODEL_FILES) {
    const dest = modelPath(file.file);
    let ok = false;
    try { ok = fs.statSync(dest).size === file.size; } catch { /* 还没下 */ }
    if (!ok) {
      const url = resolveModelUrl({ repo: file.repo, file: file.path }, source, customBase);
      await fetchWithFallback([url], dest, file, controller.signal, (r) => step('语音模型', r));
    }
    done += file.size;
  }
}

async function startInstall() {
  if (install?.active) return;
  lastError = null;
  install = { active: true, received: 0, total: totalDownloadBytes(process.platform, process.arch), step: '准备', error: null };
  broadcast();
  try {
    await runInstall();
    install = null;
  } catch (err: any) {
    const aborted = err instanceof DownloadError && err.code === 'aborted';
    install = aborted ? null : { active: false, received: install?.received ?? 0, total: install?.total ?? 0, step: '', error: err?.message || String(err) };
  } finally {
    installController = null;
    broadcast();
  }
}

async function startSpeakerInstall() {
  if (speakerInstall?.active || isSpeakerInstalled()) return;
  const controller = new AbortController();
  speakerController = controller;
  speakerInstall = { active: true, received: 0, total: SPEAKER_MODEL.size, error: null };
  broadcast();
  try {
    await fs.promises.mkdir(modelsDir(), { recursive: true });
    const { source, customBase } = getDownloadSettings();
    const url = resolveModelUrl({ repo: SPEAKER_MODEL.repo, file: SPEAKER_MODEL.path }, source, customBase);
    await fetchWithFallback([url], modelPath(SPEAKER_MODEL.file), SPEAKER_MODEL, controller.signal, (received) => { speakerInstall = { active: true, received, total: SPEAKER_MODEL.size, error: null }; broadcast(); });
    speakerInstall = null;
  } catch (err: any) {
    const aborted = err instanceof DownloadError && err.code === 'aborted';
    speakerInstall = aborted ? null : { active: false, received: 0, total: SPEAKER_MODEL.size, error: err?.message || String(err) };
  } finally {
    speakerController = null;
    broadcast();
  }
}

// ── 识别进程 ─────────────────────────────────────────────────────────────────

function killWorker() {
  if (!worker) return;
  try { worker.kill(); } catch { /* 已经退出 */ }
  worker = null;
}

async function startSession(opts: { speakers?: boolean; source?: 'mic' | 'file' } = {}): Promise<AsrState> {
  if (session !== 'idle') return getAsrState();
  if (deps && !deps.isAiEnabled()) throw new Error('AI 功能已在设置里关闭');
  if (!isInstalled()) throw new Error('还没有下载转写组件');

  // macOS：麦克风要过系统这一关。用户之前点过「不允许」的话这里直接返回 false，只能去系统设置里改
  if (process.platform === 'darwin' && opts.source !== 'file') {   // 转写录音文件用不着麦克风
    const granted = await systemPreferences.askForMediaAccess('microphone');
    if (!granted) throw new Error('没有麦克风权限：请到「系统设置 → 隐私与安全性 → 麦克风」里允许 iML Markdown Editor');
  }

  await scheduler.ensureCapacity('asr');
  session = 'starting';
  lastError = null;
  broadcast();

  return new Promise<AsrState>((resolve, reject) => {
    const child = utilityProcess.fork(path.join(__dirname, 'worker.js'), [], { serviceName: 'iML 实时转写', stdio: 'ignore' });
    worker = child;
    let settled = false;
    const fail = (message: string) => {
      lastError = message;
      if (worker === child) { killWorker(); session = 'idle'; }
      broadcast();
      if (!settled) { settled = true; reject(new Error(message)); } else sendEvent({ type: 'error', message });
    };
    const timer = setTimeout(() => fail('转写组件加载超时'), 30000);

    child.on('message', (m: any) => {
      if (m?.type === 'ready') {
        clearTimeout(timer);
        session = 'recording';
        scheduler.touch('asr');
        broadcast();
        if (!settled) { settled = true; resolve(getAsrState()); }
      } else if (m?.type === 'error') {
        clearTimeout(timer);
        fail(`转写出错：${m.message}`);
      } else if (m?.type === 'warning') {
        console.warn('[asr]', m.message);
      } else if (m?.type === 'partial' || m?.type === 'final' || m?.type === 'done' || m?.type === 'fed') {
        sendEvent(m);
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (worker !== child) return;          // 是我们自己停掉的
      worker = null;
      session = 'idle';
      if (code !== 0) fail(`转写进程意外退出（${code}）`);
      else broadcast();
    });
    child.once('spawn', () => {
      child.postMessage({
        type: 'init',
        glueDir: glueDir(),
        model: modelPath(MODEL_FILES[0].file),
        tokens: modelPath(MODEL_FILES[1].file),
        vad: modelPath(MODEL_FILES[2].file),
        // 识别是突发的短计算，两个线程够了；给多了只会和编辑器、对话模型抢核
        threads: Math.max(1, Math.min(2, os.cpus().length - 2)),
        ...(opts.speakers && isSpeakerInstalled() ? { speakerModel: modelPath(SPEAKER_MODEL.file) } : {}),
        mode: opts.source === 'file' ? 'file' : 'mic',
      });
    });
  });
}

async function stopSession(): Promise<AsrState> {
  const child = worker;
  if (!child || session === 'idle') { session = 'idle'; return getAsrState(); }
  session = 'stopping';
  broadcast();
  // 让它把最后一句吐出来再走；等不到就直接杀
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 4000);
    const onMessage = (m: any) => { if (m?.type === 'done') { clearTimeout(timer); resolve(); } };
    child.on('message', onMessage);
    try { child.postMessage({ type: 'finish' }); } catch { clearTimeout(timer); resolve(); }
  });
  if (worker === child) killWorker();
  session = 'idle';
  broadcast();
  return getAsrState();
}

// ── 还没放进笔记的录音：先替用户留着 ─────────────────────────────────────────
// 转写的文字由渲染进程存在 localStorage 里，录音太大放不进去，每次停下来时写到这里。
// 不放在 asr/ 下面：那个目录「删除语音模型」时会整个清掉
const draftDir = () => path.join(app.getPath('userData'), 'transcribe-draft');
const draftAudioPath = () => path.join(draftDir(), 'recording.webm');

async function getDraftAudio(): Promise<{ path: string; bytes: number } | null> {
  try { const st = await fs.promises.stat(draftAudioPath()); return st.size > 0 ? { path: draftAudioPath(), bytes: st.size } : null; } catch { return null; }
}

// ── 正在转写时退出 / 关窗口：拦一下 ─────────────────────────────────────────────
// 停下来的转写（文字 + 录音）下次打开还在；只有「正在录的这一段」会丢：最后半句话，和这一段还没落盘的录音
let unsavedTranscript: { recording: boolean } | null = null;
let discardConfirmed = false;

/** 返回 true = 可以关（没有未保存的转写，或用户确认丢弃）。无人值守的冒烟测试里没人点按钮，直接放行 */
export function confirmDiscardTranscript(win: BrowserWindow | null): boolean {
  if (!unsavedTranscript || discardConfirmed || process.env.IML_SMOKE_OFFSCREEN === '1') return true;
  if (!win || win.isDestroyed()) return true;
  const choice = dialog.showMessageBoxSync(win, {
    type: 'warning',
    buttons: ['回去', '仍然退出'],
    defaultId: 0,
    cancelId: 0,
    message: '正在转写',
    detail: `现在退出，已经转写出来的文字下次打开还在${unsavedTranscript.recording ? '，但正在录的这一段录音会丢' : ''}。先点「停止」再退出就什么都不丢。`,
  });
  if (choice !== 1) return false;
  discardConfirmed = true;   // 退出流程里窗口关闭和 before-quit 会先后来问，只问一次
  return true;
}

/** 窗口真的关掉之后，内存里的转写已经不在了 */
export function forgetUnsavedTranscript() { unsavedTranscript = null; discardConfirmed = false; }

/** 应用退出时调用 */
export function stopAsr() {
  installController?.abort();
  speakerController?.abort();
  killWorker();
  session = 'idle';
}

export function setupAsr(d: Deps) {
  deps = d;
  scheduler.register({
    id: 'asr', label: '实时转写', note: '录音、转写文件时才起，一场结束就退出',
    running: () => !!worker,
    busy: () => session !== 'idle',
    pid: () => worker?.pid ?? null,
    estimateBytes: () => 700 * 1024 * 1024,
    stop: async () => { if (session !== 'idle') await stopSession(); killWorker(); },
  });
  ipcMain.handle('asr:getState', () => getAsrState());
  ipcMain.handle('asr:install', () => { void startInstall(); return true; });
  ipcMain.handle('asr:cancelInstall', () => { installController?.abort(); return true; });
  ipcMain.handle('asr:uninstall', async () => {
    await stopSession();
    await fs.promises.rm(rootDir(), { recursive: true, force: true });
    install = null;
    broadcast();
    return getAsrState();
  });
  // 配置页里「允许使用麦克风」：macOS 第一次会弹系统授权框；之前拒绝过的话系统不会再弹，只能去系统设置里改
  ipcMain.handle('asr:requestMicAccess', async () => {
    if (process.platform === 'darwin' && micAccess() === 'not-determined') await systemPreferences.askForMediaAccess('microphone');
    broadcast();
    return getAsrState();
  });
  ipcMain.handle('asr:openMicSettings', () => {
    if (process.platform === 'darwin') void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
    else if (process.platform === 'win32') void shell.openExternal('ms-settings:privacy-microphone');
    return true;
  });
  ipcMain.handle('asr:saveDraftAudio', async (_e, buffer: ArrayBuffer) => {
    await fs.promises.mkdir(draftDir(), { recursive: true });
    // 先写临时文件再改名：写到一半退出的话，上一次完整的那份还在
    const tmp = `${draftAudioPath()}.tmp`;
    await fs.promises.writeFile(tmp, Buffer.from(buffer));
    await fs.promises.rename(tmp, draftAudioPath());
    return getDraftAudio();
  });
  ipcMain.handle('asr:getDraftAudio', () => getDraftAudio());
  ipcMain.handle('asr:clearDraft', async () => { await fs.promises.rm(draftDir(), { recursive: true, force: true }); return true; });
  // 找回来的录音不在渲染进程的内存里，放进笔记时由这里直接拷过去
  ipcMain.handle('asr:copyDraftAudio', async (_e, noteDir: string, fileName: string) => {
    try {
      const safeName = path.basename(fileName).replace(/[\\/:*?"<>|#%()[\]\s]+/g, '-');
      if (!path.isAbsolute(noteDir) || !AUDIO_EXT_RE.test(safeName)) return { success: false, error: '录音的保存位置不对' };
      const assetsDir = path.join(path.normalize(noteDir), 'assets');
      await fs.promises.mkdir(assetsDir, { recursive: true });
      await fs.promises.copyFile(draftAudioPath(), path.join(assetsDir, safeName));
      return { success: true, path: `assets/${safeName}` };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  ipcMain.on('asr:unsaved', (_e, state: { recording: boolean } | null) => { unsavedTranscript = state; if (!state) discardConfirmed = false; });
  ipcMain.handle('asr:installSpeaker', () => { void startSpeakerInstall(); return true; });
  ipcMain.handle('asr:cancelSpeakerInstall', () => { speakerController?.abort(); return true; });
  ipcMain.handle('asr:uninstallSpeaker', async () => { await fs.promises.rm(modelPath(SPEAKER_MODEL.file), { force: true }); speakerInstall = null; broadcast(); return getAsrState(); });
  ipcMain.handle('asr:start', (_e, opts?: { speakers?: boolean; source?: 'mic' | 'file' }) => startSession(opts));
  ipcMain.handle('asr:stop', () => stopSession());
  // 音频块：每 100 ms 一块，用单向消息，不要回执
  ipcMain.on('asr:pcm', (_e, samples: Float32Array | ArrayBuffer) => {
    if (session !== 'recording' || !worker) return;
    try { worker.postMessage({ type: 'pcm', samples }); } catch { /* 进程正在退出 */ }
  });
}
