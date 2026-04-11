import React from 'react';
import { X, Image } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';

interface Props {
  onClose: () => void;
}

export const ImageConfigModal: React.FC<Props> = ({ onClose }) => {
  const { imageGenConfig, setImageGenConfig } = useAppStore();

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 3000, padding: '40px 20px', boxSizing: 'border-box',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-elevated)', borderRadius: 20, padding: 28,
          width: 460, maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 25px 60px rgba(0,0,0,0.25)', border: '1px solid var(--border-subtle)',
          animation: 'scaleIn 0.25s cubic-bezier(0.16,1,0.3,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Image size={18} color="var(--color-brand-indigo)" />
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>图片生成配置</h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 来源选择 */}
          <div style={{
            backgroundColor: 'var(--bg-card)', padding: 16, borderRadius: 12,
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>图片来源</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  网络爬取无需配置；AI 生成需填入对应 API Key
                </div>
              </div>
              <div style={{
                display: 'flex', backgroundColor: 'var(--bg-elevated)', borderRadius: 8,
                padding: 4, border: '1px solid var(--border-subtle)',
              }}>
                {(['crawl', 'generate'] as const).map((s, i) => (
                  <button
                    key={s}
                    onClick={() => setImageGenConfig({ source: s })}
                    style={{
                      padding: '4px 12px', fontSize: 12, borderRadius: 6, border: 'none', cursor: 'pointer',
                      backgroundColor: imageGenConfig.source === s ? 'var(--color-brand-indigo)' : 'transparent',
                      color: imageGenConfig.source === s ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s',
                    }}
                  >
                    {i === 0 ? '网络爬取' : 'AI 生成'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* AI 生成配置 */}
          {imageGenConfig.source === 'generate' && (
            <div style={{
              backgroundColor: 'var(--bg-card)', padding: 16, borderRadius: 12,
              border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              {/* 提供商 */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  模型提供商
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                  {[
                    { id: 'gemini', name: 'Google Gemini', desc: 'Imagen / Flash，需境外访问' },
                    { id: 'volcengine', name: '火山引擎 豆包', desc: 'Seedream 系列，国内稳定' },
                    { id: 'minimax', name: 'MiniMax 海螺', desc: '国产文生图大模型' },
                    { id: 'custom', name: '自定义端点', desc: 'OpenAI 兼容接口' },
                  ].map((p) => {
                    const active = imageGenConfig.provider === p.id
                      || (p.id === 'gemini' && (imageGenConfig.provider === 'gemini-imagen' || imageGenConfig.provider === 'gemini-flash'));
                    return (
                      <button
                        key={p.id}
                        onClick={() => setImageGenConfig({ provider: p.id as any })}
                        style={{
                          padding: '10px 12px', borderRadius: 10, textAlign: 'left',
                          border: `1.5px solid ${active ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
                          backgroundColor: active ? 'rgba(99,102,241,0.06)' : 'var(--bg-elevated)',
                          cursor: 'pointer', transition: 'all 0.15s',
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
              </div>

              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)' }} />

              {/* API Key */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>API Key</div>
                <input
                  type="password"
                  value={imageGenConfig.apiKey}
                  onChange={(e) => setImageGenConfig({ apiKey: e.target.value })}
                  placeholder={
                    imageGenConfig.provider === 'gemini' || imageGenConfig.provider === 'gemini-imagen' || imageGenConfig.provider === 'gemini-flash'
                      ? 'AIza...'
                      : imageGenConfig.provider === 'minimax'
                      ? 'eyJ...'
                      : imageGenConfig.provider === 'volcengine'
                      ? '火山方舟 API Key'
                      : 'Bearer token'
                  }
                  style={{
                    width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8,
                    border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                {(imageGenConfig.provider === 'gemini' || imageGenConfig.provider === 'gemini-imagen' || imageGenConfig.provider === 'gemini-flash') && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    aistudio.google.com → Get API key
                  </div>
                )}
                {imageGenConfig.provider === 'volcengine' && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    console.volcengine.com → 火山方舟 → API Key 管理
                  </div>
                )}
                {imageGenConfig.provider === 'minimax' && (
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                    platform.minimaxi.com → API Key 管理
                  </div>
                )}
              </div>

              {/* 模型选择（Gemini / 火山引擎） */}
              {(() => {
                const isGemini = imageGenConfig.provider === 'gemini' || imageGenConfig.provider === 'gemini-imagen' || imageGenConfig.provider === 'gemini-flash';
                const isVolc = imageGenConfig.provider === 'volcengine';
                if (!isGemini && !isVolc) return null;
                const presets = isGemini
                  ? [
                      { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0' },
                      { id: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4.0 Ultra' },
                      { id: 'gemini-2.0-flash-exp-image-generation', name: 'Flash 2.0' },
                    ]
                  : [
                      { id: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0' },
                      { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5' },
                      { id: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0' },
                    ];
                const defaultModel = isGemini ? 'imagen-4.0-generate-001' : 'doubao-seedream-5-0-260128';
                const currentModel = imageGenConfig.model || defaultModel;
                return (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>模型</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                      {presets.map((m) => {
                        const active = currentModel === m.id;
                        return (
                          <div
                            key={m.id}
                            onClick={() => setImageGenConfig({ model: m.id })}
                            style={{
                              padding: '4px 10px', borderRadius: 20, cursor: 'pointer', fontSize: 11,
                              border: `1.5px solid ${active ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
                              backgroundColor: active ? 'rgba(99,102,241,0.08)' : 'var(--bg-elevated)',
                              color: active ? 'var(--color-brand-indigo)' : 'var(--text-secondary)',
                              fontWeight: active ? 600 : 400, transition: 'all 0.15s',
                            }}
                          >
                            {m.name}
                          </div>
                        );
                      })}
                    </div>
                    <input
                      type="text"
                      value={currentModel}
                      onChange={(e) => setImageGenConfig({ model: e.target.value })}
                      placeholder="输入模型 ID..."
                      style={{
                        width: '100%', padding: '8px 12px', fontSize: 12, borderRadius: 8, fontFamily: 'monospace',
                        border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                );
              })()}

              {/* 自定义端点 */}
              {imageGenConfig.provider === 'custom' && (
                <>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>API 端点</div>
                    <input
                      type="text"
                      value={imageGenConfig.endpoint}
                      onChange={(e) => setImageGenConfig({ endpoint: e.target.value })}
                      placeholder="https://api.example.com/v1/images/generations"
                      style={{
                        width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8,
                        border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 6 }}>模型名称</div>
                    <input
                      type="text"
                      value={imageGenConfig.model}
                      onChange={(e) => setImageGenConfig({ model: e.target.value })}
                      placeholder="dall-e-3 / stable-diffusion-xl / ..."
                      style={{
                        width: '100%', padding: '9px 12px', fontSize: 13, borderRadius: 8,
                        border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* 保存提示 */}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
            配置自动保存，下次生成封面图时即可生效
          </div>
        </div>
      </div>
    </div>
  );
};
