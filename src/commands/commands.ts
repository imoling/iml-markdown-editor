import { useAppStore } from '../stores/appStore';
import type { SidebarTab } from '../stores/appStore';
import { exportActiveTabToPdf, exportActiveTabToHtml, exportActiveTabToDocx, exportActiveTabToImage } from '../utils/exportPdf';
import { matchTerm, mergeRanges } from '../utils/quickOpen';
import { createSlashItems } from '../components/Editor/slashItems';

/**
 * 命令注册表：应用里「能做的事」的一张清单，命令面板（⌘⇧P）从这里取。
 * 功能越加越多，菜单藏得越来越深；这里敲几个字就能找到，不用记它在哪个菜单下面。
 * 以后做自定义快捷键，也是给这张表里的 id 绑键。
 */
export type CommandGroup = '文件' | '插入' | '视图' | '侧边栏' | '查找' | '智能' | '外观' | '帮助';

export interface AppCommand {
  id: string;
  title: string;
  group: CommandGroup;
  /** 现有的快捷键，只用来显示（mac 写法；Windows 上由界面换成 Ctrl / Alt） */
  shortcut?: string;
  /** 标题之外还能用什么词找到它：拼音首字母、英文、口语说法 */
  keywords?: string[];
  /** 现在用不了的命令在面板里不列出来（没有打开的笔记时的「保存」、AI 关着时的「问你的笔记」） */
  enabled?: () => boolean;
  run: () => void | Promise<void>;
}

const store = () => useAppStore.getState();
const hasTab = () => !!store().activeTabId;
const hasSavedTab = () => { const id = store().activeTabId; return !!id && !id.startsWith('new-'); };
const aiOn = () => store().aiEnabled;
const canFold = () => !!store().activeTabId && store().mode === 'word' && !!store().editorActions?.fold;
const showSidebar = (tab: SidebarTab) => () => useAppStore.setState({ sidebarTab: tab, sidebarVisible: true, focusMode: false });

/**
 * 「插入…」这一组直接取自正文里的斜杠菜单（标题、列表、表格、公式、提示块…）：同一份清单、同一段执行代码，不另写一套。
 * 只有富文本模式的编辑器开着时才列出来；「今日日记」在「文件」组里已经有了。
 */
const noop = () => {};
const INSERT_COMMANDS: AppCommand[] = createSlashItems({ openTable: noop, openImage: noop, openLink: noop, openAI: noop, openDailyNote: noop })
  .filter((item) => item.id !== 'daily')
  .map((item) => ({
    id: `insert.${item.id}`,
    group: '插入' as const,
    title: `${/^(标题|正文)/.test(item.title) ? '转为' : '插入'}：${item.title}`,
    keywords: [...(item.keywords || []), item.description || ''].filter(Boolean),
    enabled: () => !!store().activeTabId && store().mode === 'word' && !!store().editorActions?.runSlash && (item.id !== 'ai' || store().aiEnabled),
    run: () => { store().editorActions?.runSlash?.(item.id); },
  }));

