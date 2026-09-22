import { app, ipcMain, BrowserWindow, dialog, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { MODEL_CATALOG, findModelSpec, resolveModelUrl, type LocalModelSpec } from './catalog';
import { DEFAULT_LOCAL_CONFIG, normalizeLocalConfig, inferServiceType, type AIServiceType, type CustomModel, type LocalModelConfig } from './config';
import { getDeviceInfo, checkRequirement, type DeviceInfo, type RequirementCheck } from './hardware';
import { downloadFile, DownloadError, type DownloadProgress } from './download';
import { resolveRuntime, installRuntime, type InstallPhase, type RuntimeInfo } from './runtime';
import { LlamaServer, pingChat, type ServerState } from './server';
import { scheduler } from './scheduler';

export { DEFAULT_LOCAL_CONFIG, normalizeLocalConfig };
export type { AIServiceType, CustomModel, LocalModelConfig, DeviceInfo, RequirementCheck, RuntimeInfo, ServerState, InstallPhase };

export interface ModelDownloadState extends Partial<DownloadProgress> { active: boolean; error: string | null }

/** 推荐清单 + 用户导入的模型，附带下载状态与硬件匹配结果，直接给界面渲染 */
export interface LocalModelEntry {
  id: string;
  name: string;
  vendor: string;
  quant: string;
  size: number;
  minRamGB: number;
  minCores: number;
  maxContext: number;
  supportsThinking: boolean;
  recommended: boolean;
  description: string;
  custom: boolean;
  downloaded: boolean;
  path: string;
  /** 本地已下载的部分（断点续传） */
  partialBytes: number;
  download: ModelDownloadState | null;
  requirement: RequirementCheck;
}

export interface InstallState extends Omit<Partial<DownloadProgress>, 'phase'> { active: boolean; phase: InstallPhase | null; tag: string | null; error: string | null }

export interface LocalState {
  device: DeviceInfo;
  runtime: RuntimeInfo;
  install: InstallState;
  models: LocalModelEntry[];
  server: ServerState;
  config: LocalModelConfig;
  serviceType: AIServiceType;
  modelsDir: string;
}

interface Deps {
  getConfig: () => any;
  saveConfig: (config: any) => { success: boolean; error?: string };
}

let deps: Deps | null = null;
let device: DeviceInfo | null = null;
let runtimeCache: RuntimeInfo | null = null;
const server = new LlamaServer();
const downloads = new Map<string, { controller: AbortController; state: ModelDownloadState }>();
let install: InstallState = { active: false, phase: null, tag: null, error: null };
let installController: AbortController | null = null;

const rootDir = () => path.join(app.getPath('userData'), 'local-model');
const runtimeDir = () => path.join(rootDir(), 'runtime');
const modelsDir = () => path.join(rootDir(), 'models');
const pidFile = () => path.join(rootDir(), 'server.pid');
const specPath = (spec: LocalModelSpec) => path.join(modelsDir(), spec.file);

function requireDeps(): Deps {
  if (!deps) throw new Error('本机模型模块尚未初始化');
  return deps;
}

function readConfig() {
  return requireDeps().getConfig() || {};
}

function localConfig(): LocalModelConfig {
  return normalizeLocalConfig(readConfig().local);
}

function currentServiceType(): AIServiceType {
  return inferServiceType(readConfig());
}

export function isBuiltinService(config: any): boolean {
  return inferServiceType(config) === 'builtin';
}

function patchConfig(patch: Record<string, unknown>) {
  const cfg = readConfig();
  const result = requireDeps().saveConfig({ ...cfg, ...patch });
  if (!result.success) throw new Error(result.error || '保存配置失败');
}

function saveLocalConfig(patch: Partial<LocalModelConfig>) {
  patchConfig({ local: normalizeLocalConfig({ ...localConfig(), ...patch }) });
}

function fileSize(p: string): number {
  try { return fs.statSync(p).size; } catch { return 0; }
}

function customRequirement(size: number): Pick<LocalModelSpec, 'size' | 'minRamGB' | 'minCores'> {
  return { size, minRamGB: Math.max(4, Math.ceil((size / 1024 ** 3) * 1.5 + 2)), minCores: 2 };
}

/** 找到某个 id 对应的模型（推荐清单或用户导入） */
function resolveModel(id: string, cfg = localConfig()): { name: string; alias: string; path: string; maxContext: number; supportsThinking: boolean } | null {
  const spec = findModelSpec(id);
  if (spec) return { name: `${spec.name} · ${spec.quant}`, alias: spec.file.replace(/\.gguf$/i, ''), path: specPath(spec), maxContext: spec.maxContext, supportsThinking: spec.supportsThinking };
  const custom = cfg.customModels.find((m) => m.id === id);
  if (custom) return { name: custom.name, alias: custom.name.replace(/\s+/g, '-'), path: custom.path, maxContext: 131072, supportsThinking: true };
  return null;
}

function buildModelEntries(cfg: LocalModelConfig, dev: DeviceInfo): LocalModelEntry[] {
  const entries: LocalModelEntry[] = MODEL_CATALOG.map((spec) => {
    const p = specPath(spec);
    const dl = downloads.get(spec.id)?.state ?? null;
    return {
      id: spec.id, name: spec.name, vendor: spec.vendor, quant: spec.quant, size: spec.size,
      minRamGB: spec.minRamGB, minCores: spec.minCores, maxContext: spec.maxContext, supportsThinking: spec.supportsThinking,
      recommended: !!spec.recommended, description: spec.description, custom: false,
      downloaded: fs.existsSync(p), path: p, partialBytes: fileSize(`${p}.part`),
      download: dl, requirement: checkRequirement(dev, spec),
    };
  });
  for (const m of cfg.customModels) {
    const size = m.size || fileSize(m.path);
    entries.push({
      id: m.id, name: m.name, vendor: '本地文件', quant: '', size, minRamGB: customRequirement(size).minRamGB, minCores: 2,
      maxContext: 131072, supportsThinking: true, recommended: false, description: m.path, custom: true,
      downloaded: fs.existsSync(m.path), path: m.path, partialBytes: 0, download: null,
      requirement: checkRequirement(dev, customRequirement(size)),
    });
  }
  return entries;
}

/** 语义索引（嵌入模型）复用同一套运行时与下载设置 */
export const localModelPaths = { rootDir, modelsDir };
export function getDownloadSettings() {
  const cfg = localConfig();
  return { source: cfg.source, customBase: cfg.customBase, threads: cfg.threads };
}
export function onRuntimeChanged(listener: () => void) {
  runtimeListeners.add(listener);
  return () => runtimeListeners.delete(listener);
}
const runtimeListeners = new Set<() => void>();

export async function getRuntime(force = false): Promise<RuntimeInfo> {
  if (!runtimeCache || force) runtimeCache = await resolveRuntime(runtimeDir(), localConfig().runtimePath);
  return runtimeCache;
}

export async function getLocalState(): Promise<LocalState> {
  if (!device) device = await getDeviceInfo();
  const cfg = localConfig();
  return {
    device,
    runtime: await getRuntime(),
    install,
    models: buildModelEntries(cfg, device),
    server: server.state,
    config: cfg,
    serviceType: currentServiceType(),
    modelsDir: modelsDir(),
  };
}

// ── 状态广播：合并 80ms 内的多次变化，推给所有窗口 ──────────────────────────────
let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(async () => {
    broadcastTimer = null;
    try {
      const state = await getLocalState();
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send('local:state', state);
      }
    } catch (err) {
      console.warn('[local-model] broadcast failed:', err);
    }
  }, 80);
}

