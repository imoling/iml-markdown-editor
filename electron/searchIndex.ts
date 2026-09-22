import fs from 'fs';
import path from 'path';
import { splitFrontmatter, extractTags, tagMatches, frontmatterAliases } from './shared/noteMeta';
import { LinkableNote, matchesNoteName, noteNames, parseWikiTarget } from './shared/wikiLink';
import { extractTasks, NoteTask } from './shared/tasks';
import { TEMPLATE_DIR } from './shared/noteTemplates';

/**
 * 笔记库全文索引（纯 JS，常驻主进程内存）。
 * 几千篇笔记量级下线性扫描已经足够快，且中文不需要分词器；后续要上向量 / FTS 再换实现。
 */
export interface IndexedNote {
  path: string;
  title: string;
  content: string;
  /** 小写副本，用于不区分大小写匹配 */
  lower: string;
  mtime: number;
  /** frontmatter 的 tags 与正文里的 #标签 */
  tags: string[];
  /** frontmatter 的 aliases：`[[别名]]` 也能链到这篇 */
  aliases: string[];
  /** 这篇里的待办（`- [ ] …`），已完成的也在 */
  tasks: NoteTask[];
}

export interface SearchSnippet {
  before: string;
  match: string;
  after: string;
}

/** 未链接提及的一处：offset / length 指向原文里那个词，「转成链接」时据此替换 */
export interface MentionSnippet extends SearchSnippet {
  offset: number;
  length: number;
}

export interface SearchResult {
  path: string;
  title: string;
  count: number;
  score: number;
  snippets: SearchSnippet[];
}

const NOTE_RE = /\.(md|markdown|mdown|mkd|txt)$/i;
/** `![[文件名]]` 能嵌入的附件：图片、音频、视频（与 iml-asset:// 放行的范围一致），以及 PDF（显示成文件卡片，用系统应用打开） */
const ATTACHMENT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico|tiff?|webm|m4a|mp3|wav|ogg|oga|opus|aac|flac|mp4|m4v|mov|ogv|pdf)$/i;
const MAX_FILE_SIZE = 2 * 1024 * 1024;
const SNIPPET_RADIUS = 48;
const MAX_SNIPPETS = 3;
const MAX_MENTION_NOTES = 50;

const blank = (s: string) => s.replace(/[^\n]/g, ' ');

