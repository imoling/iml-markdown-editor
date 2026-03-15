import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { MermaidBlock } from '../components/Editor/nodes/MermaidBlock';
import { toBase64, fromBase64 } from '../utils/markdown';

export const DiagramExtension = Node.create({
  name: 'diagram',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      code: {
        default: 'graph TD\n  Start --> End',
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute('data-code') || '';
          if (raw.startsWith('base64:')) {
            return fromBase64(raw.substring(7));
          }
          return raw;
        },
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