server.on('state', broadcast);
server.on('log', (line: string) => {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('local:log', line);
  }
});

// ── 运行时安装 ────────────────────────────────────────────────────────────────
async function startInstall() {
  if (install.active) return;
  const controller = new AbortController();
  installController = controller;
  install = { active: true, phase: 'resolving', tag: null, error: null };
  broadcast();
  try {
    runtimeCache = await installRuntime({
      rootDir: runtimeDir(),
      proxyPrefix: localConfig().proxyPrefix,
      signal: controller.signal,
      onProgress: (p) => {
        install = { ...install, active: true, phase: p.phase, tag: p.tag ?? install.tag, received: p.received, total: p.total, speed: p.speed };
        broadcast();
      },
    });
    // 安装成功后不再使用手动指定的路径
    if (localConfig().runtimePath) saveLocalConfig({ runtimePath: null });
    install = { active: false, phase: 'done', tag: runtimeCache.version, error: null };
    runtimeListeners.forEach((fn) => fn());
  } catch (err: any) {
    const aborted = err instanceof DownloadError && err.code === 'aborted';
    install = { active: false, phase: null, tag: install.tag, error: aborted ? null : (err?.message || String(err)) };
  } finally {
    installController = null;
    broadcast();
  }
}

// ── 模型下载 ──────────────────────────────────────────────────────────────────
async function startDownload(id: string) {
  const spec = findModelSpec(id);
  if (!spec) throw new Error('未知的模型');
  if (downloads.has(id)) return;
  const cfg = localConfig();
  const controller = new AbortController();
  const entry = { controller, state: { active: true, error: null } as ModelDownloadState };
  downloads.set(id, entry);
  broadcast();
  try {
    await downloadFile(resolveModelUrl(spec, cfg.source, cfg.customBase), specPath(spec), {
      expectedSize: spec.size,
      sha256: spec.sha256,
      checkGguf: true,
      signal: controller.signal,
      onProgress: (p) => { entry.state = { ...entry.state, ...p, active: true }; broadcast(); },
    });
    downloads.delete(id);
  } catch (err: any) {
    const aborted = err instanceof DownloadError && err.code === 'aborted';
    if (aborted) downloads.delete(id);
    else downloads.set(id, { controller, state: { active: false, error: err?.message || String(err) } });
  } finally {
    broadcast();
  }
}

