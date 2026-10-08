import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../components/Editor/editorExtensions';
import { markdownToHtml } from './markdown';
import { serializeDoc } from './incrementalMarkdown';
import { registerSource, loadDocFresh } from './sourceMap';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

const A = '# 笔记甲\n\n甲的正文。';
const B = '---\ntags: [x]\n---\n\n# 笔记乙\n\n乙的正文 #标签 和 [[链接]]。\n\n![[嵌入]]';

describe('切换标签页时换文档', () => {
  it('对照：只 setContent 的话，撤销会把上一篇整篇撤回来（这就是要防的事）', () => {
    editor = new Editor({ extensions: editorExtensions, content: markdownToHtml(A) });
    editor.commands.setContent(markdownToHtml(B), false);
    editor.commands.undo();
    expect(serializeDoc(editor).markdown).toBe(A);
  });

  it('loadDocFresh 之后撤销栈是空的：按多少次 ⌘Z 都还是这一篇', () => {
    editor = new Editor({ extensions: editorExtensions, content: markdownToHtml(A) });
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: 'paragraph', content: [{ type: 'text', text: '在甲里打的字' }] });
    loadDocFresh(editor, markdownToHtml(B));
    registerSource(editor, B);
    expect(editor.can().undo()).toBe(false);
    for (let i = 0; i < 5; i++) editor.commands.undo();
    expect(serializeDoc(editor).markdown).toBe(B);
  });

  it('换过来之后照常能编辑、能撤销自己这一篇里的改动；装饰（标签高亮）、原文保真都还在', () => {
    editor = new Editor({ extensions: editorExtensions, content: markdownToHtml(A) });
    loadDocFresh(editor, markdownToHtml(B));
    registerSource(editor, B);
    expect(editor.getHTML()).toContain('data-wiki-embed');
    // 乙以嵌入收尾，载入后文末补了一个空段落（TrailingNode）：在那里打字，就是乙后面新加的一段
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, '新加的一段');
    expect(serializeDoc(editor).markdown).toBe(`${B}\n\n新加的一段`);
    editor.commands.undo();
    expect(serializeDoc(editor).markdown).toBe(B);
    editor.commands.undo();
    expect(serializeDoc(editor).markdown).toBe(B);
  });
});
