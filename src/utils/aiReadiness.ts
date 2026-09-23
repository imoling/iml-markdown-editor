import { useEffect, useState } from 'react';
import { inferServiceType } from './aiService';
import type { LocalState } from '../types/window';
import { AI_DISABLED } from './uiText';

/**
 * AI 现在能不能用；不能用的话差什么。
 *
 * 这个判断要和主进程 ai:chat 的拒绝条件对上 —— 否则界面显示「可以用」，
 * 用户敲完指令才被告知没配好，白写一遍。主进程那几处拒绝见 electron/main.ts 的 ai:chat。
 */
export type AiBlocker = 'disabled' | 'runtime' | 'model' | 'endpoint' | 'key';

export interface AiReadiness {
  ready: boolean;
  blocker: AiBlocker | null;
  /** 一句话说明差什么，直接可以显示给用户 */
  message: string;
}

const READY: AiReadiness = { ready: true, blocker: null, message: '' };

export function describeAiReadiness(
  aiEnabled: boolean,
  config: { serviceType?: string | null; endpoint?: string | null; apiKey?: string | null; protocol?: string | null; local?: { modelId?: string } | null } | null | undefined,
  local: Pick<LocalState, 'runtime' | 'models'> | null,
): AiReadiness {
  if (!aiEnabled) return { ready: false, blocker: 'disabled', message: AI_DISABLED };

  if (inferServiceType(config) === 'builtin') {
    // 本机模型：主进程会在请求时现拉起服务，所以「在不在跑」不算阻塞，缺运行时或缺模型才算
    if (!local) return READY;   // 状态还没读回来，先别拦
    if (!local.runtime.installed) return { ready: false, blocker: 'runtime', message: '还没有安装推理运行时' };
    const modelId = config?.local?.modelId;
    const model = local.models.find((m) => m.id === modelId) ?? local.models.find((m) => m.recommended);
    if (!model?.downloaded) return { ready: false, blocker: 'model', message: '还没有下载本机模型' };
    return READY;
  }

  if (!String(config?.endpoint || '').trim()) return { ready: false, blocker: 'endpoint', message: '还没有填写服务地址' };
  // OpenAI 兼容的本地服务可以不要 Key；Anthropic 协议一定要
  if (config?.protocol === 'anthropic' && !String(config?.apiKey || '').trim()) {
    return { ready: false, blocker: 'key', message: '还没有填写 API Key' };
  }
  return READY;
}

/**
 * 「一键用上本机模型」该下哪个：在这台机器上能跑得动的里面挑最大的（大的写作质量更好）。
 * 一个都跑不动时挑最小的 —— 与其把人挡在门外，不如让他跑个慢的试试。
 * 已导入的自定义模型不参与（用户自己管）。
 */
export function pickBestLocalModel<T extends { size: number; custom?: boolean; requirement: { level: string } }>(models: T[]): T | null {
  const candidates = models.filter((m) => !m.custom);
  if (candidates.length === 0) return null;
  const runnable = candidates.filter((m) => m.requirement.level === 'ok');
  if (runnable.length > 0) return runnable.reduce((a, b) => (b.size > a.size ? b : a));
  return candidates.reduce((a, b) => (b.size < a.size ? b : a));
}

/** 订阅式版本：配置或本机模型状态一变就重算 */
export function useAiReadiness(aiEnabled: boolean): AiReadiness {
  const [config, setConfig] = useState<any>(null);
  const [local, setLocal] = useState<LocalState | null>(null);
  const [configVersion, setConfigVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    window.api.ai.getConfig().then((c: any) => { if (alive) setConfig(c || {}); }).catch(() => { if (alive) setConfig({}); });
    return () => { alive = false; };
  }, [configVersion]);

  useEffect(() => {
    let alive = true;
    window.api.local.getState().then((s) => { if (alive && s) setLocal(s); }).catch(() => {});
    // 本机模型的状态广播里带着 serviceType，配置改了也会走这条 —— 顺便重读一次 ai-config
    const off = window.api.local.onState((s) => {
      if (!alive) return;
      setLocal(s);
      setConfigVersion((v) => v + 1);
    });
    return () => { alive = false; off(); };
  }, []);

  return describeAiReadiness(aiEnabled, config, local);
}
