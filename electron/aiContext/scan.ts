import fs from 'fs';
import path from 'path';
import { CLOUD_APPS, LOCAL_TOOLS, appDataDir, type ToolSpec } from './tools';

export interface ContextFile {
  path: string;
  /** 给人看的名字：相对工具目录 */
  name: string;
  bytes: number;
  modifiedAt: number;
  /** 记忆属于哪个项目：记忆目录下面那一级目录的名字，Claude 的会还原成可读的路径 */
  project?: string;
}

export interface ToolContext {
  id: string;
  name: string;
  /** 全局规则里写没写「用户是谁」 */
  knowsUser: boolean;
  identity: ContextFile[];
  memory: ContextFile[];
  skills: number;
  /** 这个工具的上下文最后一次变动的时间 */
  updatedAt: number | null;
}

export interface ContextScan {
  tools: ToolContext[];
  /** 装了，但上下文不在本机文件里 */
  cloud: string[];
}

export interface ContextHit {
  tool: string;
  file: ContextFile;
  snippet: string;
}

/** 只看表里列的目录，所以这里只防意外：单个工具最多收这么多文件，太大的文件不读 */
const MAX_FILES = 3000;
const MAX_READ_SIZE = 2 * 1024 * 1024;
const SKIP_DIRS = new Set(['node_modules', '.git', 'cache', 'plugins']);
const SNIPPET_RADIUS = 40;

/** 全局规则里说到用户本人的写法：「我是谁」这样的小节、USER.md 的「About Your Human」 */
const ABOUT_USER = /我是谁|关于我|用户(?:是|画像|信息|资料)|about (?:me|your human|the user)|who (?:am i|i am)|^\s*#+\s*(?:user|profile)\b/im;

/** Claude 的记忆目录名是把路径里的斜杠和中文换成横线：`-Users-x-Personal-MBA---` → `Personal / MBA` */
export function projectLabel(segment: string): string {
  if (!segment.startsWith('-')) return segment;
  const parts = segment.replace(/^-Users-[^-]+-|^-home-[^-]+-/, '').split('-').filter(Boolean);
  return parts.join(' / ') || segment;
}

/**
 * Claude 把项目路径里每个不是字母数字的字符都换成「-」当目录名，中文和空格都丢了。
 * 照着磁盘往下找：每一层挑编码后能接上的子目录，接不上就回退。找到了返回相对用户目录的真实路径
 */
