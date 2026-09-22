/**
 * 本机模型的调度：对话模型、嵌入模型、转写、（以后的）生图各是一个常驻或半常驻的进程，一台 24 GB 的笔记本装不下它们同时跑。
 * 这里记着每个服务在不在跑、忙不忙、最近什么时候用过、大概占多少内存，做三件事：
 * ① 空闲自动停：各有各的超时（0 = 不自动停），正在干活的不碰；
 * ② 启动前算预算：可用内存不够就先停掉空闲的、最久没用的，还不够就拒绝并把数字说清楚；
 * ③ 生图和对话互斥（内存不到 32 GB 时）：生图前先停对话与嵌入，反过来也一样，正在忙的不抢；
 * ④ **让位的会自己回来**：因为给别人腾地方被停掉的（对话、嵌入），等那件事干完就自动重新起来，
 *    不用等到下次有人用它才慢吞吞加载。手动停掉的不算让位，不会被叫回来。
 * 各服务通过 register() 把自己接进来；这个模块本身不认识 llama-server，只认接口，所以能拿假的服务测。
 */
import os from 'os';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { EventEmitter } from 'events';

export type ServiceId = 'chat' | 'embed' | 'asr' | 'image';
export const SERVICE_IDS: ServiceId[] = ['chat', 'embed', 'asr', 'image'];

export interface ServiceDriver {
  id: ServiceId;
  label: string;
  /** 一句话说明，面板上显示在名字下面 */
  note?: string;
  running(): boolean;
  /** 正在干活（回答、建索引、录音、画图）：不能被自动停掉 */
  busy(): boolean;
  pid(): number | null;
  /** 跑起来大概要多少内存（字节）：模型文件 + 上下文之类的估算 */
  estimateBytes(): number;
  stop(): Promise<void>;
  /** 有的服务没有「单独启动」的意义（转写只随一场录音起） */
  start?: () => Promise<void>;
  /**
   * 给别人让位被停掉之后，等对方干完要不要自动回来。
   * 对话、嵌入这种「随时可能用到」的要；生图、转写是用的时候才起，不必占着
   */
  restorable?: boolean;
}

export interface SchedulerConfig {
  /** 空闲多少分钟自动停；0 = 不自动停 */
  idleMinutes: Record<ServiceId, number>;
  /** 生图时停掉对话与嵌入模型（只在内存不到 32 GB 的电脑上生效） */
  exclusiveImage: boolean;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = { idleMinutes: { chat: 15, embed: 10, asr: 0, image: 5 }, exclusiveImage: true };
export const EXCLUSIVE_BELOW_BYTES = 32 * 1024 ** 3;
/** 让位的等多久再回来：连着出好几张图时不来回折腾 */
export const RESTORE_DELAY_MS = 20000;

export type ServiceStatus = 'stopped' | 'running' | 'busy';
export interface ServiceView {
  id: ServiceId;
  label: string;
  note?: string;
  status: ServiceStatus;
  pid: number | null;
  /** 真实常驻内存（跑着的时候）；量不到就是 null */
  rssBytes: number | null;
  estimateBytes: number;
  lastUsedAt: number | null;
  idleMinutes: number;
  canStart: boolean;
  canStop: boolean;
  /** 被谁挤下去了（那件事干完会自动回来）；没让位就是 null */
  displacedBy: ServiceId | null;
}
export interface ResourceState {
  totalBytes: number;
  availableBytes: number;
  /** 互斥规则在这台电脑上生效吗（内存不到 32 GB） */
  exclusiveApplies: boolean;
  services: ServiceView[];
  config: SchedulerConfig;
}

export interface SchedulerDeps {
  now: () => number;
  totalMemory: () => number;
  availableMemory: () => Promise<number>;
  rssOf: (pid: number) => Promise<number | null>;
  log: (message: string) => void;
}

const GIB = 1024 ** 3;
export const formatGB = (bytes: number) => `${(bytes / GIB).toFixed(bytes >= 10 * GIB ? 0 : 1)} GB`;

export function normalizeSchedulerConfig(raw: any): SchedulerConfig {
  const idle = { ...DEFAULT_SCHEDULER_CONFIG.idleMinutes };
  for (const id of SERVICE_IDS) {
    const v = Number(raw?.idleMinutes?.[id]);
    if (Number.isFinite(v) && v >= 0) idle[id] = Math.round(v);
  }
  return { idleMinutes: idle, exclusiveImage: typeof raw?.exclusiveImage === 'boolean' ? raw.exclusiveImage : DEFAULT_SCHEDULER_CONFIG.exclusiveImage };
}

const exec = (cmd: string, args: string[]) => new Promise<string>((resolve) => execFile(cmd, args, { timeout: 5000, windowsHide: true }, (err, stdout) => resolve(err ? '' : String(stdout))));

/**
 * 现在还能拿来用的内存。macOS 的 os.freemem() 只算「真正空着」的页，几乎总是很小；
 * inactive 和 speculative 的页系统随时会回收，也算进来
 */
export async function availableMemory(): Promise<number> {
  if (process.platform === 'darwin') {
    const out = await exec('vm_stat', []);
    const page = Number(/page size of (\d+) bytes/.exec(out)?.[1] || 16384);
    const pages = (name: string) => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(out)?.[1] || 0);
    const bytes = (pages('Pages free') + pages('Pages inactive') + pages('Pages speculative')) * page;
    if (bytes > 0) return bytes;
  } else if (process.platform === 'linux') {
    try {
      const m = /MemAvailable:\s+(\d+) kB/.exec(fs.readFileSync('/proc/meminfo', 'utf8'));
      if (m) return Number(m[1]) * 1024;
    } catch { /* 用下面的 */ }
  }
  return os.freemem();
}

