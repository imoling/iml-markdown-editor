import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { findDataUrlRanges } from './shared/dataUrl';

/**
 * 笔记的本地版本历史。
 * 快照放在应用数据目录（不放进笔记库）：不污染 Obsidian 库 / Git 仓库，也不跟着同步盘到处传；
 * 同步盘出冲突、外部工具改坏文件时，这里还留着一份能回滚的。
 */
export type HistoryReason = 'save' | 'before-save' | 'restore';

export interface HistoryEntry {
  id: string;
  /** 这份内容的时间：保存时刻；「覆盖前留底」的版本用文件原来的修改时间 */
  time: number;
  /** 快照是什么时候存下的。保留策略按它算 —— 否则一年前的旧笔记刚留完底就会因为「太老」被清掉 */
  recordedAt?: number;
  size: number;
  hash: string;
  reason: HistoryReason;
  /** 这个版本里写进笔记的图片：at 是它在快照正文里的位置。图片另外存，见 pack */
  blobs?: { at: number; hash: string }[];
}

interface HistoryIndex {
  path: string;
  entries: HistoryEntry[];
}

const NOTE_RE = /\.(md|markdown|mdown|mkd|txt)$/i;
const MAX_SIZE = 2 * 1024 * 1024;
/** 图片写进了笔记里的，整篇可以很大：图片另外存，正文按上面那条量 */
const MAX_RAW_SIZE = 64 * 1024 * 1024;
const BLOB_DIR = 'blobs';
/** 连续保存（自动保存很密）合并成一个版本的时间窗 */
export const COALESCE_MS = 5 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 60;
const MAX_ENTRIES = 120;

const sha = (s: string) => crypto.createHash('sha1').update(s).digest('hex');

/**
 * 写进笔记里的图片（一长串 base64）从正文里拿出来另外存，同一张只存一份：
 * 带图的笔记一篇几 MB，每个版本都整篇存的话，改一个字就多占几 MB。
 */
function pack(content: string): { text: string; blobs: { at: number; hash: string; data: string }[] } {
  const blobs: { at: number; hash: string; data: string }[] = [];
  let text = '';
  let last = 0;
  for (const r of findDataUrlRanges(content)) {
    text += content.slice(last, r.from);
    const data = content.slice(r.from, r.to);
    blobs.push({ at: text.length, hash: sha(data), data });
    last = r.to;
  }
  return { text: text + content.slice(last), blobs };
}

/** 保留策略：24 小时内全留；更早的每天留最后一个；超过 60 天或总数超限的丢掉。entries 按时间升序 */
export function pruneEntries(entries: HistoryEntry[], now: number): { keep: HistoryEntry[]; drop: HistoryEntry[] } {
  const keep: HistoryEntry[] = [];
  const drop: HistoryEntry[] = [];
  const dayKept = new Set<string>();
  const stamp = (e: HistoryEntry) => e.recordedAt ?? e.time;
  for (const e of [...entries].sort((a, b) => stamp(b) - stamp(a))) {
    const age = now - stamp(e);
    if (age <= DAY) { keep.push(e); continue; }
    const day = new Date(stamp(e)).toISOString().slice(0, 10);
    if (age > KEEP_DAYS * DAY || dayKept.has(day)) { drop.push(e); continue; }
    dayKept.add(day);
    keep.push(e);
  }
  while (keep.length > MAX_ENTRIES) drop.push(keep.pop()!);
  return { keep: keep.sort((a, b) => a.time - b.time), drop };
}

export class NoteHistory {
  constructor(private rootDir: string) {}

  private dirFor(filePath: string) {
    return path.join(this.rootDir, sha(path.normalize(filePath)).slice(0, 20));
  }

  private async readIndex(filePath: string): Promise<HistoryIndex> {
    try {
      const raw = JSON.parse(await fs.promises.readFile(path.join(this.dirFor(filePath), 'index.json'), 'utf8'));
      if (raw && Array.isArray(raw.entries)) return { path: filePath, entries: raw.entries };
    } catch { /* 还没有历史 */ }
    return { path: filePath, entries: [] };
  }

