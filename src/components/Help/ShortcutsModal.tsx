import React from 'react';
import { X } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const isStandalone = new URLSearchParams(window.location.search).get('window') === 'shortcuts';

  const containerStyle: React.CSSProperties = isStandalone ? {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    background: 'transparent',
    overflow: 'hidden',
    padding: '40px 32px'
  } : {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.3)',
    backdropFilter: 'blur(4px)'
  };

  const modalStyle: React.CSSProperties = isStandalone ? {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  } : {
    width: 600,
    maxHeight: '80vh',
    backgroundColor: 'var(--bg-elevated)',
    borderRadius: '24px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    border: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'fadeInScale 0.3s ease-out'
  };

  const shortcutGroups = [
    {
      title: '文件操作',
      shortcuts: [
        { label: '新建文件', keys: ['⌘', 'N'] },
        { label: '打开文件', keys: ['⌘', 'O'] },
        { label: '打开目录', keys: ['⌘', '⇧', 'O'] },
        { label: '保存文件', keys: ['⌘', 'S'] },
        { label: '另存为', keys: ['⌘', '⇧', 'S'] },
      ]
    },
    {
      title: '编辑器',
      shortcuts: [
        { label: '切换编辑模式 (Word/MD)', keys: ['⌘', 'E'] },
        { label: '切换侧边栏显隐', keys: ['⌘', 'B'] },
        { label: '查找', keys: ['⌘', 'F'] },
        { label: '替换', keys: ['⌘', 'H'] },
        { label: '撤销', keys: ['⌘', 'Z'] },
        { label: '重做', keys: ['⌘', '⇧', 'Z'] },
      ]
    },
    {
      title: '格式化 (Word 模式)',
      shortcuts: [
        { label: '加粗', keys: ['⌘', 'B'] },
        { label: '斜体', keys: ['⌘', 'I'] },
        { label: '下划线', keys: ['⌘', 'U'] },
        { label: '插入链接', keys: ['⌘', 'K'] },
      ]
    }
  ];

  return (
    <div style={containerStyle} onClick={onClose}>
      {/* Draggable header for standalone window */}
      {isStandalone && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          WebkitAppRegion: 'drag',
          zIndex: 10
        } as React.CSSProperties} />
      )}

      <div 
        style={modalStyle} 
        onClick={e => e.stopPropagation()}
      >
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          padding: isStandalone ? '0 0 24px 0' : '24px 32px',
          borderBottom: isStandalone ? 'none' : '1px solid var(--border-subtle)'
        }}>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--text-main)' }}>快捷键说明</h2>
          {!isStandalone && (
            <button 
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: 4,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
              }}
              className="hover-bg-surface"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div style={{ 
          padding: isStandalone ? 0 : '24px 32px', 
          overflowY: 'auto',
          flex: 1
        }} className="custom-scrollbar">
          {shortcutGroups.map((group, groupIdx) => (
            <div key={groupIdx} style={{ marginBottom: 32 }}>
              <h3 style={{ 
                fontSize: 14, 
                fontWeight: 600, 
                color: 'var(--color-accent-indigo)', 
                marginBottom: 16,
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                {group.title}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {group.shortcuts.map((s, sIdx) => (
                  <div key={sIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{s.label}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {s.keys.map((k, kIdx) => (
                        <kbd key={kIdx} style={{
                          padding: '4px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-strong)',
                          fontSize: 12,
                          color: 'var(--text-primary)',
                          fontFamily: 'inherit',
                          minWidth: 24,
                          textAlign: 'center',
                          boxShadow: '0 2px 0 var(--border-subtle)'
                        }}>
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ShortcutsModal;
