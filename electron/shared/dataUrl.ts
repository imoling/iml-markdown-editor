/**
 * 写进笔记里的图片：`![图](data:image/webp;base64,……)`，后面那一长串一张截图就是几十万个字符。
 * 全库索引、字数、给模型的上下文都用不着它，留着只会把正经内容挤掉；源码模式也要把它折起来才看得了。
 * 主进程和界面共用这一份（这里不能碰 Node 和 DOM）。
 */
const DATA_URL_RE = /data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]{200,})/gi;

export interface DataUrlRange { from: number; to: number; bytes: number }

/** 一段文字里的那几长串：只算 base64 那一段，前面的 `data:image/png;base64,` 留着，看得出是什么图。短的（小图标）不算 */
export function findDataUrlRanges(text: string, offset = 0): DataUrlRange[] {
  const out: DataUrlRange[] = [];
  if (!text.includes(';base64,')) return out;
  for (const m of text.matchAll(DATA_URL_RE)) {
    const to = offset + (m.index ?? 0) + m[0].length;
    out.push({ from: to - m[1].length, to, bytes: Math.floor((m[1].replace(/=+$/, '').length * 3) / 4) });
  }
  return out;
}

/** 去掉的一段：at 是它在去掉之后的文字里的位置，removed 是去掉了多少个字符 */
export interface DataUrlCut { at: number; removed: number }

/** 把那几长串去掉。cuts 用来把去掉之后的下标换算回原文（见 originalOffset） */
export function foldDataUrls(text: string): { text: string; cuts: DataUrlCut[] } {
  const ranges = findDataUrlRanges(text);
  if (ranges.length === 0) return { text, cuts: [] };
  const cuts: DataUrlCut[] = [];
  let out = '';
  let last = 0;
  for (const r of ranges) {
    out += text.slice(last, r.from);
    cuts.push({ at: out.length, removed: r.to - r.from });
    last = r.to;
  }
  return { text: out + text.slice(last), cuts };
}

export const stripDataUrls = (text: string): string => foldDataUrls(text).text;

/** 给人看的时候：那一长串换成一个短标签（label 拿到的是图片的字节数） */
export function abbreviateDataUrls(text: string, label: (bytes: number) => string): string {
  let out = '';
  let last = 0;
  for (const r of findDataUrlRanges(text)) {
    out += text.slice(last, r.from) + label(r.bytes);
    last = r.to;
  }
  return out + text.slice(last);
}

/** 去掉之后的下标 → 原文里的下标 */
export function originalOffset(cuts: DataUrlCut[] | undefined, offset: number): number {
  let shift = 0;
  for (const cut of cuts || []) {
    if (cut.at > offset) break;
    shift += cut.removed;
  }
  return offset + shift;
}
