import { beforeAll, describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../components/Editor/editorExtensions';
import { shouldAutoLink } from './InlineMarks';

/** 轻量版 #14：文件名的后缀正好是国家顶级域，不能当网址 */
describe('shouldAutoLink', () => {
  it('文件名不是链接', () => {
    for (const name of ['README.md', 'brief.sh', 'asset.py', 'notes.md', 'main.rs', 'asset.py:12']) expect(shouldAutoLink(name), name).toBe(false);
  });

  it('写明协议的、www 开头的、邮箱才是', () => {
    for (const url of ['https://claude.ai/x', 'http://example.com', 'www.example.net', 'WWW.example.net', 'me@example.com', 'mailto:me@example.com']) expect(shouldAutoLink(url), url).toBe(true);
  });
});

describe('打字时', () => {
  let editor: Editor | null = null;
  afterEach(() => { editor?.destroy(); editor = null; });
  const typed = (text: string) => {
    editor = new Editor({ extensions: editorExtensions, content: '<p></p>' });
    const ed = editor;
    ed.commands.insertContent(text);
    return ed.getHTML();
  };

  it('文件名后面敲空格不变链接，真网址照常变', () => {
    expect(typed('example_generate_asset.py ')).not.toContain('<a ');
    editor?.destroy();
    expect(typed('https://example.com ')).toContain('href="https://example.com"');
  });
});

describe('粘贴时', () => {
  // jsdom 没有 ClipboardEvent，ProseMirror 的 pasteText / pasteHTML 要用
  beforeAll(() => { (globalThis as any).ClipboardEvent ??= class extends Event {}; });
  let editor: Editor | null = null;
  afterEach(() => { editor?.destroy(); editor = null; });
  const links = () => {
    const out: string[] = [];
    editor!.state.doc.descendants((node) => {
      const link = node.marks.find((m) => m.type.name === 'link');
      if (link) out.push(`${node.text}→${link.attrs.href}`);
    });
    return out;
  };
  const open = () => { editor = new Editor({ extensions: editorExtensions, content: '<p></p>' }); return editor; };

  it('纯文本里的文件名不变链接，真网址照常变', () => {
    open().view.pasteText('看 README.md 和 example_generate_asset.py 还有 https://example.com/a');
    expect(links()).toEqual(['https://example.com/a→https://example.com/a']);
  });

  it('网页里被自动加上链接的文件名：只留文字，别的链接不动', () => {
    open().view.pasteHTML('<p>看 <a href="http://asset.py/">asset.py</a> 和 <a href="https://github.com/">github.com</a> 和 <a href="http://x.org/a.py">a.py</a></p>');
    expect(links()).toEqual(['github.com→https://github.com/', 'a.py→http://x.org/a.py']);
  });

  it('网页里本来就写好的链接保留', () => {
    open().view.pasteHTML('<p><a href="https://example.com/doc">说明文档</a></p>');
    expect(links()).toEqual(['说明文档→https://example.com/doc']);
  });
});
