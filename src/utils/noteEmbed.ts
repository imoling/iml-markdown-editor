import { markdownToHtml } from './markdown';
import { sanitizeHtml } from './sanitize';
import { resolveImagesInHtml, toAssetUrl } from './assetUrl';
import { readNoteForLink } from './noteReader';
import { extractNoteSection, hideBlockIds } from './noteSection';
import { resolveWikiTarget, noteBaseName } from '../../electron/shared/wikiLink';

/**
 * 链接指向的内容，渲染好了的：悬浮预览（鼠标停在 [[链接]] 上）和嵌入（![[笔记]]）共用。
 */
export type LinkedContent =
  | { kind: 'note'; path: string; title: string; section: string | null; html: string; truncated: boolean }
  | { kind: 'image'; path: string; src: string }
  | { kind: 'audio'; path: string; src: string }
  | { kind: 'video'; path: string; src: string }
  /** 不在窗口里渲染的附件（PDF）：显示成一张文件卡片，交给系统默认应用打开 */
  | { kind: 'file'; path: string }
  /** 库里没有这篇笔记 / 这个附件 */
  | { kind: 'missing'; name: string }
  /** 笔记在，但没有链接里写的那个小节 / 块 */
  | { kind: 'no-section'; path: string; title: string; section: string };

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico|tiff?)$/i;
const AUDIO_RE = /\.(webm|m4a|mp3|wav|ogg|oga|opus|aac|flac)$/i;
const VIDEO_RE = /\.(mp4|m4v|mov|ogv)$/i;
const FILE_RE = /\.pdf$/i;

const dirOf = (p: string | null) => {
  if (!p || p.startsWith('new-')) return null;
  const at = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return at > 0 ? p.slice(0, at) : null;
};