export const COMMANDS: AppCommand[] = [
  // ── 文件 ──
  { id: 'file.new', group: '文件', title: '新建文档', shortcut: '⌘N', keywords: ['xjwd', 'new'], run: () => store().createNewFile() },
  { id: 'file.open', group: '文件', title: '打开文件…', shortcut: '⌘O', keywords: ['dkwj', 'open'], run: () => store().openFile() },
  { id: 'file.quick-open', group: '文件', title: '快速打开笔记…', shortcut: '⌘T', keywords: ['ksdk', 'goto', 'switch'], run: () => store().openDialog('quick-open') },
  { id: 'file.quick-capture', group: '文件', title: '快速捕获：记一句话到今天的日记', keywords: ['ksbh', 'capture', 'quick', 'jot', '随手记', '速记'], run: () => { void window.api.capture.show(); } },
  { id: 'file.daily', group: '文件', title: '今日日记', shortcut: '⇧⌘D', keywords: ['jrrj', 'rj', 'daily', 'today', '今天'], run: () => store().openDailyNote() },
  { id: 'file.save', group: '文件', title: '保存', shortcut: '⌘S', keywords: ['bc', 'save'], enabled: hasTab, run: () => { void store().saveActiveFile(); } },
  { id: 'file.save-as', group: '文件', title: '另存为…', shortcut: '⇧⌘S', keywords: ['lcw', 'save as'], enabled: hasTab, run: () => { void store().saveActiveFile(true); } },
  { id: 'file.history', group: '文件', title: '版本历史…', shortcut: '⇧⌘H', keywords: ['bbls', 'history', '恢复', '快照'], enabled: hasSavedTab, run: () => store().openDialog('history') },
  { id: 'file.export-pdf', group: '文件', title: '导出为 PDF', shortcut: '⌘P', keywords: ['dc', 'export', 'print', '打印'], enabled: hasTab, run: () => { void exportActiveTabToPdf(); } },
  { id: 'file.export-html', group: '文件', title: '导出为 HTML', shortcut: '⇧⌘E', keywords: ['dc', 'export', '网页'], enabled: hasTab, run: () => { void exportActiveTabToHtml(); } },
  { id: 'file.export-docx', group: '文件', title: '导出为 Word', keywords: ['dc', 'export', 'word', 'docx', 'wps', '文档'], enabled: hasTab, run: () => { void exportActiveTabToDocx(); } },
  { id: 'file.export-image', group: '文件', title: '导出为长图', keywords: ['dc', 'export', 'image', 'png', 'ct', '图片', '截图', '朋友圈'], enabled: hasTab, run: () => { void exportActiveTabToImage(); } },
  { id: 'file.copy-wechat', group: '文件', title: '复制为公众号格式', keywords: ['fz', 'gzh', 'wechat', 'weixin', 'mp', '微信', '公众号', '排版', '推文', '粘贴'], enabled: hasTab, run: () => store().openDialog('wechat-copy') },
  { id: 'file.reveal', group: '文件', title: window.api.app.platform === 'darwin' ? '在访达中显示当前笔记' : '在资源管理器中显示当前笔记', keywords: ['finder', 'reveal', 'fd', '文件夹'], enabled: hasSavedTab, run: () => { const id = store().activeTabId; if (id) window.api.shell.showItemInFolder(id); } },
  { id: 'file.duplicate', group: '文件', title: '给当前笔记创建副本', keywords: ['fb', 'duplicate', 'copy', '复制一份'], enabled: hasSavedTab, run: () => { const id = store().activeTabId; if (id) void store().duplicateFile(id); } },
  { id: 'file.star', group: '文件', title: '收藏 / 取消收藏当前笔记', keywords: ['sc', 'star', 'bookmark', '星标', '书签'], enabled: hasSavedTab, run: () => { const id = store().activeTabId; if (id) store().toggleStar(id); } },
  { id: 'file.close-tab', group: '文件', title: '关闭标签页', shortcut: '⌘W', keywords: ['gb', 'close'], enabled: hasTab, run: () => { const id = store().activeTabId; if (id) store().requestCloseTab(id); } },
  { id: 'file.close-others', group: '文件', title: '关闭其他标签页', shortcut: '⌥⌘W', keywords: ['gbqt', 'close others'], enabled: () => store().tabs.length > 1, run: () => { const id = store().activeTabId; if (id) store().closeOtherTabs(id); } },
  { id: 'file.reopen-tab', group: '文件', title: '重开刚关的标签页', shortcut: '⇧⌘T', keywords: ['ck', 'reopen'], enabled: () => store().closedTabs.length > 0, run: () => { void store().reopenClosedTab(); } },
  { id: 'file.switch-library', group: '文件', title: '切换笔记库…', shortcut: '⇧⌘O', keywords: ['qhbjk', 'vault', 'library', '文件夹', '工作区'], run: () => { void store().openDirectory(); } },
  { id: 'file.refresh-library', group: '文件', title: '刷新笔记库', keywords: ['sx', 'refresh', 'reload'], run: () => { void store().refreshWorkspace(); } },
  { id: 'file.image-cleanup', group: '文件', title: '清理未引用的图片…', keywords: ['ql', 'tp', 'cleanup', 'orphan', '孤儿', '附件'], run: () => store().openDialog('image-cleanup') },

  ...INSERT_COMMANDS,

  // ── 视图 ──
  { id: 'view.toggle-mode', group: '视图', title: '切换富文本 / 源码模式', shortcut: '⌘E', keywords: ['qh', 'ym', 'source', 'markdown', 'wysiwyg', '预览'], enabled: hasTab, run: () => store().toggleMode() },
  { id: 'view.toggle-sidebar', group: '视图', title: '显示 / 隐藏侧边栏', shortcut: '⌘\\', keywords: ['cbl', 'sidebar'], run: () => store().toggleSidebar() },
  { id: 'view.focus', group: '视图', title: '专注模式', shortcut: '⇧⌘.', keywords: ['zz', 'focus', 'zen', '打字机', '无干扰'], run: () => store().toggleFocusMode() },
  { id: 'view.toggle-toolbar', group: '视图', title: '显示 / 隐藏工具栏', keywords: ['gjl', 'toolbar'], run: () => store().toggleToolbar() },
  { id: 'view.fold-section', group: '视图', title: '折叠当前小节', shortcut: '⌥⌘[', keywords: ['zd', 'fold', 'collapse', '收起', '标题', '列表'], enabled: canFold, run: () => { store().editorActions?.fold?.('section', false); } },
  { id: 'view.unfold-section', group: '视图', title: '展开当前小节', shortcut: '⌥⌘]', keywords: ['zk', 'unfold', 'expand', '展开'], enabled: canFold, run: () => { store().editorActions?.fold?.('section', true); } },
  { id: 'view.fold-all', group: '视图', title: '全部折叠', keywords: ['qbzd', 'fold all', 'collapse all', '收起全部', '大纲'], enabled: canFold, run: () => { store().editorActions?.fold?.('all', false); } },
  { id: 'view.unfold-all', group: '视图', title: '全部展开', keywords: ['qbzk', 'unfold all', 'expand all', '展开全部'], enabled: canFold, run: () => { store().editorActions?.fold?.('all', true); } },
  { id: 'view.toggle-statusbar', group: '视图', title: '显示 / 隐藏状态栏', keywords: ['ztl', 'status'], run: () => store().toggleStatusBar() },

  // ── 侧边栏 ──
  { id: 'sidebar.library', group: '侧边栏', title: '侧边栏：笔记库', keywords: ['bjk', 'files', 'tree', '文件树'], run: showSidebar('library') },
  { id: 'sidebar.outline', group: '侧边栏', title: '侧边栏：目录、反向链接、相关笔记', keywords: ['ml', 'dg', 'outline', 'toc', 'backlinks', '大纲', '未链接提及'], run: showSidebar('catalog') },
  { id: 'sidebar.tasks', group: '侧边栏', title: '侧边栏：全库待办', keywords: ['db', 'todo', 'tasks', '任务', '清单'], run: showSidebar('tasks') },
  { id: 'sidebar.tags', group: '侧边栏', title: '侧边栏：标签', keywords: ['bq', 'tags'], run: showSidebar('tags') },
  { id: 'sidebar.transcribe', group: '侧边栏', title: '侧边栏：实时转写', keywords: ['zx', 'ly', 'transcribe', 'record', '录音', '会议'], enabled: aiOn, run: () => store().openTranscribe() },

  // ── 查找 ──
  { id: 'find.in-note', group: '查找', title: '在当前笔记里查找', shortcut: '⌘F', keywords: ['cz', 'find', 'search'], enabled: hasTab, run: () => store().toggleFind() },
  { id: 'find.replace', group: '查找', title: '查找并替换', shortcut: '⌥⌘F', keywords: ['th', 'replace'], enabled: hasTab, run: () => store().toggleReplace() },
  { id: 'find.global', group: '查找', title: '全库搜索', shortcut: '⇧⌘F', keywords: ['ss', 'qk', 'search', 'global', '全文'], run: () => store().openGlobalSearch() },

  // ── 智能 ──
  { id: 'ai.ask', group: '智能', title: '问你的笔记', shortcut: '⌘J', keywords: ['wd', 'ask', 'chat', 'rag', '问答'], enabled: aiOn, run: () => store().openAsk() },
  { id: 'ai.writing', group: '智能', title: '写作助手（模型设置）…', shortcut: '⇧⌘M', keywords: ['xz', 'mx', 'model', 'llm', '本机模型', 'ollama'], run: () => store().openDialog('ai-config') },
  { id: 'ai.related', group: '智能', title: '相关笔记与语义搜索…', keywords: ['xg', 'yy', 'semantic', 'embedding', '向量'], enabled: aiOn, run: () => store().openDialog('semantic-config') },
  { id: 'ai.transcribe-config', group: '智能', title: '实时转写设置…', keywords: ['zx', 'mkf', 'asr', '麦克风', '语音模型'], enabled: aiOn, run: () => store().openDialog('transcribe-config') },
  { id: 'ai.image', group: '智能', title: 'AI 配图设置…', keywords: ['pt', 'image', '插图', '生图'], run: () => store().openDialog('image-config') },
  { id: 'ai.setup', group: '智能', title: '快速开始 AI…', keywords: ['ks', 'setup', '引导'], run: () => store().openDialog('ai-setup') },

  // ── 外观 ──
  { id: 'theme.light', group: '外观', title: '外观：浅色', keywords: ['qs', 'light', '白天', '主题'], run: () => store().setAppearanceMode('light') },
  { id: 'theme.dark', group: '外观', title: '外观：深色', keywords: ['ss', 'dark', '夜间', '主题'], run: () => store().setAppearanceMode('dark') },
  { id: 'theme.system', group: '外观', title: '外观：跟随系统', keywords: ['gs', 'system', 'auto', '主题'], run: () => store().setAppearanceMode('system') },
  { id: 'theme.eye', group: '外观', title: '外观：护眼', keywords: ['hy', 'sepia', 'eye', '主题'], run: () => store().setAppearanceMode('eye-protection') },

  // ── 帮助 ──
  { id: 'help.settings', group: '帮助', title: '设置…', shortcut: '⌘,', keywords: ['sz', 'settings', 'preferences', '偏好'], run: () => store().openDialog('settings') },
  { id: 'help.shortcuts', group: '帮助', title: '快捷键说明', shortcut: '⌘/', keywords: ['kjj', 'shortcuts', 'keys'], run: () => store().openDialog('shortcuts') },
  { id: 'help.whats-new', group: '帮助', title: '新特性介绍', keywords: ['xtx', 'whats new', 'changelog', '更新内容'], run: () => store().openDialog('whats-new') },
  { id: 'help.check-updates', group: '帮助', title: '检查更新', keywords: ['gx', 'update', 'upgrade', '升级'], run: () => { void store().checkUpdates(); } },
  { id: 'help.about', group: '帮助', title: '关于 iML Markdown Editor', keywords: ['gy', 'about', '版本'], run: () => store().openDialog('about') },
];

