/**
 * 「复制为公众号格式」：把导出用的静态 HTML 改写成微信公众号编辑器能直接粘贴的样子。
 *
 * 公众号编辑器的规矩决定了这里每一步：
 * ① 只认行内 style，<style>、class、id 全会被扔掉 → 每个元素的样式都铺成 style 属性；
 * ② 外链一律被剥掉（只留公众号文章的链接）→ 正文里换成上标 [n]，文末列「参考链接」；
 * ③ 图片只收网址（会自己转存）和内嵌的 data: 图 → 本地图片读成 PNG 内嵌，SVG（流程图）栅格化；
 * ④ 没有 KaTeX 的字体 → 公式画成图片，画不了就留 LaTeX 原文；
 * ⑤ 任务列表的复选框、<details> 这类它不认 → 换成 ☑ / ☐ 和普通段落。
 * 纯 DOM 操作，jsdom 里能测；读图、画公式由调用方注入。
 */

export interface WechatTheme {
  id: string;
  name: string;
  note: string;
  /** 主色：二级标题的竖条、加粗、行内代码、标签 */
  accent: string;
  /** 加粗字要不要染成主色（黑白主题不染） */
  tintStrong: boolean;
}

export const WECHAT_THEMES: WechatTheme[] = [
  { id: 'indigo', name: 'iML 紫', note: '标题带主色竖条，加粗染色', accent: '#4f46e5', tintStrong: true },
  { id: 'green', name: '微信绿', note: '和公众号自己的绿一个色系', accent: '#07c160', tintStrong: true },
  { id: 'ink', name: '素黑', note: '只有黑白灰，最不抢戏', accent: '#111111', tintStrong: false },
];

export interface WechatOptions {
  theme: WechatTheme;
  /** 本地图片 / 流程图 → data: 地址（PNG）。给不了就留说明文字 */
  loadImage?: (src: string) => Promise<string | null>;
  /** 公式 → 图片；给不了就留 LaTeX 原文 */
  renderMath?: (latex: string, display: boolean) => Promise<{ dataUrl: string; width: number; height: number } | null>;
}

export interface WechatResult {
  html: string;
  /** 纯文本备份，粘到只收文字的地方用 */
  text: string;
  /** 给界面提示用的统计 */
  stats: { localImages: number; remoteImages: number; links: number; formulas: number; diagrams: number; failedImages: number };
}

const FONT = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Helvetica Neue', Arial, sans-serif";
const MONO = "Menlo, Monaco, Consolas, 'Courier New', monospace";
const LINE = '#e5e5ea';

