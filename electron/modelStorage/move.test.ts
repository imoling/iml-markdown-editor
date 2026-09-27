import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { checkTarget, measureTrees, MoveError, rebasePath, transfer } from './move';

const DIRS = ['local-model', 'asr', 'image-gen'] as const;
/** Windows 没有可执行位这回事：那边只验文件在不在、内容对不对 */
const hasModeBits = process.platform !== 'win32';
let base: string;
let from: string;
let to: string;

const write = (root: string, rel: string, content: string | Buffer, mode?: number) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  if (mode) fs.chmodSync(p, mode);
  return p;
};
const tree = (root: string): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else out.push(path.relative(root, p).split(path.sep).join('/')); } };
  if (fs.existsSync(root)) walk(root);
  return out.sort();
};

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'iml-move-'));
  from = path.join(base, 'userdata');
  to = path.join(base, 'disk', 'models');
  write(from, 'local-model/models/chat.gguf', Buffer.alloc(300_000, 1));
  write(from, 'local-model/embedding/embed.gguf', Buffer.alloc(50_000, 2));
  write(from, 'local-model/runtime/b100/llama-server', '#!/bin/sh\n', 0o755);
  write(from, 'asr/models/asr.onnx', Buffer.alloc(20_000, 3));
  write(from, 'image-gen/models/z/unet.gguf', Buffer.alloc(100_000, 4));
  // 不归这里管的：设置、笔记的版本历史
  write(from, 'app-settings.json', '{}');
  write(from, 'history/x/index.json', '{}');
});
afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

const ALL = ['asr/models/asr.onnx', 'image-gen/models/z/unet.gguf', 'local-model/embedding/embed.gguf', 'local-model/models/chat.gguf', 'local-model/runtime/b100/llama-server'];

