import React, { useState, useEffect } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { Code, Eye, AlertCircle, FileCode } from 'lucide-react';

export const SVGBlock: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const [code, setCode] = useState(node.attrs.code || '');
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');

  // Sync state with node attributes
  useEffect(() => {
    if (node.attrs.code !== code) {
      setCode(node.attrs.code);
    }
  }, [node.attrs.code]);

  const validateSVG = (text: string) => {
    if (!text.trim()) {
      setError(null);
      return;
    }
    const clean = text.trim();
    if (!clean.toLowerCase().includes('<svg') || !clean.toLowerCase().includes('</svg>')) {
      if (clean.length > 20) setError('无效的 SVG 代码');
    } else {
      setError(null);
    }
  };

  useEffect(() => {
    validateSVG(code);
  }, [code]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value;
    setCode(newCode);
    updateAttributes({ code: newCode });
  };

  return (
    <NodeViewWrapper className="svg-block-wrapper">
      <div 
        className={`svg-card ${selected ? 'is-selected' : ''}`}
        style={{
          margin: '1.5rem 0',
          background: 'var(--bg-elevated)',
          border: selected ? '2px solid var(--color-accent-indigo)' : '1px solid var(--border-subtle)',
          borderRadius: '14px',
          overflow: 'hidden',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: selected ? '0 12px 32px rgba(99, 102, 241, 0.15)' : '0 2px 12px rgba(0,0,0,0.03)',
        }}
      >
        {/* Header with Switch */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '8px 16px',
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', background: 'var(--bg-page)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border-subtle)' }}>
            <button 
              onClick={() => setViewMode('preview')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px',
                border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                backgroundColor: viewMode === 'preview' ? 'var(--bg-elevated)' : 'transparent',
                color: viewMode === 'preview' ? 'var(--color-accent-indigo)' : 'var(--text-muted)',
                boxShadow: viewMode === 'preview' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <Eye size={13} />
              <span>预览</span>
            </button>
            <button 
              onClick={() => setViewMode('code')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px',
                border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                backgroundColor: viewMode === 'code' ? 'var(--bg-elevated)' : 'transparent',
                color: viewMode === 'code' ? 'var(--color-accent-indigo)' : 'var(--text-muted)',
                boxShadow: viewMode === 'code' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              <FileCode size={13} />
              <span>代码</span>
            </button>
          </div>
          
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-accent-red)', fontSize: '11px', fontWeight: 500 }}>
                <AlertCircle size={13} />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {viewMode === 'code' ? (
            <textarea
              value={code}
              onChange={handleCodeChange}
              placeholder="粘贴 SVG 代码..."
              spellCheck={false}
              autoFocus
              style={{
                width: '100%',
                minHeight: '180px',
                padding: '20px',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                lineHeight: '1.7',
                backgroundColor: 'var(--bg-page)',
                color: 'var(--text-primary)',
                resize: 'vertical',
              }}
            />
          ) : (
            <div 
              className="svg-preview-container"
              style={{
                padding: '24px',
                minHeight: '120px',
                maxHeight: '600px',
                backgroundColor: 'white', 
                overflow: 'auto',
                scrollbarWidth: 'thin',
                display: 'grid',
                placeItems: 'center'
              }}
            >
              {code.trim() && !error ? (
                <div 
                  style={{ 
                    maxWidth: '100%', 
                    height: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  dangerouslySetInnerHTML={{ 
                    __html: code.replace(/<svg/, '<svg style="max-width: 100%; height: auto; display: block; margin: auto;"') 
                  }} 
                />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '12px', opacity: 0.6 }}>
                  {error || '等待输入内容...'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
};
