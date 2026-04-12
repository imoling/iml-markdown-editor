import React, { useState, useEffect } from 'react';
import { X, Moon, Sun, Monitor, Palette, Power, Save, Trash2, AlertTriangle, FolderOpen, Coffee } from 'lucide-react';
import { useAppStore, THEME_PRESETS } from '../../stores/appStore';

export const SettingsModal: React.FC = () => {
  const isStandalone = new URLSearchParams(window.location.search).get('window') === 'settings';
  const isMac = window.api.app.platform === 'darwin';

  const {
    isSettingsModalOpen,
    setSettingsModalOpen,
    appearanceMode: storeAppearanceMode,
    setAppearanceMode,
    startupBehavior: storeStartupBehavior,
    setStartupBehavior,
    autoSave: storeAutoSave,
    setAutoSave,
    defaultLibraryPath: storeDefaultLibraryPath,
    setDefaultLibraryPath,
    theme: storeTheme,
    setTheme,
    applyAppearance,
  } = useAppStore();

  // Local state for standalone mode (buffered — not auto-saved)
  const [localSettings, setLocalSettings] = useState({
    appearanceMode: 'light' as string,
    startupBehavior: 'restore' as string,
    autoSave: true,
    defaultLibraryPath: '',
    themeId: 'default',
  });

  // Load from disk on mount in standalone mode
  useEffect(() => {
    if (isStandalone) {
      window.api.app.getSettings().then((settings: any) => {
        if (settings) {
          setLocalSettings({
            appearanceMode: settings.appearanceMode || 'light',
            startupBehavior: settings.startupBehavior || 'restore',
            autoSave: settings.autoSave ?? true,
            defaultLibraryPath: settings.defaultLibraryPath || '',
            themeId: settings.themeId || 'default',
          });
          // Apply preview
          applyAppearance(settings.appearanceMode || 'light');
          setTheme(settings.themeId || 'default');
        }
      });
    }
  }, [isStandalone]);

  if (!isStandalone && !isSettingsModalOpen) return null;

  const handleClose = isStandalone ? () => window.close() : () => setSettingsModalOpen(false);

  // Getter aliases
  const currentAppearanceMode = isStandalone ? localSettings.appearanceMode : storeAppearanceMode;
  const currentStartupBehavior = isStandalone ? localSettings.startupBehavior : storeStartupBehavior;
  const currentAutoSave = isStandalone ? localSettings.autoSave : storeAutoSave;
  const currentDefaultLibraryPath = isStandalone ? localSettings.defaultLibraryPath : storeDefaultLibraryPath;
  const currentThemeId = isStandalone ? localSettings.themeId : storeTheme.id;
  const currentTheme = THEME_PRESETS.find(p => p.id === currentThemeId) || THEME_PRESETS[0];

  // Setter aliases
  const handleSetAppearanceMode = (mode: string) => {
    if (isStandalone) {
      const next = { ...localSettings, appearanceMode: mode };
      setLocalSettings(next);
      applyAppearance(mode as any); // preview in settings window
      window.api.app.previewSettings(next); // preview in main window
    } else {
      setAppearanceMode(mode as any);
    }
  };

  const handleSetStartupBehavior = (behavior: string) => {
    if (isStandalone) {
      setLocalSettings(s => ({ ...s, startupBehavior: behavior }));
    } else {
      setStartupBehavior(behavior as any);
    }
  };

  const handleSetAutoSave = (val: boolean) => {
    if (isStandalone) {
      setLocalSettings(s => ({ ...s, autoSave: val }));
    } else {
      setAutoSave(val);
    }
  };

  const handleSetDefaultLibraryPath = (path: string) => {
    if (isStandalone) {
      setLocalSettings(s => ({ ...s, defaultLibraryPath: path }));
    } else {
      setDefaultLibraryPath(path);
    }
  };

  const handleSetTheme = (themeId: string) => {
    if (isStandalone) {
      const next = { ...localSettings, themeId };
      setLocalSettings(next);
      setTheme(themeId); // preview CSS in settings window
      window.api.app.previewSettings(next); // preview in main window
    } else {
      setTheme(themeId);
    }
  };

  const handleSelectLibrary = async () => {
    const result = await window.api.dialog.open({
      properties: ['openDirectory']
    });
    if (result && result.length > 0) {
      handleSetDefaultLibraryPath(result[0]);
    }
  };

  const handleClearSession = () => {
    if (window.confirm('警告：此操作将彻底抹除当前一切会话现场（包括您的星标状态与记忆目录）。\\n点击确认后系统将会立即重载。确定要继续吗？')) {
      localStorage.removeItem('iml_session');
      window.location.reload();
    }
  };

  const handleSave = async () => {
    await window.api.app.saveSettings({
      appearanceMode: localSettings.appearanceMode,
      startupBehavior: localSettings.startupBehavior,
      autoSave: localSettings.autoSave,
      defaultLibraryPath: localSettings.defaultLibraryPath,
      themeId: localSettings.themeId,
    });
    window.close();
  };

  const handleCancel = () => {
    window.api.app.revertSettings(); // 通知主窗口从磁盘恢复
    window.close();
  };

  const containerStyle: React.CSSProperties = isStandalone
    ? { height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: 'transparent', overflow: 'hidden' }
    : { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000 };

  const cardStyle: React.CSSProperties = isStandalone
    ? { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { backgroundColor: 'var(--bg-elevated)', borderRadius: 24, padding: 32, width: 480, maxHeight: '100%', overflowY: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.25)', border: '1px solid var(--border-subtle)', position: 'relative' };

  return (
    <div
      style={containerStyle}
      onClick={e => { if (!isStandalone && e.target === e.currentTarget) handleClose(); }}
    >
      {isStandalone && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, WebkitAppRegion: 'drag', zIndex: 10 } as any} />
      )}
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        {/* 可滚动内容区 */}
        <div style={isStandalone
          ? { flex: 1, overflowY: 'auto', padding: '40px 32px 24px' }
          : {}
        }>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, position: 'relative' }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>全局设置</h2>
          {(!isStandalone || !isMac) && (
            <button
              onClick={handleClose}
              style={{ position: 'absolute', top: -4, right: -4, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 外观设置 */}
          <section>
            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 500 }}>外观界面</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              backgroundColor: 'var(--bg-card)',
              padding: 6,
              borderRadius: 12,
              border: '1px solid var(--border-subtle)'
            }}>
              {[
                { id: 'system', name: '系统', icon: Monitor },
                { id: 'light', name: '亮色', icon: Sun },
                { id: 'dark', name: '深色', icon: Moon },
                { id: 'eye-protection', name: '护眼', icon: Coffee }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleSetAppearanceMode(item.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                    padding: '12px 8px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    backgroundColor: currentAppearanceMode === item.id ? 'var(--color-brand-indigo)' : 'transparent',
                    color: currentAppearanceMode === item.id ? 'white' : 'var(--text-secondary)'
                  }}
                >
                  <item.icon size={18} />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{item.name}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 主题配色 */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <Palette size={14} color="var(--text-muted)" />
                <h3 style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>品牌主题</h3>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
              backgroundColor: 'var(--bg-card)',
              padding: 8,
              borderRadius: 14,
              border: '1px solid var(--border-subtle)'
            }}>
              {THEME_PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSetTheme(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid ' + (currentThemeId === p.id ? 'var(--color-brand-indigo)' : 'transparent'),
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    backgroundColor: currentThemeId === p.id ? 'var(--bg-elevated)' : 'transparent',
                    color: currentThemeId === p.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: currentThemeId === p.id ? '0 4px 12px rgba(0,0,0,0.05)' : 'none'
                  }}
                >
                  <div style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: p.gradient,
                    boxShadow: currentThemeId === p.id ? `0 0 10px ${p.shadow}` : 'none',
                    border: '2px solid white'
                  }} />
                  <span style={{ fontSize: 12, fontWeight: currentThemeId === p.id ? 600 : 400 }}>{p.name}</span>
                </button>
              ))}
            </div>
          </section>

          {/* 常规设置 */}
          <section>
            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 500 }}>常规选项</h3>
            <div style={{
              backgroundColor: 'var(--bg-card)',
              padding: 16,
              borderRadius: 12,
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16
            }}>

              {/* 启动行为 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Power size={18} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>启动行为</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>每次打开知识库时呈现的画面</div>
                  </div>
                </div>
                <div style={{ display: 'flex', backgroundColor: 'var(--bg-elevated)', borderRadius: 8, padding: 4, border: '1px solid var(--border-subtle)' }}>
                  <button
                    onClick={() => handleSetStartupBehavior('restore')}
                    style={{
                      padding: '4px 12px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
                      backgroundColor: currentStartupBehavior === 'restore' ? 'var(--color-brand-indigo)' : 'transparent',
                      color: currentStartupBehavior === 'restore' ? 'white' : 'var(--text-secondary)',
                      transition: 'all 0.2s'
                    }}
                  >
                    恢复上次会话
                  </button>
                  <button
                    onClick={() => handleSetStartupBehavior('dashboard')}
                    style={{
                      padding: '4px 12px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
                      backgroundColor: currentStartupBehavior === 'dashboard' ? 'var(--color-brand-indigo)' : 'transparent',
                      color: currentStartupBehavior === 'dashboard' ? 'white' : 'var(--text-secondary)',
                      transition: 'all 0.2s'
                    }}
                  >
                    起始控制台
                  </button>
                </div>
              </div>

              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)' }} />

              {/* 自动保存 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Save size={18} color="var(--text-muted)" />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>静默自动保存</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>核心防线：编辑器框体失焦时进行隐式无感存盘</div>
                  </div>
                </div>
                <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
                  <input type="checkbox" checked={currentAutoSave} onChange={(e) => handleSetAutoSave(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{
                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: currentAutoSave ? 'var(--color-brand-indigo)' : 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)', borderRadius: 20, transition: '0.2s'
                  }}>
                    <span style={{
                      position: 'absolute', height: 14, width: 14, left: currentAutoSave ? 18 : 2, bottom: 2,
                      backgroundColor: 'white', borderRadius: '50%', transition: '0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }} />
                  </span>
                </label>
              </div>

              {currentAutoSave && (
                <>
                  <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', marginLeft: 34 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 34 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>新文档静默存放库</span>
                      <button
                        onClick={handleSelectLibrary}
                        style={{
                          fontSize: 11, color: 'var(--color-brand-indigo)',
                          background: 'none', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4
                        }}
                      >
                        <FolderOpen size={12} /> 更改目录
                      </button>
                    </div>
                    <div style={{
                      fontSize: 11, color: 'var(--text-secondary)', backgroundColor: 'var(--bg-elevated)',
                      padding: '6px 10px', borderRadius: 6, wordBreak: 'break-all', display: 'flex', alignItems: 'center'
                    }}>
                      {currentDefaultLibraryPath || '未设置'}
                    </div>
                  </div>
                </>
              )}

            </div>
          </section>

          {/* 危险操作区 */}
          <section>
            <h3 style={{ fontSize: 13, color: '#ef4444', marginBottom: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} /> 安全逃生舱
            </h3>
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.05)',
              padding: 16,
              borderRadius: 12,
              border: '1px solid rgba(239, 68, 68, 0.2)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#ef4444' }}>销毁本地记忆快照</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>一键抹除全部现场，并让应用浴火重生。</div>
              </div>
              <button
                onClick={handleClearSession}
                style={{
                  padding: '6px 12px', fontSize: 12, backgroundColor: '#ef4444', color: 'white',
                  border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  fontWeight: 500, transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ef4444'}
              >
                <Trash2 size={14} /> 清除全部
              </button>
            </div>
          </section>
        </div>

        {!isStandalone && (
          <div style={{ marginTop: 32, textAlign: 'center' }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>偏好设置将自动保存并持久化存储</p>
          </div>
        )}
        </div>{/* end scrollable */}

        {/* 固定底部 footer（仅 standalone）*/}
        {isStandalone && (
          <div style={{
            padding: '16px 32px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-elevated)',
            display: 'flex',
            gap: 12,
          }}>
            <button
              onClick={handleSave}
              style={{
                flex: 1, padding: '12px', fontSize: 14, fontWeight: 600, borderRadius: 12,
                border: 'none', backgroundColor: 'var(--color-brand-indigo)',
                color: 'white', cursor: 'pointer',
                boxShadow: '0 4px 12px var(--brand-glow)',
              }}
            >
              保存
            </button>
            <button
              onClick={handleCancel}
              style={{
                padding: '12px 24px', fontSize: 14, fontWeight: 500, borderRadius: 12,
                border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
