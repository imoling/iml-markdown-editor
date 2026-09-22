/**
 * 托管 sd-server（stable-diffusion.cpp）：起、停、等它就绪、发一次生成请求。
 * 接口是 OpenAI 风格的 POST /v1/images/generations（prompt + size），步数、CFG 这些在启动参数里定成默认值。
 */
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { EventEmitter } from 'events';
import { httpJson } from '../localModel/server';

export interface SdServerOptions {
  bin: string;
  diffusion: string;
  textEncoder: string;
  vae: string;
  port: number;
  steps: number;
  cfgScale: number;
  threads?: number | null;
}

export function buildSdServerArgs(o: SdServerOptions): string[] {
  const args = [
    '--listen-ip', '127.0.0.1', '--listen-port', String(o.port),
    '--diffusion-model', o.diffusion, '--llm', o.textEncoder, '--vae', o.vae,
    // 权重放内存、用到时再进显存；扩散部分开 flash attention；Qwen-Image 2.1 推荐 euler + CFG 6
    '--offload-to-cpu', '--diffusion-fa',
    '--sampling-method', 'euler', '--cfg-scale', String(o.cfgScale), '--steps', String(o.steps),
  ];
  if (o.threads && o.threads > 0) args.push('-t', String(o.threads));
  return args;
}

/** 生成接口的回包 → 一张或几张 PNG 的 base64 */
export function parseGenerationResponse(json: any): string[] {
  const items: any[] = Array.isArray(json?.data) ? json.data : [];
  const out = items.map((it) => (typeof it?.b64_json === 'string' ? it.b64_json : '')).filter(Boolean);
  if (!out.length) throw new Error(json?.error?.message || json?.message || (typeof json?.error === 'string' ? json.error : '') || '本机生图没有返回图片');
  return out;
}

export type SdStatus = 'stopped' | 'starting' | 'running' | 'error';
export interface SdState { status: SdStatus; pid: number | null; port: number | null; startedAt: number | null; error: string | null }

export class SdServer extends EventEmitter {
  state: SdState = { status: 'stopped', pid: null, port: null, startedAt: null, error: null };
  private child: ChildProcess | null = null;
  private log: string[] = [];
  get isRunning() { return this.state.status === 'running'; }
  private setState(patch: Partial<SdState>) { this.state = { ...this.state, ...patch }; this.emit('state', this.state); }
  lastLog(n = 12) { return this.log.slice(-n).join('\n'); }

  async start(o: SdServerOptions, signal?: AbortSignal): Promise<SdState> {
    if (this.state.status === 'starting') throw new Error('正在启动中');
    if (this.child) await this.stop();
    const args = buildSdServerArgs(o);
    // 动态库（libstable-diffusion.dylib / .dll）就在可执行文件旁边：工作目录放那儿，@rpath 才找得到
    const child = spawn(o.bin, args, { cwd: path.dirname(o.bin), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, GGML_METAL_LOG_LEVEL: '1' } });
    this.child = child;
    this.log = [];
    this.setState({ status: 'starting', pid: child.pid ?? null, port: o.port, startedAt: Date.now(), error: null });
    const onLine = (buf: Buffer) => { for (const line of buf.toString().split('\n')) { const t = line.trim(); if (t) { this.log.push(t); if (this.log.length > 200) this.log.shift(); this.emit('log', t); } } };
    child.stdout?.on('data', onLine);
    child.stderr?.on('data', onLine);
    child.on('exit', (code, sig) => {
      if (this.child !== child) return;
      this.child = null;
      const wasStarting = this.state.status === 'starting';
      this.setState({ status: wasStarting || code ? 'error' : 'stopped', pid: null, error: wasStarting || code ? `生图服务退出（${code ?? sig}）：${this.lastLog(3)}` : null });
    });
    // 模型要读十几 GB，冷启动可能要几分钟：轮询就绪接口，最多等 8 分钟
    const deadline = Date.now() + 8 * 60 * 1000;
    while (Date.now() < deadline) {
      if (signal?.aborted) { await this.stop(); throw new Error('已取消'); }
      if (this.child !== child) throw new Error(this.state.error || '生图服务没起来');
      try {
        const { status } = await httpJson('GET', `http://127.0.0.1:${o.port}/sdcpp/v1/capabilities`, undefined, 3000);
        if (status === 200) { this.setState({ status: 'running', error: null }); return this.state; }
      } catch { /* 还没起来 */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
    await this.stop();
    throw new Error('生图服务启动超时（8 分钟）');
  }

  async stop(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (child) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* 已退出 */ } resolve(); }, 5000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
        try { child.kill(); } catch { clearTimeout(timer); resolve(); }
      });
    }
    this.setState({ status: 'stopped', pid: null, port: null, error: null });
  }

  /** 生一张图：返回 PNG 的 data: 地址。一张 768 的图在 M 系列上要一两分钟，超时给到 15 分钟 */
  async generate(prompt: string, width: number, height: number): Promise<string[]> {
    if (!this.isRunning || !this.state.port) throw new Error('本机生图服务未运行');
    const { status, json } = await httpJson('POST', `http://127.0.0.1:${this.state.port}/v1/images/generations`, { prompt, n: 1, size: `${width}x${height}`, output_format: 'png' }, 15 * 60 * 1000);
    if (status < 200 || status >= 300) throw new Error(`本机生图 HTTP ${status}：${json?.error?.message || json?.message || json?.error || this.lastLog(2)}`);
    return parseGenerationResponse(json).map((b64) => `data:image/png;base64,${b64}`);
  }
}
