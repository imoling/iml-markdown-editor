/**
 * 本机生图：下载运行时（stable-diffusion.cpp）和 Qwen-Image 2.1 的三个模型文件，托管 sd-server，给 ai:generateImage 出图。
 * 接进本机资源调度：出图前先 ensureCapacity('image')（24 GB 以下会先停对话与嵌入），出图算「正在忙」，空闲几分钟自动停。
 */
import { app, ipcMain, BrowserWindow } from 'electron';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { IMAGE_MODELS, SD_RUNTIME, runtimeAssetFor, sizeOf, stepsForModel, localImageEstimateBytes, imageModelOf, modelTotalBytes, DEFAULT_IMAGE_MODEL, type ImageFileSpec, type ImageModelSpec } from './catalog';
import { SdServer, type SdState } from './server';
import { downloadFile, DownloadError } from '../localModel/download';
import { resolveModelUrl } from '../localModel/catalog';
import { getDownloadSettings } from '../localModel/index';
import { extractArchive, applyProxy } from '../localModel/runtime';
import { findFreePort } from '../localModel/server';
import { scheduler } from '../localModel/scheduler';

export interface ImageModelView {
  id: string;
  name: string;
  vendor: string;
  quant: string;
  note: string;
  cfgScale: number;
  totalBytes: number;
  installedBytes: number;
  /** 三个文件都在 */
  downloaded: boolean;
  files: { key: string; label: string; size: number; downloaded: boolean; bytes: number }[];
}

export interface ImageGenState {
  /** 这个平台有没有运行时可下 */
  supported: boolean;
  runtime: { installed: boolean; version: string; path: string | null };
  /** 可选的模型（默认那个排前面） */
  models: ImageModelView[];
  /** 正在用哪个 */
  modelId: string;
  files: { key: string; label: string; size: number; downloaded: boolean; bytes: number }[];
  installedBytes: number;
  totalBytes: number;
  /** 运行时和当前模型的三个文件都齐了 */
  ready: boolean;
  install: { active: boolean; step: string; received: number; total: number; speed: number; error: string | null } | null;
  server: SdState;
  lastLog: string;
  /** 当前模型上一次真的画完用了多久：界面拿它估下一张要多久 */
  lastRun: { ms: number; pixels: number; steps: number } | null;
}

const PORT = 18280;
/** 32 GB 以上的机器不 offload：快约 15%，峰值 10 GB 它扛得住（实测见 server.ts 的参数注释） */
const ROOMY_MEMORY_BYTES = 32 * 1024 ** 3;

const rootDir = () => path.join(app.getPath('userData'), 'image-gen');
const pidFile = () => path.join(rootDir(), 'server.pid');
const modelsDir = (modelId: string) => path.join(rootDir(), 'models', modelId);
const runtimeDir = () => path.join(rootDir(), 'runtime', SD_RUNTIME.version);
const filePathOf = (model: ImageModelSpec, f: ImageFileSpec) => path.join(modelsDir(model.id), path.basename(f.file));

const server = new SdServer();
let install: ImageGenState['install'] = null;
let installController: AbortController | null = null;
let generating = 0;
let genController: AbortController | null = null;
const lastRunFile = () => path.join(rootDir(), 'last-run.json');
type LastRunMap = Record<string, { ms: number; pixels: number; steps: number }>;
let startPromise: Promise<void> | null = null;

/** 找解压出来的 sd-server（压缩包里可能套一层目录） */
export function findSdServer(dir: string, depth = 0): string | null {
  if (depth > 3 || !fs.existsSync(dir)) return null;
  const want = process.platform === 'win32' ? 'sd-server.exe' : 'sd-server';
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === want) return full;
    if (entry.isDirectory()) { const hit = findSdServer(full, depth + 1); if (hit) return hit; }
  }
  return null;
}

