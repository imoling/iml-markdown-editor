import { Mark, mergeAttributes } from '@tiptap/core';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Link } from '@tiptap/extension-link';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * Markdown 里常见、但 StarterKit 不认识的行内 HTML 标记。
 * 没有这些 Mark 的话，<kbd>⌘</kbd> 这类标签在富文本模式里保存一次就只剩文字了。
 */
const htmlMark = (name: string, tag: string) =>
  Mark.create({
    name,
    parseHTML() {
      return [{ tag }];
    },
    renderHTML({ HTMLAttributes }) {
      return [tag, mergeAttributes(HTMLAttributes), 0];
    },
  });

export const Kbd = htmlMark('kbd', 'kbd');
export const Subscript = htmlMark('subscript', 'sub');
export const Superscript = htmlMark('superscript', 'sup');

/** 高亮：`==文字==`（Obsidian / Typora 写法）与 <mark> 两种来源，保存时各自写回原来的写法 */
export const Highlight = Mark.create({
  name: 'highlight',
  addAttributes() {
    return {
      md: {
        default: true,
        parseHTML: (el: HTMLElement) => el.hasAttribute('data-md'),
        renderHTML: (attrs: Record<string, any>) => (attrs.md ? { 'data-md': '' } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'mark' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes(HTMLAttributes), 0];
  },
});

/**
 * 换行：源文件里的单个换行（本应用按换行显示）标记为 soft，保存时仍写回单个换行；
 * 编辑器里新敲的 Shift+Enter 用标准的「行尾两个空格」，别的 Markdown 工具也能正确显示。
 */
export const SoftAwareHardBreak = HardBreak.extend({
  addAttributes() {
    return {
      soft: {
        default: false,
        parseHTML: (el: HTMLElement) => el.hasAttribute('data-soft'),
        renderHTML: (attrs: Record<string, any>) => (attrs.soft ? { 'data-soft': '' } : {}),
      },
    };
  },
});

/**
 * 打字时哪些词自动变成链接：写明协议的网址、www 开头的、邮箱。
 * README.md、brief.sh、asset.py 这类文件名的后缀正好是国家顶级域，不能当网址（轻量版 #14）
 */
export const shouldAutoLink = (text: string) => /^(?:[a-z][a-z0-9+-]*:|www\.)|@/i.test(text);

/** 既是常见文件后缀、又是国家顶级域的：别的网站会把这样的文件名自动加上链接 */
const FILE_SUFFIX = /\.(?:md|py|sh|rs|pl|ps|cc|so|zip|mov)$/i;

/** 粘贴网页内容时，去掉 `<a href="http://asset.py/">asset.py</a>` 这种别的网站自动加的链接（轻量版 #14） */
export function unlinkFileNames(html: string): string {
  if (!/<a\s/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let changed = false;
  doc.querySelectorAll('a[href]').forEach((a) => {
    const text = (a.textContent || '').trim();
    const host = (a.getAttribute('href') || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
    if (!FILE_SUFFIX.test(text) || host.toLowerCase() !== text.toLowerCase()) return;
    a.replaceWith(...a.childNodes);
    changed = true;
  });
  return changed ? doc.body.innerHTML : html;
}

/** 链接：保留 title；记住源文件里是不是自动链接（裸链接 / <url>），保存时按原写法写回 */
export const NoteLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      title: { default: null },
      autolink: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-autolink'),
        renderHTML: (attrs: Record<string, any>) => (attrs.autolink ? { 'data-autolink': attrs.autolink } : {}),
      },
    };
  },
  // 粘贴规则不看 shouldAutoLink 选项，这里补上：粘贴一段提到 asset.py 的文字，它也不该变成链接
  addPasteRules() {
    const rules = this.parent?.() ?? [];
    for (const rule of rules) {
      const { find } = rule;
      if (typeof find !== 'function') continue;
      rule.find = (text, event) => find(text, event)?.filter((match) => shouldAutoLink(match.text));
    }
    return rules;
  },
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({ key: new PluginKey('noteLinkPaste'), props: { transformPastedHTML: unlinkFileNames } }),
    ];
  },
});
