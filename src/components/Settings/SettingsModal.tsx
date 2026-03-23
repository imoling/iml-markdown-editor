import React from 'react';
import { X, Moon, Sun, Monitor, FolderOpen } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';

export const SettingsModal: React.FC = () => {
  const { 
    isSettingsModalOpen, 
    setSettingsModalOpen,
    appearanceMode,
    setAppearanceMode,
    defaultWorkspacePath,
    setDefaultWorkspacePath
  } = useAppStore();

  if (!isSettingsModalOpen) return null;

  const handleSelectDirectory = async () => {
    const result = await window.api.dialog.open({
      properties: ['openDirectory']
    });
    if (result && result.length > 0) {
      setDefaultWorkspacePath(result[0]);
    }
  };

  return (
    <div 
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: 20,
        animation: 'fadeIn 0.3s ease-out',
      }}
      onClick={() => setSettingsModalOpen(false)}
    >
      <div 
        className="modal-content"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderRadius: 24,
          padding: 32,
          width: 480,
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.25)',
          border: '1px solid var(--border-subtle)',
          position: 'relative',
          animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>全局设置</h2>
          <button 
            onClick={() => setSettingsModalOpen(false)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* 外观设置 */}
          <section>
            <h3 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, fontWeight: 500 }}>外观界面</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(3, 1fr)', 
              gap: 12,
              backgroundColor: 'var(--bg-card)',
              padding: 6,
              borderRadius: 12,
              border: '1px solid var(--border-subtle)'
            }}>
              {[
                { id: 'light', name: '亮色', icon: Sun },
                { id: 'dark', name: '深色', icon: Moon },
                { id: 'system', name: '跟随系统', icon: Monitor }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setAppearanceMode(item.id as any)}
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
                    backgroundColor: appearanceMode === item.id ? 'var(--color-brand-indigo)' : 'transparent',
                    color: appearanceMode === item.id ? 'white' : 'var(--text-secondary)'
                  }}
                >
                  <item.icon size={18} />
                  <span style={{ fontSize: 12, fontWeight: 500 }}>{item.name}</span>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>默认工作目录</span>
                  <button 
                    onClick={handleSelectDirectory}
                    style={{ 
                      fontSize: 12, 
                      color: 'var(--color-brand-indigo)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px 8px',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <FolderOpen size={14} /> 选择
                  </button>
                </div>
                <div style={{ 
                  fontSize: 12, 
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--bg-elevated)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  wordBreak: 'break-all',
                  minHeight: 32,
                  display: 'flex',
                  alignItems: 'center'
                }}>
                  {defaultWorkspacePath || '未设置 (保持当前)'}
                </div>
                {defaultWorkspacePath && (
                  <button 
                    onClick={() => setDefaultWorkspacePath(null)}
                    style={{ alignSelf: 'flex-end', fontSize: 11, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    清除重置
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>

        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>偏好设置将自动保存并持久化存储</p>
        </div>
      </div>
    </div>
  );
};
