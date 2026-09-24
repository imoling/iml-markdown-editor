import React, { useState, useEffect, useRef } from 'react';
import { useAppStore, needsSavePrompt } from '../../stores/appStore';
import { FileCode, X, FileDown, Plus, Save, FileUp, Sidebar as SidebarIcon, Layout, RotateCw, Minus, Square, Settings, Image, CalendarDays, Sparkles, History, Focus, ImageOff, Network, Wand2, Search, MessageCircleQuestion, Mic, ChevronRight, Copy, Gauge, PenLine } from 'lucide-react';
import { exportActiveTabToPdf, exportActiveTabToHtml, exportActiveTabToDocx, exportActiveTabToImage } from '../../utils/exportPdf';
import { isNewerVersion } from '../../utils/version';

type MenuId = 'file' | 'edit' | 'view' | 'intel' | 'help';

const MenuItem: React.FC<{
  icon?: React.ReactNode;
  label: React.ReactNode;
  hint?: string;
  disabled?: boolean;
  dim?: boolean;
  onClick: () => void;
}> = ({ icon, label, hint, disabled, dim, onClick }) => (
  <div className={`menu-item ${disabled ? 'menu-item--disabled' : ''} ${dim ? 'menu-item--dim' : ''}`} onClick={onClick}>
    {icon} {label}
    {hint && <span className="menu-hint">{hint}</span>}
  </div>
);

const MenuDivider = () => <div className="menu-divider" />;

/** 标签页右键菜单：一次关掉一批，省得挨个点小叉 */
const TabContextMenu: React.FC<{ tabId: string; x: number; y: number; onDone: () => void }> = ({ tabId, x, y, onDone }) => {
  const { tabs, requestCloseTab, closeOtherTabs, closeTabsToRight, closeSavedTabs, closeAllTabs } = useAppStore();
  const isMac = window.api.app.platform === 'darwin';
  const mod = isMac ? '⌘' : 'Ctrl+';

  useEffect(() => {
    const close = () => onDone();
    document.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => { document.removeEventListener('click', close); window.removeEventListener('blur', close); };
  }, [onDone]);

  const at = tabs.findIndex((t) => t.id === tabId);
  const rightCount = at < 0 ? 0 : tabs.length - at - 1;
  const savedCount = tabs.filter((t) => !needsSavePrompt(t)).length;
  const run = (fn: () => void) => () => { onDone(); fn(); };

  return (
    <div className="context-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <div className="context-menu__item" onClick={run(() => requestCloseTab(tabId))}>
        关闭 <span className="context-menu__hint">{mod}W</span>
      </div>
      <div className={`context-menu__item ${tabs.length < 2 ? 'context-menu__item--disabled' : ''}`} onClick={tabs.length < 2 ? undefined : run(() => closeOtherTabs(tabId))}>
        关闭其他 <span className="context-menu__hint">{isMac ? '⌥⌘W' : 'Alt+Ctrl+W'}</span>
      </div>
      <div className={`context-menu__item ${rightCount === 0 ? 'context-menu__item--disabled' : ''}`} onClick={rightCount === 0 ? undefined : run(() => closeTabsToRight(tabId))}>
        关闭右侧标签页{rightCount > 0 && ` · ${rightCount}`}
      </div>
      <div className={`context-menu__item ${savedCount === 0 ? 'context-menu__item--disabled' : ''}`} onClick={savedCount === 0 ? undefined : run(closeSavedTabs)}>
        关闭已保存的{savedCount > 0 && ` · ${savedCount}`}
      </div>
      <div className="context-menu__divider" />
      <div className="context-menu__item" onClick={run(closeAllTabs)}>全部关闭</div>
    </div>
  );
};

