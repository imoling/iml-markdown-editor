import React from 'react';
import { useAppStore } from '../../stores/appStore';

export const StatusBar: React.FC = () => {
  const { mode, toggleMode, activeTabId, tabs, statusBarVisible } = useAppStore();
  const activeTab = tabs.find(t => t.id === activeTabId);

  if (!statusBarVisible) return null;

  // Robust statistics calculation for multi-language (Western + CJK)
  const getStats = () => {
    if (!activeTab) return null;
    const content = activeTab.content || '';
    
    // Count CJK characters (Chinese, Japanese, Korean)
    const cjkMatch = content.match(/[\u4e00-\u9fa5\u3040-\u30ff\uff00-\uffef\u1100-\u11ff\u3130-\u318f\ua4d0-\ua4ff\uac00-\ud7af]/g);
    const cjkCount = cjkMatch ? cjkMatch.length : 0;
    
    // Remove CJK and then count Western words
    const nonCjkContent = content.replace(/[\u4e00-\u9fa5\u3040-\u30ff\uff00-\uffef\u1100-\u11ff\u3130-\u318f\ua4d0-\ua4ff\uac00-\ud7af]/g, ' ');
    const westernWords = nonCjkContent.trim() ? nonCjkContent.trim().split(/\s+/).length : 0;
    
    const words = cjkCount + westernWords;
    const lines = content.split('\n').length;
    return { words, lines };
  };

  const stats = getStats();

  return (
    <footer className="statusbar" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      height: 32,
      borderTop: '1px solid var(--border-subtle)',
      backgroundColor: 'var(--bg-page)',
      fontSize: 11,
      color: 'var(--text-secondary)',
      userSelect: 'none'
    }}>
      <div className="statusbar-section" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--color-accent-green)', boxShadow: '0 0 8px var(--color-accent-green)' }}></div>
          <span style={{ fontWeight: 600, letterSpacing: '0.02em' }}>VIBE CODING</span>
        </div>
        <div className="toolbar-divider" style={{ height: 12, margin: '0 4px' }}></div>
        {stats ? (
          <div style={{ display: 'flex', gap: 12, opacity: 0.8 }}>
            <span>{stats.words.toLocaleString()} 字</span>
            <span>{stats.lines} 行</span>
          </div>
        ) : (
          <span style={{ opacity: 0.5 }}>已就绪</span>
        )}
      </div>
      
      <div className="statusbar-section" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ opacity: 0.7 }}>UTF-8</span>
        <div 
          className={`mode-indicator ${mode}`} 
          onClick={toggleMode}
          style={{ 
            cursor: 'pointer', 
            padding: '2px 8px',
            borderRadius: '4px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            transition: 'all 0.2s',
            fontWeight: 500,
            color: 'var(--text-primary)'
          }}
          title="点击切换编辑模式"
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'var(--color-accent-indigo)';
            e.currentTarget.style.backgroundColor = 'rgba(0, 122, 255, 0.05)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)';
            e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
          }}
        >
          {mode === 'word' ? '富文本' : 'MARKDOWN'}
        </div>
      </div>
    </footer>
  );
};
