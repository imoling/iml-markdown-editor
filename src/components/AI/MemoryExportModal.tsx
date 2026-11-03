import React, { useEffect, useState } from 'react';
import { Copy, Download, X } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import type { MemoryFile } from '../../types/window';

interface Props { onClose: () => void }

const today = () => new Date().toISOString().slice(0, 10);

/** 导出：给读不到文件的对话（豆包、Kimi、ChatGPT 网页）贴的那一份合集 */
export const MemoryExportModal: React.FC<Props> = ({ onClose }) => {
  const notify = useAppStore((s) => s.notify);
  const [files, setFiles] = useState<MemoryFile[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    window.api.aiContext.memoryState().then((state) => {
      if (!alive) return;
      const list = state?.files ?? [];
      setFiles(list);
      setPicked(new Set(list.filter((f) => !f.localOnly).map((f) => f.name)));
    }).catch(() => { if (alive) setFiles([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggle = (name: string) => setPicked((prev) => { const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next; });
  const names = (files ?? []).filter((f) => picked.has(f.name)).map((f) => f.name);
  const lines = (files ?? []).filter((f) => picked.has(f.name)).reduce((n, f) => n + f.lines, 0);

  const bundle = async () => {
    const { text } = await window.api.aiContext.bundle(names);
    if (!text) throw new Error('选中的几篇都是空的');
    return text;
  };
  const copy = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await navigator.clipboard.writeText(await bundle());
      notify('已复制，贴到新对话的第一句');
      onClose();
    } catch (err) {
      notify(`复制失败：${(err as Error).message}`);
      setBusy(false);
    }
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const text = await bundle();
      const target = await window.api.dialog.save({ defaultPath: `AI 记忆合集-${today()}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] });
      if (!target) { setBusy(false); return; }
      const res = await window.api.fs.writeFile(target, text);
      if (!res.success) throw new Error(res.error || '写不进去');
      notify(`已存到 ${target}`);
      onClose();
    } catch (err) {
      notify(`导出失败：${(err as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--flush export-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h1 className="modal-title">导出一份给别的 AI</h1>
            <p className="modal-subtitle">贴到豆包、Kimi 这类读不到文件的对话里，当第一句</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="modal-body modal-body--headed">
          {files && files.length === 0 && <div className="ctx-empty">记忆库还是空的</div>}
          {files?.map((f) => (
            <label key={f.path} className="export-row">
              <input type="checkbox" checked={picked.has(f.name)} onChange={() => toggle(f.name)} />
              <span className="export-row__name">{f.name}</span>
              {f.localOnly && <span className="ctx-chip">仅本机</span>}
              <span className="export-row__meta">{f.lines} 行</span>
            </label>
          ))}
        </div>
        <footer className="modal-footer harvest-modal__foot">
          <span className="harvest-modal__note">{names.length ? `${names.length} 篇，共 ${lines} 行` : '一篇都没选'}</span>
          <button className="btn btn-ghost btn-sm" disabled={busy || names.length === 0} onClick={() => void save()}><Download size={13} /> 存成文件</button>
          <button className="btn btn-primary btn-sm" disabled={busy || names.length === 0} onClick={() => void copy()}><Copy size={13} /> 复制</button>
        </footer>
      </div>
    </div>
  );
};
