import React, { useState, useEffect } from 'react';
import { X, Globe } from 'lucide-react';

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
    width: '100%', height: '100%', padding: '40px 32px', display: 'flex', flexDirection: 'column',
  } : {
    backgroundColor: 'var(--bg-elevated)', borderRadius: 24, padding: 40, width: 440,
    boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-subtle)',
    display: 'flex', flexDirection: 'column', position: 'relative',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 12,
    border: '1px solid var(--border-subtle)',
    backgroundColor: 'var(--bg-main)',
    color: 'var(--text-main)',
    fontSize: 14,
    marginBottom: 20,
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-muted)',
    marginBottom: 8,
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
          <header style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <Globe size={24} color="var(--color-accent-indigo)" />
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-main)' }}>联网配置</h1>
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            配置您的智能联网服务（Tavily），为写作注入实时情报。
          </p>
        </header>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-muted)' }}>加载中...</div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <label style={labelStyle}>Tavily API KEY</label>
            <input 
              style={inputStyle} 
              type="password"
              value={config.searchApiKey} 
              onChange={e => setConfig({...config, searchApiKey: e.target.value})}
              placeholder="tvly-..."
            />

            <div style={{ 
              marginTop: 10, 
              padding: '16px 20px', 
              borderRadius: 12, 
              backgroundColor: '#f5f7ff', 
              border: '1px solid #ebf0ff',
              fontSize: 13,
              lineHeight: 1.6,
              color: '#4b5563'
            }}>
              💡 <b>注意</b>：获取 API Key 请访问 <a href="#" onClick={(e) => { e.preventDefault(); window.api.shell.openExternal('https://tavily.com/'); }} style={{ color: 'var(--color-accent-indigo)', textDecoration: 'none' }}>tavily.com</a>。您的密钥将安全地加密保存在本地。
            </div>
          </div>
        )}

        <footer style={{ marginTop: 32, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button 
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 12,
              backgroundColor: saving ? 'var(--text-muted)' : 'var(--color-accent-indigo)',
              color: '#fff',
              border: 'none',
              fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
              transition: 'transform 0.2s',
            }}
            onMouseEnter={e => !saving && (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={e => !saving && (e.currentTarget.style.transform = 'translateY(0)')}
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
          
          {isStandalone && (
            <button 
              onClick={() => window.close()}
              style={{
                padding: '12px 20px',
                borderRadius: 12,
                backgroundColor: 'var(--bg-main)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-subtle)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              取消
            </button>
          )}
        </footer >

        {message && (
          <div style={{
            position: 'absolute',
            top: 80,
            left: 32,
            right: 32,
            padding: '12px 16px',
            borderRadius: 12,
            backgroundColor: message.type === 'success' ? '#10b981' : '#ef4444',
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            textAlign: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 100,
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
