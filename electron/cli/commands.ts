import fs from 'fs';
import os from 'os';
import path from 'path';
import { SearchIndex } from '../searchIndex';
import { dueBucket, type DueBucket } from '../shared/tasks';
import { scanAiContext, type ContextScan } from '../aiContext/scan';
import { buildMemoryBundle } from '../aiContext/memory';
import { harvestMemories } from '../aiContext/harvest';

export interface CliResult { code: number; out: string; err: string }
interface CliEnv { userData: string; home?: string; platform?: NodeJS.Platform; now?: Date; env?: NodeJS.ProcessEnv }

interface TaskLine { due: string | null; text: string; done: boolean; note: string; path: string; line: number; bucket: DueBucket | null }

export const CLI_HELP = `iml：读笔记库和本机 AI 上下文，只读，不改任何文件

  iml today                 逾期和今天到期的待办；没有就什么都不输出
  iml tasks                 全库待办
    --due today|overdue|week|all   只看这个范围（today 含逾期，week 是 7 天内含逾期）
    --done                  带上已完成的
  iml context               本机 AI 工具的身份、记忆、技能概况
  iml memory                记忆库合集：我是谁、工作方式和各领域的规矩，换了工具让它先读这个
    --domain 篇名           只打一篇
  iml memory harvest        各工具里有、记忆库里还没有的条目（只列，不写）

  --json                    输出 JSON
  --library <路径>          指定笔记库；不写用编辑器当前的，也可以设 IML_LIBRARY
`;

const localDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function parse(args: string[]) {
  const flags = new Map<string, string | true>();
  const words: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) { words.push(a); continue; }
    const next = args[i + 1];
    if (a === '--json' || a === '--done' || a === '--help') flags.set(a, true);
    else if (next !== undefined && !next.startsWith('--')) { flags.set(a, next); i++; }
    else flags.set(a, true);
  }
  return { words, flags };
}

/** 用哪个笔记库：命令行参数 > 环境变量 > 编辑器设置 */
function resolveLibrary(flag: string | true | undefined, env: NodeJS.ProcessEnv, userData: string): string | null {
  if (typeof flag === 'string') return flag;
  if (env.IML_LIBRARY) return env.IML_LIBRARY;
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(userData, 'app-settings.json'), 'utf8'));
    return typeof settings.defaultLibraryPath === 'string' && settings.defaultLibraryPath ? settings.defaultLibraryPath : null;
  } catch {
    return null;
  }
}

async function readTasks(root: string, includeDone: boolean, today: string): Promise<TaskLine[]> {
  const index = new SearchIndex();
  await index.build(root);
  return index.listTasks(includeDone).flatMap((note) => note.tasks.map((task) => ({
    due: task.due,
    text: task.text,
    done: task.done,
    note: path.relative(root, note.path).split(path.sep).join('/'),
    path: note.path,
    line: task.line + 1,
    bucket: task.due ? dueBucket(task.due, today) : null,
  })));
}

const byDue = (a: TaskLine, b: TaskLine) => (a.due ?? '9999').localeCompare(b.due ?? '9999');
const taskRow = (t: TaskLine) => `- ${t.done ? '[x] ' : ''}${t.due ? `${t.due} ` : ''}${t.text}（${t.note}:${t.line}）`;
const isDue = (t: TaskLine) => !t.done && (t.bucket === 'overdue' || t.bucket === 'today');

function formatToday(tasks: TaskLine[]): string {
  if (tasks.length === 0) return '';
  const overdue = tasks.filter((t) => t.bucket === 'overdue').length;
  const counts = [overdue && `逾期 ${overdue} 件`, tasks.length - overdue && `今天 ${tasks.length - overdue} 件`].filter(Boolean).join('，');
  return `${counts}\n${tasks.map(taskRow).join('\n')}\n`;
}

