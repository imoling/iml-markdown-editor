/**
 * 系统声音当作一路「麦克风」：主进程的捕获工具每 100 ms 送来一块 16 kHz 的 PCM，
 * 这里 ① 算电平、交给调用方（喂识别进程），② 用 AudioWorklet 把它放成一条 MediaStream——录音机只认流。
 * 返回的形状和 startMicCapture 一样，转写那边不用区分。
 */
import type { MicCapture } from './micCapture';

export const SYSTEM_AUDIO_LABEL = '系统声音';

const WORKLET = `
class Src extends AudioWorkletProcessor {
  constructor() { super(); this.queue = []; this.head = 0; this.primed = false; this.port.onmessage = (e) => { this.queue.push(e.data); }; }
  process(_inputs, outputs) {
    const out = outputs[0][0];
    if (!out) return true;
    // prime: wait for two chunks before draining so a hiccup does not stutter
    if (!this.primed) { if (this.queue.length < 2) return true; this.primed = true; }
    let i = 0;
    while (i < out.length && this.queue.length) {
      const cur = this.queue[0];
      const take = Math.min(out.length - i, cur.length - this.head);
      out.set(cur.subarray(this.head, this.head + take), i);
      i += take; this.head += take;
      if (this.head >= cur.length) { this.queue.shift(); this.head = 0; }
    }
    if (!this.queue.length) this.primed = false;
    return true;
  }
}
registerProcessor('iml-pcm-source', Src);`;

/** 和麦克风那边同一个算法：给电平条用的 0~1 */
export function levelOf(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i += 8) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, samples.length / 8));
  return Math.min(1, Math.sqrt(rms) * 1.8);
}

export function systemAudioAvailable(): boolean {
  return window.api.app.platform === 'darwin' && typeof window.api.asr.onSystemPcm === 'function';
}

export async function startSystemCapture(onChunk: (samples: Float32Array, level: number) => void): Promise<MicCapture> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    // 不用 btoa：源码里有非 Latin1 字符会炸；按 UTF-8 转义即可
    await ctx.audioWorklet.addModule(`data:application/javascript;charset=utf-8,${encodeURIComponent(WORKLET)}`);
  } catch (err: any) {
    await ctx.close().catch(() => {});
    throw new Error(`音频处理模块加载失败：${err?.message || err}`);
  }
  const src = new AudioWorkletNode(ctx, 'iml-pcm-source', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1] });
  const dest = ctx.createMediaStreamDestination();
  src.connect(dest);
  const off = window.api.asr.onSystemPcm((buf) => {
    const samples = buf instanceof Float32Array ? buf : new Float32Array(buf);
    src.port.postMessage(samples);
    onChunk(samples, levelOf(samples));
  });
  return {
    stream: dest.stream,
    label: SYSTEM_AUDIO_LABEL,
    fellBack: false,
    stop: () => {
      off();
      try { src.disconnect(); } catch { /* 已经断开 */ }
      void ctx.close().catch(() => {});
    },
  };
}