export const TitleBar: React.FC = () => {
  const {
    tabs, activeTabId, setActiveTab, requestCloseTab, closeOtherTabs, reopenClosedTab, closedTabs,
    toggleSidebar, toggleToolbar, toggleStatusBar, createNewFile,
    sidebarVisible, toolbarVisible, statusBarVisible,
    openFile, saveActiveFile, refreshWorkspace, updateStatus, checkUpdates, openDailyNote, openDialog,
    focusMode, toggleFocusMode, aiEnabled,
  } = useAppStore();

  const hasUpdate = isNewerVersion(updateStatus.latestVersion, window.api.appVersion);
  const [activeMenu, setActiveMenu] = useState<MenuId | null>(null);
  const [tabMenu, setTabMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const activeTab = tabs.find(t => t.id === activeTabId);
  const tabsRef = useRef<HTMLDivElement>(null);
  const isMac = window.api.app.platform === 'darwin';

  // 自动滚动激活标签到可见区域
  useEffect(() => {
    if (activeTabId && tabsRef.current) {
      tabsRef.current.querySelector('.titlebar-tab.active')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [activeTabId]);

  /** 执行菜单动作并收起菜单 */
  const run = (fn: () => void) => () => { setActiveMenu(null); fn(); };

  // 点菜单以外的任何地方、按 Esc、窗口失焦，菜单都收起来。
  // 不能用「铺满窗口的透明背板」来接点击：标题栏有毛玻璃效果（backdrop-filter），它里面的 position: fixed
  // 是相对标题栏而不是窗口定位的，背板实际只盖住了标题栏那 40px —— 点侧边栏、点正文，菜单都关不掉。
  // 用捕获阶段的 mousedown：不拦截这次点击，点侧边栏的按钮既收起菜单、也照常切换面板
  useEffect(() => {
    if (!activeMenu) return;
    const onDown = (e: MouseEvent) => { if (!(e.target as HTMLElement | null)?.closest?.('.menu-anchor')) setActiveMenu(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveMenu(null); };
    const onBlur = () => setActiveMenu(null);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => { document.removeEventListener('mousedown', onDown, true); document.removeEventListener('keydown', onKey); window.removeEventListener('blur', onBlur); };
  }, [activeMenu]);

  const Menu: React.FC<{ id: MenuId; label: string; width?: number; badge?: boolean; children: React.ReactNode }> = ({ id, label, width, badge, children }) => (
    <div className="menu-anchor">
      <button className="menu-trigger" onClick={() => setActiveMenu(activeMenu === id ? null : id)}>
        {label}
        {badge && <div className="notification-dot" />}
      </button>
      {activeMenu === id && <div className="dropdown-menu" style={width ? { minWidth: width } : undefined}>{children}</div>}
    </div>
  );

  return (
    <header className="titlebar">
      {isMac && <div className="titlebar-traffic-lights" />}

      <div className={`titlebar-menus ${isMac ? '' : 'titlebar-menus--win'}`}>
        <Menu id="file" label="文件" width={220}>
          <MenuItem icon={<Plus size={14} />} label="新建文档" hint="⌘N" onClick={run(createNewFile)} />
          <MenuItem icon={<FileUp size={14} />} label="打开…" hint="⌘O" onClick={run(openFile)} />
          <MenuItem icon={<Search size={14} />} label="快速打开笔记…" hint="⌘T" onClick={run(() => openDialog('quick-open'))} />
          <MenuItem icon={<CalendarDays size={14} />} label="今日日记" hint="⇧⌘D" onClick={run(openDailyNote)} />
          <MenuDivider />
          <MenuItem icon={<Save size={14} />} label="保存" hint="⌘S" disabled={!activeTab} onClick={run(() => saveActiveFile())} />
          <MenuItem icon={<Save size={14} />} label="另存为…" hint="⇧⌘S" disabled={!activeTab} onClick={run(() => saveActiveFile(true))} />
          <MenuDivider />
          <MenuItem icon={<History size={14} />} label="版本历史…" hint="⇧⌘H" disabled={!activeTab} onClick={run(() => openDialog('history'))} />
          <MenuDivider />
          <MenuItem icon={<FileDown size={14} />} label="导出为 PDF" hint="⌘P" disabled={!activeTab} onClick={run(exportActiveTabToPdf)} />
          <MenuItem icon={<FileDown size={14} />} label="导出为 HTML" hint="⇧⌘E" disabled={!activeTab} onClick={run(exportActiveTabToHtml)} />
          <MenuItem icon={<FileDown size={14} />} label="导出为 Word" disabled={!activeTab} onClick={run(() => void exportActiveTabToDocx())} />
          <MenuItem icon={<FileDown size={14} />} label="导出为长图" disabled={!activeTab} onClick={run(() => void exportActiveTabToImage())} />
          <MenuItem icon={<Copy size={14} />} label="复制为公众号格式…" disabled={!activeTab} onClick={run(() => openDialog('wechat-copy'))} />
          <MenuDivider />
          {/* Windows 没有原生菜单，这几项得在这里也能找到；关闭右侧 / 已保存 / 全部 留在标签页右键里 */}
          <MenuItem icon={<X size={14} />} label="关闭标签页" hint="⌘W" disabled={!activeTab} onClick={run(() => activeTabId && requestCloseTab(activeTabId))} />
          <MenuItem icon={<X size={14} />} label="关闭其他标签页" hint="⌥⌘W" disabled={tabs.length < 2} onClick={run(() => activeTabId && closeOtherTabs(activeTabId))} />
          <MenuItem icon={<RotateCw size={14} />} label="重开刚关的标签页" hint="⇧⌘T" disabled={closedTabs.length === 0} onClick={run(() => void reopenClosedTab())} />
        </Menu>

        <Menu id="edit" label="编辑">
          <MenuItem label="撤销" hint="⌘Z" onClick={run(() => document.execCommand('undo'))} />
          <MenuItem label="重做" hint="⇧⌘Z" onClick={run(() => document.execCommand('redo'))} />
          <MenuDivider />
          <MenuItem label="剪切" hint="⌘X" onClick={run(() => document.execCommand('cut'))} />
          <MenuItem label="复制" hint="⌘C" onClick={run(() => document.execCommand('copy'))} />
          <MenuItem label="粘贴" hint="⌘V" onClick={run(() => document.execCommand('paste'))} />
          <MenuItem label="全选" hint="⌘A" onClick={run(() => document.execCommand('selectAll'))} />
        </Menu>

        <Menu id="view" label="视图" width={200}>
          <MenuItem icon={<ChevronRight size={14} />} label="命令面板…" hint="⇧⌘P" onClick={run(() => openDialog('command-palette'))} />
          <MenuDivider />
          <MenuItem icon={<SidebarIcon size={14} />} label={sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'} hint="⌘\" onClick={run(toggleSidebar)} />
          <MenuItem icon={<Focus size={14} />} label={focusMode ? '退出专注模式' : '专注模式'} hint="⇧⌘." onClick={run(toggleFocusMode)} />
          <MenuDivider />
          <MenuItem icon={<Layout size={14} />} label={toolbarVisible ? '隐藏工具栏' : '显示工具栏'} dim={!toolbarVisible} onClick={run(toggleToolbar)} />
          <MenuItem icon={<Layout size={14} />} label={statusBarVisible ? '隐藏状态栏' : '显示状态栏'} dim={!statusBarVisible} onClick={run(toggleStatusBar)} />
          <MenuDivider />
          <MenuItem icon={<RotateCw size={14} />} label="刷新笔记库" onClick={run(refreshWorkspace)} />
          <MenuItem icon={<ImageOff size={14} />} label="清理未引用的图片…" onClick={run(() => openDialog('image-cleanup'))} />
        </Menu>

        {/* 按功能命名：每一项打开对应功能的设置（用哪个模型 / 服务） */}
        <Menu id="intel" label="智能">
          <MenuItem icon={<MessageCircleQuestion size={14} />} label="问你的笔记" hint="⌘J" disabled={!aiEnabled} onClick={run(() => useAppStore.getState().openAsk())} />
          <MenuDivider />
          <MenuItem icon={<Wand2 size={14} />} label="写作助手…" hint="⇧⌘M" onClick={run(() => openDialog('ai-config'))} />
          <MenuItem icon={<PenLine size={14} />} label="自动续写…" disabled={!aiEnabled} onClick={run(() => openDialog('auto-continue'))} />
          <MenuItem icon={<Network size={14} />} label="相关笔记…" disabled={!aiEnabled} onClick={run(() => openDialog('semantic-config'))} />
          {/* 一个功能只占一项：转写面板在侧边栏就有入口，菜单里这一项管它的模型和麦克风（弹窗里也能一键打开面板） */}
          <MenuItem icon={<Mic size={14} />} label="实时转写…" disabled={!aiEnabled} onClick={run(() => openDialog('transcribe-config'))} />
          <MenuDivider />
          <MenuItem icon={<Image size={14} />} label="AI 配图…" onClick={run(() => openDialog('image-config'))} />
          <MenuDivider />
          <MenuItem icon={<Gauge size={14} />} label="本机资源…" onClick={run(() => openDialog('resources'))} />
        </Menu>

        <Menu id="help" label="帮助" width={180} badge={hasUpdate}>
          <MenuItem icon={<Wand2 size={14} />} label="快速开始 AI…" onClick={run(() => openDialog('ai-setup'))} />
          <MenuItem icon={<Layout size={14} />} label="快捷键" hint="⌘/" onClick={run(() => openDialog('shortcuts'))} />
          <MenuItem icon={<RotateCw size={14} />} label={<>检查更新{hasUpdate && <div className="notification-dot" />}</>} onClick={run(checkUpdates)} />
          <MenuItem icon={<Settings size={14} />} label="设置" onClick={run(() => openDialog('settings'))} />
          <MenuItem icon={<Sparkles size={14} />} label="新特性介绍" onClick={run(() => openDialog('whats-new'))} />
          <MenuDivider />
          <MenuItem icon={<Layout size={14} />} label="关于" onClick={run(() => openDialog('about'))} />
        </Menu>
      </div>

      {/* 标签页区域 */}
      <div ref={tabsRef} className="titlebar-tabs">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          // 和「关之前要不要问」用同一条规则：空白的未命名文档不算未保存
          const unsaved = needsSavePrompt(tab);
          return (
            <div
              key={tab.id}
              className={`titlebar-tab ${isActive ? 'active' : ''} ${unsaved ? 'titlebar-tab--unsaved' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => { e.preventDefault(); setTabMenu({ tabId: tab.id, x: e.clientX, y: e.clientY }); }}
              // 中键关闭：浏览器习惯
              onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); requestCloseTab(tab.id); } }}
            >
              <FileCode size={14} color={isActive ? 'var(--color-accent-indigo)' : 'var(--text-muted)'} />
              {tab.externallyModified && (
                <span className="dot-indicator dot-indicator--warn" title="这个文件在磁盘上已被外部修改或删除；保存会覆盖磁盘版本" />
              )}
              <span className="tab-title" title={tab.externallyModified ? '磁盘上已被外部修改' : tab.id}>{tab.title}</span>
              {/* 未保存时平时显示圆点，鼠标移上标签页才换回叉号（VS Code 的做法）：一眼能看出哪个没存，又不占额外位置 */}
              <div className="close-tab-icon" title={unsaved ? '有未保存的修改 · 点击关闭' : '关闭标签页 ⌘W'} onClick={(e) => { e.stopPropagation(); requestCloseTab(tab.id); }}>
                <span className="close-tab-icon__dot" />
                <X size={12} className="close-tab-icon__x" />
              </div>
            </div>
          );
        })}
      </div>

      {tabMenu && <TabContextMenu {...tabMenu} onDone={() => setTabMenu(null)} />}

      {/* Windows 窗口控制按钮 */}
      {!isMac && (
        <div className="window-controls">
          <button className="window-control-btn minimize" onClick={() => window.api.app.minimize()} title="最小化"><Minus size={14} /></button>
          <button className="window-control-btn maximize" onClick={() => window.api.app.maximize()} title="最大化/还原"><Square size={12} /></button>
          <button className="window-control-btn close" onClick={() => window.api.app.close()} title="关闭"><X size={14} /></button>
        </div>
      )}
    </header>
  );
};
