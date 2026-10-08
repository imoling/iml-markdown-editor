import { describe, expect, it } from 'vitest';
import { chatModelOf, describeSetup, formatSize, oneClickBytes, type SetupInput } from './aiSetup';

const model = (over: Record<string, unknown> = {}) => ({ id: 'spark-4b', name: '星火 X2.5-4B', size: 2_600_000_000, downloaded: false, custom: false, recommended: true, partialBytes: 0, download: null, requirement: { level: 'ok' }, ...over });
const local = (over: Record<string, unknown> = {}, m: Record<string, unknown> = {}) => ({ runtime: { installed: true, path: '/x', version: 'b1', source: 'managed' }, install: { active: false, phase: null, tag: null, error: null }, models: [model(m)], ...over }) as unknown as SetupInput['local'];
const semantic = (over: Record<string, unknown> = {}, m: Record<string, unknown> = {}) => ({ enabled: true, modelId: 'bge', runtimeInstalled: true, models: [{ id: 'bge', name: 'BGE-small-zh', size: 26_000_000, downloaded: false, partialBytes: 0, download: null, ...m }], ...over }) as unknown as SetupInput['semantic'];
const asr = (over: Record<string, unknown> = {}) => ({ supported: true, installed: false, downloadBytes: 250_000_000, install: null, ...over }) as unknown as SetupInput['asr'];
const image = (over: Record<string, unknown> = {}) => ({ supported: true, ready: false, modelId: 'z', models: [{ id: 'z', name: 'Z-Image Turbo' }], totalBytes: 6_700_000_000, installedBytes: 0, install: null, ...over }) as unknown as SetupInput['image'];
const base = (over: Partial<SetupInput> = {}): SetupInput => ({ aiEnabled: true, config: { serviceType: 'builtin' }, local: local(), semantic: semantic(), asr: asr(), image: image(), ...over });
const byId = (rows: ReturnType<typeof describeSetup>) => Object.fromEntries(rows.map((r) => [r.id, r]));

