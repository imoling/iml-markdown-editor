import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

type Protocol = 'openai' | 'anthropic';

interface AIConfig {
  protocol: Protocol;
  endpoint: string;
  apiKey: string;
  model: string;
}

const PRESETS: { label: string; protocol: Protocol; endpoint: string; model: string; placeholder: string }[] = [
  { label: 'OpenAI',     protocol: 'openai',    endpoint: 'https://api.openai.com/v1',          model: 'gpt-4o',                  placeholder: 'sk-...' },
  { label: 'Anthropic',  protocol: 'anthropic', endpoint: 'https://api.anthropic.com/v1',       model: 'claude-sonnet-4-5',       placeholder: 'sk-ant-...' },
  { label: 'DeepSeek',   protocol: 'openai',    endpoint: 'https://api.deepseek.com/v1',        model: 'deepseek-chat',            placeholder: 'sk-...' },
  { label: 'Gemini',     protocol: 'openai',    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', placeholder: 'AIza...' },
  { label: '中转 / 自定义', protocol: 'openai', endpoint: '',                                   model: '',                         placeholder: 'sk-...' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ModelConfigModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [config, setConfig] = useState<AIConfig>({
    protocol: 'openai',
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4o',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isStandalone = new URLSearchParams(window.location.search).get('window') === 'ai-config';
  const isMac = window.api.app.platform === 'darwin';

  useEffect(() => {
    window.api.ai.getConfig().then((saved: any) => {
      if (saved && Object.keys(saved).length > 0) {
        setConfig(prev => ({ ...prev, ...saved }));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setConfig(prev => ({
      ...prev,
      // 中转/自定义不覆盖 protocol，让用户自行选择
      protocol: preset.endpoint === '' ? prev.protocol : preset.protocol,
      endpoint: preset.endpoint || '',
      model: preset.model || '',
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await window.api.ai.saveConfig(config);
      if (result.success) {
        setMessage({ type: 'success', text: '配置已保存' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: result.error || '保存失败' });
      }
    } catch {
      setMessage({ type: 'error', text: '网络或系统错误' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const containerStyle: React.CSSProperties = isStandalone
    ? { height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: 'transparent', overflow: 'hidden' }
    : { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 };

  const modalStyle: React.CSSProperties = isStandalone
    ? { width: '100%', height: '100%', padding: '40px 32px', display: 'flex', flexDirection: 'column' }
    : { backgroundColor: 'var(--bg-elevated)', borderRadius: 24, padding: 40, width: 460, boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', position: 'relative' };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10,
    border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)',
    color: 'var(--text-primary)', fontSize: 13, outline: 'none', marginBottom: 16,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6,
    display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em',
  };

  const currentPresetKey = config.endpoint.includes('api.anthropic.com') ? 'Anthropic'
    : config.endpoint.includes('openai.com') ? 'OpenAI'
    : config.endpoint.includes('deepseek.com') ? 'DeepSeek'
    : config.endpoint.includes('googleapis.com') ? 'Gemini'
    : '中转 / 自定义';

  return (
    <div style={containerStyle} onClick={onClose}>
      {isStandalone && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, WebkitAppRegion: 'drag', zIndex: 10 } as any} />
      )}
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {(!isStandalone || !isMac) && (
          <button
            onClick={onClose}
            style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={20} />
          </button>
        )}

        <header style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>模型配置</h1>
        </header>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-muted)' }}>加载中...</div>
        ) : (
          <div>

            {/* 服务商预设 */}
            <label style={labelStyle}>服务商</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    border: `1px solid ${currentPresetKey === p.label ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
                    backgroundColor: currentPresetKey === p.label ? 'rgba(99,102,241,0.08)' : 'var(--bg-main)',
                    color: currentPresetKey === p.label ? 'var(--color-brand-indigo)' : 'var(--text-secondary)',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* 协议 */}
            <label style={labelStyle}>请求协议</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {(['openai', 'anthropic'] as Protocol[]).map(p => (
                <button
                  key={p}
                  onClick={() => setConfig(prev => ({ ...prev, protocol: p }))}
                  style={{
                    flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    border: `1px solid ${config.protocol === p ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
                    backgroundColor: config.protocol === p ? 'rgba(99,102,241,0.08)' : 'var(--bg-main)',
                    color: config.protocol === p ? 'var(--color-brand-indigo)' : 'var(--text-secondary)',
                  }}
                >
                  {p === 'openai' ? 'OpenAI Compatible' : 'Anthropic'}
                </button>
              ))}
            </div>

            <label style={labelStyle}>Base URL</label>
            <input
              style={inputStyle}
              value={config.endpoint}
              onChange={e => setConfig(prev => ({ ...prev, endpoint: e.target.value }))}
              placeholder={config.protocol === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1'}
            />

            <label style={labelStyle}>API Key</label>
            <input
              style={inputStyle}
              type="password"
              value={config.apiKey}
              onChange={e => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder={PRESETS.find(p => currentPresetKey === p.label)?.placeholder ?? 'sk-...'}
            />

            <label style={labelStyle}>Model</label>
            <input
              style={inputStyle}
              value={config.model}
              onChange={e => setConfig(prev => ({ ...prev, model: e.target.value }))}
              placeholder="gpt-4o"
            />

            {/* 信息块：请求地址预览 + 安全说明 */}
            <div style={{
              borderRadius: 10, overflow: 'hidden',
              border: '1px solid rgba(99,102,241,0.2)',
              backgroundColor: 'rgba(99,102,241,0.04)',
              fontSize: 12, lineHeight: 1.7,
            }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(99,102,241,0.12)' }}>
                <span style={{ color: 'var(--text-muted)' }}>
                  {config.protocol === 'anthropic'
                    ? 'Anthropic Messages API，Base URL 须填到 /v1。实际请求：'
                    : 'OpenAI Chat Completions 格式，适用于 OpenAI、DeepSeek、Gemini、中转站。实际请求：'}
                </span>
                <br />
                <span style={{ color: 'var(--color-brand-indigo)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {config.protocol === 'anthropic'
                    ? `${(config.endpoint || 'https://api.anthropic.com/v1').replace(/\/$/, '')}/messages`
                    : `${(config.endpoint || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`}
                </span>
              </div>
              <div style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>
                🔒 API Key 仅保存在本地，不会上传。
              </div>
            </div>
          </div>
        )}

        <footer style={{ marginTop: 24, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              flex: 1, padding: '11px', borderRadius: 12,
              backgroundColor: saving ? 'var(--text-muted)' : 'var(--color-brand-indigo)',
              color: '#fff', border: 'none', fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
          {isStandalone && (
            <button
              onClick={() => window.close()}
              style={{ padding: '11px 20px', borderRadius: 12, backgroundColor: 'var(--bg-main)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', fontWeight: 600, cursor: 'pointer' }}
            >
              取消
            </button>
          )}
        </footer>

        {message && (
          <div style={{
            position: 'absolute', top: 80, left: 32, right: 32,
            padding: '10px 16px', borderRadius: 10,
            backgroundColor: message.type === 'success' ? '#10b981' : '#ef4444',
            color: '#fff', fontSize: 13, fontWeight: 500, textAlign: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100,
          }}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
};

export default ModelConfigModal;
