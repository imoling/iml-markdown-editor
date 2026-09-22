/**
 * 系统声音（macOS）：网课、戴耳机开线上会议时，收的是电脑放出来的声音而不是麦克风。
 * 靠一个小工具 syscap（ScreenCaptureKit，见 native/syscap.swift）把系统声音转成 16 kHz float32 PCM 写到它的标准输出，
 * 这里切成每 100 ms 一块，交给渲染进程——和麦克风走同一条路（电平、录音、喂识别进程）。
 * Electron 自带的 loopback 只支持 Windows；macOS 只能这样。第一次用系统会请求「屏幕录制」权限（系统声音走的是这个权限）。
 */
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export const CHUNK_SAMPLES = 1600; // 100 ms @ 16 kHz，和麦克风一致
const CHUNK_BYTES = CHUNK_SAMPLES * 4;

export const SCREEN_PERMISSION_HINT = '收系统声音需要「屏幕录制」权限：系统设置 → 隐私与安全性 → 屏幕录制 里允许 iML Markdown Editor，然后再试';

/** 把字节流切成整块的 float32 PCM；不够一块的留到下一次 */
export class PcmChunker {
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  constructor(private readonly chunkBytes = CHUNK_BYTES) {}
  push(data: Buffer): Float32Array[] {
    this.pending.push(data);
    this.pendingBytes += data.length;
    if (this.pendingBytes < this.chunkBytes) return [];
    const all = Buffer.concat(this.pending);
    const out: Float32Array[] = [];
    let offset = 0;
    while (all.length - offset >= this.chunkBytes) {
      // 复制到自己的 ArrayBuffer：Buffer 池里的内存不保证 4 字节对齐，也不能把整个池子发出去
      const ab = new ArrayBuffer(this.chunkBytes);
      all.copy(new Uint8Array(ab), 0, offset, offset + this.chunkBytes);
      out.push(new Float32Array(ab));
      offset += this.chunkBytes;
    }
    const rest = all.subarray(offset);
    this.pending = rest.length ? [Buffer.from(rest)] : [];
    this.pendingBytes = rest.length;
    return out;
  }
}

/** 小工具的错误 → 给用户看的话 */
export function describeHelperFailure(code: number | null, stderr: string): string {
  if (code === 2 || /declined|-3801/i.test(stderr)) return SCREEN_PERMISSION_HINT;
  const line = stderr.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('error:')).pop();
  return `收不到系统声音：${line ? line.replace(/^error:\s*/, '') : `捕获工具退出（${code ?? '信号'}）`}`;
}

export function helperPath(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'bin', 'syscap') : path.join(app.getAppPath(), 'build', 'bin', 'syscap');
}

export function systemAudioSupported(): boolean {
  return process.platform === 'darwin' && fs.existsSync(helperPath());
}

export interface SystemAudio { stop: () => void }

/** 起捕获工具；ready 了才返回。onChunk 每 100 ms 一次；onExit 在它意外退出时叫（带给用户看的原因） */
export function startSystemAudio(onChunk: (samples: Float32Array) => void, onExit: (reason: string) => void): Promise<SystemAudio> {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') return reject(new Error('系统声音目前只支持 macOS'));
    const bin = helperPath();
    if (!fs.existsSync(bin)) return reject(new Error('缺少系统声音捕获工具（开发模式：先跑 node scripts/build-syscap.mjs）'));
    const child: ChildProcess = spawn(bin, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunker = new PcmChunker();
    let stderr = '';
    let ready = false;
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      try { child.stdin?.end(); } catch { /* 已经关了 */ }
      setTimeout(() => { try { child.kill(); } catch { /* 已退出 */ } }, 1500).unref();
    };
    child.stdout?.on('data', (data: Buffer) => { for (const chunk of chunker.push(data)) onChunk(chunk); });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (!ready && /^ready$/m.test(stderr)) { ready = true; resolve({ stop }); }
    });
    child.on('error', (err) => { if (!ready) reject(new Error(`系统声音捕获工具起不来：${err.message}`)); });
    child.on('exit', (code) => {
      if (stopped) return;
      const reason = describeHelperFailure(code, stderr);
      if (!ready) reject(new Error(reason)); else onExit(reason);
    });
    setTimeout(() => { if (!ready && !stopped) { stop(); reject(new Error('系统声音捕获工具没有响应')); } }, 15000).unref();
  });
}
