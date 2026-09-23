import { app, ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EMBED_CATALOG, DEFAULT_EMBED_MODEL, findEmbedSpec, type EmbedModelSpec } from './catalog';
import { chunkNote, normalize } from './chunk';
import { VectorStore, type SemanticHit } from './store';
import { rerankChunks, type ChunkCandidate } from './retrieve';
import { LlamaServer, httpJson } from '../localModel/server';
import { scheduler } from '../localModel/scheduler';
import { downloadFile, DownloadError, type DownloadProgress } from '../localModel/download';
import { resolveModelUrl } from '../localModel/catalog';
import { getRuntime, getDownloadSettings, localModelPaths, onRuntimeChanged, killStaleServerAt } from '../localModel';
import type { SearchIndex, IndexedNote } from '../searchIndex';

export type { SemanticHit };

export interface EmbedModelEntry extends EmbedModelSpec {
  downloaded: boolean;
  partialBytes: number;
  download: (Partial<DownloadProgress> & { active: boolean; error: string | null }) | null;
}

export interface SemanticState {
  enabled: boolean;
  modelId: string;
  models: EmbedModelEntry[];
  runtimeInstalled: boolean;
  /** stopped | starting | running | error */
  server: string;
  indexing: boolean;
  indexed: number;
  total: number;
  error: string | null;
}

interface Deps {
  getConfig: () => any;
  saveConfig: (config: any) => { success: boolean; error?: string };
  searchIndex: SearchIndex;
  /** 设置里的 AI 总开关：关掉后不建库、不查询，嵌入服务也不启动 */
  isAiEnabled: () => boolean;
}

const EMBED_PORT = 18180;
const SLOTS = 4;
const BATCH = 16;

let deps: Deps | null = null;
const server = new LlamaServer();
let store: VectorStore | null = null;
let storeKey = '';
let indexing = false;
let syncAgain = false;
let lastError: string | null = null;
let progress = { indexed: 0, total: 0 };
const downloads = new Map<string, { controller: AbortController; state: NonNullable<EmbedModelEntry['download']> }>();

const embedDir = () => path.join(localModelPaths.rootDir(), 'embedding');
const pidFile = () => path.join(localModelPaths.rootDir(), 'embed-server.pid');
const indexDir = () => path.join(app.getPath('userData'), 'semantic-index');
const specPath = (spec: EmbedModelSpec) => path.join(embedDir(), spec.file);
const fileSize = (p: string) => { try { return fs.statSync(p).size; } catch { return 0; } };

function readSemanticConfig(): { enabled: boolean; modelId: string } {
  const raw = deps?.getConfig()?.semantic || {};
  const modelId = typeof raw.modelId === 'string' && findEmbedSpec(raw.modelId) ? raw.modelId : DEFAULT_EMBED_MODEL;
  return { enabled: !!raw.enabled, modelId };
}

function saveSemanticConfig(patch: Partial<{ enabled: boolean; modelId: string }>) {
  if (!deps) return;
  const cfg = deps.getConfig() || {};
  deps.saveConfig({ ...cfg, semantic: { ...readSemanticConfig(), ...patch } });
}

const currentSpec = () => findEmbedSpec(readSemanticConfig().modelId)!;

export async function getSemanticState(): Promise<SemanticState> {
  const cfg = readSemanticConfig();
  const runtime = await getRuntime();
  return {
    enabled: cfg.enabled,
    modelId: cfg.modelId,
    models: EMBED_CATALOG.map((spec) => ({
      ...spec,
      downloaded: fs.existsSync(specPath(spec)),
      partialBytes: fileSize(`${specPath(spec)}.part`),
      download: downloads.get(spec.id)?.state ?? null,
    })),
    runtimeInstalled: runtime.installed,
    server: server.state.status,
    indexing,
    indexed: progress.indexed,
    total: progress.total,
    error: lastError,
  };
}

let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
function broadcast() {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(async () => {
    broadcastTimer = null;
    try {
      const state = await getSemanticState();
      for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('semantic:state', state);
    } catch (err) {
      console.warn('[semantic] broadcast failed:', err);
    }
  }, 120);
}
server.on('state', broadcast);

// ── 嵌入服务 ─────────────────────────────────────────────────────────────────

let startPromise: Promise<void> | null = null;

