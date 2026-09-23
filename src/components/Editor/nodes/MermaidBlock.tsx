import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { loadMermaid } from '../../../utils/mermaidLoader';
import { Terminal, Eye } from 'lucide-react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { BlockCard, ResizeHandle, useResizableHeight } from './BlockCard';

const MERMAID_BASE = {
  startOnLoad: false,
  securityLevel: 'antiscript' as const,
  logLevel: 'error' as const,
  themeVariables: {
    fontSize: '16px',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    nodePadding: 20,
  },
  flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' as const, nodeSpacing: 50, rankSpacing: 50 },
  gantt: { useMaxWidth: true, topPadding: 50, barGap: 4, barHeight: 20 },
};


const VALID_START = /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|journey|C4Context|mindmap|timeline)/i;
const INCOMPLETE_TAIL = /\s*(-->|--|->|==>|~>|\||\[|\(|\{|"|')\s*$/;
const ERROR_MARKERS = ['mermaid-errndr', 'Syntax error', 'version 11.13.0', 'class="error-icon"', 'class="error-text"'];
const isEOF = (s: string) => /got\s+['"]EOF['"]|Expecting/i.test(s);

export const MermaidBlock: React.FC<NodeViewProps> = ({ node, updateAttributes, selected, editor, getPos }) => {
  const [code, setCode] = useState(node.attrs.code || '');
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [isEditing, setIsEditing] = useState(false);
  const renderCount = useRef(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const { isResizing, currentHeight, onMouseDown } = useResizableHeight(node.attrs.height, previewRef, (height) => updateAttributes({ height }));

  useEffect(() => {
    if (node.attrs.code !== code) setCode(node.attrs.code);
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
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const mermaid = await loadMermaid();
      if (currentRenderId !== renderCount.current) return;
      mermaid.initialize({ ...MERMAID_BASE, theme: isDark ? 'dark' : 'default' });

      // 流式输入中的半截代码不渲染，安静等待
      if (!VALID_START.test(cleanText) || INCOMPLETE_TAIL.test(cleanText)) {
        setIsRendering(false);
        return;
      }
      try {
        await mermaid.parse(cleanText);
      } catch (parseError) {
        if (currentRenderId === renderCount.current) {
          setError(isEOF(String(parseError)) ? null : '语法检查未通过');
          setIsRendering(false);
        }
        return;
      }

      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
      const { svg: renderedSvg } = await mermaid.render(id, cleanText);
      if (currentRenderId !== renderCount.current) return;

      if (ERROR_MARKERS.some((marker) => renderedSvg.includes(marker))) {
        setError(isEOF(renderedSvg) ? null : '图表构建中…');
      } else {
        setSvg(renderedSvg.replace(/<svg/, '<svg style="height: 100%; width: 100%; display: block; margin: auto;"'));
        setError(null);
      }
    } catch (err) {
      if (currentRenderId !== renderCount.current) return;
      if (!isEOF(String(err))) setError('渲染异常');
    } finally {
      if (currentRenderId === renderCount.current) setIsRendering(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => renderMermaid(code), 500);
    return () => clearTimeout(timer);
  }, [code]);

  // 主题切换时按新主题重绘
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.attributeName === 'data-theme')) renderMermaid(code);
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [code]);

  useEffect(() => {
    if (viewMode === 'preview') {
      renderMermaid(code);
      setIsEditing(false);
    }
  }, [viewMode]);

  useEffect(() => {
    if (viewMode === 'code' && isEditing) requestAnimationFrame(() => editorRef.current?.view?.focus());
  }, [viewMode, isEditing]);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    updateAttributes({ code: newCode });
  };

  /** 点击顶栏 → 选中组件整体，方便移动 / 删除 / 撤销 */
  const selectNode = useCallback(() => {
    setIsEditing(false);
    if (editor && typeof getPos === 'function') {
      const pos = getPos();
      if (typeof pos === 'number') editor.chain().focus().setNodeSelection(pos).run();
    }
  }, [editor, getPos]);

  /** 点击代码区域 → 取消 ProseMirror 选中，进入代码编辑态 */
  const handleCodeAreaClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    if (editor && typeof getPos === 'function') {
      const pos = getPos();
      if (typeof pos === 'number') {
        try { editor.commands.setTextSelection(pos + node.nodeSize); } catch { /* 文档末尾没有后续位置 */ }
      }
    }
    requestAnimationFrame(() => editorRef.current?.view?.focus());
  }, [editor, getPos, node.nodeSize]);

  /** 代码编辑态下的按键不冒泡到 ProseMirror；Esc 退出编辑并重新选中组件 */
  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (['Backspace', 'Delete', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.stopPropagation();
    if (e.key === 'Escape') {
      e.stopPropagation();
      selectNode();
    }
  }, [selectNode]);

  /** 双击预览里的节点 → 跳到代码里对应文本 */
  const handlePreviewDoubleClick = useCallback((e: React.MouseEvent) => {
    const nodeElement = (e.target as HTMLElement).closest('.node');
    if (!nodeElement) return;
    const labelText = (nodeElement.querySelector('.label') || nodeElement.querySelector('text') || nodeElement).textContent?.trim();
    if (!labelText) return;
    const index = code.indexOf(labelText);
    if (index === -1) return;
    setViewMode('code');
    setIsEditing(true);
    requestAnimationFrame(() => {
      const view = editorRef.current?.view;
      if (view) {
        view.focus();
        view.dispatch({ selection: { anchor: index, head: index + labelText.length }, scrollIntoView: true });
      }
    });
  }, [code]);

  return (
    <NodeViewWrapper className="mermaid-block-wrapper">
      <BlockCard
        selected={selected}
        isEditing={isEditing}
        viewMode={viewMode}
        onHeaderClick={selectNode}
        onPreview={() => setViewMode('preview')}
        onCode={() => { setViewMode('code'); setIsEditing(true); }}
        previewIcon={<Eye size={13} />}
        codeIcon={<Terminal size={13} />}
        rendering={isRendering}
        error={error}
      >
        {viewMode === 'code' ? (
          <div onClick={handleCodeAreaClick} onKeyDownCapture={handleEditorKeyDown} className={`code-editor-container block-card__code ${isEditing ? 'block-card__code--editing' : ''}`}>
            <CodeMirror
              ref={editorRef}
              value={code}
              height="auto"
              minHeight="180px"
              theme="light"
              extensions={[EditorView.lineWrapping]}
              onChange={handleCodeChange}
              placeholder="输入 Mermaid 代码…"
              basicSetup={{ lineNumbers: true, foldGutter: false, dropCursor: true, allowMultipleSelections: false, indentOnInput: true }}
              className="block-card__cm"
            />
          </div>
        ) : (
          <div className="block-card__preview-wrap">
            <div
              ref={previewRef}
              className={`mermaid-preview-container custom-scrollbar block-card__preview ${isResizing ? 'block-card__preview--resizing' : ''}`}
              style={{ height: currentHeight }}
            >
              <div
                onDoubleClick={handlePreviewDoubleClick}
                className="block-card__canvas"
                title="双击节点以定位源码"
                dangerouslySetInnerHTML={{ __html: svg || '<div class="block-card__placeholder">等待输入内容…</div>' }}
              />
            </div>
            <ResizeHandle resizing={isResizing} onMouseDown={onMouseDown} />
          </div>
        )}
      </BlockCard>
    </NodeViewWrapper>
  );
};
