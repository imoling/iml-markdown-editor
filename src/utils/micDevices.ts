/**
 * 收音设备：列出麦克风、记住用户选的那一个。
 * 选择只存在这台电脑的 localStorage 里 —— 设备 ID 是每台机器各自的，跟着笔记库或设置同步走没有意义。
 */

export interface MicOption { id: string; label: string }

export interface MicList {
  /** 系统当前的默认输入设备叫什么（没授权时读不到名字，为空） */
  systemDefault: string;
  mics: MicOption[];
  /** 没授权麦克风之前，浏览器只告诉你「有几个设备」，不给名字 */
  labelsAvailable: boolean;
}

const PREF_KEY = 'iml.micDeviceId';
/** 「收音设备」选这个 = 收系统声音（网课、线上会议里对方的声音），不是某个麦克风 */
export const SYSTEM_AUDIO_ID = 'system';

/** 空串 = 跟随系统 */
export function getPreferredMic(): string {
  try { return localStorage.getItem(PREF_KEY) || ''; } catch { return ''; }
}

export function setPreferredMic(id: string) {
  try { if (id) localStorage.setItem(PREF_KEY, id); else localStorage.removeItem(PREF_KEY); } catch { /* 隐私模式下存不了就算了 */ }
}

/** 「Default - MacBook Pro Microphone (Built-in)」→「MacBook Pro Microphone」；USB 设备尾巴上的 (046d:0825) 也去掉 */
export function cleanMicLabel(label: string): string {
  return label
    .replace(/^(?:Default|Communications|默认|通信)\s*[-–—]\s*/i, '')
    .replace(/\s*\((?:Built-in|内建|内置|[0-9a-f]{4}:[0-9a-f]{4})\)\s*$/i, '')
    .trim();
}

type DeviceLike = Pick<MediaDeviceInfo, 'kind' | 'deviceId' | 'label'>;

export function describeMics(devices: DeviceLike[]): MicList {
  const inputs = devices.filter((d) => d.kind === 'audioinput');
  // default / communications 是 Chromium 给的「别名」，指向下面某个真实设备，不当成单独的一项
  const real = inputs.filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications');
  const alias = inputs.find((d) => d.deviceId === 'default');
  const labelsAvailable = inputs.some((d) => !!d.label);
  return {
    systemDefault: cleanMicLabel(alias?.label || (real.length === 1 ? real[0].label : '')),
    mics: real.map((d, i) => ({ id: d.deviceId, label: cleanMicLabel(d.label) || `麦克风 ${i + 1}` })),
    labelsAvailable,
  };
}

export async function listMics(): Promise<MicList> {
  try { return describeMics(await navigator.mediaDevices.enumerateDevices()); } catch { return { systemDefault: '', mics: [], labelsAvailable: false }; }
}

/** 用户选的那个还在不在：拔掉了就退回跟随系统（但不清掉他的选择，插回来还用它） */
export function resolveMic(preferred: string, list: MicList): { deviceId: string; missing: boolean } {
  if (!preferred || preferred === SYSTEM_AUDIO_ID) return { deviceId: preferred, missing: false };
  return list.mics.some((m) => m.id === preferred) ? { deviceId: preferred, missing: false } : { deviceId: '', missing: true };
}

/** 面板上显示的「现在用的是哪个麦克风」 */
export function currentMicLabel(preferred: string, list: MicList): string {
  if (preferred === SYSTEM_AUDIO_ID) return '系统声音';
  const chosen = list.mics.find((m) => m.id === preferred);
  if (chosen) return chosen.label;
  return list.systemDefault || (list.labelsAvailable ? '系统默认麦克风' : '');
}

export type MicPermission = 'ok' | 'ask' | 'blocked';

/**
 * 界面上用的授权三态 = 系统 API 的说法 + 我们亲眼看到的事实。
 * 真的收到过声音，就一定是有权限的，比系统 API 可靠；状态读不到（平台没有这道关、或主进程还是没有这个字段的旧版本）
 * 一律当作放行 —— 宁可让用户点开始之后看到真实的报错，也不能在能用的时候说「权限被关掉了」
 */
export function micPermission(access: string | null | undefined, heardSignal: boolean): MicPermission {
  if (heardSignal) return 'ok';
  if (access === 'not-determined') return 'ask';
  if (access === 'denied' || access === 'restricted') return 'blocked';
  return 'ok';
}
