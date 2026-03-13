import React from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void; // Save
  onDiscard: () => void; // Don't Save
  onCancel: () => void;  // Cancel
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ 
  title, 
  message, 
  onConfirm, 
  onDiscard, 
  onCancel 
}) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.3)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-page)',
        padding: '20px',
        borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px var(--border-subtle)',
        width: '320px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        userSelect: 'none'
      }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{message}</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <button 
            onClick={onConfirm}
            className="clickable"
            style={{
              padding: '10px',
              borderRadius: '10px',
              background: 'var(--brand-gradient)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: '0 4px 12px var(--brand-glow)',
              transition: 'all 0.2s'
            }}
          >
            保存并开启新旅程
          </button>
          
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={onDiscard}
              className="clickable"
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '10px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--color-accent-coral)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
            >
              不保存
            </button>
            <button 
              onClick={onCancel}
              className="clickable"
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '10px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