/** 在行边界截断：悬浮卡片里不值得把一篇万字长文整篇渲染出来 */
function clip(markdown: string, maxChars: number): { text: string; truncated: boolean } {
  if (markdown.length <= maxChars) return { text: markdown, truncated: false };
  const cut = markdown.lastIndexOf('\n', maxChars);
  let text = markdown.slice(0, cut > maxChars / 2 ? cut : maxChars);
  // 截在围栏代码中间的话补上收尾，不然后面的「…」会被当成代码
  if ((text.match(/^(```|~~~)/gm) || []).length % 2 === 1) text += '\n```';
  return { text, truncated: true };
}

export interface LoadOptions {
  /** 链接写在哪篇笔记里：同名优先取它旁边的；`[[#小节]]` 指的就是它 */
  fromPath: string | null;
  maxChars?: number;
}

export async function loadLinkedContent(target: string, { fromPath, maxChars = 20000 }: LoadOptions): Promise<LinkedContent> {
  const raw = (target || '').trim();
  const fromDir = dirOf(fromPath);

  const fileName = raw.split('#')[0].trim();
  if (IMAGE_RE.test(fileName) || AUDIO_RE.test(fileName) || VIDEO_RE.test(fileName) || FILE_RE.test(fileName)) {
    let found: string | null = null;
    try { found = await window.api.search.findAttachment(fileName, fromDir); } catch { found = null; }
    if (!found) return { kind: 'missing', name: fileName };
    if (FILE_RE.test(fileName)) return { kind: 'file', path: found };
    return { kind: IMAGE_RE.test(fileName) ? 'image' : VIDEO_RE.test(fileName) ? 'video' : 'audio', path: found, src: toAssetUrl(found) };
  }

  let notes: { path: string; title: string; aliases?: string[] }[] = [];
  try { notes = await window.api.search.listNotes(fromPath ?? undefined); } catch { notes = []; }
  const link = resolveWikiTarget(notes, raw, fromDir);
  const path = link.note ? link.hit?.path ?? null : fromPath;
  if (!path) return { kind: 'missing', name: link.note || raw };
  const content = await readNoteForLink(path);
  if (content == null) return { kind: 'missing', name: link.note || raw };

  const title = link.hit?.title || noteBaseName(path);
  const sectionLabel = link.block ? `^${link.block}` : link.headings.join(' › ') || null;
  const section = extractNoteSection(content, link);
  if (section == null) return { kind: 'no-section', path, title, section: sectionLabel || '' };

  const { text, truncated } = clip(hideBlockIds(section), maxChars);
  const html = resolveImagesInHtml(sanitizeHtml(markdownToHtml(text, true)), dirOf(path));
  return { kind: 'note', path, title, section: sectionLabel, html, truncated };
}

// ── 嵌入：把 `<div data-wiki-embed>` 占位填成真正的内容 ─────────────────────────

const noteBaseNameWithExt = (p: string) => p.split(/[/\\]/).pop() || p;

const MAX_EMBED_DEPTH = 3;
let fillSeq = 0;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** `![[图.png|300]]` / `|300x200`：竖线后面是尺寸 */
function applyImageSize(img: HTMLImageElement | HTMLVideoElement, label: string) {
  const m = /^(\d+)(?:x(\d+))?$/.exec((label || '').trim());
  if (!m) return;
  img.style.width = `${m[1]}px`;
  if (m[2]) img.style.height = `${m[2]}px`;
}

// 上次画出来的内容。预览区每敲一个字都会整个重设 HTML，嵌入跟着变回占位；
// 有缓存就先同步画上，再去读最新的，内容真变了才重画——不然每个字都闪一下。
const painted = new Map<string, LinkedContent>();
const MAX_PAINTED = 100;
function remember(key: string, content: LinkedContent) {
  painted.delete(key);
  painted.set(key, content);
  if (painted.size > MAX_PAINTED) painted.delete(painted.keys().next().value as string);
}

/**
 * 填一个嵌入占位。chain 是从最外层笔记一路嵌进来的路径：A 嵌 B、B 又嵌 A 时到这里停，层数太深也停。
 */
export async function fillEmbed(slot: HTMLElement, fromPath: string | null, chain: string[] = []): Promise<void> {
  const target = slot.getAttribute('data-wiki-embed') || '';
  const label = slot.getAttribute('data-embed-label') || '';
  // 同一个占位可能被连着填两次（目标改了、笔记库刷新了）：后发的那次说了算
  const token = String(++fillSeq);
  slot.setAttribute('data-embed-token', token);
  const key = `${fromPath ?? ''}\n${target}`;
  const cached = painted.get(key);
  const nested = cached ? paintEmbed(slot, cached, target, label, chain) : null;
  const content = await loadLinkedContent(target, { fromPath });
  remember(key, content);
  if (slot.getAttribute('data-embed-token') !== token) return;
  if (cached && JSON.stringify(cached) === JSON.stringify(content)) { await nested; return; }
  await paintEmbed(slot, content, target, label, chain);
}

/** 标题栏带 data-wiki-link，所以编辑器和预览里现成的「点链接打开笔记」对它同样生效 */
function paintEmbed(slot: HTMLElement, content: LinkedContent, target: string, label: string, chain: string[]): Promise<void> {
  slot.innerHTML = '';
  slot.classList.add('note-embed');
  slot.classList.remove('note-embed--loading');
  slot.setAttribute('data-embed-kind', content.kind);

  if (content.kind === 'image') {
    const img = document.createElement('img');
    img.src = content.src;
    img.alt = noteBaseName(content.path);
    applyImageSize(img, label);
    slot.appendChild(img);
    return Promise.resolve();
  }
  if (content.kind === 'audio') {
    const audio = document.createElement('audio');
    audio.controls = true;
    audio.src = content.src;
    slot.appendChild(audio);
    return Promise.resolve();
  }
  if (content.kind === 'video') {
    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    video.src = content.src;
    applyImageSize(video, label);
    slot.appendChild(video);
    return Promise.resolve();
  }
  if (content.kind === 'file') {
    const card = el('div', 'note-embed__file');
    card.setAttribute('data-interactive', '');
    card.appendChild(el('span', 'note-embed__file-icon', 'PDF'));
    card.appendChild(el('span', 'note-embed__file-name', noteBaseNameWithExt(content.path)));
    const open = el('button', 'note-embed__file-btn', '打开');
    open.type = 'button';
    open.title = '用系统默认的应用打开';
    open.addEventListener('click', (e) => { e.stopPropagation(); void window.api.search.openAttachment(content.path); });
    const reveal = el('button', 'note-embed__file-btn', '显示位置');
    reveal.type = 'button';
    reveal.addEventListener('click', (e) => { e.stopPropagation(); window.api.shell.showItemInFolder(content.path); });
    card.append(open, reveal);
    slot.appendChild(card);
    return Promise.resolve();
  }

  const head = el('div', 'note-embed__head');
  head.setAttribute('data-wiki-link', target);
  slot.appendChild(head);

  if (content.kind === 'missing') {
    head.textContent = content.name;
    slot.appendChild(el('div', 'note-embed__hint', '笔记库里还没有这篇笔记，点上面的名字新建。'));
    return Promise.resolve();
  }
  head.textContent = content.section ? `${content.title} › ${content.section}` : content.title;
  if (content.kind === 'no-section') {
    slot.appendChild(el('div', 'note-embed__hint', `「${content.title}」里没有「${content.section}」这一节。`));
    return Promise.resolve();
  }
  if (chain.includes(content.path)) {
    slot.appendChild(el('div', 'note-embed__hint', '这篇笔记嵌入了它自己，到这里为止。'));
    return Promise.resolve();
  }
  if (chain.length >= MAX_EMBED_DEPTH) {
    slot.appendChild(el('div', 'note-embed__hint', '嵌入层数太深，点上面的名字打开它。'));
    return Promise.resolve();
  }
  const body = el('div', 'note-embed__body markdown-body');
  body.innerHTML = content.html;
  if (content.truncated) body.appendChild(el('div', 'note-embed__hint', '…内容很长，只显示了前面一部分。'));
  slot.appendChild(body);
  return fillEmbeds(body, content.path, [...chain, content.path]);
}

/** 填 root 里所有还没填的嵌入占位（只认最外一层；里面的由 fillEmbed 递归处理） */
export async function fillEmbeds(root: HTMLElement, fromPath: string | null, chain: string[] = fromPath ? [fromPath] : []): Promise<void> {
  const outer = root.closest('[data-wiki-embed]');
  const slots = Array.from(root.querySelectorAll<HTMLElement>('[data-wiki-embed]')).filter((s) => (s.parentElement?.closest('[data-wiki-embed]') ?? null) === outer);
  await Promise.all(slots.map((s) => fillEmbed(s, fromPath, chain)));
}
