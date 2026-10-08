import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { loadMermaid } from '../../../utils/mermaidLoader';
import { Terminal, Eye, ZoomIn, ZoomOut, Scan } from 'lucide-react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { BlockCard, ResizeHandle, useResizableHeight } from './BlockCard';
import { clampZoom, ZOOM_MAX, ZOOM_MIN } from '../../../utils/diagramMeta';

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
  /** 预览的缩放倍数：1 是 Mermaid 自己定的自然大小。和拖出来的高度一样存在节点属性里，保存时写进代码第一行的注释 */
  const zoom: number = node.attrs.zoom || 1;
  const setZoom = (next: number) => updateAttributes({ zoom: clampZoom(next) });
  const renderCount = useRef(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const { isResizing, currentHeight, onMouseDown } = useResizableHeight(node.attrs.height, previewRef, (height) => updateAttributes({ height }));

  // React 比的是这个对象的身份：每次渲染都给新对象的话，任何一次无关的重渲染都会重设 innerHTML，图会闪
  const markup = useMemo(() => ({ __html: svg || '<div class="block-card__placeholder">等待输入内容…</div>' }), [svg]);

  // 缩放（#8）：改 svg 的宽度，高度跟着比例走，放大后比预览区宽的部分靠预览区的滚动条看。
  // 回到 1 就还原成 Mermaid 写在行内的自然宽度（max-width），让它自己决定多大
  useEffect(() => {
    const el = previewRef.current?.querySelector('svg');
    if (!el) return;
    if (zoom === 1) {
      el.style.removeProperty('width');
      el.style.removeProperty('max-height');
      if (el.dataset.naturalWidth) el.style.maxWidth = `${el.dataset.naturalWidth}px`;
      return;
    }
    const natural = parseFloat(el.dataset.naturalWidth || '') || parseFloat(el.style.maxWidth) || el.getBoundingClientRect().width;
    if (!natural) return;
    el.dataset.naturalWidth = String(natural);
    // 拖过高度的卡片样式表里有 max-height: 100%，不解开的话放大会被卡片高度顶住
    el.style.maxWidth = 'none';
    el.style.maxHeight = 'none';
    el.style.width = `${Math.round(natural * zoom)}px`;
  }, [svg, zoom]);

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
        // 原样放进去：Mermaid 在 svg 上写了 width="100%" 和 style="max-width: 真实宽度"，再塞一个 style 进去会把它的 max-width 顶掉，小图就被拉满了（#8）
        setSvg(renderedSvg);
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
                dangerouslySetInnerHTML={markup}
              />
            </div>
            {svg && (
              <div className="block-card__zoom" contentEditable={false}>
                <button type="button" className="block-card__zoom-btn" title="放大" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setZoom(Math.min(ZOOM_MAX, zoom * 1.25)); }}><ZoomIn size={14} /></button>
                <button type="button" className="block-card__zoom-btn" title="缩小" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setZoom(Math.max(ZOOM_MIN, zoom / 1.25)); }}><ZoomOut size={14} /></button>
                <button type="button" className="block-card__zoom-btn" title="原始大小" disabled={zoom === 1} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setZoom(1); }}><Scan size={14} /></button>
              </div>
            )}
            <ResizeHandle resizing={isResizing} onMouseDown={onMouseDown} />
          </div>
        )}
      </BlockCard>
    </NodeViewWrapper>
  );
};
