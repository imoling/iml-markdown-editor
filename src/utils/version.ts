/**
 * 版本号采用「年份 + 小版本」方案（类似 Apple：26.1、26.2 …）。
 * npm / electron-builder 要求三段式，所以 package.json 里写 26.1.0，界面上展示时省略末尾的 .0。
 */
export function formatVersion(v: string | undefined | null): string {
  if (!v) return '';
  const parts = v.split('.');
  if (parts.length === 3 && parts[2] === '0') return `${parts[0]}.${parts[1]}`;
  return v;
}

/** 大版本：26.3.1 → 26.3。新特性介绍按大版本写，热修版本（第三段不是 0）也要能对上 */
export function majorMinor(v: string | undefined | null): string {
  if (!v) return '';
  const parts = v.replace(/^v/, '').split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : v;
}

/** 逐段比较版本号，只有远端确实更新时才提示（避免 1.9.0 与 26.1.0 这类字符串不等就误报） */
export function isNewerVersion(latest: string | undefined | null, current: string | undefined | null): boolean {
  if (!latest || !current) return false;
  const a = latest.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const b = current.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

export interface ReleaseSummary {
  /** 「26.3.0 — 一句话」里的那句话 */
  slogan: string;
  /** 开头那段说明 */
  lead: string;
  /** 各小节的标题：这一版做了哪几件事 */
  highlights: string[];
}

const plain = (s: string) => s.replace(/`([^`]*)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();

/**
 * 从发布说明里摘出更新提醒要用的几行。发布说明的写法是固定的（docs/release-notes-*.md）：
 * 「## 版本 — 一句话」、一段说明、「### 下载」表格，然后每件事一个「### 小节」。
 * 小节标题就是最好的要点；「下载」「其它」「已知问题」这类不算
 */
export function summarizeReleaseNotes(notes: string | undefined | null, max = 6): ReleaseSummary {
  const lines = (notes || '').replace(/\r\n/g, '\n').split('\n');
  let slogan = '';
  let lead = '';
  const highlights: string[] = [];
  let seenSection = false;
  for (const raw of lines) {
    const line = raw.trim();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const text = plain(heading[2]);
      if (heading[1].length <= 2 && !slogan && !seenSection) {
        slogan = text.replace(/^v?[\d.]+\s*(?:[—–-]+\s*)?/, '');
      } else if (heading[1].length === 3) {
        seenSection = true;
        if (!/^(下载|其它|其他|已知问题|升级说明|安装|致谢)/.test(text) && highlights.length < max) highlights.push(text);
      }
      continue;
    }
    // 表格、引用、列表不算开头那段；`**加粗**` 开头的是正常段落（26.3.1 的「**macOS 用户请升级。**」）
    if (!seenSection && !lead && line && !/^([|>]|[-*+]\s)/.test(line)) lead = plain(line);
  }
  return { slogan, lead, highlights };
}
