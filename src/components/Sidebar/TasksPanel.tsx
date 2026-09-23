import React, { useEffect, useMemo, useState } from 'react';
import { ListChecks, FileText, CalendarClock, Eye, EyeOff, PencilLine, FolderSearch } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { PanelIntro } from './PanelIntro';
import { dueBucket, DueBucket, NoteTask } from '../../../electron/shared/tasks';
import { formatDate } from '../../utils/date';
import type { NoteTasks } from '../../types/window';

const BUCKET_LABEL: Record<DueBucket, string> = { overdue: '已过期', today: '今天', tomorrow: '明天', week: '接下来 7 天', later: '以后' };
const BUCKET_ORDER: DueBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later'];
const SHOW_DONE_KEY = 'iml.tasks.showDone';

interface Row { path: string; title: string; task: NoteTask }

/** 到期日显示成「9 月 25 日」，跨年才带年份 */
const dueLabel = (due: string, today: string) => {
  const [y, m, d] = due.split('-').map(Number);
  return `${y !== Number(today.slice(0, 4)) ? `${y} 年 ` : ''}${m} 月 ${d} 日`;
};

interface TaskRowProps {
  path: string;
  task: NoteTask;
  /** 按日期排的那几组里，每条下面带上它来自哪篇笔记 */
  note?: string;
  /** 按日期排的组里不按层级缩进 */
  flat?: boolean;
  today: string;
  onFlip: (path: string, task: NoteTask) => void;
  onOpen: (path: string, task: NoteTask) => void;
}

const TaskRow: React.FC<TaskRowProps> = ({ path, task, note, flat, today, onFlip, onOpen }) => (
  <div className={`task-row ${task.done ? 'task-row--done' : ''}`} style={{ paddingLeft: 4 + (flat ? 0 : task.depth * 14) }}>
    <input type="checkbox" className="task-row__check" checked={task.done} onChange={() => onFlip(path, task)} title={task.done ? '标为未完成' : '标为完成'} />
    <div className="task-row__body" onClick={() => onOpen(path, task)} title="打开笔记并跳到这一行">
      <span className="task-row__text">{task.text}</span>
      {(task.due || note) && (
        <span className="task-row__meta">
          {task.due && <span className={`task-row__due ${!task.done && task.due < today ? 'task-row__due--overdue' : ''}`}>{dueLabel(task.due, today)}</span>}
          {note && <span className="truncate">{note}</span>}
        </span>
      )}
    </div>
  </div>
);

/**
 * 全库待办：散在各篇笔记里的 `- [ ]` 汇到一处。写了到期日的按时间排在上面，其余按笔记分组。
 * 在这里打勾，改的就是原笔记里的那一行；点文字跳到那一行。
 */