/** 每种元素的行内样式 */
function stylesFor(t: WechatTheme): Record<string, string> {
  const strong = t.tintStrong ? `font-weight:700;color:${t.accent};` : 'font-weight:700;';
  return {
    root: `font-family:${FONT};font-size:15px;line-height:1.75;color:#333;letter-spacing:0.3px;word-break:break-word;padding:0 2px;`,
    h1: 'font-size:22px;font-weight:700;line-height:1.4;color:#111;margin:1.6em 0 1em;text-align:center;',
    h2: `font-size:19px;font-weight:700;line-height:1.4;color:#111;margin:1.8em 0 0.9em;padding-left:10px;border-left:4px solid ${t.accent};`,
    h3: 'font-size:17px;font-weight:700;line-height:1.4;color:#111;margin:1.5em 0 0.8em;',
    h4: 'font-size:16px;font-weight:700;line-height:1.4;color:#111;margin:1.4em 0 0.7em;',
    p: 'margin:0 0 1em;line-height:1.75;',
    strong,
    em: 'font-style:italic;',
    del: 'text-decoration:line-through;color:#999;',
    mark: 'background:#fff3a3;padding:0 2px;border-radius:2px;',
    kbd: `font-family:${MONO};font-size:0.85em;padding:1px 5px;border:1px solid ${LINE};border-bottom-width:2px;border-radius:4px;background:#f6f8fa;`,
    inlineCode: `font-family:${MONO};font-size:0.9em;background:#f5f5f7;color:${t.tintStrong ? t.accent : '#c7254e'};padding:2px 5px;border-radius:4px;`,
    pre: `margin:1em 0;padding:14px 16px;background:#f6f8fa;border-radius:8px;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-all;overflow-wrap:anywhere;`,
    code: `font-family:${MONO};font-size:13px;background:none;padding:0;color:#24292e;`,
    blockquote: `margin:1em 0;padding:8px 14px;border-left:4px solid ${t.accent};background:#fafafa;color:#666;`,
    quoteP: 'margin:0;line-height:1.75;',
    ul: 'margin:0 0 1em;padding-left:1.4em;list-style:disc;',
    ol: 'margin:0 0 1em;padding-left:1.4em;list-style:decimal;',
    taskList: 'margin:0 0 1em;padding-left:0.2em;list-style:none;',
    li: 'margin:0.3em 0;line-height:1.75;',
    liP: 'margin:0;',
    tableWrap: 'overflow-x:auto;margin:1em 0;',
    table: 'border-collapse:collapse;width:100%;font-size:14px;',
    th: `border:1px solid ${LINE};padding:8px 10px;background:#f8f9fa;font-weight:600;text-align:left;`,
    td: `border:1px solid ${LINE};padding:8px 10px;`,
    hr: `border:none;border-top:1px solid ${LINE};margin:2em 0;`,
    img: 'display:block;max-width:100%;height:auto;margin:1em auto;border-radius:6px;',
    mathInline: 'display:inline-block;vertical-align:middle;margin:0 2px;',
    mathBlock: 'display:block;margin:1em auto;max-width:100%;',
    mathText: `font-family:${MONO};font-size:0.9em;color:#555;`,
    callout: 'margin:1em 0;padding:10px 14px;border-radius:8px;border-left:4px solid #6366f1;background:#eef2ff;',
    calloutTitle: 'font-weight:600;margin:0 0 4px;color:#4338ca;',
    calloutBody: 'margin:0;',
    tag: `color:${t.accent};background:${t.tintStrong ? `${t.accent}14` : '#f0f2f5'};border-radius:10px;padding:0 7px;font-size:0.92em;`,
    wiki: `color:${t.accent};`,
    sup: `color:${t.accent};font-size:0.75em;margin-left:1px;`,
    refs: `margin-top:2em;padding-top:0.8em;border-top:1px solid ${LINE};font-size:13px;color:#666;`,
    refsTitle: 'font-weight:600;margin:0 0 6px;',
    refItem: 'margin:0 0 4px;line-height:1.6;word-break:break-all;',
    footnotes: `margin-top:2em;padding-top:0.8em;border-top:1px solid ${LINE};font-size:13px;color:#666;`,
    footnote: 'margin:0 0 4px;line-height:1.6;',
    details: `margin:1em 0;padding:8px 14px;border:1px solid ${LINE};border-radius:8px;`,
    summary: 'font-weight:600;margin:0 0 6px;',
    embed: `margin:1em 0;padding:2px 0 2px 14px;border-left:3px solid ${t.accent}55;`,
    embedHead: `font-size:0.85em;font-weight:600;color:${t.accent};margin:0 0 2px;`,
    toc: `margin:1em 0;padding:12px 16px;border:1px solid ${LINE};border-radius:8px;background:#fafafa;`,
    tocItem: 'margin:0;line-height:1.9;',
    a: `color:${t.accent};text-decoration:none;border-bottom:1px solid ${t.accent}66;`,
  };
}

