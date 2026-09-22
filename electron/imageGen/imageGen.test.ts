import { describe, expect, it } from 'vitest';
import { runtimeAssetFor, sizeOf, stepsOf, localImageEstimateBytes, estimateMs, formatDuration, IMAGE_MODEL, IMAGE_MODEL_TOTAL_BYTES, SIZE_OPTIONS, DEFAULT_SIZE, DEFAULT_STEPS } from './catalog';
import { buildSdServerArgs, parseJob } from './server';

describe('本机生图：清单', () => {
  it('每个平台挑对运行时压缩包；没有的平台（Windows on ARM）给 null', () => {
    expect(runtimeAssetFor('darwin', 'arm64')).toMatch(/Darwin.*arm64\.zip$/);
    expect(runtimeAssetFor('darwin', 'x64')).toBe(runtimeAssetFor('darwin', 'arm64')); // 通用二进制
    expect(runtimeAssetFor('win32', 'x64')).toMatch(/win-vulkan-x64\.zip$/);
    expect(runtimeAssetFor('win32', 'arm64')).toBeNull();
  });
  it('尺寸都能被 32 整除；认不出的 id 退回默认', () => {
    for (const s of SIZE_OPTIONS) { expect(s.width % 32).toBe(0); expect(s.height % 32).toBe(0); }
    expect(sizeOf('nope').id).toBe(DEFAULT_SIZE);
    expect(stepsOf(undefined).id).toBe(DEFAULT_STEPS);
    expect(stepsOf('standard').steps).toBe(20);
  });

  it('估时间：没画过按保守基准，画过一张之后按那次折算（像素数 × 步数）', () => {
    const s512 = sizeOf('512x512'), s768 = sizeOf('768x768');
    const fast = stepsOf('fast'), standard = stepsOf('standard');
    // 没有实测：按 M4 基础款的基准，512 × 12 步约 5.7 分钟；768 是它的 2.25 倍像素
    expect(estimateMs(s512, fast)).toBe(12 * 28600);
    expect(estimateMs(s768, fast) / estimateMs(s512, fast)).toBeCloseTo(2.25, 5);
    // 有实测（768 二十步花了 1200 秒）：512 十二步应按比例缩到约 320 秒
    const sample = { ms: 1200_000, pixels: 768 * 768, steps: 20 };
    expect(Math.round(estimateMs(s512, fast, sample) / 1000)).toBe(320);
    expect(estimateMs(s768, standard, sample)).toBe(1200_000);
  });

  it('时长说人话', () => {
    expect(formatDuration(42_000)).toBe('约 40 秒');
    expect(formatDuration(3_000)).toBe('约 5 秒');
    expect(formatDuration(320_000)).toBe('约 5 分钟');
    expect(formatDuration(1_260_000)).toBe('约 21 分钟');
    expect(formatDuration(5_400_000)).toBe('约 1.5 小时');
  });
  it('三个文件、总量约 10 GB；内存估算 = 文件 + 工作内存，没装就是 0', () => {
    expect(IMAGE_MODEL.files.map((f) => f.key)).toEqual(['diffusion', 'textEncoder', 'vae']);
    expect(IMAGE_MODEL_TOTAL_BYTES).toBeGreaterThan(10e9);
    expect(localImageEstimateBytes(0)).toBe(0);
    expect(localImageEstimateBytes(10e9)).toBeGreaterThan(12e9);
  });
});

describe('本机生图：sd-server', () => {
  it('启动参数：三个模型、端口、euler + CFG + 默认步数、offload-to-cpu + flash attention（实测最快、最省内存的组合）', () => {
    const args = buildSdServerArgs({ bin: '/x/sd-server', diffusion: '/m/d.gguf', textEncoder: '/m/t.gguf', vae: '/m/v.safetensors', port: 18280, steps: 20, cfgScale: 6, threads: 4 });
    expect(args.join(' ')).toBe('--listen-ip 127.0.0.1 --listen-port 18280 --diffusion-model /m/d.gguf --llm /m/t.gguf --vae /m/v.safetensors --offload-to-cpu --diffusion-fa --sampling-method euler --cfg-scale 6 --steps 20 -t 4');
    expect(args).not.toContain('--vae-conv-direct');   // 实测 VAE 解码反而从 198s 慢到 329s
    expect(buildSdServerArgs({ bin: '', diffusion: '', textEncoder: '', vae: '', port: 1, steps: 1, cfgScale: 1, threads: null })).not.toContain('-t');
  });
  it('出图任务的回包：完成了取 result.images[].b64_json，还在跑给 null，失败 / 取消抛错', () => {
    expect(parseJob({ status: 'queued' })).toBeNull();
    expect(parseJob({ status: 'running' })).toBeNull();
    expect(parseJob({ status: 'completed', result: { output_format: 'png', images: [{ index: 0, b64_json: 'AAA' }, { b64_json: '' }] } })).toEqual(['AAA']);
    expect(() => parseJob({ status: 'failed', error: { code: 'generation_failed', message: '显存不够' } })).toThrow('显存不够');
    expect(() => parseJob({ status: 'cancelled', error: { message: 'job cancelled by client' } })).toThrow('job cancelled by client');
    expect(() => parseJob({ status: 'completed', result: { images: [] } })).toThrow('没有返回图片');
  });
});
