import fs from 'fs';
import path from 'path';
import { memoryDirOf } from './memory';

/**
 * 同步：把记忆库的入口写进各工具的全局规则文件，换了工具它开工就会来读。
 * 只动 `<!-- iml-memory:start -->` 到 `<!-- iml-memory:end -->` 中间那一块；写之前整份备份。
 */
export const BLOCK_START = '<!-- iml-memory:start -->';
export const BLOCK_END = '<!-- iml-memory:end -->';
const BLOCK_RE = /<!-- iml-memory:start -->[\s\S]*?<!-- iml-memory:end -->/;

export interface SyncTarget {
  id: string;
  name: string;
  /** 工具目录，相对用户目录；不存在就是没装 */
  root: string;
  /** 规则文件，相对工具目录 */
  file: string;
  /** 支持 `@路径` 引入文件的工具，标记块里写引用而不是内联：只有一份，不会漂 */
  imports?: boolean;
}

export const SYNC_TARGETS: SyncTarget[] = [
  { id: 'claude-code', name: 'Claude Code', root: '.claude', file: 'CLAUDE.md', imports: true },
  { id: 'codex', name: 'Codex', root: '.codex', file: 'AGENTS.md' },
  // Gemini CLI 文档说也支持 @ 引入，本机没法实测，先内联
  { id: 'gemini', name: 'Gemini', root: '.gemini', file: 'GEMINI.md' },
  { id: 'hermes', name: 'Hermes', root: '.hermes', file: 'SOUL.md' },
  { id: 'opencode', name: 'OpenCode', root: path.join('.config', 'opencode'), file: 'AGENTS.md' },
  { id: 'windsurf', name: 'Windsurf', root: path.join('.codeium', 'windsurf'), file: path.join('memories', 'global_rules.md') },
];

export type SyncStatus = 'current' | 'update' | 'insert' | 'create' | 'not-installed';

export interface SyncRow {
  id: string;
  name: string;
  path: string;
  status: SyncStatus;
  /** 规则文件里自己已经有一节「我是谁」：再加一块就是两份，交给用户决定 */
  hasOwnIdentity: boolean;
  block: string;
}

export interface SyncPlan {
  /** 记忆库里有没有「我是谁」：没有就什么都不写 */
  ready: boolean;
  rows: SyncRow[];
}

const OWN_IDENTITY = /^#{1,3}\s*(我是谁|关于我|about me)\s*$/im;

/** 标记块：内联「我是谁」（或者用 @ 引用它），再指一句开工先读哪里 */
export function buildBlock(memoryDir: string, identity: string, imports: boolean): string {
  const lines = identity.split('\n').filter((l) => !/^#\s/.test(l)).join('\n').trim();
  const who = imports ? `@${path.join(memoryDir, '我是谁.md')}` : `## 我是谁\n${lines}`;
  return `${BLOCK_START}\n${who}\n\n开工先读 ${path.join(memoryDir, 'README.md')}，按它说的读「工作方式」和手上任务对应的那篇；手上的事在笔记库的「项目」里。\n${BLOCK_END}`;
}

/** 把块放进文件内容：有旧块换掉，没有就接在末尾 */
export function placeBlock(content: string, block: string): string {
  if (BLOCK_RE.test(content)) return content.replace(BLOCK_RE, block);
  const body = content.replace(/\s+$/, '');
  return body ? `${body}\n\n${block}\n` : `${block}\n`;
}

export async function planSync(library: string, home: string): Promise<SyncPlan> {
  const memoryDir = memoryDirOf(library);
  const identity = await fs.promises.readFile(path.join(memoryDir, '我是谁.md'), 'utf8').catch(() => '');
  const ready = identity.split('\n').some((l) => /^\s*-\s+\S/.test(l));
  const rows: SyncRow[] = [];
  for (const t of SYNC_TARGETS) {
    const root = path.join(home, t.root);
    const file = path.join(root, t.file);
    const block = buildBlock(memoryDir, identity, !!t.imports);
    if (!fs.existsSync(root)) { rows.push({ id: t.id, name: t.name, path: file, status: 'not-installed', hasOwnIdentity: false, block }); continue; }
    const content = await fs.promises.readFile(file, 'utf8').catch(() => null);
    const outside = content === null ? '' : content.replace(BLOCK_RE, '');
    const status: SyncStatus = content === null ? 'create' : !BLOCK_RE.test(content) ? 'insert' : content.match(BLOCK_RE)![0] === block ? 'current' : 'update';
    rows.push({ id: t.id, name: t.name, path: file, status, hasOwnIdentity: OWN_IDENTITY.test(outside), block });
  }
  return { ready, rows };
}

/** 写选中的那几个：先整份备份到 记忆/.备份/日期/，再只改标记块 */
export async function applySync(library: string, home: string, ids: string[], date = new Date().toISOString().slice(0, 10)): Promise<{ written: string[]; backups: string[] }> {
  const plan = await planSync(library, home);
  if (!plan.ready) return { written: [], backups: [] };
  const backupDir = path.join(memoryDirOf(library), '.备份', date);
  const written: string[] = [];
  const backups: string[] = [];
  for (const row of plan.rows) {
    if (!ids.includes(row.id) || row.status === 'current' || row.status === 'not-installed') continue;
    const content = await fs.promises.readFile(row.path, 'utf8').catch(() => null);
    if (content !== null) {
      await fs.promises.mkdir(backupDir, { recursive: true });
      const target = path.join(backupDir, `${row.id}-${path.basename(row.path)}`);
      // 同一天备份过就不再覆盖：留下的是当天第一次改之前的样子
      if (!fs.existsSync(target)) { await fs.promises.writeFile(target, content, 'utf8'); backups.push(target); }
    }
    await fs.promises.mkdir(path.dirname(row.path), { recursive: true });
    await fs.promises.writeFile(row.path, placeBlock(content ?? '', row.block), 'utf8');
    written.push(row.path);
  }
  return { written, backups };
}
