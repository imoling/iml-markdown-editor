import React, { useEffect } from 'react';
import { TitleBar } from './components/TitleBar/TitleBar';
import { Sidebar, ActivityBar, RightPanel } from './components/Sidebar/Sidebar';
import { EditorArea } from './components/Editor/EditorArea';
import { StatusBar } from './components/StatusBar/StatusBar';
import { useAppStore } from './stores/appStore';
import { extractHeadings } from './utils/outline';
import { ConfirmDialog } from './components/ConfirmDialog';
import { SettingsModal } from './components/Settings/SettingsModal';
import { WechatConfigModal } from './components/AI/WechatConfigModal';
import { ImageConfigModal } from './components/AI/ImageConfigModal';
import './styles/layout.css';

const App: React.FC = () => {
  const { 
    toggleMode, 
    activeTabId, 
    tabs,
    sidebarVisible,
    aiPanelVisible,
    statusBarVisible,
    setOutline,
    toggleSidebar,
    toggleToolbar,
    toggleStatusBar,
    toggleAIPanel,
    createNewFile,
    toggleFind,
    toggleReplace,
    openFile,
    openFileByPath,
    openDirectory,
    saveActiveFile,
    tabToClose,
    setTabToClose,
    closeTab,
    setActiveTab,
    autoCheckUpdates,
    theme,
    setTheme,
    loadSession,
    loadSettings,
    appearanceMode,
    applyAppearance,
  } = useAppStore();

  const activeTab = tabs.find(t => t.id === activeTabId);

  // Update outline when active tab content changes
  useEffect(() => {
    if (activeTab) {
      const headings = extractHeadings(activeTab.content);
      setOutline(headings);
    } else {
      setOutline([]);
    }
  }, [activeTab?.content, setOutline]);

  const handleConfirmSave = async () => {
    if (!tabToClose) return;
    const currentActiveId = activeTabId;
    
    // If it's not the active tab, we need to switch to it to save
    if (currentActiveId !== tabToClose) {
      setActiveTab(tabToClose);
    }
    
    const saved = await saveActiveFile();
    if (saved) {
      closeTab(tabToClose);
      setTabToClose(null);
    }
  };

  useEffect(() => {
    const isMac = window.api.app.platform === 'darwin';
    const handleKeyDown = async (e: KeyboardEvent) => {
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      
      // Cmd+E to toggle mode
      if (modKey && e.key === 'e') {
        e.preventDefault();
        toggleMode();
      }

      // Cmd+\ to toggle sidebar
      if (modKey && e.key === '\\') {
        e.preventDefault();
        toggleSidebar();
      }

      // Cmd+N to create new file
      if (modKey && e.key === 'n') {
        e.preventDefault();
        createNewFile();
      }

      // Cmd+F to toggle find
      if (modKey && e.key === 'f') {
        e.preventDefault();
        toggleFind();
      }

      // Cmd+H to toggle replace
      if (modKey && e.key === 'h') {
        e.preventDefault();
        toggleReplace();
      }
      
      // Cmd+Shift+O to open directory
      if (modKey && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openDirectory();
        return;
      }
      
      // Cmd+O to open file (or Ctrl+O on Mac if user specifically expects it)
      if ((modKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openFile();
      }

      // Cmd+, to open settings
      if (modKey && e.key === ',') {
        e.preventDefault();
        useAppStore.getState().setSettingsModalOpen(true);
      }

      // Cmd+/ to open shortcuts
      if (modKey && e.key === '/') {
        e.preventDefault();
        window.api.events.send('open-shortcuts');
      }
      
      // Cmd+S or Cmd+Shift+S to save file
      if (modKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveActiveFile(e.shiftKey);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleMode, openFile, openDirectory, saveActiveFile, toggleSidebar, toggleToolbar, toggleStatusBar, createNewFile, toggleFind, toggleReplace]);

  // 监听主进程发来的 open-file（macOS 双击或"打开方式"）
  useEffect(() => {
    window.api.events.on('open-file', (filePath: string) => {
      openFileByPath(filePath);
    });
    window.api.events.on('menu:new-file', () => createNewFile());
    window.api.events.on('menu:open-file', () => openFile());
    window.api.events.on('menu:save', () => saveActiveFile());
    window.api.events.on('menu:open-wechat-config', () => useAppStore.getState().setWechatConfigOpen(true));
    window.api.events.on('menu:open-image-config', () => useAppStore.getState().setImageConfigOpen(true));
  }, [openFileByPath, createNewFile, openFile, saveActiveFile]);

  // Handle auto-update check on mount
  useEffect(() => {
    // Only auto-check after a short delay to not block initial rendering and show it as a premium background task
    const timer = setTimeout(() => {
      autoCheckUpdates();
    }, 3000);
    return () => clearTimeout(timer);
  }, [autoCheckUpdates]);

  // Apply theme on mount and load session & settings
  useEffect(() => {
    setTheme(theme.id);
    const init = async () => {
      await loadSettings();
      if (useAppStore.getState().startupBehavior === 'restore') {
        await loadSession();
      }
    };
    init();
  }, []);

  // Listen for system theme changes
  useEffect(() => {
    if (appearanceMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyAppearance('system');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [appearanceMode, applyAppearance]);

  return (
    <div className="app-layout" id="app">
      <TitleBar />
      
      <div className="main-content">
        <ActivityBar />
        {sidebarVisible && <Sidebar />}
        <EditorArea />
        {aiPanelVisible && <RightPanel />}
      </div>
      
      {statusBarVisible && <StatusBar />}

      {tabToClose && (
        <ConfirmDialog
          title="保存更改？"
          message={`文件 "${tabs.find(t => t.id === tabToClose)?.title}" 已修改，是否在关闭前保存？`}
          onConfirm={handleConfirmSave}
          onDiscard={() => {
            closeTab(tabToClose);
            setTabToClose(null);
          }}
          onCancel={() => setTabToClose(null)}
        />
      )}

      {/* 检查更新状态弹窗 */}
      {useAppStore.getState().updateStatus.show && (
        <UpdateModal />
      )}

      {/* 全局设置弹窗 */}
      <SettingsModal />

      {/* 微信公众号配置弹窗 */}
      {useAppStore((s) => s.isWechatConfigOpen) && (
        <WechatConfigModal onClose={() => useAppStore.getState().setWechatConfigOpen(false)} />
      )}

      {/* 封面图配置弹窗 */}
      {useAppStore((s) => s.isImageConfigOpen) && (
        <ImageConfigModal onClose={() => useAppStore.getState().setImageConfigOpen(false)} />
      )}
    </div>
  );
};

// 提取 UpdateModal 组件以保持 App 组件整洁
import { RotateCw, X, Layout } from 'lucide-react';

const UpdateModal: React.FC = () => {
  const { updateStatus, setUpdateStatus } = useAppStore();
  
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000,
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-elevated)', padding: 32, borderRadius: 24,
        width: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
        boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)',
        animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        {updateStatus.loading ? (
          <>
            <RotateCw size={32} className="animate-spin" color="var(--color-accent-indigo)" />
            <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: 0 }}>正在检查更新...</p>
          </>
        ) : updateStatus.error ? (
          <>
            <X size={32} color="var(--color-accent-coral)" />
            <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: 0 }}>{updateStatus.error}</p>
            <button 
              onClick={() => setUpdateStatus({ ...updateStatus, show: false })}
              style={{ 
                marginTop: 8, padding: '10px 24px', borderRadius: 12, border: 'none',
                backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 13, fontWeight: 500
              }}
            >
              关闭
            </button>
          </>
        ) : (() => {
            const current = window.api.appVersion || '1.6.0';
            const hasUpdate = updateStatus.latestVersion && updateStatus.latestVersion !== current;
            return (
              <>
                <Layout size={32} color={hasUpdate ? "var(--color-accent-indigo)" : "var(--text-muted)"} />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ fontSize: 16, fontWeight: 600, margin: '0 0 4px 0' }}>
                    {hasUpdate ? '发现新版本！' : '已是最新版本'}
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                    {hasUpdate 
                      ? `最新版本: v${updateStatus.latestVersion} (当前: v${current})` 
                      : `当前版本 v${current} 已是最新`}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 12, width: '100%', marginTop: 8 }}>
                  <button 
                    onClick={() => setUpdateStatus({ ...updateStatus, show: false })}
                    style={{ 
                      flex: 1, padding: '10px', borderRadius: 12, border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)',
                      cursor: 'pointer', fontSize: 13, fontWeight: 500
                    }}
                  >
                    关闭
                  </button>
                  {hasUpdate && (
                    <button 
                      onClick={() => {
                        setUpdateStatus({ ...updateStatus, show: false });
                        window.api.shell.openExternal('https://github.com/imoling/iml-markdown-editor/releases');
                      }}
                      style={{ 
                        flex: 1, padding: '10px', borderRadius: 12, border: 'none',
                        backgroundColor: 'var(--color-accent-indigo)', color: 'white',
                        cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        boxShadow: '0 4px 12px var(--brand-glow)'
                      }}
                    >
                      前往下载
                    </button>
                  )}
                </div>
              </>
            );
        })()}
      </div>
    </div>
  );
};

export default App;
