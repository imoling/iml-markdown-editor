import { Extension } from '@tiptap/core';
import { Selection, TextSelection } from '@tiptap/pm/state';
import { TableMap, cellAround } from '@tiptap/pm/tables';

/**
 * 表格里的回车（#9）：回车到正下方那一格，最后一行回车跳出表格；格内换行用 Shift+回车。
 * 原来回车是在格里另起一段，填完表格想接着往下写，最后一行只会越敲越高。
 */
export const TableEnter = Extension.create({
  name: 'tableEnter',
  // 要抢在 StarterKit 的回车（在格里另起一段）前面
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        if (!selection.empty) return false;
        const { $from } = selection;
        if ($from.parent.type.name !== 'paragraph') return false;
        const $cell = cellAround($from);
        // 只管光标直接落在单元格的段落里的情况；格里嵌的列表照常
        if (!$cell || $from.depth !== $cell.depth + 2) return false;

        const tableDepth = $cell.depth - 1;
        const table = $cell.node(tableDepth);
        const tableStart = $cell.start(tableDepth);
        const map = TableMap.get(table);
        const rect = map.findCell($cell.pos - tableStart);

        if (rect.bottom < map.height) {
          // 下面还有行：光标放到正下方那一格的末尾
          const below = map.map[rect.bottom * map.width + rect.left];
          const cell = table.nodeAt(below);
          if (!cell) return false;
          const end = tableStart + below + cell.nodeSize - 1;
          view.dispatch(state.tr.setSelection(Selection.near(state.doc.resolve(end), -1)).scrollIntoView());
          return true;
        }

        // 最后一行：跳出表格。表格后面就是空段落的话直接落进去，否则新起一段
        const after = $cell.after(tableDepth);
        const next = state.doc.nodeAt(after);
        const tr = state.tr;
        if (!next || next.type.name !== 'paragraph' || next.content.size > 0) tr.insert(after, state.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, after + 1)).scrollIntoView();
        view.dispatch(tr);
        return true;
      },
    };
  },
});
