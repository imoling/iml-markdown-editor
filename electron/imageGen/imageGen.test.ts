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
    expect(DEFAULT_SIZE).toBe('768x768');   // 降分辨率省不了多少时间，默认就用模型推荐的
    expect(stepsOf(undefined).id).toBe(DEFAULT_STEPS);
    expect(stepsOf('standard').steps).toBe(20);
  });

  it('估时间：按「每步固定开销 + 每像素」的实测曲线，步数是主要变量；第一次多算一次模型加载', () => {
    const s512 = sizeOf('512x512'), s768 = sizeOf('768x768');
    const draft = stepsOf('draft'), standard = stepsOf('standard');
    // 两次实测都落在曲线上（512×512 八步 7.6 分、768×768 二十步 21.4 分），允许 8% 误差
    expect(estimateMs(s512, draft) / 1000).toBeCloseTo(419, -2);
    expect(estimateMs(s768, standard) / 1000).toBeCloseTo(1259, -2);
    // 步数翻倍接近翻倍；分辨率翻倍远远不到翻倍（每步的固定开销压倒一切）
    const bySteps = estimateMs(s768, stepsOf('fine')) / estimateMs(s768, standard);
    const bySize = estimateMs(sizeOf('1024x1024'), standard) / estimateMs(s768, standard);
    expect(bySteps).toBeGreaterThan(1.4);
    expect(bySize).toBeLessThan(1.4);
    // 第一次出图要先加载模型
    expect(estimateMs(s768, standard, null, { includeModelLoad: true })).toBeGreaterThan(estimateMs(s768, standard) + 30000);
    // 有实测就把整条曲线缩放到这台机器上：快一倍的机器，别的组合也估成一半
    const twiceAsFast = { ms: estimateMs(s768, standard) / 2, pixels: 768 * 768, steps: 20 };
    expect(estimateMs(s512, draft, twiceAsFast)).toBeCloseTo(estimateMs(s512, draft) / 2, -1);
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