async function ensureServer(): Promise<{ port: number; alias: string }> {
  const spec = currentSpec();
  if (server.isRunning && server.state.modelId === spec.id && server.state.port) return { port: server.state.port, alias: server.state.alias || 'embedding' };
  if (!startPromise) {
    startPromise = (async () => {
      const runtime = await getRuntime(true);
      if (!runtime.installed || !runtime.path) throw new Error('需要先安装推理运行时（智能 → 写作助手 → 本机模型）');
      if (!fs.existsSync(specPath(spec))) throw new Error(`嵌入模型尚未下载：${spec.name}`);
      await scheduler.ensureCapacity('embed');
      await killStaleServerAt(pidFile());
      const state = await server.start({
        bin: runtime.path,
        modelPath: specPath(spec),
        alias: spec.id,
        port: EMBED_PORT,
        ctxSize: spec.maxTokens * SLOTS,
        threads: getDownloadSettings().threads,
        thinking: false,
        embedding: { slots: SLOTS },
        modelId: spec.id,
        modelName: spec.name,
      });
      if (state.pid) fs.writeFileSync(pidFile(), JSON.stringify({ pid: state.pid }), 'utf8');
    })().finally(() => { startPromise = null; });
  }
  await startPromise;
  if (!server.isRunning || !server.state.port) throw new Error(server.state.error || '嵌入服务未能启动');
  return { port: server.state.port, alias: server.state.alias || 'embedding' };
}

export async function stopSemanticServer() {
  await store?.save();
  await server.stop();
  fs.rmSync(pidFile(), { force: true });
}

export function isSemanticServerActive() {
  return server.state.status !== 'stopped';
}

async function requestEmbeddings(port: number, alias: string, inputs: string[]): Promise<Float32Array[]> {
  const { status, json } = await httpJson('POST', `http://127.0.0.1:${port}/v1/embeddings`, { model: alias, input: inputs }, 120000);
  if (status !== 200 || !Array.isArray(json?.data)) {
    const err: any = new Error(json?.error?.message || `HTTP ${status}`);
    err.tooLong = json?.error?.type === 'exceed_context_size_error';
    throw err;
  }
  return (json.data as any[])
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => normalize(Float32Array.from(d.embedding as number[])));
}

/** 一批文本 → 向量。某一条超长会让整批失败：退回逐条处理，超长的那条对半截断重试 */
async function embedTexts(inputs: string[]): Promise<Float32Array[]> {
  scheduler.beginWork('embed');
  try { return await embedTextsInner(inputs); } finally { scheduler.endWork('embed'); }
}

async function embedTextsInner(inputs: string[]): Promise<Float32Array[]> {
  const { port, alias } = await ensureServer();
  try {
    return await requestEmbeddings(port, alias, inputs);
  } catch (err: any) {
    if (!err?.tooLong) throw err;
  }
  const out: Float32Array[] = [];
  for (const input of inputs) {
    let text = input;
    for (;;) {
      try {
        out.push((await requestEmbeddings(port, alias, [text]))[0]);
        break;
      } catch (err: any) {
        if (!err?.tooLong || text.length < 40) throw err;
        text = text.slice(0, Math.floor(text.length / 2));
      }
    }
  }
  return out;
}

// ── 建库 / 增量更新 ──────────────────────────────────────────────────────────

const stampOf = (note: IndexedNote) => `${Math.round(note.mtime)}:${note.content.length}`;

async function openStore(root: string): Promise<VectorStore> {
  const spec = currentSpec();
  const key = `${root}::${spec.id}`;
  if (store && storeKey === key) return store;
  await store?.save();
  const file = path.join(indexDir(), `${crypto.createHash('sha1').update(root).digest('hex').slice(0, 16)}-${spec.id}.json`);
  store = new VectorStore(file, spec.id, spec.dims);
  storeKey = key;
  await store.load();
  return store;
}

