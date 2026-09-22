import { describe, expect, it } from 'vitest';
import { runtimeAssetFor, sizeOf, stepsOf, localImageEstimateBytes, IMAGE_MODEL, IMAGE_MODEL_TOTAL_BYTES, SIZE_OPTIONS } from './catalog';
import { buildSdServerArgs, parseGenerationResponse } from './server';

describe('本机生图：清单', () => {
  it('每个平台挑对运行时压缩包；没有的平台（Windows on ARM）给 null', () => {
    expect(runtimeAssetFor('darwin', 'arm64')).toMatch(/Darwin.*arm64\.zip$/);
    expect(runtimeAssetFor('darwin', 'x64')).toBe(runtimeAssetFor('darwin', 'arm64')); // 通用二进制
    expect(runtimeAssetFor('win32', 'x64')).toMatch(/win-vulkan-x64\.zip$/);
    expect(runtimeAssetFor('win32', 'arm64')).toBeNull();
  });
  it('尺寸都能被 32 整除；认不出的 id 退回默认', () => {
    for (const s of SIZE_OPTIONS) { expect(s.width % 32).toBe(0); expect(s.height % 32).toBe(0); }
    expect(sizeOf('nope').id).toBe('768x768');
    expect(stepsOf(undefined).steps).toBe(20);
  });
  it('三个文件、总量约 10 GB；内存估算 = 文件 + 工作内存，没装就是 0', () => {
    expect(IMAGE_MODEL.files.map((f) => f.key)).toEqual(['diffusion', 'textEncoder', 'vae']);
    expect(IMAGE_MODEL_TOTAL_BYTES).toBeGreaterThan(10e9);
    expect(localImageEstimateBytes(0)).toBe(0);
    expect(localImageEstimateBytes(10e9)).toBeGreaterThan(12e9);
  });
});

describe('本机生图：sd-server', () => {
  it('启动参数：三个模型、端口、euler + CFG + 步数、权重放内存、flash attention', () => {
    const args = buildSdServerArgs({ bin: '/x/sd-server', diffusion: '/m/d.gguf', textEncoder: '/m/t.gguf', vae: '/m/v.safetensors', port: 18280, steps: 20, cfgScale: 6, threads: 4 });
    expect(args.join(' ')).toBe('--listen-ip 127.0.0.1 --listen-port 18280 --diffusion-model /m/d.gguf --llm /m/t.gguf --vae /m/v.safetensors --offload-to-cpu --diffusion-fa --sampling-method euler --cfg-scale 6 --steps 20 -t 4');
    expect(buildSdServerArgs({ bin: '', diffusion: '', textEncoder: '', vae: '', port: 1, steps: 1, cfgScale: 1, threads: null })).not.toContain('-t');
  });
  it('回包：取 data[].b64_json；没图就把错误说出来', () => {
    expect(parseGenerationResponse({ created: 1, data: [{ b64_json: 'AAA' }, { b64_json: '' }] })).toEqual(['AAA']);
    expect(() => parseGenerationResponse({ error: { message: '显存不够' } })).toThrow('显存不够');
    expect(() => parseGenerationResponse({ error: 'server_error', message: '炸了' })).toThrow('炸了');
    expect(() => parseGenerationResponse({})).toThrow('没有返回图片');
  });
});
