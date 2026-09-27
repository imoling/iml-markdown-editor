import fs from 'fs';
import path from 'path';

/**
 * 把已下载的模型和运行组件从一个目录搬到另一个目录。
 *
 * 几 GB 的东西，中途什么都可能发生（磁盘满、移动硬盘被拔、没权限），所以分两步：
 * transfer 只往新位置放，旧位置的文件一个不删；调用方把设置改过去之后再 commit（这时才删旧的）。
 * transfer 中途失败会自己撤回，设置没存成调用方调 rollback —— 两种情况下旧位置都原样能用。
 *
 * 同一块盘上是改名（一瞬间，不占额外空间），跨盘才真的复制。
 * 新位置已经有同名文件的（以前放过、或从别的电脑拷来的）：留着新位置那份，不覆盖。
 */
export interface MoveProgress { movedBytes: number; totalBytes: number }

export interface MoveOptions {
  onProgress?: (p: MoveProgress) => void;
  /** 不试改名、一律复制（测试里用它走跨盘那条路） */
  forceCopy?: boolean;
}

export interface MoveHandle {
  bytes: number;
  /** 设置已经改过去了：删掉旧位置的那几个目录 */
  commit: () => Promise<void>;
  /** 设置没改成：新位置放过去的撤回来 */
  rollback: () => Promise<void>;
}

export class MoveError extends Error {
  constructor(public code: 'same' | 'nested' | 'unwritable' | 'space' | 'failed', message: string, public shortBytes = 0) { super(message); }
}

const exists = async (p: string) => { try { await fs.promises.lstat(p); return true; } catch { return false; } };
const isInside = (child: string, parent: string) => { const rel = path.relative(parent, child); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); };

/** 这几个目录一共多大（符号链接不跟进去） */
export async function measureTrees(root: string, dirs: readonly string[]): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const walk = async (dir: string) => {
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.isFile()) { files++; try { bytes += (await fs.promises.stat(p)).size; } catch { /* 刚被删了 */ } }
    }
  };
  for (const d of dirs) await walk(path.join(root, d));
  return { files, bytes };
}

/** 新位置能不能用：不是原地、不在要搬的目录里面、写得进去 */
export async function checkTarget(from: string, to: string, dirs: readonly string[]): Promise<void> {
  const a = path.resolve(from);
  const b = path.resolve(to);
  if (a === b) throw new MoveError('same', '已经在这个位置了');
  if (dirs.some((d) => isInside(b, path.join(a, d)))) throw new MoveError('nested', '不能放进现在存模型的文件夹里面，换一个位置');
  try {
    await fs.promises.mkdir(b, { recursive: true });
    const probe = path.join(b, `.iml-write-test-${process.pid}`);
    await fs.promises.writeFile(probe, '');
    await fs.promises.rm(probe, { force: true });
  } catch {
    throw new MoveError('unwritable', '这个位置写不进去，换一个位置');
  }
}

async function freeBytes(dir: string): Promise<number | null> {
  try { const s = await fs.promises.statfs(dir); return Number(s.bavail) * Number(s.bsize); } catch { return null; }
}

