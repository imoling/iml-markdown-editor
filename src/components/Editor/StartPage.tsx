import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Plus, FolderOpen, FileText, Settings, Clock, Star } from 'lucide-react';

export const StartPage: React.FC = () => {
  const { createNewFile, openDirectory, openFile, setSettingsModalOpen, recentFiles, starredFiles, openTab } = useAppStore();
  const [timeGreeting, setTimeGreeting] = useState('');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 6) setTimeGreeting('夜深了');
    else if (hour < 12) setTimeGreeting('早上好');
    else if (hour < 14) setTimeGreeting('中午好');
    else if (hour < 18) setTimeGreeting('下午好');
    else setTimeGreeting('晚上好');
  }, []);

  const handleOpenPath = async (path: string) => {
    const result = await window.api.fs.readFile(path);
    if (result.success && result.content !== undefined) {
      openTab({
        id: path,
        title: path.split(/[/\\]/).pop() || 'Unknown',
        content: result.content,
        isDirty: false,
        mode: 'word'
      });
    }
  };

  const ActionButton = ({ icon: Icon, label, hotkey, onClick }: any) => (
    <div 
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px', borderRadius: '16px', cursor: 'pointer',
        backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)', transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        gap: '12px'
      }}
      className="start-page-action"
    >
      <div style={{ 
        width: 48, height: 48, borderRadius: 24, backgroundColor: 'var(--bg-surface)', 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--color-brand-indigo)', boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
      }}>
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{hotkey}</div>
      </div>
    </div>
  );

  return (
    <div style={{ 
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px', position: 'relative', overflow: 'hidden', height: '100%',
      backgroundColor: 'var(--bg-page)',
      background: 'radial-gradient(circle at 50% 0%, var(--brand-shadow) 0%, transparent 40%)'
    }}>
      {/* 动态背景装饰 */}
      <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: '40vw', height: '40vw', background: 'var(--color-brand-indigo)', opacity: 0.03, filter: 'blur(100px)', borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: '30vw', height: '30vw', background: 'var(--color-brand-purple)', opacity: 0.03, filter: 'blur(100px)', borderRadius: '50%', pointerEvents: 'none' }} />

      <div style={{ zIndex: 1, width: '100%', maxWidth: 760, animation: 'fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: '0 0 12px 0' }}>
            {timeGreeting}，欢迎来到 <span style={{ background: 'var(--brand-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>iML Markdown Editor</span>
          </h1>
          <p style={{ fontSize: 15, color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span><span style={{ color: 'var(--color-brand-indigo)', fontWeight: 600 }}>AI 时代</span>的敏捷知识编辑中枢</span>
            <span style={{ fontSize: 12, fontWeight: 600, padding: '1px 6px', borderRadius: 8, backgroundColor: 'var(--bg-code-inline)', color: 'var(--color-brand-indigo)', border: '1px solid var(--brand-shadow)', display: 'inline-flex', alignItems: 'center', height: 18 }}>v{window.api?.appVersion || '1.7.0'}</span>
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 48 }}>
          <ActionButton icon={Plus} label="新建文档" hotkey="Cmd + N" onClick={createNewFile} />
          <ActionButton icon={FolderOpen} label="打开工作区" hotkey="Shift + Cmd + O" onClick={openDirectory} />
          <ActionButton icon={FileText} label="打开单文件" hotkey="Cmd + O" onClick={openFile} />
          <ActionButton icon={Settings} label="全局设置" hotkey="Cmd + ," onClick={() => setSettingsModalOpen(true)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* 近期文件 */}
          <div style={{ backgroundColor: 'var(--bg-elevated)', borderRadius: 16, padding: 20, border: '1px solid var(--border-subtle)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
              <Clock size={16} /> <span>近期打开</span>
            </div>
            {recentFiles.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {recentFiles.slice(0, 5).map(path => (
                  <div key={`recent-${path}`} className="start-page-list-item" onClick={() => handleOpenPath(path)} title={path}>
                    <FileText size={14} color="var(--text-muted)" />
                    <span className="truncate">{path.split(/[/\\]/).pop()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center', backgroundColor: 'var(--bg-surface)', borderRadius: 8 }}>暂无近期文件记录</div>
            )}
          </div>

          {/* 收藏文件 */}
          <div style={{ backgroundColor: 'var(--bg-elevated)', borderRadius: 16, padding: 20, border: '1px solid var(--border-subtle)', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--text-primary)', fontWeight: 600, fontSize: 14 }}>
              <Star size={16} color="#f59e0b" fill="#f59e0b" /> <span>核心收藏</span>
            </div>
            {starredFiles.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {starredFiles.slice(0, 5).map(path => (
                  <div key={`starred-${path}`} className="start-page-list-item" onClick={() => handleOpenPath(path)} title={path}>
                    <Star size={14} color="#f59e0b" />
                    <span className="truncate">{path.split(/[/\\]/).pop()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px 0', textAlign: 'center', backgroundColor: 'var(--bg-surface)', borderRadius: 8 }}>暂无收藏文件，可在侧边栏星标</div>
            )}
          </div>
        </div>
      </div>
      
      <style>{`
        .start-page-action:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px var(--brand-shadow);
          border-color: var(--color-brand-indigo);
        }
        .start-page-list-item {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 10px; border-radius: 6px;
          cursor: pointer; transition: all 0.2s;
          font-size: 13px; color: var(--text-secondary);
        }
        .start-page-list-item:hover {
          background-color: var(--bg-hover-editor);
          color: var(--text-primary);
        }
        .truncate {
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
