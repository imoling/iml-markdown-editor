/** 模型服务的三种接入方式（与主进程 electron/localModel 的 AIServiceType 一致）；顺序就是界面上的顺序，第一个是默认 */
export type AIServiceType = 'builtin' | 'local' | 'cloud';
export type Protocol = 'openai' | 'anthropic';

export interface ServiceTypeInfo {
  id: AIServiceType;
  title: string;
  desc: string;
}

export const SERVICE_TYPES: ServiceTypeInfo[] = [
  { id: 'builtin', title: '本机模型', desc: '编辑器自己下载并托管运行，零配置' },
  { id: 'local', title: '本地服务', desc: 'Ollama / LM Studio / llama.cpp 已在运行' },
  { id: 'cloud', title: '网络模型服务', desc: 'Agnes（免费）、OpenAI、DeepSeek，或自定义接口' },
];

export const DEFAULT_SERVICE_TYPE: AIServiceType = 'builtin';

export interface Preset {
  label: string;
  type: Exclude<AIServiceType, 'builtin'>;
  protocol: Protocol;
  endpoint: string;
  model: string;
  placeholder: string;
  /** 选中后显示在说明框里的一句话（怎么拿 Key、注意事项） */
  hint?: string;
}

export const PRESETS: Preset[] = [
  { label: 'Ollama',     type: 'local', protocol: 'openai', endpoint: 'http://localhost:11434/v1', model: '', placeholder: '本地服务无需 Key' },
  { label: 'LM Studio',  type: 'local', protocol: 'openai', endpoint: 'http://localhost:1234/v1',  model: '', placeholder: '本地服务无需 Key' },
  { label: 'llama.cpp',  type: 'local', protocol: 'openai', endpoint: 'http://localhost:8080/v1',  model: '', placeholder: '本地服务无需 Key' },
  // Agnes 有免费额度，放最前面；国内站 (.cn) 与国际站 (.com) 域名不同、密钥不通用，模型命名一致
  { label: 'Agnes 国内站', type: 'cloud', protocol: 'openai', endpoint: 'https://api.agnes-ai.cn/v1',    model: 'agnes-2.0-flash', placeholder: 'Agnes 国内站的 API Key', hint: '在 www.agnes-ai.cn 创建 Key；有免费额度' },
  { label: 'Agnes 国际站', type: 'cloud', protocol: 'openai', endpoint: 'https://apihub.agnes-ai.com/v1', model: 'agnes-2.0-flash', placeholder: 'Agnes 国际站的 API Key', hint: '在 apihub.agnes-ai.com 创建 Key；有免费额度' },
  { label: 'OpenAI',     type: 'cloud', protocol: 'openai',    endpoint: 'https://api.openai.com/v1',          model: 'gpt-4o',            placeholder: 'sk-...' },
  { label: 'Anthropic',  type: 'cloud', protocol: 'anthropic', endpoint: 'https://api.anthropic.com/v1',       model: 'claude-sonnet-4-5', placeholder: 'sk-ant-...' },
  { label: 'DeepSeek',   type: 'cloud', protocol: 'openai',    endpoint: 'https://api.deepseek.com/v1',        model: 'deepseek-chat',     placeholder: 'sk-...' },
  { label: 'Gemini',     type: 'cloud', protocol: 'openai',    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', placeholder: 'AIza...' },
  // 任何 OpenAI / Anthropic 兼容接口（中转站、公司内网等）：没有固定地址，选中后自己填
  { label: '自定义', type: 'cloud', protocol: 'openai', endpoint: '', model: '', placeholder: 'sk-...' },
];

export const isLocalEndpoint = (endpoint: string) => /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test((endpoint || '').trim());

const normalize = (url: string) => (url || '').trim().replace(/\/+$/, '');

/** 按 Base URL 找到对应的预设（自定义没有固定地址，匹配不到时兜底） */
export function findPreset(endpoint: string): Preset | undefined {
  const e = normalize(endpoint);
  return PRESETS.find((p) => p.endpoint && e.startsWith(normalize(p.endpoint)));
}

/**
 * 老配置没有 serviceType 字段：按地址推断，本机地址算「本地模型」，其余算「网络模型服务」；
 * 什么都没填过（全新安装）默认走本机模型。26.1 的 'relay'（企业中转站）并入网络模型服务。
 */
export function inferServiceType(config: { serviceType?: string | null; endpoint?: string | null } | null | undefined): AIServiceType {
  const t = config?.serviceType;
  if (t === 'cloud' || t === 'local' || t === 'builtin') return t;
  if (t === 'relay') return 'cloud';
  // 先 trim：地址框里只剩空格时也算「没填过」。主进程 electron/localModel/config.ts 有同样一份，
  // 两边必须给出一样的答案，否则状态栏显示的去向和真正发请求的去向会对不上（localModel.test.ts 有逐例比对）
  const endpoint = (config?.endpoint || '').trim();
  if (!endpoint) return DEFAULT_SERVICE_TYPE;
  return isLocalEndpoint(endpoint) ? 'local' : 'cloud';
}

/** 「切回模型服务」时回到的类型：不能是本机模型 */
export function fallbackServiceType(config: { endpoint?: string | null } | null | undefined): Exclude<AIServiceType, 'builtin'> {
  const t = inferServiceType({ ...(config || {}), serviceType: null });
  return t === 'builtin' ? 'cloud' : t;
}

import type { LocalModelConfig } from '../types/window';

/** 与主进程 electron/localModel/config.ts 的默认值保持一致（渲染进程不能引用 Node 模块） */
export const DEFAULT_LOCAL_CONFIG: LocalModelConfig = {
  modelId: 'spark-x2.5-1.7b-q4km',
  port: 18080,
  autoStart: false,
  thinking: false,
  ctxSize: 32768,
  threads: null,
  gpuLayers: null,
  temperature: null,
  source: 'hf-mirror',
  customBase: '',
  proxyPrefix: '',
  runtimePath: null,
  extraArgs: '',
  customModels: [],
};
