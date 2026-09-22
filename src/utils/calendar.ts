import { formatDate } from './date';
import { DAILY_DIR } from './noteTemplates';

export interface CalendarDay {
  date: Date;
  /** YYYY-MM-DD：日记的文件名 */
  key: string;
  inMonth: boolean;
}

/**
 * 一个月的日历格子：周一打头，固定 6 行（月份之间切换时高度不跳），前后用相邻月份的日子补齐。
 * month 从 0 开始（与 Date 一致）。
 */
export function monthGrid(year: number, month: number): CalendarDay[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // 周一 = 0
  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: CalendarDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(year, month, 1 - lead + w * 7 + d);
      week.push({ date, key: formatDate(date), inMonth: date.getMonth() === month });
    }
    weeks.push(week);
  }
  return weeks;
}

/** 往前 / 往后挪几个月，跨年自动进位 */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

const DAILY_NAME_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 某一天的日记：打开用的路径，和用来画深浅的字数 */
export interface DailyNote { path: string; chars: number }

/**
 * 哪些日子有日记：<笔记库>/日记/ 下面（含子文件夹，有人按年月分）文件名是 YYYY-MM-DD 的笔记。
 * 返回 日期 → { 路径, 字数 }；同一天有多个时取路径最短的（直接放在 日记/ 下的那篇），字数取这一天所有篇的总和。
 */
export function dailyNotesByDate(notes: { path: string; chars?: number }[], root: string): Map<string, DailyNote> {
  const out = new Map<string, DailyNote>();
  if (!root) return out;
  const prefix = root.replace(/[/\\]+$/, '') + (root.includes('\\') ? '\\' : '/') + DAILY_DIR;
  for (const { path, chars } of notes) {
    if (!path.startsWith(prefix) || !/[/\\]/.test(path[prefix.length] || '')) continue;
    const name = (path.split(/[/\\]/).pop() || '').replace(/\.(md|markdown|mdown|mkd|txt)$/i, '');
    const m = DAILY_NAME_RE.exec(name);
    if (!m) continue;
    // 2026-02-31 这种不存在的日子不算
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (formatDate(d) !== name) continue;
    const prev = out.get(name);
    out.set(name, {
      path: !prev || path.length < prev.path.length ? path : prev.path,
      chars: (prev?.chars ?? 0) + Math.max(0, chars ?? 0),
    });
  }
  return out;
}

/**
 * 这一天写了多少 → 0~4 档深浅（像 GitHub 的提交格子）。
 * 分档按中文日记的手感定：随手一句、一小段、写了一会儿、写了很多。
 * 0 档留给「有这篇但几乎是空的」——它也该看得出来有，所以最浅的一档从 1 个字起
 */
export const DIARY_LEVELS = [80, 240, 600] as const;
export function diaryLevel(chars: number): 1 | 2 | 3 | 4 {
  if (chars >= DIARY_LEVELS[2]) return 4;
  if (chars >= DIARY_LEVELS[1]) return 3;
  if (chars >= DIARY_LEVELS[0]) return 2;
  return 1;
}
