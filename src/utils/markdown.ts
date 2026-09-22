import { Marked } from 'marked';
import TurndownService from 'turndown';
import { loadMermaid } from './mermaidLoader';
// @ts-ignore
import { tables } from 'turndown-plugin-gfm';
import { lowlight as localLowlight } from './highlight';
import { sanitizeHtml } from './sanitize';
import { escapeMarkdown, MID_LINE_MARK, LINE_START_SENSITIVE } from './markdownEscape';
import katex from 'katex';
import {
  splitFrontmatter, parseFrontmatter, matchTagAt, calloutKind, calloutLabel, CALLOUT_HEAD_RE,
} from '../../electron/shared/noteMeta';


const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// lowlight HAST → HTML。文本节点必须转义：代码块里的 <script> / <img onerror> 否则会被当成真 HTML 执行
const hastToHtml = (nodes: any[]): string =>
  nodes.map((node) => {
    if (node.type === 'text') return escapeHtml(node.value);
    if (node.type === 'element') {
      const cls = node.properties?.className?.join(' ') || '';
      return `<span class="${cls}">${hastToHtml(node.children)}</span>`;
    }
    return '';
  }).join('');

// Unicode 安全的 Base64 编码/解码工具
export const toBase64 = (str: string) => {
  if (!str) return '';
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (e) {
    console.warn('toBase64 failed:', e);
    return '';
  }
};

export const fromBase64 = (base64: string) => {
  if (!base64 || !base64.trim()) return '';
  try {
    // 移除可能的自动填充错误
    const cleanBase64 = base64.replace(/\s/g, '');
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.warn('fromBase64 failed:', e);
    return '';
  }
};

/** 原文放进 data-* 属性时统一走 base64，避免引号、换行、尖括号在 HTML 往返里被改写 */
export const encodeRaw = (raw: string) => `base64:${toBase64(raw)}`;
export const decodeRaw = (value: string | null | undefined) => {
  if (!value) return '';
  return value.startsWith('base64:') ? fromBase64(value.slice(7)) : value;
};

// ── Markdown → HTML：两套 marked 实例 ────────────────────────────────────────
// rich：喂给 Tiptap。编辑器表达不了的东西（HTML 块、脚注定义、带属性的行内 HTML）包成「原样保留」节点，保存时一个字符都不动。
// preview：源码模式右侧预览与导出。按正常 Markdown 渲染。
type MarkedMode = 'rich' | 'preview';

/** 解析期间把占位符（Mermaid / SVG / 公式 / data 图片）还原成原文：原样保留块里不能留占位符 */
let restorePlaceholders: (s: string) => string = (s) => s;

// 双向链接 [[目标]] / [[目标|显示文本]]：作为 marked 的行内扩展，代码块和行内代码里不会被误转
const wikiLinkExtension = {
  name: 'wikiLink',
  level: 'inline' as const,
  start(src: string) {
    const i = src.indexOf('[[');
    return i === -1 ? undefined : i;
  },
  tokenizer(src: string) {
    const m = /^\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/.exec(src);
    if (!m) return undefined;
    return { type: 'wikiLink', raw: m[0], target: m[1].trim(), label: (m[2] || m[1]).trim() };
  },
  renderer(token: any) {
    return `<span class="wiki-link" data-wiki-link="${escapeHtml(token.target)}">${escapeHtml(token.label)}</span>`;
  },
};

// #标签：只在预览里渲染成芯片；富文本里 Tiptap 会丢掉这个 span 保留文字，由编辑器的装饰层负责高亮
const tagExtension = {
  name: 'noteTag',
  level: 'inline' as const,
  start(src: string) {
    const i = src.indexOf('#');
    return i === -1 ? undefined : i;
  },
  tokenizer(src: string, tokens: any[]) {
    if (src[0] !== '#') return undefined;
    const last = tokens[tokens.length - 1];
    const tag = matchTagAt(src, last ? String(last.raw).slice(-1) : '');
    if (!tag) return undefined;
    return { type: 'noteTag', raw: `#${tag}`, tag };
  },
  renderer(token: any) {
    return `<span class="tag-chip" data-tag="${escapeHtml(token.tag)}">#${escapeHtml(token.tag)}</span>`;
  },
};

