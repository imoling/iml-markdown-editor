import React, { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import type { SyncPlan, SyncRow } from '../../types/window';

interface Props { onClose: () => void }

const STATUS: Record<SyncRow['status'], string> = {
  current: '已是最新',
  update: '要更新',
  insert: '接在末尾',
  create: '新建文件',
  'not-installed': '没装',
};
const home = (p: string) => p.replace(/^\/Users\/[^/]+|^\/home\/[^/]+|^[A-Z]:\\Users\\[^\\]+/, '~');

/** 同步：把记忆库的入口写进各工具的规则文件。只改标记块里面，写前整份备份 */
export const MemorySyncModal: React.FC<Props> = ({ onClose }) => {
  const notify = useAppStore((s) => s.notify);
  const [plan, setPlan] = useState<SyncPlan | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    window.api.aiContext.syncPlan().then((p) => {
      if (!alive) return;
      setPlan(p);
      // 默认勾上要写的；自己写了「我是谁」的（通常是 CLAUDE.md）不勾，加一块就是两份
      setPicked(new Set(p.rows.filter((r) => r.status !== 'current' && r.status !== 'not-installed' && !r.hasOwnIdentity).map((r) => r.id)));
    }).catch(() => { if (alive) setPlan({ ready: false, rows: [] }); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = (plan?.rows ?? []).filter((r) => r.status !== 'not-installed');
  const toggle = (id: string) => setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const apply = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { written } = await window.api.aiContext.applySync([...picked]);
      notify(written.length ? `已写入 ${written.length} 个文件，原文件备份在记忆库的 .备份 里` : '没有要写的');
      onClose();
    } catch (err) {
      notify(`同步失败：${(err as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--wide modal-card--flush" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h1 className="modal-title">同步到各工具</h1>
            <p className="modal-subtitle">只改标记块里面的内容，原文件先备份到记忆库的 .备份 里</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="modal-body modal-body--headed">
          {plan && !plan.ready && <div className="ctx-empty">先在记忆库的「我是谁」里写几行</div>}
          {plan?.ready && rows.map((r) => (
            <div key={r.id} className="sync-row">
              <input type="checkbox" checked={picked.has(r.id)} disabled={r.status === 'current'} onChange={() => toggle(r.id)} />
              <div className="sync-row__body">
                <div className="sync-row__name">{r.name}</div>
                <div className="sync-row__path" title={r.path}>{home(r.path)}</div>
                {r.hasOwnIdentity && <div className="sync-row__warn">这个文件里已经有一节「我是谁」，再写一块就是两份；要用这一块，先删掉那一节</div>}
              </div>
              <span className={`sync-row__status sync-row__status--${r.status}`}>{STATUS[r.status]}</span>
              <button className="btn btn-ghost btn-xs" onClick={() => setPreview(preview === r.id ? null : r.id)}>{preview === r.id ? '收起' : '看写什么'}</button>
              {preview === r.id && <pre className="sync-row__preview">{r.block}</pre>}
            </div>
          ))}
        </div>
        <footer className="modal-footer harvest-modal__foot">
          <span className="harvest-modal__note">「我是谁」改了之后再同步一次</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>取消</button>
          <button className="btn btn-primary btn-sm" disabled={busy || picked.size === 0 || !plan?.ready} onClick={() => void apply()}><RefreshCw size={13} /> 写入 {picked.size} 个文件</button>
        </footer>
      </div>
    </div>
  );
};
