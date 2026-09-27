/**
 * 转写识别进程（Electron utilityProcess）：在这里加载 sherpa-onnx 的原生模块并跑识别循环。
 * 单独一个进程有三个好处：近 1 GB 的内存只在录音期间占用、原生模块崩了不连累主进程、停止录音直接杀掉最干净。
 */
import path from 'path';
import { createPipeline, SAMPLE_RATE, type Recognizer, type Vad } from './pipeline';

interface InitMessage { type: 'init'; glueDir: string; model: string; tokens: string; vad: string; threads: number; /** 声纹模型：要区分说话人时才传 */ speakerModel?: string; /** 'file' = 转写一段已有的录音：不出临时文字，每处理完一块回一个 fed，发送方据此控制节奏 */ mode?: 'mic' | 'file' }
type Incoming = InitMessage | { type: 'pcm'; samples: Float32Array | ArrayBuffer } | { type: 'finish' };

const port = (process as any).parentPort as { on: (ev: 'message', cb: (e: { data: Incoming }) => void) => void; postMessage: (m: unknown) => void };
let pipeline: ReturnType<typeof createPipeline> | null = null;
let fileMode = false;
let fedSamples = 0;

function init(msg: InitMessage) {
  const t0 = Date.now();
  // 胶水层是运行时下载的（在模型存放位置里），路径运行时才知道
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sherpa = require(path.join(msg.glueDir, 'sherpa-onnx.js'));
  const offline = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      senseVoice: { model: msg.model, language: 'auto', useInverseTextNormalization: 1 },
      tokens: msg.tokens, numThreads: msg.threads, provider: 'cpu', debug: 0,
    },
  });
  const nativeVad = new sherpa.Vad({
    sileroVad: { model: msg.vad, threshold: 0.5, minSpeechDuration: 0.25, minSilenceDuration: 0.6, maxSpeechDuration: 20, windowSize: 512 },
    sampleRate: SAMPLE_RATE, numThreads: 1, provider: 'cpu', debug: 0,
  }, 60);

  const recognizer: Recognizer = {
    decode(samples) {
      const stream = offline.createStream();
      stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE });
      offline.decode(stream);
      return offline.getResult(stream).text || '';
    },
  };
  const vad: Vad = {
    acceptWaveform: (w) => nativeVad.acceptWaveform(w),
    isDetected: () => nativeVad.isDetected(),
    isEmpty: () => nativeVad.isEmpty(),
    // Electron 开了 V8 内存沙箱，原生模块不能返回外部缓冲区：必须传 false 让它拷贝一份，否则直接抛错
    front: () => nativeVad.front(false),
    pop: () => nativeVad.pop(),
    flush: () => nativeVad.flush(),
  };
  // 区分说话人：每句话定稿时算一个声纹，送出去由界面那边聚类（那里管着整场的说话人、改名和草稿）
  let embed: ((samples: Float32Array) => number[] | null) | undefined;
  if (msg.speakerModel) {
    try {
      const extractor = new sherpa.SpeakerEmbeddingExtractor({ model: msg.speakerModel, numThreads: 1, debug: 0 });
      embed = (samples) => {
        const stream = extractor.createStream();
        stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE });
        stream.inputFinished();
        if (!extractor.isReady(stream)) return null;          // 太短，凑不够一帧
        return Array.from(extractor.compute(stream, false) as Float32Array, (x) => Math.round(x * 1e4) / 1e4);   // false：同 VAD，不能返回外部缓冲区
      };
    } catch (err: any) {
      port.postMessage({ type: 'warning', message: `声纹模型加载失败，这次不区分说话人：${err?.message || err}` });
    }
  }
  fileMode = msg.mode === 'file';
  // 录音文件是一口气灌进来的，远快于说话的速度：临时文字没有意义，只会白白多识别很多遍
  pipeline = createPipeline(recognizer, vad, (e) => port.postMessage(e), { embed, ...(fileMode ? { partialEveryMs: Number.MAX_SAFE_INTEGER } : {}) });
  port.postMessage({ type: 'ready', loadMs: Date.now() - t0 });
}

port.on('message', ({ data }) => {
  try {
    if (data.type === 'init') init(data);
    else if (data.type === 'pcm') {
      const samples = data.samples instanceof Float32Array ? data.samples : new Float32Array(data.samples);
      pipeline?.feed(samples);
      fedSamples += samples.length;
      // 文件模式：这一块处理完了再要下一块，不然几百 MB 的音频会全堆在消息队列里
      if (fileMode) port.postMessage({ type: 'fed', samples: fedSamples });
    }
    else if (data.type === 'finish') { pipeline?.finish(); port.postMessage({ type: 'done' }); }
  } catch (err: any) {
    port.postMessage({ type: 'error', message: String(err?.message || err) });
  }
});