/** 让向量库追上全文索引的现状：新增 / 改过的笔记重算，消失的移除。可重入：进行中再次调用会在结束后补跑一轮 */
export async function syncSemanticIndex(): Promise<void> {
  if (!deps) return;
  const cfg = readSemanticConfig();
  const root = deps.searchIndex.status().root;
  if (!cfg.enabled || !root || !deps.isAiEnabled()) return;
  if (indexing) { syncAgain = true; return; }
  if (deps.searchIndex.status().building) { setTimeout(() => void syncSemanticIndex(), 1500); return; }
  if (!fs.existsSync(specPath(currentSpec()))) { lastError = null; broadcast(); return; }

  indexing = true;
  lastError = null;
  try {
    const vs = await openStore(root);
    const notes = deps.searchIndex.allNotes();
    const alive = new Set(notes.map((n) => n.path));
    for (const key of [...vs.notes.keys()]) if (!alive.has(key)) vs.remove(key);

    const pending = notes.filter((n) => vs.notes.get(n.path)?.stamp !== stampOf(n));
    progress = { indexed: notes.length - pending.length, total: notes.length };
    broadcast();

    const spec = currentSpec();
    for (const note of pending) {
      if (!readSemanticConfig().enabled || readSemanticConfig().modelId !== spec.id) break;
      const chunks = chunkNote(note.title, note.content, spec.chunkChars);
      const vectors: Float32Array[] = [];
      for (let i = 0; i < chunks.length; i += BATCH) {
        vectors.push(...await embedTexts(chunks.slice(i, i + BATCH).map((c) => c.text)));
      }
      vs.upsert({ path: note.path, title: note.title, stamp: stampOf(note), chunks: chunks.map((c, i) => ({ preview: c.preview, vec: vectors[i] })) });
      progress.indexed++;
      vs.scheduleSave(5000);
      broadcast();
    }
    await vs.save();
  } catch (err: any) {
    lastError = err?.message || String(err);
    console.warn('[semantic] sync failed:', lastError);
  } finally {
    indexing = false;
    broadcast();
    if (syncAgain) { syncAgain = false; void syncSemanticIndex(); }
  }
}

async function semanticSearch(query: string, limit = 20): Promise<SemanticHit[]> {
  const q = query.trim();
  const root = deps?.searchIndex.status().root;
  if (!q || !root || !deps?.isAiEnabled() || !readSemanticConfig().enabled || !fs.existsSync(specPath(currentSpec()))) return [];
  const vs = await openStore(root);
  if (vs.notes.size === 0) return [];
  const [vec] = await embedTexts([`${currentSpec().queryPrefix}${q}`.slice(0, currentSpec().chunkChars)]);
  return vs.search(vec, limit);
}

/** 「问你的笔记」检索到的一块原文 */
export interface AskSource {
  path: string;
  title: string;
  /** 「笔记标题 › 小节标题」 */
  heading: string;
  /** 这一块的正文（去掉了 Markdown 标记） */
  text: string;
  score: number;
}

/**
 * 为一个问题找出最相关的几块原文。
 * 向量库里每块只存了 90 字的预览；全文在这里**现读现切**：全文索引里的内容总是最新的，库里也不用多存一份。
 * 笔记改过而向量还没来得及重算时，序号可能对不上 —— 先按序号取，预览对不上再按预览找，都找不到就放弃这一块。
 */
async function retrieveForQuestion(question: string, limit = 8): Promise<AskSource[]> {
  const q = question.trim();
  const root = deps?.searchIndex.status().root;
  if (!q || !root || !deps?.isAiEnabled() || !readSemanticConfig().enabled || !fs.existsSync(specPath(currentSpec()))) return [];
  const vs = await openStore(root);
  if (vs.notes.size === 0) return [];
  const spec = currentSpec();
  const [vec] = await embedTexts([`${spec.queryPrefix}${q}`.slice(0, spec.chunkChars)]);

  const chunkCache = new Map<string, ReturnType<typeof chunkNote>>();
  const candidates: ChunkCandidate[] = [];
  for (const hit of vs.searchChunks(vec)) {
    let chunks = chunkCache.get(hit.path);
    if (!chunks) {
      const note = deps.searchIndex.getNote(hit.path);
      if (!note) continue;
      chunks = chunkNote(note.title, note.content, spec.chunkChars);
      chunkCache.set(hit.path, chunks);
    }
    const chunk = chunks[hit.index]?.preview === hit.preview ? chunks[hit.index] : chunks.find((c) => c.preview === hit.preview);
    if (!chunk) continue;
    candidates.push({ path: hit.path, title: hit.title, index: hit.index, score: hit.score, text: chunk.text });
  }

  return rerankChunks(candidates, q, { limit }).map((c) => {
    const nl = c.text.indexOf('\n');
    return { path: c.path, title: c.title, heading: nl > 0 ? c.text.slice(0, nl) : c.title, text: nl > 0 ? c.text.slice(nl + 1) : c.text, score: c.final };
  });
}

async function relatedNotes(filePath: string, limit = 6): Promise<SemanticHit[]> {
  const root = deps?.searchIndex.status().root;
  if (!root || !deps?.isAiEnabled() || !readSemanticConfig().enabled) return [];
  const vs = await openStore(root);
  return vs.related(filePath, limit);
}

// ── 模型下载 ─────────────────────────────────────────────────────────────────