describe('快速开始 AI：四行各自差什么', () => {
  it('状态还没读回来：四行都是未知，不画按钮', () => {
    const rows = describeSetup({ aiEnabled: true, config: null, local: null, semantic: null, asr: null, image: null });
    expect(rows.map((r) => r.id)).toEqual(['chat', 'embed', 'asr', 'image']);
    expect(rows.every((r) => r.status === 'unknown')).toBe(true);
  });

  it('什么都没装：四行都是缺的，带着模型名和要下载的大小', () => {
    const r = byId(describeSetup(base()));
    expect(r.chat).toMatchObject({ status: 'missing', model: '星火 X2.5-4B' });
    expect(r.chat.bytes).toBeGreaterThan(2_600_000_000);
    expect(r.embed).toMatchObject({ status: 'missing', model: 'BGE-small-zh', bytes: 26_000_000 });
    expect(r.asr).toMatchObject({ status: 'missing', model: 'SenseVoice', bytes: 250_000_000 });
    expect(r.image).toMatchObject({ status: 'missing', model: 'Z-Image Turbo', bytes: 6_700_000_000 });
    expect(oneClickBytes(Object.values(r))).toBe(r.chat.bytes + 26_000_000 + 250_000_000);
  });

  it('都装好了：四行就绪，要下载的大小是 0，一键装好没东西可装', () => {
    const rows = describeSetup(base({ local: local({}, { downloaded: true }), semantic: semantic({}, { downloaded: true }), asr: asr({ installed: true }), image: image({ ready: true, installedBytes: 6_700_000_000 }) }));
    expect(rows.every((r) => r.status === 'ready' && r.bytes === 0)).toBe(true);
    expect(oneClickBytes(rows)).toBe(0);
  });

  it('正在下载：进度按收到的字节算，校验那一步算满；出错带原因', () => {
    const r = byId(describeSetup(base({
      local: local({}, { download: { active: true, received: 1_300_000_000, total: 2_600_000_000, phase: 'downloading' } }),
      semantic: semantic({}, { download: { active: true, received: 0, total: 0, phase: 'verifying' } }),
      asr: asr({ install: { active: true, received: 50, total: 200, step: '语音模型', error: null } }),
      image: image({ install: { active: false, received: 0, total: 0, step: '', error: '网络断了' } }),
    })));
    expect(r.chat).toMatchObject({ status: 'installing', progress: 0.5, step: '下载 星火 X2.5-4B' });
    expect(r.embed).toMatchObject({ status: 'installing', progress: 1, step: '正在校验文件' });
    expect(r.asr).toMatchObject({ status: 'installing', progress: 0.25, step: '下载语音模型' });
    expect(r.image).toMatchObject({ status: 'missing', error: '下载失败：网络断了' });
  });

  it('运行组件还没装：对话和问笔记两行都显示在装运行组件；模型已经在了也一样', () => {
    const l = local({ runtime: { installed: false, path: null, version: null, source: null }, install: { active: true, phase: 'downloading', tag: 'b1', received: 30, total: 100, error: null } }, { downloaded: true });
    const r = byId(describeSetup(base({ local: l, semantic: semantic({ runtimeInstalled: false }, { downloaded: true }) })));
    expect(r.chat).toMatchObject({ status: 'installing', progress: 0.3, step: '下载运行组件' });
    expect(r.embed).toMatchObject({ status: 'installing', progress: 0.3, step: '下载运行组件' });
    // 装失败了：两行都说
    const failed = local({ runtime: { installed: false, path: null, version: null, source: null }, install: { active: false, phase: null, tag: null, error: '解压失败' } });
    const f = byId(describeSetup(base({ local: failed, semantic: semantic({ runtimeInstalled: false }) })));
    expect(f.chat).toMatchObject({ status: 'missing', error: '安装运行组件失败：解压失败' });
    expect(f.embed.error).toBe('安装运行组件失败：解压失败');
  });

  it('配了网络服务：对话那一行算「用的是网络服务」，本机模型装不装随意；没填地址的不算', () => {
    const cloud = byId(describeSetup(base({ config: { serviceType: 'cloud', endpoint: 'https://api.example.com/v1' } })));
    expect(cloud.chat.status).toBe('cloud');
    const empty = byId(describeSetup(base({ config: { serviceType: 'cloud', endpoint: '  ' } })));
    expect(empty.chat.status).toBe('missing');
    // 本机模型装好了、但当前用的是网络服务：也归到这一类，界面给「改用本机」
    const both = byId(describeSetup(base({ config: { serviceType: 'cloud', endpoint: 'https://x' }, local: local({}, { downloaded: true }) })));
    expect(both.chat.status).toBe('cloud');
  });

  it('嵌入模型下好了但没开：不算就绪（问笔记还是用不了）', () => {
    const r = byId(describeSetup(base({ semantic: semantic({ enabled: false }, { downloaded: true }) })));
    expect(r.embed.status).toBe('missing');
    expect(r.embed.bytes).toBe(0);
  });

  it('这台电脑不支持转写 / 生图：单独一种状态，不给装', () => {
    const r = byId(describeSetup(base({ asr: asr({ supported: false }), image: image({ supported: false }) })));
    expect(r.asr.status).toBe('unsupported');
    expect(r.image.status).toBe('unsupported');
    expect(oneClickBytes(Object.values(r))).toBe(r.chat.bytes + 26_000_000);
  });

  it('对话用哪个模型：配置里选的优先；没选或选的不在清单里，按这台机器挑最大能跑的', () => {
    const small = model({ id: 'small', name: '小的', size: 1, recommended: false });
    const big = model({ id: 'big', name: '大的', size: 9, requirement: { level: 'too-big' } });
    const l = local({ models: [small, model(), big] });
    expect(chatModelOf(l, { local: { modelId: 'small' } })?.name).toBe('小的');
    expect(chatModelOf(l, { local: { modelId: '不存在' } })?.name).toBe('星火 X2.5-4B');
    expect(chatModelOf(l, null)?.name).toBe('星火 X2.5-4B');
    expect(chatModelOf(null, null)).toBeNull();
  });

  it('大小的写法', () => {
    expect(formatSize(26_000_000)).toBe('25 MB');
    expect(formatSize(2_600_000_000)).toBe('2.4 GB');
    expect(formatSize(100)).toBe('1 MB');
  });
});