function fileBytes(model: ImageModelSpec, f: ImageFileSpec): number {
  try { return fs.statSync(filePathOf(model, f)).size; } catch { return 0; }
}
function fileDownloaded(model: ImageModelSpec, f: ImageFileSpec): boolean {
  return fileBytes(model, f) === f.size;
}
function installedBytesOf(model: ImageModelSpec): number {
  return model.files.reduce((sum, f) => sum + (fileDownloaded(model, f) ? fileBytes(model, f) : 0), 0);
}
function modelReady(model: ImageModelSpec): boolean { return model.files.every((f) => fileDownloaded(model, f)); }
function runtimeBin(): string | null { return findSdServer(runtimeDir()); }

/** 现在选的是哪个模型（设置里存的，坏值退回默认） */
let currentModelId = DEFAULT_IMAGE_MODEL;
export function setImageModel(id: string) {
  const next = imageModelOf(id).id;
  if (next === currentModelId) return;
  currentModelId = next;
  void stopImageServer();   // 换模型就得换服务
  broadcast();
}
const currentModel = () => imageModelOf(currentModelId);
export function isReady(): boolean { return !!runtimeBin() && modelReady(currentModel()); }

const viewOf = (m: ImageModelSpec): ImageModelView => ({
  id: m.id, name: m.name, vendor: m.vendor, quant: m.quant, note: m.note, cfgScale: m.cfgScale,
  totalBytes: modelTotalBytes(m), installedBytes: installedBytesOf(m), downloaded: modelReady(m),
  files: m.files.map((f) => ({ key: f.key, label: f.label, size: f.size, downloaded: fileDownloaded(m, f), bytes: fileBytes(m, f) })),
});

export function getImageGenState(): ImageGenState {
  const bin = runtimeBin();
  const model = currentModel();
  return {
    supported: !!runtimeAssetFor(process.platform, process.arch),
    runtime: { installed: !!bin, version: SD_RUNTIME.version, path: bin },
    models: IMAGE_MODELS.map(viewOf),
    modelId: model.id,
    files: viewOf(model).files,
    installedBytes: installedBytesOf(model),
    totalBytes: modelTotalBytes(model),
    ready: isReady(),
    install,
    server: server.state,
    lastLog: server.lastLog(6),
    lastRun: readLastRun(),
  };
}

function readAllRuns(): LastRunMap {
  try { return JSON.parse(fs.readFileSync(lastRunFile(), 'utf8')) || {}; } catch { return {}; }
}
function readLastRun(): ImageGenState['lastRun'] {
  const run = readAllRuns()[currentModelId];
  return run && run.ms > 0 && run.pixels > 0 && run.steps > 0 ? run : null;
}
function saveLastRun(run: NonNullable<ImageGenState['lastRun']>) {
  try { fs.mkdirSync(rootDir(), { recursive: true }); fs.writeFileSync(lastRunFile(), JSON.stringify({ ...readAllRuns(), [currentModelId]: run }), 'utf8'); } catch { /* 记不住就算了 */ }
}

let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const state = getImageGenState();
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('image:state', state);
  }, 120);
}
server.on('state', broadcast);
server.on('log', broadcast);

const exec = (cmd: string, args: string[]) => new Promise<void>((resolve) => execFile(cmd, args, { timeout: 60000 }, () => resolve()));
const execOut = (cmd: string, args: string[]) => new Promise<string>((resolve) => execFile(cmd, args, { timeout: 5000 }, (err, stdout) => resolve(err ? '' : String(stdout))));

/**
 * 上次没正常退出时留下的 sd-server（应用崩了、被系统按内存杀了）：它会一直占着几个 GB 和 GPU。
 * 按 pid 文件找回来，确认进程名真是它，再杀掉
 */
export async function killStaleServer(): Promise<void> {
  let rec: { pid?: number } | null = null;
  try { rec = JSON.parse(fs.readFileSync(pidFile(), 'utf8')); } catch { return; }
  const pid = rec?.pid;
  if (!pid) { fs.rmSync(pidFile(), { force: true }); return; }
  try { process.kill(pid, 0); } catch { fs.rmSync(pidFile(), { force: true }); return; }
  const name = process.platform === 'win32'
    ? await execOut('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'])
    : await execOut('ps', ['-p', String(pid), '-o', 'comm=']);
  if (/sd-server/i.test(name)) { try { process.kill(pid, 'SIGKILL'); } catch { /* 已经走了 */ } }
  fs.rmSync(pidFile(), { force: true });
}