/** 代码高亮：highlight.js 的类名 → 颜色（GitHub 亮色配色，够用） */
const HLJS: Record<string, string> = {
  keyword: 'color:#d73a49;', built_in: 'color:#e36209;', type: 'color:#e36209;', literal: 'color:#005cc5;', number: 'color:#005cc5;',
  string: 'color:#032f62;', regexp: 'color:#032f62;', symbol: 'color:#032f62;', comment: 'color:#6a737d;font-style:italic;', quote: 'color:#6a737d;font-style:italic;',
  meta: 'color:#6a737d;', doctag: 'color:#6a737d;', title: 'color:#6f42c1;', 'title.function_': 'color:#6f42c1;', 'title.class_': 'color:#6f42c1;',
  function_: 'color:#6f42c1;', class_: 'color:#6f42c1;', params: 'color:#24292e;', attr: 'color:#22863a;', attribute: 'color:#6f42c1;', variable: 'color:#e36209;',
  'template-variable': 'color:#e36209;', property: 'color:#005cc5;', tag: 'color:#22863a;', name: 'color:#22863a;', 'selector-tag': 'color:#22863a;',
  'selector-class': 'color:#6f42c1;', 'selector-id': 'color:#6f42c1;', 'selector-attr': 'color:#6f42c1;', 'selector-pseudo': 'color:#6f42c1;',
  section: 'color:#005cc5;font-weight:700;', bullet: 'color:#735c0f;', addition: 'color:#22863a;background:#f0fff4;', deletion: 'color:#b31d28;background:#ffeef0;',
  emphasis: 'font-style:italic;', strong: 'font-weight:700;', link: 'color:#032f62;text-decoration:underline;', subst: 'color:#24292e;', operator: 'color:#d73a49;',
  punctuation: 'color:#24292e;', char: 'color:#032f62;', 'char.escape_': 'color:#032f62;', code: 'color:#24292e;', formula: 'color:#24292e;', 'meta.keyword': 'color:#6a737d;',
};

const CALLOUT_COLORS: Record<string, { border: string; bg: string; title: string }> = {
  note: { border: '#6366f1', bg: '#eef2ff', title: '#4338ca' },
  tip: { border: '#10b981', bg: '#ecfdf5', title: '#047857' },
  important: { border: '#8b5cf6', bg: '#f5f3ff', title: '#6d28d9' },
  warning: { border: '#f59e0b', bg: '#fffbeb', title: '#b45309' },
  caution: { border: '#ef4444', bg: '#fef2f2', title: '#b91c1c' },
};

const setStyle = (el: Element, css: string) => {
  const own = (el.getAttribute('style') || '').trim();
  // 单元格上原有的 text-align（表格对齐）留着，接在主题样式后面
  const keep = own.match(/text-align\s*:\s*(left|center|right)/i)?.[0];
  el.setAttribute('style', keep ? `${css}${keep};` : css);
};

const isExternalLink = (href: string) => /^https?:\/\//i.test(href) && !/^https?:\/\/mp\.weixin\.qq\.com\//i.test(href);

