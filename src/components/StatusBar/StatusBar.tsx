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
    <footer className="statusbar">
      <div className="statusbar-section">
        {stats ? (
          <>
            <span>{stats.words.toLocaleString()} 字</span>
            <span>共 {stats.lines} 行</span>
          </>
        ) : (
          <span style={{ opacity: 0.5 }}>未选择文档</span>
        )}
      </div>
      
      <div className="statusbar-section">
        <span>UTF-8</span>
        <span 
          className={`mode-indicator ${mode}`} 
          onClick={toggleMode}
          style={{ cursor: 'pointer', userSelect: 'none' }}
          title="点击切换编辑模式"
        >
          {mode === 'word' ? '富文本模式' : 'MD 预览模式'}
        </span>
      </div>
    </footer>
  );
};
