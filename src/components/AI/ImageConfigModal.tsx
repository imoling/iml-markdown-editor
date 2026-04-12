import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAppStore, type ImageGenConfig } from '../../stores/appStore';

interface Props {
  onClose: () => void;
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6,
  display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)',
  color: 'var(--text-primary)', fontSize: 13, outline: 'none',
  marginBottom: 16, boxSizing: 'border-box',
};

export const ImageConfigModal: React.FC<Props> = ({ onClose }) => {
  const isStandalone = new URLSearchParams(window.location.search).get('window') === 'image-config';
  const isMac = window.api.app.platform === 'darwin';
  const { imageGenConfig, setImageGenConfig } = useAppStore();

  // 本地状态缓冲（standalone 模式下不立即写 store）
  const [local, setLocal] = useState<ImageGenConfig>({ ...imageGenConfig });

  // standalone 模式：从磁盘加载已保存的配置（store 此时是默认值）
  useEffect(() => {
    if (!isStandalone) return;
    window.api.app.getSettings().then((s: any) => {
      if (s?.imageGenConfig) setLocal(s.imageGenConfig);
    });
  }, []);

  // getter — standalone 用 local，inline 用 store
  const cfg = isStandalone ? local : imageGenConfig;
  const update = (patch: Partial<ImageGenConfig>) =>
    isStandalone ? setLocal(s => ({ ...s, ...patch })) : setImageGenConfig(patch);

  const isGemini = cfg.provider === 'gemini' || cfg.provider === 'gemini-imagen' || cfg.provider === 'gemini-flash';
  const isVolc = cfg.provider === 'volcengine';

  const geminiModels = [
    { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0' },
    { id: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4.0 Ultra' },
    { id: 'gemini-2.0-flash-exp-image-generation', name: 'Flash 2.0' },
  ];
  const volcModels = [
    { id: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0' },
    { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5' },
    { id: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0' },
  ];

  const apiKeyPlaceholder =
    isGemini ? 'AIza...'
    : cfg.provider === 'minimax' ? 'eyJ...'
    : cfg.provider === 'volcengine' ? '火山方舟 API Key'
    : 'Bearer token';

  const apiKeyHint =
    isGemini ? 'aistudio.google.com → Get API key'
    : isVolc ? 'console.volcengine.com → 火山方舟 → API Key 管理'
    : cfg.provider === 'minimax' ? 'platform.minimaxi.com → API Key 管理'
    : '';

  const handleSave = async () => {
    if (isStandalone) {
      const current = await window.api.app.getSettings();
      await window.api.app.saveSettings({ ...current, imageGenConfig: local });
    }
    setImageGenConfig(local);
    window.close();
  };

  const handleCancel = () => window.close();

  const containerStyle: React.CSSProperties = isStandalone
    ? { height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: 'transparent', overflow: 'hidden' }
    : { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 };

  const cardStyle: React.CSSProperties = isStandalone
    ? { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
    : { backgroundColor: 'var(--bg-elevated)', borderRadius: 24, padding: 40, width: 460, boxShadow: '0 20px 50px rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', position: 'relative', maxHeight: '90vh', overflowY: 'auto' };

  return (
    <div
      style={containerStyle}
      onClick={e => { if (!isStandalone && e.target === e.currentTarget) onClose(); }}
    >
      {isStandalone && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40, WebkitAppRegion: 'drag', zIndex: 10 } as any} />
      )}
      <div style={cardStyle}>

        {/* 可滚动内容区 */}
        <div style={isStandalone ? { flex: 1, overflowY: 'auto', padding: '40px 32px 24px', position: 'relative' } : {}}>
          {(!isStandalone || !isMac) && (
            <button
              onClick={onClose}
              style={{
                position: 'absolute', top: 20, right: 20, background: 'none', border: 'none',
                color: 'var(--text-muted)', cursor: 'pointer', padding: 8, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <X size={20} />
            </button>
          )}

          <header style={{ marginBottom: 24 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>图片生成配置</h1>
          </header>

          {/* 图片来源 */}
          <label style={labelStyle}>图片来源</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            {(['crawl', 'generate'] as const).map(s => (
              <button
                key={s}
                onClick={() => update({ source: s })}
                style={{
                  flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  border: `1px solid ${cfg.source === s ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
                  backgroundColor: cfg.source === s ? 'rgba(99,102,241,0.08)' : 'var(--bg-main)',
                  color: cfg.source === s ? 'var(--color-brand-indigo)' : 'var(--text-secondary)',
                }}
              >
                {s === 'crawl' ? '网络爬取' : 'AI 生成'}
              </button>
            ))}
          </div>

          {cfg.source === 'crawl' && (
            <div style={{
              borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)',
              backgroundColor: 'rgba(99,102,241,0.04)',
              padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
            }}>
              网络爬取无需配置，AI 将自动从网络获取相关图片作为封面候选。
            </div>
          )}

          {cfg.source === 'generate' && (
            <>
              {/* 提供商 */}
              <label style={labelStyle}>模型提供商</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, marginBottom: 20 }}>
                {[
                  { id: 'gemini', name: 'Google Gemini', desc: 'Imagen / Flash，需境外访问' },
                  { id: 'volcengine', name: '火山引擎 豆包', desc: 'Seedream 系列，国内稳定' },
                  { id: 'minimax', name: 'MiniMax 海螺', desc: '国产文生图大模型' },
                  { id: 'custom', name: '自定义端点', desc: 'OpenAI 兼容接口' },
                ].map(p => {
                  const active = cfg.provider === p.id
                    || (p.id === 'gemini' && (cfg.provider === 'gemini-imagen' || cfg.provider === 'gemini-flash'));
                  return (
                    <button
                      key={p.id}
                      onClick={() => update({ provider: p.id as any })}
                      style={{
                        padding: '10px 12px', borderRadius: 10, textAlign: 'left',
                        border: `1px solid ${active ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
                        backgroundColor: active ? 'rgba(99,102,241,0.08)' : 'var(--bg-main)',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, color: active ? 'var(--color-brand-indigo)' : 'var(--text-primary)' }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{p.desc}</div>
                    </button>
                  );
                })}
              </div>

              {/* API Key */}
              <label style={labelStyle}>API Key</label>
              <input
                type="password"
                value={cfg.apiKey}
                onChange={e => update({ apiKey: e.target.value })}
                placeholder={apiKeyPlaceholder}
                style={inputStyle}
              />
              {apiKeyHint && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -12, marginBottom: 16 }}>
                  {apiKeyHint}
                </div>
              )}

              {/* 模型选择 */}
              {(isGemini || isVolc) && (() => {
                const presets = isGemini ? geminiModels : volcModels;
                const defaultModel = isGemini ? 'imagen-4.0-generate-001' : 'doubao-seedream-5-0-260128';
                const currentModel = cfg.model || defaultModel;
                return (
                  <>
                    <label style={labelStyle}>模型</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                      {presets.map(m => {
                        const active = currentModel === m.id;
                        return (
                          <button
                            key={m.id}
                            onClick={() => update({ model: m.id })}
                            style={{
                              padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                              border: `1px solid ${active ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
                              backgroundColor: active ? 'rgba(99,102,241,0.08)' : 'var(--bg-main)',
                              color: active ? 'var(--color-brand-indigo)' : 'var(--text-secondary)',
                            }}
                          >
                            {m.name}
                          </button>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      value={currentModel}
                      onChange={e => update({ model: e.target.value })}
                      placeholder="输入模型 ID..."
                      style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 12 }}
                    />
                  </>
                );
              })()}

              {/* 自定义端点 */}
              {cfg.provider === 'custom' && (
                <>
                  <label style={labelStyle}>API 端点</label>
                  <input
                    type="text"
                    value={cfg.endpoint}
                    onChange={e => update({ endpoint: e.target.value })}
                    placeholder="https://api.example.com/v1/images/generations"
                    style={inputStyle}
                  />
                  <label style={labelStyle}>模型名称</label>
                  <input
                    type="text"
                    value={cfg.model}
                    onChange={e => update({ model: e.target.value })}
                    placeholder="dall-e-3 / stable-diffusion-xl / ..."
                    style={inputStyle}
                  />
                </>
              )}

              <div style={{
                borderRadius: 10, border: '1px solid rgba(99,102,241,0.2)',
                backgroundColor: 'rgba(99,102,241,0.04)',
                padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
              }}>
                🔒 API Key 仅保存在本地，不会上传。
              </div>
            </>
          )}

          {/* inline 模式提示 */}
          {!isStandalone && (
            <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              配置变更自动生效
            </div>
          )}
        </div>{/* end scrollable */}

        {/* 固定底部（仅 standalone）*/}
        {isStandalone && (
          <div style={{
            padding: '16px 32px', borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-elevated)', display: 'flex', gap: 12,
          }}>
            <button
              onClick={handleSave}
              style={{
                flex: 1, padding: '12px', fontSize: 14, fontWeight: 600, borderRadius: 12,
                border: 'none', backgroundColor: 'var(--color-brand-indigo)', color: 'white', cursor: 'pointer',
                boxShadow: '0 4px 12px var(--brand-glow)',
              }}
            >
              保存
            </button>
            <button
              onClick={handleCancel}
              style={{
                padding: '12px 24px', fontSize: 14, fontWeight: 500, borderRadius: 12,
                border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
