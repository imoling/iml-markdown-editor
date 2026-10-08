import type { LocalState, SemanticState, AsrState, ImageGenState } from '../types/window';
import { inferServiceType } from './aiService';
import { pickBestLocalModel } from './aiReadiness';

/**
 * 「快速开始 AI」里的四行：对话、问笔记、转写、配图各自差什么。
 * 四个模块各有一套状态，这里把它们压成同一种样子给界面画；判断要和各模块自己的「能不能用」对上。
 */
export type SetupRowId = 'chat' | 'embed' | 'asr' | 'image';
export type SetupStatus = 'ready' | 'cloud' | 'installing' | 'missing' | 'unsupported' | 'unknown';

export interface SetupRow {
  id: SetupRowId;
  status: SetupStatus;
  /** 要装的东西：模型名；size 是还要下载的字节数 */
  model: string;
  bytes: number;
  /** 0 ~ 1；拿不到总数时为 null（界面画成不定长的进度条） */
  progress: number | null;
  /** 正在做的那一步，给人看的 */
  step: string | null;
  error: string | null;
}

export interface SetupInput {
  aiEnabled: boolean;
  config: { serviceType?: string | null; endpoint?: string | null; local?: { modelId?: string } | null } | null | undefined;
  local: LocalState | null;
  semantic: SemanticState | null;
  asr: AsrState | null;
  image: ImageGenState | null;
}

const GB = 1024 ** 3;
const MB = 1024 ** 2;
export const formatSize = (bytes: number) => (bytes >= GB ? `${(bytes / GB).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / MB))} MB`);
const ratio = (received: number | undefined, total: number | undefined) => (total && total > 0 ? Math.min(1, (received || 0) / total) : null);

/** 对话这一行用哪个模型：配置里选的那个；没选、或选的不在清单里，就按这台机器挑 */
export function chatModelOf(local: LocalState | null, config: SetupInput['config']) {
  if (!local) return null;
  const chosen = config?.local?.modelId ? local.models.find((m) => m.id === config.local!.modelId) : null;
  return chosen ?? pickBestLocalModel(local.models);
}

/** 运行时（llama-server）是对话和嵌入共用的：谁先装都行，装一次 */
function runtimeRow(local: LocalState): Pick<SetupRow, 'status' | 'progress' | 'step' | 'error'> | null {
  if (local.runtime.installed) return null;
  const { install } = local;
  if (install.error) return { status: 'missing', progress: null, step: null, error: `安装运行组件失败：${install.error}` };
  if (!install.active) return null;
  const step = install.phase === 'downloading' ? '下载运行组件' : install.phase === 'extracting' ? '解压运行组件' : install.phase === 'warming' ? '系统正在检查新程序' : '准备运行组件';
  return { status: 'installing', progress: install.phase === 'downloading' ? ratio(install.received, install.total) : null, step, error: null };
}