// 路径里带空格的图片：![图](assets/截图 1.png)。CommonMark 不认（要写成 <…> 或 %20），但 Typora 就是这么写的，
// 从那边搬来的笔记里到处都是。按图片解析，并记下「原来是宽松写法」，保存时原样写回
const lenientImageExtension = {
  name: 'lenientImage',
  level: 'inline' as const,
  start(src: string) {
    const i = src.indexOf('![');
    return i === -1 ? undefined : i;
  },
  tokenizer(src: string) {
    const m = /^!\[([^\]\n]*)\]\(([^()<>\n"]*?[^\s()<>"]\s+[^()<>\n"]*?\.(?:png|jpe?g|gif|webp|svg|bmp|avif|tiff?))\)/i.exec(src);
    if (!m) return undefined;
    return { type: 'lenientImage', raw: m[0], alt: m[1], href: m[2].trim() };
  },
  renderer(token: any) {
    return `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.alt)}" data-lenient="">`;
  },
};

// ==高亮==（Obsidian / Typora 写法）
const highlightExtension = {
  name: 'mdHighlight',
  level: 'inline' as const,
  start(src: string) {
    const i = src.indexOf('==');
    return i === -1 ? undefined : i;
  },
  tokenizer(this: any, src: string) {
    const m = /^==(?![\s=])([^\n]+?)(?<![\s=])==/.exec(src);
    if (!m) return undefined;
    return { type: 'mdHighlight', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
  },
  renderer(this: any, token: any) {
    return `<mark data-md="">${this.parser.parseInline(token.tokens)}</mark>`;
  },
};

// 行内公式 $…$ 与单行 $$…$$：整体作为一个 token，内部的 _ * \ 不再被当成 Markdown 语法
const inlineMathExtension = (mode: MarkedMode) => ({
  name: 'inlineMath',
  level: 'inline' as const,
  start(src: string) {
    const i = src.indexOf('$');
    return i === -1 ? undefined : i;
  },
  tokenizer(src: string) {
    const display = /^\$\$(?!\s)((?:\\.|[^$\\\n])+?)(?<!\s)\$\$/.exec(src);
    if (display) return { type: 'inlineMath', raw: display[0], latex: display[1], display: true };
    const m = /^\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<!\s)\$(?!\d)/.exec(src);
    if (!m) return undefined;
    return { type: 'inlineMath', raw: m[0], latex: m[1], display: false };
  },
  renderer(token: any) {
    const latex = String(token.latex);
    if (mode === 'rich') {
      return `<span data-inline-math="${token.display ? 'display' : 'inline'}" data-latex="${escapeHtml(latex)}">${escapeHtml(latex)}</span>`;
    }
    try {
      // data-latex：导出 Word 时要用原文（KaTeX 自己带的 MathML 注解过不了 HTML 净化）
      return `<span class="math-inline" data-latex="${escapeHtml(latex)}">${katex.renderToString(latex, { displayMode: !!token.display, throwOnError: false })}</span>`;
    } catch {
      return escapeHtml(token.raw);
    }
  },
});

// 脚注引用 [^1]：富文本里就是字面文字；预览里渲染成上标
const footnoteRefExtension = (mode: MarkedMode) => ({
  name: 'footnoteRef',
  level: 'inline' as const,
  start(src: string) {
    const i = src.indexOf('[^');
    return i === -1 ? undefined : i;
  },
  tokenizer(src: string) {
    const m = /^\[\^([^\]\s]+)\]/.exec(src);
    if (!m) return undefined;
    return { type: 'footnoteRef', raw: m[0], id: m[1] };
  },
  renderer(token: any) {
    if (mode === 'rich') return escapeHtml(token.raw);
    // 引用和定义互相指着：点上标跳到脚注，点 ↩ 跳回来。同一条脚注被引用几次，每次的锚点各不相同
    const n = (footnoteRefCount.get(token.id) ?? 0) + 1;
    footnoteRefCount.set(token.id, n);
    const slug = footnoteSlug(token.id);
    return `<sup class="footnote-ref"><a href="#fn-${slug}" id="fnref-${slug}${n > 1 ? `-${n}` : ''}" data-footnote-ref="${escapeHtml(token.id)}">${escapeHtml(token.id)}</a></sup>`;
  },
});

/** 一次解析里每条脚注被引用了几次（markdownToHtml 开头清零） */
let footnoteRefCount = new Map<string, number>();
/** 脚注 id 放进锚点之前：空白和引号这类会弄坏属性 / 选择器的字符换掉，汉字照用 */
const footnoteSlug = (id: string) => id.replace(/[^\p{L}\p{N}_-]/gu, '_');

// 脚注定义 [^1]: …（含缩进的续行；连续多条并成一块）。必须抢在 marked 的「链接引用定义」之前，
// 否则 [^1]: 内容 会被当成链接定义，正文里的 [^1] 变成一条乱码链接。
const FOOTNOTE_DEF_ONE = String.raw`\[\^[^\]\s]+\]:[ \t]*[^\n]*(?:\n(?:[ \t]{2,}|\t)[^\n]+)*`;
const FOOTNOTE_DEF_RE = new RegExp(`^${FOOTNOTE_DEF_ONE}(?:\\n+${FOOTNOTE_DEF_ONE})*(?:\\n+|$)`);
const footnoteDefExtension = (mode: MarkedMode) => ({
  name: 'footnoteDef',
  level: 'block' as const,
  start(src: string) {
    return src.match(/^\[\^[^\]\s]+\]:/m)?.index;
  },
  tokenizer(this: any, src: string) {
    const m = FOOTNOTE_DEF_RE.exec(src);
    if (!m) return undefined;
    const text = m[0].replace(/\n+$/, '');
    const items = text.split(/\n+(?=\[\^[^\]\s]+\]:)/).map((one) => {
      const dm = /^\[\^([^\]\s]+)\]:[ \t]*([\s\S]*)$/.exec(one)!;
      return { id: dm[1], tokens: this.lexer.inlineTokens(dm[2].replace(/\n[ \t]+/g, ' ')) };
    });
    return { type: 'footnoteDef', raw: m[0], text, items };
  },
  renderer(this: any, token: any) {
    if (mode === 'rich') return rawBlockHtml(token.text, 'footnote');
    const rows = token.items.map((it: any) => `<div class="footnote-def" id="fn-${footnoteSlug(it.id)}" data-footnote-def="${escapeHtml(it.id)}"><sup>${escapeHtml(it.id)}</sup> ${this.parser.parseInline(it.tokens)} <a class="footnote-back" href="#fnref-${footnoteSlug(it.id)}" data-footnote-back="${escapeHtml(it.id)}" title="回到正文">↩</a></div>`).join('');
    return `<div class="footnotes">${rows}</div>\n`;
  },
});

function rawBlockHtml(raw: string, kind: 'html' | 'footnote') {
  const source = restorePlaceholders(raw);
  return `<div data-raw-block="${kind}" data-raw="${encodeRaw(source)}">${escapeHtml(source)}</div>\n`;
}

function rawInlineHtml(raw: string) {
  const source = restorePlaceholders(raw);
  return `<span data-raw-inline="" data-raw="${encodeRaw(source)}">${escapeHtml(source)}</span>`;
}

/** 编辑器有对应标记（或本来就认识）的行内 HTML 标签：原样交给 Tiptap */
const PASS_INLINE_TAGS = new Set(['u', 's', 'del', 'strike', 'kbd', 'sub', 'sup', 'mark', 'br']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function parseHtmlTag(raw: string): { name: string; closing: boolean; selfClosing: boolean; comment: boolean } | null {
  if (/^<!--/.test(raw)) return { name: '!--', closing: false, selfClosing: true, comment: true };
  const m = /^<(\/?)([A-Za-z][A-Za-z0-9-]*)\b[^>]*?(\/?)>$/.exec(raw.trim());
  if (!m) return null;
  return { name: m[2].toLowerCase(), closing: m[1] === '/', selfClosing: m[3] === '/', comment: false };
}

/** 只带 src / alt / title 的 <img> 可以无损变成图片节点；带宽高、样式的要原样保留 */
function isSimpleImg(raw: string): boolean {
  if (!/^<img\b[^>]*>\s*$/i.test(raw.trim())) return false;
  const attrs = [...raw.matchAll(/\s([A-Za-z_:][-\w:.]*)\s*=/g)].map((m) => m[1].toLowerCase());
  return attrs.includes('src') && attrs.every((a) => a === 'src' || a === 'alt' || a === 'title');
}

/**
 * 整理行内 HTML：
 * - 找不到配对的标签（List<String> 里的 <String>）当成普通文字，不再被浏览器吞掉；
 * - 富文本模式下，成对的未知标签（<span style>、<font> 等）连同内容合并成一个「原样保留」节点。
 */
function normalizeInlineHtml(list: any[], mode: MarkedMode) {
  const textToken = (raw: string) => ({ type: 'text', raw, text: raw });
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.type === 'html' && !t.block) {
      const info = parseHtmlTag(String(t.raw));
      if (!info) continue;
      if (info.comment) { if (mode === 'rich') list[i] = { type: 'rawInline', raw: t.raw }; continue; }
      if (PASS_INLINE_TAGS.has(info.name)) continue;
      if (info.name === 'img' && isSimpleImg(String(t.raw))) continue;
      if (info.closing) { list[i] = textToken(t.raw); continue; }
      if (info.selfClosing || VOID_TAGS.has(info.name)) { if (mode === 'rich') list[i] = { type: 'rawInline', raw: t.raw }; continue; }
      let depth = 1;
      let j = i + 1;
      for (; j < list.length; j++) {
        const u = list[j];
        if (u.type !== 'html' || u.block) continue;
        const ui = parseHtmlTag(String(u.raw));
        if (!ui || ui.name !== info.name || ui.selfClosing) continue;
        depth += ui.closing ? -1 : 1;
        if (depth === 0) break;
      }
      if (j >= list.length) { list[i] = textToken(t.raw); continue; }
      if (mode === 'rich') list.splice(i, j - i + 1, { type: 'rawInline', raw: list.slice(i, j + 1).map((x) => x.raw).join('') });
      else i = j;
      continue;
    }
    if (Array.isArray(t.tokens)) normalizeInlineHtml(t.tokens, mode);
    if (Array.isArray(t.items)) normalizeInlineHtml(t.items, mode);
    if (Array.isArray(t.header)) t.header.forEach((cell: any) => Array.isArray(cell.tokens) && normalizeInlineHtml(cell.tokens, mode));
    if (Array.isArray(t.rows)) t.rows.forEach((row: any[]) => row.forEach((cell: any) => Array.isArray(cell.tokens) && normalizeInlineHtml(cell.tokens, mode)));
  }
}

