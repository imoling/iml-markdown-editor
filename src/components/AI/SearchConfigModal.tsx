import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface SearchConfig {
  searchApiKey: string;
}

interface SearchConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SearchConfigModal: React.FC<SearchConfigModalProps> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<SearchConfig>({
    searchApiKey: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const isStandalone = new URLSearchParams(window.location.search).get('window') === 'search-config';
  const isMac = window.api.app.platform === 'darwin';

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const savedConfig = await window.api.ai.getConfig();
        if (savedConfig && savedConfig.searchApiKey) {
          setConfig({ searchApiKey: savedConfig.searchApiKey });
        }
      } catch (err) {
        console.error('Failed to load Search config:', err);
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Get complete current config first to avoid overwriting other keys
      const currentConfig = await window.api.ai.getConfig();
      const newConfig = { ...currentConfig, searchApiKey: config.searchApiKey };
      
      const result = await window.api.ai.saveConfig(newConfig);
      if (result.success) {
        setMessage({ type: 'success', text: '配置已保存' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: result.error || '保存失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '网络或系统错误' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const containerStyle: React.CSSProperties = isStandalone ? {
    height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', 
    background: 'transparent', overflow: 'hidden',
  } : {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(12px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
  };

  const modalStyle: React.CSSProperties = isStandalone ? {
    width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  } : {
    backgroundColor: 'var(--bg-elevated)', borderRadius: 24, padding: 40, width: 440,
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-subtle)',
    display: 'flex', flexDirection: 'column', position: 'relative',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-main)',
    color: 'var(--text-primary)',
    fontSize: 13,
    marginBottom: 16,
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-muted)',
    marginBottom: 6,
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  };

  return (
    <div style={containerStyle} onClick={onClose}>
      {isStandalone && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, WebkitAppRegion: 'drag', zIndex: 10 } as any} />
      )}
        <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
          {/* 可滚动内容区 */}
          <div style={isStandalone ? { flex: 1, overflowY: 'auto', padding: '40px 32px 24px', position: 'relative' } : {}}>
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
          <header style={{ marginBottom: 24 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>联网配置</h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              配置智能联网服务（Tavily），为写作注入实时情报。
            </p>
          </header>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-muted)' }}>加载中...</div>
        ) : (
          <div>
            <label style={labelStyle}>Tavily API Key</label>
            <input
              style={inputStyle}
              type="password"
              value={config.searchApiKey}
              onChange={e => setConfig({ ...config, searchApiKey: e.target.value })}
              placeholder="tvly-..."
            />

            <div style={{
              borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)',
              backgroundColor: 'rgba(99,102,241,0.04)',
              padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7,
            }}>
              获取 API Key 请访问{' '}
              <a
                href="#"
                onClick={e => { e.preventDefault(); window.api.shell.openExternal('https://tavily.com/'); }}
                style={{ color: 'var(--color-brand-indigo)', textDecoration: 'none' }}
              >
                tavily.com
              </a>。
              <br />
              🔒 密钥仅保存在本地，不会上传。
            </div>
          </div>
        )}
          </div>{/* end scrollable */}

          {/* 固定底部 footer */}
          <div style={isStandalone
            ? { padding: '16px 32px', borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)', display: 'flex', gap: 12 }
            : { marginTop: 24, display: 'flex', gap: 10, alignItems: 'center' }
          }>
            <button
              onClick={handleSave}
              disabled={saving || loading}
              style={{
                flex: 1, padding: '12px', borderRadius: 12, fontSize: 14,
                backgroundColor: saving ? 'var(--text-muted)' : 'var(--color-brand-indigo)',
                color: '#fff', border: 'none', fontWeight: 600,
                cursor: saving ? 'default' : 'pointer',
                boxShadow: saving ? 'none' : '0 4px 12px var(--brand-glow)',
              }}
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => window.close()}
              style={{
                padding: '12px 24px', borderRadius: 12, fontSize: 14,
                backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)', fontWeight: 500, cursor: 'pointer',
              }}
            >
              取消
            </button>
          </div>

          {message && (
            <div style={{
              position: 'absolute', bottom: 80, left: 32, right: 32,
              padding: '10px 16px', borderRadius: 10,
              backgroundColor: message.type === 'success' ? '#10b981' : '#ef4444',
              color: '#fff', fontSize: 13, fontWeight: 500, textAlign: 'center',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100,
              animation: 'fadeInDown 0.3s ease-out'
            }}>
              {message.text}
            </div>
          )}
      </div>
    </div>
  );
};

export default SearchConfigModal;
