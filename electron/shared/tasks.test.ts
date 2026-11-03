import { describe, expect, it } from 'vitest';
import { extractTasks, toggleTaskLine, dueBucket, countDue, dueNotice } from './tasks';

const NOTE = [
  '---', 'tags: [会议]', 'todo: "- [ ] 这是属性不是待办"', '---', '',
  '# 周会', '',
  '- [ ] 给客户回邮件 📅 2026-09-25',
  '- [x] 订会议室',
  '  - [ ] 子任务：带投影转接头 [due:: 2026-09-21]',
  '* [ ] 星号列表也算',
  '1. [ ] 有序列表也算 ^blk-1',
  '- [ ] ',
  '- 普通列表项 [ ] 不算',
  '',
  '> [!todo] 提示块里的',
  '> - [ ] 引用里的待办',
  '',
  '```md',
  '- [ ] 代码块里的不算',
  '```',
  '',
  '- [ ] 日期不存在 📅 2026-02-31',
  '- [X] 大写 X 也是已完成 ✅ 2026-09-19',
].join('\n');

describe('countDue', () => {
  const note = (...tasks: { done: boolean; due: string | null }[]) => ({ tasks });

  it('只数没做完的逾期和今天', () => {
    const notes = [
      note({ done: false, due: '2026-11-01' }, { done: true, due: '2026-11-01' }),
      note({ done: false, due: '2026-11-03' }, { done: false, due: '2026-11-04' }, { done: false, due: null }),
    ];
    expect(countDue(notes, '2026-11-03')).toEqual({ overdue: 1, due: 1 });
  });

  it('提醒只说有的那一项', () => {
    expect(dueNotice(1, 2)).toBe('今天 2 件到期，逾期 1 件');
    expect(dueNotice(0, 2)).toBe('今天 2 件到期');
    expect(dueNotice(3, 0)).toBe('逾期 3 件');
  });
});

describe('extractTasks', () => {
  const tasks = extractTasks(NOTE);
  it('各种列表写法都认；frontmatter、代码块、空待办、不在行首的方括号不算', () => {
    expect(tasks.map((t) => t.text)).toEqual(['给客户回邮件', '订会议室', '子任务：带投影转接头', '星号列表也算', '有序列表也算', '引用里的待办', '日期不存在', '大写 X 也是已完成']);
  });
  it('行号指向原文件里的那一行；勾选状态、缩进层级、到期日', () => {
    const lines = NOTE.split('\n');
    expect(tasks.every((t) => lines[t.line].includes(t.raw))).toBe(true);
    expect(tasks.map((t) => t.done)).toEqual([false, true, false, false, false, false, false, true]);
    expect(tasks.map((t) => t.depth)).toEqual([0, 0, 1, 0, 0, 0, 0, 0]);
    expect(tasks.map((t) => t.due)).toEqual(['2026-09-25', null, '2026-09-21', null, null, null, null, null]);
  });
  it('显示的文字去掉日期记号和块标记，原文留着用来核对', () => {
    expect(tasks[0].raw).toBe('给客户回邮件 📅 2026-09-25');
    expect(tasks[4]).toMatchObject({ text: '有序列表也算', raw: '有序列表也算 ^blk-1' });
  });
  it('显示的文字去掉行内 Markdown 记号；下划线变量名、乘号不被误伤', () => {
    const md = ['- [ ] 准备 **演示** 用的 `demo` 库', '- [ ] 看 [[周会#本周|本周安排]] 和 [文档](https://a.b)，回 [[张三]]', '- [ ] ~~不做了~~ ==重点== *斜体* _也是_', '- [ ] 变量 my_var_name 和 2 * 3 * 4 不动'].join('\n');
    expect(extractTasks(md).map((t) => t.text)).toEqual(['准备 演示 用的 demo 库', '看 本周安排 和 文档，回 张三', '不做了 重点 斜体 也是', '变量 my_var_name 和 2 * 3 * 4 不动']);
    // 原文不动：勾选时靠它核对
    expect(extractTasks(md)[0].raw).toBe('准备 **演示** 用的 `demo` 库');
  });

  it('没有待办的笔记、空内容', () => {
    expect(extractTasks('# 标题\n\n正文 [链接](a) 和 [[双链]]')).toEqual([]);
    expect(extractTasks('')).toEqual([]);
  });
});

describe('toggleTaskLine', () => {
  const tasks = extractTasks(NOTE);
  it('只改那一行的方括号，别的一个字不动；再勾一次能还原', () => {
    const done = toggleTaskLine(NOTE, tasks[0], true)!;
    expect(done).toBe(NOTE.replace('- [ ] 给客户回邮件', '- [x] 给客户回邮件'));
    expect(toggleTaskLine(done, { ...tasks[0], done: true }, false)).toBe(NOTE);
  });
  it('子任务、引用里的、有序列表里的都能勾', () => {
    expect(toggleTaskLine(NOTE, tasks[2], true)).toContain('  - [x] 子任务：带投影转接头');
    expect(toggleTaskLine(NOTE, tasks[5], true)).toContain('> - [x] 引用里的待办');
    expect(toggleTaskLine(NOTE, tasks[4], true)).toContain('1. [x] 有序列表也算 ^blk-1');
  });
  it('那篇在上面加了几行：行号对不上了，但全篇只有一条一样的，照样勾对', () => {
    const shifted = '新加的一行\n\n' + NOTE;
    const out = toggleTaskLine(shifted, tasks[0], true)!;
    expect(out).toBe(shifted.replace('- [ ] 给客户回邮件', '- [x] 给客户回邮件'));
  });
  it('找不到、或有两条一模一样分不清是哪条：什么都不动', () => {
    expect(toggleTaskLine(NOTE.replace('给客户回邮件', '给客户打电话'), tasks[0], true)).toBeNull();
    const twins = '前面加一行\n- [ ] 买菜\n- [ ] 买菜\n';
    expect(toggleTaskLine(twins, { line: 0, raw: '买菜', done: false }, true)).toBeNull();
    // 已经被别处勾掉了（状态对不上）也不动
    expect(toggleTaskLine(NOTE.replace('- [ ] 给客户回邮件', '- [x] 给客户回邮件'), tasks[0], true)).toBeNull();
  });
  it('两条一样但行号对得上：按行号改那一条', () => {
    expect(toggleTaskLine('- [ ] 买菜\n- [ ] 买菜\n', { line: 1, raw: '买菜', done: false }, true)).toBe('- [ ] 买菜\n- [x] 买菜\n');
  });
  it('Windows 换行的文件：能认、能勾，\\r 原样留着', () => {
    const crlf = '# 标题\r\n\r\n- [ ] 第一条\r\n- [ ] 第二条\r\n';
    const t = extractTasks(crlf);
    expect(t.map((x) => x.text)).toEqual(['第一条', '第二条']);
    expect(toggleTaskLine(crlf, t[1], true)).toBe('# 标题\r\n\r\n- [ ] 第一条\r\n- [x] 第二条\r\n');
  });
});

describe('dueBucket', () => {
  it('相对今天分段；跨月也对', () => {
    const today = '2026-09-28';
    expect(['2026-09-01', '2026-09-28', '2026-09-29', '2026-10-05', '2026-10-06', '2027-01-01'].map((d) => dueBucket(d, today)))
      .toEqual(['overdue', 'today', 'tomorrow', 'week', 'later', 'later']);
  });
});
