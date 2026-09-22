import React, { useState, useEffect } from 'react';
import { X, Cloud, Cpu } from 'lucide-react';
import { useAppStore, type ImageGenConfig } from '../../stores/appStore';
import { LocalImageSection } from './LocalImageSection';
import { stripIpcError } from './ModelConfigModal';

interface Props {
  onClose: () => void;
}

type ImageServiceType = 'builtin' | 'cloud';
type CloudProvider = Exclude<ImageGenConfig['provider'], 'local' | 'gemini-imagen' | 'gemini-flash'>;

/** 和写作助手一样两大类：编辑器代管的本机模型，或者填 Key 的网络服务 */
const SERVICE_TYPES: { id: ImageServiceType; title: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'builtin', title: '本机生图', desc: 'Qwen-Image 2.1，编辑器代管，不联网；模型约 10 GB', icon: <Cpu size={14} /> },
  { id: 'cloud', title: '网络服务', desc: 'Agnes、Gemini、火山引擎、MiniMax 或自定义接口', icon: <Cloud size={14} /> },
];

// Agnes 有免费额度，排最前；国内站 (.cn) 与国际站 (.com) 域名不同、Key 不通用（与写作助手里的一致）
const PROVIDERS: { id: CloudProvider; label: string; placeholder: string; hint: string; request: string }[] = [
  { id: 'agnes-cn', label: 'Agnes 国内站', placeholder: 'Agnes 国内站的 API Key', hint: 'www.agnes-ai.cn → API Key（与国际站不通用；和写作助手里的 Agnes 国内站是同一个 Key）', request: 'OpenAI 兼容的 images/generations 接口，有免费额度，国内直连' },
  { id: 'agnes', label: 'Agnes 国际站', placeholder: 'Agnes 国际站的 API Key', hint: 'apihub.agnes-ai.com → API Key（与国内站不通用；和写作助手里的 Agnes 国际站是同一个 Key）', request: 'OpenAI 兼容的 images/generations 接口，有免费额度，需境外访问' },
  { id: 'gemini', label: 'Google Gemini', placeholder: 'AIza...', hint: 'aistudio.google.com → Get API key', request: 'Imagen 走 predict 接口、Flash 走 generateContent，需境外访问' },
  { id: 'volcengine', label: '火山引擎 豆包', placeholder: '火山方舟 API Key', hint: 'console.volcengine.com → 火山方舟 → API Key 管理', request: 'Seedream 系列，国内稳定' },
  { id: 'minimax', label: 'MiniMax 海螺', placeholder: 'eyJ...', hint: 'platform.minimaxi.com → API Key 管理', request: '国产文生图大模型' },
  { id: 'custom', label: '自定义端点', placeholder: 'Bearer token', hint: '', request: 'OpenAI 兼容的 POST …/images/generations' },
];