export const TasksPanel: React.FC = () => {
  const libraryVersion = useAppStore((s) => s.libraryVersion);
  const toggleTask = useAppStore((s) => s.toggleTask);
  const openTask = useAppStore((s) => s.openTask);
  const notify = useAppStore((s) => s.notify);
  const [notes, setNotes] = useState<NoteTasks[] | null>(null);
  const [showDone, setShowDone] = useState(() => localStorage.getItem(SHOW_DONE_KEY) === '1');
  const [reload, setReload] = useState(0);
  const today = formatDate(new Date());

  useEffect(() => {
    let cancelled = false;
    window.api.search.tasks(showDone).then((r) => { if (!cancelled) setNotes(r); }).catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, [libraryVersion, showDone, reload]);

  const { dated, undated, openCount } = useMemo(() => {
    const buckets = new Map<DueBucket, Row[]>();
    const rest: NoteTasks[] = [];
    let open = 0;
    for (const note of notes || []) {
      const plain: NoteTask[] = [];
      for (const task of note.tasks) {
        if (!task.done) open++;
        // 做完的事不再按到期日催
        if (task.due && !task.done) {
          const b = dueBucket(task.due, today);
          buckets.set(b, [...(buckets.get(b) || []), { path: note.path, title: note.title, task }]);
        } else plain.push(task);
      }
      if (plain.length) rest.push({ ...note, tasks: plain });
    }
    for (const rows of buckets.values()) rows.sort((a, b) => (a.task.due! < b.task.due! ? -1 : a.task.due! > b.task.due! ? 1 : 0));
    return { dated: BUCKET_ORDER.filter((b) => buckets.has(b)).map((b) => ({ bucket: b, rows: buckets.get(b)! })), undated: rest, openCount: open };
  }, [notes, today]);

  const flip = async (path: string, task: NoteTask) => {
    const next = !task.done;
    // 先在界面上勾掉，不等磁盘和索引；失败了再刷新回来
    setNotes((prev) => (prev || []).map((n) => (n.path !== path ? n : { ...n, tasks: n.tasks.map((t) => (t === task ? { ...t, done: next } : t)) })));
    const ok = await toggleTask(path, task, next);
    if (!ok) {
      notify('那篇笔记刚改过，这一条已重新读取');
      setReload((n) => n + 1);
    }
  };

  const rowProps = { today, onFlip: (path: string, task: NoteTask) => void flip(path, task), onOpen: (path: string, task: NoteTask) => void openTask(path, task) };
  const toggleShowDone = () => setShowDone((v) => { localStorage.setItem(SHOW_DONE_KEY, v ? '0' : '1'); return !v; });

  if (notes === null) return <div className="tasks-panel"><div className="tree-empty tree-empty--root">正在读取…</div></div>;

  if (notes.length === 0 && !showDone) {
    return (
      <div className="tasks-panel">
        <PanelIntro
          icon={<ListChecks size={20} />}
          title="全库待办"
          lead="散在各篇笔记里的待办都汇到这里"
          points={[
            { icon: <PencilLine size={12} />, text: '在任何笔记里写「- [ ] 要做的事」，保存后就会出现在这里' },
            { icon: <CalendarClock size={12} />, text: '加上 📅 2026-09-30 就能按日期分组' },
          ]}
        >
          <button className="btn btn-ghost btn-xs" onClick={toggleShowDone}><Eye size={11} /> 看看已完成的</button>
        </PanelIntro>
      </div>
    );
  }

  return (
    <div className="tasks-panel">
      <div className="tasks-panel__head">
        <span className="sidebar-section-title tasks-panel__title">待办{openCount ? ` · ${openCount}` : ''}</span>
        <button className="icon-btn icon-btn--sm hover-bg" onClick={toggleShowDone} title={showDone ? '隐藏已完成的' : '显示已完成的'}>
          {showDone ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>

      {dated.map(({ bucket, rows }) => (
        <div key={bucket} className="tasks-panel__group">
          <div className={`tasks-panel__group-title ${bucket === 'overdue' ? 'tasks-panel__group-title--overdue' : ''}`}><CalendarClock size={11} /> {BUCKET_LABEL[bucket]} · {rows.length}</div>
          {rows.map((r) => <TaskRow key={`${r.path}:${r.task.line}`} path={r.path} task={r.task} flat note={r.title} {...rowProps} />)}
        </div>
      ))}

      {undated.map((note) => (
        <div key={note.path} className="tasks-panel__group">
          <div className="tasks-panel__group-title tasks-panel__group-title--note" onClick={() => void useAppStore.getState().openFileByPath(note.path)} title={note.path}>
            <FileText size={11} /> <span className="truncate flex-1">{note.title}</span>
            <span className="tags-panel__count">{note.tasks.filter((t) => !t.done).length || ''}</span>
          </div>
          {note.tasks.map((task) => <TaskRow key={task.line} path={note.path} task={task} {...rowProps} />)}
        </div>
      ))}

      {notes.length === 0 && showDone && (
        <div className="tree-empty tree-empty--root"><FolderSearch size={12} /> 笔记库里还没有任何待办。</div>
      )}
    </div>
  );
};