describe('搬模型', () => {
  for (const forceCopy of [false, true]) {
    const how = forceCopy ? '跨盘（复制）' : '同一块盘（改名）';

    it(`${how}：先放到新位置，旧的一个不删；commit 之后才删，别的文件不碰`, async () => {
      const progress: number[] = [];
      const handle = await transfer(from, to, DIRS, { forceCopy, onProgress: (p) => progress.push(p.movedBytes / p.totalBytes) });
      expect(handle.bytes).toBe(470_010);
      expect(tree(to)).toEqual(ALL);
      expect(fs.readFileSync(path.join(to, 'local-model/models/chat.gguf')).equals(Buffer.alloc(300_000, 1))).toBe(true);
      if (hasModeBits) expect(fs.statSync(path.join(to, 'local-model/runtime/b100/llama-server')).mode & 0o777).toBe(0o755);
      expect(fs.readFileSync(path.join(to, 'local-model/runtime/b100/llama-server'), 'utf8')).toBe('#!/bin/sh\n');
      expect(progress[0]).toBe(0);
      expect(progress[progress.length - 1]).toBe(1);
      if (forceCopy) expect(tree(from)).toEqual([...ALL, 'app-settings.json', 'history/x/index.json'].sort());

      await handle.commit();
      expect(tree(from)).toEqual(['app-settings.json', 'history/x/index.json']);
      expect(tree(to)).toEqual(ALL);
    });

    it(`${how}：设置没改成，撤回来——旧位置和搬之前一模一样，新位置不留东西`, async () => {
      const handle = await transfer(from, to, DIRS, { forceCopy });
      await handle.rollback();
      expect(tree(from)).toEqual([...ALL, 'app-settings.json', 'history/x/index.json'].sort());
      expect(tree(to)).toEqual([]);
      expect(fs.readFileSync(path.join(from, 'asr/models/asr.onnx')).equals(Buffer.alloc(20_000, 3))).toBe(true);
    });

    it(`${how}：新位置已经有同名文件的留着不覆盖，原来就在那儿的别的东西也不动`, async () => {
      write(to, 'local-model/models/chat.gguf', '新位置原来那份');
      write(to, 'local-model/models/other.gguf', '别的模型');
      write(to, '我的文件.txt', '不相干');
      const handle = await transfer(from, to, DIRS, { forceCopy });
      expect(fs.readFileSync(path.join(to, 'local-model/models/chat.gguf'), 'utf8')).toBe('新位置原来那份');
      expect(tree(to)).toEqual([...ALL, 'local-model/models/other.gguf', '我的文件.txt'].sort());

      await handle.rollback();
      expect(tree(to)).toEqual(['local-model/models/chat.gguf', 'local-model/models/other.gguf', '我的文件.txt']);
      expect(tree(from)).toEqual([...ALL, 'app-settings.json', 'history/x/index.json'].sort());
    });

    it(`${how}：搬到一半出错，自己撤回`, async () => {
      // 新位置的 asr 是个文件，不是目录：搬到它的时候会失败，这时 local-model 已经搬过去了
      write(to, 'asr', '挡路的文件');
      await expect(transfer(from, to, ['local-model', 'image-gen', 'asr'], { forceCopy })).rejects.toBeInstanceOf(MoveError);
      expect(tree(from)).toEqual([...ALL, 'app-settings.json', 'history/x/index.json'].sort());
      expect(tree(to)).toEqual(['asr']);
    });
  }

  it('符号链接照原样搬（运行组件里的动态库是链接），不跟进去', async () => {
    write(from, 'local-model/runtime/b100/libllama.0.dylib', 'lib');
    fs.symlinkSync('libllama.0.dylib', path.join(from, 'local-model/runtime/b100/libllama.dylib'));
    const handle = await transfer(from, to, DIRS, { forceCopy: true });
    const link = path.join(to, 'local-model/runtime/b100/libllama.dylib');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(link)).toBe('libllama.0.dylib');
    expect(fs.readFileSync(link, 'utf8')).toBe('lib');
    await handle.commit();
  });

  it('旧位置什么都没下过（或者那块盘没接上）：没东西可搬，照样成功', async () => {
    fs.rmSync(from, { recursive: true });
    const handle = await transfer(from, to, DIRS);
    expect(handle.bytes).toBe(0);
    await handle.commit();
    expect(tree(to)).toEqual([]);
  });

  it('新位置不行的：原地、放进正在搬的目录里面、写不进去', async () => {
    await expect(checkTarget(from, from, DIRS)).rejects.toMatchObject({ code: 'same' });
    await expect(checkTarget(from, path.join(from, 'local-model', 'models'), DIRS)).rejects.toMatchObject({ code: 'nested' });
    await expect(checkTarget(from, path.join(from, 'asr'), DIRS)).rejects.toMatchObject({ code: 'nested' });
    // 放在应用数据目录里另起一个文件夹是可以的
    await expect(checkTarget(from, path.join(from, 'my-models'), DIRS)).resolves.toBeUndefined();
    const blocker = write(base, 'a-file', 'x');
    await expect(checkTarget(from, path.join(blocker, 'sub'), DIRS)).rejects.toMatchObject({ code: 'unwritable' });
  });

  it('量大小：只算那几个目录', async () => {
    expect(await measureTrees(from, DIRS)).toEqual({ files: 5, bytes: 470_010 });
    expect(await measureTrees(path.join(base, '没有这个目录'), DIRS)).toEqual({ files: 0, bytes: 0 });
  });

  it('登记里的完整路径跟着换：只换在旧位置底下的，名字只是开头相同的不算', () => {
    // 路径用 path 拼：Windows 上带盘符、用反斜杠，写死成 /data/old 那边对不上
    const old = path.resolve('/data/old');
    const next = path.resolve('/mnt/new');
    const under = (root: string) => path.join(root, 'local-model', 'runtime', 'b1', 'llama-server');
    expect(rebasePath(under(old), old, next, false)).toBe(under(next));
    expect(rebasePath(old, old, next, false)).toBe(next);
    const sibling = path.resolve('/data/older/llama-server');
    expect(rebasePath(sibling, old, next, false)).toBe(sibling);
    const elsewhere = path.resolve('/opt/homebrew/bin/llama-server');
    expect(rebasePath(elsewhere, old, next, false)).toBe(elsewhere);
    // 大小写不同：区分大小写的系统上是两个目录，不区分的（Windows）是同一个
    const shouting = under(old).toUpperCase();
    expect(rebasePath(shouting, old, next, false)).toBe(shouting);
    expect(rebasePath(shouting, old, next, true)).toBe(next + shouting.slice(old.length));
  });
});