const AGNES_MODELS = [{ id: 'agnes-image-2.0-flash', name: 'Image 2.0 Flash（免费档）' }];
const GEMINI_MODELS = [
  { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0' },
  { id: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4.0 Ultra' },
  { id: 'gemini-2.0-flash-exp-image-generation', name: 'Flash 2.0' },
];
const VOLC_MODELS = [
  { id: 'doubao-seedream-5-0-260128', name: 'Seedream 5.0' },
  { id: 'doubao-seedream-4-5-251128', name: 'Seedream 4.5' },
  { id: 'doubao-seedream-4-0-250828', name: 'Seedream 4.0' },
];

const cloudProviderOf = (p: ImageGenConfig['provider']): CloudProvider => (p === 'gemini-imagen' || p === 'gemini-flash' ? 'gemini' : p === 'local' ? 'agnes-cn' : p);

/**
 * AI 配图的设置：和「写作助手」同一套版式——先选服务类型（本机 / 网络），本机的走代管面板，网络的填服务商、Key、模型；
 * 改动先在表单里，点「保存配置」才生效。
 */
export const ImageConfigModal: React.FC<Props> = ({ onClose }) => {
  const isStandalone = new URLSearchParams(window.location.search).get('window') === 'image-config';
  const isMac = window.api.app.platform === 'darwin';
  const { imageGenConfig, setImageGenConfig } = useAppStore();
  const [config, setConfig] = useState<ImageGenConfig>({ ...imageGenConfig });
  // 切到本机再切回来时，还是原来那家网络服务
  const [lastCloud, setLastCloud] = useState<CloudProvider>(cloudProviderOf(imageGenConfig.provider));
  const [loading, setLoading] = useState(isStandalone);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 独立窗口里的 store 是默认值：从磁盘读已保存的配置
  useEffect(() => {
    if (!isStandalone) return;
    window.api.app.getSettings().then((s: any) => {
      if (s?.imageGenConfig) { setConfig(s.imageGenConfig); setLastCloud(cloudProviderOf(s.imageGenConfig.provider)); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const notify = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    if (type === 'success') setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 3000);
  };
  const update = (patch: Partial<ImageGenConfig>) => setConfig((prev) => ({ ...prev, ...patch }));

  const serviceType: ImageServiceType = config.provider === 'local' ? 'builtin' : 'cloud';
  const selectServiceType = (t: ImageServiceType) => {
    if (t === 'builtin') { if (config.provider !== 'local') setLastCloud(cloudProviderOf(config.provider)); update({ provider: 'local' }); }
    else update({ provider: lastCloud });
  };
  const cloud = cloudProviderOf(config.provider);
  const providerInfo = PROVIDERS.find((p) => p.id === cloud) ?? PROVIDERS[0];
  const isGemini = cloud === 'gemini';
  const isAgnes = cloud === 'agnes-cn' || cloud === 'agnes';
  const presets = isAgnes ? AGNES_MODELS : isGemini ? GEMINI_MODELS : cloud === 'volcengine' ? VOLC_MODELS : null;
  const defaultModel = isAgnes ? 'agnes-image-2.0-flash' : isGemini ? 'imagen-4.0-generate-001' : 'doubao-seedream-5-0-260128';
  const currentModel = config.model || defaultModel;

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      if (isStandalone) {
        // 独立窗口里的 store 是默认值，不能走 setImageGenConfig → saveSettings（会把默认外观、笔记库路径等写回覆盖真实设置）；
        // 直接合并写盘，主窗口收到 settings:changed 后会自行重载
        const current = await window.api.app.getSettings();
        await window.api.app.saveSettings({ ...current, imageGenConfig: config });
        window.close();
        return;
      }
      setImageGenConfig(config);
      notify('success', '配置已保存');
    } catch (err) {
      notify('error', stripIpcError(err) || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={isStandalone ? 'standalone' : 'modal-backdrop'} onClick={onClose}>
      {isStandalone && <div className="standalone-drag" />}
      <div className={isStandalone ? 'standalone-card model-config' : 'modal-card modal-card--wide modal-card--flush model-config'} onClick={(e) => e.stopPropagation()}>
        <header className={`modal-head ${isStandalone ? 'modal-head--standalone' : ''}`}>
          <div>
            <h1 className="modal-title">AI 配图</h1>
            <p className="modal-subtitle">AI 气泡和插入图片对话框里生成图片用哪个服务</p>
          </div>
          {(!isStandalone || !isMac) && (
            <button onClick={onClose} className="icon-btn" title="关闭"><X size={20} /></button>
          )}
          {message && <div className={`toast toast--under-head toast--${message.type}`}>{message.text}</div>}
        </header>

        <div className={isStandalone ? 'standalone-scroll standalone-scroll--headed' : 'modal-body modal-body--headed'}>
          {loading ? (
            <div className="empty-state">加载中...</div>
          ) : (
            <div>
              <label className="field-label">服务类型</label>
              <div className="svc-grid mb-20">
                {SERVICE_TYPES.map((t) => (
                  <button key={t.id} onClick={() => selectServiceType(t.id)} className={`svc-card ${serviceType === t.id ? 'svc-card--active' : ''}`}>
                    <span className="svc-card__title">{t.icon}{t.title}</span>
                    <span className="svc-card__desc">{t.desc}</span>
                  </button>
                ))}
              </div>

              {serviceType === 'builtin' ? (
                <LocalImageSection cfg={config} update={update} />
              ) : (
                <>
                  <label className="field-label">服务商</label>
                  <div className="chip-row mb-20">
                    {PROVIDERS.map((p) => (
                      <button key={p.id} onClick={() => update({ provider: p.id, model: p.id === cloud ? config.model : '' })} className={`chip ${cloud === p.id ? 'chip--active' : ''}`}>{p.label}</button>
                    ))}
                  </div>

                  {cloud === 'custom' && (
                    <>
                      <label className="field-label">API 端点</label>
                      <input className="field-input" type="text" value={config.endpoint} onChange={(e) => update({ endpoint: e.target.value })} placeholder="https://api.example.com/v1/images/generations" />
                    </>
                  )}

                  <label className="field-label">API Key</label>
                  <input className="field-input" type="password" value={config.apiKey} onChange={(e) => update({ apiKey: e.target.value })} placeholder={providerInfo.placeholder} />

                  <label className="field-label">Model</label>
                  {presets && (
                    <div className="chip-row mb-8">
                      {presets.map((m) => (
                        <button key={m.id} onClick={() => update({ model: m.id })} className={`chip ${currentModel === m.id ? 'chip--active' : ''}`}>{m.name}</button>
                      ))}
                    </div>
                  )}
                  <input className="field-input field-input--mono" type="text" value={presets ? currentModel : config.model} onChange={(e) => update({ model: e.target.value })} placeholder={cloud === 'custom' ? 'dall-e-3 / stable-diffusion-xl / ...' : cloud === 'minimax' ? 'image-01' : '输入模型 ID...'} />

                  <div className="info-box info-box--flush">
                    <div className="info-box__row">{providerInfo.request}</div>
                    {providerInfo.hint && <div className="info-box__row">{providerInfo.hint}</div>}
                    <div className="info-box__row">🔒 API Key 加密后保存在本机（macOS 钥匙串 / Windows DPAPI），不会上传。</div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <footer className={isStandalone ? 'standalone-footer' : 'modal-footer'}>
          <button onClick={handleSave} disabled={saving || loading} className="btn btn-primary btn-block">
            {saving ? '保存中...' : '保存配置'}
          </button>
          <button onClick={() => (isStandalone ? window.close() : onClose())} className="btn btn-secondary btn-wide">取消</button>
        </footer>
      </div>
    </div>
  );
};

export default ImageConfigModal;
