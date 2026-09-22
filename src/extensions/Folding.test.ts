import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../components/Editor/editorExtensions';
import { markdownToHtml } from '../utils/markdown';
import { foldingKey, anchorAt } from './Folding';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

const open = (md: string) => { editor = new Editor({ extensions: editorExtensions, content: markdownToHtml(md) }); return editor; };
/** 光标放进某段文字里 */
const cursorIn = (ed: Editor, text: string, offset = 1) => {
  let at = -1;
  ed.state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text?.includes(text)) at = pos + node.text.indexOf(text) + offset; return at < 0; });
  if (at < 0) throw new Error(`没有「${text}」`);
  ed.commands.setTextSelection(at);
};
const hidden = (ed: Editor) => Array.from(ed.view.dom.querySelectorAll('.fold-hidden')).map((el) => (el.textContent || '').trim());
const foldedAnchors = (ed: Editor) => Array.from(ed.view.dom.querySelectorAll('.is-folded')).map((el) => (el.textContent || '').trim());
const toggles = (ed: Editor) => Array.from(ed.view.dom.querySelectorAll('.fold-toggle')).map((el) => el.closest('h1,h2,h3,h4,h5,h6,li')?.textContent?.trim().split('\n')[0]);

const DOC = '# 甲\n\n段一\n\n## 乙\n\n段二\n\n### 丙\n\n段三\n\n# 丁\n\n段四';

describe('标题折叠', () => {
  it('收起一节：到下一个同级或更高级的标题为止，中间的段落和更低级的标题都藏起来；文档本身不变', () => {
    const ed = open(DOC);
    const before = ed.getHTML();
    cursorIn(ed, '甲');
    expect(ed.commands.foldSection()).toBe(true);
    expect(hidden(ed)).toEqual(['段一', '乙', '段二', '丙', '段三']);
    expect(foldedAnchors(ed)).toEqual(['甲']);
    expect(ed.getHTML()).toBe(before);
    expect(ed.view.dom.querySelector('h1.is-folded .fold-toggle')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('只有下面有内容的标题、有子项的列表项才有箭头', () => {
    const ed = open('# 有内容\n\n段\n\n# 没内容');
    expect(toggles(ed)).toEqual(['有内容']);
  });

  it('光标在正文里：折的是它所在的那一节（往前最近的标题）；展开后全部回来', () => {
    const ed = open(DOC);
    cursorIn(ed, '段二');
    expect(anchorAt(ed.state)).not.toBeNull();
    ed.commands.foldSection();
    expect(hidden(ed)).toEqual(['段二', '丙', '段三']);
    expect(foldedAnchors(ed)).toEqual(['乙']);
    cursorIn(ed, '乙');
    ed.commands.unfoldSection();
    expect(hidden(ed)).toEqual([]);
  });

  it('在折起来的标题上面编辑，折叠跟着位置走；删掉那个标题，折叠一起没了', () => {
    const ed = open(DOC);
    cursorIn(ed, '乙');
    ed.commands.foldSection();
    ed.commands.insertContentAt(1, '开头加字');
    expect(hidden(ed)).toEqual(['段二', '丙', '段三']);
    // 删掉「乙」这个标题
    let at = -1;
    ed.state.doc.descendants((node, pos) => { if (at < 0 && node.type.name === 'heading' && node.textContent === '乙') at = pos; return at < 0; });
    ed.commands.deleteRange({ from: at, to: at + ed.state.doc.nodeAt(at)!.nodeSize });
    expect(hidden(ed)).toEqual([]);
    expect(foldingKey.getState(ed.state)!.folded).toEqual([]);
  });

  it('光标进了被藏起来的内容（查找跳过去、方向键走进去）：那一节自动展开', () => {
    const ed = open(DOC);
    cursorIn(ed, '乙');
    ed.commands.foldSection();
    expect(hidden(ed).length).toBeGreaterThan(0);
    cursorIn(ed, '段三');
    expect(hidden(ed)).toEqual([]);
  });

  it('在折起来的标题末尾按回车：先展开，再照常换行', () => {
    const ed = open(DOC);
    cursorIn(ed, '乙');
    ed.commands.foldSection();
    // 光标放到「乙」末尾
    cursorIn(ed, '乙', 1);
    const plugin = ed.state.plugins.find((p) => (p as any).spec.key === foldingKey)!;
    const handled = plugin.props.handleKeyDown!.call(plugin, ed.view, new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(handled).toBe(false); // 回车本身让默认的处理去做
    expect(hidden(ed)).toEqual([]);
  });

  it('点箭头（真实的 mousedown）也能折 / 展开', () => {
    const ed = open(DOC);
    const toggle = ed.view.dom.querySelector('h2 .fold-toggle') as HTMLElement;
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(foldedAnchors(ed)).toEqual(['乙']);
    (ed.view.dom.querySelector('h2 .fold-toggle') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(foldedAnchors(ed)).toEqual([]);
  });

  it('全部折叠 / 全部展开', () => {
    const ed = open(DOC);
    ed.commands.foldAll();
    expect(foldedAnchors(ed)).toEqual(['甲', '乙', '丙', '丁']);
    expect(hidden(ed)).toContain('段四');
    ed.commands.unfoldAll();
    expect(hidden(ed)).toEqual([]);
  });
});

describe('列表折叠', () => {
  it('有嵌套列表的项能折：只藏子列表，第一行留着；兄弟项不受影响', () => {
    const ed = open('- 父\n  - 子一\n  - 子二\n- 兄弟');
    cursorIn(ed, '父');
    expect(ed.commands.foldSection()).toBe(true);
    const h = hidden(ed);
    expect(h).toHaveLength(1);
    expect(h[0]).toContain('子一');
    expect(h[0]).toContain('子二');
    expect(ed.view.dom.querySelector('li.is-folded')?.textContent).toContain('父');
    expect(ed.view.dom.textContent).toContain('兄弟');
    cursorIn(ed, '兄弟');
    expect(ed.commands.foldSection()).toBe(false); // 没子项，没得折
  });
});