const IMAGE_TOKENS = new Set(['image', 'lenientImage']);
const containsImage = (t: any): boolean => IMAGE_TOKENS.has(t.type) || (Array.isArray(t.tokens) && t.tokens.some(containsImage));

/**
 * 编辑器里图片是块级节点：独占一段的图片没问题，但和文字同段的图片会被拆成单独一块，
 * 带链接的图片（[![徽章](img)](href)）还会丢掉链接。这类图片在富文本里按原文保留成行内节点。
 */
function protectInlineImages(list: any[], parentType = '') {
  for (const t of list) {
    if (Array.isArray(t.items)) protectInlineImages(t.items, 'list');
    if (Array.isArray(t.header)) t.header.forEach((cell: any) => Array.isArray(cell.tokens) && guardInline(cell.tokens, false));
    if (Array.isArray(t.rows)) t.rows.forEach((row: any[]) => row.forEach((cell: any) => Array.isArray(cell.tokens) && guardInline(cell.tokens, false)));
    if (!Array.isArray(t.tokens)) continue;
    const inlineHolder = t.type === 'paragraph' || t.type === 'heading' || (t.type === 'text' && parentType !== 'inline');
    if (inlineHolder) guardInline(t.tokens, t.type !== 'heading');
    else protectInlineImages(t.tokens, t.type);
  }
}

function guardInline(tokens: any[], allowLoneImage: boolean) {
  if (!tokens.some(containsImage)) return;
  const significant = tokens.filter((t) => !(t.type === 'text' && !String(t.raw).trim()));
  if (allowLoneImage && significant.length === 1 && IMAGE_TOKENS.has(significant[0].type)) return;
  tokens.forEach((t, i) => { if (containsImage(t)) tokens[i] = { type: 'rawInline', raw: t.raw }; });
}

function createMarked(mode: MarkedMode) {
  return new Marked({
    gfm: true,
    breaks: true,
    extensions: [footnoteDefExtension(mode), wikiLinkExtension, inlineMathExtension(mode), footnoteRefExtension(mode), tagExtension, highlightExtension, lenientImageExtension, {
      name: 'rawInline',
      renderer: (token: any) => rawInlineHtml(String(token.raw)),
    }] as any,
    hooks: {
      processAllTokens(tokens: any) {
        normalizeInlineHtml(tokens, mode);
        if (mode === 'rich') protectInlineImages(tokens);
        return tokens;
      },
    } as any,
    renderer: {
      code({ text, lang }: { text: string; lang?: string }) {
        const language = lang || 'plaintext';
        let highlighted = escapeHtml(text);
        try {
          if (language !== 'plaintext' && localLowlight.registered(language)) {
            highlighted = hastToHtml(localLowlight.highlight(language, text).children);
          }
        } catch (e) {
          console.warn('Highlighting failed in preview:', e);
        }
        return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
      },
      codespan({ text }: { text: string }) {
        // marked 的 tokenizer 不转义行内代码，默认渲染器才转义；自定义渲染器必须自己做
        return `<code class="inline-code">${escapeHtml(text)}</code>`;
      },
      // 源文件里的单个换行（breaks 模式）标成 data-soft，保存时仍写回单个换行，不给每行补两个空格
      br(token: any) {
        return /^( {2,}|\\)\n/.test(String(token?.raw ?? '')) ? '<br>' : '<br data-soft="">';
      },
      // 链接 / 图片地址保持原文：marked 默认会 encodeURI，中文路径保存后就成了一串 %E4%B8…
      link(this: any, { href, title, tokens, raw }: any) {
        const text = this.parser.parseInline(tokens);
        if (/^\s*(javascript|vbscript|data):/i.test(href)) return text;
        const auto = raw === `<${href}>` || /^<[^>]+>$/.test(raw) ? 'angle' : raw === href || (raw === text && !raw.startsWith('[')) ? 'bare' : '';
        return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''}${auto ? ` data-autolink="${auto}"` : ''}>${text}</a>`;
      },
      image({ href, title, text }: any) {
        if (/^\s*(javascript|vbscript):/i.test(href)) return escapeHtml(text || '');
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text || '')}"${title ? ` title="${escapeHtml(title)}"` : ''}>`;
      },
      html({ text, block }: any) {
        if (mode !== 'rich' || !block) return text;
        const raw = String(text).replace(/\n+$/, '');
        return isSimpleImg(raw) ? text : rawBlockHtml(raw, 'html');
      },
    } as any,
  });
}

const mdRich = createMarked('rich');
const mdPreview = createMarked('preview');

export interface SourceToken {
  type: string;
  raw: string;
}

/** 顶层块的原文切片（sourceMap 用）：各块 raw 依次拼起来就是输入本身 */
export function lexTopLevel(markdown: string): SourceToken[] {
  return (mdRich.lexer(markdown) as any[]).map((t) => ({ type: String(t.type), raw: String(t.raw) }));
}

export const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  hr: '---',
  bulletListMarker: '-',
});

turndownService.use(tables);
// 只转义真的会被解析成语法的字符（见 markdownEscape.ts）
turndownService.escape = escapeMarkdown;

// 显式图片规则：data URL 用 HTML 标签保存（避免 marked 解析超长 inline token 失败），普通 URL 用 markdown 语法
turndownService.addRule('image', {
  filter: 'img',
  replacement: (_content, node: any) => {
    const alt = (node.getAttribute('alt') || '').replace(/\n/g, '').replace(/"/g, '&quot;');
    const src = node.getAttribute('src') || '';
    if (!src) return '';
    // data URL：输出标准 markdown 语法
    if (src.startsWith('data:')) {
      return `![${alt}](${src})`;
    }
    const title = node.getAttribute('title') || '';
    const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : '';
    const dest = /\s/.test(src) && !node.hasAttribute('data-lenient') ? `<${src}>` : src;
    return `![${alt}](${dest}${titlePart})`;
  },
});

// Override heading rule to prevent list breakage
turndownService.addRule('heading', {
  filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  replacement: (content, node) => {
    const hLevel = Number(node.nodeName.charAt(1));
    let prefix = '';
    for (let i = 0; i < hLevel; i++) {
      prefix += '#';
    }
    
    // 如果这个标题是在列表项 <li> 内部的第一个元素，不要在它前面加空白行
    // 原生 turndown 对于 heading 是 '\n\n' + prefix + ' ' + content + '\n\n'
    // 这会把标题硬生生从 <li> 的首行顶开，导致 markdown 解析器认为列表断了然后再跟一个标题
    const isFirstChildOfLi = node.parentNode?.nodeName === 'LI' && node.previousSibling === null;
    
    if (isFirstChildOfLi) {
      if (node.nextSibling === null) {
         // It's the only child
         return prefix + ' ' + content;
      }
      return prefix + ' ' + content + '\n\n';
    }
    
    return '\n\n' + prefix + ' ' + content + '\n\n';
  }
});

// Flatten paragraphs inside table cells to prevent Markdown table breakage
turndownService.addRule('tableCellParagraphs', {
  filter: (node) => {
    return node.nodeName === 'P' && 
           (node.parentNode?.nodeName === 'TD' || node.parentNode?.nodeName === 'TH');
  },
  replacement: (content) => content
});

// Custom rule for mermaid blocks
turndownService.addRule('diagram', {
  filter: (node) => {
    const nodeName = node.nodeName.toUpperCase();
    return (nodeName === 'DIV' || nodeName === 'PRE' || nodeName === 'FIGURE' || nodeName === 'MERMAID-BLOCK') && 
           (node.hasAttribute('data-mermaid-block') || (node as HTMLElement).classList.contains('mermaid-diagram'));
  },
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const codeNode = el.querySelector('code');
    let code = el.getAttribute('data-code') || codeNode?.getAttribute('data-code') || '';
    
    if (code.startsWith('base64:')) {
      code = fromBase64(code.substring(7));
    }
    
    // 如果属性里没有，尝试从文本内容提取（仅作为最后的退路）
    if (!code.trim() && el.textContent?.includes('graph')) {
      code = el.textContent;
    }
    
    return '\n\n```mermaid\n' + code.trim() + '\n```\n\n';
  }
});

