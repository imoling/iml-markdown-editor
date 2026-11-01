import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../components/Editor/editorExtensions';
import { markdownToHtml } from '../utils/markdown';
import { serializeDoc } from '../utils/incrementalMarkdown';
import { registerSource, loadDocFresh } from '../utils/sourceMap';

/** 轻量版 #12：列表中间插一段文字，后一段接着数 */
let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

const open = (md: string) => {
  editor = new Editor({ extensions: editorExtensions, content: markdownToHtml(md) });
  loadDocFresh(editor, markdownToHtml(md));
  registerSource(editor, md);
  return editor;
};
function cursorAfter(ed: Editor, text: string, nth = 0) {
  let pos = -1;
  let seen = 0;
  ed.state.doc.descendants((node, p) => {
    if (pos < 0 && node.isText && node.text === text && seen++ === nth) pos = p + node.nodeSize;
    return pos < 0;
  });
  ed.commands.setTextSelection(pos);
}
const press = (ed: Editor, key: string) =>
  ed.view.someProp('handleKeyDown', (handler) => handler(ed.view, new KeyboardEvent('keydown', { key })));
const starts = (ed: Editor) => {
  const out: number[] = [];
  ed.state.doc.forEach((n) => { if (n.type.name === 'orderedList') out.push(n.attrs.start); });
  return out;
};

describe('有序列表被拆开后接着数', () => {
  it('标题列表项后面回车插一段，后一段接着数，写回文件也是', () => {
    const ed = open('1. # **测试**\n2. # **测试**\n3. # **测试**\n');
    cursorAfter(ed, '测试');
    press(ed, 'Enter');
    ed.commands.insertContent('123123');
    expect(starts(ed)).toEqual([1, 2]);
    expect(serializeDoc(ed).markdown.match(/^\d+\.\s/gm)).toEqual(['1. ', '2. ', '3. ']);
  });

  it('普通列表项：空项上回车跳出列表，后一段接着数', () => {
    const ed = open('1. 一\n2. 二\n3. 三\n');
    cursorAfter(ed, '一');
    press(ed, 'Enter');
    press(ed, 'Enter');
    expect(starts(ed)).toEqual([1, 2]);
  });

  it('从 5 开始的列表拆开：后一段接着 5 往下数', () => {
    const ed = open('5. 一\n6. 二\n7. 三\n');
    cursorAfter(ed, '二');
    press(ed, 'Enter');
    press(ed, 'Enter');
    expect(starts(ed)).toEqual([5, 7]);
  });

  it('一次撤销连编号一起撤回', () => {
    const ed = open('1. 一\n2. 二\n3. 三\n');
    cursorAfter(ed, '一');
    press(ed, 'Enter');
    press(ed, 'Enter');
    ed.commands.undo();
    ed.commands.undo();
    expect(starts(ed)).toEqual([1]);
  });

  it('文件里本来就是两个从 1 开始的列表：不动', () => {
    const ed = open('1. 一\n2. 二\n\n一段话\n\n1. 新列表\n2. 第二项\n');
    expect(starts(ed)).toEqual([1, 1]);
    cursorAfter(ed, '一段话');
    ed.commands.insertContent('加几个字');
    cursorAfter(ed, '新列表');
    press(ed, 'Enter');
    expect(starts(ed)).toEqual([1, 1]);
  });

  it('整篇换内容（切换标签、外部改动）不算拆开', () => {
    const ed = open('1. 一\n2. 二\n');
    ed.commands.setContent(markdownToHtml('1. 甲\n\n段落\n\n1. 乙\n'));
    expect(starts(ed)).toEqual([1, 1]);
  });
});
