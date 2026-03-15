import React, { useState, useEffect, useRef } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import mermaid from 'mermaid';
import { Terminal, Eye, AlertCircle, Loader2 } from 'lucide-react';

// Initialize mermaid once outside to ensure stable configuration
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  logLevel: 'error',
  themeVariables: {
    fontSize: '14px',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
  }
});

export const MermaidBlock: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const [code, setCode] = useState(node.attrs.code || '');
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const renderCount = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

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
      const isIncompleteText = /\s*(-->|--|->|==>|~>|\||\[|\(|\{|\"|\')\s*$/.test(cleanText);
      
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
        const responsiveSvg = renderedSvg.replace(
          /<svg/, 
          '<svg style="max-width: 100%; height: auto; display: block; margin: auto;"'
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
    }
  }, [viewMode]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value;
    setCode(newCode);
    updateAttributes({ code: newCode });
  };

  return (
    <NodeViewWrapper className="mermaid-block-wrapper">
      <div 
        className={`mermaid-card ${selected ? 'is-selected' : ''}`}
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
            <textarea
              value={code}
              onChange={handleCodeChange}
              placeholder="输入 Mermaid 代码..."
              spellCheck={false}
              autoFocus
              style={{
                width: '100%',
                minHeight: '180px',
                padding: '20px',
                fontFamily: 'var(--font-mono)',
                fontSize: '13px',
                lineHeight: '1.7',
                border: 'none',
                outline: 'none',
                backgroundColor: 'var(--bg-page)',
                color: 'var(--text-primary)',
                resize: 'vertical',
              }}
            />
          ) : (
            <div 
              ref={containerRef}
              className="mermaid-preview-container"
              style={{
                padding: '24px',
                minHeight: '120px',
                maxHeight: '600px',
                backgroundColor: 'var(--bg-elevated)',
                overflow: 'auto',
                scrollbarWidth: 'thin',
                display: 'grid',
                placeItems: 'center'
              }}
              dangerouslySetInnerHTML={{ __html: svg || '<div style="color:var(--text-muted);font-size:12px;opacity:0.6">等待输入内容...</div>' }}
            />
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
};
