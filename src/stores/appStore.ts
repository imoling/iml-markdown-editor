import { create } from 'zustand';
import { isNewerVersion } from '../utils/version';
import type { UpdateInfo } from '../types/window';
import { formatDate } from '../utils/date';
import { deriveNoteTitle } from '../utils/noteTitle';
import { useAskStore } from './askStore';
import { extractHeadings } from '../utils/outline';
import { resolveWikiTarget, findHeadingIndex, linkifyMention, noteBaseName } from '../../electron/shared/wikiLink';
import { toggleTaskLine } from '../../electron/shared/tasks';
import { appendCapture } from '../../electron/shared/capture';
import type { AppUrlAction } from '../../electron/shared/appUrl';
import { FileSortMode, DEFAULT_FILE_SORT, isFileSortMode } from '../utils/fileSort';
import { applyUserCss, snippetsPathOf, SNIPPETS_TEMPLATE } from '../utils/userCss';

const FILE_SORT_KEY = 'iml.fileSort';
import { renameTagInMarkdown, isValidTagName, tagMatches } from '../../electron/shared/noteMeta';

export type DialogId = 'about' | 'shortcuts' | 'quick-open' | 'command-palette' | 'ai-config' | 'ai-setup' | 'image-config' | 'semantic-config' | 'transcribe-config' | 'settings' | 'whats-new' | 'history' | 'image-cleanup' | 'wechat-copy';
import { DAILY_DIR, TEMPLATE_DIR, DEFAULT_DAILY_TEMPLATE, SAMPLE_TEMPLATES, renderNoteTemplate } from '../utils/noteTemplates';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  /** 修改 / 创建时间（毫秒）；拿不到时是 0 或没有 */
  mtime?: number;
  ctime?: number;
}

export interface Tab {
  id: string; // filePath
  title: string;
  content: string;
  isDirty: boolean;
  mode: 'word' | 'markdown';
  /** 磁盘上的文件被外部改动（或删除）而本标签页有未保存修改，需要用户决定 */
  externallyModified?: boolean;
  /** 上次从磁盘读到 / 写进磁盘的内容的指纹：用来分清「磁盘真的被别人改了」和「只是我这边打了字、磁盘没动」 */
  diskSig?: string;
}

/** 内容指纹：长度 + FNV-1a。只用来判断「和上次是不是同一份」，不需要防碰撞的强度 */
export function contentSig(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

/**
 * 关掉这个标签页之前要不要先问一句。
 * 空白的未命名文档直接关（用户并没有写下任何东西）；写了内容的未命名文档、
 * 以及改过还没存的已有文件，都要问。关闭标签页的所有入口共用这一条规则。
 */
export function needsSavePrompt(tab: Tab): boolean {
  return tab.id.startsWith('new-') ? !!tab.content.trim() : tab.isDirty;
}

export interface HeadingNode {
  level: number;
  text: string;
  id: string;
}

export interface ThemeConfig {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  gradient: string;
  shadow: string;
}

export const THEME_PRESETS: ThemeConfig[] = [
  {
    id: 'indigo',
    name: '经典靛紫',
    primary: '#6366F1',
    secondary: '#8B5CF6',
    gradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
    shadow: 'rgba(99, 102, 241, 0.2)',
  },
  {
    id: 'ocean',
    name: '深海极客',
    primary: '#0EA5E9',
    secondary: '#6366F1',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #6366F1 100%)',
    shadow: 'rgba(14, 165, 233, 0.2)',
  },
  {
    id: 'mint',
    name: '清新薄荷',
    primary: '#10B981',
    secondary: '#3B82F6',
    gradient: 'linear-gradient(135deg, #10B981 0%, #3B82F6 100%)',
    shadow: 'rgba(16, 185, 129, 0.2)',
  },
  {
    id: 'rose',
    name: '落日玫瑰',
    primary: '#F43F5E',
    secondary: '#FB923C',
    gradient: 'linear-gradient(135deg, #F43F5E 0%, #FB923C 100%)',
    shadow: 'rgba(244, 63, 94, 0.2)',
  },
  {
    id: 'obsidian',
    name: '曜石黑金',
    primary: '#334155',
    secondary: '#94A3B8',
    gradient: 'linear-gradient(135deg, #334155 0%, #94A3B8 100%)',
    shadow: 'rgba(51, 65, 85, 0.2)',
  }
];

export interface NavigationRequest {
  heading?: HeadingNode;
  /** `[[笔记#^块]]`：跳到以 `^块ID` 结尾的那一段 */
  blockId?: string;
  /** 从待办面板点过来：源码模式按行号跳，富文本按这一行的文字找 */
  line?: number;
  lineText?: string;
  timestamp: number;
}

export interface ImageGenConfig {
  provider: 'agnes-cn' | 'agnes' | 'gemini' | 'gemini-imagen' | 'gemini-flash' | 'volcengine' | 'minimax' | 'custom';
  apiKey: string;
  model: string;
  endpoint: string;
}

// 全新安装默认 Agnes 国内站：有免费额度，填个 Key 就能出图（已保存过配置的用户不受影响）
export const DEFAULT_IMAGE_GEN_CONFIG: ImageGenConfig = {
  provider: 'agnes-cn',
  apiKey: '',
  model: '',
  endpoint: '',
};

/** 状态栏提示上的按钮（「打开」「在访达中显示」……）；点过就收起提示 */
export interface NoticeAction { label: string; run: () => void }
export type SidebarTab = 'library' | 'catalog' | 'tags' | 'tasks' | 'search' | 'ask' | 'transcribe';

/** 正文排版：字体、字号、行距、页宽（富文本与预览共用） */
export interface EditorPrefs {
  font: 'system' | 'serif' | 'kai' | 'mono';
  fontSize: number;
  lineHeight: number;
  pageWidth: 'narrow' | 'medium' | 'wide' | 'full';
}

export const DEFAULT_EDITOR_PREFS: EditorPrefs = { font: 'system', fontSize: 16, lineHeight: 1.6, pageWidth: 'medium' };

export const EDITOR_FONTS: Record<EditorPrefs['font'], { label: string; stack: string }> = {
  system: { label: '系统默认', stack: 'var(--font-body)' },
  serif: { label: '宋体 / 衬线', stack: '"Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", "SimSun", Georgia, serif' },
  kai: { label: '楷体', stack: '"Kaiti SC", "STKaiti", "KaiTi", "BiauKai", serif' },
  mono: { label: '等宽', stack: 'var(--font-code)' },
};

export const PAGE_WIDTHS: Record<EditorPrefs['pageWidth'], { label: string; css: string }> = {
  narrow: { label: '窄', css: '700px' },
  medium: { label: '适中', css: '820px' },
  wide: { label: '宽', css: '1040px' },
  full: { label: '铺满', css: '100%' },
};

export function normalizeEditorPrefs(raw: any): EditorPrefs {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    font: r.font in EDITOR_FONTS ? r.font : DEFAULT_EDITOR_PREFS.font,
    fontSize: Math.min(22, Math.max(13, Number(r.fontSize) || DEFAULT_EDITOR_PREFS.fontSize)),
    lineHeight: Math.min(2.4, Math.max(1.3, Number(r.lineHeight) || DEFAULT_EDITOR_PREFS.lineHeight)),
    pageWidth: r.pageWidth in PAGE_WIDTHS ? r.pageWidth : DEFAULT_EDITOR_PREFS.pageWidth,
  };
}

/** 把排版设置写成 CSS 变量（设置弹窗里拖动时实时预览也走这里） */
export function applyEditorPrefs(prefs: EditorPrefs) {
  const root = document.documentElement;
  root.style.setProperty('--editor-font', EDITOR_FONTS[prefs.font].stack);
  root.style.setProperty('--editor-font-size', `${prefs.fontSize}px`);
  root.style.setProperty('--editor-line-height', String(prefs.lineHeight));
  root.style.setProperty('--editor-page-width', PAGE_WIDTHS[prefs.pageWidth].css);
}

export interface SearchState {
  query: string;
  replacement: string;
  caseSensitive: boolean;
  /** 当前文档中的匹配总数 */
  total: number;
  /** 当前定位到第几个匹配（从 1 开始，0 表示无） */
  current: number;
}

export interface SearchCommand {
  type: 'next' | 'prev' | 'replace' | 'replaceAll';
}

