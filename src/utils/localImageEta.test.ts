import { describe, expect, it } from 'vitest';
import { describeProgress, clock } from './localImageEta';

describe('出图各阶段说人话', () => {
  it('没有进度时退回「已用 / 预计」', () => {
    expect(describeProgress(null, '1:23', '约 3 分钟')).toBe('1:23 / 约 3 分钟');
  });

  it('腾内存、启服务、读模型这几步都有话说（本机出图最容易被误以为卡死的就是这一段）', () => {
    expect(describeProgress({ phase: 'freeing' }, '0:01', '约 3 分钟')).toBe('正在准备');
    expect(describeProgress({ phase: 'freeing', current: 2 }, '0:02', '约 3 分钟')).toBe('正在腾内存：先把别的本机模型停一下');
    expect(describeProgress({ phase: 'starting' }, '0:05', '约 3 分钟')).toBe('正在启动生图服务');
    expect(describeProgress({ phase: 'loading', current: 149, total: 297 }, '0:20', '约 3 分钟')).toBe('正在读模型 50%');
    expect(describeProgress({ phase: 'loading', current: 297, total: 297 }, '0:30', '约 3 分钟')).toBe('正在读模型 99%');   // 读完前不显示 100%
    expect(describeProgress({ phase: 'encoding' }, '0:35', '约 3 分钟')).toBe('正在理解这句提示词');
  });

  it('采样时报第几步，并按实测的每步秒数算还剩多久', () => {
    expect(describeProgress({ phase: 'sampling', current: 3, total: 8, secPerStep: 20 }, '1:00', '约 3 分钟')).toBe('正在出图 3/8 步，还要约 2 分钟');
    expect(describeProgress({ phase: 'sampling', current: 6, total: 8, secPerStep: 20 }, '2:00', '约 3 分钟')).toBe('正在出图 6/8 步，还要约 40 秒');
    expect(describeProgress({ phase: 'sampling', current: 8, total: 8, secPerStep: 20 }, '2:40', '约 3 分钟')).toBe('正在出图 8/8 步，还要约 5 秒');
    expect(describeProgress({ phase: 'sampling', current: 1, total: 8 }, '0:40', '约 3 分钟')).toBe('正在出图 1/8 步');
    expect(describeProgress({ phase: 'decoding' }, '2:50', '约 3 分钟')).toBe('正在出图（最后一步）');
  });

  it('秒表', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(65_000)).toBe('1:05');
    expect(clock(3_601_000)).toBe('60:01');
  });
});
