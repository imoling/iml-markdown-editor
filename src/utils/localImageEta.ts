/**
 * 本机生图要等很久，界面上得随时说清楚「还要多久」。这里管两件事：
 * 按当前设置估一次时长（用上一次的实测折算），以及出图时那句会自己走秒的提示。
 */
import { sizeOf, stepsForModel, estimateMs, formatDuration, imageModelOf } from '../../electron/imageGen/catalog';
import type { ImageGenConfig } from '../stores/appStore';

export function isLocalImage(cfg: Pick<ImageGenConfig, 'provider'>): boolean {
  return cfg.provider === 'local';
}

/** 「约 5 分钟」：问一次主进程拿上一次的实测；问不到就按保守基准 */
export async function localImageEta(cfg: ImageGenConfig): Promise<string> {
  let lastRun = null;
  let loading = true;   // 服务没在跑的话，这一张还要先等模型加载
  let modelId = cfg.localModel;
  try {
    const st = await window.api.image.getState();
    lastRun = st.lastRun; loading = st.server.status !== 'running'; modelId = modelId || st.modelId;
  } catch { /* 用基准 */ }
  const model = imageModelOf(modelId);
  return formatDuration(estimateMs(model, sizeOf(cfg.localSize), stepsForModel(model, cfg.localSteps), lastRun, { includeModelLoad: loading }));
}

/** mm:ss */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * 出图期间每秒更新一次状态栏：「本机生图中 1:23 / 约 5 分钟 · 点这里取消」。
 * 返回一个收尾函数：出完图或者出错时叫一下
 */
export function startLocalImageTicker(eta: string, notify: (text: string, ms?: number, actions?: { label: string; run: () => void }[]) => void, onCancel: () => void): () => void {
  const startedAt = Date.now();
  const tick = () => notify(`本机生图中 ${clock(Date.now() - startedAt)} / ${eta}`, 5000, [{ label: '取消', run: onCancel }]);
  tick();
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}
