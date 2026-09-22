/**
 * 托管 sd-server（stable-diffusion.cpp）：起、停、等它就绪、出图。
 * 出图走它自己的异步接口（POST /sdcpp/v1/img_gen → 轮询 /sdcpp/v1/jobs/{id}）而不是 OpenAI 风格的同步接口：
 * 本机出一张图要几分钟到十几分钟，同步请求会被超时掐掉，而且没法中途取消。异步接口还能逐次指定步数，
 * 换步数不用重启服务。CFG、采样器这些在启动参数里定成默认值。
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
  /** 默认步数：每次出图会自己带，这里只是兜底 */
  steps: number;
  cfgScale: number;
  threads?: number | null;
  /** 权重放内存、用时再搬（默认开）。内存充裕的机器关掉它能快约 15%，代价是峰值多 4.5 GB */
  offloadToCpu?: boolean;
}

export function buildSdServerArgs(o: SdServerOptions): string[] {
  const args = [
    '--listen-ip', '127.0.0.1', '--listen-port', String(o.port),
    '--diffusion-model', o.diffusion, '--llm', o.textEncoder, '--vae', o.vae,
    // 扩散部分开 flash attention；Qwen-Image 2.1 推荐 euler + CFG 6
    '--diffusion-fa',
    '--sampling-method', 'euler', '--cfg-scale', String(o.cfgScale), '--steps', String(o.steps),
  ];
  // 权重留在内存、用到时再搬进显存。同一台机器（M4 24 GB）实测 512 × 512 八步：
  //   带 --offload-to-cpu：采样 41.4 s/步 + VAE 88 s ≈ 419 s，峰值 5.6 GB
  //   不带：            采样 30.9 s/步 + VAE 110 s ≈ 357 s，峰值 10.1 GB（快 15%，多吃 4.5 GB）
  // 所以内存小的机器一律 offload：省下的 4.5 GB 比那 15% 值钱得多（真机验证时就因为内存吃紧被系统杀过一次）；
  // 32 GB 以上的机器放开跑。`--vae-conv-direct` 别加，实测 VAE 反而从 198 s 慢到 329 s
  if (o.offloadToCpu !== false) args.push('--offload-to-cpu');
  if (o.threads && o.threads > 0) args.push('-t', String(o.threads));
  return args;
}

/**
 * 出图任务的回包 → 一张或几张 PNG 的 base64；还没画完返回 null（状态是 queued / generating）；失败、被取消则抛错。
 * 状态字符串以实测为准：排队是 queued，正在画是 generating（不是文档里写的 running）
 */
export function parseJob(json: any): string[] | null {
  const status = String(json?.status || '');
  if (status === 'failed' || status === 'cancelled') throw new Error(json?.error?.message || (status === 'cancelled' ? '已取消' : '出图失败'));
  if (status !== 'completed') return null;
  const items: any[] = Array.isArray(json?.result?.images) ? json.result.images : Array.isArray(json?.data) ? json.data : [];
  const out = items.map((it) => (typeof it?.b64_json === 'string' ? it.b64_json : '')).filter(Boolean);
  if (!out.length) throw new Error('本机生图没有返回图片');
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

  /**
   * 生一张图：提交任务 → 每秒问一次 → 拿到图。返回 PNG 的 data: 地址。
   * 本机出图慢（768 二十步在 M 系列上要几分钟），signal 一断就告诉服务端取消，不白占着 GPU
   */
  async generate(prompt: string, width: number, height: number, steps: number, opts: { signal?: AbortSignal; onQueue?: (position: number) => void } = {}): Promise<string[]> {
    if (!this.isRunning || !this.state.port) throw new Error('本机生图服务未运行');
    const base = `http://127.0.0.1:${this.state.port}/sdcpp/v1`;
    const { status, json } = await httpJson('POST', `${base}/img_gen`, {
      prompt, width, height, batch_count: 1, output_format: 'png',
      sample_params: { sample_method: 'euler', sample_steps: steps },
    }, 30000);
    if (status < 200 || status >= 300 || !json?.id) throw new Error(`本机生图提交失败（HTTP ${status}）：${json?.error?.message || json?.message || this.lastLog(2)}`);
    const id = String(json.id);
    let aborting: Promise<void> | null = null;
    const onAbort = () => { aborting = this.abortJob(base, id); };
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      for (;;) {
        if (opts.signal?.aborted) { await aborting; throw new Error('已取消'); }
        if (!this.isRunning) throw new Error(this.state.error || '生图服务已停止');
        await new Promise((r) => setTimeout(r, 1000));
        const res = await httpJson('GET', `${base}/jobs/${id}`, undefined, 15000).catch(() => ({ status: 0, json: null }));
        if (res.status === 404 || res.status === 410) throw new Error('出图任务丢了（服务可能重启过）');
        if (res.status !== 200) continue;   // 一次问不到不算数，下一秒再问
        const images = parseJob(res.json);
        if (typeof res.json?.queue_position === 'number' && res.json.queue_position > 0) opts.onQueue?.(res.json.queue_position);
        if (images) return images.map((b64) => `data:image/png;base64,${b64}`);
      }
    } finally {
      opts.signal?.removeEventListener('abort', onAbort);
    }
  }

  /**
   * 真的把这一张停下来。服务端的 cancel 只能撤还在排队的任务：已经在画的会回 409、继续占着 GPU 画完
   * （实测如此）。所以 409 时直接把服务进程停掉——那张图反正也不要了，下次出图再起（要多花半分钟加载模型）
   */
  private async abortJob(base: string, id: string): Promise<void> {
    const { status } = await httpJson('POST', `${base}/jobs/${id}/cancel`, {}, 5000).catch(() => ({ status: 0 }));
    if (status === 200) return;
    this.emit('log', `取消出图：任务已经在画了（HTTP ${status}），停掉生图服务`);
    await this.stop();
  }
}
