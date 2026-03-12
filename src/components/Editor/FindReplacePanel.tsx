import React from 'react';
import { X, ChevronDown, ChevronUp, Replace, Search } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';

export const FindReplacePanel: React.FC = () => {
  const { findVisible, replaceVisible, toggleFind, toggleReplace } = useAppStore();
  
  if (!findVisible && !replaceVisible) return null;

  return (
    <div className="find-replace-panel" style={{
      position: 'absolute',
      top: 10,
      right: 20,
      backgroundColor: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      padding: '12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
      zIndex: 100,
      width: 320,
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Search size={14} color="var(--text-muted)" />
        <input 
          autoFocus
          placeholder="查找内容..." 
          style={{ 
            flex: 1, 
            backgroundColor: 'var(--bg-page)', 
            border: '1px solid var(--border-subtle)', 
            borderRadius: 4, 
            padding: '4px 8px',
            fontSize: 12,
            color: 'var(--text-primary)',
            outline: 'none'
          }} 
        />
        <div style={{ display: 'flex', gap: 2 }}>
          <button style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><ChevronUp size={14}/></button>
          <button style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><ChevronDown size={14}/></button>
        </div>
        <button 
          onClick={() => findVisible ? toggleFind() : toggleReplace()}
          style={{ padding: 2, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
        >
          <X size={14} />
        </button>
      </div>

      {replaceVisible && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Replace size={14} color="var(--text-muted)" />
          <input 
            placeholder="替换为..." 
            style={{ 
              flex: 1, 
              backgroundColor: 'var(--bg-page)', 
              border: '1px solid var(--border-subtle)', 
              borderRadius: 4, 
              padding: '4px 8px',
              fontSize: 12,
              color: 'var(--text-primary)',
              outline: 'none'
            }} 
          />
          <button style={{ 
            backgroundColor: 'var(--color-accent-indigo)', 
            color: 'white', 
            border: 'none', 
            borderRadius: 4, 
            padding: '4px 8px', 
            fontSize: 11,
            cursor: 'pointer'
          }}>
            替换
          </button>
        </div>
      )}
    </div>
  );
};