export function describeSetup(input: SetupInput): SetupRow[] {
  const { config, local, semantic, asr, image } = input;
  const rows: SetupRow[] = [];

  // 对话：写作助手、自动续写、问笔记的回答都靠它。配了网络服务的，这一行已经能用，本机模型装不装随意
  const chat = chatModelOf(local, config);
  if (!local || !chat) {
    rows.push({ id: 'chat', status: 'unknown', model: '', bytes: 0, progress: null, step: null, error: null });
  } else {
    const dl = chat.download;
    const runtime = runtimeRow(local);
    const row: SetupRow = { id: 'chat', status: 'missing', model: chat.name, bytes: chat.downloaded ? 0 : chat.size + 12 * MB, progress: null, step: null, error: null };
    if (chat.downloaded && local.runtime.installed) row.status = inferServiceType(config) === 'builtin' ? 'ready' : 'cloud';
    else if (inferServiceType(config) !== 'builtin' && String(config?.endpoint || '').trim()) row.status = 'cloud';
    if (dl?.error) { row.status = 'missing'; row.error = `下载失败：${dl.error}`; }
    else if (dl?.active) { row.status = 'installing'; row.progress = dl.phase === 'verifying' ? 1 : ratio(dl.received, dl.total || chat.size); row.step = dl.phase === 'verifying' ? '正在校验文件' : `下载 ${chat.name}`; }
    else if (runtime) Object.assign(row, runtime);
    rows.push(row);
  }

  // 问笔记：嵌入模型，和对话共用运行组件
  if (!semantic) {
    rows.push({ id: 'embed', status: 'unknown', model: '', bytes: 0, progress: null, step: null, error: null });
  } else {
    const model = semantic.models.find((m) => m.id === semantic.modelId) ?? semantic.models[0];
    const dl = model?.download;
    const runtime = local ? runtimeRow(local) : null;
    const row: SetupRow = { id: 'embed', status: 'missing', model: model?.name || '', bytes: model && !model.downloaded ? model.size : 0, progress: null, step: null, error: null };
    if (model?.downloaded && semantic.runtimeInstalled && semantic.enabled) row.status = 'ready';
    if (dl?.error) { row.status = 'missing'; row.error = `下载失败：${dl.error}`; }
    else if (dl?.active) { row.status = 'installing'; row.progress = dl.phase === 'verifying' ? 1 : ratio(dl.received, dl.total || model?.size); row.step = dl.phase === 'verifying' ? '正在校验文件' : `下载 ${model?.name}`; }
    else if (runtime && !(model?.downloaded && semantic.runtimeInstalled)) Object.assign(row, runtime);
    rows.push(row);
  }

  // 转写：识别组件 + 语音模型一起装
  if (!asr) {
    rows.push({ id: 'asr', status: 'unknown', model: '', bytes: 0, progress: null, step: null, error: null });
  } else {
    const row: SetupRow = { id: 'asr', status: asr.installed ? 'ready' : 'missing', model: 'SenseVoice', bytes: asr.installed ? 0 : asr.downloadBytes, progress: null, step: null, error: null };
    if (!asr.supported) row.status = 'unsupported';
    else if (asr.install?.active) { row.status = 'installing'; row.progress = ratio(asr.install.received, asr.install.total); row.step = `下载${asr.install.step || '识别组件'}`; }
    else if (asr.install?.error) { row.status = 'missing'; row.error = `下载失败：${asr.install.error}`; }
    rows.push(row);
  }

  // 配图：运行组件 + 当前选的模型（三个文件）
  if (!image) {
    rows.push({ id: 'image', status: 'unknown', model: '', bytes: 0, progress: null, step: null, error: null });
  } else {
    const model = image.models.find((m) => m.id === image.modelId);
    const row: SetupRow = { id: 'image', status: image.ready ? 'ready' : 'missing', model: model?.name || '', bytes: image.ready ? 0 : Math.max(0, image.totalBytes - image.installedBytes), progress: null, step: null, error: null };
    if (!image.supported) row.status = 'unsupported';
    else if (image.install?.active) { row.status = 'installing'; row.progress = ratio(image.install.received, image.install.total); row.step = image.install.step ? `下载${image.install.step}` : '下载模型'; }
    else if (image.install?.error) { row.status = 'missing'; row.error = `下载失败：${image.install.error}`; }
    rows.push(row);
  }

  return rows;
}

/** 「一键装好」装哪几项：对话、问笔记、转写；配图几个 GB，想用再装 */
export const ONE_CLICK_ROWS: SetupRowId[] = ['chat', 'embed', 'asr'];

/** 一键装好要下多少：只算还没装、能装的那几项 */
export function oneClickBytes(rows: SetupRow[]): number {
  return rows.filter((r) => ONE_CLICK_ROWS.includes(r.id) && (r.status === 'missing' || r.status === 'installing')).reduce((sum, r) => sum + r.bytes, 0);
}
