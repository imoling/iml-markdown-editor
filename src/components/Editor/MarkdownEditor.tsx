import React, { useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView, keymap } from '@codemirror/view';
import { Prec, Extension, EditorState } from '@codemirror/state';
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import {
  search,
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  selectNextOccurrence,
} from '@codemirror/search';
import { useAppStore } from '../../stores/appStore';
import { markdownToHtml, htmlToMarkdown } from '../../utils/markdown';
import { sanitizeHtml } from '../../utils/sanitize';
import { resolveImagesInHtml, noteDirOf } from '../../utils/assetUrl';
import { storeImageFile } from '../../utils/pasteImage';
import { isSingleUrl, escapeLinkText, htmlWorthConverting } from '../../utils/pasteText';
import { extractHeadings } from '../../utils/outline';
import { wikiHeadingCandidates, toNameCandidates } from '../../utils/wikiComplete';
import { readNoteForLink } from '../../utils/noteReader';
import { fillEmbeds } from '../../utils/noteEmbed';
import { loadMermaid } from '../../utils/mermaidLoader';
import { dataUrlFold, inDataUrlFold } from './dataUrlFold';
import '../styles/editor.css';

/** 每个标签页在源码区滚到哪：所有标签页共用一个编辑器，不记的话切过去就是上一篇的位置（#11） */
const sourceScrollTops = new Map<string, number>();