// Custom rule for svg blocks
turndownService.addRule('svg', {
  filter: (node) => {
    const nodeName = node.nodeName.toUpperCase();
    return (nodeName === 'DIV' || nodeName === 'PRE' || nodeName === 'SVG-BLOCK') && node.hasAttribute('data-svg-block');
  },
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const codeNode = el.querySelector('code');
    let code = el.getAttribute('data-code') || codeNode?.getAttribute('data-code') || '';
    
    if (code.startsWith('base64:')) {
      code = fromBase64(code.substring(7));
    }
    
    return '\n\n```svg\n' + code.trim() + '\n```\n\n';
  }
});

// 双向链接：<span data-wiki-link="目标">文本</span> → [[目标]] / [[目标|文本]]
turndownService.addRule('wikiLink', {
  filter: (node) => node.nodeName === 'SPAN' && (node as HTMLElement).hasAttribute('data-wiki-link'),
  replacement: (content, node) => {
    const target = (node as HTMLElement).getAttribute('data-wiki-link') || '';
    const label = (node as HTMLElement).textContent || target;
    return label === target ? `[[${target}]]` : `[[${target}|${label}]]`;
  },
});

// 嵌入：<div data-wiki-embed="目标" data-embed-label="300"> → ![[目标]] / ![[目标|300]]
turndownService.addRule('wikiEmbed', {
  filter: (node) => node.nodeName === 'DIV' && (node as HTMLElement).hasAttribute('data-wiki-embed'),
  replacement: (_content, node) => {
    const target = (node as HTMLElement).getAttribute('data-wiki-embed') || '';
    const label = (node as HTMLElement).getAttribute('data-embed-label') || '';
    return `\n\n![[${label ? `${target}|${label}` : target}]]\n\n`;
  },
});

// Custom rule for math blocks
turndownService.addRule('math', {
  filter: (node) => {
    return node.nodeName === 'DIV' && (node.classList.contains('math-block') || node.classList.contains('math-block-container'));
  },
  replacement: (content, node) => {
    const latex = (node as HTMLElement).getAttribute('data-latex') || content || '';
    return '\n\n$$\n' + latex.trim() + '\n$$\n\n';
  }
});

// ── 列表：`- ` 标记、紧凑排版、续行按标记宽度缩进；任务项与普通项共用一套逻辑 ──
// （原来的任务项规则会把换行压成空格，嵌套的子任务被挤进父任务那一行）
turndownService.addRule('listItem', {
  filter: 'li',
  replacement: (content, node, options) => {
    const el = node as HTMLElement;
    const parent = el.parentNode as HTMLElement | null;
    const isTask = el.getAttribute('data-type') === 'taskItem';
    let marker = `${options.bulletListMarker} `;
    if (!isTask && parent?.nodeName === 'OL') {
      const start = parent.getAttribute('start');
      const index = Array.prototype.indexOf.call(parent.children, el);
      marker = `${(start ? Number(start) : 1) + index}. `;
    }
    const check = isTask ? (el.getAttribute('data-checked') === 'true' ? '[x] ' : '[ ] ') : '';

    let body = content.replace(/^\n+/, '').replace(/\n+$/, '');
    // 「一段文字 + 子列表」是最常见的形态：段落与子列表之间不留空行。段落内部不会有空行，第一处空行就是两者的分界
    const holder = isTask ? (el.querySelector(':scope > div') ?? el) : el;
    const blocks = Array.from(holder.children).filter((c) => c.nodeName !== 'LABEL');
    const isList = (c: Element) => c.nodeName === 'UL' || c.nodeName === 'OL';
    if (blocks.length === 2 && blocks[0].nodeName === 'P' && isList(blocks[1])) body = body.replace(/\n{2,}/, '\n');
    body = body.replace(/\n(?=[^\n])/g, `\n${' '.repeat(marker.length)}`);
    return marker + check + body + (el.nextSibling ? '\n' : '');
  },
});

const quoteLines = (content: string) =>
  content.replace(/^\n+|\n+$/g, '').replace(/^/gm, '> ').replace(/^> $/gm, '>');

turndownService.addRule('blockquote', {
  filter: 'blockquote',
  replacement: (content) => `\n\n${quoteLines(content)}\n\n`,
});

// 提示块：> [!NOTE] 标题（类型名、折叠标记按原文保留）
turndownService.addRule('calloutTitle', {
  filter: (node) => node.nodeName === 'DIV' && (node as HTMLElement).classList.contains('callout__title'),
  replacement: () => '',
});
turndownService.addRule('callout', {
  filter: (node) => node.nodeName === 'DIV' && (node as HTMLElement).hasAttribute('data-callout'),
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const type = el.getAttribute('data-callout') || 'NOTE';
    const fold = el.getAttribute('data-fold') || '';
    const title = (el.getAttribute('data-title') || '').trim();
    const head = `> [!${type}]${fold}${title ? ` ${title}` : ''}`;
    const body = content.replace(/^\n+|\n+$/g, '');
    return `\n\n${head}${body ? `\n${quoteLines(body)}` : ''}\n\n`;
  },
});

