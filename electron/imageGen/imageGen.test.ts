import { describe, expect, it } from 'vitest';
import {
  runtimeAssetFor, sizeOf, stepsForModel, stepOptionsFor, localImageEstimateBytes, estimateMs, formatDuration,
  imageModelOf, modelTotalBytes, IMAGE_MODELS, DEFAULT_IMAGE_MODEL, SIZE_OPTIONS, DEFAULT_SIZE,
} from './catalog';
import { buildSdServerArgs, parseJob } from './server';

describe('本机生图：清单', () => {
  it('每个平台挑对运行时压缩包；没有的平台（Windows on ARM）给 null', () => {
    expect(runtimeAssetFor('darwin', 'arm64')).toMatch(/Darwin.*arm64\.zip$/);
    expect(runtimeAssetFor('darwin', 'x64')).toBe(runtimeAssetFor('darwin', 'arm64')); // 通用二进制
    expect(runtimeAssetFor('win32', 'x64')).toMatch(/win-vulkan-x64\.zip$/);
    expect(runtimeAssetFor('win32', 'arm64')).toBeNull();
  });

  it('尺寸都能被 32 整除（模型的要求）；认不出的 id 退回默认', () => {
    for (const s of SIZE_OPTIONS) { expect(s.width % 32).toBe(0); expect(s.height % 32).toBe(0); }
    expect(sizeOf('nope').id).toBe(DEFAULT_SIZE);
  });

  it('两个模型：默认是快的那个；每个都有三件套、自己的 CFG 和步数档', () => {
    expect(IMAGE_MODELS.map((m) => m.id)).toEqual(['z-image-turbo-q4k', 'qwen-image-2.1-q4km']);
    expect(DEFAULT_IMAGE_MODEL).toBe('z-image-turbo-q4k');
    for (const m of IMAGE_MODELS) {
      expect(m.files.map((f) => f.key)).toEqual(['diffusion', 'textEncoder', 'vae']);
      for (const f of m.files) { expect(f.size).toBeGreaterThan(0); expect(f.sha256).toMatch(/^[0-9a-f]{64}$/); }
      // 步数档要属于这个模型，默认那一档也得在里面；配置里存着别的模型的档位就退回默认
      const opts = stepOptionsFor(m);
      expect(opts.length).toBeGreaterThan(1);
      expect(opts.map((o) => o.id)).toContain(m.defaultStepsId);
      expect(stepsForModel(m, '不存在的档').id).toBe(m.defaultStepsId);
    }
    // 蒸馏模型 CFG 是 1（每步只跑一遍），普通模型要跑两遍
    expect(imageModelOf('z-image-turbo-q4k').cfgScale).toBe(1);
    expect(imageModelOf('qwen-image-2.1-q4km').cfgScale).toBeGreaterThan(1);
    expect(imageModelOf('乱写').id).toBe(DEFAULT_IMAGE_MODEL);
    expect(modelTotalBytes(imageModelOf('z-image-turbo-q4k'))).toBeLessThan(modelTotalBytes(imageModelOf('qwen-image-2.1-q4km')));
    // 内存按实测峰值算，不按文件大小推：Qwen 文件 10.3 GB，实测峰值只有 5.6 GB
    for (const m of IMAGE_MODELS) {
      expect(localImageEstimateBytes(m, false)).toBe(0);
      expect(localImageEstimateBytes(m, true)).toBeGreaterThan(m.peakBytes);
      expect(localImageEstimateBytes(m, true)).toBeLessThan(modelTotalBytes(m) * 1.05 + 2.5 * 1024 ** 3);
    }
  });

  it('估时间：每个模型一条自己的实测曲线；第一次多算一次模型加载', () => {
    const z = imageModelOf('z-image-turbo-q4k'), q = imageModelOf('qwen-image-2.1-q4km');
    const s512 = sizeOf('512x512'), s768 = sizeOf('768x768');
    const z8 = stepsForModel(z, 'turbo8'), q20 = stepsForModel(q, 'standard');
    // 四次实测都落在各自的曲线上（Z-Image 768/512 各八步 175 s / 84 s，Qwen 768 二十步 1259 s）
    expect(estimateMs(z, s768, z8) / 1000).toBeCloseTo(175, -2);
    expect(estimateMs(z, s512, z8) / 1000).toBeCloseTo(84, -2);
    expect(estimateMs(q, s768, q20) / 1000).toBeCloseTo(1259, -2);
    // 同尺寸下 Z-Image 快好几倍
    expect(estimateMs(q, s768, q20) / estimateMs(z, s768, z8)).toBeGreaterThan(5);
    // 两个模型的瓶颈不一样：Qwen 被每步的固定开销压着，降分辨率省不了多少；Z-Image 降一半分辨率时间接近减半
    expect(estimateMs(z, s512, z8) / estimateMs(z, s768, z8)).toBeLessThan(0.6);
    expect(estimateMs(q, s512, q20) / estimateMs(q, s768, q20)).toBeGreaterThan(0.6);
    // 第一次出图要先加载模型
    expect(estimateMs(z, s768, z8, null, { includeModelLoad: true })).toBeGreaterThan(estimateMs(z, s768, z8) + 5000);
    // 有实测就把整条曲线缩放到这台机器上
    const twiceAsFast = { ms: estimateMs(z, s768, z8) / 2, pixels: 768 * 768, steps: 8 };
    expect(estimateMs(z, s512, z8, twiceAsFast)).toBeCloseTo(estimateMs(z, s512, z8) / 2, -1);
  });

  it('时长说人话', () => {
    expect(formatDuration(42_000)).toBe('约 40 秒');
    expect(formatDuration(3_000)).toBe('约 5 秒');
    expect(formatDuration(320_000)).toBe('约 5 分钟');
    expect(formatDuration(1_260_000)).toBe('约 21 分钟');
    expect(formatDuration(5_400_000)).toBe('约 1.5 小时');
  });
});