/** 下载下来的二进制在 Apple 芯片上得有签名才让跑：ad-hoc 签一下，顺手去掉隔离标记 */
async function prepareBinaries(dir: string) {
  if (process.platform === 'win32') return;
  const entries: string[] = [];
  const walk = (d: string, depth: number) => { if (depth > 3) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const full = path.join(d, e.name); if (e.isDirectory()) walk(full, depth + 1); else if (/^(sd-server|sd-cli)$|\.(dylib|so)$/.test(e.name)) entries.push(full); } };
  walk(dir, 0);
  for (const f of entries) {
    try { fs.chmodSync(f, 0o755); } catch { /* 权限就这样 */ }
    if (process.platform === 'darwin') { await exec('xattr', ['-d', 'com.apple.quarantine', f]); await exec('codesign', ['--force', '--sign', '-', f]); }
  }
}

/** 下载运行时 + 三个模型文件，一个接一个；能续传，哪一步坏了下次从那一步继续 */
export async function startInstall(): Promise<void> {
  if (install?.active) return;
  const asset = runtimeAssetFor(process.platform, process.arch);
  if (!asset) throw new Error('这个平台暂时没有本机生图的运行时');
  const controller = new AbortController();
  installController = controller;
  const { source, customBase } = getDownloadSettings();
  const proxyPrefix = '';
  const model = currentModel();
  const total = modelTotalBytes(model);
  let done = 0;
  const progress = (step: string, received: number, speed: number) => { install = { active: true, step, received: done + received, total, speed, error: null }; broadcast(); };
  install = { active: true, step: '准备', received: 0, total, speed: 0, error: null };
  broadcast();
  try {
    if (!runtimeBin()) {
      fs.mkdirSync(runtimeDir(), { recursive: true });
      const zip = path.join(rootDir(), 'runtime', `${SD_RUNTIME.version}.zip`);
      progress('下载运行时（stable-diffusion.cpp）', 0, 0);
      await downloadFile(applyProxy(`${SD_RUNTIME.base}${asset}`, proxyPrefix), zip, { signal: controller.signal, onProgress: (p) => progress('下载运行时（stable-diffusion.cpp）', 0, p.speed) });
      progress('解压运行时', 0, 0);
      await extractArchive(zip, runtimeDir());
      await prepareBinaries(runtimeDir());
      fs.rmSync(zip, { force: true });
      if (!runtimeBin()) throw new Error('运行时压缩包里没有 sd-server');
    }
    for (const f of model.files) {
      if (fileDownloaded(model, f)) { done += fileBytes(model, f); continue; }
      const label = `下载${f.label}`;
      progress(label, 0, 0);
      await downloadFile(resolveModelUrl({ repo: f.repo, file: f.file }, source, customBase), filePathOf(model, f), {
        signal: controller.signal, expectedSize: f.size, sha256: f.sha256, checkGguf: f.gguf,
        onProgress: (p) => progress(label, p.received, p.speed),
      });
      done += fileBytes(model, f);
    }
    install = null;
  } catch (err: any) {
    const aborted = err instanceof DownloadError && err.code === 'aborted';
    install = aborted ? null : { active: false, step: install?.step || '', received: install?.received || 0, total, speed: 0, error: err?.message || String(err) };
  } finally {
    installController = null;
    broadcast();
  }
}

export function cancelInstall() { installController?.abort(); }

/** 删掉当前模型的三个文件（运行时留着，别的模型也要用） */
export async function deleteAll() {
  await stopImageServer();
  fs.rmSync(modelsDir(currentModelId), { recursive: true, force: true });
  install = null;
  broadcast();
}