// Frontmatter / 原样保留块 / 目录占位：原文存在属性里，写回时一个字符都不改
turndownService.addRule('frontmatter', {
  filter: (node) => node.nodeName === 'DIV' && (node as HTMLElement).hasAttribute('data-frontmatter'),
  replacement: (_content, node) => `\n\n${decodeRaw((node as HTMLElement).getAttribute('data-raw'))}\n\n`,
});
turndownService.addRule('rawBlock', {
  filter: (node) => node.nodeName === 'DIV' && (node as HTMLElement).hasAttribute('data-raw-block'),
  replacement: (_content, node) => `\n\n${decodeRaw((node as HTMLElement).getAttribute('data-raw'))}\n\n`,
});
turndownService.addRule('rawInline', {
  filter: (node) => node.nodeName === 'SPAN' && (node as HTMLElement).hasAttribute('data-raw-inline'),
  replacement: (_content, node) => decodeRaw((node as HTMLElement).getAttribute('data-raw')),
});
turndownService.addRule('toc', {
  filter: (node) => node.nodeName === 'DIV' && (node as HTMLElement).hasAttribute('data-toc'),
  replacement: () => '\n\n[TOC]\n\n',
});
turndownService.addRule('inlineMath', {
  filter: (node) => node.nodeName === 'SPAN' && (node as HTMLElement).hasAttribute('data-inline-math'),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const latex = el.getAttribute('data-latex') || el.textContent || '';
    return el.getAttribute('data-inline-math') === 'display' ? `$$${latex}$$` : `$${latex}$`;
  },
});

// 删除线 → ~~…~~；Markdown 没有对应语法的行内标记保留成 HTML 标签
turndownService.addRule('strikethrough', {
  filter: ['s', 'del', 'strike'] as any,
  replacement: (content) => (content ? `~~${content}~~` : ''),
});
turndownService.addRule('inlineHtmlMarks', {
  filter: ['u', 'kbd', 'sub', 'sup', 'mark'],
  replacement: (content, node) => {
    const tag = node.nodeName.toLowerCase();
    // 预览里的脚注上标不是用户写的 HTML
    if (tag === 'sup' && (node as HTMLElement).classList.contains('footnote-ref')) return `[^${content}]`;
    if (!content) return '';
    if (tag === 'mark' && (node as HTMLElement).hasAttribute('data-md')) return `==${content}==`;
    return `<${tag}>${content}</${tag}>`;
  },
});

// 换行：源文件里原本就是单个换行的写回单个换行；编辑器里 Shift+Enter 新加的用标准的「两个空格 + 换行」
turndownService.addRule('lineBreak', {
  filter: 'br',
  replacement: (_content, node) => ((node as HTMLElement).hasAttribute('data-soft') ? '\n' : '  \n'),
});

// 链接：地址保持原文；文字与地址相同的自动链接写回 <url> 或裸链接，不展开成 [url](url)
turndownService.addRule('link', {
  filter: (node) => node.nodeName === 'A' && !!(node as HTMLElement).getAttribute('href'),
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const href = el.getAttribute('href') || '';
    const title = el.getAttribute('title') || '';
    if (!title && el.textContent === href && /^(https?:\/\/|mailto:)[^\s<>]+$/i.test(href)) {
      return el.getAttribute('data-autolink') === 'bare' ? href : `<${href}>`;
    }
    const dest = /[\s<>]/.test(href) ? `<${href.replace(/[<>]/g, (c) => `\\${c}`)}>` : href.replace(/([()])/g, '\\$1');
    return `[${content}](${dest}${title ? ` "${title.replace(/"/g, '\\"')}"` : ''})`;
  },
});

export interface MarkdownToHtmlOptions {
  /** 导出用：Mermaid 代码不直接写进 HTML，而是按序收集到这里，HTML 里留 data-mermaid-static-index 占位 */
  collectMermaid?: string[];
  /** 导出时不带 frontmatter 属性卡片 */
  omitFrontmatter?: boolean;
}

/** 预览 / 导出里的 frontmatter 属性卡片 */
function frontmatterCardHtml(yaml: string): string {
  const fields = parseFrontmatter(yaml);
  if (fields.length === 0) return '';
  const rows = fields.map((f) => {
    const value = Array.isArray(f.value)
      ? f.value.map((v) => `<span class="frontmatter-card__chip">${escapeHtml(v)}</span>`).join('')
      : escapeHtml(f.value);
    return `<div class="frontmatter-card__row"><span class="frontmatter-card__key">${escapeHtml(f.key)}</span><span class="frontmatter-card__value">${value}</span></div>`;
  }).join('');
  return `<div class="frontmatter-card">${rows}</div>`;
}

/** > [!NOTE] 标题 形式的引用块 → 提示块。移动节点而不是拼 innerHTML，嵌套的提示块也能处理 */
function transformCallouts(doc: Document, withTitle: boolean) {
  Array.from(doc.querySelectorAll('blockquote')).reverse().forEach((bq) => {
    const first = bq.firstElementChild;
    if (!first || first.tagName !== 'P') return;
    // 首行 = 第一个 <br> 之前的内容，必须以 [!类型] 开头
    const headNodes: ChildNode[] = [];
    let br: ChildNode | null = null;
    for (const child of Array.from(first.childNodes)) {
      if (child.nodeName === 'BR') { br = child; break; }
      headNodes.push(child);
    }
    const headText = headNodes.map((n) => n.textContent || '').join('');
    const m = CALLOUT_HEAD_RE.exec(headText);
    if (!m) return;
    const [, type, fold, title] = m;

    headNodes.forEach((n) => n.remove());
    br?.remove();
    if (!first.textContent?.trim() && first.children.length === 0) first.remove();

    const box = doc.createElement('div');
    box.className = `callout callout--${calloutKind(type)}`;
    box.setAttribute('data-callout', type);
    box.setAttribute('data-fold', fold);
    box.setAttribute('data-title', title.trim());
    if (withTitle) {
      const head = doc.createElement('div');
      head.className = 'callout__title';
      head.textContent = calloutLabel(type, title);
      box.appendChild(head);
    }
    const bodyEl = doc.createElement('div');
    bodyEl.className = 'callout__body';
    while (bq.firstChild) bodyEl.appendChild(bq.firstChild);
    if (!bodyEl.children.length) bodyEl.appendChild(doc.createElement('p'));
    box.appendChild(bodyEl);
    bq.replaceWith(box);
  });
}

/** 独占一段的 [TOC]：富文本里换成 toc 节点占位；预览 / 导出里直接生成目录 */
function transformToc(doc: Document, mode: MarkedMode) {
  const marks = Array.from(doc.querySelectorAll('p')).filter((p) => p.children.length === 0 && /^\[toc\]$/i.test((p.textContent || '').trim()));
  if (marks.length === 0) return;
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  if (mode === 'preview') headings.forEach((h, i) => h.setAttribute('id', `toc-heading-${i}`));
  marks.forEach((p) => {
    const box = doc.createElement('div');
    box.setAttribute('data-toc', '');
    box.className = 'toc-block';
    if (mode === 'rich') {
      box.textContent = '[TOC]';
    } else {
      const min = headings.reduce((acc, h) => Math.min(acc, Number(h.tagName[1])), 6);
      headings.forEach((h, i) => {
        const a = doc.createElement('a');
        a.className = 'toc-block__item';
        a.setAttribute('href', `#toc-heading-${i}`);
        a.setAttribute('data-toc-index', String(i));
        a.setAttribute('style', `padding-left:${(Number(h.tagName[1]) - min) * 16}px`);
        a.textContent = h.textContent || '';
        box.appendChild(a);
      });
      if (headings.length === 0) box.textContent = '（文档里还没有标题）';
    }
    p.replaceWith(box);
  });
}

