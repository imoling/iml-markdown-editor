import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NoteHistory, pruneEntries, COALESCE_MS, type HistoryEntry } from './history';

let dir: string;
let history: NoteHistory;
let note: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iml-history-'));
  history = new NoteHistory(path.join(dir, 'store'));
  note = path.join(dir, 'lib', '笔记.md');
  fs.mkdirSync(path.dirname(note), { recursive: true });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('NoteHistory', () => {
  it('覆盖写入前，磁盘上没留过底的内容先存一份（别的编辑器写的版本不会被一次保存抹掉）', async () => {
    fs.writeFileSync(note, '外部编辑器写的内容');
    await history.beforeOverwrite(note, '在应用里改过的内容');
    await history.record(note, '在应用里改过的内容', 'save');
    const list = await history.list(note);
    expect(list.map((e) => e.reason)).toEqual(['save', 'before-save']);
    expect(await history.read(note, list[1].id)).toBe('外部编辑器写的内容');
    expect(await history.read(note, list[0].id)).toBe('在应用里改过的内容');
  });

  it('内容没变不重复记；已经留过底的旧内容不再重复留底', async () => {
    await history.record(note, 'v1', 'save');
    expect(await history.record(note, 'v1', 'save')).toBeNull();
    fs.writeFileSync(note, 'v1');
    await history.beforeOverwrite(note, 'v2');
    expect(await history.list(note)).toHaveLength(1);
  });

  it('时间窗内的连续保存合并成一个版本，但最早的基线保留', async () => {
    const t0 = Date.now() - 60_000;
    await history.record(note, '基线', 'save', t0);
    await history.record(note, '改动 1', 'save', t0 + 1000);
    await history.record(note, '改动 2', 'save', t0 + 2000);
    await history.record(note, '改动 3', 'save', t0 + 3000);
    const list = await history.list(note);
    expect(list).toHaveLength(2);
    expect(await history.read(note, list[0].id)).toBe('改动 3');
    expect(await history.read(note, list[1].id)).toBe('基线');
    // 过了时间窗就是新版本
    await history.record(note, '第二天', 'save', t0 + 3000 + COALESCE_MS + 1);
    expect(await history.list(note)).toHaveLength(3);
  });

  it('很久没动过的旧笔记：留底版本显示原来的修改时间，但不会因为「太老」被立刻清掉', async () => {
    fs.writeFileSync(note, '一年前写的');
    const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    fs.utimesSync(note, yearAgo, yearAgo);
    await history.beforeOverwrite(note, '今天改的');
    await history.record(note, '今天改的', 'save');
    const list = await history.list(note);
    expect(list).toHaveLength(2);
    expect(list[1].reason).toBe('before-save');
    expect(Math.abs(list[1].time - yearAgo.getTime())).toBeLessThan(2000);
    expect(await history.read(note, list[1].id)).toBe('一年前写的');
  });

  it('图片写进了笔记里的：再大也留版本，读回来一字不差；同一张图只存一份，用不到了就删', async () => {
    const shot = (seed: string) => `data:image/webp;base64,${seed.repeat(700_000)}`; // 一张 2.8 MB
    const v1 = `# 带图\n\n![甲](${shot('QUJD')})\n\n第一版`;
    const v2 = `# 带图\n\n![甲](${shot('QUJD')})\n\n第二版，多了一张：![乙](${shot('REVG')}) 图后面还有字`;
    const t0 = Date.now() - 12 * COALESCE_MS;
    fs.writeFileSync(note, v1);
    fs.utimesSync(note, t0 / 1000, t0 / 1000);
    await history.beforeOverwrite(note, v2);
    await history.record(note, v2, 'save', t0 + 2 * COALESCE_MS);
    const list = await history.list(note);
    expect(list.map((e) => e.reason)).toEqual(['save', 'before-save']);
    expect(await history.read(note, list[0].id)).toBe(v2);
    expect(await history.read(note, list[1].id)).toBe(v1);
    expect(list[0].size).toBe(Buffer.byteLength(v2));

    const store = path.join(dir, 'store', fs.readdirSync(path.join(dir, 'store'))[0]);
    const blobs = () => fs.readdirSync(path.join(store, 'blobs'));
    expect(blobs()).toHaveLength(2);
    for (const e of list) expect(fs.statSync(path.join(store, `${e.id}.md`)).size).toBeLessThan(200);

    // 紧接着又存了一版（时间窗内，顶掉上一版），把「乙」删了：那张图没有版本在用了
    const v3 = v1.replace('第一版', '第三版');
    await history.record(note, v3, 'save', t0 + 2 * COALESCE_MS + 1000);
    expect((await history.list(note)).map((e) => e.reason)).toEqual(['save', 'before-save']);
    expect(blobs()).toHaveLength(1);
    expect(await history.read(note, (await history.list(note))[0].id)).toBe(v3);

    // 图片文件丢了：不给一份缺图的内容
    fs.rmSync(path.join(store, 'blobs', blobs()[0]));
    expect(await history.read(note, (await history.list(note))[0].id)).toBeNull();
  });

  it('没有图、单纯就是太大的笔记照旧不留版本', async () => {
    expect(await history.record(note, '字'.repeat(800_000), 'save')).toBeNull();
    expect(await history.record(note.replace(/\.md$/, '.txt'), `![图](data:image/png;base64,${'QUJD'.repeat(100)}) ${'字'.repeat(800_000)}`, 'save')).toBeNull();
  });

  it('空内容、非笔记文件、非法 id 都不处理', async () => {
    expect(await history.record(note, '', 'save')).toBeNull();
    expect(await history.record(path.join(dir, 'a.png'), 'x', 'save')).toBeNull();
    expect(await history.read(note, '../../etc/passwd')).toBeNull();
  });

  it('应用内重命名文件或文件夹，历史跟着走', async () => {
    await history.record(note, '内容', 'save');
    const renamed = path.join(dir, 'lib', '新名字.md');
    await history.rename(note, renamed);
    expect(await history.list(note)).toHaveLength(0);
    expect(await history.list(renamed)).toHaveLength(1);

    await history.rename(path.join(dir, 'lib'), path.join(dir, 'library'));
    expect(await history.list(path.join(dir, 'library', '新名字.md'))).toHaveLength(1);
  });
});

describe('pruneEntries', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 8, 18, 12);
  const entry = (time: number): HistoryEntry => ({ id: String(time), time, recordedAt: time, size: 1, hash: String(time), reason: 'save' });

  it('24 小时内全留；更早的每天只留最后一个；超过 60 天的丢掉', () => {
    const recent = [now - 1000, now - 2000, now - 3000].map(entry);
    const threeDaysAgo = [now - 3 * DAY, now - 3 * DAY - 1000, now - 3 * DAY - 2000].map(entry);
    const ancient = [entry(now - 61 * DAY)];
    const { keep, drop } = pruneEntries([...recent, ...threeDaysAgo, ...ancient], now);
    expect(keep.map((e) => e.time)).toEqual([now - 3 * DAY, now - 3000, now - 2000, now - 1000]);
    expect(drop).toHaveLength(3);
  });
});
