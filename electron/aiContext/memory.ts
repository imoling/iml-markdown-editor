import fs from 'fs';
import path from 'path';

/**
 * 记忆库：笔记库里的「记忆」目录。一个领域一篇，纯 Markdown 列表，一条规矩一行，括号里是日期和来源。
 * 任何 AI 工具都能读；工具只往里追加，不删不改已有的行。
 */
export const MEMORY_DIR = '记忆';
/** 这两篇永远排在前面：换工具时先读的就是它们 */
const FIRST = ['我是谁', '工作方式'];
/** 开头几行里写了这个词的笔记不进导出合集 */
const LOCAL_ONLY = '仅本机';
const NOTE_RE = /\.md$/i;

export interface MemoryFile {
  path: string;
  /** 文件名去掉 .md，就是领域名 */
  name: string;
  lines: number;
  /** 标了「仅本机」：不带到云端对话里 */
  localOnly: boolean;
  modifiedAt: number;
}

export interface MemoryState {
  dir: string;
  exists: boolean;
  files: MemoryFile[];
}

export const memoryDirOf = (library: string) => path.join(library, MEMORY_DIR);

const byOrder = (a: MemoryFile, b: MemoryFile) => {
  const ia = FIRST.indexOf(a.name);
  const ib = FIRST.indexOf(b.name);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? FIRST.length : ia) - (ib === -1 ? FIRST.length : ib);
  return a.name.localeCompare(b.name, 'zh-Hans-CN');
};

const LOCAL_ONLY_RE = new RegExp(`^${LOCAL_ONLY}[：:]`);
const isLocalOnly = (text: string) => text.split('\n').slice(0, 5).some((line) => line.trim() === LOCAL_ONLY || LOCAL_ONLY_RE.test(line.trim()));

/** 读记忆目录：README 不算领域，隐藏文件（备份、导出、采集记录）不算 */
export async function readMemoryState(library: string): Promise<MemoryState> {
  const dir = memoryDirOf(library);
  let entries: fs.Dirent[] = [];
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return { dir, exists: false, files: [] }; }
  const files: MemoryFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !NOTE_RE.test(entry.name) || entry.name.startsWith('.') || /^readme\.md$/i.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    try {
      const [text, stat] = await Promise.all([fs.promises.readFile(full, 'utf8'), fs.promises.stat(full)]);
      files.push({ path: full, name: entry.name.replace(NOTE_RE, ''), lines: text.split('\n').filter((l) => l.trim()).length, localOnly: isLocalOnly(text), modifiedAt: stat.mtimeMs });
    } catch { /* 读不到的跳过 */ }
  }
  return { dir, exists: true, files: files.sort(byOrder) };
}

const README = `# 记忆

给任何 AI 工具读的工作记忆，与工具无关，纯 Markdown。开工先读「我是谁」和「工作方式」，其余按手上的任务挑着读。

- 一条规矩一行，括号里是日期和来源，方便回头核对
- 工具往这里只追加，不改不删已有的行；要删由人来删
- 某一篇开头写了「仅本机」的，不要带到云端对话里
- 具体项目的现状和坑不在这里，看各项目自己的笔记和记忆
`;

/** 建立记忆库：目录和 README。不放空壳笔记：只有一个「-」的我是谁看着像坏了，内容从提炼里来 */
export async function createMemoryDir(library: string): Promise<MemoryState> {
  const dir = memoryDirOf(library);
  await fs.promises.mkdir(dir, { recursive: true });
  const readme = path.join(dir, 'README.md');
  if (!fs.existsSync(readme)) await fs.promises.writeFile(readme, README, 'utf8');
  return readMemoryState(library);
}

/** 往某一篇末尾追加几行；没有这篇就新建，标题就是领域名 */
export async function appendMemoryLines(library: string, domain: string, lines: string[]): Promise<string> {
  const dir = memoryDirOf(library);
  await fs.promises.mkdir(dir, { recursive: true });
  const safe = domain.replace(/[\\/:*?"<>|]/g, '').trim() || '工作方式';
  const full = path.join(dir, `${safe}.md`);
  let text = '';
  try { text = await fs.promises.readFile(full, 'utf8'); } catch { text = `# ${safe}\n\n`; }
  if (text.length && !text.endsWith('\n')) text += '\n';
  await fs.promises.writeFile(full, text + lines.map((l) => (l.startsWith('- ') ? l : `- ${l}`)).join('\n') + '\n', 'utf8');
  // 一条可以带缩进的子行（「  - 为什么：…」），整条作为一个条目追加
  return full;
}

export interface BundleOptions {
  /** 只要这几篇（领域名）；不传就是全部不标「仅本机」的 */
  names?: string[];
  date?: string;
}

/** 合集：给读不到文件的对话贴的那一份，也是 iml memory 打印的那一份。一处生成 */
export async function buildMemoryBundle(library: string, options: BundleOptions = {}): Promise<{ text: string; files: MemoryFile[] }> {
  const state = await readMemoryState(library);
  const picked = state.files.filter((f) => (options.names ? options.names.includes(f.name) : !f.localOnly));
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  const parts: string[] = [];
  for (const f of picked) {
    const text = (await fs.promises.readFile(f.path, 'utf8').catch(() => '')).trim();
    if (text) parts.push(text);
  }
  const head = `# 我的工作记忆（合集，${date}）\n\n下面是我在各个 AI 工具里攒下来的身份和规矩，读完照着做；有冲突以我当场说的为准。\n\n`;
  return { text: parts.length ? head + parts.join('\n\n') + '\n' : '', files: picked };
}
