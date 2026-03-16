import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Keyboard } from 'lucide-react';

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
    maxHeight: '95vh',
    backgroundColor: 'var(--glass-bg)',
    backdropFilter: 'blur(30px)',
    WebkitBackdropFilter: 'blur(30px)',
    borderRadius: '16px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px var(--glass-border)',
    border: 'none',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    animation: 'fadeInScale 0.3s ease-out'
  };

  const isMac = window.api.app.platform === 'darwin';
  const modKey = isMac ? '⌘' : 'Ctrl';

  const [currentPage, setCurrentPage] = useState(0);

  const shortcutPages = [
    [
      {
        title: '文件操作',
        shortcuts: [
          { label: '新建文件', keys: [modKey, 'N'] },
          { label: '打开文件', keys: [modKey, 'O'] },
          { label: '打开目录', keys: [modKey, '⇧', 'O'] },
          { label: '保存文件', keys: [modKey, 'S'] },
          { label: '另存为', keys: [modKey, '⇧', 'S'] },
        ]
      },
      {
        title: '编辑器',
        shortcuts: [
          { label: '切换编辑模式 (Word/MD)', keys: [modKey, 'E'] },
          { label: '切换侧边栏显隐', keys: [modKey, 'B'] },
          { label: '查找', keys: [modKey, 'F'] },
          { label: '替换', keys: [modKey, 'H'] },
          { label: '撤销', keys: [modKey, 'Z'] },
          { label: '重做', keys: [modKey, '⇧', 'Z'] },
        ]
      }
    ],
    [
      {
        title: '格式化与多媒体',
        shortcuts: [
          { label: '加粗', keys: [modKey, 'B'] },
          { label: '斜体', keys: [modKey, 'I'] },
          { label: '下划线', keys: [modKey, 'U'] },
          { label: '插入链接', keys: [modKey, 'K'] },
          { label: '图表/代码块', keys: ['/'] },
          { label: '快捷键说明', keys: [modKey, '/'] },
        ]
      },
      {
        title: 'AI 智能助手',
        shortcuts: [
          { label: '唤起 AI 气泡', keys: ['Space'] },
          { label: '发布/执行指令', keys: ['↵'] },
          { label: '退出/取消', keys: ['Esc'] },
          { label: '切换结合上下文', keys: [modKey, 'Shift', 'C'] },
        ]
      }
    ],
    [
      {
        title: '表格操作',
        shortcuts: [
          { label: '插入列 (右侧)', keys: ['T', '+', 'C'] },
          { label: '插入行 (下方)', keys: ['T', '+', 'R'] },
          { label: '对齐方式', keys: ['L', '/', 'C', '/', 'R'] },
          { label: '删除行列', keys: ['Del'] },
          { label: '合并单元格', keys: [modKey, 'M'] },
          { label: '拆分单元格', keys: [modKey, '⇧', 'M'] },
        ]
      },
      {
        title: '高级技巧',
        shortcuts: [
          { label: '导出 PDF', keys: [modKey, 'P'] },
          { label: '全屏切换', keys: ['F11'] },
          { label: '打印', keys: [modKey, 'P'] },
        ]
      }
    ]
  ];

  const totalPages = shortcutPages.length;

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
          padding: isStandalone ? '0 0 12px 0' : '16px 24px',
          borderBottom: isStandalone ? 'none' : '1px solid var(--border-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ 
              width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(99, 102, 241, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Keyboard size={18} color="var(--color-accent-indigo)" />
            </div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-main)' }}>快捷键说明</h2>
          </div>
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
          padding: isStandalone ? 0 : '24px 24px', 
          overflow: 'hidden',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 380,
          animation: 'paletteIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          {shortcutPages[currentPage].map((group, groupIdx) => (
            <div key={groupIdx} style={{ marginBottom: 24 }}>
              <h3 style={{ 
                fontSize: 11, 
                fontWeight: 600, 
                color: 'var(--color-accent-indigo)', 
                marginBottom: 12,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: 'currentColor' }} />
                {group.title}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.shortcuts.map((s, sIdx) => (
                  <div key={sIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.label}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {s.keys.map((k, kIdx) => (
                        <kbd key={kIdx} style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: 10,
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          fontFamily: 'inherit',
                          minWidth: 20,
                          textAlign: 'center',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          opacity: 0.9
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

        {/* Footer with Pagination */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {shortcutPages.map((_, i) => (
              <div 
                key={i} 
                style={{ 
                  width: i === currentPage ? 16 : 6, 
                  height: 6, 
                  borderRadius: 3, 
                  backgroundColor: i === currentPage ? 'var(--color-accent-indigo)' : 'var(--border-strong)',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer'
                }}
                onClick={() => setCurrentPage(i)}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={currentPage === 0}
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                color: currentPage === 0 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                cursor: currentPage === 0 ? 'default' : 'pointer',
                padding: '6px 12px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 500,
                opacity: currentPage === 0 ? 0.5 : 1,
                transition: 'all 0.2s'
              }}
            >
              <ChevronLeft size={14} /> 上一页
            </button>
            <button
              disabled={currentPage === totalPages - 1}
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                color: currentPage === totalPages - 1 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                cursor: currentPage === totalPages - 1 ? 'default' : 'pointer',
                padding: '6px 12px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 500,
                opacity: currentPage === totalPages - 1 ? 0.5 : 1,
                transition: 'all 0.2s'
              }}
            >
              下一页 <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsModal;
