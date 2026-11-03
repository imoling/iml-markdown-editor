import fs from 'fs';
import path from 'path';
import { splitFrontmatter } from '../shared/noteMeta';
import { appendMemoryLines, memoryDirOf, readMemoryState } from './memory';
import type { ContextScan } from './scan';

/**
 * 提炼：从各工具的记忆里采出「用户是谁」和「怎么跟用户合作」这类条目，列给人勾选，勾上的追加到记忆库。
 * 不用模型：去重只看整行是不是已经在记忆库里；说同一件事但措辞不同的，这一版认不出来。
 */
export interface MemoryCandidate {
  /** 来源文件 + 内容的指纹：文件改了就算新的一条 */
  id: string;
  /** 规矩本身，一句话；用户追加前可以改 */
  text: string;
  /** 为什么：原记忆里的理由，追加时写成下一行的「为什么」，新工具才推得到没见过的情况 */
  why: string;
  /** 含家人、证件、联系方式这类个人信息：默认不勾，提醒用户 */
  sensitive: boolean;
  /** 同一句在别的项目里也记过：合并成一条，这里是另外那几处的来源 */
  alsoIn: string[];
  tool: string;
  project: string;
  /** YYYY-MM-DD，拿不到就是空 */
  date: string;
  file: string;
  /** 推断的领域（记忆库里的篇名），用户可以改 */
  domain: string;
  /** 这条是「我是谁」还是「怎么合作」 */
  kind: 'user' | 'feedback';
}

export interface HarvestResult {
  candidates: MemoryCandidate[];
  /** 记忆库里现有的篇名，给下拉框用 */
  domains: string[];
}

interface Ledger { handled: Record<string, { at: string; domain?: string }> }

