import React, { useState, useEffect, useRef } from 'react';
import { X, Cloud, MonitorSmartphone, Cpu } from 'lucide-react';
import { SERVICE_TYPES, PRESETS, DEFAULT_LOCAL_CONFIG, DEFAULT_SERVICE_TYPE, inferServiceType, fallbackServiceType, findPreset, isLocalEndpoint, type AIServiceType, type Protocol, type Preset } from '../../utils/aiService';
import type { LocalModelConfig } from '../../types/window';
import { LocalModelPanel } from './LocalModelPanel';
import { KeyPrivacyNote } from './CopyNotes';

interface AIConfig {
  serviceType: AIServiceType;
  protocol: Protocol;
  endpoint: string;
  apiKey: string;
  model: string;
  local: LocalModelConfig;
}

const SERVICE_ICONS: Record<AIServiceType, React.ReactNode> = {
  builtin: <Cpu size={14} />,
  local: <MonitorSmartphone size={14} />,
  cloud: <Cloud size={14} />,
};

/** invoke 抛出的错误会被 Electron 加上 "Error invoking remote method" 前缀，展示前去掉 */
export const stripIpcError = (err: any) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const ModelConfigModal: React.FC<Props> = ({ isOpen, onClose }) => {
  // 全新安装默认本机模型；网络模型服务那一栏预填第一个预设（Agnes 国内站，有免费额度），切过去就能直接填 Key
  const firstCloud = PRESETS.find((p) => p.type === 'cloud')!;
  const [config, setConfig] = useState<AIConfig>({ serviceType: DEFAULT_SERVICE_TYPE, protocol: firstCloud.protocol, endpoint: firstCloud.endpoint, apiKey: '', model: firstCloud.model, local: DEFAULT_LOCAL_CONFIG });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [listing, setListing] = useState(false);

  const isStandalone = new URLSearchParams(window.location.search).get('window') === 'ai-config';
  const isMac = window.api.app.platform === 'darwin';

  useEffect(() => {
    window.api.ai.getConfig().then((saved: any) => {
      if (saved && Object.keys(saved).length > 0) {
        setConfig((prev) => ({
          ...prev,
          ...saved,
          serviceType: inferServiceType(saved),
          local: { ...DEFAULT_LOCAL_CONFIG, ...(saved.local || {}) },
        }));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // 主进程里服务类型真的变了（比如启动本机模型后自动切换）才同步到表单；下载进度之类的广播不动用户未保存的选择
  const mainServiceType = useRef<string | null>(null);
  useEffect(() => {
    return window.api.local.onState((state) => {
      if (mainServiceType.current !== null && mainServiceType.current !== state.serviceType) {
        setConfig((prev) => ({ ...prev, serviceType: state.serviceType }));
      }
      mainServiceType.current = state.serviceType;
    });
  }, []);

  const notify = (type: 'success' | 'error', text: string, autoHide = type === 'success') => {
    setMessage({ type, text });
    if (autoHide) setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 4000);
  };

  const applyPreset = (preset: Preset) => {
    setModels([]);
    setConfig((prev) => ({
      ...prev,
      // 自定义不覆盖 protocol，让用户自行选择
      protocol: preset.endpoint === '' ? prev.protocol : preset.protocol,
      endpoint: preset.endpoint || '',
      model: preset.model || '',
    }));
  };

  const selectServiceType = (type: AIServiceType) => {
    setMessage(null);
    setConfig((prev) => {
      if (type === 'builtin' || type === prev.serviceType) return { ...prev, serviceType: type };
      // 换到另一类服务时，如果当前地址不属于这一类，套用这一类的第一个预设；
      // 匹配不到预设的非本机地址就是「自定义」，属于网络模型服务，切过去时原样保留
      const current = findPreset(prev.endpoint);
      if (current?.type === type || (type === 'cloud' && !current && prev.endpoint && !isLocalEndpoint(prev.endpoint))) return { ...prev, serviceType: type };
      const first = PRESETS.find((p) => p.type === type);
      return first
        ? { ...prev, serviceType: type, protocol: first.endpoint ? first.protocol : prev.protocol, endpoint: first.endpoint, model: first.model }
        : { ...prev, serviceType: type };
    });
    setModels([]);
  };

  const fetchModels = async () => {
    setListing(true);
    setMessage(null);
    try {
      const list = await window.api.ai.listModels({ endpoint: config.endpoint, apiKey: config.apiKey, protocol: config.protocol });
      setModels(list);
      if (list.length === 0) notify('error', '服务已连通，但没有可用模型（本地服务请先拉取模型）');
      else if (!config.model || !list.includes(config.model)) setConfig((prev) => ({ ...prev, model: list[0] }));
    } catch (err: any) {
      setModels([]);
      notify('error', stripIpcError(err) || '获取模型列表失败');
    } finally {
      setListing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await window.api.ai.saveConfig(config);
      if (result.success) notify('success', '配置已保存');
      else notify('error', result.error || '保存失败');
    } catch {
      notify('error', '网络或系统错误');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const result = config.serviceType === 'builtin'
        ? await window.api.local.test(config.local)
        : await window.api.ai.testConnection({ protocol: config.protocol, endpoint: config.endpoint, apiKey: config.apiKey, model: config.model });
      const seconds = (result.latencyMs / 1000).toFixed(1);
      notify('success', `连接正常 · ${result.model} · ${seconds}s${result.reply ? ` · 回复「${result.reply.slice(0, 20)}」` : ''}`);
    } catch (err: any) {
      notify('error', `连接失败：${stripIpcError(err)}`, false);
    } finally {
      setTesting(false);
    }
  };

  const handleSwitchBack = async () => {
    const target = fallbackServiceType(config);
    try {
      await window.api.local.switchBack(target);
      setConfig((prev) => ({ ...prev, serviceType: target }));
      notify('success', `已切回${SERVICE_TYPES.find((t) => t.id === target)?.title ?? '模型服务'}`);
    } catch (err: any) {
      notify('error', stripIpcError(err));
    }
  };

  if (!isOpen) return null;

  const isBuiltin = config.serviceType === 'builtin';
  const presets = PRESETS.filter((p) => p.type === config.serviceType);
  const currentPreset = findPreset(config.endpoint);
  const currentPresetKey = currentPreset?.label ?? '自定义';
  const isLocal = isLocalEndpoint(config.endpoint);
  const requestUrl = config.protocol === 'anthropic'
    ? `${(config.endpoint || 'https://api.anthropic.com/v1').replace(/\/$/, '')}/messages`
    : `${(config.endpoint || 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`;

  return (
    <div className={isStandalone ? 'standalone' : 'modal-backdrop'} onClick={onClose}>
      {isStandalone && <div className="standalone-drag" />}
      <div className={isStandalone ? 'standalone-card model-config' : 'modal-card modal-card--wide modal-card--flush model-config'} onClick={(e) => e.stopPropagation()}>
        <header className={`modal-head ${isStandalone ? 'modal-head--standalone' : ''}`}>
          <div>
            <h1 className="modal-title">写作助手</h1>
            <p className="modal-subtitle">续写、润色、总结、扩写和流程图用哪个模型</p>
          </div>
          {(!isStandalone || !isMac) && (
            <button onClick={onClose} className="icon-btn" title="关闭"><X size={20} /></button>
          )}
          {message && (
            <div className={`toast toast--under-head toast--${message.type}`}>{message.text}</div>
          )}
        </header>

        <div className={isStandalone ? 'standalone-scroll standalone-scroll--headed' : 'modal-body modal-body--headed'}>
          {loading ? (
            <div className="empty-state">加载中…</div>
          ) : (
            <div>
              <label className="field-label">服务类型</label>
              <div className="svc-grid mb-20">
                {SERVICE_TYPES.map((t) => (
                  <button key={t.id} onClick={() => selectServiceType(t.id)} className={`svc-card ${config.serviceType === t.id ? 'svc-card--active' : ''}`}>
                    <span className="svc-card__title">{SERVICE_ICONS[t.id]}{t.title}</span>
                    <span className="svc-card__desc">{t.desc}</span>
                  </button>
                ))}
              </div>

              {isBuiltin ? (
                <LocalModelPanel
                  draft={config.local}
                  onChange={(patch) => setConfig((prev) => ({ ...prev, local: { ...prev.local, ...patch } }))}
                  onSwitchBack={handleSwitchBack}
                  notify={notify}
                />
              ) : (
                <>
                  <label className="field-label">服务商</label>
                  <div className="chip-row mb-20">
                    {presets.map((p) => (
                      <button key={p.label} onClick={() => applyPreset(p)} className={`chip ${currentPresetKey === p.label ? 'chip--active' : ''}`}>{p.label}</button>
                    ))}
                  </div>

                  <label className="field-label">请求协议</label>
                  <div className="row gap-8 mb-16">
                    {(['openai', 'anthropic'] as Protocol[]).map((p) => (
                      <button key={p} onClick={() => setConfig((prev) => ({ ...prev, protocol: p }))} className={`chip chip--block ${config.protocol === p ? 'chip--active' : ''}`}>
                        {p === 'openai' ? 'OpenAI Compatible' : 'Anthropic'}
                      </button>
                    ))}
                  </div>

                  <label className="field-label">Base URL</label>
                  <input
                    className="field-input"
                    value={config.endpoint}
                    onChange={(e) => setConfig((prev) => ({ ...prev, endpoint: e.target.value }))}
                    placeholder={config.protocol === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1'}
                  />

                  <label className="field-label">API Key{isLocal && <span className="field-label__note">（本地服务可留空）</span>}</label>
                  <input
                    className="field-input"
                    type="password"
                    value={config.apiKey}
                    onChange={(e) => setConfig((prev) => ({ ...prev, apiKey: e.target.value }))}
                    placeholder={presets.find((p) => currentPresetKey === p.label)?.placeholder ?? 'sk-...'}
                  />

                  <label className="field-label">Model</label>
                  <div className="row row--start gap-8">
                    <input
                      className="field-input"
                      value={config.model}
                      onChange={(e) => setConfig((prev) => ({ ...prev, model: e.target.value }))}
                      placeholder={isLocal ? '点击右侧按钮从本地服务获取' : 'gpt-4o'}
                    />
                    <button onClick={fetchModels} disabled={listing || !config.endpoint} title="从服务端拉取可用模型列表" className="btn btn-secondary btn-xs model-config__fetch">
                      {listing ? '获取中…' : '获取模型列表'}
                    </button>
                  </div>
                  {models.length > 0 && (
                    <div className="chip-row mb-16 model-config__models">
                      {models.map((m) => (
                        <button key={m} onClick={() => setConfig((prev) => ({ ...prev, model: m }))} className={`chip chip--mono ${config.model === m ? 'chip--active' : ''}`}>{m}</button>
                      ))}
                    </div>
                  )}

                  <div className="info-box info-box--flush">
                    <div className="info-box__row">
                      <span>
                        实际请求
                      </span>
                      <br />
                      <span className="text-brand model-config__url">{requestUrl}</span>
                    </div>
                    {currentPreset?.hint && <div className="info-box__row">{currentPreset.hint}</div>}
                    <KeyPrivacyNote />
                    {isLocal && (
                      <div className="info-box__row">
                        装好 Ollama 或 LM Studio 并让它跑着，再点「获取模型列表」
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

        </div>

        <footer className={isStandalone ? 'standalone-footer' : 'modal-footer'}>
          <button onClick={handleSave} disabled={saving || loading} className="btn btn-primary btn-block">
            {saving ? '保存中…' : '保存配置'}
          </button>
          <button onClick={handleTest} disabled={testing || loading} className="btn btn-secondary btn-wide">
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button onClick={() => (isStandalone ? window.close() : onClose())} className="btn btn-secondary btn-wide">取消</button>
        </footer>
      </div>
    </div>
  );
};

export default ModelConfigModal;