export interface AppState {
  mode: 'word' | 'markdown';
  activeTabId: string | null;
  tabs: Tab[];
  workspacePath: string | null;
  workspaceName: string | null;
  fileTree: FileNode[];
  sidebarVisible: boolean;
  toolbarVisible: boolean;
  statusBarVisible: boolean;
  recentFiles: string[];
  outline: HeadingNode[];
  findVisible: boolean;
  replaceVisible: boolean;
  search: SearchState;
  searchCommand: SearchCommand | null;
  /** 当前编辑器注册的「把未写回的内容立刻同步到 store」钩子（保存 / 导出 / 关窗前调用） */
  editorFlush: (() => void) | null;
  /** 当前编辑器提供的两个动作：往光标处插一段文字（返回是否插成功）、在文末另起一个空的列表项并把光标放进去。侧边栏功能（转写）要用 */
  /** runSlash：按 id 执行一条斜杠菜单里的命令（命令面板的「插入…」靠它）；只有富文本编辑器提供 */
  editorActions: { insertText: (text: string) => boolean; startList: () => void; runSlash?: (id: string) => boolean; fold?: (what: 'section' | 'all', open: boolean) => boolean } | null;
  /** 编辑器里当前选中的文字；没有选区时是空串。状态栏据此显示「选中 N 字」 */
  selectionText: string;
  setSelectionText: (text: string) => void;
  /** 最近一次「不是编辑器自己打的字」的改写（转写、纪要这类侧边栏功能写进笔记）。富文本编辑器看到 rev 变了就重载这篇，哪怕光标正在里面 */
  externalWrite: { id: string; rev: number } | null;
  sidebarTab: SidebarTab;
  /** 标签视图里选中的标签 */
  selectedTag: string | null;
  /** 状态栏里一闪而过的提示（图片压缩了多少、恢复了哪个版本……）；带按钮的会多停留一会儿 */
  notice: { id: number; text: string; actions?: NoticeAction[] } | null;
  /** 专注模式：收起侧边栏与工具栏，当前段落以外的内容淡出，光标所在行保持在屏幕中间 */
  focusMode: boolean;
  sidebarWidth: number;
  /** 文件树的排序方式（文件夹总在前、按名称）；记在 localStorage 里 */
  fileSort: FileSortMode;
  /** 每次 +1 让搜索面板重新聚焦输入框 */
  globalSearchFocus: number;
  /** 外面（iml://search 链接）指定要搜的词：搜索面板拿走之后清空 */
  globalSearchQuery: string | null;
  /** 笔记库内容版本：树刷新 / 外部改动时 +1，反向链接面板据此重新查询 */
  libraryVersion: number;
  expandedPaths: string[];
  navigationRequest: NavigationRequest | null;
  updateStatus: {
    show: boolean;
    loading: boolean;
    latestVersion: string | null;
    error: string | null;
    /** 最新版本的说明、Release 页面、这台电脑对应的安装包 */
    release?: Pick<UpdateInfo, 'notes' | 'releaseUrl' | 'download'> | null;
  };
  /** 当前打开的弹窗（配置 / 关于 / 快捷键都在主窗口内以浮层显示，不再新开窗口） */
  dialog: DialogId | null;
  aiStatus: {
    generating: boolean;
    onStop: (() => void) | null;
  };
  zoom: number;
  theme: ThemeConfig;
  appearanceMode: 'light' | 'dark' | 'system' | 'eye-protection';
  startupBehavior: 'restore' | 'dashboard';
  autoSave: boolean;
  defaultLibraryPath: string;
  starredFiles: string[];
  imageGenConfig: ImageGenConfig;
  /** 粘贴 / 拖入的图片压缩成 WebP 再存盘 */
  imageCompression: boolean;
  /** 粘贴网址时自动取网页标题 */
  fetchLinkTitle: boolean;
  /** 鼠标停在 [[链接]] 上弹出预览卡片 */
  linkPreview: boolean;
  /** 应用 <笔记库>/.iml/snippets.css 里的自定义样式 */
  userCss: boolean;
  /** 源码模式用 Vim 键位 */
  vimMode: boolean;
  /** 读片段文件并应用（关着、或文件不存在就撤掉）。启动、切换笔记库、片段文件被保存时调用 */
  reloadUserCss: () => Promise<void>;
  /** 在访达里显示片段文件；还没有就先按示例模板建一个（模板全是注释，不改变外观） */
  revealUserCss: () => Promise<void>;
  spellcheck: boolean;
  /** AI 总开关：关掉后所有 AI 入口隐藏，应用不会向任何模型服务发请求 */
  aiEnabled: boolean;
  editorPrefs: EditorPrefs;

  // File Management State
  selectedNodePath: string | null;
  renamingPath: string | null;
  contextMenu: { visible: boolean; x: number; y: number; node: FileNode | null };

  // Actions
  toggleMode: () => void;
  setActiveTab: (id: string | null) => void;
  openTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  /** 关标签页的统一入口：脏文档先弹确认，干净的直接关 */
  requestCloseTab: (id: string) => void;
  closeTabs: (ids: string[]) => void;
  closeOtherTabs: (id: string) => void;
  closeTabsToRight: (id: string) => void;
  /** 关掉所有没有未保存修改的标签页 */
  closeSavedTabs: () => void;
  closeAllTabs: () => void;
  /** 批量关闭时还在排队等用户决定的标签页 */
  pendingCloseIds: string[];
  /**
   * 关标签页之前的额外把关：返回一句提醒 = 关之前要先问用户（比如这篇正连着一场进行中的转写，关掉转写就结束了）。
   * 由相应的功能自己登记，appStore 不需要认识它们
   */
  closeGuard: ((tab: Tab) => { title: string; message: string; confirmLabel: string } | null) | null;
  registerCloseGuard: (guard: AppState['closeGuard']) => void;
  /** 这个标签页的把关提醒用户已经点过「继续」了（接下来可能还要问要不要保存） */
  closeGuardPassed: string | null;
  passCloseGuard: (id: string) => void;
  advanceCloseQueue: () => void;
  cancelCloseQueue: () => void;
  /** 最近关掉的文件路径（栈顶是最后关的），供 ⌘⇧T 用 */
  closedTabs: string[];
  /** ⌘⇧T：重新打开最近关掉的那个标签页 */
  reopenClosedTab: () => Promise<void>;
  updateTabContent: (id: string, content: string) => void;
  /** 由编辑器之外的功能改写一篇笔记：先把编辑器里还没写回的字刷进来，再基于最新内容改。笔记已经关掉时返回 false */
  editTabContent: (id: string, edit: (current: string) => string) => boolean;
  /** 加载笔记库（树根 = defaultLibraryPath），并开始监听目录变化 */
  loadLibrary: (path: string) => Promise<void>;
  /** 在指定目录新建笔记并进入重命名 */
  createNoteIn: (dirPath: string) => Promise<string | null>;
  createFolderIn: (dirPath: string) => Promise<string | null>;
  /** 新建 / 静默保存时的目标目录：侧边栏选中的文件夹（或选中文件所在目录），否则笔记库根 */
  getNewNoteDir: () => string;
  /** 主进程通知：笔记库里这些路径被外部改动 */
  handleExternalChanges: (paths: string[]) => Promise<void>;
  /** 打开（不存在则按「模板/日记.md」或内置模板新建）某一天的日记，默认今天：<笔记库>/日记/YYYY-MM-DD.md */
  openDailyNote: (date?: Date) => Promise<void>;
  /** 执行一个 iml:// 链接要做的事（主进程已经解析、校验过） */
  runAppUrl: (action: AppUrlAction) => Promise<void>;
  /** 确保某一天的日记存在（不存在就按模板建），但不打开它；返回路径，没有笔记库时返回 null */
  ensureDailyNote: (date?: Date) => Promise<string | null>;
  /** 快速捕获：把一句话带上时间追加到今天的日记末尾，不打开也不切过去 */
  captureToDaily: (text: string) => Promise<boolean>;
  /** 列出 <笔记库>/模板 下的模板 */
  listTemplates: () => Promise<{ name: string; path: string }[]>;
  /** 用模板在目录里新建笔记（默认目录 = getNewNoteDir） */
  createNoteFromTemplate: (templatePath: string, dirPath?: string) => Promise<string | null>;
  /** 写入示例模板（已存在的不覆盖） */
  createSampleTemplates: () => Promise<void>;
  /**
   * 打开 [[目标]] 指向的笔记：按文件名、一级标题或别名匹配，优先同目录；找不到就在当前笔记所在目录新建。
   * `[[笔记#小节]]` 打开后跳到小节，`[[#小节]]` 在本篇内跳，`[[笔记#^块]]` 跳到那一段。
   */
  openWikiLink: (target: string) => Promise<void>;
  /**
   * 把 notePath 那篇里的一处「未链接提及」改成指向 targetPath 的 [[链接]]。
   * 那篇有没存盘的改动时只改编辑器里的内容；否则直接写盘（覆盖前版本历史会留底）。
   * 返回原文因此变长了多少个字符（同一篇里排在后面的提及要跟着挪位置）；原文对不上就什么都不动，返回 null。
   */
  linkMention: (notePath: string, mention: { offset: number; length: number; match: string }, targetPath: string) => Promise<number | null>;
  /**
   * 改写一篇（不一定是当前这篇）笔记，给侧边栏里「就地改别的笔记」的功能用：未链接提及转链接、勾待办、标签改名。
   * 那篇开着且有没存盘的改动 → 只改编辑器里的；否则读盘、改、写盘（版本历史留底），开着的标签页同步更新且不变脏。
   * transform 返回 null 表示「原文对不上，别动」，此时什么都不写、返回 null。
   */
  rewriteNote: (notePath: string, transform: (content: string) => string | null) => Promise<{ before: string; after: string } | null>;
  /**
   * 全库把标签 from 改成 to（子标签 from/x 跟着变成 to/x）；to 已经存在就是合并。
   * 逐篇改写，每篇覆盖前版本历史都会留底。返回改了几篇、几篇没改成。
   */
  renameTag: (from: string, to: string) => Promise<{ changed: number; failed: number }>;
  /** 打开待办所在的笔记并跳到那一行 */
  openTask: (notePath: string, task: { line: number; text: string }) => Promise<void>;
  /** 在待办面板里勾上 / 取消一条待办；那一行对不上了就不动，返回 false */
  toggleTask: (notePath: string, task: { line: number; raw: string; done: boolean }, done: boolean) => Promise<boolean>;
  updateFileNode: (path: string, updates: Partial<FileNode>) => void;
  updateTabId: (oldId: string, newId: string, newTitle: string) => void;
  setExpanded: (path: string, expanded: boolean) => void;
  revealInSidebar: (path: string) => Promise<void>;
  scrollToHeading: (heading: HeadingNode) => void;
  