/** 围栏代码、行内代码、HTML 注释抹成等长空格（下标与原文一致）：代码里的 [[x]] 不是链接 */
function maskCode(content: string): string {
  return content
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:\n\1[^\n]*(?=\n|$)|$)/gm, blank)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/`[^`\n]*`/g, blank);
}

/**
 * 再抹掉不该找「提及」的地方：frontmatter、已有的 [[链接]]、Markdown 链接的地址、裸网址、HTML（含转写块）。
 * 这份结果会被拿去改文件，所以宁可漏报，不能把链接插进会被弄坏的地方。
 */
function maskNonProse(content: string): string {
  const fmLength = content.length - splitFrontmatter(content).body.length;
  return (blank(content.slice(0, fmLength)) + maskCode(content.slice(fmLength)))
    .replace(/<details[\s\S]*?<\/details>/gi, blank)
    .replace(/!?\[\[[^\]\n]*\]\]/g, blank)
    .replace(/\]\([^)\n]*\)/g, blank)
    .replace(/https?:\/\/[^\s)>\]]+/g, blank)
    .replace(/<[^>\n]+>/g, blank);
}

const isWordChar = (ch: string | undefined) => !!ch && /[A-Za-z0-9_]/.test(ch);

function snippetAt(content: string, from: number, to: number): SearchSnippet {
  const start = Math.max(0, from - SNIPPET_RADIUS);
  const end = Math.min(content.length, to + SNIPPET_RADIUS);
  return {
    before: (start > 0 ? '…' : '') + content.slice(start, from).replace(/\s+/g, ' '),
    match: content.slice(from, to),
    after: content.slice(to, end).replace(/\s+/g, ' ') + (end < content.length ? '…' : ''),
  };
}

export class SearchIndex {
  private notes = new Map<string, IndexedNote>();
  /** 库里的图片 / 音频：Obsidian 的 `![[截图.png]]` 只写文件名，文件可能在库里任何地方 */
  private attachments = new Set<string>();
  private root: string | null = null;
  private building = false;
  private buildId = 0;

  status() {
    return { root: this.root, count: this.notes.size, building: this.building };
  }

  async build(root: string): Promise<void> {
    const id = ++this.buildId;
    this.root = root;
    this.building = true;
    this.notes.clear();
    this.attachments.clear();
    try {
      await this.walk(root, id);
    } finally {
      if (id === this.buildId) this.building = false;
    }
  }

  private async walk(dir: string, id: number): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (id !== this.buildId) return; // 已开始新一轮构建
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await this.walk(full, id);
      else if (entry.isFile() && NOTE_RE.test(entry.name)) await this.addFile(full);
      else if (entry.isFile() && ATTACHMENT_RE.test(entry.name)) this.attachments.add(full);
    }
  }

  async addFile(filePath: string): Promise<void> {
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile() || stat.size > MAX_FILE_SIZE) return;
      const content = await fs.promises.readFile(filePath, 'utf8');
      this.notes.set(filePath, {
        path: filePath,
        title: SearchIndex.titleOf(filePath, content),
        content,
        lower: content.toLowerCase(),
        mtime: stat.mtimeMs,
        tags: extractTags(content),
        aliases: frontmatterAliases(splitFrontmatter(content).yaml),
        tasks: extractTasks(content),
      });
    } catch {
      this.notes.delete(filePath);
    }
  }

  static titleOf(filePath: string, content: string): string {
    // 跳过 frontmatter：YAML 里的 `# 注释` 不是一级标题
    const m = splitFrontmatter(content).body.match(/^\s*#\s+(.+?)\s*$/m);
    if (m) return m[1].replace(/[*_`]/g, '').trim();
    return path.basename(filePath).replace(NOTE_RE, '');
  }

  remove(target: string) {
    this.notes.delete(target);
    this.attachments.delete(target);
    const prefix = target + path.sep;
    for (const key of [...this.notes.keys()]) {
      if (key.startsWith(prefix)) this.notes.delete(key);
    }
    for (const key of [...this.attachments]) {
      if (key.startsWith(prefix)) this.attachments.delete(key);
    }
  }

  /** 目录监听给到的变更路径：文件 → 重读；目录 → 重扫并清掉已消失的条目；不存在 → 移除 */
  async refresh(paths: string[]): Promise<void> {
    for (const p of paths) {
      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(p);
      } catch {
        this.remove(p);
        continue;
      }
      if (stat.isDirectory()) {
        const prefix = p + path.sep;
        const before = [...this.notes.keys(), ...this.attachments].filter((k) => k.startsWith(prefix));
        await this.walk(p, this.buildId);
        for (const key of before) {
          if (!fs.existsSync(key)) { this.notes.delete(key); this.attachments.delete(key); }
        }
      } else if (NOTE_RE.test(p)) {
        await this.addFile(p);
      } else if (ATTACHMENT_RE.test(p)) {
        this.attachments.add(p);
      }
    }
  }

  listNotes(): { path: string; title: string; aliases: string[]; chars: number }[] {
    // chars 给日记月历画深浅用：写得多的日子颜色深
    return [...this.notes.values()].map((n) => ({ path: n.path, title: n.title, aliases: n.aliases, chars: n.content.length })).sort((a, b) => a.title.localeCompare(b.title));
  }

  /** 全库标签及篇数；层级标签 a/b 同时计入父标签 a */
  listTags(): { tag: string; count: number }[] {
    const counts = new Map<string, { tag: string; notes: Set<string> }>();
    for (const note of this.notes.values()) {
      for (const tag of note.tags) {
        const parts = tag.split('/');
        for (let i = 1; i <= parts.length; i++) {
          const name = parts.slice(0, i).join('/');
          const key = name.toLowerCase();
          if (!counts.has(key)) counts.set(key, { tag: name, notes: new Set() });
          counts.get(key)!.notes.add(note.path);
        }
      }
    }
    return [...counts.values()]
      .map((c) => ({ tag: c.tag, count: c.notes.size }))
      .sort((a, b) => a.tag.localeCompare(b.tag, 'zh-Hans-CN'));
  }

  /** 带某个标签（或其子标签）的笔记，最近修改的在前 */
  notesByTag(tag: string): { path: string; title: string; tags: string[]; mtime: number }[] {
    return [...this.notes.values()]
      .filter((n) => n.tags.some((t) => tagMatches(t, tag)))
      .sort((a, b) => b.mtime - a.mtime)
      .map((n) => ({ path: n.path, title: n.title, tags: n.tags, mtime: n.mtime }));
  }

  /** 给定路径的原文与修改时间（语义索引用；不在索引里返回 null） */
  getNote(filePath: string): IndexedNote | null {
    return this.notes.get(filePath) ?? null;
  }

  allNotes(): IndexedNote[] {
    return [...this.notes.values()];
  }

  /** 多个词以空格分隔时要求全部命中；片段按第一个词截取 */
  search(query: string, limit = 50): SearchResult[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    const results: SearchResult[] = [];
    for (const note of this.notes.values()) {
      if (!terms.every((t) => note.lower.includes(t))) continue;
      let count = 0;
      const snippets: SearchSnippet[] = [];
      const first = terms[0];
      let idx = note.lower.indexOf(first);
      while (idx !== -1 && count < 200) {
        count++;
        if (snippets.length < MAX_SNIPPETS) {
          const start = Math.max(0, idx - SNIPPET_RADIUS);
          const end = Math.min(note.content.length, idx + first.length + SNIPPET_RADIUS);
          snippets.push({
            before: (start > 0 ? '…' : '') + note.content.slice(start, idx).replace(/\s+/g, ' '),
            match: note.content.slice(idx, idx + first.length),
            after: note.content.slice(idx + first.length, end).replace(/\s+/g, ' ') + (end < note.content.length ? '…' : ''),
          });
        }
        idx = note.lower.indexOf(first, idx + first.length);
      }
      const titleHit = terms.every((t) => note.title.toLowerCase().includes(t)) ? 10 : 0;
      results.push({ path: note.path, title: note.title, count, score: titleHit + Math.min(count, 20), snippets });
    }
    return results.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
  }

  /**
   * 全库待办：有待办的笔记连同它的待办，最近改过的笔记在前。
   * 「模板」目录里的不算——那是给新笔记预留的空格子，不是要做的事。
   */
  listTasks(includeDone = false): { path: string; title: string; mtime: number; tasks: NoteTask[] }[] {
    const templates = this.root ? path.join(this.root, TEMPLATE_DIR) + path.sep : null;
    const out: { path: string; title: string; mtime: number; tasks: NoteTask[] }[] = [];
    for (const note of this.notes.values()) {
      if (note.tasks.length === 0 || (templates && note.path.startsWith(templates))) continue;
      const tasks = includeDone ? note.tasks : note.tasks.filter((t) => !t.done);
      if (tasks.length) out.push({ path: note.path, title: note.title, mtime: note.mtime, tasks });
    }
    return out.sort((a, b) => b.mtime - a.mtime);
  }

  /**
   * `![[名字]]` 指的是库里哪个附件。带 `/` 的按路径结尾比对，否则按文件名（不区分大小写）。
   * 重名时先取 fromDir 底下的，再取路径最短的（Obsidian 的「最短路径」习惯）。找不到返回 null。
   */
  findAttachment(name: string, fromDir?: string | null): string | null {
    const wanted = (name || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
    if (!wanted || !ATTACHMENT_RE.test(wanted)) return null;
    const hits = [...this.attachments].filter((p) => ('/' + p.replace(/\\/g, '/').toLowerCase()).endsWith('/' + wanted));
    if (hits.length === 0) return null;
    const dir = fromDir ? fromDir.replace(/[/\\]+$/, '') + path.sep : null;
    return hits.sort((a, b) => Number(!!dir && b.startsWith(dir)) - Number(!!dir && a.startsWith(dir)) || a.length - b.length || a.localeCompare(b))[0];
  }

  /** 这个路径是不是库里已知的附件；是就原样返回，不是返回 null（给「用系统应用打开」把关） */
  knownAttachment(filePath: string): string | null {
    return this.attachments.has(filePath) ? filePath : null;
  }

  /** 传进来的是库里某篇笔记的路径就用它的全部名字（文件名 / 一级标题 / 别名）；否则当成一个名字 */
  private linkTarget(nameOrPath: string): LinkableNote {
    const note = this.notes.get(nameOrPath);
    return note ? { path: note.path, title: note.title, aliases: note.aliases } : { path: '', title: nameOrPath, aliases: [] };
  }

  /**
   * 哪些笔记链到了这篇：[[名字]]、[[名字|显示文本]]、[[名字#小节]]、[[文件夹/名字]]、![[名字]] 都算；
   * 名字可以是文件名、一级标题或 frontmatter 里的别名。代码块里的不算，自己链自己不算。
   */
  backlinks(nameOrPath: string): { path: string; title: string; snippets: SearchSnippet[] }[] {
    const target = this.linkTarget(nameOrPath);
    const names = noteNames(target).map((n) => n.toLowerCase());
    if (names.length === 0) return [];
    const out: { path: string; title: string; snippets: SearchSnippet[] }[] = [];
    for (const note of this.notes.values()) {
      if (note.path === target.path) continue;
      if (!note.lower.includes('[[') || !names.some((n) => note.lower.includes(n))) continue;
      const text = /`|~~~|<!--/.test(note.content) ? maskCode(note.content) : note.content;
      const re = /!?\[\[([^\]\n]+?)\]\]/g;
      const snippets: SearchSnippet[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) && snippets.length < MAX_SNIPPETS) {
        const linkTarget = m[1].split('|')[0].trim();
        if (matchesNoteName(target, linkTarget) || matchesNoteName(target, parseWikiTarget(linkTarget).note)) {
          snippets.push(snippetAt(note.content, m.index, m.index + m[0].length));
        }
      }
      if (snippets.length) out.push({ path: note.path, title: note.title, snippets });
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }

  /**
   * 未链接提及：正文里出现了这篇笔记的名字、但没写成 [[链接]] 的地方。
   * 一个字的名字不找（全是噪音）；英文名要求整词命中（「AI」不命中「MAIN」）。
   */
  unlinkedMentions(filePath: string): { path: string; title: string; snippets: MentionSnippet[] }[] {
    const target = this.notes.get(filePath);
    if (!target) return [];
    const names = noteNames(target).map((n) => n.toLowerCase()).filter((n) => n.length >= 2).sort((a, b) => b.length - a.length);
    if (names.length === 0) return [];
    const out: { path: string; title: string; snippets: MentionSnippet[] }[] = [];
    for (const note of this.notes.values()) {
      if (note.path === filePath) continue;
      if (!names.some((n) => note.lower.includes(n))) continue;
      const prose = maskNonProse(note.content).toLowerCase();
      const snippets: MentionSnippet[] = [];
      const taken: [number, number][] = [];
      for (const name of names) {
        let idx = prose.indexOf(name);
        while (idx !== -1 && snippets.length < MAX_SNIPPETS) {
          const to = idx + name.length;
          const wholeWord = !(isWordChar(name[0]) && isWordChar(prose[idx - 1])) && !(isWordChar(name[name.length - 1]) && isWordChar(prose[to]));
          // 长名字先找；短名字落在已命中的长名字里面就不重复报（「苹果」之于「苹果笔记」）
          if (wholeWord && !taken.some(([a, b]) => idx < b && to > a)) {
            taken.push([idx, to]);
            snippets.push({ ...snippetAt(note.content, idx, to), offset: idx, length: name.length });
          }
          idx = prose.indexOf(name, to);
        }
      }
      if (snippets.length) out.push({ path: note.path, title: note.title, snippets: snippets.sort((a, b) => a.offset - b.offset) });
      if (out.length >= MAX_MENTION_NOTES) break;
    }
    return out.sort((a, b) => a.title.localeCompare(b.title));
  }
}
