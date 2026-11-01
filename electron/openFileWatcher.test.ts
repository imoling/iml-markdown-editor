// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { OpenFileWatcher, filesOutsideLibrary } from './openFileWatcher';

describe('filesOutsideLibrary', () => {
  const root = path.join(path.sep, 'lib');

  it('库里的留给整库监听，库外的才要单独看', () => {
    const inside = path.join(root, '项目', 'a.md');
    const outside = path.join(path.sep, 'other', 'b.md');
    const sibling = path.join(path.sep, 'lib-2', 'c.md'); // 名字前缀相同的目录不算库里
    expect(filesOutsideLibrary([inside, outside, sibling], root)).toEqual([outside, sibling]);
  });

  it('笔记库没在监听时，所有文件都要看', () => {
    expect(filesOutsideLibrary(['a'], null)).toEqual(['a']);
  });
});

describe('OpenFileWatcher', () => {
  let dir: string;
  let watcher: OpenFileWatcher;
  let seen: string[][];

  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 80 && !ok(); i++) await new Promise((r) => setTimeout(r, 50));
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iml-open-files-'));
    seen = [];
    watcher = new OpenFileWatcher((paths) => seen.push(paths), 20);
  });

  afterEach(() => {
    watcher.close();
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); // Windows 上监听刚关，目录可能还占着
  });

  it('文件被改了就通知，同目录没打开的文件不通知', async () => {
    const file = path.join(dir, 'a.md');
    fs.writeFileSync(file, '1');
    fs.writeFileSync(path.join(dir, 'b.md'), '1');
    watcher.sync([file]);
    fs.writeFileSync(path.join(dir, 'b.md'), '2');
    fs.writeFileSync(file, '2');
    await until(() => seen.length > 0);
    expect(seen.flat()).toEqual([file]);
  });

  it('写临时文件再改名的保存方式也能看到', async () => {
    const file = path.join(dir, 'a.md');
    fs.writeFileSync(file, '1');
    watcher.sync([file]);
    fs.writeFileSync(`${file}.tmp`, '2');
    fs.renameSync(`${file}.tmp`, file);
    await until(() => seen.length > 0);
    expect(seen.flat()).toContain(file);
  });

  it('标签页关了就不再通知', async () => {
    const file = path.join(dir, 'a.md');
    fs.writeFileSync(file, '1');
    watcher.sync([file]);
    watcher.sync([]);
    fs.writeFileSync(file, '2');
    await new Promise((r) => setTimeout(r, 150));
    expect(seen).toEqual([]);
  });
});
