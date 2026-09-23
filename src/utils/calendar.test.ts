import { describe, expect, it } from 'vitest';
import { monthGrid, shiftMonth, dailyNotesByDate, diaryLevel, DIARY_LEVELS, detectDailyLayout, dailyNoteSubDirs } from './calendar';

describe('monthGrid', () => {
  it('周一打头、固定 6 行 7 列，前后用相邻月份补齐', () => {
    const grid = monthGrid(2026, 8); // 2026 年 9 月：1 号是周二
    expect(grid).toHaveLength(6);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[0].map((d) => d.key)).toEqual(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
    expect(grid[0].map((d) => d.inMonth)).toEqual([false, true, true, true, true, true, true]);
    expect(grid.flat().filter((d) => d.inMonth)).toHaveLength(30);
    expect(grid.flat().every((d, i, all) => i === 0 || d.date.getTime() > all[i - 1].date.getTime())).toBe(true);
  });

  it('1 号正好是周一的月份不空出一整行；1 号是周日的月份前面补 6 天', () => {
    expect(monthGrid(2026, 5)[0][0].key).toBe('2026-06-01'); // 2026-06-01 周一
    const feb = monthGrid(2026, 1); // 2026-02-01 周日
    expect(feb[0].map((d) => d.inMonth)).toEqual([false, false, false, false, false, false, true]);
    expect(feb[0][6].key).toBe('2026-02-01');
  });

  it('闰年 2 月有 29 天', () => {
    expect(monthGrid(2028, 1).flat().filter((d) => d.inMonth)).toHaveLength(29);
  });
});

describe('shiftMonth', () => {
  it('跨年进位', () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftMonth(2026, 8, -14)).toEqual({ year: 2025, month: 6 });
  });
});

describe('dailyNotesByDate', () => {
  const notes = [
    { path: '/lib/日记/2026-09-20.md', chars: 300 },
    { path: '/lib/日记/2026/09/2026-09-19.md', chars: 50 },
    { path: '/lib/日记/2026/09/2026-09-20.md', chars: 120 },
    { path: '/lib/日记/随想.md', chars: 999 },
    { path: '/lib/日记/2026-02-31.md', chars: 999 },
    { path: '/lib/项目/2026-09-18.md', chars: 999 },
    { path: '/lib/日记本/2026-09-17.md', chars: 999 },
  ];
  it('只认 日记/ 下面（含子文件夹）文件名是真实日期的；同一天取直接放在 日记/ 下的那篇，字数按这一天的总和', () => {
    const map = dailyNotesByDate(notes, '/lib');
    expect([...map.keys()].sort()).toEqual(['2026-09-19', '2026-09-20']);
    expect(map.get('2026-09-20')).toEqual({ path: '/lib/日记/2026-09-20.md', chars: 420 });
    expect(map.get('2026-09-19')).toEqual({ path: '/lib/日记/2026/09/2026-09-19.md', chars: 50 });
  });
  it('没给字数的条目（老版本的索引）按 0 算，格子还是最浅那档，不会漏掉这一天', () => {
    const map = dailyNotesByDate([{ path: '/lib/日记/2026-09-21.md' }], '/lib');
    expect(map.get('2026-09-21')).toEqual({ path: '/lib/日记/2026-09-21.md', chars: 0 });
    expect(diaryLevel(0)).toBe(1);
  });
  it('Windows 路径；笔记库根带不带结尾分隔符都行；没有笔记库时为空', () => {
    expect([...dailyNotesByDate([{ path: 'C:\\lib\\日记\\2026-09-20.md' }], 'C:\\lib\\').keys()]).toEqual(['2026-09-20']);
    expect(dailyNotesByDate(notes, '').size).toBe(0);
  });
});

describe('日记格子的深浅', () => {
  it('四档：随手一句 / 一小段 / 写了一会儿 / 写了很多；边界落在深的那一档', () => {
    const [a, b, c] = DIARY_LEVELS;
    expect(diaryLevel(1)).toBe(1);
    expect(diaryLevel(a - 1)).toBe(1);
    expect(diaryLevel(a)).toBe(2);
    expect(diaryLevel(b - 1)).toBe(2);
    expect(diaryLevel(b)).toBe(3);
    expect(diaryLevel(c - 1)).toBe(3);
    expect(diaryLevel(c)).toBe(4);
    expect(diaryLevel(100000)).toBe(4);
  });
  it('分档是递增的，不会出现写得多反而浅', () => {
    let prev = 0;
    for (const n of [0, 1, 50, 80, 200, 240, 500, 600, 5000]) { const l = diaryLevel(n); expect(l).toBeGreaterThanOrEqual(prev); prev = l; }
  });
});

