import React, { useState } from 'react';
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
  RotateCw
} from 'lucide-react';
import { markdownToHtml } from '../../utils/markdown';

export const TitleBar: React.FC = () => {
  const { 
    tabs, 
    activeTabId, 
    setActiveTab, 
    closeTab, 
    toggleSidebar, 
    toggleToolbar, 
    toggleStatusBar,
    createNewFile,
    sidebarVisible,
    toolbarVisible,
    statusBarVisible,
    openFile,
    openDirectory,
    saveActiveFile,
    refreshWorkspace
  } = useAppStore();

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <header className="titlebar" style={{ gap: 0, paddingRight: 0 }}>
      {/* 交通灯区域占位 */}
      <div className="titlebar-traffic-lights" style={{ width: 80, flexShrink: 0 }}></div>
      
      {/* 菜单区域 */}
      <div className="titlebar-menus" style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 } as React.CSSProperties}>
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
                <div className="menu-item" onClick={async () => { if (activeTab) await window.api.export.word(markdownToHtml(activeTab.content), activeTab.title); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6, opacity: activeTab ? 1 : 0.4 }}>
                  <FileDown size={14} /> 导出为 Word (.docx)
                </div>
                <div className="menu-item" onClick={async () => { if (activeTab) await window.api.export.pdf(markdownToHtml(activeTab.content), activeTab.title); setActiveMenu(null); }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 6, opacity: activeTab ? 1 : 0.4 }}>
                  <FileDown size={14} /> 导出为 PDF
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
                  <SidebarIcon size={14} /> {sidebarVisible ? '隐藏侧边栏' : '显示侧边栏'} <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⌘B</span>
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
                <div className="menu-item disabled" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 13, cursor: 'not-allowed', borderRadius: 6, opacity: 0.4 }}>
                  <Layout size={14} /> 模型配置 <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 11 }}>⇧⌘M</span>
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
      <div className="titlebar-tabs" style={{ flex: 1, marginLeft: 20, overflowX: 'auto', display: 'flex', alignItems: 'flex-end', height: '100%' } as React.CSSProperties}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div 
              key={tab.id}
              className={`titlebar-tab ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={{ 
                minWidth: 100, maxWidth: 200, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 32, borderBottom: isActive ? 'none' : '1px solid var(--border-subtle)', transition: 'all 0.2s', WebkitAppRegion: 'no-drag'
              } as React.CSSProperties}
            >
              <FileCode size={14} color={isActive ? 'var(--color-accent-indigo)' : 'var(--text-muted)'} />
              <span style={{ 
                fontSize: 12, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isActive ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {tab.title}
              </span>
              <div 
                className="close-tab-icon"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                style={{ marginLeft: 'auto', opacity: 0.6, cursor: 'pointer', pointerEvents: 'auto' }}
              >
                <X size={12} />
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ width: 40, flexShrink: 0 }}></div>
    </header>
  );
};