/** 把静态 HTML 改写成公众号编辑器能吃的 HTML */
export async function htmlToWechat(staticHtml: string, opts: WechatOptions): Promise<WechatResult> {
  const S = stylesFor(opts.theme);
  const doc = new DOMParser().parseFromString(`<body>${staticHtml}</body>`, 'text/html');
  const body = doc.body;
  const stats = { localImages: 0, remoteImages: 0, links: 0, formulas: 0, diagrams: 0, failedImages: 0 };
  // 这里自己造的元素样式已经定了，后面按标签铺样式的那一轮要跳过它们（标记在第 11 步会被一起去掉）
  const mk = (tag: string, css: string, text?: string) => { const el = doc.createElement(tag); el.setAttribute('style', css); el.setAttribute('data-wx', ''); if (text !== undefined) el.textContent = text; return el; };

  // 0. 用不上的东西
  body.querySelectorAll('style, script, .footnote-back, .frontmatter-card').forEach((el) => el.remove());

  // 1. 公式：先于别的处理，KaTeX 的结构里有一堆 span，不能让它们被当普通元素铺样式
  for (const el of Array.from(body.querySelectorAll('.math-block, .math-inline'))) {
    const display = el.classList.contains('math-block');
    const latex = el.getAttribute('data-latex') || el.querySelector('annotation')?.textContent || el.textContent || '';
    stats.formulas++;
    const img = opts.renderMath ? await opts.renderMath(latex, display).catch(() => null) : null;
    if (img) {
      const pic = doc.createElement('img');
      pic.setAttribute('src', img.dataUrl); pic.setAttribute('width', String(img.width)); pic.setAttribute('height', String(img.height)); pic.setAttribute('alt', latex);
      pic.setAttribute('style', display ? S.mathBlock : S.mathInline);
      if (display) { const wrap = mk('section', 'text-align:center;margin:1em 0;'); wrap.appendChild(pic); el.replaceWith(wrap); } else el.replaceWith(pic);
    } else {
      const code = mk(display ? 'p' : 'code', display ? `${S.p}text-align:center;${S.mathText}` : S.mathText, display ? `$$${latex}$$` : `$${latex}$`);
      el.replaceWith(code);
    }
  }

  // 2. 流程图 / SVG → 图片
  for (const el of Array.from(body.querySelectorAll('.mermaid-static-rendered, .svg-static-rendered, .svg-preview-container, .mermaid-error'))) {
    const svg = el.querySelector('svg');
    stats.diagrams++;
    const url = svg && opts.loadImage ? await opts.loadImage(`svg:${new XMLSerializer().serializeToString(svg)}`).catch(() => null) : null;
    if (url) { const pic = doc.createElement('img'); pic.setAttribute('src', url); pic.setAttribute('style', S.img); pic.setAttribute('alt', '图'); el.replaceWith(pic); }
    else { stats.failedImages++; el.replaceWith(mk('p', `${S.p}color:#999;text-align:center;`, '[流程图：公众号里放不下，请截图后手动插入]')); }
  }

  // 3. 图片：网址留给公众号自己转存，本地的读成 PNG 内嵌
  for (const img of Array.from(body.querySelectorAll('img'))) {
    const src = img.getAttribute('src') || '';
    if (/^https?:\/\//i.test(src)) stats.remoteImages++;
    else if (!src.startsWith('data:')) {
      stats.localImages++;
      const url = opts.loadImage ? await opts.loadImage(src).catch(() => null) : null;
      if (url) img.setAttribute('src', url);
      else { stats.failedImages++; img.replaceWith(mk('p', `${S.p}color:#999;text-align:center;`, `[图片：${img.getAttribute('alt') || src}]`)); continue; }
    }
    if (!img.getAttribute('style')?.includes('vertical-align')) setStyle(img, S.img);
  }

  // 4. 链接：脚注和目录的锚点去壳留字；外链换成上标，文末列参考链接；公众号自己的链接留着
  const refs: { text: string; href: string }[] = [];
  for (const a of Array.from(body.querySelectorAll('a'))) {
    const href = a.getAttribute('href') || '';
    const text = (a.textContent || '').trim();
    if (a.closest('.footnote-ref')) { a.replaceWith(doc.createTextNode(text)); continue; }
    if (!href || href.startsWith('#') || a.closest('.toc-block')) { const span = doc.createElement('span'); span.textContent = text; a.replaceWith(span); continue; }
    if (isExternalLink(href)) {
      stats.links++;
      let n = refs.findIndex((r) => r.href === href) + 1;
      if (!n) { refs.push({ text: text === href ? '' : text, href }); n = refs.length; }
      const span = doc.createElement('span');
      span.textContent = text;
      span.appendChild(mk('sup', S.sup, `[${n}]`));
      a.replaceWith(span);
      continue;
    }
    if (/^https?:\/\/mp\.weixin\.qq\.com\//i.test(href)) { setStyle(a, S.a); continue; }
    a.replaceWith(doc.createTextNode(text)); // mailto、file、iml:// 之类：公众号里点不了
  }

  // 5. 任务列表：复选框换成字符，里面多包的 <label><div><p> 拆掉
  const taskItems = Array.from(body.querySelectorAll('li')).filter((li) => li.getAttribute('data-type') === 'taskItem' || !!li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]'));
  for (const li of taskItems) {
    const checked = li.getAttribute('data-checked') === 'true' || !!li.querySelector('input[type="checkbox"]:checked, input[type="checkbox"][checked]');
    li.querySelectorAll(':scope > label, :scope > input, :scope > p > input').forEach((el) => el.remove());
    const holder = li.querySelector(':scope > div');
    if (holder) holder.replaceWith(...Array.from(holder.childNodes));
    // 项目文字外面的 <p> 是块级的，会把字挤到 ☑ 的下一行：拆掉，多段之间用换行
    li.querySelectorAll(':scope > p').forEach((para, i) => { if (i > 0) para.before(doc.createElement('br')); para.replaceWith(...Array.from(para.childNodes)); });
    const first = li.firstChild;
    if (first && first.nodeType === Node.TEXT_NODE) first.textContent = (first.textContent || '').replace(/^\s+/, '');
    li.prepend(doc.createTextNode(checked ? '☑ ' : '☐ '));
  }
  body.querySelectorAll('ul[data-type="taskList"]').forEach((ul) => ul.setAttribute('data-task-list', ''));

  // 6. 提示块
  for (const box of Array.from(body.querySelectorAll('.callout'))) {
    const kind = Array.from(box.classList).map((c) => c.replace(/^callout--/, '')).find((c) => CALLOUT_COLORS[c]) || 'note';
    const c = CALLOUT_COLORS[kind];
    const sec = mk('section', `margin:1em 0;padding:10px 14px;border-radius:8px;border-left:4px solid ${c.border};background:${c.bg};`);
    const title = box.querySelector('.callout__title, .callout__head');
    if (title && (title.textContent || '').trim()) sec.appendChild(mk('p', `font-weight:600;margin:0 0 4px;color:${c.title};`, (title.textContent || '').trim()));
    const bodyEl = box.querySelector('.callout__body') || box;
    const inner = mk('section', S.calloutBody);
    inner.append(...Array.from(bodyEl.childNodes).filter((n) => n !== title));
    sec.appendChild(inner);
    box.replaceWith(sec);
  }

  // 7. 目录块、嵌入、脚注、折叠块、标签、双向链接
  for (const toc of Array.from(body.querySelectorAll('.toc-block'))) {
    const sec = mk('section', S.toc);
    toc.querySelectorAll('.toc-block__item, span, a').forEach((item) => { const t = (item.textContent || '').trim(); if (t) sec.appendChild(mk('p', `${S.tocItem}${(item.getAttribute('style') || '').replace(/[^;]*padding-left[^;]*;?/i, (m) => m)}`, t)); });
    toc.replaceWith(sec);
  }
  for (const embed of Array.from(body.querySelectorAll('.note-embed'))) {
    const sec = mk('section', embed.getAttribute('data-embed-kind') === 'image' ? 'margin:1em 0;' : S.embed);
    const head = embed.querySelector(':scope > .note-embed__head');
    if (head && (head.textContent || '').trim()) sec.appendChild(mk('p', S.embedHead, (head.textContent || '').trim()));
    const inner = embed.querySelector(':scope > .note-embed__body') || embed;
    sec.append(...Array.from(inner.childNodes).filter((n) => n !== head && !(n instanceof Element && n.classList.contains('note-embed__hint'))));
    embed.replaceWith(sec);
  }
  for (const fn of Array.from(body.querySelectorAll('.footnotes'))) {
    const sec = mk('section', S.footnotes);
    fn.querySelectorAll('.footnote-def').forEach((def) => { const p = mk('p', S.footnote); p.append(...Array.from(def.childNodes)); sec.appendChild(p); });
    fn.replaceWith(sec);
  }
  for (const det of Array.from(body.querySelectorAll('details'))) {
    const sec = mk('section', S.details);
    const summary = det.querySelector(':scope > summary');
    if (summary) sec.appendChild(mk('p', S.summary, (summary.textContent || '').trim() || '详情'));
    sec.append(...Array.from(det.childNodes).filter((n) => n !== summary));
    det.replaceWith(sec);
  }
  body.querySelectorAll('.tag-chip').forEach((el) => setStyle(el, S.tag));
  body.querySelectorAll('.wiki-link').forEach((el) => { const span = mk('span', S.wiki, el.textContent || ''); el.replaceWith(span); });
  body.querySelectorAll('sup.footnote-ref').forEach((el) => setStyle(el, S.sup));

  // 8. 代码块与高亮
  for (const pre of Array.from(body.querySelectorAll('pre'))) {
    setStyle(pre, S.pre);
    pre.querySelectorAll('code').forEach((code) => setStyle(code, S.code));
    for (const span of Array.from(pre.querySelectorAll('span'))) {
      const cls = Array.from(span.classList).filter((c) => c.startsWith('hljs-')).map((c) => c.slice(5));
      const css = cls.map((c) => HLJS[c] || HLJS[c.split('.')[0]] || '').join('');
      if (css) span.setAttribute('style', css); else span.removeAttribute('style');
    }
  }
  body.querySelectorAll('code').forEach((code) => { if (!code.closest('pre') && !code.getAttribute('style')) setStyle(code, S.inlineCode); });

  // 9. 普通元素
  const plain: Record<string, string> = { h1: S.h1, h2: S.h2, h3: S.h3, h4: S.h4, h5: S.h4, h6: S.h4, strong: S.strong, b: S.strong, em: S.em, i: S.em, del: S.del, s: S.del, mark: S.mark, kbd: S.kbd, hr: S.hr, th: S.th, td: S.td, li: S.li };
  for (const [tag, css] of Object.entries(plain)) body.querySelectorAll(tag).forEach((el) => { if (!el.hasAttribute('data-wx')) setStyle(el, css); });
  body.querySelectorAll('p').forEach((p) => {
    if (p.hasAttribute('data-wx')) return;
    if (!(p.textContent || '').trim() && !p.querySelector('img')) { p.remove(); return; }
    setStyle(p, p.closest('blockquote') ? S.quoteP : p.closest('li') ? S.liP : S.p);
  });
  body.querySelectorAll('blockquote').forEach((el) => setStyle(el, S.blockquote));
  body.querySelectorAll('ul').forEach((el) => setStyle(el, el.hasAttribute('data-task-list') ? S.taskList : S.ul));
  body.querySelectorAll('ol').forEach((el) => setStyle(el, S.ol));
  for (const table of Array.from(body.querySelectorAll('table'))) {
    setStyle(table, S.table);
    table.querySelectorAll('th[align], td[align]').forEach((cell) => { const a = cell.getAttribute('align'); if (a) cell.setAttribute('style', `${cell.getAttribute('style') || ''}text-align:${a};`); });
    if (!table.parentElement?.getAttribute('style')?.includes('overflow-x')) { const wrap = mk('section', S.tableWrap); table.replaceWith(wrap); wrap.appendChild(table); }
  }
  body.querySelectorAll('br').forEach((br) => br.removeAttribute('data-soft'));

  // 10. 参考链接
  if (refs.length) {
    const sec = mk('section', S.refs);
    sec.appendChild(mk('p', S.refsTitle, '参考链接'));
    refs.forEach((r, i) => sec.appendChild(mk('p', S.refItem, `[${i + 1}] ${r.text ? `${r.text}：` : ''}${r.href}`)));
    body.appendChild(sec);
  }

  // 11. 只留公众号认的属性
  for (const el of Array.from(body.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      const keep = n === 'style' || n === 'src' || n === 'alt' || n === 'width' || n === 'height' || n === 'colspan' || n === 'rowspan' || (n === 'href' && el.tagName === 'A');
      if (!keep) el.removeAttribute(attr.name);
    }
  }

  const root = mk('section', S.root);
  root.removeAttribute('data-wx'); // 它在清理那一步之后才造出来
  root.append(...Array.from(body.childNodes));
  const text = Array.from(root.children).map((el) => (el.textContent || '').replace(/\s+\n/g, '\n').trim()).filter(Boolean).join('\n\n');
  return { html: root.outerHTML, text, stats };
}