async function copyFile(src: string, dst: string, stat: fs.Stats, onBytes: (n: number) => void): Promise<void> {
  const tmp = `${dst}.moving`;
  try {
    await new Promise<void>((resolve, reject) => {
      const input = fs.createReadStream(src);
      const output = fs.createWriteStream(tmp, { mode: stat.mode });
      input.on('data', (chunk) => onBytes(chunk.length));
      input.on('error', reject);
      output.on('error', reject);
      output.on('finish', () => resolve());
      input.pipe(output);
    });
    // 可执行位、修改时间照原样（运行组件靠可执行位，模型的校验有的看时间）
    await fs.promises.chmod(tmp, stat.mode);
    await fs.promises.utimes(tmp, stat.atime, stat.mtime);
    await fs.promises.rename(tmp, dst);
  } catch (err) {
    await fs.promises.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

export async function transfer(from: string, to: string, dirs: readonly string[], opts: MoveOptions = {}): Promise<MoveHandle> {
  const src = path.resolve(from);
  const dst = path.resolve(to);
  await checkTarget(src, dst, dirs);

  const { bytes: totalBytes } = await measureTrees(src, dirs);
  let sameDevice = false;
  try { sameDevice = (await fs.promises.stat(src)).dev === (await fs.promises.stat(dst)).dev; } catch { sameDevice = false; }
  if (opts.forceCopy || !sameDevice) {
    const free = await freeBytes(dst);
    if (free !== null && free < totalBytes) throw new MoveError('space', '新位置的空间不够', totalBytes - free);
  }

  /** 改名搬过去的（撤回时改回来）、复制出来的（撤回时删掉）、为此新建的目录（撤回时空了就删） */
  const renamed: { from: string; to: string }[] = [];
  const copied: string[] = [];
  const madeDirs: string[] = [];
  let movedBytes = 0;
  const report = () => opts.onProgress?.({ movedBytes: Math.min(movedBytes, totalBytes), totalBytes });

  const mkdir = async (dir: string, mode?: number) => {
    if (await exists(dir)) return;
    await fs.promises.mkdir(dir, { recursive: true, ...(mode ? { mode } : {}) });
    madeDirs.push(dir);
  };

  const sizeOf = async (p: string) => (await measureTrees(path.dirname(p), [path.basename(p)])).bytes;

  const moveEntry = async (a: string, b: string): Promise<void> => {
    const stat = await fs.promises.lstat(a);
    if (stat.isDirectory()) {
      // 新位置没有这个目录、又在同一块盘上：整个目录改名过去
      if (!opts.forceCopy && !(await exists(b))) {
        try {
          const size = await sizeOf(a);
          await fs.promises.rename(a, b);
          renamed.push({ from: a, to: b });
          movedBytes += size;
          report();
          return;
        } catch (err: any) {
          if (err?.code !== 'EXDEV') throw err;
        }
      }
      await mkdir(b, stat.mode);
      for (const name of await fs.promises.readdir(a)) await moveEntry(path.join(a, name), path.join(b, name));
      return;
    }
    if (await exists(b)) { if (stat.isFile()) { movedBytes += stat.size; report(); } return; }
    if (!opts.forceCopy) {
      try {
        await fs.promises.rename(a, b);
        renamed.push({ from: a, to: b });
        if (stat.isFile()) { movedBytes += stat.size; report(); }
        return;
      } catch (err: any) {
        if (err?.code !== 'EXDEV') throw err;
      }
    }
    if (stat.isSymbolicLink()) {
      await fs.promises.symlink(await fs.promises.readlink(a), b);
      copied.push(b);
    } else if (stat.isFile()) {
      let last = 0;
      await copyFile(a, b, stat, (n) => {
        movedBytes += n;
        // 大文件一路报进度，但别每 64 KB 报一次
        if (movedBytes - last >= 8 * 1024 * 1024) { last = movedBytes; report(); }
      });
      copied.push(b);
      report();
    }
  };

  const rollback = async () => {
    for (const p of copied.reverse()) await fs.promises.rm(p, { force: true }).catch(() => {});
    for (const r of renamed.reverse()) {
      await fs.promises.mkdir(path.dirname(r.from), { recursive: true }).catch(() => {});
      await fs.promises.rename(r.to, r.from).catch(() => {});
    }
    // 只删自己建的、而且已经空了的目录：新位置原来就有的东西不碰
    for (const d of madeDirs.reverse()) await fs.promises.rmdir(d).catch(() => {});
    copied.length = 0; renamed.length = 0; madeDirs.length = 0;
  };

  try {
    report();
    for (const d of dirs) {
      const a = path.join(src, d);
      if (await exists(a)) await moveEntry(a, path.join(dst, d));
    }
  } catch (err: any) {
    await rollback();
    if (err instanceof MoveError) throw err;
    throw new MoveError(err?.code === 'ENOSPC' ? 'space' : 'failed', err?.code === 'ENOSPC' ? '新位置的空间不够' : (err?.message || String(err)));
  }

  return {
    bytes: totalBytes,
    rollback,
    commit: async () => {
      for (const d of dirs) await fs.promises.rm(path.join(src, d), { recursive: true, force: true }).catch(() => {});
    },
  };
}

/** 运行组件的登记里记着可执行文件的完整路径：搬了家要跟着改，不然会被当成没装 */
export function rebasePath(p: string, from: string, to: string, caseInsensitive = process.platform === 'win32'): string {
  const a = path.resolve(from);
  const head = p.slice(0, a.length);
  const same = caseInsensitive ? head.toLowerCase() === a.toLowerCase() : head === a;
  const next = p.charAt(a.length);
  if (!same || (next !== '' && next !== '/' && next !== '\\')) return p;
  return path.resolve(to) + p.slice(a.length);
}
