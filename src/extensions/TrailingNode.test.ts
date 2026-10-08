import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../components/Editor/editorExtensions';
import { markdownToHtml } from '../utils/markdown';
import { loadDocFresh } from '../utils/sourceMap';

/** #9：文末永远留一个空段落，表格、图片、代码块收尾的文档下面总有地方可以点进去写 */
let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });
const load = (md: string) => {
  editor = new Editor({ extensions: editorExtensions, content: markdownToHtml(md) });
  loadDocFresh(editor, markdownToHtml(md));
  return editor;
};
const last = (ed: Editor) => ed.state.doc.lastChild!;

describe('文末的空段落', () => {
  it('表格 / 图片 / 代码块 / 图表收尾：载入后文末补一个空段落', () => {
    for (const md of ['| a |\n|---|\n| 1 |\n', '![图](a.png)\n', '```js\nlet a\n```\n', '```mermaid\ngraph TD\nA-->B\n```\n']) {
      const ed = load(md);
      expect(last(ed).type.name).toBe('paragraph');
      expect(last(ed).content.size).toBe(0);
      ed.destroy();
    }
  });

  it('文末是段落或标题就不补：它们末尾回车就能另起一段', () => {
    expect(load('# 标题\n\n一段话\n').state.doc.childCount).toBe(2);
    editor?.destroy();
    expect(load('一段话\n\n# 末尾的标题\n').state.doc.childCount).toBe(2);
  });

  it('把文末的段落删掉、表格又成了最后一块：马上再补一个', () => {
    const ed = load('| a |\n|---|\n| 1 |\n\n结尾\n');
    expect(ed.state.doc.childCount).toBe(2);
    const table = ed.state.doc.child(0);
    ed.commands.deleteRange({ from: table.nodeSize, to: ed.state.doc.content.size });
    expect(ed.state.doc.childCount).toBe(2);
    expect(last(ed).type.name).toBe('paragraph');
    expect(last(ed).content.size).toBe(0);
  });
});
