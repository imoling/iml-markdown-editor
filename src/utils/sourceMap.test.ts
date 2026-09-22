import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../components/Editor/editorExtensions';
import { markdownToHtml } from './markdown';
import { serializeDoc } from './incrementalMarkdown';
import { NodeSelection } from '@tiptap/pm/state';
import { registerSource, getSourceMap, placeCursorAfterFrontmatter } from './sourceMap';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

/** 和真实编辑器一样：由 Markdown 生成文档，再登记原文对照表 */
const open = (md: string) => {
  editor?.destroy();
  editor = new Editor({ extensions: editorExtensions, content: markdownToHtml(md) });
  registerSource(editor, md);
  return editor;
};

/** 别的工具写出来的、风格各异的文档：转换器会把这些都「规范化」，原文保留必须一个字符都不动 */
const STYLED = [
  '---',
  'title:   对齐过的 YAML',
  'tags:    [a, b]',
  '---',
  '# 标题后面不空行',
  '正文紧跟着标题。',
  '',
  '',
  '上面空了两行。',
  '',
  'Setext 标题',
  '===========',
  '',
  '* 星号列表',
  '* 第二项',
  '',
  '1) 括号编号',
  '2) 第二项',
  '',
  '| 名称        | 数量 |',
  '|:------------|-----:|',
  '| 对齐过的表格 |    3 |',
  '',
  '~~~python',
  'print("波浪线围栏")',
  '~~~',
  '',
  '***',
  '',
  '行尾两个空格  ',
  '换行，以及 [引用式链接][ref]。',
  '',
  '[ref]: https://example.com "标题"',
  '',
  '- 普通项',
  '- [ ] 任务项',
  '- 又一个普通项',
  '',
].join('\n');

