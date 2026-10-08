import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * 文末永远留一个空段落（#9）。
 * 表格、图表、图片、代码块收尾的文档，光标出不了最后那个块：鼠标点不出新行，回车只会让表格的最后一行越来越高。
 * 段落、标题收尾的不补：它们末尾回车就能另起一段。
 * 文末多一个空段落，下面就总有地方可以点进去接着写。保存时这个空段落不写进文件（见 incrementalMarkdown.ts）。
 */
const needsTrailing = (doc: PMNode) => {
  const last = doc.lastChild;
  // 段落和标题末尾回车本来就能另起一段，不用补
  return !!last && last.type.name !== 'paragraph' && last.type.name !== 'heading';
};

export const TrailingNode = Extension.create({
  name: 'trailingNode',
  addProseMirrorPlugins() {
    const key = new PluginKey<boolean>('trailingNode');
    return [
      new Plugin<boolean>({
        key,
        appendTransaction: (_transactions, _oldState, state) => {
          if (!key.getState(state)) return null;
          return state.tr.insert(state.doc.content.size, state.schema.nodes.paragraph.create());
        },
        state: {
          init: (_config, state) => needsTrailing(state.doc),
          apply: (tr, value) => (tr.docChanged ? needsTrailing(tr.doc) : value),
        },
      }),
    ];
  },
});
