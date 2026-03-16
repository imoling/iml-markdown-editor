import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import mermaid from 'mermaid';
import { Terminal, Eye, AlertCircle, Loader2 } from 'lucide-react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';

// Initialize mermaid once outside to ensure stable configuration
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  logLevel: 'error',
  themeVariables: {
    fontSize: '16px',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    nodePadding: 20, // 增加节点内边距缓冲区
  },
  flowchart: {
    useMaxWidth: false,
    htmlLabels: true,
    curve: 'basis',
    nodeSpacing: 50,
    rankSpacing: 50,
  },
  gantt: {
    useMaxWidth: false,
    useWidth: 1200, 
    topPadding: 50,
    barGap: 4,
    barHeight: 20,
  }
});

export const MermaidBlock: React.FC<NodeViewProps> = ({ node, updateAttributes, selected, editor, getPos }) => {
  const [code, setCode] = useState(node.attrs.code || '');
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [isEditing, setIsEditing] = useState(false); // 代码区是否激活
  const renderCount = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // Sync state with node attributes
  useEffect(() => {
    if (node.attrs.code !== code) {
      setCode(node.attrs.code);
    }
  }, [node.attrs.code]);

  const renderMermaid = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText) {
      setSvg('');
      setError(null);
      return;
    }

    const currentRenderId = ++renderCount.current;
    setIsRendering(true);

    try {
      // 1. Pre-check: Don't even try if it's too skeletal or looks like a streaming fragment
      const validStart = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|journey|C4Context|mindmap|timeline)/i;
      const isIncompleteText = /\s*(-->|--|\->|==>|~>|\||\[|\(|\{|\"|\')\s*$/.test(cleanText);
      
      if (!validStart.test(cleanText) || isIncompleteText) {
         // Quietly wait for more input
         setIsRendering(false);
         return;
      }

      // 2. Syntax Parse (More reliable than just trying to render)
      try {
        await mermaid.parse(cleanText);
      } catch (parseError) {
        // If parsing fails, check if it's just incomplete or a real error
        const errorStr = String(parseError);
        const isEOF = /got\s+['"]EOF['"]|Expecting/i.test(errorStr);
        if (currentRenderId === renderCount.current) {
          setError(isEOF ? null : '语法检查未通过');
          setIsRendering(false);
        }
        return;
      }

      // 3. Actual Render
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
      const { svg: renderedSvg } = await mermaid.render(id, cleanText);
      
      if (currentRenderId !== renderCount.current) return;

      // 4. Double check the output for "bomb" markers (sometimes render succeeds but returns error SVG)
      const errorMarkers = [
        'mermaid-errndr', 
        'Syntax error', 
        'version 11.13.0', // Standard error text in recent versions
        'class="error-icon"',
        'class="error-text"'
      ];
      
      const hasErrorMarker = errorMarkers.some(marker => renderedSvg.includes(marker));

      if (hasErrorMarker) {
        const isEOF = /got\s+['"]EOF['"]|Expecting/i.test(renderedSvg);
        setError(isEOF ? null : '图表构建中...');
      } else {
        // Inject responsive styles into the SVG
        // NOTE: Removed max-width: 100% to allow horizontal scrolling for wide diagrams (like Gantt)
        const responsiveSvg = renderedSvg.replace(
          /<svg/, 
          '<svg style="height: auto; display: block; margin: auto;"'
        );
        setSvg(responsiveSvg);
        setError(null);
      }
    } catch (err) {
      if (currentRenderId !== renderCount.current) return;
      const errorMsg = String(err);
      const isEOF = /got\s+['"]EOF['"]|Expecting/i.test(errorMsg);
      if (!isEOF) {
        setError('渲染异常');
      }
    } finally {
      if (currentRenderId === renderCount.current) {
        setIsRendering(false);
      }
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      renderMermaid(code);
    }, 500); // Slightly longer debounce for better stability
    return () => clearTimeout(timer);
  }, [code]);

  // Re-render when switching back to preview mode just in case
  useEffect(() => {
    if (viewMode === 'preview') {
      renderMermaid(code);
      setIsEditing(false);
    }
  }, [viewMode]);

  // Auto-focus CodeMirror when switching to code mode or entering editing
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
        // 用 NodeSelection 选中整个节点
        editor.chain().focus().setNodeSelection(pos).run();
      }
    }
  }, [editor, getPos]);

  /** 点击代码区域 → 取消 ProseMirror 选中，进入代码编辑态 */
  const handleCodeAreaClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止冒泡到 NodeViewWrapper 触发 ProseMirror 选中
    setIsEditing(true);
    
    // 取消 ProseMirror 的节点选中，让它知道我们在内部编辑
    if (editor && typeof getPos === 'function') {
      const pos = getPos();
      if (typeof pos === 'number') {
        // 将 ProseMirror 光标设到节点之后，这样 Backspace 等按键不会影响节点
        try {
          editor.commands.setTextSelection(pos + node.nodeSize);
        } catch {
          // 如果节点之后没有位置（文档末尾），忽略
        }
      }
    }

    // 聚焦 CodeMirror
    requestAnimationFrame(() => {
      editorRef.current?.view?.focus();
    });
  }, [editor, getPos, node.nodeSize]);

  /** 按键深度隔离 — 所有按键事件都不要冒泡到 ProseMirror */
  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    // 在代码编辑态，阻止所有按键冒泡到 ProseMirror
    // 特别是 Backspace、Delete、Enter、Arrow keys
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
    <NodeViewWrapper className="mermaid-block-wrapper">
      <div 
        className={`mermaid-card ${selected && !isEditing ? 'is-selected' : ''}`}
        style={{
          margin: '1.5rem 0',
          background: 'var(--bg-elevated)',
          border: (selected && !isEditing) ? '2px solid var(--color-accent-indigo)' : '1px solid var(--border-subtle)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '100%',
          boxSizing: 'border-box',
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
              <Terminal size={13} />
              <span>代码</span>
            </button>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isRendering && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-accent-indigo)' }} />}
            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-accent-red)', fontSize: '11px', fontWeight: 500 }}>
                <AlertCircle size={13} />
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Content Area - Switch between Code and Preview */}
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
                extensions={[EditorView.lineWrapping]}
                onChange={handleCodeChange}
                placeholder="输入 Mermaid 代码..."
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
              ref={containerRef}
              className="mermaid-preview-container custom-scrollbar"
              style={{
                padding: '32px',
                minHeight: '120px',
                maxHeight: '600px',
                backgroundColor: 'var(--bg-elevated)',
                overflow: 'auto',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}
            >
              <div 
                style={{ 
                  margin: 'auto',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  width: 'fit-content'
                }}
                dangerouslySetInnerHTML={{ __html: svg || '<div style="color:var(--text-muted);font-size:12px;opacity:0.6">等待输入内容...</div>' }}
              />
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
};
