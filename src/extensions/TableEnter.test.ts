import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../components/Editor/editorExtensions';
import { markdownToHtml } from '../utils/markdown';
import { serializeDoc } from '../utils/incrementalMarkdown';
import { registerSource, loadDocFresh } from '../utils/sourceMap';

/** #9：表格里回车到正下方那一格，最后一行回车跳出表格；Shift+回车才在格内换行 */
let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

const TABLE = '| 名称 | 数量 |\n| --- | --- |\n| 苹果 | 3 |\n| 梨 | 5 |\n';
const open = (md: string) => {
  editor = new Editor({ extensions: editorExtensions, content: markdownToHtml(md) });
  loadDocFresh(editor, markdownToHtml(md));
  registerSource(editor, md);
  return editor;
};
/** 光标放到含这段文字的单元格末尾 */
function cursorAfter(ed: Editor, text: string) {
  let pos = -1;
  ed.state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text === text) pos = p + node.nodeSize; return pos < 0; });
  ed.commands.setTextSelection(pos);
}
const press = (ed: Editor, key: string, init: KeyboardEventInit = {}) =>
  ed.view.someProp('handleKeyDown', (handler) => handler(ed.view, new KeyboardEvent('keydown', { key, ...init })));
const parentText = (ed: Editor) => ed.state.selection.$from.parent.textContent;
const types = (ed: Editor) => { const out: string[] = []; ed.state.doc.forEach((n) => out.push(n.type.name)); return out; };

describe('表格里的回车（#9）', () => {
  it('表头回车到第一行同一列，再回车到下一行；表格本身不变', () => {
    const ed = open(TABLE);
    cursorAfter(ed, '数量');
    expect(press(ed, 'Enter')).toBe(true);
    expect(parentText(ed)).toBe('3');
    press(ed, 'Enter');
    expect(parentText(ed)).toBe('5');
    expect(serializeDoc(ed).markdown).toBe(TABLE);
  });

  it('最后一行回车跳出表格：光标落在表格后面的空段落里，不动文件；在那里打字就是表格后面的一段', () => {
    const ed = open(TABLE);
    cursorAfter(ed, '5');
    press(ed, 'Enter');
    expect(types(ed)).toEqual(['table', 'paragraph']);
    expect(ed.state.selection.$from.parent.type.name).toBe('paragraph');
    expect(ed.state.selection.$from.depth).toBe(1);
    expect(serializeDoc(ed).markdown).toBe(TABLE);
    ed.commands.insertContent('后面的话');
    expect(serializeDoc(ed).markdown).toBe(`${TABLE}\n后面的话\n`);
  });

  it('表格后面紧跟着标题：最后一行回车在中间新起一段，不是跳进标题', () => {
    const ed = open(`${TABLE}\n## 下一节\n`);
    cursorAfter(ed, '5');
    press(ed, 'Enter');
    expect(types(ed)).toEqual(['table', 'paragraph', 'heading']);
    expect(parentText(ed)).toBe('');
    ed.commands.insertContent('夹在中间');
    expect(serializeDoc(ed).markdown).toBe(`${TABLE}\n夹在中间\n\n## 下一节\n`);
  });

  it('Shift+回车在格内换行，不跳格', () => {
    const ed = open(TABLE);
    cursorAfter(ed, '苹果');
    expect(press(ed, 'Enter', { shiftKey: true })).toBe(true);
    let breaks = 0;
    ed.state.doc.descendants((node) => { if (node.type.name === 'hardBreak') breaks++; return true; });
    expect(breaks).toBe(1);
    expect(types(ed)).toEqual(['table', 'paragraph']);
  });

  it('不在表格里的回车照常另起一段', () => {
    const ed = open('一段话\n');
    cursorAfter(ed, '一段话');
    press(ed, 'Enter');
    expect(types(ed)).toEqual(['paragraph', 'paragraph']);
  });
});
