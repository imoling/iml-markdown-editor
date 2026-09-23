import React, { useEffect, useMemo, useState } from 'react';
import { X, History, RotateCcw, Copy } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import type { HistoryEntry } from '../../types/window';
import { diffLines, diffStats, collapseContext } from '../../utils/lineDiff';

interface Props {
  onClose: () => void;
}

const REASON_LABEL: Record<HistoryEntry['reason'], string> = {
  save: '保存',
  'before-save': '外部版本',
  restore: '恢复前',
};

function formatTime(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const clock = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return sameDay ? `今天 ${clock}` : `${d.getMonth() + 1}月${d.getDate()}日 ${clock}`;
}

/** 版本历史：左边是这篇笔记保存过的版本，右边是所选版本与当前内容的差异；可以恢复 */
export const HistoryModal: React.FC<Props> = ({ onClose }) => {
  const activeTabId = useAppStore((s) => s.activeTabId);
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const updateTabContent = useAppStore((s) => s.updateTabContent);
  const notify = useAppStore((s) => s.notify);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  // 打开时自动选中的版本如果和当前内容一样（刚保存完就是这样），往下找第一个有差异的 —— 一打开就该看到有用的对比
  const autoPick = React.useRef(true);

  const filePath = activeTabId && !activeTabId.startsWith('new-') ? activeTabId : null;

  useEffect(() => {
    if (!filePath) { setEntries([]); return; }
    // 先把编辑器里尚未写回的内容刷进 store，右侧对比的才是屏幕上的最新内容
    useAppStore.getState().editorFlush?.();
    window.api.history.list(filePath).then((list) => {
      setEntries(list);
      setSelected(list[0]?.id ?? null);
    }).catch(() => setEntries([]));
  }, [filePath]);

  useEffect(() => {
    if (!filePath || !selected) { setContent(null); return; }
    let cancelled = false;
    window.api.history.read(filePath, selected).then((c) => {
      if (cancelled) return;
      if (autoPick.current && c !== null && entries) {
        const index = entries.findIndex((e) => e.id === selected);
        if (c === (useAppStore.getState().tabs.find((t) => t.id === filePath)?.content ?? '') && index >= 0 && index < entries.length - 1) {
          setSelected(entries[index + 1].id);
          return;
        }
      }
      autoPick.current = false;
      setContent(c);
    });
    return () => { cancelled = true; };
  }, [filePath, selected, entries]);

  const current = tab?.content ?? '';
  const ops = useMemo(() => (content === null ? [] : diffLines(content, current)), [content, current]);
  const stats = useMemo(() => diffStats(ops), [ops]);
  const rows = useMemo(() => collapseContext(ops, 3), [ops]);
  const entry = entries?.find((e) => e.id === selected) ?? null;

  const restore = () => {
    if (!filePath || content === null || !entry) return;
    // 只改标签页内容并标脏：当前内容在下次保存时会自动进历史，恢复本身也能撤回
    updateTabContent(filePath, content);
    notify(`已恢复到 ${formatTime(entry.time)} 的版本，保存后生效`);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--flush history-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 className="modal-title"><History size={18} /> 版本历史{tab ? ` · ${tab.title.replace(/\.md$/i, '')}` : ''}</h2>
          <button onClick={onClose} className="icon-btn" title="关闭"><X size={20} /></button>
        </header>

        <div className="history-modal__body">
          <aside className="history-modal__list custom-scrollbar">
            {entries === null ? (
              <div className="empty-state">读取中…</div>
            ) : !activeTabId ? (
              <div className="empty-state">先打开一篇笔记，再来看它的版本历史。</div>
            ) : !filePath ? (
              <div className="empty-state">这篇笔记还没有保存过，保存后才会开始记录版本。</div>
            ) : entries.length === 0 ? (
              <div className="empty-state">还没有历史版本。<br />之后每次保存都会在这里留一份。</div>
            ) : (
              entries.map((e) => (
                <button key={e.id} className={`history-item ${e.id === selected ? 'history-item--active' : ''}`} onClick={() => { autoPick.current = false; setSelected(e.id); }}>
                  <span className="history-item__time">{formatTime(e.time)}</span>
                  <span className="history-item__meta">
                    <span className={`history-item__reason history-item__reason--${e.reason}`}>{REASON_LABEL[e.reason]}</span>
                    {(e.size / 1024).toFixed(1)} KB
                  </span>
                </button>
              ))
            )}
          </aside>

          <section className="history-modal__diff custom-scrollbar">
            {content === null ? (
              <div className="empty-state">{entries && entries.length ? '选择左侧的一个版本' : ''}</div>
            ) : stats.added === 0 && stats.removed === 0 ? (
              <div className="empty-state">这个版本与当前内容完全相同。</div>
            ) : (
              <>
                <div className="history-modal__summary">
                  从这个版本到现在：<span className="diff-add-text">+{stats.added} 行</span> <span className="diff-del-text">−{stats.removed} 行</span>
                  <span className="hint">（红色 = 这个版本里有、现在没有；绿色 = 现在新增的）</span>
                </div>
                <pre className="diff-view">
                  {rows.map((row, i) => row.type === 'gap'
                    ? <div key={i} className="diff-line diff-line--gap">⋯ {row.count} 行未改动</div>
                    : <div key={i} className={`diff-line diff-line--${row.type}`}><span className="diff-line__sign">{row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '}</span>{row.text || ' '}</div>)}
                </pre>
              </>
            )}
          </section>
        </div>

        <footer className="modal-footer">
          <span className="hint history-modal__note">历史存在本机，不写进笔记库，保留 60 天</span>
          <button className="btn btn-secondary btn-wide" disabled={content === null} onClick={() => { if (content !== null) { navigator.clipboard.writeText(content); notify('已复制这个版本的全文'); } }}><Copy size={13} /> 复制全文</button>
          <button className="btn btn-primary btn-wide" disabled={content === null || (stats.added === 0 && stats.removed === 0)} onClick={restore}><RotateCcw size={13} /> 恢复此版本</button>
        </footer>
      </div>
    </div>
  );
};
