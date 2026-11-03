import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AiContextPanel } from './AiContextPanel';
import { useAppStore } from '../../stores/appStore';
import type { ContextScan, MemoryState } from '../../types/window';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const file = (path: string, name: string, project?: string) => ({ path, name, bytes: 10, modifiedAt: Date.UTC(2026, 10, 1), project });
const scan: ContextScan = {
  tools: [
    { id: 'claude-code', name: 'Claude Code', knowsUser: true, identity: [file('/h/.claude/CLAUDE.md', 'CLAUDE.md')], memory: [file('/h/.claude/projects/a/memory/x.md', 'projects/a/memory/x.md', 'Personal / MBA'), file('/h/.claude/projects/b/memory/y.md', 'projects/b/memory/y.md', 'Work / training')], skills: 3, updatedAt: Date.UTC(2026, 10, 1) },
    { id: 'codex', name: 'Codex', knowsUser: false, identity: [file('/h/.codex/AGENTS.md', 'AGENTS.md')], memory: [], skills: 0, updatedAt: null },
  ],
  cloud: ['豆包'],
};
const memory: MemoryState = { dir: '/lib/记忆', exists: true, files: [
  { path: '/lib/记忆/我是谁.md', name: '我是谁', lines: 12, localOnly: false, modifiedAt: 0 },
  { path: '/lib/记忆/工作方式.md', name: '工作方式', lines: 30, localOnly: false, modifiedAt: 0 },
  { path: '/lib/记忆/客户.md', name: '客户', lines: 3, localOnly: true, modifiedAt: 0 },
] };
const candidate = (id: string, domain: string) => ({ id, text: id, tool: 'Claude Code', project: '', date: '2026-11-01', file: '/h/x.md', domain, kind: 'feedback' as const });

const api = () => window.api.aiContext as unknown as Record<string, ReturnType<typeof vi.fn>>;

let root: Root | null = null;
let host: HTMLDivElement;
const render = async () => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<AiContextPanel />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
const texts = () => [...host.querySelectorAll('*')].map((el) => el.textContent?.trim() ?? '');
const byText = (text: string) => {
  const el = [...host.querySelectorAll('span, div, button, p, li')].find((e) => e.childNodes.length > 0 && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim() === text));
  if (!el) throw new Error(`找不到「${text}」`);
  return el as HTMLElement;
};
const click = async (el: Element) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };

beforeEach(() => {
  useAppStore.setState({ workspacePath: '/lib', libraryVersion: 0 });
  api().scan.mockResolvedValue(scan);
  api().memoryState.mockResolvedValue(memory);
  api().harvest.mockResolvedValue({ candidates: [candidate('a', '工作方式'), candidate('b', '工作方式'), candidate('c', '公众号')], domains: ['我是谁', '工作方式'] });
  api().cliState.mockResolvedValue({ installed: true, path: '/h/.local/bin/iml' });
});
afterEach(async () => { await act(async () => { root?.unmount(); }); host.remove(); });

describe('AI 上下文面板', () => {
  it('记忆库在上、来源在下；待加入的条数挂在对应那篇上；主按钮带总数', async () => {
    await render();
    const all = texts();
    for (const t of ['我是谁', '待加入 2', '仅本机', 'Claude Code', '没写你是谁', '豆包：装了，内容在云端', '命令行工具已安装']) expect(all, t).toContain(t);
    expect(byText('提炼 3 条新记忆').closest('button')?.className).toContain('btn-primary');
  });

  it('点记忆库里的一篇就地打开；点工具展开规则文件和按项目分的记忆', async () => {
    const openFileByPath = vi.fn(async () => {});
    useAppStore.setState({ openFileByPath });
    await render();
    await click(byText('工作方式'));
    expect(openFileByPath).toHaveBeenCalledWith('/lib/记忆/工作方式.md');
    await click(byText('Claude Code'));
    expect(texts()).toContain('CLAUDE.md');
    expect(texts()).toContain('2 条 · 2 个项目');
    await click(byText('记忆'));
    await click(byText('Personal / MBA'));
    await click(byText('x'));
    expect(openFileByPath).toHaveBeenCalledWith('/h/.claude/projects/a/memory/x.md');
    await click(byText('CLAUDE.md'));
    expect(openFileByPath).toHaveBeenCalledWith('/h/.claude/CLAUDE.md');
  });

  it('没有记忆目录：给「建立记忆库」，提炼按钮是灰的', async () => {
    api().memoryState.mockResolvedValue({ dir: '/lib/记忆', exists: false, files: [] });
    api().harvest.mockResolvedValue({ candidates: [], domains: [] });
    await render();
    expect(texts()).toContain('建立记忆库');
    expect(byText('都提炼过了').closest('button')?.hasAttribute('disabled')).toBe(true);
    api().createMemory.mockResolvedValue(memory);
    await click(byText('建立记忆库'));
    expect(api().createMemory).toHaveBeenCalled();
  });

  it('一个工具都没有也没有记忆库：空状态讲清这是什么', async () => {
    api().scan.mockResolvedValue({ tools: [], cloud: [] });
    api().memoryState.mockResolvedValue({ dir: '/lib/记忆', exists: false, files: [] });
    api().harvest.mockResolvedValue({ candidates: [], domains: [] });
    await render();
    expect(texts()).toContain('各 AI 工具记住的你，和你自己维护的记忆库');
    expect(texts()).toContain('建立记忆库');
  });

  it('搜索只搜上下文，点结果打开那个文件', async () => {
    const openFileByPath = vi.fn(async () => {});
    useAppStore.setState({ openFileByPath });
    api().search.mockResolvedValue([{ tool: '记忆', file: file('/lib/记忆/公众号.md', '公众号'), snippet: '开头从例子讲起' }]);
    await render();
    const input = host.querySelector('input') as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, '例子');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 260)); });
    await click(byText('开头从例子讲起'));
    expect(openFileByPath).toHaveBeenCalledWith('/lib/记忆/公众号.md');
  });
});