export interface CommandHit {
  command: AppCommand;
  score: number;
  /** 标题里命中的区间，用来高亮；靠关键词或分组命中时为空 */
  ranges: [number, number][];
}

/**
 * 按查询给命令排序。每个词都得命中：标题优先，其次关键词（拼音首字母、英文），再次分组名。
 * 没输入时：最近用过的排最前，其余按表里的顺序。
 */
export function rankCommands(commands: AppCommand[], query: string, recentIds: string[] = []): CommandHit[] {
  const available = commands.filter((c) => !c.enabled || c.enabled());
  const terms = query.trim().split(/\s+/).filter(Boolean);
  const recency = new Map(recentIds.map((id, i) => [id, i]));
  if (terms.length === 0) {
    const hits = available.map((command) => ({ command, score: 0, ranges: [] as [number, number][] }));
    return [...hits.filter((h) => recency.has(h.command.id)).sort((a, b) => recency.get(a.command.id)! - recency.get(b.command.id)!), ...hits.filter((h) => !recency.has(h.command.id))];
  }
  const out: CommandHit[] = [];
  for (const command of available) {
    let score = 0;
    const ranges: [number, number][] = [];
    let ok = true;
    for (const term of terms) {
      const onTitle = matchTerm(command.title, term);
      let onKeyword = -1;
      for (const k of command.keywords || []) onKeyword = Math.max(onKeyword, (matchTerm(k, term)?.score ?? -1) * 0.8);
      const onGroup = (matchTerm(command.group, term)?.score ?? -1) * 0.4;
      const best = Math.max(onTitle?.score ?? -1, onKeyword, onGroup);
      if (best < 0) { ok = false; break; }
      score += best;
      if (onTitle && onTitle.score === best) ranges.push(...onTitle.ranges);
    }
    if (!ok) continue;
    const r = recency.get(command.id);
    if (r !== undefined) score += Math.max(0, 60 - r * 6);
    out.push({ command, score, ranges: mergeRanges(ranges) });
  }
  return out.sort((a, b) => b.score - a.score || a.command.title.length - b.command.title.length);
}

/** mac 写法的快捷键 → 当前平台的显示：Windows 上 ⌘ → Ctrl、⌥ → Alt、⇧ → Shift，用 + 连起来 */
export function displayShortcut(shortcut: string, isMac: boolean): string {
  if (isMac) return shortcut;
  const names: Record<string, string> = { '⌘': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift', '⌃': 'Ctrl' };
  const order = ['Ctrl', 'Alt', 'Shift'];
  const mods: string[] = [];
  let key = '';
  for (const ch of shortcut) { if (names[ch]) mods.push(names[ch]); else key += ch; }
  return [...order.filter((m) => mods.includes(m)), key.toUpperCase()].join('+');
}
