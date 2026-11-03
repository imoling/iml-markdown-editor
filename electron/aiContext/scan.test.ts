// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isScanned, readContextFile, scanAiContext, searchContext } from './scan';

let home: string;
const write = (rel: string, content = 'x') => {
  const p = path.join(home, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  return p;
};

beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'iml-context-')); });
afterEach(() => fs.rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));

describe('scanAiContext', () => {
  it('没装的工具不列出来', async () => {
    expect((await scanAiContext(home, 'darwin')).tools).toEqual([]);
  });

  it('读身份、记忆、技能；写了用户是谁才算知道', async () => {
    write('.claude/CLAUDE.md', '# 全局规则\n\n## 我是谁\n\n- 康伟\n');
    write('.claude/projects/-a/memory/one.md', '记忆一：代理很慢');
    write('.claude/projects/-a/memory/MEMORY.md', '索引不算记忆');
    write('.claude/projects/-a/session.md', '不在 memory 目录里的不算');
    write('.claude/skills/甲/SKILL.md');
    write('.claude/skills/乙/SKILL.md');
    write('.codex/AGENTS.md', '## 模型调度\n\n- 需要图片时调用 generate_image\n');
    write('.workbuddy/USER.md', '# USER.md - About Your Human\n\n- Name: 康Sir\n');

    const { tools } = await scanAiContext(home, 'darwin');
    const [claude, codex, workbuddy] = ['claude-code', 'codex', 'workbuddy'].map((id) => tools.find((t) => t.id === id)!);
    expect(claude).toMatchObject({ knowsUser: true, skills: 2 });
    expect(claude.memory.map((f) => path.basename(f.path))).toEqual(['one.md']);
    expect(codex.knowsUser).toBe(false);
    expect(workbuddy.knowsUser).toBe(true);
  });

  it('身份文件不在时不算知道，也不报错', async () => {
    write('.gemini/antigravity/knowledge/a.md');
    const [gemini] = (await scanAiContext(home, 'darwin')).tools;
    expect(gemini).toMatchObject({ id: 'gemini', knowsUser: false, identity: [] });
    expect(gemini.memory).toHaveLength(1);
  });

  it('凭证、数据库、缓存和插件都不收', async () => {
    write('.codex/AGENTS.md');
    write('.codex/auth.json', '{"token":"秘密"}');
    write('.codex/memories/note.md', '能读');
    write('.codex/memories/cache/x.md', '缓存不读');
    write('.codex/memories_1.sqlite', '二进制');
    write('.claude/CLAUDE.md');
    write('.claude/plugins/a/memory/x.md', '插件不算');
    const scan = await scanAiContext(home, 'darwin');
    const names = scan.tools.flatMap((t) => [...t.identity, ...t.memory]).map((f) => path.basename(f.path));
    expect(names.sort()).toEqual(['AGENTS.md', 'CLAUDE.md', 'note.md']);
    expect(await searchContext(scan, '秘密')).toEqual([]);
  });

  it('技能是软链接也数得到；Hermes 各个配置里的记忆都算', async () => {
    write('.claude/CLAUDE.md');
    write('.agents/skills/外面的/SKILL.md');
    fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true });
    fs.symlinkSync(path.join(home, '.agents', 'skills', '外面的'), path.join(home, '.claude', 'skills', '外面的'), 'junction');
    write('.hermes/SOUL.md');
    write('.hermes/profiles/甲/memories/USER.md', '偏好');
    write('.hermes/profiles/甲/cron/x.md', '不是记忆');
    const { tools } = await scanAiContext(home, 'darwin');
    expect(tools.find((t) => t.id === 'claude-code')?.skills).toBe(1);
    expect(tools.find((t) => t.id === 'hermes')?.memory.map((f) => path.basename(f.path))).toEqual(['USER.md']);
  });

  it('上下文在云端的应用只说装了', async () => {
    fs.mkdirSync(path.join(home, 'Library', 'Application Support', 'Doubao'), { recursive: true });
    expect((await scanAiContext(home, 'darwin')).cloud).toEqual(['豆包']);
  });
});

describe('读和搜', () => {
  it('只读扫出来的文件', async () => {
    const memory = write('.claude/projects/-a/memory/one.md', '代理很慢');
    const secret = write('.claude/.credentials.json', '秘密');
    write('.claude/CLAUDE.md');
    const scan = await scanAiContext(home, 'darwin');
    expect(isScanned(scan, memory)).toBe(true);
    expect(await readContextFile(scan, memory)).toBe('代理很慢');
    expect(await readContextFile(scan, secret)).toBeNull();
    expect(await readContextFile(scan, path.join(home, 'x.md'))).toBeNull();
  });

  it('跨工具搜，带上下文片段；不分大小写，有上限', async () => {
    write('.claude/CLAUDE.md', '这台电脑是 M4 Air 24 GB');
    write('.codex/memories/a.md', '机器：m4 air');
    write('.hermes/SOUL.md', '无关');
    const scan = await scanAiContext(home, 'darwin');
    const hits = await searchContext(scan, 'M4 AIR');
    expect(hits.map((h) => h.tool).sort()).toEqual(['Claude Code', 'Codex']);
    expect(hits.find((h) => h.tool === 'Codex')?.snippet).toContain('m4 air');
    expect(await searchContext(scan, 'M4 AIR', 1)).toHaveLength(1);
    expect(await searchContext(scan, '  ')).toEqual([]);
  });
});
