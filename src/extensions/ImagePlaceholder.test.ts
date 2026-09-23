import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../components/Editor/editorExtensions';
import { markdownToHtml } from '../utils/markdown';
import { serializeDoc } from '../utils/incrementalMarkdown';
import { placeholderPos, imagePlaceholderKey } from './ImagePlaceholder';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });
const open = (md: string) => { editor = new Editor({ extensions: editorExtensions, content: markdownToHtml(md) }); return editor; };
const boxes = (ed: Editor) => Array.from(ed.view.dom.querySelectorAll('.img-ph'));

describe('出图占位块', () => {
  it('占位块只是装饰：文档和保存出来的原文一个字都不变', () => {
    const ed = open('# 标题\n\n第一段\n');
    const before = { html: ed.getHTML(), md: serializeDoc(ed).markdown };
    ed.commands.setTextSelection(3);
    ed.commands.addImagePlaceholder({ id: 'a', prompt: '大漠孤烟直' });
    expect(boxes(ed)).toHaveLength(1);
    expect(ed.getHTML()).toBe(before.html);
    expect(serializeDoc(ed).markdown).toBe(before.md);   // 生成到一半保存，落盘的还是原文
  });

  it('上面写着提示词和进度，进度能一路更新', () => {
    const ed = open('正文');
    ed.commands.addImagePlaceholder({ id: 'a', prompt: '一只橘猫坐在窗台上晒太阳，水彩风格' });
    expect(boxes(ed)[0].querySelector('.img-ph__title')?.textContent).toContain('一只橘猫');
    expect(boxes(ed)[0].querySelector('.img-ph__note')?.textContent).toBe('正在准备…');
    ed.commands.updateImagePlaceholder('a', '正在出图 3/8 步，还要 约 45 秒');
    expect(boxes(ed)[0].querySelector('.img-ph__note')?.textContent).toBe('正在出图 3/8 步，还要 约 45 秒');
    // 超长提示词截断显示，完整的放 title 里
    expect(boxes(ed)[0].querySelector('.img-ph__title')?.getAttribute('title')).toBe('一只橘猫坐在窗台上晒太阳，水彩风格');
  });

  it('这几分钟里在别处写字：占位块跟着位置走，图最后插回它那儿而不是光标处', () => {
    const ed = open('开头\n\n结尾');
    ed.commands.setTextSelection(3);
    ed.commands.addImagePlaceholder({ id: 'a', prompt: '图' });
    const at0 = placeholderPos(ed.state, 'a')!;
    ed.commands.insertContentAt(1, '前面又敲了几个字');
    const at1 = placeholderPos(ed.state, 'a')!;
    expect(at1).toBe(at0 + 8);
    // 光标此刻在别处，但图要插回占位块那儿
    ed.commands.setTextSelection(ed.state.doc.content.size - 1);
    expect(placeholderPos(ed.state, 'a')).toBe(at1);
  });

  it('占位块所在的那段被删掉：它自己消失，不会留个孤儿', () => {
    const ed = open('第一段\n\n第二段');
    let at = -1;
    ed.state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text === '第二段') at = pos; return at < 0; });
    ed.commands.setTextSelection(at + 1);
    ed.commands.addImagePlaceholder({ id: 'a', prompt: '图' });
    expect(boxes(ed)).toHaveLength(1);
    ed.commands.deleteRange({ from: at - 1, to: at + 4 });
    expect(placeholderPos(ed.state, 'a')).toBeNull();
    expect(boxes(ed)).toHaveLength(0);
  });

  it('点「取消」调用回调；移除之后就没了', () => {
    const ed = open('正文');
    const onCancel = vi.fn();
    ed.commands.addImagePlaceholder({ id: 'a', prompt: '图', onCancel });
    (boxes(ed)[0].querySelector('.img-ph__cancel') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    ed.commands.removeImagePlaceholder('a');
    expect(boxes(ed)).toHaveLength(0);
    expect(imagePlaceholderKey.getState(ed.state)!.items).toEqual([]);
  });

  it('同时出几张图：各占各的位，互不干扰', () => {
    const ed = open('正文');
    ed.commands.addImagePlaceholder({ id: 'a', prompt: '图一' });
    ed.commands.addImagePlaceholder({ id: 'b', prompt: '图二' });
    expect(boxes(ed)).toHaveLength(2);
    ed.commands.updateImagePlaceholder('b', '第 2 步');
    expect(boxes(ed).map((b) => b.querySelector('.img-ph__note')?.textContent)).toEqual(['正在准备…', '第 2 步']);
    ed.commands.removeImagePlaceholder('a');
    expect(boxes(ed).map((b) => b.querySelector('.img-ph__title')?.textContent)).toEqual(['图二']);
  });
});