/** 让 sd-server 跑起来（步数逐次随请求带，不用重启） */
async function ensureServer(steps: number): Promise<void> {
  if (server.isRunning) return;
  if (startPromise) { await startPromise; if (server.isRunning) return; }
  startPromise = (async () => {
    const bin = runtimeBin();
    const model = currentModel();
    if (!bin || !isReady()) throw new Error(`本机生图还没准备好：到「智能 → AI 配图」里下载 ${model.name}（约 ${(modelTotalBytes(model) / 1024 ** 3).toFixed(1)} GB）`);
    if (server.isRunning) await server.stop();
    await killStaleServer();
    const files = Object.fromEntries(model.files.map((f) => [f.key, filePathOf(model, f)]));
    await server.start({ bin, diffusion: files.diffusion, textEncoder: files.textEncoder, vae: files.vae, port: await findFreePort(PORT), steps, cfgScale: model.cfgScale, threads: getDownloadSettings().threads, offloadToCpu: os.totalmem() < ROOMY_MEMORY_BYTES });
    if (server.state.pid) { try { fs.mkdirSync(rootDir(), { recursive: true }); fs.writeFileSync(pidFile(), JSON.stringify({ pid: server.state.pid }), 'utf8'); } catch { /* 记不住下次就靠端口占用发现 */ } }
  })().finally(() => { startPromise = null; broadcast(); });
  await startPromise;
}

export async function stopImageServer() { await server.stop(); fs.rmSync(pidFile(), { force: true }); }

/** ai:generateImage 的本机分支 */
export async function generateLocalImage(prompt: string, cfg: { localSize?: string; localSteps?: string; localModel?: string }): Promise<string[]> {
  if (cfg.localModel) setImageModel(cfg.localModel);
  const model = currentModel();
  if (!isReady()) throw new Error(`本机生图还没准备好：到「智能 → AI 配图」里下载 ${model.name}`);
  const steps = stepsForModel(model, cfg.localSteps).steps;
  const size = sizeOf(cfg.localSize);
  await scheduler.ensureCapacity('image');
  scheduler.beginWork('image');
  genController?.abort();          // 上一张还在画就先停掉：一次只画一张
  const controller = new AbortController();
  genController = controller;
  try {
    await ensureServer(steps);
    const startedAt = Date.now();
    const images = await server.generate(prompt, size.width, size.height, steps, { signal: controller.signal });
    saveLastRun({ ms: Date.now() - startedAt, pixels: size.width * size.height, steps });
    return images;
  } finally {
    if (genController === controller) genController = null;
    scheduler.endWork('image');
    broadcast();
  }
}

/** 正在画的那张不要了（用户点了停止、关掉了对话框） */
export function cancelGeneration() { genController?.abort(); genController = null; }

export function setupImageGen() {
  void killStaleServer();   // 上次崩溃留下的孤儿，启动时收拾掉
  scheduler.register({
    id: 'image', label: '本机生图', note: '出图时才需要；一张 768 的图在 M 系列上要一两分钟',
    running: () => server.state.status === 'running' || server.state.status === 'starting',
    busy: () => generating > 0 || server.state.status === 'starting',
    pid: () => server.state.pid,
    estimateBytes: () => localImageEstimateBytes(currentModel(), modelReady(currentModel())),
    stop: () => server.stop(),
    start: async () => { const m = currentModel(); await ensureServer(stepsForModel(m, m.defaultStepsId).steps); },
  });
  ipcMain.handle('image:getState', () => getImageGenState());
  ipcMain.handle('image:setModel', (_e, id: string) => { setImageModel(String(id || '')); return getImageGenState(); });
  ipcMain.handle('image:install', () => { void startInstall(); return true; });
  ipcMain.handle('image:cancelInstall', () => { cancelInstall(); return true; });
  ipcMain.handle('image:delete', async () => { await deleteAll(); return getImageGenState(); });
  ipcMain.handle('image:start', async () => { await scheduler.start('image'); return getImageGenState(); });
  ipcMain.handle('image:stop', async () => { await scheduler.stop('image'); return getImageGenState(); });
  ipcMain.handle('image:cancelGeneration', () => { cancelGeneration(); return true; });
}

// 出图计数：调度器靠它判断「正在忙」
const origGenerate = server.generate.bind(server);
server.generate = async (...args: Parameters<SdServer['generate']>) => { generating++; try { return await origGenerate(...args); } finally { generating--; } };
