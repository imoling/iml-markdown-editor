import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Loader2, BookOpen, Activity, FileCode } from 'lucide-react';

interface AIPaletteProps {
  onClose: () => void;
  onAction: (prompt: string, useContext: boolean, mode: 'text' | 'mermaid' | 'svg') => void;
  onStop?: () => void;
  loading?: boolean;
}

export const AIPalette: React.FC<AIPaletteProps> = ({ onClose, onAction, onStop, loading }) => {
  const [input, setInput] = useState('');
  const [useContext, setUseContext] = useState(false);
  const [activeMode, setActiveMode] = useState<'text' | 'mermaid' | 'svg'>('text');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !loading) {
        onAction(input, useContext, activeMode);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      className="ai-palette-container"
      onClick={e => e.stopPropagation()}
      style={{
        width: 480, backgroundColor: 'var(--bg-elevated)', borderRadius: 12,
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2), 0 0 0 1px var(--border-subtle)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'paletteIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        backdropFilter: 'blur(20px)',
        zIndex: 100
      }}
    >
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 16, top: 18 }}>
            {loading ? <Loader2 size={18} className="animate-spin" color="var(--color-brand-indigo)" /> : <Sparkles size={18} color="var(--color-brand-indigo)" />}
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入指令让 AI 生成内容..."
            rows={1}
            style={{
              width: '100%', padding: '16px 16px 16px 48px', border: 'none', background: 'transparent',
              fontSize: 15, color: 'var(--text-main)', outline: 'none',
              resize: 'none', overflow: 'hidden', lineHeight: 1.6,
              fontFamily: 'inherit', boxSizing: 'border-box'
            }}
          />
        </div>
        <div style={{ 
          backgroundColor: 'var(--bg-card)', display: 'flex', flexDirection: 'column',
          gap: 0
        }}>

          <div style={{ 
            padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 8
          }}>
            {/* 左侧：快捷键 + 结合上下文按钮 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', display: 'flex', gap: 10 }}>
              <span><kbd style={{ padding: '2px 4px', border: '1px solid var(--border-subtle)', borderRadius: 4, marginRight: 4 }}>↵</kbd>执行</span>
              <span><kbd style={{ padding: '2px 4px', border: '1px solid var(--border-subtle)', borderRadius: 4, marginRight: 4 }}>Esc</kbd>退出</span>
            </div>
            {/* 结合上下文切换按钮 */}
            <button
              onClick={() => setUseContext(v => !v)}
              title={useContext ? '已启用：结合当前文档内容生成' : '启用：结合当前文档内容生成'}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 500,
                backgroundColor: useContext ? 'var(--color-brand-indigo)' : 'transparent',
                color: useContext ? '#fff' : 'var(--text-tertiary)',
                outline: useContext ? 'none' : '1px solid var(--border-subtle)',
                transition: 'all 0.15s ease',
              }}
            >
              <BookOpen size={11} />
              结合上下文
            </button>

            <div style={{ width: 1, height: 12, backgroundColor: 'var(--border-subtle)', margin: '0 2px' }} />

            {/* Mermaid 模式按钮 */}
            <button
              onClick={() => setActiveMode(activeMode === 'mermaid' ? 'text' : 'mermaid')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 500,
                backgroundColor: activeMode === 'mermaid' ? 'var(--color-accent-indigo)' : 'transparent',
                color: activeMode === 'mermaid' ? '#fff' : 'var(--text-tertiary)',
                outline: activeMode === 'mermaid' ? 'none' : '1px solid var(--border-subtle)',
                transition: 'all 0.15s ease',
              }}
            >
              <Activity size={11} />
              Mermaid
            </button>

            {/* SVG 模式按钮 */}
            <button
              onClick={() => setActiveMode(activeMode === 'svg' ? 'text' : 'svg')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 500,
                backgroundColor: activeMode === 'svg' ? 'var(--color-accent-orange)' : 'transparent',
                color: activeMode === 'svg' ? '#fff' : 'var(--text-tertiary)',
                outline: activeMode === 'svg' ? 'none' : '1px solid var(--border-subtle)',
                transition: 'all 0.15s ease',
              }}
            >
              <FileCode size={11} />
              SVG
            </button>
          </div>

          {/* 右侧：发送 / 生成中 */}
          {input.trim() && !loading ? (
            <div 
              onClick={() => onAction(input, useContext, activeMode)}
              style={{ 
                cursor: 'pointer', padding: '6px 10px', borderRadius: 8, backgroundColor: 'var(--color-brand-indigo)',
                color: '#fff', display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600, flexShrink: 0,
                boxShadow: '0 2px 8px var(--brand-shadow)'
              }}
            >
              <Send size={13} />
              发送
            </div>
          ) : loading ? (
            <div 
              onClick={onStop}
              style={{ 
                cursor: 'pointer', padding: '6px 10px', borderRadius: 8, backgroundColor: 'rgba(255, 71, 87, 0.1)',
                color: '#ff4757', display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600, flexShrink: 0,
                border: '1px solid rgba(255, 71, 87, 0.2)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 71, 87, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 71, 87, 0.1)';
              }}
            >
              <Loader2 size={13} className="animate-spin" />
              停止生成
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
