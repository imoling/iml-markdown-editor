// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { applySync, buildBlock, placeBlock, planSync } from './sync';
import { memoryDirOf } from './memory';

let home: string;
let lib: string;
const write = (rel: string, content: string) => { const p = path.join(home, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };
const read = (rel: string) => fs.readFileSync(path.join(home, rel), 'utf8');
const status = async () => Object.fromEntries((await planSync(lib, home)).rows.map((r) => [r.id, r.status]));

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'iml-sync-'));
  lib = path.join(home, '笔记库');
  fs.mkdirSync(memoryDirOf(lib), { recursive: true });
  fs.writeFileSync(path.join(memoryDirOf(lib), '我是谁.md'), '# 我是谁\n\n- 康伟，讯飞\n- 用中文\n');
  write('.claude/CLAUDE.md', '# 全局规则\n\n## 我是谁\n\n- 康伟\n');
  write('.codex/AGENTS.md', '<!-- iml-switchboard:start -->\n## 调度\n<!-- iml-switchboard:end -->\n');
  fs.mkdirSync(path.join(home, '.hermes'), { recursive: true });
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

describe('同步到各工具', () => {
  it('块：不支持引用的内联「我是谁」，支持的写 @ 路径；都指向 README', () => {
    const inline = buildBlock('/lib/记忆', '# 我是谁\n\n- 康伟\n', false);
    expect(inline).toBe('<!-- iml-memory:start -->\n## 我是谁\n- 康伟\n\n开工先读 /lib/记忆/README.md，按它说的读「工作方式」和手上任务对应的那篇；手上的事在笔记库的「项目」里。\n<!-- iml-memory:end -->');
    expect(buildBlock('/lib/记忆', '- x', true)).toContain('\n@/lib/记忆/我是谁.md\n');
  });

  it('放块：有旧块就地换，别人的块和正文一字不动；没有就接在末尾', () => {
    const old = '前面\n\n<!-- iml-memory:start -->\n旧的\n<!-- iml-memory:end -->\n\n后面\n';
    expect(placeBlock(old, '<!-- iml-memory:start -->\n新\n<!-- iml-memory:end -->')).toBe('前面\n\n<!-- iml-memory:start -->\n新\n<!-- iml-memory:end -->\n\n后面\n');
    expect(placeBlock('正文\n\n\n', 'B')).toBe('正文\n\nB\n');
    expect(placeBlock('', 'B')).toBe('B\n');
  });

  it('状态：没装的、要接在末尾的、要新建的；自己写了「我是谁」的标出来', async () => {
    const plan = await planSync(lib, home);
    expect(plan.ready).toBe(true);
    expect(await status()).toEqual({ 'claude-code': 'insert', codex: 'insert', gemini: 'not-installed', hermes: 'create', opencode: 'not-installed', windsurf: 'not-installed' });
    expect(plan.rows.find((r) => r.id === 'claude-code')?.hasOwnIdentity).toBe(true);
    expect(plan.rows.find((r) => r.id === 'codex')?.hasOwnIdentity).toBe(false);
  });

  it('只写选中的；写前备份；写完是最新；「我是谁」改了又变成要更新；一天只备份第一次', async () => {
    const { written, backups } = await applySync(lib, home, ['codex', 'hermes'], '2026-11-03');
    expect(written.map((p) => path.relative(home, p))).toEqual(['.codex/AGENTS.md', '.hermes/SOUL.md']);
    expect(backups.map((p) => path.basename(p))).toEqual(['codex-AGENTS.md']);
    expect(read('.codex/AGENTS.md').startsWith('<!-- iml-switchboard:start -->\n## 调度\n<!-- iml-switchboard:end -->\n\n<!-- iml-memory:start -->\n## 我是谁\n- 康伟，讯飞\n- 用中文\n')).toBe(true);
    expect(read('.claude/CLAUDE.md')).toBe('# 全局规则\n\n## 我是谁\n\n- 康伟\n');
    expect((await status()).codex).toBe('current');

    fs.writeFileSync(path.join(memoryDirOf(lib), '我是谁.md'), '# 我是谁\n\n- 康伟，讯飞，合肥\n');
    expect((await status()).codex).toBe('update');
    const second = await applySync(lib, home, ['codex'], '2026-11-03');
    expect(second.backups).toEqual([]);
    expect(fs.readFileSync(path.join(memoryDirOf(lib), '.备份/2026-11-03/codex-AGENTS.md'), 'utf8')).toBe('<!-- iml-switchboard:start -->\n## 调度\n<!-- iml-switchboard:end -->\n');
    expect(read('.codex/AGENTS.md').match(/iml-memory:start/g)).toHaveLength(1);
    expect(read('.codex/AGENTS.md')).toContain('合肥');
  });

  it('「我是谁」还没写：什么都不写', async () => {
    fs.writeFileSync(path.join(memoryDirOf(lib), '我是谁.md'), '# 我是谁\n\n');
    expect((await planSync(lib, home)).ready).toBe(false);
    expect((await applySync(lib, home, ['codex'])).written).toEqual([]);
  });
});
