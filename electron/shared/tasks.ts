/**
 * 笔记里的待办（`- [ ] …`）：解析与勾选。纯函数，主进程（索引）与渲染进程（待办面板）共用。
 * 日期认 Obsidian 两种通行写法：Tasks 插件的 `📅 2026-09-25` 和 Dataview 的 `[due:: 2026-09-25]`——搬过来的库直接能用。
 */
import { splitFrontmatter } from './noteMeta';

export interface NoteTask {
  /** 在整份文件里的行号，从 0 开始 */
  line: number;
  /** 方括号后面的原文：勾选时用它核对「还是不是那一行」 */
  raw: string;
  /** 给人看的文字：去掉了日期记号和块标记 */
  text: string;
  done: boolean;
  /** 缩进层级，0 是顶层（子任务往里缩） */
  depth: number;
  /** 到期日 YYYY-MM-DD；没写是 null */
  due: string | null;
}

/** 可选的引用前缀（提示块里的待办）+ 缩进 + 列表符号 + [ ] / [x] */
const TASK_RE = /^((?:\s*>)*)(\s*)(?:[-*+]|\d+[.)])\s+\[( |x|X)\]\s+(.*)$/;
const DATE = '(\\d{4}-\\d{2}-\\d{2})';
const DUE_RE = new RegExp(`📅\\s*${DATE}|[[(]due::\\s*${DATE}[\\])]`);
/** Tasks 插件的各种日期记号（到期 / 计划 / 开始 / 完成 / 创建）和 Dataview 的行内字段：显示时都拿掉 */
const FIELD_RE = new RegExp(`\\s*(?:[📅⏳🛫✅➕]\\s*${DATE}|[[(](?:due|scheduled|start|completion|created)::[^\\])]*[\\])])`, 'gu');

/** 面板里只显示字：加粗、斜体、删除线、高亮、行内代码的记号拿掉，链接只留显示的那部分 */
const plainInline = (s: string) => s
  .replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  .replace(/!?\[\[([^\]]+)\]\]/g, '$1')
  .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/(\*\*|__|~~|==)(.+?)\1/g, '$2')
  .replace(/(^|[^\w*])[*_]([^*_\s][^*_]*?)[*_](?![\w*])/g, '$1$2')
  .replace(/`([^`]+)`/g, '$1');

const isRealDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
};

function parseLine(line: string): { done: boolean; raw: string; depth: number } | null {
  const m = TASK_RE.exec(line.replace(/\r$/, ''));
  if (!m || !m[4].trim()) return null; // 模板里常见的空待办 `- [ ] ` 不算
  return { done: m[3] !== ' ', raw: m[4], depth: Math.floor(m[2].replace(/\t/g, '  ').length / 2) };
}

export function extractTasks(markdown: string): NoteTask[] {
  const source = markdown || '';
  if (!source.includes('[')) return [];
  const skip = splitFrontmatter(source).lineOffset;
  const out: NoteTask[] = [];
  let fence: string | null = null;
  source.split('\n').forEach((line, index) => {
    if (index < skip) return;
    const f = /^\s*(?:>\s*)*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence) return;
    const t = parseLine(line);
    if (!t) return;
    const dueMatch = DUE_RE.exec(t.raw);
    const due = dueMatch ? dueMatch[1] || dueMatch[2] : null;
    const text = plainInline(t.raw.replace(FIELD_RE, '').replace(/\s+\^[A-Za-z0-9-]+\s*$/, '')).trim();
    out.push({ line: index, raw: t.raw, text: text || t.raw.trim(), done: t.done, depth: t.depth, due: due && isRealDate(due) ? due : null });
  });
  return out;
}

/**
 * 把一条待办勾上 / 取消。行号是索引给的，那篇之后可能又被改过：
 * 先看那一行还是不是它；不是的话全篇找「同样的文字、同样的勾选状态」——恰好一条就改它，没有或不止一条就返回 null，什么都不动。
 */
export function toggleTaskLine(content: string, task: Pick<NoteTask, 'line' | 'raw' | 'done'>, done: boolean): string | null {
  const lines = content.split('\n');
  const matches = (i: number) => {
    const t = lines[i] === undefined ? null : parseLine(lines[i]);
    return !!t && t.raw === task.raw && t.done === task.done;
  };
  let at = matches(task.line) ? task.line : -1;
  if (at === -1) {
    const found = lines.map((_, i) => i).filter(matches);
    if (found.length !== 1) return null;
    at = found[0];
  }
  if (task.done === done) return content;
  lines[at] = lines[at].replace(/\[( |x|X)\]/, done ? '[x]' : '[ ]');
  return lines.join('\n');
}

export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

/** 到期日相对今天落在哪一段（today 是 YYYY-MM-DD）。「本周」指接下来 7 天内 */
/** 没做完的待办里，逾期和今天到期的各有几件 */
export function countDue(notes: { tasks: { done: boolean; due: string | null }[] }[], today: string): { overdue: number; due: number } {
  let overdue = 0;
  let due = 0;
  for (const note of notes) {
    for (const task of note.tasks) {
      if (task.done || !task.due) continue;
      if (task.due < today) overdue++;
      else if (task.due === today) due++;
    }
  }
  return { overdue, due };
}

export const dueNotice = (overdue: number, due: number) =>
  [due > 0 && `今天 ${due} 件到期`, overdue > 0 && `逾期 ${overdue} 件`].filter(Boolean).join('，');

export function dueBucket(due: string, today: string): DueBucket {
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  const [y, m, d] = today.split('-').map(Number);
  const key = (offset: number) => { const t = new Date(y, m - 1, d + offset); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  if (due === key(1)) return 'tomorrow';
  return due <= key(7) ? 'week' : 'later';
}