/** 一个进程的常驻内存（字节）：用 ps / tasklist 问系统；问不到返回 null */
export async function rssOf(pid: number): Promise<number | null> {
  if (!pid) return null;
  if (process.platform === 'win32') {
    const out = await exec('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
    const m = /"([\d,.]+) K"/.exec(out);
    return m ? Number(m[1].replace(/[,.]/g, '')) * 1024 : null;
  }
  const out = await exec('ps', ['-o', 'rss=', '-p', String(pid)]);
  const kb = Number(out.trim());
  return Number.isFinite(kb) && kb > 0 ? kb * 1024 : null;
}

export class Scheduler extends EventEmitter {
  config: SchedulerConfig = { ...DEFAULT_SCHEDULER_CONFIG, idleMinutes: { ...DEFAULT_SCHEDULER_CONFIG.idleMinutes } };
  private drivers = new Map<ServiceId, ServiceDriver>();
  private lastUsed = new Map<ServiceId, number>();
  private firstSeenRunning = new Map<ServiceId, number>();
  private work = new Map<ServiceId, number>();
  /** 给谁让的位：等那位干完就把它们叫回来 */
  private displaced = new Map<ServiceId, ServiceId>();
  private restoreTimers = new Map<ServiceId, ReturnType<typeof setTimeout>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private deps: SchedulerDeps;

  constructor(deps: Partial<SchedulerDeps> = {}) {
    super();
    this.deps = { now: Date.now, totalMemory: os.totalmem, availableMemory, rssOf, log: (m) => console.log('[resources]', m), ...deps };
  }

  register(driver: ServiceDriver) { this.drivers.set(driver.id, driver); this.emit('change'); }
  get(id: ServiceId) { return this.drivers.get(id); }

  /** 用到了某个服务：记时间，空闲计时从头算 */
  touch(id: ServiceId) { this.lastUsed.set(id, this.deps.now()); }
  beginWork(id: ServiceId) {
    this.touch(id);
    this.work.set(id, (this.work.get(id) || 0) + 1);
    // 又开工了：别急着把让位的叫回来
    const timer = this.restoreTimers.get(id);
    if (timer) { clearTimeout(timer); this.restoreTimers.delete(id); }
  }

  endWork(id: ServiceId) {
    this.touch(id);
    this.work.set(id, Math.max(0, (this.work.get(id) || 0) - 1));
    if (this.isBusy(id)) return;
    if (![...this.displaced.values()].includes(id)) return;
    // 干完了：稍等一下再让位的回来（连着出好几张图时不来回折腾）
    const timer = setTimeout(() => { this.restoreTimers.delete(id); void this.restoreDisplaced(id); }, RESTORE_DELAY_MS);
    (timer as any).unref?.();
    this.restoreTimers.set(id, timer);
  }

  /**
   * 把给 by 让位的那些叫回来。内存不到 32 GB 时得先把 by 停掉（它俩本来就互斥），
   * 反正它的活已经干完了；内存不够就把能起的起起来，起不动的下次用时再说
   */
  async restoreDisplaced(by: ServiceId): Promise<ServiceId[]> {
    const waiting = [...this.displaced.entries()].filter(([, who]) => who === by).map(([id]) => id);
    if (!waiting.length || this.isBusy(by)) return [];
    const restored: ServiceId[] = [];
    const host = this.drivers.get(by);
    if (host?.running() && this.exclusiveApplies && !this.isBusy(by)) {
      try { await host.stop(); this.deps.log(`${host.label}用完了，让位的服务这就回来`); } catch { /* 停不掉就让下面的预算去处理 */ }
    }
    for (const id of waiting) {
      this.displaced.delete(id);
      const d = this.drivers.get(id);
      if (!d?.start || d.running()) continue;
      try {
        await this.ensureCapacity(id);
        await d.start();
        restored.push(id);
        this.deps.log(`${d.label}回来了`);
      } catch (err: any) {
        this.deps.log(`${d.label}没能回来：${err?.message || err}（下次用到时再起）`);
      }
    }
    if (restored.length) { this.emit('restored', { ids: restored, by }); this.emit('change'); }
    return restored;
  }
  isBusy(id: ServiceId) { return (this.work.get(id) || 0) > 0 || !!this.drivers.get(id)?.busy(); }

  setConfig(patch: Partial<SchedulerConfig>) {
    this.config = normalizeSchedulerConfig({ ...this.config, ...patch, idleMinutes: { ...this.config.idleMinutes, ...(patch.idleMinutes || {}) } });
    this.emit('config', this.config);
    this.emit('change');
  }

  get exclusiveApplies() { return this.config.exclusiveImage && this.deps.totalMemory() < EXCLUSIVE_BELOW_BYTES; }

  private lastUsedOf(id: ServiceId): number | null {
    return this.lastUsed.get(id) ?? this.firstSeenRunning.get(id) ?? null;
  }

  /** 空闲超时的停掉。定时器每 30 秒叫一次，也可以手动叫 */
  async sweep(): Promise<ServiceId[]> {
    const now = this.deps.now();
    const stopped: ServiceId[] = [];
    for (const d of this.drivers.values()) {
      if (!d.running()) { this.firstSeenRunning.delete(d.id); continue; }
      if (!this.firstSeenRunning.has(d.id)) this.firstSeenRunning.set(d.id, now);
      const idle = this.config.idleMinutes[d.id];
      if (!idle || this.isBusy(d.id)) continue;
      const since = this.lastUsedOf(d.id) ?? now;
      if (now - since < idle * 60000) continue;
      try {
        await d.stop();
        stopped.push(d.id);
        this.displaced.delete(d.id);   // 自己闲停的，不是让位
        this.deps.log(`${d.label}空闲 ${idle} 分钟，已停掉`);
      } catch (err: any) {
        this.deps.log(`停 ${d.label} 失败：${err?.message || err}`);
      }
    }
    if (stopped.length) this.emit('stopped', { ids: stopped, reason: 'idle' });
    if (stopped.length) this.emit('change');
    return stopped;
  }

  startSweeping(intervalMs = 30000) {
    this.stopSweeping();
    this.timer = setInterval(() => { void this.sweep(); }, intervalMs);
    (this.timer as any).unref?.();
  }
  stopSweeping() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const t of this.restoreTimers.values()) clearTimeout(t);
    this.restoreTimers.clear();
  }

  /**
   * 要启动 target 之前叫这个：先处理互斥，再看内存够不够；不够就停空闲的、最久没用的；还不够就报错。
   * 返回被停掉的服务，调用方可以提示用户
   */
  async ensureCapacity(target: ServiceId): Promise<{ stopped: ServiceId[] }> {
    const stopped: ServiceId[] = [];
    const targetLabel = this.drivers.get(target)?.label || target;
    const stopOne = async (d: ServiceDriver) => {
      await d.stop();
      stopped.push(d.id);
      // 还会用到的（对话、嵌入）记一笔，等 target 干完自动回来；用的时候才起的就算了
      if (d.restorable) this.displaced.set(d.id, target);
      this.deps.log(`为了${targetLabel}，先停掉${d.label}${d.restorable ? '（用完会自动回来）' : ''}`);
    };

    if (this.exclusiveApplies) {
      const conflicts: ServiceId[] = target === 'image' ? ['chat', 'embed'] : target === 'chat' || target === 'embed' ? ['image'] : [];
      for (const id of conflicts) {
        const d = this.drivers.get(id);
        if (!d?.running()) continue;
        if (this.isBusy(id)) throw new Error(`${d.label}正在忙，等它完成再${targetLabel}`);
        await stopOne(d);
      }
    }

    const need = this.drivers.get(target)?.estimateBytes() || 0;
    if (need > 0) {
      let avail = await this.deps.availableMemory();
      if (avail < need) {
        const idle = Array.from(this.drivers.values())
          .filter((d) => d.id !== target && d.running() && !this.isBusy(d.id) && !stopped.includes(d.id))
          .sort((a, b) => (this.lastUsedOf(a.id) ?? 0) - (this.lastUsedOf(b.id) ?? 0));
        for (const d of idle) {
          if (avail >= need) break;
          await stopOne(d);
          await new Promise((r) => setTimeout(r, 300)); // 进程退了，内存要一小会儿才还回来
          avail = await this.deps.availableMemory();
        }
        if (avail < need) {
          const busy = Array.from(this.drivers.values()).filter((d) => d.id !== target && d.running() && this.isBusy(d.id)).map((d) => d.label);
          throw new Error(`内存不够：${targetLabel}大约要 ${formatGB(need)}，现在可用约 ${formatGB(avail)}${busy.length ? `（${busy.join('、')}正在忙，没法停）` : ''}`);
        }
      }
    }
    if (stopped.length) { this.emit('stopped', { ids: stopped, reason: 'capacity', target }); this.emit('change'); }
    return { stopped };
  }

  async start(id: ServiceId) {
    const d = this.drivers.get(id);
    if (!d?.start) throw new Error('这个服务不能单独启动');
    await this.ensureCapacity(id);
    await d.start();
    this.touch(id);
    this.displaced.delete(id);
    this.emit('change');
  }

  async stop(id: ServiceId) {
    const d = this.drivers.get(id);
    if (!d) throw new Error('没有这个服务');
    if (this.isBusy(id)) throw new Error(`${d.label}正在忙，等它完成再停`);
    await d.stop();
    this.displaced.delete(id);   // 用户自己停的，别再自作主张叫回来
    this.emit('change');
  }

  async getState(): Promise<ResourceState> {
    const services: ServiceView[] = [];
    for (const id of SERVICE_IDS) {
      const d = this.drivers.get(id);
      if (!d) continue;
      const running = d.running();
      const pid = running ? d.pid() : null;
      services.push({
        id, label: d.label, note: d.note,
        status: running ? (this.isBusy(id) ? 'busy' : 'running') : 'stopped',
        pid,
        rssBytes: pid ? await this.deps.rssOf(pid) : null,
        estimateBytes: d.estimateBytes(),
        lastUsedAt: this.lastUsedOf(id),
        idleMinutes: this.config.idleMinutes[id],
        canStart: !running && !!d.start,
        canStop: running && !this.isBusy(id),
        displacedBy: this.displaced.get(id) ?? null,
      });
    }
    return { totalBytes: this.deps.totalMemory(), availableBytes: await this.deps.availableMemory(), exclusiveApplies: this.exclusiveApplies, services, config: this.config };
  }
}

/** 整个应用共用的一个 */
export const scheduler = new Scheduler();

/** 配置存成一个小 JSON；IPC 在 main.ts 里由 setupResources 挂 */
export function loadSchedulerConfig(file: string): SchedulerConfig {
  try { return normalizeSchedulerConfig(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return normalizeSchedulerConfig(null); }
}
export function saveSchedulerConfig(file: string, config: SchedulerConfig) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(config, null, 2), 'utf8'); } catch (err) { console.warn('[resources] save config failed:', err); }
}
