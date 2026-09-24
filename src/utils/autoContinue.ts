/**
 * 自动续写（类似 Obsidian 的 Inscribe）：打字停下来一会儿，光标后面浮出一小段灰字，Tab 收下，接着打字就消失。
 * 这里只放和编辑器无关的部分：给模型的提示词、把模型回的话洗成能直接接在光标后面的一小段。
 * 编辑器那半边在 extensions/AutoContinue.ts。
 */

export interface AutoContinuePrefs {
  enabled: boolean;
  /** 停顿多久才去要续写，毫秒 */
  delay: number;
}

export const AUTO_CONTINUE_DELAYS = [
  { value: 500, label: '0.5 秒' },
  { value: 1000, label: '1 秒' },
  { value: 2000, label: '2 秒' },
];

export const DEFAULT_AUTO_CONTINUE: AutoContinuePrefs = { enabled: false, delay: 1000 };

export function normalizeAutoContinue(raw: any): AutoContinuePrefs {
  const r = raw && typeof raw === 'object' ? raw : {};
  const delay = AUTO_CONTINUE_DELAYS.some((d) => d.value === r.delay) ? r.delay : DEFAULT_AUTO_CONTINUE.delay;
  return { enabled: r.enabled === true, delay };
}

/** 送给模型的前文 / 后文长度：够它看出在写什么、什么口吻，又不至于让小模型每次停顿都读半天 */
export const BEFORE_CHARS = 1500;
export const AFTER_CHARS = 300;
/** 一次最多续多少字：只给一句，想要更多就 Tab 收下再停一下 */
export const MAX_CHARS = 80;
export const MAX_TOKENS = 80;

export function buildContinueMessages(before: string, after: string) {
  const system = `你是写作时的自动补全。用户正在写一篇笔记，光标停在某处。你的任务：接着光标前的最后一个字，写出紧跟其后的一小段话。
规则：
1. 只输出要接上的那段文字本身，不要重复光标前已有的任何文字。
2. 最多一句话，不超过 40 个字；和前文同一种语言、同一种口吻。
3. 不要解释，不要加引号、前缀、Markdown 标记，不要换行。
4. 如果光标前那句话还没写完，就先把它写完。

示例：光标前是「本以为工作日人不多，结果」，你输出「山脚下已经排起了长队。」`;
  const tail = after.trim()
    ? `\n\n（光标后面已经有这些文字，续写要能和它衔接，但不要重复它）\n${after}`
    : '';
  const user = `光标前的文字：\n${before}${tail}\n\n请直接输出紧接在「${lastChars(before, 12)}」后面的文字：`;
  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];
}

const lastChars = (s: string, n: number) => Array.from(s.replace(/\s+$/, '')).slice(-n).join('');

/** 模型回的话常见的「帽子」：续写：、好的，…、以及整段套引号 */
const LEAD_IN = /^\s*(?:(?:好的|当然)[，,。!！]?\s*)?(?:续写|补全|接下来|输出|答案|回答)?\s*[:：]\s*/;

/**
 * 把模型的输出洗成可以直接插在光标后的一段：
 * 去掉帽子和引号、去掉它把前文又抄一遍的部分、只留第一行、在句末或字数上限处截断。
 * 流式输出时每来一块都会调一次，所以对半截的输出也得给出稳定的结果。
 */
export function cleanContinuation(raw: string, before: string): string {
  let s = raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');
  s = s.replace(LEAD_IN, '');
  // 只要第一行：续写的是当前这一段
  const firstLine = s.replace(/^\n+/, '').split('\n')[0];
  s = firstLine.replace(/^[「“"'`]+/, '').replace(/[」”"'`]+$/, '');
  s = stripEcho(s, before);
  if (!s.trim()) return '';
  s = cutAtSentence(s);
  // 前文以英文单词结尾、续写又以字母开头：中间得有空格
  if (/[A-Za-z0-9]$/.test(before) && /^[A-Za-z0-9]/.test(s)) s = ` ${s}`;
  // 前文已经有空格了，续写就别再带一个
  if (/\s$/.test(before)) s = s.replace(/^\s+/, '');
  return s;
}

/** 小模型爱把光标前的半句话再抄一遍：找前文结尾和输出开头最长的重合部分，砍掉 */
function stripEcho(s: string, before: string): string {
  const b = before.replace(/\s+$/, '');
  const max = Math.min(b.length, s.length, 200);
  for (let n = max; n >= 2; n--) {
    const tail = b.slice(-n);
    if (!s.startsWith(tail) || !echoCounts(tail, b, s, n)) continue;
    return s.slice(n).replace(/^\s+/, (m) => (/[A-Za-z0-9]$/.test(b) ? m : ''));
  }
  // 把「当前这一句」从头抄了一遍：前文最后一句是输出的开头
  const lastSentence = b.split(/[。！？!?.\n]/).pop() || '';
  if (lastSentence.length >= 4 && s.startsWith(lastSentence)) return s.slice(lastSentence.length);
  return s;
}

/**
 * 重合几个字才算「抄了」：4 个字以上一律算；中文两三个字（「在于在于」「结果结果」）也算；
 * 英文得是整词重合（前文 "is that"、输出 "that it…" 算，"hat" 不算），免得误伤碰巧相同的字母
 */
function echoCounts(tail: string, b: string, s: string, n: number) {
  if (n >= 4) return true;
  if (/^[\u4e00-\u9fff]+$/.test(tail)) return true;
  const wordStart = !/[A-Za-z0-9]/.test(b.charAt(b.length - n - 1));
  const wordEnd = !/[A-Za-z0-9]/.test(s.charAt(n));
  return /^[A-Za-z0-9]+$/.test(tail) && wordStart && wordEnd;
}

function cutAtSentence(s: string): string {
  const chars = Array.from(s);
  for (let i = 0; i < chars.length && i < MAX_CHARS; i++) {
    // 句末标点处收住；太短的不收（「嗯。」这种），至少 6 个字
    if (/[。！？!?；;]/.test(chars[i]) && i >= 5) return chars.slice(0, i + 1).join('');
    if (chars[i] === '.' && i >= 5 && (i + 1 >= chars.length || chars[i + 1] === ' ')) return chars.slice(0, i + 1).join('');
  }
  return chars.slice(0, MAX_CHARS).join('');
}
