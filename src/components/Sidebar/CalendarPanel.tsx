import React from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { monthGrid, shiftMonth, dailyNotesByDate, diaryLevel, type DailyNote } from '../../utils/calendar';
import { formatDate } from '../../utils/date';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const OPEN_KEY = 'iml.calendar.open';

/**
 * 日记月历（钉在笔记库页底部，不随文件树滚动）：写过日记的日子填成主题色的格子，写得越多颜色越深
 * （像 GitHub 的提交格子），点一下打开；今天有圈。
 * 没有日记的日子先选中、再确认新建——手滑点一下不该在库里多出一个文件。
 */
export const CalendarPanel: React.FC = () => {
  const root = useAppStore((s) => s.workspacePath || s.defaultLibraryPath || '');
  const libraryVersion = useAppStore((s) => s.libraryVersion);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const openFileByPath = useAppStore((s) => s.openFileByPath);
  const openDailyNote = useAppStore((s) => s.openDailyNote);

  const [open, setOpen] = React.useState(() => localStorage.getItem(OPEN_KEY) !== '0');
  const [view, setView] = React.useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [daily, setDaily] = React.useState<Map<string, DailyNote>>(new Map());
  /** 点了一个还没有日记的日子：等用户确认新建 */
  const [pending, setPending] = React.useState<Date | null>(null);
  const today = formatDate(new Date());

  React.useEffect(() => {
    if (!open || !root) return;
    let cancelled = false;
    window.api.search.listNotes().then((notes) => { if (!cancelled) setDaily(dailyNotesByDate(notes, root)); }).catch(() => { if (!cancelled) setDaily(new Map()); });
    return () => { cancelled = true; };
  }, [open, root, libraryVersion]);

  const weeks = React.useMemo(() => monthGrid(view.year, view.month), [view]);
  const countThisMonth = React.useMemo(() => weeks.flat().filter((d) => d.inMonth && daily.has(d.key)).length, [weeks, daily]);

  const toggle = () => setOpen((v) => { localStorage.setItem(OPEN_KEY, v ? '0' : '1'); return !v; });
  const go = (delta: number) => { setPending(null); setView((v) => shiftMonth(v.year, v.month, delta)); };
  const goToday = () => { const d = new Date(); setPending(null); setView({ year: d.getFullYear(), month: d.getMonth() }); };

  const pick = (date: Date, key: string, inMonth: boolean) => {
    if (!inMonth) setView({ year: date.getFullYear(), month: date.getMonth() });
    const note = daily.get(key);
    if (note) { setPending(null); void openFileByPath(note.path); return; }
    // 今天的日记本来就有「今日日记」一键新建的惯例，不用再确认一次
    if (key === today) { setPending(null); void openDailyNote(date); return; }
    setPending(date);
  };

  if (!root) return null;
  const isThisMonth = view.year === new Date().getFullYear() && view.month === new Date().getMonth();

  return (
    <div className="calendar-panel">
      <div className="sidebar-section-title sidebar-section-title--toggle calendar-panel__title" onClick={toggle}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 日记
      </div>
      {open && (
        <>
          <div className="calendar-panel__nav">
            <span className="calendar-panel__month">{view.year} 年 {view.month + 1} 月</span>
            {countThisMonth > 0 && <span className="calendar-panel__count">{countThisMonth} 篇</span>}
            <span className="flex-1" />
            {!isThisMonth && <button className="calendar-panel__today" onClick={goToday}>今天</button>}
            <button className="icon-btn icon-btn--sm hover-bg" onClick={() => go(-1)} title="上个月"><ChevronLeft size={13} /></button>
            <button className="icon-btn icon-btn--sm hover-bg" onClick={() => go(1)} title="下个月"><ChevronRight size={13} /></button>
          </div>
          <div className="calendar-panel__grid">
            {WEEKDAYS.map((w) => <div key={w} className="calendar-panel__weekday">{w}</div>)}
            {weeks.flat().map(({ date, key, inMonth }) => {
              const note = daily.get(key);
              const level = note ? diaryLevel(note.chars) : 0;
              const cls = [
                'calendar-panel__day',
                !inMonth && 'calendar-panel__day--dim',
                key === today && 'calendar-panel__day--today',
                note && `calendar-panel__day--l${level}`,
                note && note.path === activeTabId && 'calendar-panel__day--active',
                pending && formatDate(pending) === key && 'calendar-panel__day--pending',
              ].filter(Boolean).join(' ');
              return (
                <button key={key} className={cls} onClick={() => pick(date, key, inMonth)} title={note ? `打开 ${key} 的日记 · ${note.chars} 字` : key}>
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          {countThisMonth > 0 && (
            <div className="calendar-panel__legend" title="颜色深浅按这一天写了多少字">
              <span>少</span>
              {[1, 2, 3, 4].map((l) => <i key={l} className={`calendar-panel__swatch calendar-panel__swatch--l${l}`} />)}
              <span>多</span>
            </div>
          )}
          {pending && (
            <div className="calendar-panel__confirm">
              <span className="flex-1">{pending.getMonth() + 1} 月 {pending.getDate()} 日还没有日记</span>
              <button className="btn btn-ghost btn-xs" onClick={() => { const d = pending; setPending(null); void openDailyNote(d); }}>新建</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