function cancelDownload(id: string) {
  const d = downloads.get(id);
  if (!d) return;
  if (d.state.active) d.controller.abort();
  else downloads.delete(id);
  broadcast();
}

async function deleteModel(id: string) {
  cancelDownload(id);
  if (server.state.modelId === id && server.state.status !== 'stopped') await stopServer();
  const spec = findModelSpec(id);
  if (spec) {
    await fs.promises.rm(specPath(spec), { force: true }).catch(() => {});
    await fs.promises.rm(`${specPath(spec)}.part`, { force: true }).catch(() => {});
  } else {
    // 用户导入的文件只从列表移除，不动磁盘上的文件
    const cfg = localConfig();
    saveLocalConfig({ customModels: cfg.customModels.filter((m) => m.id !== id), modelId: cfg.modelId === id ? DEFAULT_LOCAL_CONFIG.modelId : cfg.modelId });
  }
  broadcast();
}

async function importModel(win: BrowserWindow | null): Promise<CustomModel | null> {
  const result = await dialog.showOpenDialog(win ?? undefined as any, {
    title: '选择 GGUF 模型文件',
    filters: [{ name: 'GGUF 模型', extensions: ['gguf'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const file = result.filePaths[0];
  const fd = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(4);
    await fd.read(buf, 0, 4, 0);
    if (buf.toString('ascii') !== 'GGUF') throw new Error('这不是 GGUF 文件');
  } finally {
    await fd.close();
  }
  const cfg = localConfig();
  const id = `custom:${crypto.createHash('sha1').update(file).digest('hex').slice(0, 10)}`;
  const model: CustomModel = { id, name: path.basename(file, path.extname(file)), path: file, size: fileSize(file) };
  const others = cfg.customModels.filter((m) => m.id !== id);
  saveLocalConfig({ customModels: [...others, model], modelId: id });
  broadcast();
  return model;
}

// ── 服务进程 ──────────────────────────────────────────────────────────────────
function exec(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => execFile(cmd, args, { timeout: 5000 }, (err, stdout) => resolve(err ? '' : String(stdout))));
}

/** 上次异常退出时残留的 llama-server：确认还是它本人再杀掉（对话服务与嵌入服务各有一个 pid 文件） */
export async function killStaleServerAt(file: string) {
  let rec: { pid: number } | null = null;
  try { rec = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
  if (!rec?.pid) return;
  try {
    process.kill(rec.pid, 0);
  } catch {
    fs.rmSync(file, { force: true });
    return;
  }
  const name = process.platform === 'win32'
    ? await exec('tasklist', ['/FI', `PID eq ${rec.pid}`, '/FO', 'CSV', '/NH'])
    : await exec('ps', ['-p', String(rec.pid), '-o', 'comm=']);
  if (/llama-server/i.test(name)) {
    try { process.kill(rec.pid, 'SIGKILL'); } catch { /* ignore */ }
  }
  fs.rmSync(file, { force: true });
}

const killStaleServer = () => killStaleServerAt(pidFile());

let startPromise: Promise<ServerState> | null = null;

export async function startServer(draft?: Partial<LocalModelConfig>): Promise<ServerState> {
  if (startPromise) return startPromise;
  startPromise = (async () => {
    if (draft) saveLocalConfig(draft);
    const cfg = localConfig();
    const runtime = await getRuntime(true);
    if (!runtime.installed || !runtime.path) throw new Error('请先安装推理运行时（llama-server）');
    const model = resolveModel(cfg.modelId, cfg);
    if (!model) throw new Error('请先选择一个模型');
    if (!fs.existsSync(model.path)) throw new Error(`模型尚未下载：${model.name}`);
    await scheduler.ensureCapacity('chat');
    await killStaleServer();
    fs.mkdirSync(rootDir(), { recursive: true });
    const state = await server.start({
      bin: runtime.path,
      modelPath: model.path,
      alias: model.alias,
      port: cfg.port,
      ctxSize: Math.min(cfg.ctxSize, model.maxContext),
      threads: cfg.threads,
      gpuLayers: cfg.gpuLayers,
      thinking: cfg.thinking && model.supportsThinking,
      temperature: cfg.temperature,
      extraArgs: cfg.extraArgs,
      modelId: cfg.modelId,
      modelName: model.name,
    });
    if (state.pid) fs.writeFileSync(pidFile(), JSON.stringify({ pid: state.pid, bin: runtime.path }), 'utf8');
    return state;
  })().finally(() => { startPromise = null; broadcast(); });
  return startPromise;
}

export async function stopServer() {
  await server.stop();
  fs.rmSync(pidFile(), { force: true });
  broadcast();
}

/** 给 ai:chat 用：确保本机服务在跑，返回 OpenAI 兼容端点与模型名 */
export async function ensureBuiltinEndpoint(): Promise<{ endpoint: string; model: string }> {
  if (!server.isRunning) {
    if (startPromise) await startPromise;
    else await startServer();
  }
  const { port, alias } = server.state;
  if (!server.isRunning || !port) throw new Error(server.state.error || '本机模型服务未运行');
  return { endpoint: `http://127.0.0.1:${port}/v1`, model: alias || 'local' };
}

/** 全新安装默认走本机模型，但模型还没下载：报错时指个路，而不是只说「模型尚未下载」 */
export function builtinNotReadyHint(): string | null {
  const cfg = localConfig();
  const model = resolveModel(cfg.modelId, cfg);
  if (model && fs.existsSync(model.path)) return null;
  return '还没有下载本机模型：打开「智能 → 写作助手」，下载一个推荐模型（约 1 GB），或改用本地 / 网络模型服务';
}

async function testConnection(draft?: Partial<LocalModelConfig>) {
  if (draft && !server.isRunning) saveLocalConfig(draft);
  const { endpoint, model } = await ensureBuiltinEndpoint();
  const { latencyMs, reply } = await pingChat(server.state.port!, model);
  return { ok: true, latencyMs, reply, endpoint, model };
}

// ── 注册 ─────────────────────────────────────────────────────────────────────
export function setupLocalModel(d: Deps) {
  deps = d;
  fs.mkdirSync(modelsDir(), { recursive: true });

  ipcMain.handle('local:getState', () => getLocalState());
  // 接进本机资源调度：空闲自动停、启动前算内存、和生图互斥
  scheduler.register({
    id: 'chat', label: '对话模型', note: '写作助手、整理纪要、问你的笔记都用它；停掉后下次用时自动重新加载，要等十几秒',
    running: () => server.state.status === 'running' || server.state.status === 'starting',
    busy: () => server.state.status === 'starting',
    pid: () => server.state.pid,
    estimateBytes: () => {
      const cfg = localConfig();
      const model = resolveModel(cfg.modelId, cfg);
      let size = 0;
      try { size = model ? fs.statSync(model.path).size : 0; } catch { size = 0; }
      // 模型文件 + 上下文的 KV 缓存（粗估每 token 48 KB，封顶 2 GB）
      return size ? Math.round(size * 1.1 + Math.min(2 * 1024 ** 3, Math.min(cfg.ctxSize, model?.maxContext || cfg.ctxSize) * 48 * 1024)) : 0;
    },
    stop: () => stopServer(),
    start: async () => { await startServer(); },
    restorable: true,   // 给生图让位之后自己回来，不用等下次提问才慢吞吞加载
  });
  ipcMain.handle('local:installRuntime', (_e, draft?: Partial<LocalModelConfig>) => {
    if (draft && typeof draft.proxyPrefix === 'string') saveLocalConfig({ proxyPrefix: draft.proxyPrefix });
    void startInstall();
    return true;
  });
  ipcMain.handle('local:cancelInstall', () => { installController?.abort(); return true; });
  ipcMain.handle('local:pickRuntime', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win ?? undefined as any, { title: '选择 llama-server 可执行文件', properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) return null;
    saveLocalConfig({ runtimePath: result.filePaths[0] });
    runtimeCache = null;
    broadcast();
    return result.filePaths[0];
  });
  ipcMain.handle('local:clearRuntimePath', () => { saveLocalConfig({ runtimePath: null }); runtimeCache = null; broadcast(); return true; });
  ipcMain.handle('local:downloadModel', (_e, id: string, draft?: Partial<LocalModelConfig>) => {
    // 表单里改了下载源不用先保存，直接按当前选择下载
    if (draft) saveLocalConfig({ ...(draft.source ? { source: draft.source } : {}), ...(typeof draft.customBase === 'string' ? { customBase: draft.customBase } : {}) });
    void startDownload(id);
    return true;
  });
  ipcMain.handle('local:cancelDownload', (_e, id: string) => { cancelDownload(id); return true; });
  ipcMain.handle('local:deleteModel', (_e, id: string) => deleteModel(id));
  ipcMain.handle('local:importModel', (event) => importModel(BrowserWindow.fromWebContents(event.sender)));
  ipcMain.handle('local:start', async (_e, draft?: Partial<LocalModelConfig>) => {
    const state = await startServer(draft);
    // 启动本机模型即视为切换到本机模型服务
    if (currentServiceType() !== 'builtin') patchConfig({ serviceType: 'builtin' });
    broadcast();
    return state;
  });
  ipcMain.handle('local:stop', () => stopServer());
  ipcMain.handle('local:switchBack', async (_e, target: AIServiceType) => {
    await stopServer();
    patchConfig({ serviceType: target === 'builtin' ? 'cloud' : target });
    broadcast();
    return true;
  });
  ipcMain.handle('local:getLogs', () => server.logs.slice());
  ipcMain.handle('local:test', (_e, draft?: Partial<LocalModelConfig>) => testConnection(draft));
  ipcMain.handle('local:openModelsFolder', () => { shell.openPath(modelsDir()); return true; });

  // 随客户端启动
  const cfg = readConfig();
  if (isBuiltinService(cfg) && normalizeLocalConfig(cfg.local).autoStart) {
    startServer().catch((err) => console.warn('[local-model] 自动启动失败:', err?.message || err));
  }

}

/** 退出时由 main 统一调用：带走子进程 */
export function isLocalServerActive() {
  return server.state.status !== 'stopped';
}
