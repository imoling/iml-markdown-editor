import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MermaidBlock } from '../components/Editor/nodes/MermaidBlock';
import { toBase64, fromBase64 } from '../utils/markdown';
import { splitDiagramMeta } from '../utils/diagramMeta';

/** data-code 里的代码（base64 或明文）；打开文件时它带着第一行的 %% iml: 设置 */
const decodeCode = (element: HTMLElement) => {
  const raw = element.getAttribute('data-code') || '';
  return raw.startsWith('base64:') ? fromBase64(raw.substring(7)) : raw;
};

export const DiagramExtension = Node.create({
  name: 'diagram',

  group: 'block',

  atom: true,

  addAttributes() {
    // 卡片高度与缩放是「看」的设置，存在代码第一行的 %% iml: 注释里（见 utils/diagramMeta.ts）：
    // 打开文件时从那一行读，编辑器内部的 HTML（复制粘贴）直接带属性；code 属性里不含那一行
    return {
      height: {
        default: 'auto',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-height') || splitDiagramMeta(decodeCode(element)).meta.height,
        renderHTML: (attributes: Record<string, any>) => ({
          'data-height': attributes.height,
        }),
      },
      zoom: {
        default: 1,
        parseHTML: (element: HTMLElement) => {
          const own = parseFloat(element.getAttribute('data-zoom') || '');
          return own > 0 ? own : splitDiagramMeta(decodeCode(element)).meta.zoom;
        },
        renderHTML: (attributes: Record<string, any>) => ({ 'data-zoom': String(attributes.zoom) }),
      },
      code: {
        default: 'graph TD\n  Start --> End',
        parseHTML: (element: HTMLElement) => splitDiagramMeta(decodeCode(element)).code,
        renderHTML: (attributes: Record<string, any>) => ({
          'data-code': `base64:${toBase64(attributes.code)}`,
          'data-mermaid-block': '',
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-mermaid-block]',
      },
      {
        tag: 'pre[data-mermaid-block]',
      },
      {
        tag: 'mermaid-block',
      },
      {
        tag: 'div.mermaid-diagram',
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-mermaid-block': '' }), '[mermaid]'];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidBlock);
  },
});