  private async writeIndex(filePath: string, index: HistoryIndex) {
    const dir = this.dirFor(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(path.join(dir, 'index.json'), JSON.stringify(index), 'utf8');
  }

  static eligible(filePath: string, content: string): boolean {
    if (!NOTE_RE.test(filePath) || content.length === 0) return false;
    const bytes = Buffer.byteLength(content, 'utf8');
    return bytes <= MAX_SIZE || (bytes <= MAX_RAW_SIZE && Buffer.byteLength(pack(content).text, 'utf8') <= MAX_SIZE);
  }

  /** 新的在前 */
  async list(filePath: string): Promise<HistoryEntry[]> {
    return (await this.readIndex(filePath)).entries.slice().sort((a, b) => b.time - a.time);
  }

  async read(filePath: string, id: string): Promise<string | null> {
    if (!/^[\w-]+$/.test(id)) return null;
    try {
      const dir = this.dirFor(filePath);
      const text = await fs.promises.readFile(path.join(dir, `${id}.md`), 'utf8');
      const blobs = (await this.readIndex(filePath)).entries.find((e) => e.id === id)?.blobs;
      if (!blobs?.length) return text;
      // 图片放回原位。少了哪一张就整个不给：给一份缺图的，恢复时图就悄悄没了
      let out = '';
      let last = 0;
      for (const blob of blobs) {
        if (!/^[0-9a-f]{40}$/.test(blob.hash)) return null;
        out += text.slice(last, blob.at) + await fs.promises.readFile(path.join(dir, BLOB_DIR, `${blob.hash}.b64`), 'utf8');
        last = blob.at;
      }
      return out + text.slice(last);
    } catch {
      return null;
    }
  }

  /** 记一个版本。内容与最新版本相同则跳过；窗口期内连续的 save 覆盖上一个 save */
  async record(filePath: string, content: string, reason: HistoryReason, time = Date.now()): Promise<HistoryEntry | null> {
    if (!NoteHistory.eligible(filePath, content)) return null;
    const index = await this.readIndex(filePath);
    const entries = index.entries.sort((a, b) => a.time - b.time);
    const hash = sha(content);
    if (entries.some((e) => e.hash === hash && (reason === 'before-save' || e === entries[entries.length - 1]))) return null;

    const dir = this.dirFor(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    const last = entries[entries.length - 1];
    if (reason === 'save' && last && last.reason === 'save' && time - last.time < COALESCE_MS && entries.length > 1) {
      entries.pop();
      await fs.promises.rm(path.join(dir, `${last.id}.md`), { force: true });
    }
    const entry: HistoryEntry = { id: `${Math.round(time)}-${hash.slice(0, 8)}`, time, recordedAt: Date.now(), size: Buffer.byteLength(content, 'utf8'), hash, reason };
    const packed = pack(content);
    if (packed.blobs.length) {
      await fs.promises.mkdir(path.join(dir, BLOB_DIR), { recursive: true });
      for (const blob of packed.blobs) {
        const file = path.join(dir, BLOB_DIR, `${blob.hash}.b64`);
        if (!fs.existsSync(file)) await fs.promises.writeFile(file, blob.data, 'utf8');
      }
      entry.blobs = packed.blobs.map(({ at, hash: h }) => ({ at, hash: h }));
    }
    await fs.promises.writeFile(path.join(dir, `${entry.id}.md`), packed.text, 'utf8');
    entries.push(entry);

    const { keep, drop } = pruneEntries(entries, Date.now());
    for (const d of drop) await fs.promises.rm(path.join(dir, `${d.id}.md`), { force: true });
    await this.writeIndex(filePath, { path: filePath, entries: keep });
    await this.pruneBlobs(dir, keep);
    return entry;
  }

  /** 留下来的版本都用不到的图片，删掉 */
  private async pruneBlobs(dir: string, keep: HistoryEntry[]) {
    let names: string[];
    try { names = await fs.promises.readdir(path.join(dir, BLOB_DIR)); } catch { return; }
    const used = new Set(keep.flatMap((e) => (e.blobs || []).map((b) => `${b.hash}.b64`)));
    for (const name of names) if (!used.has(name)) await fs.promises.rm(path.join(dir, BLOB_DIR, name), { force: true });
  }

  /**
   * 覆盖写入前调用：磁盘上现有的内容如果还没留过底（别的编辑器 / 同步盘写的），先存一份。
   * 这样「保存即覆盖」永远有后悔药。
   */
  async beforeOverwrite(filePath: string, newContent: string): Promise<void> {
    if (!NOTE_RE.test(filePath)) return;
    let stat: fs.Stats;
    try { stat = await fs.promises.stat(filePath); } catch { return; }
    if (!stat.isFile() || stat.size > MAX_RAW_SIZE || stat.size === 0) return;
    const old = await fs.promises.readFile(filePath, 'utf8');
    if (old === newContent) return;
    await this.record(filePath, old, 'before-save', Math.min(stat.mtimeMs, Date.now() - 1));
  }

  /** 应用内重命名 / 移动（文件或整个文件夹）：历史跟着走 */
  async rename(oldPath: string, newPath: string): Promise<void> {
    let dirs: string[];
    try { dirs = await fs.promises.readdir(this.rootDir); } catch { return; }
    const oldNorm = path.normalize(oldPath);
    for (const name of dirs) {
      const indexFile = path.join(this.rootDir, name, 'index.json');
      let index: HistoryIndex;
      try { index = JSON.parse(await fs.promises.readFile(indexFile, 'utf8')); } catch { continue; }
      const p = path.normalize(index.path || '');
      let target: string | null = null;
      if (p === oldNorm) target = newPath;
      else if (p.startsWith(oldNorm + path.sep)) target = path.join(newPath, p.slice(oldNorm.length + 1));
      if (!target) continue;
      const dest = this.dirFor(target);
      try {
        await fs.promises.rm(dest, { recursive: true, force: true });
        await fs.promises.rename(path.join(this.rootDir, name), dest);
        await fs.promises.writeFile(path.join(dest, 'index.json'), JSON.stringify({ ...index, path: target }), 'utf8');
      } catch (err) {
        console.warn('[history] rename failed:', err);
      }
    }
  }
}
