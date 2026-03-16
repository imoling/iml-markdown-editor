import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Minus, Plus, Loader2, ChevronUp } from 'lucide-react';

export const StatusBar: React.FC = () => {
  const { mode, toggleMode, activeTabId, tabs, statusBarVisible, aiStatus, zoom, setZoom } = useAppStore();
  const [showZoomMenu, setShowZoomMenu] = React.useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeTab = tabs.find(t => t.id === activeTabId);
  
  const zoomOptions = [300, 200, 150, 125, 100, 75, 50, 25];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowZoomMenu(false);
      }
    };
    if (showZoomMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showZoomMenu]);

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
    <footer 
      className={`statusbar ${aiStatus.generating ? 'statusbar-ai' : ''}`}
      style={{
        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'visible'
      }}
    >
      {/* AI Generating Atmosphere Effect */}
      {aiStatus.generating && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, transparent 0%, rgba(147, 51, 234, 0.05) 50%, transparent 100%)',
          animation: 'shimmer 2s infinite linear',
          pointerEvents: 'none',
          zIndex: 0
        }} />
      )}

      <div className="statusbar-section" style={{ zIndex: 1 }}>
        {stats ? (
          <>
            <span>{stats.words.toLocaleString()} 字</span>
            <span>共 {stats.lines} 行</span>
          </>
        ) : (
          <span style={{ opacity: 0.5 }}>未选择文档</span>
        )}
      </div>

      {aiStatus.generating && (
        <div className="statusbar-section" style={{ 
          gap: 12, 
          zIndex: 1,
          animation: 'fadeIn 0.3s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-accent-indigo)' }}>
            <Loader2 size={13} className="animate-spin" />
            <span style={{ fontSize: '11px', fontWeight: 500 }}>AI 正在生成内容...</span>
          </div>
          <button 
            onClick={() => aiStatus.onStop?.()}
            style={{
              padding: '2px 10px',
              borderRadius: '4px',
              backgroundColor: 'var(--color-accent-coral)',
              color: 'white',
              border: 'none',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            停止
          </button>
        </div>
      )}
      
      <div className="statusbar-section" style={{ zIndex: 1, overflow: 'visible' }}>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .statusbar-ai {
            background-color: rgba(147, 51, 234, 0.02) !important;
            border-top: 1px solid rgba(147, 51, 234, 0.1) !important;
          }
          .zoom-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 10px;
            height: 10px;
            background: var(--color-accent-indigo);
            border-radius: 50%;
            cursor: pointer;
            border: 2px solid white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
          }
        ` }} />
        <span>UTF-8</span>
        
        <div 
          ref={menuRef}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            margin: '0 8px',
            position: 'relative',
            zIndex: 10
          }}
        >
          {showZoomMenu && (
            <div style={{
              position: 'absolute',
              bottom: 'calc(100% + 12px)',
              left: 0,
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              padding: '6px',
              minWidth: '110px',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              animation: 'fadeInUp 0.15s ease-out'
            }}>
              {zoomOptions.map(opt => (
                <button
                  key={opt}
                  onClick={() => {
                    setZoom(opt);
                    setShowZoomMenu(false);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: zoom === opt ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
                    color: zoom === opt ? 'var(--color-accent-indigo)' : 'var(--text-primary)',
                    fontSize: '11px',
                    fontWeight: zoom === opt ? 600 : 400,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    if (zoom !== opt) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (zoom !== opt) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  {opt}%
                  {zoom === opt && <div style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: 'currentColor' }} />}
                </button>
              ))}
            </div>
          )}

          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 4, 
              minWidth: '45px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              transition: 'all 0.2s',
              userSelect: 'none'
            }} 
            onClick={() => setShowZoomMenu(!showZoomMenu)}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            {zoom}%
            <ChevronUp size={10} style={{ opacity: 0.6, transform: showZoomMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button 
              onClick={() => setZoom(Math.max(10, zoom - 10))}
              title="缩小"
              style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', color: 'var(--text-secondary)', opacity: 0.6, transition: 'opacity 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
            >
              <Minus size={13} />
            </button>
            
            <input 
              type="range" 
              min="10" 
              max="200" 
              value={zoom} 
              onChange={(e) => setZoom(parseInt(e.target.value))}
              className="zoom-slider"
              style={{
                width: '60px',
                height: '2px',
                WebkitAppearance: 'none',
                background: 'var(--border-strong)',
                borderRadius: '1px',
                outline: 'none',
                cursor: 'pointer',
                margin: '0 4px'
              }}
            />
            
            <button 
              onClick={() => setZoom(Math.min(400, zoom + 10))}
              title="放大"
              style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', display: 'flex', color: 'var(--text-secondary)', opacity: 0.6, transition: 'opacity 0.2s' }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
            >
              <Plus size={13} />
            </button>
          </div>
        </div>

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
