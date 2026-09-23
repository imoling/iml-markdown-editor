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
 * 出图期间每秒把「到哪一步了」写到状态栏上：「正在出图 3/8 步，还要约 45 秒 · 1:12」。
 * setText 由调用方决定写到哪（气泡那条路写进 aiStatus.text，状态栏自带「停止」按钮）。
 * 返回一个收尾函数：出完图或者出错时叫一下
 */
export function startLocalImageTicker(eta: string, setText: (text: string) => void, _onCancel?: () => void): () => void {
  const startedAt = Date.now();
  let progress: { phase: string; current?: number; total?: number; secPerStep?: number } | null = null;
  const off = window.api.image?.onProgress?.((p) => { progress = p; });
  const tick = () => setText(`${describeProgress(progress, clock(Date.now() - startedAt), eta)} · ${clock(Date.now() - startedAt)}`);
  tick();
  const timer = setInterval(tick, 1000);
  return () => { clearInterval(timer); off?.(); };
}

/**
 * 出图各阶段说人话。本机出图前面要腾内存、起服务、读模型，这几步加起来可能小一分钟，
 * 界面上只转个圈的话，人会以为卡死了直接关掉
 */
export function describeProgress(p: { phase: string; current?: number; total?: number; secPerStep?: number; label?: string } | null, elapsed: string, eta: string): string {
  if (!p) return `${elapsed} / ${eta}`;
  switch (p.phase) {
    case 'waiting':
      return `${p.label || '别的本机模型'}正在忙，等它干完就开画`;
    case 'freeing':
      return p.current ? '正在腾内存：先把别的本机模型停一下' : '正在准备';
    case 'starting':
      return '正在启动生图服务';
    case 'loading':
      return p.total ? `正在读模型 ${Math.min(99, Math.round(((p.current || 0) / p.total) * 100))}%` : '正在读模型';
    case 'encoding':
      return '正在理解这句提示词';
    case 'sampling': {
      if (!p.total) return '正在出图';
      const left = Math.max(0, p.total - (p.current || 0));
      const rest = p.secPerStep ? `，还要${formatDuration(left * p.secPerStep * 1000)}` : '';
      return `正在出图 ${p.current || 0}/${p.total} 步${rest}`;
    }
    case 'decoding':
      return '正在出图（最后一步）';
    default:
      return `${elapsed} / ${eta}`;
  }
}
