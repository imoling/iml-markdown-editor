// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { appendMemoryLines, buildMemoryBundle, createMemoryDir, memoryDirOf, readMemoryState } from './memory';

let lib: string;
const write = (name: string, content: string) => {
  fs.mkdirSync(memoryDirOf(lib), { recursive: true });
  fs.writeFileSync(path.join(memoryDirOf(lib), name), content);
};

beforeEach(() => { lib = fs.mkdtempSync(path.join(os.tmpdir(), 'iml-memory-')); });
afterEach(() => fs.rmSync(lib, { recursive: true, force: true }));

describe('记忆库', () => {
  it('没有目录：exists 为假，不报错', async () => {
    expect(await readMemoryState(lib)).toEqual({ dir: memoryDirOf(lib), exists: false, files: [] });
  });

  it('我是谁、工作方式排最前，其余按名字；README 和隐藏文件不算；开头写「仅本机」的标出来', async () => {
    write('README.md', '# 记忆\n');
    write('.采集记录.json', '{}');
    write('公众号.md', '# 公众号\n\n- 一\n- 二\n');
    write('工作方式.md', '# 工作方式\n\n- 先定再改\n');
    write('我是谁.md', '# 我是谁\n\n- 康伟\n');
    write('客户.md', '仅本机\n\n# 客户\n\n- 某某\n');
    const state = await readMemoryState(lib);
    expect(state.exists).toBe(true);
    expect(state.files.map((f) => f.name)).toEqual(['我是谁', '工作方式', '公众号', '客户']);
    expect(state.files.map((f) => f.localOnly)).toEqual([false, false, false, true]);
    expect(state.files[2].lines).toBe(3);
  });

  it('建立记忆库：只写 README，不放空壳笔记；已有的不覆盖', async () => {
    const empty = await createMemoryDir(fs.mkdtempSync(path.join(os.tmpdir(), 'iml-memory-empty-')));
    expect(empty.exists).toBe(true);
    expect(empty.files).toEqual([]);
    write('我是谁.md', '# 我是谁\n\n- 已经写过\n');
    const state = await createMemoryDir(lib);
    expect(state.files.map((f) => f.name)).toEqual(['我是谁']);
    expect(fs.readFileSync(path.join(memoryDirOf(lib), '我是谁.md'), 'utf8')).toContain('已经写过');
    expect(fs.readFileSync(path.join(memoryDirOf(lib), 'README.md'), 'utf8')).toContain('只追加');
  });

  it('追加：末尾补换行再接；没有这篇就建，标题是领域名；领域名里的路径字符去掉', async () => {
    write('公众号.md', '# 公众号\n\n- 一');
    await appendMemoryLines(lib, '公众号', ['二（2026-11-03，Codex）', '- 三']);
    expect(fs.readFileSync(path.join(memoryDirOf(lib), '公众号.md'), 'utf8')).toBe('# 公众号\n\n- 一\n- 二（2026-11-03，Codex）\n- 三\n');
    const created = await appendMemoryLines(lib, '方案/评审', ['四']);
    expect(path.basename(created)).toBe('方案评审.md');
    expect(fs.readFileSync(created, 'utf8')).toBe('# 方案评审\n\n- 四\n');
  });

  it('合集：我是谁、工作方式在前，仅本机的不进，空篇跳过；指定篇名就只要那几篇', async () => {
    write('我是谁.md', '# 我是谁\n\n- 康伟\n');
    write('写作.md', '# 写作\n\n- 全角标点\n');
    write('工作方式.md', '# 工作方式\n\n- 先定再改\n');
    write('客户.md', '仅本机\n\n# 客户\n\n- 某某\n');
    write('空的.md', '   \n');
    const { text, files } = await buildMemoryBundle(lib, { date: '2026-11-03' });
    expect(files.map((f) => f.name)).toEqual(['我是谁', '工作方式', '空的', '写作']);
    expect(text).toBe('# 我的工作记忆（合集，2026-11-03）\n\n下面是我在各个 AI 工具里攒下来的身份和规矩，读完照着做；有冲突以我当场说的为准。\n\n# 我是谁\n\n- 康伟\n\n# 工作方式\n\n- 先定再改\n\n# 写作\n\n- 全角标点\n');
    expect(text).not.toContain('某某');
    const one = await buildMemoryBundle(lib, { names: ['写作'], date: '2026-11-03' });
    expect(one.files.map((f) => f.name)).toEqual(['写作']);
    expect((await buildMemoryBundle(lib, { names: ['没有这篇'] })).text).toBe('');
  });
});