/**
 * 独占一段的 `![[目标]]`（Obsidian 的嵌入）→ 嵌入占位块。一段里连着几行嵌入就拆成几块。
 * 占位里先放原文；真正的内容（另一篇笔记、库里某处的图片）要读文件，由编辑器节点 / 预览在渲染后异步填进去（noteEmbed.ts）。
 * 夹在句子中间的 `![[x]]` 不动，还是「!」加一个链接；列表项里的也不动——列表项的第一个子节点必须是段落，换成块会被编辑器硬塞一个空段落。
 */
function transformEmbeds(doc: Document) {
  doc.querySelectorAll('p').forEach((p) => {
    if (!p.querySelector(':scope > span[data-wiki-link]') || p.closest('li')) return;
    const links: HTMLElement[] = [];
    let bang = false;
    for (const node of Array.from(p.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent || '').trim();
        if (!text) continue;
        if (text !== '!' || bang) return;
        bang = true;
      } else if (node.nodeName === 'BR') {
        continue;
      } else if (node.nodeName === 'SPAN' && (node as HTMLElement).hasAttribute('data-wiki-link') && bang) {
        links.push(node as HTMLElement);
        bang = false;
      } else {
        return;
      }
    }
    if (bang || links.length === 0) return;
    const blocks = links.map((link) => {
      const target = link.getAttribute('data-wiki-link') || '';
      const label = link.textContent || '';
      const box = doc.createElement('div');
      box.setAttribute('data-wiki-embed', target);
      if (label && label !== target) box.setAttribute('data-embed-label', label);
      box.textContent = `![[${label && label !== target ? `${target}|${label}` : target}]]`;
      return box;
    });
    p.replaceWith(...blocks);
  });
}

/**
 * 脚注收尾：鼠标停在上标上能直接看到脚注内容（不用跳过去再跳回来）；
 * 正文里没人引用的脚注不放 ↩，引用了一条不存在的脚注时上标不做成链接——点了没处去。
 */
function linkFootnotes(doc: Document) {
  const defs = new Map<string, Element>();
  doc.querySelectorAll('[data-footnote-def]').forEach((d) => defs.set(d.getAttribute('data-footnote-def') || '', d));
  const referenced = new Set<string>();
  doc.querySelectorAll('a[data-footnote-ref]').forEach((a) => {
    const id = a.getAttribute('data-footnote-ref') || '';
    const def = defs.get(id);
    if (!def) { a.replaceWith(doc.createTextNode(a.textContent || '')); return; }
    referenced.add(id);
    const text = Array.from(def.childNodes).filter((n) => !(n instanceof Element && (n.tagName === 'SUP' || n.classList.contains('footnote-back')))).map((n) => n.textContent).join('').trim();
    a.setAttribute('title', text);
  });
  defs.forEach((def, id) => { if (!referenced.has(id)) def.querySelector('.footnote-back')?.remove(); });
}

