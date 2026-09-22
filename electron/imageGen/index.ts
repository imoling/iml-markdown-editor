/**
 * 本机生图：下载运行时（stable-diffusion.cpp）和 Qwen-Image 2.1 的三个模型文件，托管 sd-server，给 ai:generateImage 出图。
 * 接进本机资源调度：出图前先 ensureCapacity('image')（24 GB 以下会先停对话与嵌入），出图算「正在忙」，空闲几分钟自动停。
 */
import { app, ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { IMAGE_MODEL, SD_RUNTIME, runtimeAssetFor, sizeOf, stepsOf, localImageEstimateBytes, IMAGE_MODEL_TOTAL_BYTES, TEXT_ENCODER_APPROX, type ImageFileSpec } from './catalog';
import { SdServer, type SdState } from './server';
import { downloadFile, DownloadError } from '../localModel/download';
import { resolveModelUrl } from '../localModel/catalog';
import { getDownloadSettings } from '../localModel/index';
import { extractArchive, applyProxy } from '../localModel/runtime';
import { findFreePort } from '../localModel/server';
import { scheduler } from '../localModel/scheduler';

export interface ImageGenState {
  /** 这个平台有没有运行时可下 */
  supported: boolean;
  runtime: { installed: boolean; version: string; path: string | null };
  files: { key: string; label: string; size: number; downloaded: boolean; bytes: number }[];
  installedBytes: number;
  totalBytes: number;
  /** 运行时和三个文件都齐了 */
  ready: boolean;
  install: { active: boolean; step: string; received: number; total: number; speed: number; error: string | null } | null;
  server: SdState;
  lastLog: string;
}

const CFG_SCALE = 6.0;
const PORT = 18280;

const rootDir = () => path.join(app.getPath('userData'), 'image-gen');
const modelsDir = () => path.join(rootDir(), 'models');
const runtimeDir = () => path.join(rootDir(), 'runtime', SD_RUNTIME.version);
const filePathOf = (f: ImageFileSpec) => path.join(modelsDir(), path.basename(f.file));

const server = new SdServer();
let install: ImageGenState['install'] = null;
let installController: AbortController | null = null;
let generating = 0;
let serverSteps = 0;
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

function fileBytes(f: ImageFileSpec): number {
  try { return fs.statSync(filePathOf(f)).size; } catch { return 0; }
}
function fileDownloaded(f: ImageFileSpec): boolean {
  const bytes = fileBytes(f);
  return bytes > 0 && (f.size ? bytes === f.size : bytes > TEXT_ENCODER_APPROX * 0.9);
}
function installedBytes(): number { return IMAGE_MODEL.files.reduce((sum, f) => sum + (fileDownloaded(f) ? fileBytes(f) : 0), 0); }
function runtimeBin(): string | null { return findSdServer(runtimeDir()); }
export function isReady(): boolean { return !!runtimeBin() && IMAGE_MODEL.files.every(fileDownloaded); }

export function getImageGenState(): ImageGenState {
  const bin = runtimeBin();
  return {
    supported: !!runtimeAssetFor(process.platform, process.arch),
    runtime: { installed: !!bin, version: SD_RUNTIME.version, path: bin },
    files: IMAGE_MODEL.files.map((f) => ({ key: f.key, label: f.label, size: f.size || TEXT_ENCODER_APPROX, downloaded: fileDownloaded(f), bytes: fileBytes(f) })),
    installedBytes: installedBytes(),
    totalBytes: IMAGE_MODEL_TOTAL_BYTES,
    ready: isReady(),
    install,
    server: server.state,
    lastLog: server.lastLog(6),
  };
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
  const total = IMAGE_MODEL_TOTAL_BYTES;
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
    for (const f of IMAGE_MODEL.files) {
      if (fileDownloaded(f)) { done += fileBytes(f); continue; }
      const label = `下载${f.label}`;
      progress(label, 0, 0);
      await downloadFile(resolveModelUrl({ repo: f.repo, file: f.file }, source, customBase), filePathOf(f), {
        signal: controller.signal, expectedSize: f.size || undefined, sha256: f.sha256, checkGguf: f.gguf,
        onProgress: (p) => progress(label, p.received, p.speed),
      });
      done += fileBytes(f);
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

export async function deleteAll() {
  await stopImageServer();
  fs.rmSync(rootDir(), { recursive: true, force: true });
  install = null;
  broadcast();
}

/** 让 sd-server 跑起来（步数不同就重启一次：步数是启动参数） */
async function ensureServer(steps: number): Promise<void> {
  if (server.isRunning && serverSteps === steps) return;
  if (startPromise) { await startPromise; if (server.isRunning && serverSteps === steps) return; }
  startPromise = (async () => {
    const bin = runtimeBin();
    if (!bin || !isReady()) throw new Error('本机生图还没准备好：到「智能 → AI 配图」里下载模型（约 10 GB）');
    if (server.isRunning) await server.stop();
    const files = Object.fromEntries(IMAGE_MODEL.files.map((f) => [f.key, filePathOf(f)]));
    await server.start({ bin, diffusion: files.diffusion, textEncoder: files.textEncoder, vae: files.vae, port: await findFreePort(PORT), steps, cfgScale: CFG_SCALE, threads: getDownloadSettings().threads });
    serverSteps = steps;
  })().finally(() => { startPromise = null; broadcast(); });
  await startPromise;
}

export async function stopImageServer() { await server.stop(); }

/** ai:generateImage 的本机分支 */
export async function generateLocalImage(prompt: string, cfg: { localSize?: string; localSteps?: string }): Promise<string[]> {
  if (!isReady()) throw new Error('本机生图还没准备好：到「智能 → AI 配图」里下载模型（约 10 GB）');
  const steps = stepsOf(cfg.localSteps).steps;
  const size = sizeOf(cfg.localSize);
  await scheduler.ensureCapacity('image');
  scheduler.beginWork('image');
  try {
    await ensureServer(steps);
    return await server.generate(prompt, size.width, size.height);
  } finally {
    scheduler.endWork('image');
    broadcast();
  }
}

export function setupImageGen() {
  scheduler.register({
    id: 'image', label: '本机生图', note: '出图时才需要；一张 768 的图在 M 系列上要一两分钟',
    running: () => server.state.status === 'running' || server.state.status === 'starting',
    busy: () => generating > 0 || server.state.status === 'starting',
    pid: () => server.state.pid,
    estimateBytes: () => localImageEstimateBytes(installedBytes()),
    stop: () => server.stop(),
    start: async () => { await ensureServer(stepsOf(undefined).steps); },
  });
  ipcMain.handle('image:getState', () => getImageGenState());
  ipcMain.handle('image:install', () => { void startInstall(); return true; });
  ipcMain.handle('image:cancelInstall', () => { cancelInstall(); return true; });
  ipcMain.handle('image:delete', async () => { await deleteAll(); return getImageGenState(); });
  ipcMain.handle('image:start', async () => { await scheduler.start('image'); return getImageGenState(); });
  ipcMain.handle('image:stop', async () => { await scheduler.stop('image'); return getImageGenState(); });
}

// 出图计数：调度器靠它判断「正在忙」
const origGenerate = server.generate.bind(server);
server.generate = async (...args: Parameters<SdServer['generate']>) => { generating++; try { return await origGenerate(...args); } finally { generating--; } };
