import { Extension, combineTransactionSteps, getChangedRanges } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * 有序列表中间插进一段文字时，列表被拆成两段，后一段接着前面数（轻量版 #12）。
 * 只管这一次编辑拆开的：文件里本来就写成两个从 1 开始的列表，是作者的意思，不动。
 */
export const ListNumbering = Extension.create({
  name: 'listNumbering',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('listNumbering'),
        appendTransaction(transactions, oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;
          const transform = combineTransactionSteps(oldState.doc, [...transactions]);
          const toOld = transform.mapping.invert();
          /** 新文档里这个列表，在改之前属于哪个有序列表 */
          const oldList = (pos: number) => {
            const $pos = oldState.doc.resolve(toOld.map(pos + 1));
            for (let depth = $pos.depth; depth > 0; depth--) {
              if ($pos.node(depth).type.name === 'orderedList') return $pos.before(depth);
            }
            return -1;
          };

          const { tr } = newState;
          const renumber = (node: PMNode, pos: number, parent: PMNode | null, index: number) => {
            if (node.type.name !== 'orderedList' || !parent) return;
            let at = pos;
            for (let i = index - 1; i >= 0; i--) {
              const before = parent.child(i);
              at -= before.nodeSize;
              if (before.type.name !== 'orderedList') continue;
              const source = oldList(at);
              const start = (before.attrs.start ?? 1) + before.childCount;
              if (source >= 0 && source === oldList(pos) && node.attrs.start !== start) {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, start });
              }
              return;
            }
          };
          for (const { newRange } of getChangedRanges(transform)) {
            // 被拆出来的后一段紧跟在改动范围后面，多看两格
            newState.doc.nodesBetween(newRange.from, Math.min(newRange.to + 2, newState.doc.content.size), (node, pos, parent, index) => {
              renumber(node, pos, parent, index);
              return true;
            });
          }
          return tr.steps.length ? tr : null;
        },
      }),
    ];
  },
});
