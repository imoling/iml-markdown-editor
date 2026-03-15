import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { SVGBlock } from '../components/Editor/nodes/SVGBlock';
import { toBase64, fromBase64 } from '../utils/markdown';

export const SVGExtension = Node.create({
  name: 'svgBlock',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      code: {
        default: '<svg width="100" height="100" viewBox="0 0 100 100">\n  <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />\n</svg>',
        parseHTML: (element: HTMLElement) => {
          const raw = element.getAttribute('data-code') || '';
          if (raw.startsWith('base64:')) {
            return fromBase64(raw.substring(7));
          }
          return raw;
        },
        renderHTML: (attributes: Record<string, any>) => ({
          'data-code': `base64:${toBase64(attributes.code)}`,
          'data-svg-block': '',
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-svg-block]',
      },
      {
        tag: 'pre[data-svg-block]',
      },
      {
        tag: 'svg-block',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-svg-block': '' }), '[svg]'];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SVGBlock);
  },
});
