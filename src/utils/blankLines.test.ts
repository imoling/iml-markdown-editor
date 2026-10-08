import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../components/Editor/editorExtensions';
import { markdownToHtml } from './markdown';
import { serializeDoc } from './incrementalMarkdown';
import { registerSource, loadDocFresh, extraBlankLines, getSourceMap } from './sourceMap';

/**
 * 完整版 #7「空行被吞」：富文本里回车出来的空段落，存成文件里多出来的空行，重开还在。
 * 块与块之间隔一个空行是正常的段落间隔；再多的每个空行 ↔ 一个空段落。
 */
let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

/** 像应用里一样打开：先载入，再登记原文对照表（空段落在这一步插进来） */
const open = (md: string) => {
  editor?.destroy();
  editor = new Editor({ extensions: editorExtensions, content: markdownToHtml(md) });
  loadDocFresh(editor, markdownToHtml(md));
  registerSource(editor, md);
  return editor;
};
const types = (ed: Editor) => {
  const out: string[] = [];
  ed.state.doc.forEach((n) => out.push(n.type.name === 'paragraph' && n.content.size === 0 ? 'blank' : n.type.name));
  return out;
};
/** 第 index 个顶层节点的位置 */
const posOf = (ed: Editor, index: number) => {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += ed.state.doc.child(i).nodeSize;
  return pos;
};

describe('extraBlankLines：两块之间多出来的空行数', () => {
  it('一个空行是正常间隔，再多的才算', () => {
    expect(extraBlankLines('')).toBe(0);
    expect(extraBlankLines('\n')).toBe(0);
    expect(extraBlankLines('\n\n')).toBe(0);
    expect(extraBlankLines('\n\n\n')).toBe(1);
    expect(extraBlankLines('\n\n\n\n')).toBe(2);
    // 只有空格的行也是空行
    expect(extraBlankLines('\n  \n\n')).toBe(1);
  });
  it('被链接引用定义隔开的两个空行不算；定义后面连着的空行照常数', () => {
    expect(extraBlankLines('\n\n[d]: https://a.b\n\n')).toBe(0);
    expect(extraBlankLines('\n\n[d]: https://a.b\n\n\n')).toBe(1);
  });
  it('文件开头：n 个空行里 n - 1 个算', () => {
    expect(extraBlankLines('', true)).toBe(0);
    expect(extraBlankLines('\n', true)).toBe(0);
    expect(extraBlankLines('\n\n', true)).toBe(1);
  });
});

describe('空行被吞（完整版 #7）', () => {
  it('打开：两块之间多一个空行，编辑器里就多一个空段落；正常的一个空行不多', () => {
    const ed = open('第一段\n\n第二段\n\n\n第三段\n\n\n\n第四段\n');
    expect(types(ed)).toEqual(['paragraph', 'paragraph', 'blank', 'paragraph', 'blank', 'blank', 'paragraph']);
    expect(getSourceMap(ed)).not.toBeNull();
    // 载入时插的空段落不是用户的改动：不进撤销栈
    expect(ed.can().undo()).toBe(false);
  });

  it('没动过的文件原样写回，多出来的空行一个不少', () => {
    for (const md of ['第一段\n\n\n第二段\n\n\n\n第三段\n', '\n\n开头空了两行\n', '# 标题\n\n\n正文\n\n- 甲\n- 乙\n\n\n结尾\n']) {
      expect(serializeDoc(open(md)).markdown).toBe(md);
    }
  });

  it('在两段之间回车加一个空段落：保存后文件里多一个空行，重开空段落还在', () => {
    const ed = open('第一段\n\n第二段\n');
    ed.commands.insertContentAt(posOf(ed, 1), { type: 'paragraph' });
    const saved = serializeDoc(ed).markdown;
    expect(saved).toBe('第一段\n\n\n第二段\n');
    expect(types(open(saved))).toEqual(['paragraph', 'blank', 'paragraph']);
  });

  it('删掉多出来的空段落，文件里的空行也少一个', () => {
    const ed = open('第一段\n\n\n第二段\n');
    const at = posOf(ed, 1);
    ed.commands.deleteRange({ from: at, to: at + 2 });
    expect(serializeDoc(ed).markdown).toBe('第一段\n\n第二段\n');
  });

  it('旁边的块改过了：空段落照样写成多出来的空行', () => {
    const ed = open('# 标题\n\n\n正文\n');
    let pos = -1;
    ed.state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text === '正文') pos = p + node.nodeSize; return pos < 0; });
    ed.commands.insertContentAt(pos, '已改');
    expect(serializeDoc(ed).markdown).toBe('# 标题\n\n\n正文已改\n');
  });

  it('作者多空几行的习惯不凭空长出来：删了空段落再改旁边的块，只隔一个空行', () => {
    const ed = open('# 标题\n\n\n正文\n');
    const at = posOf(ed, 1);
    ed.commands.deleteRange({ from: at, to: at + 2 });
    let pos = -1;
    ed.state.doc.descendants((node, p) => { if (pos < 0 && node.isText && node.text === '正文') pos = p + node.nodeSize; return pos < 0; });
    ed.commands.insertContentAt(pos, '已改');
    expect(serializeDoc(ed).markdown).toBe('# 标题\n\n正文已改\n');
  });

  it('文件开头的空行：两个空行是一个空段落，删掉它开头就不空了', () => {
    const ed = open('\n\n第一段\n');
    expect(types(ed)).toEqual(['blank', 'paragraph']);
    ed.commands.deleteRange({ from: 0, to: 2 });
    expect(serializeDoc(ed).markdown).toBe('第一段\n');
  });

  it('链接引用定义夹在两块之间：加了空段落，定义还在原位，重开空段落还在', () => {
    const md = '见 [文档][d]。\n\n[d]: https://example.com\n\n结尾\n';
    const ed = open(md);
    expect(types(ed)).toEqual(['paragraph', 'paragraph']);
    ed.commands.insertContentAt(posOf(ed, 1), { type: 'paragraph' });
    const saved = serializeDoc(ed).markdown;
    expect(saved).toBe('见 [文档][d]。\n\n[d]: https://example.com\n\n\n结尾\n');
    expect(types(open(saved))).toEqual(['paragraph', 'blank', 'paragraph']);
  });

  it('文末的空段落不写进文件：表格收尾的文档打开后文末有一个空段落，保存后文件不变', () => {
    const md = '| a | b |\n|---|---|\n| 1 | 2 |\n';
    const ed = open(md);
    expect(types(ed)).toEqual(['table', 'blank']);
    expect(serializeDoc(ed).markdown).toBe(md);
    // 在文末的空段落里打字：它就成了正文，和表格之间隔一个空行
    ed.commands.insertContentAt(ed.state.doc.content.size - 1, '后面的话');
    expect(serializeDoc(ed).markdown).toBe('| a | b |\n|---|---|\n| 1 | 2 |\n\n后面的话\n');
  });

  it('列表项里的空段落不是文件里的空行（Markdown 存不下）：照旧丢掉，列表本身完好', () => {
    const md = '- 甲\n- 乙\n';
    const ed = open(md);
    ed.commands.insertContentAt(posOf(ed, 1), '<p>后面</p>');
    expect(serializeDoc(ed).markdown).toBe('- 甲\n- 乙\n\n后面\n');
  });
});
