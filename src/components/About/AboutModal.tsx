import React from 'react';
import { X } from 'lucide-react';
import logo from '../../assets/logo.png';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const isStandalone = new URLSearchParams(window.location.search).get('window') === 'about';

  const containerStyle: React.CSSProperties = isStandalone ? {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    overflow: 'hidden',
  } : {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: 20,
    animation: 'fadeIn 0.3s ease-out',
  };

  const modalStyle: React.CSSProperties = isStandalone ? {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '40px 20px',
  } : {
    backgroundColor: 'var(--bg-elevated)',
    borderRadius: 24,
    padding: 40,
    width: 420,
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
    border: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    position: 'relative',
    animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
  };

  const handleLinkClick = (url: string) => {
    if (window.api && window.api.shell) {
      window.api.shell.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  };

  const isMac = window.api.app.platform === 'darwin';

  return (
    <div style={containerStyle} onClick={onClose}>
      {isStandalone && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 40,
          WebkitAppRegion: 'drag',
          zIndex: 10
        } as React.CSSProperties} />
      )}

      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ 
          width: 96, 
          height: 96, 
          marginBottom: 24, 
          borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 8px 16px rgba(0,0,0,0.1)'
        }}>
          <img src={logo} alt="iML Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        
        <h1 style={{ 
          margin: '0 0 8px 0', 
          fontSize: 24, 
          fontWeight: 700, 
          color: 'var(--text-main)' 
        }}>iML Markdown Editor</h1>
        
        <p style={{ 
          margin: '0 0 4px 0', 
          fontSize: 14, 
          color: 'var(--text-muted)',
          fontWeight: 500
        }}>Version {window.api?.appVersion || '1.6.0'}</p>
        
        <p style={{ 
          margin: '0 0 24px 0', 
          fontSize: 13, 
          color: 'var(--color-accent-indigo)',
          letterSpacing: '0.1em',
          opacity: 0.8
        }}>极简其表 &middot; 极致内核</p>
        
        <div style={{ 
          width: '100%', 
          backgroundColor: 'var(--bg-card)', 
          borderRadius: 16, 
          padding: 20,
          border: '1px solid var(--border-subtle)',
          marginBottom: 24
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Logic & Design</span>
              <span 
                style={{ color: 'var(--color-accent-indigo)', fontWeight: 500, cursor: 'pointer' }}
                onClick={() => handleLinkClick('mailto:imoling.cn@gmail.com')}
              >
                imoling.cn@gmail.com
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Architected by</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Antigravity AI</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)' }}>发布日期</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>2026年3月</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-secondary)' }}>GitHub</span>
              <span 
                style={{ color: 'var(--color-accent-indigo)', fontWeight: 500, cursor: 'pointer' }}
                onClick={() => handleLinkClick('https://github.com/imoling/iml-markdown-editor')}
              >
                View Repository
              </span>
            </div>
          </div>
        </div>
        
        <p style={{ 
          margin: 0, 
          fontSize: 12, 
          color: 'var(--text-muted)',
          textAlign: 'center',
          lineHeight: 1.6
        }}>
          &copy; 2026 iML Studio. 保留所有权利。<br />
          让书写回归纯粹。
        </p>

        {(!isStandalone || !isMac) && (
          <button 
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 8,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              zIndex: 100
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={20} />
          </button>
        )}
      </div>
    </div>
  );
};

export default AboutModal;
