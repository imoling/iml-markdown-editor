import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { languages } from '@codemirror/language-data';
import { Eye, AlertCircle, FileCode } from 'lucide-react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';

export const SVGBlock: React.FC<NodeViewProps> = ({ node, updateAttributes, selected, editor, getPos }) => {
  const [code, setCode] = useState(node.attrs.code || '');
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [isEditing, setIsEditing] = useState(false); // 代码区是否激活
  const [extensions, setExtensions] = useState<any[]>([EditorView.lineWrapping]);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // Sync state with node attributes
  useEffect(() => {
    if (node.attrs.code !== code) {
      setCode(node.attrs.code);
    }
  }, [node.attrs.code]);

  useEffect(() => {
    const htmlLang = languages.find(l => l.name === 'HTML' || l.alias.includes('html'));
    if (htmlLang) {
      htmlLang.load().then(lang => {
        setExtensions([EditorView.lineWrapping, lang]);
      });
    }
  }, []);

  const validateSVG = (text: string) => {
    if (!text.trim()) {
      setError(null);
      return;
    }
    const clean = text.trim();
    const lower = clean.toLowerCase();
    if (!lower.includes('<svg') || !lower.includes('</svg>')) {
      if (clean.length > 20) setError('无效的 SVG 代码');
    } else {
      setError(null);
    }
  };

  useEffect(() => {
    validateSVG(code);
  }, [code]);

  // Reset editing state when switching to preview
  useEffect(() => {
    if (viewMode === 'preview') {
      setIsEditing(false);
    }
  }, [viewMode]);

  // Auto-focus CodeMirror when entering editing mode
  useEffect(() => {
    if (viewMode === 'code' && isEditing) {
      requestAnimationFrame(() => {
        editorRef.current?.view?.focus();
      });
    }
  }, [viewMode, isEditing]);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    updateAttributes({ code: newCode });
  };

  // ========= 分区域交互核心逻辑 =========

  /** 点击顶栏 → 选中组件整体（蓝色高亮），方便移动/删除/撤销 */
  const handleHeaderClick = useCallback(() => {
    setIsEditing(false);
    if (editor && typeof getPos === 'function') {
      const pos = getPos();
      if (typeof pos === 'number') {
        editor.chain().focus().setNodeSelection(pos).run();
      }
    }
  }, [editor, getPos]);

  /** 点击代码区域 → 取消 ProseMirror 选中，进入代码编辑态 */
  const handleCodeAreaClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    
    if (editor && typeof getPos === 'function') {
      const pos = getPos();
      if (typeof pos === 'number') {
        try {
          editor.commands.setTextSelection(pos + node.nodeSize);
        } catch {
          // 如果节点之后没有位置（文档末尾），忽略
        }
      }
    }

    requestAnimationFrame(() => {
      editorRef.current?.view?.focus();
    });
  }, [editor, getPos, node.nodeSize]);

  /** 按键深度隔离 — 关键按键不冒泡到 ProseMirror */
  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    const isolatedKeys = ['Backspace', 'Delete', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    
    if (isolatedKeys.includes(e.key)) {
      e.stopPropagation();
    }
    
    // Escape 键退出编辑态，重新选中组件
    if (e.key === 'Escape') {
      e.stopPropagation();
      setIsEditing(false);
      if (editor && typeof getPos === 'function') {
        const pos = getPos();
        if (typeof pos === 'number') {
          editor.chain().focus().setNodeSelection(pos).run();
        }
      }
    }
  }, [editor, getPos]);

  return (
    <NodeViewWrapper className="svg-block-wrapper">
      <div 
        className={`svg-card ${selected && !isEditing ? 'is-selected' : ''}`}
        style={{
          margin: '1.5rem 0',
          background: 'var(--bg-elevated)',
          border: (selected && !isEditing) ? '2px solid var(--color-accent-indigo)' : '1px solid var(--border-subtle)',
          borderRadius: '14px',
          maxWidth: '100%',
          overflow: 'hidden',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: (selected && !isEditing) ? '0 12px 32px rgba(99, 102, 241, 0.15)' : '0 2px 12px rgba(0,0,0,0.03)',
        }}
      >
        {/* Header — 点击选中整个组件 */}
        <div 
          onClick={handleHeaderClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '8px 16px',
            backgroundColor: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-subtle)',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', background: 'var(--bg-page)', borderRadius: '8px', padding: '2px', border: '1px solid var(--border-subtle)' }}>
            <button 
              onClick={(e) => { e.stopPropagation(); setViewMode('preview'); }}
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
              onClick={(e) => { e.stopPropagation(); setViewMode('code'); setIsEditing(true); }}
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
            <div 
              onClick={handleCodeAreaClick}
              onKeyDownCapture={handleEditorKeyDown}
              className="code-editor-container"
              style={{ 
                minHeight: '180px', 
                backgroundColor: 'var(--bg-page)',
                borderLeft: isEditing ? '3px solid var(--color-accent-indigo)' : '3px solid transparent',
                transition: 'border-color 0.2s',
              }}
            >
              <CodeMirror
                ref={editorRef}
                value={code}
                height="auto"
                minHeight="180px"
                theme="light"
                extensions={extensions}
                onChange={handleCodeChange}
                placeholder="粘贴 SVG 代码..."
                basicSetup={{
                  lineNumbers: true,
                  foldGutter: false,
                  dropCursor: true,
                  allowMultipleSelections: false,
                  indentOnInput: true,
                }}
                style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                }}
              />
            </div>
          ) : (
            <div 
              className="svg-preview-container custom-scrollbar"
              style={{
                padding: '32px',
                minHeight: '120px',
                maxHeight: '600px',
                backgroundColor: 'var(--bg-elevated)', 
                overflow: 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {code.trim() && !error ? (
                <div 
                  className="svg-render-wrapper"
                  style={{ width: '100%' }}
                  dangerouslySetInnerHTML={{ __html: code }} 
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
