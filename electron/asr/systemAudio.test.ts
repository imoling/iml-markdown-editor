import { describe, expect, it } from 'vitest';
import { PcmChunker, describeHelperFailure, SCREEN_PERMISSION_HINT } from './systemAudio';

const f32 = (values: number[]) => Buffer.from(new Float32Array(values).buffer);

describe('系统声音：字节流切块', () => {
  it('凑够一块才给，多出来的留到下一次；跨块的样本一个不丢、顺序不乱', () => {
    const c = new PcmChunker(4 * 4); // 每块 4 个样本
    expect(c.push(f32([1, 2]))).toEqual([]);
    const first = c.push(f32([3, 4, 5]));
    expect(first).toHaveLength(1);
    expect(Array.from(first[0])).toEqual([1, 2, 3, 4]);
    const more = c.push(f32([6, 7, 8, 9, 10, 11, 12, 13]));
    expect(more.map((x) => Array.from(x))).toEqual([[5, 6, 7, 8], [9, 10, 11, 12]]);
    expect(c.push(f32([14, 15, 16])).map((x) => Array.from(x))).toEqual([[13, 14, 15, 16]]);
  });

  it('切出来的块是独立的内存：改一块不影响另一块，也不带着 Buffer 池', () => {
    const c = new PcmChunker(2 * 4);
    const [a, b] = c.push(f32([1, 2, 3, 4]));
    a[0] = 99;
    expect(Array.from(b)).toEqual([3, 4]);
    expect(a.buffer.byteLength).toBe(8);
  });
});

describe('系统声音：捕获工具出错时给用户看的话', () => {
  it('退出码 2 或「declined」= 没有屏幕录制权限，指到系统设置', () => {
    expect(describeHelperFailure(2, 'error: The user declined TCCs (com.apple.ScreenCaptureKit.SCStreamErrorDomain -3801)')).toBe(SCREEN_PERMISSION_HINT);
    expect(describeHelperFailure(1, 'error: something -3801')).toBe(SCREEN_PERMISSION_HINT);
  });
  it('别的错误：带上工具打出来的那一行', () => {
    expect(describeHelperFailure(1, 'ready\nerror: stream stopped: 显示器断开')).toBe('收不到系统声音：stream stopped: 显示器断开');
    expect(describeHelperFailure(null, '')).toBe('收不到系统声音：捕获工具退出（信号）');
  });
});