describe('本机生图：sd-server', () => {
  it('启动参数：三个模型、端口、euler + CFG + 默认步数、flash attention；内存小的机器加 offload-to-cpu', () => {
    const base = { bin: '/x/sd-server', diffusion: '/m/d.gguf', textEncoder: '/m/t.gguf', vae: '/m/v.safetensors', port: 18280, steps: 20, cfgScale: 6, threads: 4 };
    expect(buildSdServerArgs(base).join(' ')).toBe('--listen-ip 127.0.0.1 --listen-port 18280 --diffusion-model /m/d.gguf --llm /m/t.gguf --vae /m/v.safetensors --diffusion-fa --sampling-method euler --cfg-scale 6 --steps 20 --offload-to-cpu -t 4');
    // 内存充裕的机器关掉：快约 15%，峰值多 4.5 GB
    expect(buildSdServerArgs({ ...base, offloadToCpu: false })).not.toContain('--offload-to-cpu');
    expect(buildSdServerArgs(base)).not.toContain('--vae-conv-direct');   // 实测 VAE 解码反而从 198s 慢到 329s
    expect(buildSdServerArgs({ bin: '', diffusion: '', textEncoder: '', vae: '', port: 1, steps: 1, cfgScale: 1, threads: null })).not.toContain('-t');
  });

  it('出图任务的回包：完成了取 result.images[].b64_json，还在跑给 null，失败 / 取消抛错', () => {
    expect(parseJob({ status: 'queued' })).toBeNull();
    expect(parseJob({ status: 'generating' })).toBeNull();   // 实测的状态字是 generating，不是文档写的 running
    expect(parseJob({ status: 'completed', result: { output_format: 'png', images: [{ index: 0, b64_json: 'AAA' }, { b64_json: '' }] } })).toEqual(['AAA']);
    expect(() => parseJob({ status: 'failed', error: { code: 'generation_failed', message: '显存不够' } })).toThrow('显存不够');
    expect(() => parseJob({ status: 'cancelled', error: { message: 'job cancelled by client' } })).toThrow('job cancelled by client');
    expect(() => parseJob({ status: 'completed', result: { images: [] } })).toThrow('没有返回图片');
  });
});