  // UI Actions
  toggleSidebar: () => void;
  toggleToolbar: () => void;
  toggleStatusBar: () => void;
  setOutline: (headings: HeadingNode[]) => void;
  addToRecent: (path: string) => void;
  createNewFile: () => void;
  toggleFind: () => void;
  toggleReplace: () => void;
  closeSearch: () => void;
  setSearch: (patch: Partial<SearchState>) => void;
  setSearchCounts: (total: number, current: number) => void;
  sendSearchCommand: (type: SearchCommand['type']) => void;
  /** 编辑器处理完命令后清掉，避免切换编辑模式时新挂载的编辑器重放（例如再来一次「全部替换」） */
  consumeSearchCommand: () => void;
  registerEditorFlush: (fn: (() => void) | null) => void;
  registerEditorActions: (actions: AppState['editorActions']) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  /** 打开侧边栏的标签视图并选中某个标签（点击正文里的 #标签 时调用） */
  openTag: (tag: string | null) => void;
  /** 状态栏里的一行提示；报错类的可以给长一点的停留时间。带按钮（「打开」「在访达中显示」这类）的默认停 15 秒，给人时间点 */
  notify: (text: string, ms?: number, actions?: NoticeAction[]) => void;
  toggleFocusMode: () => void;
  /** ⌘⇧F：打开侧边栏搜索面板并聚焦 */
  openGlobalSearch: () => void;
  /** ⌘J：打开侧边栏的「问答」页并聚焦输入框 */
  openAsk: () => void;
  /** 打开侧边栏的「转写」页 */
  openTranscribe: () => void;
  /** 用给定关键词打开文档内查找（全文搜索结果点开后定位用） */
  showFindWith: (query: string) => void;
  setSidebarWidth: (width: number) => void;
  setFileSort: (mode: FileSortMode) => void;
  refreshWorkspace: () => Promise<void>;
  openFileByPath: (filePath: string) => Promise<void>;
  openFile: () => Promise<void>;
  openDirectory: () => Promise<void>;
  tabToClose: string | null;
  setTabToClose: (id: string | null) => void;
  saveActiveFile: (saveAs?: boolean, isAutoSave?: boolean) => Promise<boolean>;
  checkUpdates: () => Promise<void>;
  autoCheckUpdates: () => Promise<void>;
  setUpdateStatus: (status: Partial<AppState['updateStatus']>) => void;
  setAIStatus: (status: Partial<AppState['aiStatus']>) => void;
  openDialog: (id: DialogId) => void;
  closeDialog: () => void;
  setZoom: (zoom: number) => void;
  setTheme: (themeId: string) => void;
  setAppearanceMode: (mode: 'light' | 'dark' | 'system' | 'eye-protection') => void;
  setStartupBehavior: (behavior: 'restore' | 'dashboard') => void;
  setAutoSave: (autoSave: boolean) => void;
  setDefaultLibraryPath: (path: string) => void;
  loadSession: () => Promise<boolean>;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  applyAppearance: (mode: 'light' | 'dark' | 'system' | 'eye-protection') => void;
  toggleStar: (path: string) => void;
  setImageGenConfig: (config: Partial<ImageGenConfig>) => void;

  // File Management Actions
  setSelectedNodePath: (path: string | null) => void;
  setRenamingPath: (path: string | null) => void;
  setContextMenu: (contextMenu: Partial<AppState['contextMenu']>) => void;
  renameFile: (oldPath: string, newName: string) => Promise<boolean>;
  deleteFile: (path: string) => Promise<boolean>;
  duplicateFile: (path: string) => Promise<boolean>;
}

/** 路径分隔符：出现反斜杠即按 Windows 处理（dialog / path.join 在 Windows 上一律给反斜杠） */
function pathSep(p: string): '/' | '\\' {
  return p.includes('\\') ? '\\' : '/';
}

const NOTE_FILE_RE = /\.(md|markdown|mdown|mkd|txt)$/i;

/** 读取笔记库目录：隐藏文件与非笔记文件（图片、附件等）不进树，文件夹全部保留 */
export async function readLibraryDir(dirPath: string): Promise<FileNode[] | null> {
  const result = await window.api.fs.readDir(dirPath);
  if (!result.success || !result.files) return null;
  return (result.files as FileNode[]).filter(
    (f) => !f.name.startsWith('.') && (f.isDirectory || NOTE_FILE_RE.test(f.name)),
  );
}

function findNode(nodes: FileNode[], targetPath: string): FileNode | undefined {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (node.children) {
      const found = findNode(node.children, targetPath);
      if (found) return found;
    }
  }
  return undefined;
}

