import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import {
  FileText,
  FileCode,
  X,
  FileDown,
  Plus,
  Save,
  FileUp,
  Sidebar as SidebarIcon,
  Layout,
  RotateCw,
  Minus,
  Square,
  Settings,
  Globe,
  Sparkles,
  Image,
} from 'lucide-react';
import { markdownToHtml, markdownToStaticHtml } from '../../utils/markdown';

import { ConfirmDialog } from '../ConfirmDialog';

export const TitleBar: React.FC = () => {
  const { 
    tabs, 
    activeTabId, 
    setActiveTab, 
    closeTab, 
    toggleSidebar,
    toggleToolbar,
    toggleStatusBar,
    toggleAIPanel,
    createNewFile,
    sidebarVisible,
    toolbarVisible,
    statusBarVisible,
    aiPanelVisible,
    openFile,
    openDirectory,
    saveActiveFile,
    refreshWorkspace,
    tabToClose,
    setTabToClose,
    updateStatus,
    checkUpdates,
    setUpdateStatus,
    setSettingsModalOpen
  } = useAppStore();
  
  const currentVersion = window.api.appVersion || '1.6.0';
  const hasUpdate = updateStatus.latestVersion && updateStatus.latestVersion !== currentVersion;

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  
  const activeTab = tabs.find(t => t.id === activeTabId);
  const tabsRef = useRef<HTMLDivElement>(null);

  const handleCloseTab = (id: string) => {
    const tab = tabs.find(t => t.id === id);
    const isTemp = id.startsWith('new-') || id.startsWith('ai-gen-');
    if (tab && (tab.isDirty || isTemp)) {
      setTabToClose(id);
    } else {
      closeTab(id);
    }
  };

  // 自动滚动激活标签到可见区域
  useEffect(() => {
    if (activeTabId && tabsRef.current) {
      const activeTabElement = tabsRef.current.querySelector('.titlebar-tab.active');
      if (activeTabElement) {
        activeTabElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }, [activeTabId]);

  const isMac = window.api.app.platform === 'darwin';

  return (
    <header className="titlebar" style={{ gap: 0, paddingRight: 0 }}>
      {/* Mac 交通灯区域占位 */}
      {isMac && <div className="titlebar-traffic-lights" style={{ width: 80, flexShrink: 0 }}></div>}

      {/* 菜单区域 */}
      <div className="titlebar-menus" style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, marginLeft: isMac ? 0 : 12 } as React.CSSProperties}>
        {/* 文件菜单 */}
        <div style={{ position: 'relative' }}>
          <button
            className="menu-trigger"
            onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}
            style={{
              background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500, transition: 'background 0.2s', WebkitAppRegion: 'no-drag'
            } as React.CSSProperties}
          >
            文件
          </button>
          {activeMenu === 'file' && (
            <>
              <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 999 }} onClick={() => setActiveMenu(null)} />
              <div className="dropdown-menu" style={{ 
                position: 'absolute', top: 36, left: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, boxShadow: '0 10px 40px rgba(0,0,0,0.12)', zIndex: 1000, minWidth: 220, padding: 6, backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)'
              }}>
                <div className="menu-item" onClick={() => { createNewFile(); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                  <Plus size={14} /> 新建文档 <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⌘N</span>
                </div>
                <div className="menu-item" onClick={() => { openFile(); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                  <FileUp size={14} /> 打开... <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⌘O</span>
                </div>
                <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '6px 4px' }}></div>
                <div className="menu-item" onClick={() => { saveActiveFile(); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6, opacity: activeTab ? 1 : 0.4 }}>
                  <Save size={14} /> 保存 <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⌘S</span>
                </div>
                <div className="menu-item" onClick={() => { saveActiveFile(true); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6, opacity: activeTab ? 1 : 0.4 }}>
                  <Save size={14} /> 另存为... <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⇧⌘S</span>
                </div>
                <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '6px 4px' }}></div>
                <div className="menu-item" onClick={async () => { 
                  if (activeTab) {
                    const staticHtml = await markdownToStaticHtml(activeTab.content);
                    await window.api.export.pdf(staticHtml, activeTab.title, activeTab.id);
                  }
                  setActiveMenu(null); 
                }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6, opacity: activeTab ? 1 : 0.4 }}>
                  <FileDown size={14} /> 导出为 PDF
                </div>
              </div>
            </>
          )}
        </div>

        {/* 编辑菜单 */}
        <div style={{ position: 'relative' }}>
          <button
            className="menu-trigger"
            onClick={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500, transition: 'background 0.2s', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            编辑
          </button>
          {activeMenu === 'edit' && (
            <>
              <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 999 }} onClick={() => setActiveMenu(null)} />
              <div className="dropdown-menu" style={{ position: 'absolute', top: 36, left: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, boxShadow: '0 10px 40px rgba(0,0,0,0.12)', zIndex: 1000, minWidth: 200, padding: 6, backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)' }}>
                <div className="menu-item" onClick={() => { document.execCommand('undo'); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                  撤销 <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⌘Z</span>
                </div>
                <div className="menu-item" onClick={() => { document.execCommand('redo'); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                  重做 <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⇧⌘Z</span>
                </div>
                <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '6px 4px' }} />
                <div className="menu-item" onClick={() => { document.execCommand('cut'); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                  剪切 <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⌘X</span>
                </div>
                <div className="menu-item" onClick={() => { document.execCommand('copy'); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                  复制 <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⌘C</span>
                </div>
                <div className="menu-item" onClick={() => { document.execCommand('paste'); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                  粘贴 <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⌘V</span>
                </div>
                <div className="menu-item" onClick={() => { document.execCommand('selectAll'); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                  全选 <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⌘A</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 视图菜单 */}
        <div style={{ position: 'relative' }}>
          <button
            className="menu-trigger"
            onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}
            style={{ 
              background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500, transition: 'background 0.2s', WebkitAppRegion: 'no-drag'
            } as React.CSSProperties}
          >
            视图
          </button>
          {activeMenu === 'view' && (
            <>
              <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 999 }} onClick={() => setActiveMenu(null)} />
              <div className="dropdown-menu" style={{ 
                position: 'absolute', top: 36, left: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, boxShadow: '0 10px 40px rgba(0,0,0,0.12)', zIndex: 1000, minWidth: 180, padding: 6, backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)'
              }}>
                <div className="menu-item" onClick={() => { toggleSidebar(); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                  <SidebarIcon size={14} /> {sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'} <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⌘\</span>
                </div>
                <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '6px 4px' }}></div>
                <div className="menu-item" onClick={() => { toggleToolbar(); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6, opacity: toolbarVisible ? 1 : 0.6 }}>
                   <Layout size={14} /> {toolbarVisible ? '隐藏工具栏' : '显示工具栏'}
                </div>
                <div className="menu-item" onClick={() => { toggleStatusBar(); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6, opacity: statusBarVisible ? 1 : 0.6 }}>
                   <Layout size={14} /> {statusBarVisible ? '隐藏状态栏' : '显示状态栏'}
                </div>
                <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '6px 4px' }}></div>
                <div className="menu-item" onClick={() => { refreshWorkspace(); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                   <RotateCw size={14} /> 刷新工作区
                </div>
              </div>
            </>
          )}
        </div>

        {/* 智能菜单 */}
        <div style={{ position: 'relative' }}>
          <button 
            className="menu-trigger" 
            onClick={() => setActiveMenu(activeMenu === 'intel' ? null : 'intel')}
            style={{ 
              background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500, transition: 'background 0.2s', WebkitAppRegion: 'no-drag'
            } as React.CSSProperties}
          >
            智能
          </button>
          {activeMenu === 'intel' && (
            <>
              <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 999 }} onClick={() => setActiveMenu(null)} />
              <div className="dropdown-menu" style={{
                position: 'absolute', top: 36, left: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, boxShadow: '0 10px 40px rgba(0,0,0,0.12)', zIndex: 1000, minWidth: 200, padding: 6, backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)'
              }}>
                <div
                   className="menu-item"
                   onClick={() => { setActiveMenu(null); window.api.events.send('open-ai-config'); }}
                   style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}
                 >
                   <Layout size={14} /> 模型配置 <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⇧⌘M</span>
                 </div>
                 <div
                   className="menu-item"
                   onClick={() => { setActiveMenu(null); window.api.events.send('open-search-config'); }}
                   style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}
                 >
                   <Globe size={14} /> 联网配置
                 </div>
                 <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '6px 4px' }} />
                 <div
                   className="menu-item"
                   onClick={() => { setActiveMenu(null); window.api.app.openWechatConfig(); }}
                   style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}
                 >
                   <Sparkles size={14} /> 微信公众号配置
                 </div>
                 <div
                   className="menu-item"
                   onClick={() => { setActiveMenu(null); window.api.app.openImageConfig(); }}
                   style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}
                 >
                   <Image size={14} /> 图片生成配置
                 </div>
               </div>
            </>
          )}
        </div>

        {/* 帮助菜单 */}
        <div style={{ position: 'relative' }}>
          <button 
            className="menu-trigger" 
            onClick={() => setActiveMenu(activeMenu === 'help' ? null : 'help')}
            style={{ 
              background: 'none', border: 'none', color: 'var(--text-secondary)', padding: '6px 12px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500, transition: 'background 0.2s', WebkitAppRegion: 'no-drag'
            } as React.CSSProperties}
          >
            帮助
            {hasUpdate && <div className="notification-dot" />}
          </button>
          {activeMenu === 'help' && (
            <>
              <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 999 }} onClick={() => setActiveMenu(null)} />
              <div className="dropdown-menu" style={{ 
                position: 'absolute', top: 36, left: 0, backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 10, boxShadow: '0 10px 40px rgba(0,0,0,0.12)', zIndex: 1000, minWidth: 180, padding: 6, backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)'
              }}>
                <div className="menu-item" onClick={() => { setActiveMenu(null); window.api.events.send('open-shortcuts'); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                  <Layout size={14} /> 快捷键 <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⌘/</span>
                </div>
                <div className="menu-item" onClick={() => { setActiveMenu(null); checkUpdates(); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                  <RotateCw size={14} /> 检查更新
                  {hasUpdate && <div className="notification-dot" />}
                </div>
                <div className="menu-item" onClick={() => { setActiveMenu(null); window.api.app.openSettings(); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                  <Settings size={14} /> 设置
                </div>
                <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '6px 4px' }}></div>
                <div className="menu-item" onClick={() => { setActiveMenu(null); window.api.events.send('open-about'); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6 }}>
                  <Layout size={14} /> 关于
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 标签页区域 */}
      <div 
        ref={tabsRef} 
        className="titlebar-tabs" 
        style={{ flex: 1, marginLeft: 20, display: 'flex', alignItems: 'flex-end', height: '100%' } as React.CSSProperties}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div 
              key={tab.id}
              className={`titlebar-tab ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <FileCode size={14} color={isActive ? 'var(--color-accent-indigo)' : 'var(--text-muted)'} />
              <span className="tab-title">
                {tab.title}
              </span>
              <div 
                className="close-tab-icon"
                onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}
                style={{ marginLeft: 'auto', opacity: 0.6, cursor: 'pointer', pointerEvents: 'auto', display: 'flex', alignItems: 'center' }}
              >
                <X size={12} />
              </div>
            </div>
          );
        })}
      </div>

      {/* AI 助手切换按钮 */}
      <button
        onClick={toggleAIPanel}
        title={aiPanelVisible ? '隐藏 AI 助手' : '显示 AI 助手'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 8, border: 'none',
          background: aiPanelVisible ? 'var(--brand-gradient)' : 'none',
          color: aiPanelVisible ? '#fff' : 'var(--text-muted)',
          cursor: 'pointer', flexShrink: 0, marginRight: 8,
          boxShadow: aiPanelVisible ? '0 2px 8px var(--brand-shadow)' : 'none',
          transition: 'all 0.2s',
          WebkitAppRegion: 'no-drag',
        } as React.CSSProperties}
      >
        <Sparkles size={15} />
      </button>

      {/* Windows 窗口控制按钮 */}
      {!isMac && (
        <div className="window-controls">
          <button 
            className="window-control-btn minimize" 
            onClick={() => window.api.app.minimize()}
            title="最小化"
          >
            <Minus size={14} />
          </button>
          <button 
            className="window-control-btn maximize" 
            onClick={() => window.api.app.maximize()}
            title="最大化/还原"
          >
            <Square size={12} />
          </button>
          <button 
            className="window-control-btn close" 
            onClick={() => window.api.app.close()}
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </header>
  );
};
