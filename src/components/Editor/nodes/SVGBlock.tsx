import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { languages } from '@codemirror/language-data';
import { Eye, FileCode } from 'lucide-react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { sanitizeSvg } from '../../../utils/sanitize';
import { BlockCard, ResizeHandle, useResizableHeight } from './BlockCard';

export const SVGBlock: React.FC<NodeViewProps> = ({ node, updateAttributes, selected, editor, getPos }) => {
  const [code, setCode] = useState(node.attrs.code || '');
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [isEditing, setIsEditing] = useState(false);
  const [extensions, setExtensions] = useState<any[]>([EditorView.lineWrapping]);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const { isResizing, currentHeight, onMouseDown } = useResizableHeight(node.attrs.height, previewRef, (height) => updateAttributes({ height }));

  useEffect(() => {
    if (node.attrs.code !== code) setCode(node.attrs.code);
  }, [node.attrs.code]);

  useEffect(() => {
    const htmlLang = languages.find((l) => l.name === 'HTML' || l.alias.includes('html'));
    htmlLang?.load().then((lang) => setExtensions([EditorView.lineWrapping, lang]));
  }, []);

  useEffect(() => {
    const clean = code.trim();
    const lower = clean.toLowerCase();
    if (!clean) setError(null);
    else if (!lower.includes('<svg') || !lower.includes('</svg>')) { if (clean.length > 20) setError('无效的 SVG 代码'); }
    else setError(null);
  }, [code]);

  useEffect(() => {
    if (viewMode === 'preview') setIsEditing(false);
  }, [viewMode]);

  useEffect(() => {
    if (viewMode === 'code' && isEditing) requestAnimationFrame(() => editorRef.current?.view?.focus());
  }, [viewMode, isEditing]);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    updateAttributes({ code: newCode });
  };

  const selectNode = useCallback(() => {
    setIsEditing(false);
    if (editor && typeof getPos === 'function') {
      const pos = getPos();
      if (typeof pos === 'number') editor.chain().focus().setNodeSelection(pos).run();
    }
  }, [editor, getPos]);

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

  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (['Backspace', 'Delete', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.stopPropagation();
    if (e.key === 'Escape') {
      e.stopPropagation();
      selectNode();
    }
  }, [selectNode]);

  /** 双击预览里的元素 → 跳到代码里对应文本 */
  const handlePreviewDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const target = e.target as HTMLElement;
    const labelText = target.textContent?.trim() || target.getAttribute('id') || '';
    if (!labelText || labelText.length < 2) return;
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
    <NodeViewWrapper className="svg-block-wrapper">
      <BlockCard
        selected={selected}
        isEditing={isEditing}
        viewMode={viewMode}
        onHeaderClick={selectNode}
        onPreview={() => setViewMode('preview')}
        onCode={() => { setViewMode('code'); setIsEditing(true); }}
        previewIcon={<Eye size={13} />}
        codeIcon={<FileCode size={13} />}
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
              extensions={extensions}
              onChange={handleCodeChange}
              placeholder="粘贴 SVG 代码…"
              basicSetup={{ lineNumbers: true, foldGutter: false, dropCursor: true, allowMultipleSelections: false, indentOnInput: true }}
              className="block-card__cm"
            />
          </div>
        ) : (
          <div className="block-card__preview-wrap">
            <div
              ref={previewRef}
              className={`svg-preview-container custom-scrollbar block-card__preview block-card__preview--center ${isResizing ? 'block-card__preview--resizing' : ''}`}
              style={{ height: currentHeight }}
            >
              {code.trim() && !error ? (
                <div className="svg-render-wrapper block-card__canvas" onDoubleClick={handlePreviewDoubleClick} title="双击元素以定位源码" dangerouslySetInnerHTML={{ __html: sanitizeSvg(code) }} />
              ) : (
                <div className="block-card__placeholder">{error || '等待输入内容…'}</div>
              )}
            </div>
            <ResizeHandle resizing={isResizing} onMouseDown={onMouseDown} />
          </div>
        )}
      </BlockCard>
    </NodeViewWrapper>
  );
};
