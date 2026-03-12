import { Node, mergeAttributes } from '@tiptap/core';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export const MathExtension = Node.create({
  name: 'math',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      latex: {
        default: 'e = mc^2',
        parseHTML: element => element.getAttribute('data-latex'),
        renderHTML: attributes => ({
          'data-latex': attributes.latex,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-latex]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'math-block' })];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'math-block-container';
      dom.title = '双击或点击编辑公式';
      dom.contentEditable = 'false';
      dom.style.pointerEvents = 'auto'; // Ensure it's reachable
      
      let currentLatex = node.attrs.latex || 'e = mc^2';

      const render = (latex: string) => {
        try {
          // Clear previous content
          dom.innerHTML = '';
          katex.render(latex, dom, {
            displayMode: true,
            throwOnError: false,
          });
        } catch (e) {
          dom.textContent = latex;
        }
      };

      const handleEdit = () => {
        // Use a timeout to avoid collision with focus events
        setTimeout(() => {
          const newLatex = window.prompt('编辑公式 (LaTeX):', currentLatex);
          
          if (newLatex !== null && newLatex !== currentLatex) {
            if (typeof getPos === 'function') {
              editor.commands.command(({ tr }) => {
                const pos = getPos();
                if (typeof pos === 'number') {
                  tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    latex: newLatex,
                  });
                  return true;
                }
                return false;
              });
            }
          }
        }, 50);
      };

      // Use mousedown as it's often more reliable in Prosemirror atoms
      dom.addEventListener('mousedown', (e) => {
        // If the node is already selected or we click it, trigger edit
        // We let the first click select it, subsequent clicks edit it?
        // Actually, let's just use double click for editing or a single reliable click
        // But the user said "点击公式区域" (click)
        // Let's try both to be safe
      });

      dom.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleEdit();
      });

      render(currentLatex);

      return {
        dom,
        // stopEvent is critical for atoms to let events reach the DOM element
        stopEvent: (event: Event) => {
          return event.type === 'click' || event.type === 'mousedown';
        },
        update: (updatedNode) => {
          if (updatedNode.type !== this.type) return false;
          if (updatedNode.attrs.latex !== currentLatex) {
             currentLatex = updatedNode.attrs.latex;
             render(currentLatex);
          }
          return true;
        },
      };
    };
  },
});
