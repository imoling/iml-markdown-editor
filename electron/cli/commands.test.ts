// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runCli } from './commands';
import { cliWrapper } from './install';

let dir: string;
let lib: string;
const now = new Date(2026, 10, 3, 9, 0);
const write = (rel: string, content: string) => {
  const p = path.join(lib, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const run = (...args: string[]) => runCli([...args, '--library', lib], { userData: dir, now, env: {}, home: dir, platform: 'darwin' });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iml-cli-'));
  lib = path.join(dir, '笔记库');
  write('任务清单.md', '- [ ] 逾期的事 📅 2026-11-01\n- [ ] 今天的事 📅 2026-11-03\n- [ ] 下周的事 📅 2026-11-08\n- [ ] 很久以后 📅 2027-01-01\n- [ ] 没写日期\n- [x] 做完的 📅 2026-11-01\n');
  write('模板/任务卡.md', '- [ ] 模板里的占位 📅 2026-11-01\n');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

describe('iml today', () => {
  it('只列逾期和今天，逾期在前，做完的和模板里的不算', async () => {
    const { code, out } = await run('today');
    expect(code).toBe(0);
    expect(out).toBe('逾期 1 件，今天 1 件\n- 2026-11-01 逾期的事（任务清单.md:1）\n- 2026-11-03 今天的事（任务清单.md:2）\n');
  });

  it('没有到期的：什么都不输出，hook 里不打扰', async () => {
    write('任务清单.md', '- [ ] 下周的事 📅 2026-11-08\n');
    expect(await run('today')).toEqual({ code: 0, out: '', err: '' });
  });

  it('--json', async () => {
    const data = JSON.parse((await run('today', '--json')).out);
    expect(data.date).toBe('2026-11-03');
    expect(data.tasks.map((t: { text: string }) => t.text)).toEqual(['逾期的事', '今天的事']);
    expect(data.tasks[0]).toMatchObject({ due: '2026-11-01', note: '任务清单.md', line: 1, bucket: 'overdue' });
  });
});

describe('iml tasks', () => {
  it('默认全部未完成，没写日期的排最后', async () => {
    const rows = (await run('tasks')).out.trim().split('\n');
    expect(rows).toHaveLength(5);
    expect(rows.at(-1)).toContain('没写日期');
  });

  it('--due 筛范围', async () => {
    const texts = async (d: string) => JSON.parse((await run('tasks', '--due', d, '--json')).out).tasks.map((t: { text: string }) => t.text);
    expect(await texts('overdue')).toEqual(['逾期的事']);
    expect(await texts('today')).toEqual(['逾期的事', '今天的事']);
    expect(await texts('week')).toEqual(['逾期的事', '今天的事', '下周的事']);
    expect(await texts('all')).toHaveLength(5);
  });

  it('--done 带上已完成的', async () => {
    expect((await run('tasks', '--done')).out).toContain('[x] 2026-11-01 做完的');
  });

  it('错的范围、错的命令给出明确提示', async () => {
    expect(await run('tasks', '--due', '明天')).toMatchObject({ code: 2, err: expect.stringContaining('--due') });
    expect(await run('删除')).toMatchObject({ code: 2, err: expect.stringContaining('不认识的命令') });
  });
});

describe('用哪个笔记库', () => {
  const noFlag = (env: NodeJS.ProcessEnv) => runCli(['today'], { userData: dir, now, env, home: dir, platform: 'darwin' });

  it('环境变量优先于编辑器设置', async () => {
    fs.writeFileSync(path.join(dir, 'app-settings.json'), JSON.stringify({ defaultLibraryPath: path.join(dir, '不存在') }));
    expect((await noFlag({ IML_LIBRARY: lib })).out).toContain('逾期 1 件');
    expect(await noFlag({})).toMatchObject({ code: 1, err: expect.stringContaining('笔记库不存在') });
  });

  it('读编辑器当前的笔记库；一个都没有时说清楚', async () => {
    expect(await noFlag({})).toMatchObject({ code: 1, err: expect.stringContaining('找不到笔记库') });
    fs.writeFileSync(path.join(dir, 'app-settings.json'), JSON.stringify({ defaultLibraryPath: lib }));
    expect((await noFlag({})).out).toContain('今天 1 件');
  });
});

describe('iml context', () => {
  it('列工具概况，--json 给完整结构', async () => {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'CLAUDE.md'), '## 我是谁\n');
    fs.mkdirSync(path.join(dir, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.codex', 'AGENTS.md'), '调度规则\n');
    const { out } = await run('context');
    expect(out).toContain('Claude Code：写了你是谁');
    expect(out).toContain('Codex：没写你是谁');
    expect(JSON.parse((await run('context', '--json')).out).tools).toHaveLength(2);
  });
});

describe('帮助', () => {
  it('不带命令就是帮助', async () => {
    expect((await runCli([], { userData: dir })).out).toContain('iml today');
  });
});

describe('cliWrapper', () => {
  it('先清掉 ELECTRON_RUN_AS_NODE：VS Code 里的终端带着它，不清就跑不起来', () => {
    const sh = cliWrapper('/Applications/iML Markdown Editor.app/Contents/MacOS/iML Markdown Editor', 'darwin');
    expect(sh).toContain('unset ELECTRON_RUN_AS_NODE');
    expect(sh).toContain('exec "/Applications/iML Markdown Editor.app/Contents/MacOS/iML Markdown Editor" --cli "$@"');
  });

  it('Windows 写 cmd', () => {
    const cmd = cliWrapper('C:\\Program Files\\iML\\iML.exe', 'win32');
    expect(cmd).toContain('set ELECTRON_RUN_AS_NODE=');
    expect(cmd).toContain('"C:\\Program Files\\iML\\iML.exe" --cli %*');
  });
});

describe('iml memory', () => {
  const memory = (name: string, content: string) => write(`记忆/${name}.md`, content);
  it('打合集：我是谁、工作方式在前，仅本机的不带；--domain 只打一篇；没有就报错', async () => {
    memory('写作', '# 写作\n\n- 全角标点\n');
    memory('我是谁', '# 我是谁\n\n- 康伟\n');
    memory('客户', '仅本机\n\n# 客户\n\n- 某某\n');
    const { code, out } = await run('memory');
    expect(code).toBe(0);
    expect(out.startsWith('# 我的工作记忆（合集，2026-11-03）\n')).toBe(true);
    expect(out.indexOf('# 我是谁')).toBeLessThan(out.indexOf('# 写作'));
    expect(out).not.toContain('某某');
    expect((await run('memory', '--domain', '写作')).out).toBe('# 我的工作记忆（合集，2026-11-03）\n\n下面是我在各个 AI 工具里攒下来的身份和规矩，读完照着做；有冲突以我当场说的为准。\n\n# 写作\n\n- 全角标点\n');
    expect((await run('memory', '--domain', '没有')).code).toBe(1);
    expect(JSON.parse((await run('memory', '--json')).out).files).toEqual(['我是谁', '写作']);
  });

  it('记忆库是空的：退出码 1 并说清楚', async () => {
    const { code, err } = await run('memory');
    expect(code).toBe(1);
    expect(err).toContain('记忆库是空的');
  });

  it('harvest：只列各工具里有、记忆库里没有的，不写文件', async () => {
    fs.mkdirSync(path.join(dir, '.claude/projects/-Users-me-Personal-MBA---/memory'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude/projects/-Users-me-Personal-MBA---/memory/a.md'), '---\nname: a\ndescription: 同级项不单独换色\nmetadata:\n  type: feedback\n  modified: 2026-10-31T00:00:00Z\n---\n正文\n');
    const { code, out } = await run('memory', 'harvest');
    expect(code).toBe(0);
    expect(out).toBe('- [课件与 PPT] 同级项不单独换色（2026-10-31，Claude Code / Personal / MBA）\n');
    expect(fs.existsSync(path.join(lib, '记忆'))).toBe(false);
    expect(JSON.parse((await run('memory', 'harvest', '--json')).out).candidates).toHaveLength(1);
  });
});