export const markdownToHtml = (markdownContent: string, inlineActual: boolean = false, options: MarkdownToHtmlOptions = {}): string => {
  if (!markdownContent) return '';
  footnoteRefCount = new Map();
  const mode: MarkedMode = inlineActual ? 'preview' : 'rich';

  // 0. Frontmatter 先拆出来：交给 marked 的话 --- 会变成分割线，YAML 变成二级标题
  const fm = splitFrontmatter(markdownContent);

  // 占位符 → 原文：原样保留块在渲染时要把里面的占位符换回去
  const originals = new Map<string, string>();
  const stash = (placeholder: string, original: string) => { originals.set(placeholder, original); return placeholder; };

  // 0.5 Pre-extract <img> tags with data URLs before passing to marked.
  //     This prevents marked from wrapping them in <p> or mangling the very long src attribute.
  const dataImgs: string[] = [];
  const placeholderDataImg = (i: number) => `:::DATA_IMG_${i}:::`;

  let processed = fm.body.replace(/<img\s[^>]*src="data:[^"]*"[^>]*\/?>/gi, (match) => {
    dataImgs.push(match);
    return stash(placeholderDataImg(dataImgs.length - 1), match);
  });

  // 1. Process Mermaid code blocks
  const mermaidRegex = /```mermaid\s*([\s\S]*?)(?:```|$)/g;
  const diagrams: string[] = [];
  const placeholderMermaid = (index: number) => `:::MERMAID_BLOCK_${index}:::`;

  processed = processed.replace(mermaidRegex, (match, code) => {
    const index = diagrams.length;
    let html = '';

    if (options.collectMermaid) {
      html = `<div data-mermaid-static-index="${options.collectMermaid.length}"></div>`;
      options.collectMermaid.push(code.trim());
    } else if (inlineActual) {
      // MD 预览：交给外层的 mermaid.run 渲染
      html = `<div class="mermaid-diagram">${escapeHtml(code.trim())}</div>`;
    } else {
      const encoded = `base64:${toBase64(code.trim())}`;
      html = `<div data-mermaid-block="" data-code="${encoded}">[mermaid]</div>`;
    }

    diagrams.push(html);
    return stash(placeholderMermaid(index), match);
  });

  // 2. Process SVG code blocks
  const svgRegex = /```svg\s*([\s\S]*?)(?:```|$)/g;
  const svgs: string[] = [];
  const placeholderSVG = (index: number) => `:::SVG_BLOCK_${index}:::`;

  processed = processed.replace(svgRegex, (match, code) => {
    const index = svgs.length;
    let html = '';

    if (inlineActual) {
      // Directly inject the SVG code
      html = `<div class="svg-preview-container">${code.trim()}</div>`;
    } else {
      const encoded = `base64:${toBase64(code.trim())}`;
      html = `<div data-svg-block="" data-code="${encoded}">[svg]</div>`;
    }

    svgs.push(html);
    return stash(placeholderSVG(index), match);
  });

  // 2.5 Process $$ math blocks（独占行的 $$ … $$）
  const mathRegex = /^\$\$[ \t]*\n([\s\S]*?)\n\$\$[ \t]*$/gm;
  const maths: string[] = [];
  const placeholderMath = (index: number) => `:::MATH_BLOCK_${index}:::`;
  processed = processed.replace(mathRegex, (match, latex: string) => {
    const index = maths.length;
    const clean = latex.trim();
    let html: string;
    if (inlineActual) {
      let rendered = '';
      try { rendered = katex.renderToString(clean, { displayMode: true, throwOnError: false }); } catch { rendered = escapeHtml(clean); }
      html = `<div class="math-block" data-latex="${escapeHtml(clean)}">${rendered}</div>`;
    } else {
      html = `<div class="math-block" data-latex="${escapeHtml(clean)}">${escapeHtml(clean)}</div>`;
    }
    maths.push(html);
    return stash(placeholderMath(index), match);
  });

  // 3. Parse with marked（同步解析，restorePlaceholders 这个模块级变量在此期间有效）
  restorePlaceholders = (raw) => {
    if (originals.size === 0 || !raw.includes(':::')) return raw;
    let out = raw;
    originals.forEach((original, placeholder) => { out = out.split(placeholder).join(original); });
    return out;
  };
  let htmlResult: string;
  try {
    htmlResult = (inlineActual ? mdPreview : mdRich).parse(processed, { async: false }) as string;
  } finally {
    restorePlaceholders = (raw) => raw;
  }

  const restoreBlock = (placeholder: string, html: string) => {
    if (!htmlResult.includes(placeholder)) return;
    const pRegex = new RegExp(`<p>\\s*${placeholder.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*</p>`, 'g');
    const replaced = htmlResult.replace(pRegex, () => html);
    htmlResult = replaced === htmlResult ? htmlResult.split(placeholder).join(html) : replaced;
  };

  // 3.5 Restore data URL <img> tags / 4. Mermaid / 5. SVG / 5.5 math（去掉 marked 可能包上的 <p>）
  dataImgs.forEach((imgHtml, index) => {
    const pStr = placeholderDataImg(index);
    if (!htmlResult.includes(pStr)) return;
    const pRegex = new RegExp(`<p>\\s*${pStr.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*</p>`, 'g');
    htmlResult = htmlResult.replace(pRegex, () => imgHtml);
    htmlResult = htmlResult.split(pStr).join(imgHtml);
  });
  diagrams.forEach((html, index) => restoreBlock(placeholderMermaid(index), html));
  svgs.forEach((html, index) => restoreBlock(placeholderSVG(index), html));
  maths.forEach((html, index) => restoreBlock(placeholderMath(index), html));

  // 6. Tiptap TaskList compatibility: Convert GFM checkboxes to data-type structures
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlResult, 'text/html');

  transformCallouts(doc, inlineActual);
  transformToc(doc, mode);
  transformEmbeds(doc);
  // 独占一段的图片：编辑器里图片是块级节点，外面的 <p> 留着的话，解析时图片前面会多出一个空段落——
  // 顶层节点数和原文的块数对不上，整篇的「原样保存」就此失效（别处的表格、列表一保存全被重新生成）
  if (mode === 'rich') {
    doc.body.querySelectorAll(':scope > p').forEach((p) => {
      const kids = Array.from(p.childNodes).filter((n) => !(n.nodeType === Node.TEXT_NODE && !n.textContent?.trim()));
      if (kids.length === 1 && kids[0].nodeName === 'IMG') p.replaceWith(kids[0]);
    });
  }
  if (mode === 'preview') linkFootnotes(doc);

  // 表格对齐：marked 输出 align 属性。Tiptap 的 TextAlign 只认 style；预览里样式表的 text-align 也会盖过 align 属性
  doc.querySelectorAll('th[align], td[align]').forEach((cell) => {
    const align = cell.getAttribute('align');
    if (align) (cell as HTMLElement).style.textAlign = align;
  });

  // 6a. GFM 允许同一个列表里混放普通项和任务项，但 Tiptap 的 taskList 只能装 taskItem：
  //     按"任务项 / 普通项"的连续段把列表拆成相邻的几个 <ul>，否则普通项会被塞进任务项里渲染错乱
  const isTaskLi = (li: Element) => {
    if (li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]')) return true;
    const firstText = (li.firstElementChild?.tagName === 'P' ? li.firstElementChild.textContent : li.firstChild?.textContent) || '';
    return /^\s*\[[ xX]\]/.test(firstText);
  };
  doc.querySelectorAll('ul').forEach(ul => {
    const items = Array.from(ul.children).filter(c => c.tagName === 'LI');
    const flags = items.map(isTaskLi);
    if (items.length < 2 || !flags.some(Boolean) || flags.every(Boolean)) return;
    const groups: Element[][] = [];
    items.forEach((li, i) => {
      const last = groups[groups.length - 1];
      if (last && flags[i] === flags[items.indexOf(last[0])]) last.push(li);
      else groups.push([li]);
    });
    const parent = ul.parentNode;
    if (!parent) return;
    groups.forEach(group => {
      const list = doc.createElement('ul');
      group.forEach(li => list.appendChild(li));
      parent.insertBefore(list, ul);
    });
    parent.removeChild(ul);
  });
  
  doc.querySelectorAll('li').forEach(li => {
    // 只看这一项自己的勾选框：用 querySelector('input') 会把子任务的勾选框误当成父项的
    const checkbox = li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]') as HTMLInputElement | null;

    // 2. Try finding [ ] or [x] text pattern (if marked failed to parse it as input)
    const ownText = ((li.firstElementChild?.tagName === 'P' ? li.firstElementChild.textContent : li.firstChild?.textContent) || '').trim();
    const hasTextCheck = !checkbox && /^\[[ xX]\]/.test(ownText);

    if (checkbox || hasTextCheck) {
      // Find the parent UL
      let parent = li.parentElement;
      while (parent && parent.tagName !== 'UL' && parent.tagName !== 'OL') {
        parent = parent.parentElement;
      }
      
      if (parent && parent.tagName === 'UL') {
        parent.setAttribute('data-type', 'taskList');
        parent.style.listStyle = 'none';
        parent.style.paddingLeft = '0';
      }
      
      li.setAttribute('data-type', 'taskItem');
      
      let isChecked = false;
      if (checkbox) {
        isChecked = checkbox.checked;
        checkbox.remove();
      } else {
        isChecked = /^\[[xX]\]/.test(ownText);
        // Use a more precise replacement on the innerHTML to preserve nested tags like <strong>
        li.innerHTML = li.innerHTML.replace(/^(\s*<p>\s*)?\[\s*[xX ]\s*\]\s*/, '$1');
      }
      
      // Tiptap's TaskItem structure: content should be wrapped in a div if not already structured
      // But avoid double-wrapping
      if (!li.querySelector(':scope > div')) {
        // 紧凑列表里任务项的文字是裸文本：包成段落，后面跟着的子列表才不会被并进同一段
        const div = doc.createElement('div');
        let para: HTMLElement | null = null;
        while (li.firstChild) {
          const child = li.firstChild;
          const isBlock = child.nodeType === 1 && /^(P|UL|OL|DIV|PRE|BLOCKQUOTE|TABLE|H[1-6])$/.test((child as Element).tagName);
          if (isBlock) {
            para = null;
            div.appendChild(child);
          } else {
            if (!para) { para = doc.createElement('p'); div.appendChild(para); }
            para.appendChild(child);
          }
        }
        Array.from(div.querySelectorAll(':scope > p')).forEach((p) => { if (!p.textContent?.trim() && p.children.length === 0) p.remove(); });
        if (!div.children.length) div.appendChild(doc.createElement('p'));
        li.appendChild(div);
      }
      
      li.setAttribute('data-checked', isChecked ? 'true' : 'false');

      // 预览 / 导出没有编辑器的节点视图来画勾选框：补一个只读的，结构与编辑器里一致，样式通用
      if (inlineActual && !li.querySelector(':scope > label')) {
        const label = doc.createElement('label');
        const box = doc.createElement('input');
        box.setAttribute('type', 'checkbox');
        box.setAttribute('disabled', '');
        if (isChecked) box.setAttribute('checked', '');
        label.appendChild(box);
        label.appendChild(doc.createElement('span'));
        li.insertBefore(label, li.firstChild);
      }
    }
  });

  let frontmatterHtml = '';
  if (fm.block !== null && !options.omitFrontmatter) {
    frontmatterHtml = inlineActual
      ? frontmatterCardHtml(fm.yaml)
      : `<div data-frontmatter="" data-raw="${encodeRaw(fm.block)}">${escapeHtml(fm.block)}</div>`;
  }
  return frontmatterHtml + doc.body.innerHTML;
};

