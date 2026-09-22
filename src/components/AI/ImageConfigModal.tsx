import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAppStore, type ImageGenConfig } from '../../stores/appStore';
import { LocalImageSection } from './LocalImageSection';

interface Props {
  onClose: () => void;
}

// Agnes 有免费额度，排最前；国内站 (.cn) 与国际站 (.com) 域名不同、Key 不通用（与写作助手里的一致）
const PROVIDERS = [
  { id: 'agnes-cn', name: 'Agnes 国内站', desc: '有免费额度，国内直连' },
  { id: 'local', name: '本机生图', desc: 'Qwen-Image 2.1，不联网；模型约 10 GB，出图要一两分钟' },
  { id: 'agnes', name: 'Agnes 国际站', desc: '有免费额度，需境外访问' },
  { id: 'gemini', name: 'Google Gemini', desc: 'Imagen / Flash，需境外访问' },
  { id: 'volcengine', name: '火山引擎 豆包', desc: 'Seedream 系列，国内稳定' },
  { id: 'minimax', name: 'MiniMax 海螺', desc: '国产文生图大模型' },
  { id: 'custom', name: '自定义端点', desc: 'OpenAI 兼容接口' },
] as const;

const AGNES_MODELS = [
  { id: 'agnes-image-2.0-flash', name: 'Image 2.0 Flash（免费档）' },
];
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

  const cfg = isStandalone ? local : imageGenConfig;
  const update = (patch: Partial<ImageGenConfig>) =>
    isStandalone ? setLocal((s) => ({ ...s, ...patch })) : setImageGenConfig(patch);

  const isGemini = cfg.provider === 'gemini' || cfg.provider === 'gemini-imagen' || cfg.provider === 'gemini-flash';
  const isVolc = cfg.provider === 'volcengine';
  const isAgnes = cfg.provider === 'agnes-cn' || cfg.provider === 'agnes';

  const apiKeyPlaceholder = isAgnes ? `Agnes ${cfg.provider === 'agnes-cn' ? '国内站' : '国际站'}的 API Key` : isGemini ? 'AIza...' : cfg.provider === 'minimax' ? 'eyJ...' : isVolc ? '火山方舟 API Key' : 'Bearer token';
  const apiKeyHint = cfg.provider === 'agnes-cn'
    ? 'www.agnes-ai.cn → API Key（与国际站不通用；和写作助手里的 Agnes 国内站是同一个 Key）'
    : cfg.provider === 'agnes' ? 'apihub.agnes-ai.com → API Key（与国内站不通用；和写作助手里的 Agnes 国际站是同一个 Key）'
    : isGemini ? 'aistudio.google.com → Get API key'
    : isVolc ? 'console.volcengine.com → 火山方舟 → API Key 管理'
    : cfg.provider === 'minimax' ? 'platform.minimaxi.com → API Key 管理' : '';

  const handleSave = async () => {
    // 独立窗口里的 store 是默认值，不能走 setImageGenConfig → saveSettings（会把默认外观、笔记库路径等写回覆盖真实设置）；
    // 直接合并写盘，主窗口收到 settings:changed 后会自行重载
    const current = await window.api.app.getSettings();
    await window.api.app.saveSettings({ ...current, imageGenConfig: local });
    window.close();
  };

  const presets = isAgnes ? AGNES_MODELS : isGemini ? GEMINI_MODELS : isVolc ? VOLC_MODELS : null;
  const defaultModel = isAgnes ? 'agnes-image-2.0-flash' : isGemini ? 'imagen-4.0-generate-001' : 'doubao-seedream-5-0-260128';
  const currentModel = cfg.model || defaultModel;

  return (
    <div className={isStandalone ? 'standalone' : 'modal-backdrop'} onClick={(e) => { if (!isStandalone && e.target === e.currentTarget) onClose(); }}>
      {isStandalone && <div className="standalone-drag" />}
      <div className={isStandalone ? 'standalone-card' : 'modal-card'}>
        <div className={isStandalone ? 'standalone-scroll' : ''}>
          {(!isStandalone || !isMac) && (
            <button onClick={onClose} className="modal-close"><X size={20} /></button>
          )}

          <header className="modal-header">
            <h1 className="modal-title">AI 配图</h1>
            <p className="modal-subtitle">AI 气泡和插入图片对话框里生成图片用哪个服务</p>
          </header>

          <label className="field-label">模型提供商</label>
          <div className="option-grid mb-20">
            {PROVIDERS.map((p) => {
              const active = cfg.provider === p.id || (p.id === 'gemini' && (cfg.provider === 'gemini-imagen' || cfg.provider === 'gemini-flash'));
              return (
                <button key={p.id} onClick={() => update({ provider: p.id })} className={`option-card ${active ? 'option-card--active' : ''}`}>
                  <div className="option-card__title">{p.name}</div>
                  <div className="option-card__desc">{p.desc}</div>
                </button>
              );
            })}
          </div>

          {cfg.provider === 'local' && <LocalImageSection cfg={cfg} update={update} />}

          {cfg.provider !== 'local' && (<>
          <label className="field-label">API Key</label>
          <input type="password" value={cfg.apiKey} onChange={(e) => update({ apiKey: e.target.value })} placeholder={apiKeyPlaceholder} className="field-input" />
          {apiKeyHint && <div className="field-hint">{apiKeyHint}</div>}
          </>)}

          {cfg.provider !== 'local' && presets && (
            <>
              <label className="field-label">模型</label>
              <div className="chip-row mb-8">
                {presets.map((m) => (
                  <button key={m.id} onClick={() => update({ model: m.id })} className={`chip ${currentModel === m.id ? 'chip--active' : ''}`}>{m.name}</button>
                ))}
              </div>
              <input type="text" value={currentModel} onChange={(e) => update({ model: e.target.value })} placeholder="输入模型 ID..." className="field-input field-input--mono" />
            </>
          )}

          {cfg.provider === 'custom' && (
            <>
              <label className="field-label">API 端点</label>
              <input type="text" value={cfg.endpoint} onChange={(e) => update({ endpoint: e.target.value })} placeholder="https://api.example.com/v1/images/generations" className="field-input" />
              <label className="field-label">模型名称</label>
              <input type="text" value={cfg.model} onChange={(e) => update({ model: e.target.value })} placeholder="dall-e-3 / stable-diffusion-xl / ..." className="field-input" />
            </>
          )}

          {cfg.provider !== 'local' && <div className="info-box">🔒 API Key 加密后保存在本机（macOS 钥匙串 / Windows DPAPI），不会上传。</div>}

          {!isStandalone && <div className="hint text-center mt-16">配置变更自动生效</div>}
        </div>

        {isStandalone && (
          <div className="standalone-footer">
            <button onClick={handleSave} className="btn btn-primary btn-block">保存</button>
            <button onClick={() => window.close()} className="btn btn-secondary btn-wide">取消</button>
          </div>
        )}
      </div>
    </div>
  );
};
