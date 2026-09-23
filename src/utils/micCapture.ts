/**
 * 麦克风采集：getUserMedia → 16 kHz 单声道 → 每 100 ms 一块 Float32。
 * 重采样交给 Chromium（AudioContext 直接开在 16 kHz）；分块在 AudioWorklet 里做，不占主线程。
 * Worklet 的代码走 data: URL —— 应用的 CSP 允许 data:，不允许 blob:，也省得为它单独放一个静态文件。
 */

import { cleanMicLabel } from './micDevices';
import { MIC_DENIED, AUDIO_WORKLET_FAILED } from './uiText';

const CHUNK = 1600;   // 100 ms @ 16 kHz

/** 显示用的电平（压缩过的 0~1）低于它算「没有信号」：约 -78 dBFS，真实麦克风的底噪都比这高 */
export const MIC_SILENCE_LEVEL = 0.02;

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(${CHUNK}); this.n = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    let i = 0;
    while (i < ch.length) {
      const take = Math.min(ch.length - i, ${CHUNK} - this.n);
      this.buf.set(ch.subarray(i, i + take), this.n);
      this.n += take; i += take;
      if (this.n === ${CHUNK}) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor('iml-mic-tap', Tap);`;

export interface MicCapture {
  stop: () => void;
  /** 麦克风的原始流：要留录音的话从这里再接一路出去 */
  stream: MediaStream;
  /** 实际在用的设备名 */
  label: string;
  /** 指定的设备没连上，退回了系统默认 */
  fellBack: boolean;
}

// Chromium 的降噪、自动增益、回声消除全部关掉，把原始声音交给识别模型。
// 实测开着降噪 / 增益时，每次停顿之后重新起音的第一个音节会被压掉（「大家好」识别成「好」、「最后」识别成「后」）；
// 语音模型本来就是拿带噪数据训练的，这层「美化」对它只有害处
const RAW_AUDIO = { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false };

/**
 * level 是这一块的音量（0~1，已做过适合显示的压缩），给界面上的电平条用。
 * deviceId 为空 = 跟随系统默认；指定的设备拔掉了就退回默认，不让一场会因为这个开不了头
 */
export async function startMicCapture(onChunk: (samples: Float32Array, level: number) => void, deviceId = ''): Promise<MicCapture> {
  let stream: MediaStream;
  let fellBack = false;
  try {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { ...RAW_AUDIO, deviceId: { exact: deviceId } } : RAW_AUDIO });
    } catch (err: any) {
      if (!deviceId || (err?.name !== 'OverconstrainedError' && err?.name !== 'NotFoundError')) throw err;
      stream = await navigator.mediaDevices.getUserMedia({ audio: RAW_AUDIO });
      fellBack = true;
    }
  } catch (err: any) {
    if (err?.name === 'NotAllowedError') throw new Error(MIC_DENIED);
    if (err?.name === 'NotFoundError') throw new Error('没有找到麦克风');
    throw new Error(`打不开麦克风：${err?.message || err}`);
  }
  const label = cleanMicLabel(stream.getAudioTracks()[0]?.label || '');

  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    await ctx.audioWorklet.addModule(`data:application/javascript;base64,${btoa(WORKLET)}`);
  } catch (err: any) {
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close().catch(() => {});
    throw new Error(`${AUDIO_WORKLET_FAILED}：${err?.message || err}`);
  }
  const source = ctx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(ctx, 'iml-mic-tap');
  tap.port.onmessage = (ev: MessageEvent<Float32Array>) => {
    const samples = ev.data;
    let sum = 0;
    for (let i = 0; i < samples.length; i += 8) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / (samples.length / 8));
    onChunk(samples, Math.min(1, Math.sqrt(rms) * 1.8));
  };
  // Worklet 得接到输出上才会被调度；增益设成 0，不会把麦克风的声音放出来
  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(tap).connect(mute).connect(ctx.destination);

  return {
    stream,
    label,
    fellBack,
    stop: () => {
      tap.port.onmessage = null;
      try { source.disconnect(); tap.disconnect(); mute.disconnect(); } catch { /* 已经断开 */ }
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close().catch(() => {});
    },
  };
}