export function decodeClaudeProject(segment: string, home: string, cache = new Map<string, string[]>()): string | null {
  const encode = (name: string) => '-' + name.replace(/[^a-zA-Z0-9]/g, '-');
  const children = (dir: string) => {
    if (!cache.has(dir)) {
      let names: string[] = [];
      try {
        // 软链接到目录的也算：~/imoling.git 这类常是链过去的
        names = fs.readdirSync(dir, { withFileTypes: true })
          .filter((e) => e.isDirectory() || (e.isSymbolicLink() && (() => { try { return fs.statSync(path.join(dir, e.name)).isDirectory(); } catch { return false; } })()))
          .map((e) => e.name);
      } catch { names = []; }
      cache.set(dir, names);
    }
    return cache.get(dir)!;
  };
  const walk = (dir: string, rest: string, depth: number): string | null => {
    if (rest === '') return dir;
    if (depth > 12) return null;
    // 长的名字先试：「MBA 作业」和「MBA」同时存在时，编码更长的那个才可能是对的
    for (const name of [...children(dir)].sort((a, b) => b.length - a.length)) {
      const enc = encode(name);
      if (rest === enc || (rest.startsWith(enc) && rest[enc.length] === '-')) {
        const hit = walk(path.join(dir, name), rest.slice(enc.length), depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };
  const root = path.parse(home).root;
  const found = walk(root, segment, 0);
  if (!found) return null;
  const rel = path.relative(home, found);
  return rel === '' ? '~' : rel.startsWith('..') ? found : rel.split(path.sep).join(' / ');
}

/** 记忆文件在哪个项目下：相对工具目录的路径里，记忆根目录后面那一级；直接放在根下的没有项目 */
function projectOf(rel: string, spec: ToolSpec, home: string, cache: Map<string, string[]>): string | undefined {
  for (const { dir } of spec.memory ?? []) {
    const prefix = dir.split(/[\\/]/).join(path.sep) + path.sep;
    if (!rel.startsWith(prefix)) continue;
    const segs = rel.slice(prefix.length).split(/[\\/]/);
    if (segs.length < 2) return undefined;
    return (spec.id === 'claude-code' ? decodeClaudeProject(segs[0], home, cache) : null) ?? projectLabel(segs[0]);
  }
  return undefined;
}

async function statFile(full: string, root: string): Promise<ContextFile | null> {
  try {
    const stat = await fs.promises.stat(full);
    if (!stat.isFile()) return null;
    return { path: full, name: path.relative(root, full), bytes: stat.size, modifiedAt: stat.mtimeMs };
  } catch {
    return null;
  }
}

async function walk(dir: string, depth: number, visit: (file: string) => void | boolean): Promise<void> {
  let entries: fs.Dirent[];
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue; // 隐藏目录和 _backup 这类备份不算
    const full = path.join(dir, entry.name);
    // 技能常是软链接：跟过去看。层数有上限，绕成环也走不远
    const stat = entry.isSymbolicLink() ? await fs.promises.stat(full).catch(() => null) : entry;
    if (stat?.isDirectory()) {
      if (depth > 1 && !SKIP_DIRS.has(entry.name)) await walk(full, depth - 1, visit);
    } else if (stat?.isFile() && visit(full) === false) {
      return;
    }
  }
}

async function scanTool(spec: ToolSpec, home: string): Promise<ToolContext | null> {
  const root = path.join(home, spec.root);
  if (!fs.existsSync(root)) return null;

  const identity = (await Promise.all(spec.identity.map((rel) => statFile(path.join(root, rel), root)))).filter((f): f is ContextFile => !!f);
  const seen = new Set(identity.map((f) => f.path));

  const memoryPaths: string[] = [];
  for (const { dir, depth, keep } of spec.memory ?? []) {
    await walk(path.join(root, dir), depth, (file) => {
      if (memoryPaths.length >= MAX_FILES) return false;
      if (/\.md$/i.test(file) && !seen.has(file) && (!keep || keep(path.relative(root, file)))) memoryPaths.push(file);
    });
  }
  const memory = (await Promise.all(memoryPaths.map((file) => statFile(file, root)))).filter((f): f is ContextFile => !!f);
  const dirCache = new Map<string, string[]>();
  for (const file of memory) file.project = projectOf(file.name, spec, home, dirCache);

  let skills = 0;
  if (spec.skills) await walk(path.join(root, spec.skills.dir), spec.skills.depth, (file) => { if (path.basename(file) === 'SKILL.md') skills++; });

  let knowsUser = false;
  for (const file of identity) {
    if (file.bytes > MAX_READ_SIZE) continue;
    const text = await fs.promises.readFile(file.path, 'utf8').catch(() => '');
    if (ABOUT_USER.test(text)) knowsUser = true;
  }
  const times = [...identity, ...memory].map((f) => f.modifiedAt);
  memory.sort((a, b) => b.modifiedAt - a.modifiedAt);
  return { id: spec.id, name: spec.name, knowsUser, identity, memory, skills, updatedAt: times.length ? Math.max(...times) : null };
}

/** 扫一遍本机：只读表里列的路径，登录凭证、会话记录、数据库一律不碰 */
export async function scanAiContext(home: string, platform: NodeJS.Platform): Promise<ContextScan> {
  const tools = (await Promise.all(LOCAL_TOOLS.map((spec) => scanTool(spec, home)))).filter((t): t is ToolContext => !!t);
  const appData = appDataDir(home, platform);
  return { tools, cloud: CLOUD_APPS.filter((app) => fs.existsSync(path.join(appData, app.dir))).map((app) => app.name) };
}

const allFiles = (scan: ContextScan) => scan.tools.flatMap((tool) => [...tool.identity, ...tool.memory].map((file) => ({ tool: tool.name, file })));

/** 扫出来的全部文件及各自属于哪个工具：上下文索引按这份清单建 */
export const contextFiles = (scan: ContextScan): { tool: string; file: ContextFile }[] => allFiles(scan);

/** 这个路径是不是扫出来的文件：界面只能读这些，别的路径一律不开 */
export const isScanned = (scan: ContextScan, file: string) => allFiles(scan).some((f) => f.file.path === file);

export async function readContextFile(scan: ContextScan, file: string): Promise<string | null> {
  if (!isScanned(scan, file)) return null;
  const stat = await fs.promises.stat(file).catch(() => null);
  if (!stat || stat.size > MAX_READ_SIZE) return null;
  return fs.promises.readFile(file, 'utf8').catch(() => null);
}

/** 在身份和记忆里找一个词，最多给 limit 条 */
export async function searchContext(scan: ContextScan, query: string, limit = 50): Promise<ContextHit[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: ContextHit[] = [];
  for (const { tool, file } of allFiles(scan)) {
    if (hits.length >= limit) break;
    const text = file.bytes > MAX_READ_SIZE ? '' : await fs.promises.readFile(file.path, 'utf8').catch(() => '');
    const at = text.toLowerCase().indexOf(needle);
    if (at === -1) continue;
    const snippet = text.slice(Math.max(0, at - SNIPPET_RADIUS), at + needle.length + SNIPPET_RADIUS).replace(/\s+/g, ' ').trim();
    hits.push({ tool, file, snippet });
  }
  return hits;
}