export const MarkdownEditor: React.FC = () => {
  const { activeTabId, tabs, updateTabContent, navigationRequest, appearanceMode } = useAppStore();
  const searchState = useAppStore((s) => s.search);
  const searchCommand = useAppStore((s) => s.searchCommand);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  // CodeMirror 的 view 是挂载后才创建的：放进 state，依赖它的 effect（滚动同步）才能在它就绪时重跑
  const [cmView, setCmView] = useState<EditorView | null>(null);

  const isDark =
    appearanceMode === 'dark' ||
    (appearanceMode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const content = activeTab?.content ?? '';

  // 给侧边栏功能用的两个动作，和富文本编辑器那边是同一套（转写的「打点」、新建会议记录后把光标放好）
  useEffect(() => {
    if (!cmView) return;
    const { registerEditorActions } = useAppStore.getState();
    registerEditorActions({
      insertText: (text) => { const { from, to } = cmView.state.selection.main; cmView.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } }); cmView.focus(); return true; },
      startList: () => {
        const end = cmView.state.doc.length;
        const insert = `${cmView.state.doc.sliceString(Math.max(0, end - 1), end) === '\n' ? '' : '\n'}\n- `;
        cmView.dispatch({ changes: { from: end, insert }, selection: { anchor: end + insert.length } });
        cmView.focus();
      },
      // 图片拖到了预览那一侧或编辑器外面的空白处（见 utils/dropFiles.ts）
      appendImage: (file) => {
        void storeImageFile(file, useAppStore.getState().activeTabId).then((stored) => {
          if (!stored) return;
          const end = cmView.state.doc.length;
          const insert = `${end === 0 || cmView.state.doc.sliceString(end - 1, end) === '\n' ? '' : '\n'}\n![${file.name.replace(/\.[^.]+$/, '')}](${stored})\n`;
          cmView.dispatch({ changes: { from: end, insert }, effects: EditorView.scrollIntoView(end + insert.length) });
        });
      },
    });
    return () => registerEditorActions(null);
  }, [cmView]);

  const handleUpdate = (val: string) => {
    if (activeTabId) {
      updateTabContent(activeTabId, val);
    }
  };

  // 切标签：恢复这一篇的滚动位置，之后每次滚动都记下来。CodeMirror 换完内容要等一帧才量得准高度，所以再补一次
  useEffect(() => {
    if (!cmView || !activeTabId) return;
    const dom = cmView.scrollDOM;
    const restore = () => { dom.scrollTop = sourceScrollTops.get(activeTabId) ?? 0; };
    restore();
    const frame = requestAnimationFrame(restore);
    const onScroll = () => sourceScrollTops.set(activeTabId, dom.scrollTop);
    dom.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); dom.removeEventListener('scroll', onScroll); };
  }, [cmView, activeTabId]);

  // 目录点击 → 跳到对应行
  useEffect(() => {
    if (editorRef.current?.view && navigationRequest) {
      const view = editorRef.current.view;
      const { heading, blockId, line: targetLine } = navigationRequest;
      let lineIndex = -1;
      const match = heading?.id.match(/^heading-(\d+)$/);
      // 待办面板给的就是行号
      if (typeof targetLine === 'number') lineIndex = targetLine;
      else if (match) lineIndex = parseInt(match[1]);
      // [[笔记#^块]]：块 ID 写在那一行的末尾
      else if (blockId) lineIndex = view.state.doc.toString().split('\n').findIndex((l) => l.trimEnd().endsWith(`^${blockId}`));
      if (lineIndex >= 0) {
        const safeLineIndex = Math.min(lineIndex + 1, view.state.doc.lines);
        const line = view.state.doc.line(safeLineIndex);
        view.dispatch({
          selection: { head: line.from, anchor: line.from },
          effects: [EditorView.scrollIntoView(line.from, { y: 'center' })],
        });
        view.focus();
      }
    }
  }, [navigationRequest]);

  // 预览区 Mermaid 渲染
  useEffect(() => {
    const renderMermaid = async () => {
      try {
        // 预览里没有流程图就不加载 Mermaid
        const diagrams = document.querySelectorAll('.md-editor-preview-container .mermaid-diagram');
        if (diagrams.length === 0) return;
        const mermaid = await loadMermaid();
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'neutral',
          securityLevel: 'antiscript',
          fontFamily: 'var(--font-body)',
          // @ts-ignore
          flowchart: { useMaxWidth: true, htmlLabels: true },
          // @ts-ignore
          sequence: { useMaxWidth: true },
          // @ts-ignore
          gantt: { useMaxWidth: true },
        });
        await mermaid.run({ nodes: Array.from(diagrams) as HTMLElement[] });
      } catch (err) {
        console.error('Mermaid rendering failed in MD preview:', err);
      }
    };
    const timer = setTimeout(renderMermaid, 50);
    return () => clearTimeout(timer);
  }, [content, isDark]);

  // ── 查找 / 替换：与 FindReplacePanel 通过 store 联动 ──
  // 匹配范围缓存：只在文档或查找条件变化时重扫，光标移动时只在缓存里定位
  const matchesRef = useRef<{ from: number; to: number }[]>([]);

  // 写进笔记里的图片折起来了，查找不进去：那里面碰巧有的字母数字不是正文
  const outsideFold = (_match: string, state: EditorState, from: number, to: number) => !inDataUrlFold(state, from, to);

  const recomputeMatches = (view: EditorView) => {
    const { query, caseSensitive } = useAppStore.getState().search;
    const ranges: { from: number; to: number }[] = [];
    if (query) {
      const cursor = new SearchQuery({ search: query, caseSensitive, literal: true, test: outsideFold }).getCursor(view.state);
      for (let r = cursor.next(); !r.done; r = cursor.next()) ranges.push({ from: r.value.from, to: r.value.to });
    }
    matchesRef.current = ranges;
  };

  const reportCounts = (view: EditorView) => {
    const sel = view.state.selection.main;
    const idx = matchesRef.current.findIndex((m) => m.from === sel.from && m.to === sel.to);
    useAppStore.getState().setSearchCounts(matchesRef.current.length, idx + 1);
  };

  const pushQuery = (view: EditorView) => {
    const { query, caseSensitive, replacement } = useAppStore.getState().search;
    view.dispatch({
      effects: setSearchQuery.of(new SearchQuery({ search: query, caseSensitive, replace: replacement, literal: true, test: outsideFold })),
    });
  };

  // 查找条件变化、或切换标签（扩展会重新实例化）时重新下发查询
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view) return;
    pushQuery(view);
    recomputeMatches(view);
    if (searchState.query) findNext(view);
    reportCounts(view);
  }, [searchState.query, searchState.caseSensitive, activeTabId]);

  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view || !searchCommand) return;
    if (useAppStore.getState().search.query) {
      pushQuery(view);
      switch (searchCommand.type) {
        case 'next': findNext(view); break;
        case 'prev': findPrevious(view); break;
        case 'replace': replaceNext(view); break;
        case 'replaceAll': replaceAll(view); break;
      }
      recomputeMatches(view);
      reportCounts(view);
    }
    // 处理完即清掉，切换编辑模式时新挂载的编辑器不会重放这条命令
    useAppStore.getState().consumeSearchCommand();
  }, [searchCommand]);

  // 源码模式里输入 [[ 时补全笔记名
  const wikiCompletion = async (context: CompletionContext): Promise<CompletionResult | null> => {
    const word = context.matchBefore(/\[\[[^\]\n]*/);
    if (!word) return null;
    let notes: { title: string; path: string; aliases?: string[] }[] = [];
    try { notes = await window.api.search.listNotes(); } catch { notes = []; }
    // [[笔记# → 列那篇笔记的小节
    const { tabs, activeTabId: currentId } = useAppStore.getState();
    const headings = await wikiHeadingCandidates(notes, word.text.slice(2), {
      currentPath: currentId && !currentId.startsWith('new-') ? currentId : null,
      currentContent: tabs.find((t) => t.id === currentId)?.content ?? '',
      readNote: readNoteForLink,
    }, 50);
    if (headings) {
      return {
        from: word.from + 2,
        options: headings.map((h) => ({ label: h.target, displayLabel: `${'　'.repeat(h.level - 1)}# ${h.heading}`, apply: `${h.target}]]`, type: 'text' })),
        validFor: /^[^\]\n]*$/,
      };
    }
    const options: { label: string; detail?: string; apply: string; type: string }[] = [];
    const seen = new Set<string>();
    for (const n of toNameCandidates(notes)) {
      if (!seen.has(n.title)) { seen.add(n.title); options.push({ label: n.title, apply: `${n.title}]]`, type: 'text' }); }
      // 别名：敲别名也能找到，落笔写成 [[文件名|别名]]（Obsidian 只认文件名）
      for (const alias of n.aliases || []) options.push({ label: alias, detail: `→ ${n.title}`, apply: `${n.title}|${alias}]]`, type: 'text' });
    }
    return { from: word.from + 2, options, validFor: /^[^\]\n]*$/ };
  };

  // Vim 键位：要用的人才加载这个库（单独一个包，不进主包）。`:w` 接到应用自己的保存上
  const vimMode = useAppStore((st) => st.vimMode);
  const [vimExt, setVimExt] = useState<Extension | null>(null);
  useEffect(() => {
    if (!vimMode) { setVimExt(null); return; }
    let alive = true;
    import('@replit/codemirror-vim').then(({ vim, Vim }) => {
      if (!alive) return;
      Vim.defineEx('write', 'w', () => { void useAppStore.getState().saveActiveFile(); });
      setVimExt(vim());
    }).catch((err) => console.error('Failed to load vim keymap:', err));
    return () => { alive = false; };
  }, [vimMode]);

  const extensions = useMemo(
    () => [
      // Vim 必须排在最前面：它要先于别的键位拿到按键
      ...(vimExt ? [vimExt] : []),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      search(),
      // 写进笔记里的图片（一长串 base64）折成一个小标签
      dataUrlFold,
      // ⌘D：选中下一处相同的文字（多光标一起改）。自带的搜索快捷键整体关掉了（查找由应用的面板接管），这一个单独接回来
      Prec.high(keymap.of([{ key: 'Mod-d', run: selectNextOccurrence, preventDefault: true }])),
      autocompletion({ override: [wikiCompletion], activateOnTyping: true }),
      EditorView.updateListener.of((update) => {
        // 状态栏的「选中 N 字」
        if (update.selectionSet || update.docChanged) {
          const { from, to } = update.state.selection.main;
          useAppStore.getState().setSelectionText(from === to ? '' : update.state.sliceDoc(from, to));
        }
        if (!useAppStore.getState().search.query) return;
        if (update.docChanged) recomputeMatches(update.view);
        if (update.docChanged || update.selectionSet) reportCounts(update.view);
      }),
      EditorView.domEventHandlers({
        drop(event, view) {
          const file = event.dataTransfer?.files?.[0];
          if (file && file.type.startsWith('image/') && activeTabId) {
            event.preventDefault();
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            storeImageFile(file, activeTabId).then((stored) => {
              if (stored && pos !== null) view.dispatch({ changes: { from: Math.min(pos, view.state.doc.length), insert: `\n![${file.name.replace(/\.[^.]+$/, '')}](${stored})\n` } });
            });
            return true;
          }
          // 别的文件（.md、文件夹）不往正文里塞内容——CodeMirror 默认会把文本文件的内容插进来；由 window 上的处理打开它们（utils/dropFiles.ts）
          return !!file;
        },
        paste(event, view) {
          const clipboard = event.clipboardData;
          if (!clipboard || !activeTabId) return false;
          const file = clipboard.files?.[0];
          if (file && file.type.startsWith('image/')) {
            event.preventDefault();
            storeImageFile(file, activeTabId).then((stored) => {
              if (!stored) return;
              const { from, to } = view.state.selection.main;
              view.dispatch({ changes: { from, to, insert: `![](${stored})` }, selection: { anchor: from + 2 } });
            });
            return true;
          }

          const text = clipboard.getData('text/plain');
          const { from, to } = view.state.selection.main;

          // 就一个网址：有选区 → [选中文字](url)；没有 → 先贴网址，取到网页标题后换成 [标题](url)
          if (isSingleUrl(text)) {
            const url = text.trim();
            event.preventDefault();
            if (from !== to) {
              const label = view.state.sliceDoc(from, to);
              view.dispatch({ changes: { from, to, insert: `[${escapeLinkText(label)}](${url})` } });
              return true;
            }
            view.dispatch({ changes: { from, to, insert: url }, selection: { anchor: from + url.length } });
            if (useAppStore.getState().fetchLinkTitle) {
              window.api.web.fetchTitle(url).then((title) => {
                // 只在那段文字还原封不动时才替换，用户已经接着改了就不打扰
                if (!title || view.state.sliceDoc(from, from + url.length) !== url) return;
                const before = view.state.sliceDoc(Math.max(0, from - 2), from);
                if (before === '](' || before.endsWith('<')) return;
                view.dispatch({ changes: { from, to: from + url.length, insert: `[${escapeLinkText(title)}](${url})` } });
              }).catch(() => {});
            }
            return true;
          }

          // 从网页 / 文档里复制的带格式内容 → 转成 Markdown；代码编辑器复制的内容仍按纯文本
          const html = clipboard.getData('text/html');
          if (html && htmlWorthConverting(html, Array.from(clipboard.types))) {
            const converted = htmlToMarkdown(sanitizeHtml(html)).trim();
            if (converted) {
              event.preventDefault();
              view.dispatch({ changes: { from, to, insert: converted }, selection: { anchor: from + converted.length } });
              return true;
            }
          }
          return false;
        },
      }),
    ],
    [activeTabId, vimExt],
  );

  // 预览 HTML 只在内容变化时重算；文件里的原生 HTML / SVG 先净化再注入
  const previewHtml = useMemo(
    () => resolveImagesInHtml(sanitizeHtml(markdownToHtml(content, true)), noteDirOf(activeTabId, useAppStore.getState().getNewNoteDir())),
    [content, activeTabId],
  );
  // React 19 对 dangerouslySetInnerHTML 比的是对象身份、不是里面的字符串：每次渲染都给一个新的 { __html }，
  // 它就每次都重设 innerHTML，渲染后填进去的东西（Mermaid 图、嵌入的内容）会被任何一次无关的重渲染冲掉
  const previewMarkup = useMemo(() => ({ __html: previewHtml }), [previewHtml]);

  // 预览里的嵌入 ![[…]]：内容要读别的文件，渲染完再异步填进去；被嵌入的那篇存盘了（libraryVersion）就重填
  const libraryVersion = useAppStore((s) => s.libraryVersion);
  useEffect(() => {
    const root = previewRef.current;
    if (!root || !previewHtml.includes('data-wiki-embed')) return;
    void fillEmbeds(root, activeTabId && !activeTabId.startsWith('new-') ? activeTabId : null);
  }, [previewHtml, libraryVersion, activeTabId]);

  // ── 左右滚动同步：以标题为锚点分段插值（段内按比例），比整篇按比例准得多 ──
  useEffect(() => {
    const view = cmView;
    const preview = previewRef.current;
    if (!view || !preview) return;
    const source = view.scrollDOM;
    let lock: 'source' | 'preview' | null = null;
    let unlockTimer: ReturnType<typeof setTimeout> | null = null;
    const hold = (who: 'source' | 'preview') => {
      lock = who;
      if (unlockTimer) clearTimeout(unlockTimer);
      unlockTimer = setTimeout(() => { lock = null; }, 140);
    };

    /** 两侧一一对应的锚点（像素位置，相对各自滚动内容的顶部） */
    const anchors = (): { src: number; dst: number }[] => {
      const points = [{ src: 0, dst: 0 }];
      const heads = extractHeadings(view.state.doc.toString());
      const els = Array.from(preview.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')).filter((el) => !el.closest('blockquote, .callout, .toc-block'));
      if (heads.length === els.length) {
        const previewTop = preview.getBoundingClientRect().top - preview.scrollTop;
        heads.forEach((h, i) => {
          const lineNo = Math.min(view.state.doc.lines, Number(h.id.replace('heading-', '')) + 1);
          points.push({ src: view.lineBlockAt(view.state.doc.line(lineNo).from).top, dst: els[i].getBoundingClientRect().top - previewTop });
        });
      }
      points.push({ src: Math.max(1, source.scrollHeight - source.clientHeight), dst: Math.max(1, preview.scrollHeight - preview.clientHeight) });
      return points.sort((a, b) => a.src - b.src);
    };

    const map = (value: number, from: 'src' | 'dst', to: 'src' | 'dst') => {
      const pts = anchors().sort((a, b) => a[from] - b[from]);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (value >= a[from] && value <= b[from]) {
          const span = b[from] - a[from];
          return span <= 0 ? a[to] : a[to] + ((value - a[from]) / span) * (b[to] - a[to]);
        }
      }
      return pts[pts.length - 1][to];
    };

    const onSource = () => {
      if (lock === 'preview') return;
      hold('source');
      preview.scrollTop = map(source.scrollTop, 'src', 'dst');
    };
    const onPreview = () => {
      if (lock === 'source') return;
      hold('preview');
      source.scrollTop = map(preview.scrollTop, 'dst', 'src');
    };
    source.addEventListener('scroll', onSource, { passive: true });
    preview.addEventListener('scroll', onPreview, { passive: true });
    return () => {
      source.removeEventListener('scroll', onSource);
      preview.removeEventListener('scroll', onPreview);
      if (unlockTimer) clearTimeout(unlockTimer);
    };
  }, [activeTabId, cmView]);

  if (!activeTab) return null;

  return (
    <div className="md-split">
      <div className="md-pane md-pane--source">
        <div className="md-pane__header">SOURCE CODE</div>
        <div className="md-pane__body md-editor-source">
          <CodeMirror
            ref={editorRef}
            value={content}
            height="100%"
            theme={isDark ? 'dark' : 'light'}
            className="cm-theme-override"
            extensions={extensions}
            onCreateEditor={(view) => setCmView(view)}
            onChange={handleUpdate}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
              // 查找由应用统一的面板接管（⌘F），关闭 CodeMirror 自带的搜索快捷键
              searchKeymap: false,
              // 补全只保留 [[ 笔记名（上面单独配置）
              autocompletion: false,
            }}
          />
        </div>
      </div>

      <div className="md-pane md-pane--preview">
        <div className="md-pane__header">PREVIEW</div>
        <div ref={previewRef} className="custom-scrollbar md-editor-preview-container md-pane__preview">
          <div
            className="tiptap-prosemirror markdown-body md-preview-body"
            dangerouslySetInnerHTML={previewMarkup}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              const link = target.closest('[data-wiki-link]');
              if (link) { useAppStore.getState().openWikiLink(link.getAttribute('data-wiki-link') || ''); return; }
              const tag = target.closest('.tag-chip[data-tag]');
              if (tag) { useAppStore.getState().openTag(tag.getAttribute('data-tag')); return; }
              // 目录项：在预览里滚到对应标题
              const tocItem = target.closest('[data-toc-index]');
              if (tocItem) {
                e.preventDefault();
                previewRef.current?.querySelector(`#toc-heading-${tocItem.getAttribute('data-toc-index')}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
              }
              // 脚注：上标 → 定义，↩ → 回到正文里第一次引用它的地方（都在预览区里滚，不动整个窗口）
              const foot = target.closest<HTMLAnchorElement>('a[data-footnote-ref], a[data-footnote-back]');
              if (foot) {
                e.preventDefault();
                previewRef.current?.querySelector(`[id="${CSS.escape((foot.getAttribute('href') || '').slice(1))}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
              }
              // 其它链接交给系统浏览器，别让预览面板自己跳走
              const anchor = target.closest('a[href]');
              if (anchor) {
                e.preventDefault();
                const href = anchor.getAttribute('href') || '';
                if (/^https?:|^mailto:/i.test(href)) window.api.shell.openExternal(href);
              }
            }}
          />
        </div>
      </div>
    </div>
  );

};
