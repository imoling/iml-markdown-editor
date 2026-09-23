import React, { useEffect, useMemo, useState } from 'react';
import { X, ImageOff, Trash2, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import type { OrphanImage } from '../../types/window';
import { toAssetUrl } from '../../utils/assetUrl';
import { formatBytes } from '../../utils/pasteImage';

interface Props {
  onClose: () => void;
}

/** 图片整理：列出笔记库里没有被任何笔记引用的图片，确认后移入废纸篓（可恢复） */
export const ImageCleanupModal: React.FC<Props> = ({ onClose }) => {
  const notify = useAppStore((s) => s.notify);
  const [items, setItems] = useState<OrphanImage[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  const scan = async () => {
    setItems(null);
    // 未保存的标签页内容也算「引用来源」：刚粘贴、还没落盘的图片不能被当成孤儿
    const state = useAppStore.getState();
    state.editorFlush?.();
    const dirty = useAppStore.getState().tabs.filter((t) => t.isDirty || t.id.startsWith('new-')).map((t) => t.content);
    try {
      const found = await window.api.library.findOrphanImages(dirty);
      setItems(found);
      setChecked(new Set(found.map((f) => f.path)));
    } catch {
      setItems([]);
    }
  };

  useEffect(() => { scan(); }, []);

  const totalBytes = useMemo(() => (items || []).filter((i) => checked.has(i.path)).reduce((sum, i) => sum + i.size, 0), [items, checked]);

  const toggle = (p: string) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(p)) next.delete(p); else next.add(p);
    return next;
  });

  const trash = async () => {
    if (checked.size === 0) return;
    setWorking(true);
    try {
      const result = await window.api.library.trashImages([...checked]);
      notify(`已将 ${result.trashed} 张未引用的图片移入废纸篓${result.failed.length ? `，${result.failed.length} 张失败` : ''}`);
      await scan();
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--wide modal-card--flush cleanup-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 className="modal-title"><ImageOff size={18} /> 清理未引用的图片</h2>
          <button onClick={onClose} className="icon-btn" title="关闭"><X size={20} /></button>
        </header>

        <div className="modal-body modal-body--headed">
          {items === null ? (
            <div className="empty-state"><RefreshCw size={20} className="animate-spin" /><br />正在扫描笔记库…</div>
          ) : items.length === 0 ? (
            <div className="empty-state">没有发现未引用的图片，笔记库很干净。</div>
          ) : (
            <>
              <div className="hint mb-12">
                这些图片的文件名没在任何笔记里出现过
                删除是移入废纸篓，随时可以找回
              </div>
              <div className="cleanup-grid">
                {items.map((img) => (
                  <label key={img.path} className={`cleanup-item ${checked.has(img.path) ? 'cleanup-item--on' : ''}`} title={img.path}>
                    <input type="checkbox" checked={checked.has(img.path)} onChange={() => toggle(img.path)} />
                    <div className="cleanup-item__thumb"><img src={toAssetUrl(img.path)} alt="" loading="lazy" /></div>
                    <div className="cleanup-item__name truncate">{img.relative}</div>
                    <div className="cleanup-item__meta">{formatBytes(img.size)} · {new Date(img.mtime).toLocaleDateString()}</div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        <footer className="modal-footer">
          {items && items.length > 0 && (
            <>
              <button className="btn-link" onClick={() => setChecked(checked.size === items.length ? new Set() : new Set(items.map((i) => i.path)))}>{checked.size === items.length ? '全不选' : '全选'}</button>
              <span className="cleanup-modal__summary">已选 {checked.size} 张 · {formatBytes(totalBytes)}</span>
            </>
          )}
          <button onClick={onClose} className="btn btn-secondary btn-wide">关闭</button>
          <button onClick={trash} disabled={working || checked.size === 0} className="btn btn-danger btn-wide"><Trash2 size={13} /> 移入废纸篓</button>
        </footer>
      </div>
    </div>
  );
};