describe('日记按年 / 年月分目录', () => {
  const day = new Date(2026, 8, 23);   // 2026-09-23

  it('认得三种层次：日记/、日记/2026/、日记/2026/09/', () => {
    const flat = [{ path: '/lib/日记/2026-09-20.md' }, { path: '/lib/日记/2026-09-21.md' }];
    const byYear = [{ path: '/lib/日记/2026/2026-09-20.md' }, { path: '/lib/日记/2026/2026-09-21.md' }];
    const byMonth = [{ path: '/lib/日记/2026/09/2026-09-20.md' }, { path: '/lib/日记/2025/12/2025-12-31.md' }];
    expect(detectDailyLayout(flat, '/lib')).toBe('flat');
    expect(detectDailyLayout(byYear, '/lib')).toBe('year');
    expect(detectDailyLayout(byMonth, '/lib')).toBe('year-month');
    expect(detectDailyLayout([], '/lib')).toBe('flat');           // 一篇都没有：平铺
    expect(detectDailyLayout(byMonth, '')).toBe('flat');          // 没有笔记库
  });

  it('混着放时按多数；一样多就跟最近那篇（文件名就是日期）', () => {
    const mixed = [
      { path: '/lib/日记/2026-01-01.md' },
      { path: '/lib/日记/2026/09/2026-09-20.md' },
      { path: '/lib/日记/2026/09/2026-09-21.md' },
    ];
    expect(detectDailyLayout(mixed, '/lib')).toBe('year-month');
    // 一比一：跟日期更近的那种
    expect(detectDailyLayout([{ path: '/lib/日记/2026-01-01.md' }, { path: '/lib/日记/2026/09/2026-09-23.md' }], '/lib')).toBe('year-month');
    expect(detectDailyLayout([{ path: '/lib/日记/2026-09-23.md' }, { path: '/lib/日记/2026/01/2026-01-01.md' }], '/lib')).toBe('flat');
  });

  it('不是日记的文件、别的目录、埋得太深的都不参与判断', () => {
    const noise = [
      { path: '/lib/日记/随想.md' },                       // 名字不是日期
      { path: '/lib/项目/2026/09/2026-09-20.md' },          // 不在 日记 下
      { path: '/lib/日记/2026/09/周/2026-09-21.md' },       // 四层，太深，不猜
    ];
    expect(detectDailyLayout(noise, '/lib')).toBe('flat');
  });

  it('按层次给出该建在哪几层子目录里', () => {
    expect(dailyNoteSubDirs(day, 'flat')).toEqual([]);
    expect(dailyNoteSubDirs(day, 'year')).toEqual(['2026']);
    expect(dailyNoteSubDirs(day, 'year-month')).toEqual(['2026', '09']);
    // 补写一月的日记时用的是那一天的年月，不是今天
    expect(dailyNoteSubDirs(new Date(2025, 0, 5), 'year-month')).toEqual(['2025', '01']);
  });

  it('Windows 路径同样认得', () => {
    expect(detectDailyLayout([{ path: 'C:\\lib\\日记\\2026\\09\\2026-09-20.md' }], 'C:\\lib')).toBe('year-month');
  });

  it('年月目录里的日记，月历照样找得到并算字数', () => {
    const map = dailyNotesByDate([
      { path: '/lib/日记/2026/09/2026-09-23.md', chars: 300 },
      { path: '/lib/日记/2026/09/2026-09-22.md', chars: 90 },
    ], '/lib');
    expect([...map.keys()].sort()).toEqual(['2026-09-22', '2026-09-23']);
    expect(map.get('2026-09-23')).toEqual({ path: '/lib/日记/2026/09/2026-09-23.md', chars: 300 });
    expect(diaryLevel(map.get('2026-09-23')!.chars)).toBe(3);
  });
});