export const useAppStore = create<AppState>((set, get) => ({
  mode: 'word',
  activeTabId: null,
  tabs: [],
  workspacePath: null,
  workspaceName: null,
  fileTree: [],
  sidebarVisible: true,
  toolbarVisible: true,
  statusBarVisible: true,
  recentFiles: [],
  outline: [],
  findVisible: false,
  replaceVisible: false,
  search: { query: '', replacement: '', caseSensitive: false, total: 0, current: 0 },
  searchCommand: null,
  editorFlush: null,
  editorActions: null,
  selectionText: '',
  setSelectionText: (text) => { if (get().selectionText !== text) set({ selectionText: text }); },
  externalWrite: null,
  sidebarTab: 'library',
  selectedTag: null,
  notice: null,
  focusMode: false,
  globalSearchFocus: 0,
  globalSearchQuery: null,
  libraryVersion: 0,
  sidebarWidth: 240,
  fileSort: (() => { try { const v = localStorage.getItem(FILE_SORT_KEY); return isFileSortMode(v) ? v : DEFAULT_FILE_SORT; } catch { return DEFAULT_FILE_SORT; } })(),
  expandedPaths: [],
  navigationRequest: null,
  tabToClose: null,
  pendingCloseIds: [],
  closeGuard: null,
  closeGuardPassed: null,
  closedTabs: [],
  
  // File Management Default State
  selectedNodePath: null,
  renamingPath: null,
  contextMenu: { visible: false, x: 0, y: 0, node: null },
  
  updateStatus: { show: false, loading: false, latestVersion: null, error: null },
  dialog: null,
  aiStatus: { generating: false, onStop: null },
  zoom: 100,
  theme: THEME_PRESETS[0],
  appearanceMode: 'light',
  startupBehavior: 'restore',
  autoSave: true,
  defaultLibraryPath: '',
  starredFiles: [],
  imageGenConfig: DEFAULT_IMAGE_GEN_CONFIG,
  imageCompression: true,
  fetchLinkTitle: true,
  linkPreview: true,
  userCss: true,
  vimMode: false,
  reloadUserCss: async () => {
    const root = get().workspacePath || get().defaultLibraryPath;
    if (!get().userCss || !root) { applyUserCss(''); return; }
    let css = '';
    try { const res = await window.api.fs.readFile(snippetsPathOf(root)); if (res.success) css = res.content || ''; } catch { css = ''; }
    applyUserCss(css);
  },
  revealUserCss: async () => {
    const root = get().workspacePath || get().defaultLibraryPath;
    if (!root) return;
    const file = snippetsPathOf(root);
    if (!(await window.api.fs.exists(file))) {
      const dir = file.slice(0, Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')));
      if (!(await window.api.fs.exists(dir))) await window.api.fs.mkdir(dir);
      await window.api.fs.writeFile(file, SNIPPETS_TEMPLATE);
    }
    window.api.shell.showItemInFolder(file);
  },
  spellcheck: false,
  aiEnabled: true,
  editorPrefs: DEFAULT_EDITOR_PREFS,

  toggleStar: (path: string) => set((state) => ({
    starredFiles: state.starredFiles.includes(path)
      ? state.starredFiles.filter(p => p !== path)
      : [...state.starredFiles, path]
  })),

  setImageGenConfig: (config: Partial<ImageGenConfig>) => {
    set((state) => ({ imageGenConfig: { ...state.imageGenConfig, ...config } }));
    get().saveSettings();
  },

  setTabToClose: (id: string | null) => set({ tabToClose: id }),
  
  toggleMode: () => set((state) => ({ 
    mode: state.mode === 'word' ? 'markdown' : 'word' 
  })),
  
  setActiveTab: async (id: string | null) => {
    set({ activeTabId: id });
    if (!id || id.startsWith('new-')) return;
    get().addToRecent(id);
    // 树根固定为笔记库；库内文件展开定位，库外文件只在标签页里打开，不动树
    await get().revealInSidebar(id);
  },
  
  openTab: (tab: Tab) => {
    const state = get();
    const exists = state.tabs.find((t) => t.id === tab.id);
    if (!exists) {
      set({ tabs: [...state.tabs, tab] });
    }
    get().setActiveTab(tab.id);
  },
  
  requestCloseTab: (id: string) => get().closeTabs([id]),

  /**
   * 批量关闭：干净的立刻关掉，需要问的排成队列逐个弹确认框。
   * 「关闭其他 / 右侧 / 全部」都走这里，省得每处各写一遍脏文档的判断。
   */
  closeTabs: (ids: string[]) => {
    const state = get();
    const asking: string[] = [];
    for (const id of ids) {
      const tab = state.tabs.find((t) => t.id === id);
      if (!tab) continue;
      if (needsSavePrompt(tab) || state.closeGuard?.(tab)) asking.push(id);
      else get().closeTab(id);
    }
    if (asking.length > 0) set({ tabToClose: asking[0], pendingCloseIds: asking.slice(1) });
  },

  /** 确认框处理完一个后叫一次，轮到队列里的下一个 */
  advanceCloseQueue: () => set((state) => ({
    tabToClose: state.pendingCloseIds[0] ?? null,
    pendingCloseIds: state.pendingCloseIds.slice(1),
    closeGuardPassed: null,
  })),

  /** 在确认框上点「取消」= 放弃整批，而不是只跳过这一个 */
  cancelCloseQueue: () => set({ tabToClose: null, pendingCloseIds: [], closeGuardPassed: null }),

  registerCloseGuard: (guard) => set({ closeGuard: guard }),
  /** 把关提醒点了「继续」：没有未保存的修改就直接关，有的话留在队列里接着问要不要保存 */
  passCloseGuard: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (tab && needsSavePrompt(tab)) { set({ closeGuardPassed: id }); return; }
    get().closeTab(id);
    get().advanceCloseQueue();
  },

  closeOtherTabs: (id: string) => get().closeTabs(get().tabs.filter((t) => t.id !== id).map((t) => t.id)),

  closeTabsToRight: (id: string) => {
    const tabs = get().tabs;
    const at = tabs.findIndex((t) => t.id === id);
    if (at < 0) return;
    get().closeTabs(tabs.slice(at + 1).map((t) => t.id));
  },

  /** 只关没有未保存修改的，永远不会弹确认框 */
  closeSavedTabs: () => get().closeTabs(get().tabs.filter((t) => !needsSavePrompt(t)).map((t) => t.id)),

  closeAllTabs: () => get().closeTabs(get().tabs.map((t) => t.id)),

  reopenClosedTab: async () => {
    const stack = [...get().closedTabs];
    while (stack.length > 0) {
      const path = stack.pop()!;
      set({ closedTabs: stack });
      if (get().tabs.some((t) => t.id === path)) continue;   // 已经又打开了就跳过
      await get().openFileByPath(path);
      return;
    }
  },

  closeTab: (id: string) => set((state) => {
    // 记下刚关掉的真实文件，⌘⇧T 能原路开回来；未命名文档没有路径，开不回来
    const closedTabs = id.startsWith('new-')
      ? state.closedTabs
      : [...state.closedTabs.filter((p) => p !== id), id].slice(-10);
    const newTabs = state.tabs.filter((t) => t.id !== id);
    const newActiveId = state.activeTabId === id 
      ? (newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null)
      : state.activeTabId;
    
    // 关掉最后一个标签页时保留工作区，文件树不应随文档关闭而消失
    if (newTabs.length === 0) {
      return { tabs: [], activeTabId: null, outline: [], closedTabs };
    }

    return {
      tabs: newTabs,
      activeTabId: newActiveId,
      closedTabs
    };
  }),

  updateTabContent: (id: string, content: string) => {
    const target = get().tabs.find(t => t.id === id);
    // 内容没变就不动，避免把未编辑的文件标脏
    if (!target || target.content === content) return;
    set((state) => ({
      tabs: state.tabs.map(t => t.id === id ? { ...t, content, isDirty: true } : t)
    }));
  },

  editTabContent: (id, edit) => {
    get().editorFlush?.();
    const target = get().tabs.find(t => t.id === id);
    if (!target) return false;
    const content = edit(target.content);
    if (content === target.content) return true;
    set((state) => ({
      tabs: state.tabs.map(t => t.id === id ? { ...t, content, isDirty: true } : t),
      externalWrite: { id, rev: (state.externalWrite?.rev ?? 0) + 1 },
    }));
    return true;
  },

  updateTabId: (oldId: string, newId: string, newTitle: string) => set((state) => {
    const newTabs = state.tabs.map(t => t.id === oldId ? { ...t, id: newId, title: newTitle, isDirty: false } : t);
    const newState = {
      tabs: newTabs,
      activeTabId: state.activeTabId === oldId ? newId : state.activeTabId
    };
    return newState;
  }),

  loadLibrary: async (libraryPath: string) => {
    if (!libraryPath) return;
    const files = await readLibraryDir(libraryPath);
    if (!files) {
      console.warn('Library path not readable:', libraryPath);
      return;
    }
    set({
      workspacePath: libraryPath,
      workspaceName: libraryPath.split(/[/\\]/).filter(Boolean).pop() || '笔记库',
      fileTree: files,
      expandedPaths: [...new Set([libraryPath, ...get().expandedPaths])],
    });
    // 已展开的子目录补加载子节点
    await get().refreshWorkspace();
    window.api.library.watch(libraryPath).catch(() => {});
    void get().reloadUserCss();
  },

  getNewNoteDir: () => {
    const { selectedNodePath, fileTree, workspacePath, defaultLibraryPath } = get();
    if (selectedNodePath && workspacePath) {
      const node = findNode(fileTree, selectedNodePath);
      if (node?.isDirectory) return node.path;
      if (node) return selectedNodePath.substring(0, selectedNodePath.lastIndexOf(pathSep(selectedNodePath)));
    }
    return workspacePath || defaultLibraryPath;
  },

  createNoteIn: async (dirPath: string) => {
    const sep = pathSep(dirPath);
    const base = '未命名笔记';
    let filePath = `${dirPath}${sep}${base}.md`;
    for (let i = 2; await window.api.fs.exists(filePath); i++) filePath = `${dirPath}${sep}${base} ${i}.md`;
    const res = await window.api.fs.writeFile(filePath, '');
    if (!res.success) return null;
    await get().refreshWorkspace();
    get().openTab({ id: filePath, title: filePath.split(sep).pop() || base, content: '', isDirty: false, mode: 'word' });
    set({ selectedNodePath: filePath, renamingPath: filePath });
    return filePath;
  },

  createFolderIn: async (dirPath: string) => {
    const sep = pathSep(dirPath);
    const base = '新建文件夹';
    let folderPath = `${dirPath}${sep}${base}`;
    for (let i = 2; await window.api.fs.exists(folderPath); i++) folderPath = `${dirPath}${sep}${base} ${i}`;
    const res = await window.api.fs.mkdir(folderPath);
    if (!res.success) return null;
    set({ expandedPaths: [...new Set([...get().expandedPaths, dirPath])] });
    await get().refreshWorkspace();
    set({ selectedNodePath: folderPath, renamingPath: folderPath });
    return folderPath;
  },

  ensureDailyNote: async (date?: Date) => {
    // 菜单、快捷键会把事件对象当参数传进来：不是日期的一律当今天
    const day = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    const root = get().workspacePath || get().defaultLibraryPath;
    if (!root) return null;
    const sep = pathSep(root);
    const dir = `${root}${sep}${DAILY_DIR}`;
    if (!(await window.api.fs.exists(dir))) await window.api.fs.mkdir(dir);
    const today = formatDate(day);
    const filePath = `${dir}${sep}${today}.md`;
    if (!(await window.api.fs.exists(filePath))) {
      const tplPath = `${root}${sep}${TEMPLATE_DIR}${sep}日记.md`;
      let template = DEFAULT_DAILY_TEMPLATE;
      if (await window.api.fs.exists(tplPath)) {
        const tpl = await window.api.fs.readFile(tplPath);
        if (tpl.success && tpl.content) template = tpl.content;
      }
      // 补写过去某天的日记时，模板里的 {{date}} {{weekday}} 是那一天，不是今天
      const res = await window.api.fs.writeFile(filePath, renderNoteTemplate(template, { title: today, date: day }));
      if (!res.success) return null;
      set({ expandedPaths: [...new Set([...get().expandedPaths, dir])] });
      await get().refreshWorkspace();
    }
    return filePath;
  },

  openDailyNote: async (date?: Date) => {
    const filePath = await get().ensureDailyNote(date);
    if (filePath) await get().openFileByPath(filePath);
  },

  runAppUrl: async (action) => {
    switch (action.action) {
      case 'open-path': await get().openFileByPath(action.path); break;
      case 'open-name': await get().openWikiLink(action.name); break;
      case 'daily': await get().openDailyNote(); break;
      case 'capture': await get().captureToDaily(action.text); break;
      case 'search': get().openGlobalSearch(); set({ globalSearchQuery: action.query }); break;
      case 'new': {
        const dir = get().workspacePath || get().defaultLibraryPath;
        if (!dir) return;
        const sep = pathSep(dir);
        // 标题做文件名；没给标题就用正文的第一行。永远不覆盖已有的文件
        const base = (action.title || deriveNoteTitle(action.content) || '未命名').replace(/[\\/:*?"<>|#^[\]]/g, '').trim().slice(0, 80) || '未命名';
        let name = base;
        for (let i = 2; await window.api.fs.exists(`${dir}${sep}${name}.md`); i++) name = `${base} ${i}`;
        const body = action.content || `# ${base}\n\n`;
        const res = await window.api.fs.writeFile(`${dir}${sep}${name}.md`, body.endsWith('\n') ? body : `${body}\n`);
        if (!res.success) return;
        await get().refreshWorkspace();
        await get().openFileByPath(`${dir}${sep}${name}.md`);
        break;
      }
    }
  },

  captureToDaily: async (text: string) => {
    if (!text.trim()) return false; // 先判空：别为了一句空话白建一篇日记
    const now = new Date();
    const filePath = await get().ensureDailyNote(now);
    if (!filePath) return false;
    // 不打开、不切过去：用户此刻在别的软件里。日记正开着的话 rewriteNote 会照顾好没存盘的改动
    return !!(await get().rewriteNote(filePath, (content) => appendCapture(content, text, now)));
  },

  listTemplates: async () => {
    const root = get().workspacePath || get().defaultLibraryPath;
    if (!root) return [];
    const dir = `${root}${pathSep(root)}${TEMPLATE_DIR}`;
    if (!(await window.api.fs.exists(dir))) return [];
    const files = await readLibraryDir(dir);
    return (files || [])
      .filter((f) => !f.isDirectory)
      .map((f) => ({ name: f.name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, ''), path: f.path }));
  },

  createNoteFromTemplate: async (templatePath: string, dirPath?: string) => {
    const dir = dirPath || get().getNewNoteDir();
    if (!dir) return null;
    const tpl = await window.api.fs.readFile(templatePath);
    if (!tpl.success) return null;
    const sep = pathSep(dir);
    const tplName = (templatePath.split(/[/\\]/).pop() || '笔记').replace(/\.(md|markdown|mdown|mkd|txt)$/i, '');
    const base = `${tplName} ${formatDate(new Date())}`;
    let title = base;
    let filePath = `${dir}${sep}${title}.md`;
    for (let i = 2; await window.api.fs.exists(filePath); i++) {
      title = `${base} ${i}`;
      filePath = `${dir}${sep}${title}.md`;
    }
    const res = await window.api.fs.writeFile(filePath, renderNoteTemplate(tpl.content || '', { title }));
    if (!res.success) return null;
    await get().refreshWorkspace();
    get().openTab({ id: filePath, title: `${title}.md`, content: renderNoteTemplate(tpl.content || '', { title }), isDirty: false, mode: 'word' });
    set({ selectedNodePath: filePath, renamingPath: filePath });
    return filePath;
  },

  createSampleTemplates: async () => {
    const root = get().workspacePath || get().defaultLibraryPath;
    if (!root) return;
    const sep = pathSep(root);
    const dir = `${root}${sep}${TEMPLATE_DIR}`;
    if (!(await window.api.fs.exists(dir))) await window.api.fs.mkdir(dir);
    for (const tpl of SAMPLE_TEMPLATES) {
      const filePath = `${dir}${sep}${tpl.name}.md`;
      if (!(await window.api.fs.exists(filePath))) await window.api.fs.writeFile(filePath, tpl.content);
    }
    set({ expandedPaths: [...new Set([...get().expandedPaths, dir])] });
    await get().refreshWorkspace();
  },

  openWikiLink: async (target: string) => {
    const raw = target.trim();
    if (!raw) return;
    const { activeTabId, workspacePath, defaultLibraryPath } = get();
    const currentDir = activeTabId && !activeTabId.startsWith('new-')
      ? activeTabId.substring(0, activeTabId.lastIndexOf(pathSep(activeTabId)))
      : (workspacePath || defaultLibraryPath);
    let notes: { path: string; title: string; aliases?: string[] }[] = [];
    try { notes = await window.api.search.listNotes(); } catch { notes = []; }
    const link = resolveWikiTarget(notes, raw, currentDir);

    // 打开之后跳到 #小节 / #^块；小节对不上就停在笔记开头，不报错
    const jump = (tabId: string | null) => {
      if (link.block) { set({ navigationRequest: { blockId: link.block, timestamp: Date.now() } }); return; }
      if (link.headings.length === 0) return;
      const tab = get().tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const headings = extractHeadings(tab.content);
      const at = findHeadingIndex(headings, link.headings);
      if (at !== -1) get().scrollToHeading(headings[at]);
    };

    if (!link.note) { jump(activeTabId); return; } // [[#小节]]：本篇内跳转
    if (link.hit) {
      await get().openFileByPath(link.hit.path);
      jump(link.hit.path);
      return;
    }
    // 新建：名字只取笔记名那一段（不带 #小节；路径写法取最后一级）
    const name = (link.note.split(/[/\\]/).pop() || '').replace(/[\\/:*?"<>|#^[\]]/g, '').trim();
    const dir = currentDir || workspacePath || defaultLibraryPath;
    if (!dir || !name) return;
    const filePath = `${dir}${pathSep(dir)}${name}.md`;
    if (!(await window.api.fs.exists(filePath))) {
      const res = await window.api.fs.writeFile(filePath, `# ${name}\n\n`);
      if (!res.success) return;
      await get().refreshWorkspace();
    }
    await get().openFileByPath(filePath);
  },

  rewriteNote: async (notePath, transform) => {
    const tab = get().tabs.find((t) => t.id === notePath);
    if (tab?.isDirty) {
      // 有没存盘的改动：只改编辑器里的内容，跟着用户下次保存一起落盘
      let result: { before: string; after: string } | null = null;
      get().editTabContent(notePath, (current) => {
        const next = transform(current);
        if (next !== null) result = { before: current, after: next };
        return next ?? current;
      });
      return result;
    }
    const read = await window.api.fs.readFile(notePath);
    if (!read.success) return null;
    const before = read.content || '';
    const after = transform(before);
    if (after === null) return null;
    if (after === before) return { before, after };
    const written = await window.api.fs.writeFile(notePath, after); // 覆盖前版本历史会留底
    if (!written.success) return null;
    if (tab) {
      set((state) => ({
        tabs: state.tabs.map((t) => (t.id === notePath ? { ...t, content: after, isDirty: false, diskSig: contentSig(after) } : t)),
        externalWrite: { id: notePath, rev: (state.externalWrite?.rev ?? 0) + 1 },
      }));
    }
    return { before, after };
  },

  linkMention: async (notePath, mention, targetPath) => {
    const done = await get().rewriteNote(notePath, (content) => linkifyMention(content, mention.offset, mention.length, mention.match, noteBaseName(targetPath)));
    return done ? done.after.length - done.before.length : null;
  },

  renameTag: async (from, to) => {
    const a = from.trim().replace(/^#/, '');
    const b = to.trim().replace(/^#/, '');
    if (!a || !isValidTagName(b) || a === b) return { changed: 0, failed: 0 };
    let notes: { path: string }[] = [];
    try { notes = await window.api.search.notesByTag(a); } catch { notes = []; }
    let changed = 0;
    let failed = 0;
    for (const note of notes) {
      const done = await get().rewriteNote(note.path, (content) => renameTagInMarkdown(content, a, b));
      if (!done) failed++;
      else if (done.after !== done.before) changed++;
    }
    // 正看着的就是被改名的标签（或它的子标签）：跟过去，别停在一个已经不存在的标签上
    const selected = get().selectedTag;
    if (selected && tagMatches(selected, a)) set({ selectedTag: b + selected.slice(a.length) });
    return { changed, failed };
  },

  openTask: async (notePath, task) => {
    await get().openFileByPath(notePath);
    if (get().activeTabId === notePath) set({ navigationRequest: { line: task.line, lineText: task.text, timestamp: Date.now() } });
  },

  toggleTask: async (notePath, task, done) => !!(await get().rewriteNote(notePath, (content) => toggleTaskLine(content, task, done))),

  handleExternalChanges: async (paths: string[]) => {
    await get().refreshWorkspace();
    const changed = new Set(paths);
    for (const tab of get().tabs) {
      if (tab.id.startsWith('new-') || !changed.has(tab.id)) continue;
      const result = await window.api.fs.readFile(tab.id);
      const mark = (patch: Partial<Tab>) =>
        set((state) => ({ tabs: state.tabs.map((t) => (t.id === tab.id ? { ...t, ...patch } : t)) }));
      if (!result.success) {
        mark({ externallyModified: true }); // 被外部删除 / 移动
        continue;
      }
      const diskContent = result.content || '';
      if (diskContent === tab.content) continue;
      // 磁盘上还是我们上次读到 / 写进去的那一份：不是别人改了文件，只是这边打了字还没存。
      // 典型场景是应用自己新建文件（会议记录、双链新建的笔记）→ 打开 → 用户马上开始打字，文件监听的通知这时才到
      if (tab.diskSig && tab.diskSig === contentSig(diskContent)) continue;
      if (tab.isDirty) {
        mark({ externallyModified: true, diskSig: contentSig(diskContent) }); // 两边都改了，交给用户决定（保存即覆盖）
      } else {
        mark({ content: diskContent, isDirty: false, externallyModified: false, diskSig: contentSig(diskContent) }); // 未改动的标签页静默跟随磁盘
      }
    }
  },

  updateFileNode: (path: string, updates: Partial<FileNode>) => set((state) => {
    const updateRecursive = (nodes: FileNode[]): FileNode[] => {
      return nodes.map(node => {
        if (node.path === path) return { ...node, ...updates };
        if (node.children) return { ...node, children: updateRecursive(node.children) };
        return node;
      });
    };
    return { fileTree: updateRecursive(state.fileTree) };
  }),

  setExpanded: (path: string, expanded: boolean) => set((state) => ({
    expandedPaths: expanded 
      ? [...new Set([...state.expandedPaths, path])]
      : state.expandedPaths.filter(p => p !== path)
  })),

  revealInSidebar: async (path: string) => {
    const { workspacePath } = get();
    if (!workspacePath) return;
    const sep = pathSep(path);
    if (!path.startsWith(workspacePath + sep)) return;

    // 工作区根到文件所在目录之间的每一级：展开，并在子节点尚未加载时读取目录
    const segments = path.slice(workspacePath.length + 1).split(sep);
    segments.pop(); // 去掉文件名
    const expanded = new Set(get().expandedPaths);
    expanded.add(workspacePath);
    let current = workspacePath;
    for (const segment of segments) {
      current = current + sep + segment;
      expanded.add(current);
      const node = findNode(get().fileTree, current);
      if (node?.isDirectory && (!node.children || node.children.length === 0)) {
        try {
          const files = await readLibraryDir(current);
          if (files) get().updateFileNode(current, { children: files });
        } catch (error) {
          console.error('Failed to load directory for reveal:', error);
        }
      }
    }
    set({ expandedPaths: [...expanded] });
  },

  scrollToHeading: (heading: HeadingNode) => set({ 
    navigationRequest: { heading, timestamp: Date.now() } 
  }),

  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  toggleToolbar: () => set((state) => ({ toolbarVisible: !state.toolbarVisible })),
  toggleStatusBar: () => set((state) => ({ statusBarVisible: !state.statusBarVisible })),
  
  setOutline: (outline: HeadingNode[]) => set({ outline }),
  
  addToRecent: (path: string) => set((state) => ({
    recentFiles: [path, ...state.recentFiles.filter(p => p !== path)].slice(0, 10)
  })),

  createNewFile: () => {
    const id = `new-${Date.now()}.md`;
    get().openTab({
      id,
      title: '未命名',
      content: '',
      isDirty: false,
      mode: 'word'
    });
  },

  // ⌘F：未开 → 开查找；开着替换 → 收起替换行；只开着查找 → 关闭（并清除高亮）
  toggleFind: () => {
    const { findVisible, replaceVisible } = get();
    if (!findVisible) set({ findVisible: true, replaceVisible: false });
    else if (replaceVisible) set({ replaceVisible: false });
    else get().closeSearch();
  },
  // ⌥⌘F：未开 → 开查找+替换；已开 → 关闭
  toggleReplace: () => {
    if (!get().replaceVisible) set({ findVisible: true, replaceVisible: true });
    else get().closeSearch();
  },
  closeSearch: () => set((state) => ({
    findVisible: false,
    replaceVisible: false,
    searchCommand: null,
    search: { ...state.search, query: '', total: 0, current: 0 },
  })),
  setSearch: (patch) => set((state) => ({ search: { ...state.search, ...patch } })),
  setSearchCounts: (total, current) => {
    const s = get().search;
    if (s.total === total && s.current === current) return;
    set({ search: { ...s, total, current } });
  },
  sendSearchCommand: (type) => set({ searchCommand: { type } }),
  consumeSearchCommand: () => { if (get().searchCommand) set({ searchCommand: null }); },
  registerEditorFlush: (fn) => set({ editorFlush: fn }),
  registerEditorActions: (actions) => set({ editorActions: actions }),
  openGlobalSearch: () => set((state) => ({ sidebarTab: 'search', sidebarVisible: true, globalSearchFocus: state.globalSearchFocus + 1 })),
  openTranscribe: () => set({ sidebarTab: 'transcribe', sidebarVisible: true, focusMode: false }),
  openAsk: () => { set({ sidebarTab: 'ask', sidebarVisible: true, focusMode: false }); useAskStore.getState().requestFocus(); },
  showFindWith: (query) => set((state) => ({ findVisible: true, replaceVisible: false, search: { ...state.search, query } })),
  openTag: (tag) => set({ selectedTag: tag, sidebarTab: 'tags', sidebarVisible: true, focusMode: false }),
  notify: (text, ms, actions) => {
    const id = Date.now();
    set({ notice: actions?.length ? { id, text, actions } : { id, text } });
    setTimeout(() => { if (get().notice?.id === id) set({ notice: null }); }, ms ?? (actions?.length ? 15000 : 5000));
  },
  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
  setSidebarTab: (tab: SidebarTab) => {
    const { sidebarTab, sidebarVisible } = get();
    if (sidebarVisible && sidebarTab === tab) {
      set({ sidebarVisible: false });
    } else {
      set({ sidebarTab: tab, sidebarVisible: true });
    }
  },
  setSidebarWidth: (width) => set({ sidebarWidth: Math.min(600, Math.max(240, width)) }),
  setFileSort: (mode) => { try { localStorage.setItem(FILE_SORT_KEY, mode); } catch { /* 记不住也不影响这次排序 */ } set({ fileSort: mode }); },
  refreshWorkspace: async () => {
    const { workspacePath, expandedPaths } = get();
    if (!workspacePath) return;

    try {
      const rootFiles = await readLibraryDir(workspacePath);
      if (!rootFiles) return;
      // 已展开的目录逐层重新读取，刷新后树的展开状态和子节点都不丢
      const loadExpanded = async (nodes: FileNode[]): Promise<FileNode[]> =>
        Promise.all(nodes.map(async (node) => {
          if (!node.isDirectory || !expandedPaths.includes(node.path)) return node;
          const sub = await readLibraryDir(node.path);
          if (!sub) return node;
          return { ...node, children: await loadExpanded(sub) };
        }));
      set((state) => ({ fileTree: state.fileTree, libraryVersion: state.libraryVersion + 1 }));
      set({ fileTree: await loadExpanded(rootFiles) });
    } catch (error) {
      console.error('Failed to refresh workspace:', error);
    }
  },

  openFileByPath: async (filePath: string) => {
    const existing = get().tabs.find(t => t.id === filePath);
    if (existing) { get().setActiveTab(filePath); return; }
    const readResult = await window.api.fs.readFile(filePath);
    if (readResult.success) {
      get().openTab({
        id: filePath,
        title: filePath.split(/[/\\]/).pop() || 'Untitled',
        content: readResult.content || '',
        isDirty: false,
        mode: 'word',
        diskSig: contentSig(readResult.content || ''),
      });
      get().addToRecent(filePath);
    }
  },

  openFile: async () => {
    const result = await window.api.dialog.open({
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }]
    });

    if (result && result.length > 0) {
      const filePath = result[0];
      const readResult = await window.api.fs.readFile(filePath);
      if (readResult.success) {
        get().openTab({
          id: filePath,
          title: filePath.split(/[/\\]/).pop() || 'Untitled',
          content: readResult.content || '',
          isDirty: false,
          mode: 'word'
        });
        get().addToRecent(filePath);
      }
    }
  },

  // 切换笔记库：选一个目录作为新的树根并持久化到设置
  openDirectory: async () => {
    const result = await window.api.dialog.open({ properties: ['openDirectory'] });
    if (result && result.length > 0) {
      get().setDefaultLibraryPath(result[0]);
    }
  },

  saveActiveFile: async (saveAs = false, isAutoSave = false) => {
    // 编辑器的写回是防抖的，保存前先把屏幕上的最新内容刷进 store
    get().editorFlush?.();
    const { activeTabId, tabs } = get();
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return false;

    let filePath = activeTab.id;
    const isTempFile = filePath.startsWith('new-');
    // 失焦触发的静默保存：没改过就不写盘。否则只是点开看一眼，文件的修改时间也会变，同步盘跟着重传一遍
    if (isAutoSave && !isTempFile && !activeTab.isDirty) return true;

    if (isTempFile || saveAs) {
      if (isTempFile && isAutoSave) {
        // 无感静默创建新文件：文件名取自内容的第一行正文。
        // AI 正在往文档里写内容时不落盘（半成品会被当成文件名）；空文档或只有符号的文档也先不落盘，
        // 内容已经随会话保存，等有了正文再建文件。
        if (get().aiStatus.generating) return false;
        const titleStr = deriveNoteTitle(activeTab.content);
        if (!titleStr) return false;

        const targetDir = get().getNewNoteDir();
        if (!targetDir) return false;
        const dirSep = pathSep(targetDir);
        filePath = `${targetDir}${dirSep}${titleStr}.md`;
        for (let i = 2; await window.api.fs.exists(filePath); i++) filePath = `${targetDir}${dirSep}${titleStr} ${i}.md`;
      } else {
        const result = await window.api.dialog.save({
          defaultPath: isTempFile ? (activeTab.title === '未命名' ? 'untitled.md' : `${activeTab.title}.md`) : filePath,
          filters: [{ name: 'Markdown', extensions: ['md'] }]
        });
        if (!result) return false;
        filePath = result;
      }
    }

    const saveResult = await window.api.fs.writeFile(filePath, activeTab.content);
    if (saveResult.success) {
      if (isTempFile || saveAs) {
        await get().updateTabId(activeTab.id, filePath, filePath.split(/[\\\\/]/).pop() || 'Untitled');
        get().setActiveTab(filePath);
        if (get().workspacePath && filePath.startsWith(get().workspacePath!)) {
          get().refreshWorkspace();
        }
      } else {
        set((state) => ({
          tabs: state.tabs.map(t => t.id === filePath ? { ...t, isDirty: false, externallyModified: false, diskSig: contentSig(activeTab.content) } : t)
        }));
      }
      return true;
    }
    return false;
  },

  setUpdateStatus: (status: Partial<AppState['updateStatus']>) => set((state) => ({
    updateStatus: { ...state.updateStatus, ...status }
  })),

  openDialog: (id) => set({ dialog: id }),
  closeDialog: () => set({ dialog: null }),

  setAIStatus: (status: Partial<AppState['aiStatus']>) => set((state) => ({
    aiStatus: { ...state.aiStatus, ...status }
  })),

  setZoom: (zoom: number) => set({ zoom }),
  
  setTheme: (themeId: string) => {
    const theme = THEME_PRESETS.find(t => t.id === themeId) || THEME_PRESETS[0];
    set({ theme });
    
    // 动态应用 CSS 变量到 Root
    const root = document.documentElement;
    root.style.setProperty('--color-brand-indigo', theme.primary);
    root.style.setProperty('--color-brand-purple', theme.secondary);
    root.style.setProperty('--brand-gradient', theme.gradient);
    root.style.setProperty('--brand-shadow', theme.shadow);
    root.style.setProperty('--brand-glow', theme.shadow.replace('0.2', '0.4'));
    root.style.setProperty('--color-accent-indigo', theme.primary);
    root.style.setProperty('--color-accent-blue', theme.secondary);
  },

  
  setAppearanceMode: (mode: 'light' | 'dark' | 'system' | 'eye-protection') => {
    set({ appearanceMode: mode });
    get().applyAppearance(mode);
    get().saveSettings();
  },

  setStartupBehavior: (behavior: 'restore' | 'dashboard') => {
    set({ startupBehavior: behavior });
    get().saveSettings();
  },

  setAutoSave: (autoSave: boolean) => {
    set({ autoSave });
    get().saveSettings();
  },

  setDefaultLibraryPath: (path: string) => {
    set({ defaultLibraryPath: path });
    get().saveSettings();
    get().loadLibrary(path);
  },

  applyAppearance: (mode: 'light' | 'dark' | 'system' | 'eye-protection') => {
    if (mode === 'eye-protection') {
      document.documentElement.setAttribute('data-theme', 'eye-protection');
      return;
    }
    const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  },

  loadSession: async () => {
    try {
      const sessionStr = localStorage.getItem('iml_session');
      let restoredWorkspace = false;
      
      if (sessionStr) {
        const session = JSON.parse(sessionStr);

        // 树根固定为笔记库（loadSettings 已加载），会话只恢复目录展开状态
        const root = get().workspacePath;
        if (root && Array.isArray(session.expandedPaths)) {
          set({ expandedPaths: [...new Set([root, ...session.expandedPaths])] });
          await get().refreshWorkspace();
          restoredWorkspace = true;
        }

        // 恢复 Starred Files
        if (session.starredFiles) {
          set({ starredFiles: session.starredFiles });
        }

        // 恢复 Recent Files
        if (session.recentFiles) {
          set({ recentFiles: session.recentFiles });
        }
        if (typeof session.sidebarWidth === 'number') {
          get().setSidebarWidth(session.sidebarWidth);
        }

        // 恢复 Tabs：与启动时通过「打开方式」已打开的标签页合并，而非覆盖
        const tabsToRestore: any[] = session.tabs || [];
        const preOpened = get().tabs;
        const restoredTabs: Tab[] = tabsToRestore
          .filter((t) => t && typeof t.id === 'string' && !preOpened.some((p) => p.id === t.id))
          .map((t) => ({
            id: t.id,
            title: t.title || t.id.split(/[/\\]/).pop() || '未命名',
            mode: t.mode || 'word',
            isDirty: !!t.isDirty,
            content: typeof t.content === 'string' ? t.content : '',
          }));
        if (restoredTabs.length > 0) {
          // 并行读盘、一次性写回：避免逐个 set 让整棵组件树反复渲染
          const loaded = await Promise.all(restoredTabs.map(async (tab): Promise<Tab | null> => {
            if (tab.id.startsWith('new-')) return tab; // 未命名文档：内容已随会话保存
            try {
              const result = await window.api.fs.readFile(tab.id);
              if (!result.success || result.content === undefined) return null;
              const diskContent = result.content || '';
              // 上次退出前未保存的修改优先于磁盘内容，避免重启丢稿
              const useDirty = tab.isDirty && tab.content.length > 0 && tab.content !== diskContent;
              return { ...tab, content: useDirty ? tab.content : diskContent, isDirty: useDirty };
            } catch (e) {
              return null;
            }
          }));
          const survivors = loaded.filter((t): t is Tab => t !== null);
          // 读盘期间可能已通过「打开方式」新开了标签，以当前 store 为准合并
          const preOpenedNow = get().tabs;
          set({
            tabs: [...survivors.filter(s => !preOpenedNow.some(p => p.id === s.id)), ...preOpenedNow],
            activeTabId: preOpenedNow.length > 0 ? get().activeTabId : session.activeTabId,
          });

          const currentTabs = get().tabs;
          if (currentTabs.length > 0 && !currentTabs.find(t => t.id === get().activeTabId)) {
            set({ activeTabId: currentTabs[currentTabs.length - 1].id });
          } else if (currentTabs.length === 0) {
            set({ activeTabId: null });
          }
        }
      }
      return restoredWorkspace;
    } catch (e) {
      console.error('Failed to load session:', e);
      return false;
    }
  },

  loadSettings: async () => {
    try {
      const settings = await window.api.app.getSettings();
      if (settings) {
        set({
          appearanceMode: settings.appearanceMode || 'light',
          startupBehavior: settings.startupBehavior || 'restore',
          autoSave: settings.autoSave ?? true,
          defaultLibraryPath: settings.defaultLibraryPath || '',
          imageGenConfig: settings.imageGenConfig || DEFAULT_IMAGE_GEN_CONFIG,
          imageCompression: settings.imageCompression ?? true,
          fetchLinkTitle: settings.fetchLinkTitle ?? true,
          linkPreview: settings.linkPreview ?? true,
          userCss: settings.userCss ?? true,
          vimMode: !!settings.vimMode,
          spellcheck: !!settings.spellcheck,
          aiEnabled: settings.aiEnabled ?? true,
          editorPrefs: normalizeEditorPrefs(settings.editorPrefs),
        });
        applyEditorPrefs(get().editorPrefs);
        void get().reloadUserCss(); // 设置里开 / 关了「自定义样式」
        if (settings.themeId) get().setTheme(settings.themeId);
        get().applyAppearance(settings.appearanceMode || 'light');
        // 笔记库路径变化（含设置窗口里改动后广播回来）时重新加载树
        const libraryPath: string = settings.defaultLibraryPath || '';
        if (libraryPath && libraryPath !== get().workspacePath) await get().loadLibrary(libraryPath);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  saveSettings: async () => {
    const { appearanceMode, startupBehavior, autoSave, defaultLibraryPath, imageGenConfig, theme, imageCompression, fetchLinkTitle, linkPreview, userCss, vimMode, spellcheck, aiEnabled, editorPrefs } = get();
    await window.api.app.saveSettings({
      appearanceMode, startupBehavior, autoSave, defaultLibraryPath, imageGenConfig,
      imageCompression, fetchLinkTitle, linkPreview, userCss, vimMode, spellcheck, aiEnabled, editorPrefs,
      themeId: theme?.id,
    });
  },

  setSelectedNodePath: (path) => set({ selectedNodePath: path }),
  setRenamingPath: (path) => set({ renamingPath: path }),
  setContextMenu: (cm) => set((state) => ({ contextMenu: { ...state.contextMenu, ...cm } })),

  renameFile: async (oldPath: string, newName: string) => {
    try {
      const sep = pathSep(oldPath);
      const parentDir = oldPath.substring(0, oldPath.lastIndexOf(sep));
      const newPath = `${parentDir}${sep}${newName}`;
      
      const result = await window.api.fs.rename(oldPath, newPath);
      if (result.success) {
        // 文件本身或（重命名目录时）其下所有路径都要改
        const remap = (p: string) => p === oldPath ? newPath : p.startsWith(oldPath + sep) ? newPath + p.slice(oldPath.length) : p;
        set((state) => ({
          tabs: state.tabs.map(t => {
            const id = remap(t.id);
            if (id === t.id) return t;
            return { ...t, id, title: id.split(sep).pop()?.replace(/\.md$/i, '') || t.title };
          }),
          activeTabId: state.activeTabId ? remap(state.activeTabId) : state.activeTabId,
          renamingPath: null,
          selectedNodePath: state.selectedNodePath ? remap(state.selectedNodePath) : state.selectedNodePath,
          starredFiles: state.starredFiles.map(remap),
          expandedPaths: state.expandedPaths.map(remap),
        }));
        await get().refreshWorkspace();
        return true;
      }
      return false;
    } catch (e) {
      console.error('Rename failed:', e);
      return false;
    }
  },

  deleteFile: async (path: string) => {
    try {
      const result = await window.api.fs.delete(path);
      if (result.success) {
        // 删除目录时连同其下已打开的标签页一起关闭
        const sep = pathSep(path);
        get().tabs.filter(t => t.id === path || t.id.startsWith(path + sep)).forEach(t => get().closeTab(t.id));
        set((state) => ({
          selectedNodePath: state.selectedNodePath === path ? null : state.selectedNodePath,
          starredFiles: state.starredFiles.filter(p => p !== path)
        }));
        await get().refreshWorkspace();
        return true;
      }
      return false;
    } catch (e) {
      console.error('Delete failed:', e);
      return false;
    }
  },

  duplicateFile: async (oldPath: string) => {
    try {
      const extMatch = oldPath.match(/\.([^.]+)$/);
      const ext = extMatch ? `.${extMatch[1]}` : '';
      const basePath = extMatch ? oldPath.substring(0, oldPath.length - ext.length) : oldPath;
      
      let result = await window.api.fs.copy(oldPath, `${basePath} 副本${ext}`);
      for (let counter = 2; !result.success && counter <= 50; counter++) {
        result = await window.api.fs.copy(oldPath, `${basePath} 副本 ${counter}${ext}`);
      }
      if (!result.success) return false;
      await get().refreshWorkspace();
      return true;
    } catch (e) {
      console.error('Duplicate failed:', e);
      return false;
    }
  },

  checkUpdates: async () => {
    set({ updateStatus: { show: true, loading: true, latestVersion: null, error: null } });
    
    try {
      const result = await window.api.app.checkUpdates();
      if (!result.success) {
        throw new Error(result.error);
      }
      
      set({
        updateStatus: {
          show: true,
          loading: false,
          latestVersion: result.latestVersion || null,
          error: null,
          release: { notes: result.notes, releaseUrl: result.releaseUrl, download: result.download },
        }
      });
      // 用户自己点开看过了，自动检查就不用再为这个版本弹一次
      if (result.latestVersion) markUpdateAnnounced(result.latestVersion);
    } catch (err: any) {
      set({
        updateStatus: {
          show: true,
          loading: false,
          latestVersion: null,
          error: err.message || '检查更新失败'
        }
      });
    }
  },

  autoCheckUpdates: async () => {
    // 静默检查：没有新版本、或者检查失败，都不打扰
    try {
      const result = await window.api.app.checkUpdates();
      if (!result.success || !result.latestVersion || !isNewerVersion(result.latestVersion, window.api.appVersion)) return;
      // 同一个版本只主动弹一次；之后靠「帮助」菜单上的小红点提醒，不再每次启动都打断
      const firstTime = !wasUpdateAnnounced(result.latestVersion);
      if (firstTime) markUpdateAnnounced(result.latestVersion);
      set((state) => ({
        updateStatus: {
          show: firstTime || state.updateStatus.show,
          loading: false,
          latestVersion: result.latestVersion!,
          error: null,
          release: { notes: result.notes, releaseUrl: result.releaseUrl, download: result.download },
        }
      }));
    } catch (err) {
      console.error('Auto update check failed:', err);
    }
  }
}));

// 已经主动提醒过的版本：同一个版本只弹一次
const UPDATE_ANNOUNCED_KEY = 'iml.update.announced';
function wasUpdateAnnounced(version: string): boolean { try { return localStorage.getItem(UPDATE_ANNOUNCED_KEY) === version; } catch { return false; } }
function markUpdateAnnounced(version: string) { try { localStorage.setItem(UPDATE_ANNOUNCED_KEY, version); } catch { /* 存不了就下次再弹 */ } }

// ── 会话持久化（防抖写入 localStorage）──
// 未保存的修改（脏标签页 / 新建未命名文档）连同内容一起保存，重启后可恢复；超大内容跳过以免撑爆 localStorage
const MAX_PERSISTED_CONTENT = 1_500_000;
// 只有主窗口持有真实会话；设置 / 关于等子窗口的 store 是空的，绝不能让它们写回 localStorage
const isMainWindow = !new URLSearchParams(window.location.search).get('window');
let sessionSaveTimer: ReturnType<typeof setTimeout> | null = null;
let sessionPersistDisabled = false;

function persistSession(state: AppState) {
  if (!isMainWindow || sessionPersistDisabled) return;
  const sessionToSave = {
    expandedPaths: state.expandedPaths,
    activeTabId: state.activeTabId,
    starredFiles: state.starredFiles,
    recentFiles: state.recentFiles,
    sidebarWidth: state.sidebarWidth,
    tabs: state.tabs.map(t => {
      const keepContent = (t.isDirty || t.id.startsWith('new-')) && t.content.length <= MAX_PERSISTED_CONTENT;
      return { id: t.id, title: t.title, isDirty: t.isDirty, mode: t.mode, ...(keepContent ? { content: t.content } : {}) };
    }),
  };
  try {
    localStorage.setItem('iml_session', JSON.stringify(sessionToSave));
  } catch (e) {
    console.warn('Session persist failed:', e);
  }
}

/** 立即落盘：先让编辑器把未写回的内容刷进 store，再写 localStorage（关窗 / 失焦时调用） */
export function flushSessionNow() {
  if (!isMainWindow || sessionPersistDisabled) return;
  useAppStore.getState().editorFlush?.();
  if (sessionSaveTimer) {
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = null;
  }
  persistSession(useAppStore.getState());
}

/** 清空会话并重载：期间禁止回写，否则 reload 前的 beforeunload 会把旧会话原样写回去 */
export function clearSessionAndReload() {
  sessionPersistDisabled = true;
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  localStorage.removeItem('iml_session');
  window.location.reload();
}

useAppStore.subscribe((state, prevState) => {
  const shouldSave =
    state.tabs !== prevState.tabs ||
    state.activeTabId !== prevState.activeTabId ||
    state.expandedPaths !== prevState.expandedPaths ||
    state.starredFiles !== prevState.starredFiles ||
    state.recentFiles !== prevState.recentFiles ||
    state.sidebarWidth !== prevState.sidebarWidth;
  if (!shouldSave || !isMainWindow || sessionPersistDisabled) return;
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  // 脏标签页的内容也会序列化，1s 防抖把连续打字合并成一次写入
  sessionSaveTimer = setTimeout(() => {
    sessionSaveTimer = null;
    persistSession(useAppStore.getState());
  }, 1000);
});

if (isMainWindow) {
  window.addEventListener('beforeunload', flushSessionNow);
  window.addEventListener('blur', flushSessionNow);
}

// 开发模式下把 store 挂到 window 上：端到端测试要核对「标签页里的内容和磁盘是不是一致」这类界面上看不出来的状态。
// 生产包里 import.meta.env.DEV 是 false，这一段会被整个去掉
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __imlStore?: typeof useAppStore }).__imlStore = useAppStore;
