import { app, ipcMain, shell, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { checkTarget, measureTrees, MoveError, rebasePath, transfer } from './move';

/**
 * 模型存放位置。对话 / 嵌入 / 转写 / 生图的模型和运行组件默认都在应用数据目录里，加起来十几 GB；
 * 系统盘小的、想让它们跟着软件放在另一块盘上的，可以换一个目录（设置里的 modelStoragePath，空 = 默认）。
 * 换的时候把已下载的搬过去，见 move.ts。
 */
export const STORAGE_DIRS = ['local-model', 'asr', 'image-gen'] as const;
export type StorageDir = typeof STORAGE_DIRS[number];

export interface StorageState {
  path: string;
  defaultPath: string;
  isDefault: boolean;
  /** 这个位置现在在不在（移动硬盘没接上就不在）：不在的话模型都用不了 */
  available: boolean;
  usedBytes: number;
  moving: { movedBytes: number; totalBytes: number } | null;
}

interface Deps {
  saveSetting: (modelStoragePath: string) => { success: boolean; error?: string };
  /** 有什么正在进行、现在不能搬（给人看的原因，比如「对话模型正在下载」） */
  busyReason: () => string | null;
  /** 把在跑的本机模型停掉；返回的函数在搬完之后调，把原来开着的重新启动 */
  stopServices: () => Promise<() => Promise<void>>;
  /** 搬完了：各模块重新看一眼磁盘，把状态推给界面 */
  refresh: () => void;
}

let customRoot: string | null = null;
let deps: Deps | null = null;
let moving: StorageState['moving'] = null;

export const defaultStorageRoot = () => app.getPath('userData');
export const modelStorageRoot = () => customRoot || defaultStorageRoot();
export const storageDir = (name: StorageDir) => path.join(modelStorageRoot(), name);

/** 启动时最先调（在各个模型模块之前）：它们的目录都从这里算 */
export function initModelStorage(custom: unknown) {
  const p = typeof custom === 'string' && custom.trim() ? path.resolve(custom.trim()) : null;
  customRoot = p && p !== path.resolve(defaultStorageRoot()) ? p : null;
}

const GB = 1024 ** 3;
const formatSize = (bytes: number) => (bytes >= GB ? `${(bytes / GB).toFixed(bytes >= 10 * GB ? 0 : 1)} GB` : `${Math.max(1, Math.ceil(bytes / 1024 ** 2))} MB`);

export async function getStorageState(): Promise<StorageState> {
  const root = modelStorageRoot();
  return {
    path: root,
    defaultPath: defaultStorageRoot(),
    isDefault: !customRoot,
    available: fs.existsSync(root),
    usedBytes: (await measureTrees(root, STORAGE_DIRS)).bytes,
    moving,
  };
}

let lastSent = 0;
async function broadcast(force = false) {
  // 搬的时候进度来得很密，界面每秒看几次就够了
  if (!force && Date.now() - lastSent < 250) return;
  lastSent = Date.now();
  const state = moving ? { ...(await getStateCheap()), moving } : await getStorageState();
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('storage:state', state);
}

/** 搬的过程中不去量目录（文件正在变，量了也不准，还慢） */
let cheap: StorageState | null = null;
async function getStateCheap(): Promise<StorageState> {
  if (!cheap) cheap = await getStorageState();
  return cheap;
}

/** 运行组件的登记里记着可执行文件的完整路径：搬了家要跟着改，不然会被当成没装 */
function fixRuntimeRecord(from: string, to: string) {
  const file = path.join(to, 'local-model', 'runtime', 'current.json');
  try {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof rec?.bin !== 'string') return;
    const bin = rebasePath(rec.bin, from, to);
    if (bin !== rec.bin) fs.writeFileSync(file, JSON.stringify({ ...rec, bin }, null, 2), 'utf8');
  } catch { /* 没装过运行组件 */ }
}

/** 换位置：target 为空 = 回到默认位置 */
export async function changeStorage(target: string | null): Promise<{ ok: boolean; error?: string; state: StorageState }> {
  const fail = async (error: string) => ({ ok: false, error, state: await getStorageState() });
  if (!deps) return fail('还没准备好，稍后再试');
  if (moving) return fail('正在搬，等它完成');
  const from = modelStorageRoot();
  const to = target && target.trim() ? path.resolve(target.trim()) : path.resolve(defaultStorageRoot());
  const reason = deps.busyReason();
  if (reason) return fail(`${reason}，等它完成再换位置`);
  try {
    await checkTarget(from, to, STORAGE_DIRS);
  } catch (err: any) {
    return fail(err?.message || String(err));
  }

  cheap = await getStorageState();
  moving = { movedBytes: 0, totalBytes: cheap.usedBytes };
  await broadcast(true);
  let resume: (() => Promise<void>) | null = null;
  let error: string | undefined;
  try {
    resume = await deps.stopServices();
    const handle = await transfer(from, to, STORAGE_DIRS, { onProgress: (p) => { moving = p; void broadcast(); } });
    const saved = deps.saveSetting(to === path.resolve(defaultStorageRoot()) ? '' : to);
    if (!saved.success) {
      await handle.rollback();
      throw new Error(saved.error || '设置没存上');
    }
    initModelStorage(to);
    fixRuntimeRecord(from, to);
    await handle.commit();
  } catch (err: any) {
    error = err instanceof MoveError && err.code === 'space' && err.shortBytes > 0 ? `新位置的空间不够，还差 ${formatSize(err.shortBytes)}` : (err?.message || String(err));
    console.warn('[storage] move failed:', err);
  } finally {
    moving = null;
    cheap = null;
    deps.refresh();
    await broadcast(true);
    // 原来开着的重新启动；起不来也不算这次更改失败（下次用的时候还会再起）
    if (resume) void resume().catch((err) => console.warn('[storage] restart failed:', err?.message || err));
  }
  return { ok: !error, error, state: await getStorageState() };
}

export function setupModelStorage(d: Deps) {
  deps = d;
  ipcMain.handle('storage:getState', () => getStorageState());
  ipcMain.handle('storage:change', (_e, target: string | null) => changeStorage(typeof target === 'string' ? target : null));
  ipcMain.handle('storage:reveal', async () => { const root = modelStorageRoot(); if (!fs.existsSync(root)) return false; return (await shell.openPath(root)) === ''; });
}