const LEDGER = '.采集记录.json';
const FRONT_TYPE = /^\s*type:\s*["']?(user|feedback)["']?\s*$/m;
const FRONT_DESC = /^description:\s*(.+?)\s*$/m;
const FRONT_MODIFIED = /^\s*modified:\s*["']?(\d{4}-\d{2}-\d{2})/m;
/** 摘要句是写来方便检索的，有的在描述记忆本身（「用户对…的偏好」），不是规矩 */
const META_DESC = /^(用户(对|的|会|习惯|要求|在|反感|明确)|关于|How |What |When |The user|User'?s? |User (asked|wants|prefers|keeps))/i;
/** 不该随便带到别处的个人信息：家人、学校、证件、联系方式、收入 */
const SENSITIVE = /女儿|儿子|孩子|家人|妻子|老婆|丈夫|老公|父母|小学|中学|学校|年级|班级|工号|手机|电话|身份证|证件|护照|住址|家庭住址|生日|出生|薪资|工资|收入|存款|股票|病|[\w.+-]+@[\w-]+\.[\w.]+|1[3-9]\d{9}/;

/** 取第一句：到句号、分号或换行为止，太长的截在逗号上 */
export function firstSentence(text: string, max = 120): string {
  const flat = text.replace(/\*\*/g, '').replace(/`/g, '').replace(/\s*\n\s*/g, ' ').trim();
  const end = flat.search(/[。；!?！？]|\.\s/);
  let out = end === -1 ? flat : flat.slice(0, end + 1);
  if (out.length > max) {
    const cut = out.slice(0, max).lastIndexOf('，');
    out = (cut > 20 ? out.slice(0, cut) : out.slice(0, max)) + '…';
  }
  return out.replace(/[。；]$/, '').trim();
}

/** 正文里带标签的一段：**Why:** / **How to apply:** */
function labeled(body: string, label: string): string {
  const m = body.match(new RegExp(`\\*\\*${label}:?\\*\\*:?\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*[A-Za-z ]+:?\\*\\*|\\n\\n|$)`, 'i'));
  return m ? m[1].trim() : '';
}

const ledgerPath = (library: string) => path.join(memoryDirOf(library), LEDGER);

async function readLedger(library: string): Promise<Ledger> {
  try {
    const data = JSON.parse(await fs.promises.readFile(ledgerPath(library), 'utf8'));
    return { handled: data && typeof data.handled === 'object' ? data.handled : {} };
  } catch {
    return { handled: {} };
  }
}

async function writeLedger(library: string, ledger: Ledger): Promise<void> {
  await fs.promises.mkdir(memoryDirOf(library), { recursive: true });
  await fs.promises.writeFile(ledgerPath(library), JSON.stringify(ledger, null, 2) + '\n', 'utf8');
}

/** 去掉引号和末尾的来源括号，压掉空白，不分大小写：两行说的是不是同一句 */
export function normalizeLine(text: string): string {
  return text.replace(/^-\s+/, '').replace(/^["'“”]|["'“”]$/g, '').replace(/（[^（）]*）\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const fingerprint = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
};

/** 按来源项目和内容猜领域：猜错了用户在列表里改 */
export function guessDomain(kind: 'user' | 'feedback', project: string, text: string): string {
  // 用户类里只有说身份的进「我是谁」；技能署名这类约定按内容归
  if (kind === 'user' && /我是|用户是|姓|职务|岗位|负责|在读|工作于|就职|履历|机器|电脑|MacBook/i.test(text)) return '我是谁';
  const hay = `${project} ${text}`;
  if (/MBA|课件|training|ppt|幻灯|讲课|课程/i.test(hay)) return '课件与 PPT';
  if (/wechat|公众号|gzh|文章|推文|标题党/i.test(hay)) return '公众号';
  if (/imoling\.git|iml-|switchboard|editor|skills|代码|仓库|技能|发版|界面/i.test(hay)) return '编程与产品';
  if (/投标|方案|bid|评审|proposal|MDR/i.test(hay)) return '方案与评审';
  if (/写作|文风|口吻|引号|措辞|书面|去 ?AI 味/i.test(hay)) return '写作';
  return '工作方式';
}

function fromClaudeMemory(file: string, text: string, mtime: number, project: string): MemoryCandidate | null {
  const { yaml, body } = splitFrontmatter(text);
  if (!yaml) return null;
  const kind = yaml.match(FRONT_TYPE)?.[1] as 'user' | 'feedback' | undefined;
  const desc = yaml.match(FRONT_DESC)?.[1]?.replace(/^["']|["']$/g, '').trim();
  if (!kind || !desc) return null;
  // 摘要句是规矩就用它；是在描述记忆本身的，换成正文里「怎么用」那段的第一句
  const howTo = labeled(body, 'How to apply');
  const rule = META_DESC.test(desc) && howTo ? firstSentence(howTo) : firstSentence(desc, 160);
  const why = firstSentence(labeled(body, 'Why'), 100);
  const date = yaml.match(FRONT_MODIFIED)?.[1] ?? new Date(mtime).toISOString().slice(0, 10);
  return {
    id: `claude:${file}@${fingerprint(desc + rule)}`, text: rule, why, sensitive: SENSITIVE.test(`${desc} ${rule}`), alsoIn: [],
    tool: 'Claude Code', project, date, file, domain: guessDomain(kind, project, rule), kind,
  };
}

/** Codex 把偏好汇总在 memory_summary.md 的「User preferences」一节，一条一个要点 */
function fromCodexSummary(file: string, text: string, mtime: number): MemoryCandidate[] {
  const section = text.split(/^## /m).find((s) => /^user preferences/i.test(s));
  if (!section) return [];
  const date = new Date(mtime).toISOString().slice(0, 10);
  return section.split('\n').filter((l) => /^\s*-\s+\S/.test(l)).map((l) => {
    const t = l.replace(/^\s*-\s+/, '').trim();
    const project = t.match(/^([^:：]{2,40})[:：]\s/)?.[1] ?? '';
    return { id: `codex:${fingerprint(t)}`, text: t, why: '', sensitive: SENSITIVE.test(t), alsoIn: [], tool: 'Codex', project, date, file, domain: guessDomain('feedback', project, t), kind: 'feedback' as const };
  });
}

/** 记忆库里已经有的每一行（规范化后），任何一篇里有就算有 */
async function existingLines(library: string): Promise<Set<string>> {
  const out = new Set<string>();
  const state = await readMemoryState(library);
  for (const f of state.files) {
    const text = await fs.promises.readFile(f.path, 'utf8').catch(() => '');
    for (const line of text.split('\n')) if (/^\s*-\s+\S/.test(line)) out.add(normalizeLine(line));
  }
  return out;
}

/** 采一遍：各工具里有、记忆库里没有、也没被标过「已处理」的条目 */
export async function harvestMemories(library: string, scan: ContextScan): Promise<HarvestResult> {
  const [ledger, existing, state] = await Promise.all([readLedger(library), existingLines(library), readMemoryState(library)]);
  const found: MemoryCandidate[] = [];
  for (const tool of scan.tools) {
    for (const file of tool.memory) {
      const text = await fs.promises.readFile(file.path, 'utf8').catch(() => '');
      if (!text) continue;
      if (tool.id === 'claude-code') { const c = fromClaudeMemory(file.path, text, file.modifiedAt, file.project ?? ''); if (c) found.push(c); }
      else if (tool.id === 'codex' && /memory_summary\.md$/i.test(file.name)) found.push(...fromCodexSummary(file.path, text, file.modifiedAt));
    }
  }
  // 新记的在前：同一句在几个项目里各记了一份，留最近那份，其余记成「另见」
  found.sort((a, b) => b.date.localeCompare(a.date));
  const candidates: MemoryCandidate[] = [];
  const seen = new Map<string, MemoryCandidate>();
  for (const c of found) {
    const key = normalizeLine(c.text);
    if (ledger.handled[c.id] || existing.has(key)) continue;
    const first = seen.get(key);
    if (first) { if (c.project && c.project !== first.project && !first.alsoIn.includes(c.project)) first.alsoIn.push(c.project); continue; }
    seen.set(key, c);
    candidates.push(c);
  }
  const domains = state.files.map((f) => f.name);
  return { candidates, domains };
}

export interface HarvestApply {
  accepted: { id: string; text: string; why?: string; domain: string; date: string; tool: string; project: string }[];
  dismissed: string[];
}

/** 勾上的追加进对应那篇；没勾但标了「已处理」的只记账，下次不再列 */
export async function applyHarvest(library: string, apply: HarvestApply): Promise<{ appended: number; files: string[] }> {
  const ledger = await readLedger(library);
  const at = new Date().toISOString();
  const byDomain = new Map<string, string[]>();
  for (const a of apply.accepted) {
    const text = a.text.trim();
    if (!text) continue;
    const source = [a.date, [a.tool, a.project].filter(Boolean).join(' / ')].filter(Boolean).join('，');
    const line = source ? `${text}（${source}）` : text;
    const why = (a.why ?? '').trim().replace(/^为什么[：:]\s*/, '');
    byDomain.set(a.domain, [...(byDomain.get(a.domain) ?? []), why ? `${line}\n  - 为什么：${why}` : line]);
    ledger.handled[a.id] = { at, domain: a.domain };
  }
  for (const id of apply.dismissed) ledger.handled[id] = { at };
  const files: string[] = [];
  for (const [domain, lines] of byDomain) files.push(await appendMemoryLines(library, domain, lines));
  await writeLedger(library, ledger);
  return { appended: apply.accepted.length, files };
}