describe('原文保留：没编辑的块逐字写回', () => {
  it('不做任何编辑，保存结果与原文件完全相同（包括文件末尾的换行）', () => {
    const ed = open(STYLED);
    expect(getSourceMap(ed)).not.toBeNull();
    expect(serializeDoc(ed).markdown).toBe(STYLED);
  });

  it('只改一段：只有那一段变化，别的块连同块间空行都不动', () => {
    const ed = open(STYLED);
    let target = -1;
    ed.state.doc.descendants((node, pos) => {
      if (target < 0 && node.isText && node.text === '上面空了两行。') target = pos;
      return true;
    });
    ed.commands.insertContentAt(target, '改：');
    const out = serializeDoc(ed).markdown;
    expect(out).toBe(STYLED.replace('上面空了两行。', '改：上面空了两行。'));
  });

  it('文档里有独占一行的图片：别处改一个字，对齐过的表格、文件末尾的换行照样一个字符不动', () => {
    // 图片在编辑器里是块级节点，<p><img></p> 解析时会在图片前面多出一个空段落：顶层节点比原文的块多一个，
    // 对照表整篇作废，表格一保存就被「规范化」。26.4.0 就是这样——只要文档里有一张独占一行的图片
    for (const md of [
      '# 标题\n\n改这一段。\n\n|:---|---:|\n| a  |  b |\n'.replace('|:---', '| 左 | 右 |\n|:---') + '\n![图](assets/pic.png)\n',
      '![图](assets/pic.png)\n\n改这一段。\n\n* 星号列表\n* 第二项\n',
      '改这一段。\n\n![图](<assets/带 空格.png>)\n\n1) 括号编号\n2) 第二项\n\n![另一张](b.png "标题")\n',
    ]) {
      const ed = open(md);
      expect(getSourceMap(ed)).not.toBeNull();
      // 图片就是一个图片节点，前面没有多出来的空段落
      const types: string[] = [];
      ed.state.doc.forEach((node) => types.push(node.type.name));
      expect(types.filter((t) => t === 'image').length).toBe((md.match(/!\[/g) || []).length);
      expect(types.length).toBe(md.trim().split(/\n\n+/).length);
      let target = -1;
      ed.state.doc.descendants((node, pos) => { if (target < 0 && node.isText && node.text === '改这一段。') target = pos; return true; });
      ed.commands.insertContentAt(target, '已');
      expect(serializeDoc(ed).markdown).toBe(md.replace('改这一段。', '已改这一段。'));
    }
  });

  it('CRLF 文件保持 CRLF', () => {
    const crlf = '# 标题\r\n\r\n第一段\r\n\r\n* 列表\r\n';
    const ed = open(crlf);
    expect(serializeDoc(ed).markdown).toBe(crlf);
    ed.commands.insertContentAt(ed.state.doc.content.size, '<p>新段落</p>');
    expect(serializeDoc(ed).markdown).toBe('# 标题\r\n\r\n第一段\r\n\r\n* 列表\r\n\r\n新段落\r\n');
  });

  it('删掉一块、在中间插入新块：其余原文不动，新块用标准空行隔开', () => {
    const md = '# 甲\n正文一\n\n* 乙\n\n正文二\n';
    const ed = open(md);
    // 在「正文一」后面插入一段
    let after = -1;
    ed.state.doc.forEach((node, offset) => { if (node.textContent === '正文一') after = offset + node.nodeSize; });
    ed.commands.insertContentAt(after, '<p>新插入</p>');
    expect(serializeDoc(ed).markdown).toBe('# 甲\n正文一\n\n新插入\n\n* 乙\n\n正文二\n');
  });

  it('标题被改成普通段落时，不会因为沿用「标题后不空行」而把两段并成一段', () => {
    const md = '正文\n# 标题\n后面的段落\n';
    const ed = open(md);
    let headingPos = -1;
    ed.state.doc.forEach((node, offset) => { if (node.type.name === 'heading') headingPos = offset; });
    ed.chain().setTextSelection(headingPos + 1).setParagraph().run();
    const out = serializeDoc(ed).markdown;
    // 三段仍是三段
    const reopened = open(out);
    expect(reopened.state.doc.childCount).toBe(3);
  });

  it('链接引用定义在编辑器里不可见：旁边的块被改过也不能丢', () => {
    const md = '见 [文档][d]。\n\n[d]: https://example.com\n\n结尾\n';
    const ed = open(md);
    ed.commands.insertContentAt(ed.state.doc.content.size - 1, '！');
    const out = serializeDoc(ed).markdown;
    expect(out).toContain('[d]: https://example.com');
    expect(out).toContain('结尾！');
  });

  it('frontmatter 与正文之间不空行的写法保持不变', () => {
    const md = '---\na: 1\n---\n# 标题\n';
    expect(serializeDoc(open(md)).markdown).toBe(md);
  });

  it('块与节点对不上时放弃原文保留，退回转换（不会错配）', () => {
    // 公式里有空行：词法器切成两段，编辑器里是一个公式节点
    const md = '前\n\n$$\na\n\nb\n$$\n\n后\n';
    const ed = open(md);
    expect(getSourceMap(ed)).toBeNull();
    expect(serializeDoc(ed).markdown).toContain('前');
  });

  it('新建的空文档没有对照表，行为与以前一致', () => {
    editor = new Editor({ extensions: editorExtensions, content: '' });
    expect(registerSource(editor, '')).toBeNull();
    expect(serializeDoc(editor)).toEqual({ markdown: '', hasDataImage: false });
  });

  it('属性块被选中时打字：文字插到它后面，属性块不会被替换掉', () => {
    const md = '---\ntags: [a]\n---\n\n正文\n';
    const ed = open(md);
    ed.view.dispatch(ed.state.tr.setSelection(NodeSelection.create(ed.state.doc, 0)));
    const { from, to } = ed.state.selection;
    const handled = ed.view.someProp('handleTextInput', (f) => f(ed.view, from, to, '字', () => ed.state.tr.insertText('字', from, to)));
    expect(handled).toBe(true);
    expect(ed.state.doc.firstChild?.type.name).toBe('frontmatter');
    expect(serializeDoc(ed).markdown).toBe('---\ntags: [a]\n---\n\n字正文\n');
  });

  it('打开以属性块开头的文档时，光标落在属性块之后', () => {
    const ed = open('---\na: 1\n---\n\n# 标题\n');
    placeCursorAfterFrontmatter(ed);
    expect(ed.state.selection instanceof NodeSelection).toBe(false);
    expect(ed.state.selection.$from.parent.type.name).toBe('heading');
  });
});
