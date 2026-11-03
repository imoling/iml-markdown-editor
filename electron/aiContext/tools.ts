import path from 'path';

/** 本机文件里存着上下文的 AI 工具。加一个工具只是在这张表里加一行；路径都相对用户目录 */
export interface ToolSpec {
  id: string;
  name: string;
  root: string;
  /** 全局规则和身份文件，相对 root */
  identity: string[];
  /** 记忆：相对 root 的目录，只收 .md，keep 进一步筛相对 root 的路径 */
  memory?: { dir: string; depth: number; keep?: (rel: string) => boolean }[];
  /** 技能：目录下面每个 SKILL.md 算一个 */
  skills?: { dir: string; depth: number };
}

export const LOCAL_TOOLS: ToolSpec[] = [
  {
    id: 'claude-code', name: 'Claude Code', root: '.claude',
    identity: ['CLAUDE.md'],
    memory: [{ dir: 'projects', depth: 3, keep: (rel) => /[\\/]memory[\\/][^\\/]+\.md$/.test(rel) && !/MEMORY\.md$/.test(rel) }],
    skills: { dir: 'skills', depth: 4 },
  },
  {
    id: 'codex', name: 'Codex', root: '.codex',
    identity: ['AGENTS.md'],
    memory: [{ dir: 'memories', depth: 3 }],
    skills: { dir: 'skills', depth: 3 },
  },
  {
    id: 'gemini', name: 'Gemini', root: '.gemini',
    identity: ['GEMINI.md'],
    memory: [{ dir: 'antigravity', depth: 4 }],
  },
  {
    id: 'hermes', name: 'Hermes', root: '.hermes',
    identity: ['SOUL.md'],
    memory: [{ dir: 'memories', depth: 2 }, { dir: 'profiles', depth: 3, keep: (rel) => /[\\/]memories[\\/][^\\/]+\.md$/.test(rel) }],
    skills: { dir: 'skills', depth: 4 },
  },
  {
    id: 'workbuddy', name: 'WorkBuddy', root: '.workbuddy',
    identity: ['USER.md', 'IDENTITY.md', 'SOUL.md'],
    memory: [{ dir: 'memory', depth: 3 }],
    skills: { dir: 'skills', depth: 3 },
  },
  {
    id: 'windsurf', name: 'Windsurf', root: path.join('.codeium', 'windsurf'),
    identity: [path.join('memories', 'global_rules.md')],
    memory: [{ dir: 'memories', depth: 2 }],
  },
  {
    id: 'opencode', name: 'OpenCode', root: path.join('.config', 'opencode'),
    identity: ['AGENTS.md'],
  },
];

/** 上下文存在云端或应用内部的：只能说装了，读不到内容 */
export const CLOUD_APPS: { name: string; dir: string }[] = [
  { name: '豆包', dir: 'Doubao' },
  { name: 'Kimi', dir: 'Kimi' },
  { name: 'ChatGPT', dir: 'ChatGPT' },
  { name: 'Claude 桌面版', dir: 'Claude' },
];

/** 系统放应用数据的地方 */
export function appDataDir(home: string, platform: NodeJS.Platform): string {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support');
  if (platform === 'win32') return path.join(home, 'AppData', 'Roaming');
  return path.join(home, '.config');
}