async function startDownload(id: string) {
  const spec = findEmbedSpec(id);
  if (!spec || downloads.has(id)) return;
  const controller = new AbortController();
  const entry = { controller, state: { active: true, error: null } as NonNullable<EmbedModelEntry['download']> };
  downloads.set(id, entry);
  broadcast();
  try {
    const { source, customBase } = getDownloadSettings();
    // 小文件偶尔会在镜像站上卡住不动：连接中断类的错误自动续传几次
    for (let attempt = 0; ; attempt++) {
      try {
        await downloadFile(resolveModelUrl(spec, source, customBase), specPath(spec), {
          expectedSize: spec.size,
          sha256: spec.sha256,
          checkGguf: true,
          signal: controller.signal,
          onProgress: (p) => { entry.state = { ...entry.state, ...p, active: true }; broadcast(); },
        });
        break;
      } catch (err) {
        if (!(err instanceof DownloadError) || err.code !== 'network' || attempt >= 4) throw err;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    downloads.delete(id);
    void syncSemanticIndex();
  } catch (err: any) {
    const aborted = err instanceof DownloadError && err.code === 'aborted';
    if (aborted) downloads.delete(id);
    else downloads.set(id, { controller, state: { active: false, error: err?.message || String(err) } });
  } finally {
    broadcast();
  }
}

export function setupSemantic(d: Deps) {
  scheduler.register({
    id: 'embed', label: '嵌入模型', note: '相关笔记和问笔记的检索用它',
    groupWith: 'chat',   // 和对话模型一套「文本能力」，一起起、一起停、一起让位
    running: () => server.state.status !== 'stopped',
    busy: () => server.state.status === 'starting',
    pid: () => server.state.pid,
    estimateBytes: () => { try { return Math.round(fs.statSync(specPath(currentSpec())).size * 1.2 + 200 * 1024 * 1024); } catch { return 0; } },
    memoKey: () => currentSpec().id,
    stop: () => stopSemanticServer(),
    start: async () => { await ensureServer(); },
    restorable: true,
  });
  deps = d;
  fs.mkdirSync(embedDir(), { recursive: true });
  // 上次崩溃 / 被强杀时留下的嵌入服务进程：启动时就清掉，不等到下次用到
  void killStaleServerAt(pidFile());

  ipcMain.handle('semantic:getState', () => getSemanticState());
  ipcMain.handle('semantic:setEnabled', async (_e, enabled: boolean) => {
    saveSemanticConfig({ enabled: !!enabled });
    if (enabled) void syncSemanticIndex();
    else await stopSemanticServer();
    broadcast();
    return getSemanticState();
  });
  ipcMain.handle('semantic:setModel', async (_e, modelId: string) => {
    if (!findEmbedSpec(modelId)) throw new Error('未知的嵌入模型');
    saveSemanticConfig({ modelId });
    await server.stop();
    progress = { indexed: 0, total: 0 };
    void syncSemanticIndex();
    broadcast();
    return getSemanticState();
  });
  ipcMain.handle('semantic:downloadModel', (_e, id: string) => { void startDownload(id); return true; });
  ipcMain.handle('semantic:cancelDownload', (_e, id: string) => {
    const dl = downloads.get(id);
    if (dl?.state.active) dl.controller.abort();
    else downloads.delete(id);
    broadcast();
    return true;
  });
  ipcMain.handle('semantic:deleteModel', async (_e, id: string) => {
    const spec = findEmbedSpec(id);
    if (!spec) return false;
    if (server.state.modelId === id) await server.stop();
    await fs.promises.rm(specPath(spec), { force: true }).catch(() => {});
    await fs.promises.rm(`${specPath(spec)}.part`, { force: true }).catch(() => {});
    broadcast();
    return true;
  });
  ipcMain.handle('semantic:rebuild', async () => {
    const root = deps?.searchIndex.status().root;
    if (root) {
      const vs = await openStore(root);
      vs.notes.clear();
      await vs.save();
    }
    void syncSemanticIndex();
    return true;
  });
  ipcMain.handle('semantic:search', (_e, query: string, limit?: number) => semanticSearch(String(query || ''), limit).catch((err) => { lastError = err?.message || String(err); broadcast(); return []; }));
  ipcMain.handle('semantic:related', (_e, filePath: string, limit?: number) => relatedNotes(String(filePath || ''), limit).catch(() => []));
  // 检索失败要让界面知道（嵌入服务起不来之类），不能悄悄当成「没找到」—— 那会让模型去编
  ipcMain.handle('semantic:retrieve', (_e, question: string, limit?: number) => retrieveForQuestion(String(question || ''), limit));

  // 运行时装好之后，之前因为缺运行时没跑起来的建库自动补上
  onRuntimeChanged(() => { void syncSemanticIndex(); });
}