/**
 * 异步将 Markdown 转换为带静态渲染组件的 HTML
 * 主要用于 PDF / HTML 导出：与预览走同一条管线（提示块、目录、公式、标签都一致），再把 Mermaid 预先渲染成静态 SVG
 */
export const markdownToStaticHtml = async (markdownContent: string, opts: { keepFrontmatter?: boolean } = {}): Promise<string> => {
  if (!markdownContent) return '';

  const mermaidCodes: string[] = [];
  const htmlResult = sanitizeHtml(markdownToHtml(markdownContent, true, { collectMermaid: mermaidCodes, omitFrontmatter: !opts.keepFrontmatter }));

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlResult, 'text/html');

  // 笔记里真有流程图才加载 Mermaid
  const mermaid = mermaidCodes.length > 0 ? await loadMermaid() : null;
  mermaid?.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'antiscript',
    fontFamily: 'var(--font-body)',
  });

  for (const placeholder of Array.from(doc.querySelectorAll('div[data-mermaid-static-index]'))) {
    const index = parseInt(placeholder.getAttribute('data-mermaid-static-index') || '', 10);
    const code = mermaidCodes[index];
    if (code === undefined) continue;
    let finalHtml = '';
    try {
      const id = `mermaid-static-${index}-${Math.random().toString(36).substring(7)}`;
      const { svg } = await mermaid!.render(id, code);
      finalHtml = `<div class="mermaid-static-rendered">${svg}</div>`;
    } catch (err) {
      console.error('Static mermaid render error:', err);
      finalHtml = `<pre class="mermaid-error">${escapeHtml(code)}</pre>`;
    }
    const fragment = parser.parseFromString(finalHtml, 'text/html').body.firstChild;
    if (fragment) placeholder.replaceWith(doc.importNode(fragment, true));
  }

  doc.querySelectorAll('.svg-preview-container').forEach((el) => el.classList.add('svg-static-rendered'));
  return doc.body.innerHTML;
};

/** 单元格的对齐方式：Tiptap 写在 style 里（也可能落在单元格内的段落上），marked 写在 align 属性里 */
function cellAlign(cell: Element): 'left' | 'center' | 'right' | null {
  const raw = (cell as HTMLElement).style?.textAlign
    || cell.getAttribute('align')
    || (cell.querySelector(':scope > p') as HTMLElement | null)?.style?.textAlign
    || '';
  return raw === 'left' || raw === 'center' || raw === 'right' ? raw : null;
}

export const htmlToMarkdown = (htmlContent: string): string => {
  if (!htmlContent) return '';

  // Use DOMParser to clean up HTML in a more robust way than regex
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // 0.0 段落中间、开头又长得像行首语法的文本节点（" + "、"- "、"1. "…）打上标记，转义时跳过行首规则
  const BLOCK_TAGS = /^(P|LI|DIV|H[1-6]|TD|TH|BLOCKQUOTE|BODY|UL|OL|TABLE|PRE|SECTION|ARTICLE)$/;
  const atBlockStart = (node: Node): boolean => {
    let current: Node | null = node;
    while (current) {
      let prev = current.previousSibling;
      while (prev && prev.nodeType === 3 && !(prev.nodeValue || '').trim()) prev = prev.previousSibling;
      if (prev) return prev.nodeName === 'BR';
      current = current.parentNode;
      if (!current || BLOCK_TAGS.test(current.nodeName)) return true;
    }
    return true;
  };
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const midLineNodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const textNode = n as Text;
    if (!LINE_START_SENSITIVE.test(textNode.nodeValue || '')) continue;
    if (textNode.parentElement?.closest('code, pre, a, [data-wiki-link], [data-raw-inline], [data-raw-block], [data-frontmatter], [data-inline-math]')) continue;
    if (!atBlockStart(textNode)) midLineNodes.push(textNode);
  }
  midLineNodes.forEach((t) => { t.nodeValue = MID_LINE_MARK + t.nodeValue; });

  // 0. 相邻的无序列表并成一个：它们是「普通项 / 任务项混排」被拆开的结果，Markdown 里本来就是同一个列表
  doc.querySelectorAll('ul').forEach((ul) => {
    let next = ul.nextElementSibling;
    while (next && next.tagName === 'UL' && ul.isConnected) {
      while (next.firstChild) ul.appendChild(next.firstChild);
      const dead = next;
      next = next.nextElementSibling;
      dead.remove();
    }
  });

  // 1. Remove colgroups, as they break GFM table detection in Turndown
  doc.querySelectorAll('colgroup').forEach(el => el.remove());

  // 2. Normalize table structure for GFM
  doc.querySelectorAll('table').forEach(table => {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length === 0) return;

    // Determine max columns to ensure consistency
    let maxCols = 0;
    rows.forEach(row => {
      const cellCount = row.querySelectorAll('td, th').length;
      if (cellCount > maxCols) maxCols = cellCount;
    });

    // Ensure all rows have the same number of cells
    rows.forEach(row => {
      const currentCells = row.querySelectorAll('td, th');
      for (let i = currentCells.length; i < maxCols; i++) {
        const td = doc.createElement('td');
        td.innerHTML = '&nbsp;';
        row.appendChild(td);
      }
    });

    // Handle proper header row for GFM
    let thead = table.querySelector('thead');
    if (!thead) {
      thead = doc.createElement('thead');
      const firstRow = rows[0];
      // Convert all cells in the first row to TH
      firstRow.querySelectorAll('td, th').forEach(cell => {
        const th = doc.createElement('th');
        th.innerHTML = cell.innerHTML || '&nbsp;';
        const align = cellAlign(cell);
        if (align) th.setAttribute('align', align);
        cell.parentNode?.replaceChild(th, cell);
      });
      thead.appendChild(firstRow);
      table.prepend(thead);
    } else {
      // Ensure thead rows use TH
      thead.querySelectorAll('td').forEach(td => {
        const th = doc.createElement('th');
        th.innerHTML = td.innerHTML || '&nbsp;';
        const align = cellAlign(td);
        if (align) th.setAttribute('align', align);
        td.parentNode?.replaceChild(th, td);
      });
    }
  });

  // 3. Clear styles and classes and flatten nested structures in cells
  doc.querySelectorAll('table, thead, tbody, tr, th, td').forEach(el => {
    if (el.nodeName === 'TD' || el.nodeName === 'TH') {
      const align = cellAlign(el);
      if (align) el.setAttribute('align', align);
    }
    el.removeAttribute('style');
    el.removeAttribute('class');
    
    if (el.nodeName === 'TD' || el.nodeName === 'TH') {
      // Ensure cells aren't empty (Turndown needs something to see)
      if (!el.textContent?.trim() && !el.querySelector('br, img, input')) {
        el.innerHTML = '&nbsp;';
      }
      
      // Remove any div wrappers inside cells
      el.querySelectorAll('div').forEach(div => {
        const span = doc.createElement('span');
        span.innerHTML = div.innerHTML;
        div.parentNode?.replaceChild(span, div);
      });

      // Ensure headings inside cells don't break the table structure
      el.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
        const bold = doc.createElement('strong');
        bold.innerHTML = h.innerHTML;
        h.parentNode?.replaceChild(bold, h);
      });
    }
  });

  // 4. Convert back to markdown
  return turndownService.turndown(doc.body.innerHTML);
};
