import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import type { MemoryCandidate } from '../../types/window';

interface Props { onClose: () => void }
interface Item extends MemoryCandidate { checked: boolean }

const baseName = (p: string) => (p.split(/[\\/]/).pop() || p).replace(/\.md$/i, '');

/** 提炼：各工具里有、记忆库里还没有的条目，勾上的追加到对应那篇的末尾 */
export const MemoryHarvestModal: React.FC<Props> = ({ onClose }) => {
  const notify = useAppStore((s) => s.notify);
  const bumpLibraryVersion = useAppStore((s) => s.bumpLibraryVersion);
  const [items, setItems] = useState<Item[] | null>(null);
  const [domains, setDomains] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    window.api.aiContext.harvest().then((r) => {
      if (!alive) return;
      // 默认一条都不勾：一键全进去的结果就是一堆没改过的原话
      setItems(r.candidates.map((c) => ({ ...c, checked: false })));
      setDomains(r.domains);
    }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const options = useMemo(() => {
    const all = new Set<string>(['我是谁', '工作方式', ...domains, ...(items ?? []).map((i) => i.domain)]);
    return [...all];
  }, [domains, items]);
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items ?? []) m.set(i.domain, [...(m.get(i.domain) ?? []), i]);
    return [...m.entries()].sort((a, b) => options.indexOf(a[0]) - options.indexOf(b[0]));
  }, [items, options]);
  const checked = (items ?? []).filter((i) => i.checked);
  const unchecked = (items ?? []).filter((i) => !i.checked);

  const update = (id: string, patch: Partial<Item>) => setItems((prev) => prev && prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  const checkGroup = (domain: string, on: boolean) => setItems((prev) => prev && prev.map((i) => (i.domain === domain && !i.sensitive ? { ...i, checked: on } : i)));
  const apply = async (dismissRest: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await window.api.aiContext.applyHarvest({
        accepted: checked.map((i) => ({ id: i.id, text: i.text, why: i.why, domain: i.domain, date: i.date, tool: i.tool, project: i.project })),
        dismissed: dismissRest ? unchecked.map((i) => i.id) : [],
      });
      bumpLibraryVersion();
      notify(result.appended ? `已追加 ${result.appended} 条到记忆库` : '没有追加，其余已标为处理过');
      onClose();
    } catch (err) {
      notify(`追加失败：${(err as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--wide modal-card--flush harvest-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h1 className="modal-title">提炼记忆</h1>
            <p className="modal-subtitle">{items ? `采到 ${items.length} 条记忆库里还没有的；先改成你认的说法，勾上的才追加` : '正在采集…'}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="modal-body modal-body--headed">
          {items && items.length === 0 && <div className="ctx-empty">各工具里没有新的条目。它们记了新东西之后再来</div>}
          {groups.map(([domain, list]) => (
            <section key={domain} className="harvest-group">
              <div className="harvest-group__title">
                {domain} · {list.length} 条
                <button className="harvest-group__all" onClick={() => checkGroup(domain, !list.filter((i) => !i.sensitive).every((i) => i.checked))}>
                  {list.filter((i) => !i.sensitive).every((i) => i.checked) ? '全不选' : '全选'}
                </button>
              </div>
              {list.map((i) => (
                <div key={i.id} className={`harvest-row ${i.checked ? '' : 'harvest-row--off'}`}>
                  <input type="checkbox" className="harvest-row__check" checked={i.checked} onChange={(e) => update(i.id, { checked: e.target.checked })} />
                  <div className="harvest-row__body">
                    <textarea className="harvest-row__text" rows={1} value={i.text} onChange={(e) => update(i.id, { text: e.target.value })} aria-label="规矩" />
                    <input className="harvest-row__why" value={i.why} onChange={(e) => update(i.id, { why: e.target.value })} placeholder="为什么（新工具靠这句推到没见过的情况）" aria-label="为什么" />
                    <div className="harvest-row__src">
                      {i.sensitive && <span className="ctx-badge ctx-badge--warn">含个人信息</span>}
                      {[i.date, i.tool, i.project, baseName(i.file)].filter(Boolean).join(' · ')}
                      {i.alsoIn.length > 0 && ` · 另见 ${i.alsoIn.length} 个项目`}
                    </div>
                  </div>
                  <label className="harvest-row__to">
                    追加到
                    <select value={i.domain} onChange={(e) => update(i.id, { domain: e.target.value })}>
                      {options.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </label>
                </div>
              ))}
            </section>
          ))}
        </div>
        <footer className="modal-footer harvest-modal__foot">
          <span className="harvest-modal__note">含个人信息的会进导出合集，勾之前想好</span>
          {/* 一条都没勾时不给这个按钮：点了就是把全部丢掉（2026-11-03 真出过：75 条一条没进，全记成了处理过） */}
          {checked.length > 0 && unchecked.length > 0 && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void apply(true)}>追加 {checked.length} 条，其余不再列出</button>}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>取消</button>
          <button className="btn btn-primary btn-sm" disabled={busy || checked.length === 0} onClick={() => void apply(false)}><Sparkles size={13} /> 追加 {checked.length} 条</button>
        </footer>
      </div>
    </div>
  );
};