function formatContext(scan: ContextScan): string {
  if (scan.tools.length === 0 && scan.cloud.length === 0) return '没有找到本机 AI 工具\n';
  const rows = scan.tools.map((t) => {
    const updated = t.updatedAt ? localDate(new Date(t.updatedAt)) : '无';
    return `- ${t.name}：${t.knowsUser ? '写了你是谁' : '没写你是谁'}；身份文件 ${t.identity.length} 个，记忆 ${t.memory.length} 条，技能 ${t.skills} 个，最后改动 ${updated}`;
  });
  if (scan.cloud.length) rows.push(`- 上下文在云端，本机读不到：${scan.cloud.join('、')}`);
  return `${rows.join('\n')}\n`;
}

export async function runCli(args: string[], ctx: CliEnv): Promise<CliResult> {
  const { words, flags } = parse(args);
  const [command] = words;
  const json = flags.has('--json');
  const today = localDate(ctx.now ?? new Date());
  if (!command || command === 'help' || flags.has('--help')) return { code: 0, out: CLI_HELP, err: '' };

  if (command === 'context') {
    const scan = await scanAiContext(ctx.home ?? os.homedir(), ctx.platform ?? process.platform);
    return { code: 0, out: json ? `${JSON.stringify(scan, null, 2)}\n` : formatContext(scan), err: '' };
  }
  if (command !== 'today' && command !== 'tasks' && command !== 'memory') return { code: 2, out: '', err: `不认识的命令：${command}\n\n${CLI_HELP}` };

  const due = flags.get('--due');
  if (due !== undefined && !['today', 'overdue', 'week', 'all'].includes(String(due))) return { code: 2, out: '', err: `--due 只能是 today、overdue、week、all\n` };
  const root = resolveLibrary(flags.get('--library'), ctx.env ?? process.env, ctx.userData);
  if (!root) return { code: 1, out: '', err: '找不到笔记库：用 --library 指定，或先在编辑器里打开一个\n' };
  if (!fs.existsSync(root)) return { code: 1, out: '', err: `笔记库不存在：${root}\n` };

  if (command === 'memory') {
    if (words[1] === 'harvest') {
      const scan = await scanAiContext(ctx.home ?? os.homedir(), ctx.platform ?? process.platform);
      const { candidates } = await harvestMemories(root, scan);
      if (json) return { code: 0, out: `${JSON.stringify({ library: root, candidates }, null, 2)}\n`, err: '' };
      return { code: 0, out: candidates.length ? `${candidates.map((c) => `- [${c.domain}] ${c.text}（${[c.date, [c.tool, c.project].filter(Boolean).join(' / ')].filter(Boolean).join('，')}）`).join('\n')}\n` : '没有新的条目\n', err: '' };
    }
    if (words[1]) return { code: 2, out: '', err: `memory 后面只能跟 harvest\n` };
    const domain = flags.get('--domain');
    const { text, files } = await buildMemoryBundle(root, typeof domain === 'string' ? { names: [domain], date: today } : { date: today });
    if (typeof domain === 'string' && files.length === 0) return { code: 1, out: '', err: `记忆库里没有「${domain}」这篇\n` };
    if (!text) return { code: 1, out: '', err: `记忆库是空的：${root}/记忆\n` };
    if (json) return { code: 0, out: `${JSON.stringify({ library: root, files: files.map((f) => f.name), text }, null, 2)}\n`, err: '' };
    return { code: 0, out: text, err: '' };
  }

  const tasks = (await readTasks(root, flags.has('--done'), today)).sort(byDue);
  if (command === 'today') {
    const dueNow = tasks.filter(isDue);
    return { code: 0, out: json ? `${JSON.stringify({ date: today, tasks: dueNow }, null, 2)}\n` : formatToday(dueNow), err: '' };
  }
  const picked = tasks.filter((t) => {
    if (due === 'overdue') return t.bucket === 'overdue';
    if (due === 'today') return t.bucket === 'overdue' || t.bucket === 'today';
    if (due === 'week') return t.bucket !== null && t.bucket !== 'later';
    return true;
  });
  if (json) return { code: 0, out: `${JSON.stringify({ date: today, tasks: picked }, null, 2)}\n`, err: '' };
  return { code: 0, out: picked.length ? `${picked.map(taskRow).join('\n')}\n` : '没有待办\n', err: '' };
}
