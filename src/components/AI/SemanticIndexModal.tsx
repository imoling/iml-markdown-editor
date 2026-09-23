import React, { useState } from 'react';
import { X } from 'lucide-react';
import { SemanticIndexCard } from './SemanticIndexCard';
import { LiveSettingsNote } from './CopyNotes';

interface Props {
  onClose: () => void;
}

/**
 * 「相关笔记」的设置弹窗（智能 → 相关笔记）：开关语义索引、选嵌入模型。
 * 与「写作助手」分开：嵌入模型跑在第二个 llama-server 进程里，和写作用哪种模型服务无关；
 * 每个操作（开关、下载、换模型、重建）都是即时生效的 IPC 调用，没有「保存」这一步。
 */
export const SemanticIndexModal: React.FC<Props> = ({ onClose }) => {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const notify = (type: 'success' | 'error', text: string, autoHide = type === 'success') => {
    setMessage({ type, text });
    if (autoHide) setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 4000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--wide modal-card--flush semantic-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h1 className="modal-title">相关笔记</h1>
            <p className="modal-subtitle">目录面板里的「相关笔记」推荐，以及搜索里的「意思相近」</p>
          </div>
          <button onClick={onClose} className="icon-btn" title="关闭"><X size={20} /></button>
          {message && <div className={`toast toast--under-head toast--${message.type}`}>{message.text}</div>}
        </header>
        <div className="modal-body modal-body--headed">
          <SemanticIndexCard notify={notify} standalone />
        </div>
        <footer className="modal-footer">
          <LiveSettingsNote className="hint history-modal__note" />
          <button onClick={onClose} className="btn btn-primary btn-wide">完成</button>
        </footer>
      </div>
    </div>
  );
};
