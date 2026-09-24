/**
 * 本机模型的调度：对话（连着嵌入）、转写、生图各是一个常驻或半常驻的进程，一台 24 GB 的笔记本装不下它们同时跑。
 * 这里记着每个服务在不在跑、忙不忙、最近什么时候用过、真占了多少内存，做这么几件事：
 * ① **一起启停的算一组**：嵌入模型跟着对话模型走——它俩本来就是一套「文本能力」，分开启停只会让人多点一次；
 * ② **占多少按实测算**：跑起来之后记下峰值常驻内存（按「模型 + 上下文」记），下次算预算直接用实测值。
 *    公式猜不准：4B 的 Q8 模型文件 4.4 GB，上下文开到 128k 时实际要 8.8 GB，早先的公式把 KV 缓存封顶在 2 GB，少算了 2 GB；
 * ③ 空闲自动停：每组各有各的超时（0 = 不自动停），正在干活的不碰；
 * ④ 启动前算预算：不够就先停空闲的、最久没用的；**它正忙就等它干完，不要张口就报「内存不够」**；
 * ⑤ 内存真不够了才请人让位——不是「生图就一律停对话」：24 GB 的机器装得下对话加生图，
 *    一刀切地赶人只会让人莫名其妙。想稳一点的可以在设置里打开「生图时总是先腾干净」；
 * ⑥ **让位的会自己回来**：因为给别人腾地方被停掉的，等那件事干完就自动重新起来，不用等到下次有人用它才慢吞吞加载。
 *    手动停掉的不算让位，不会被叫回来。
 * 各服务通过 register() 把自己接进来；这个模块本身不认识 llama-server，只认接口，所以能拿假的服务测。
 */
import os from 'os';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { EventEmitter } from 'events';

export type ServiceId = 'chat' | 'embed' | 'asr' | 'image';
export const SERVICE_IDS: ServiceId[] = ['chat', 'embed', 'image', 'asr'];

export interface ServiceDriver {
  id: ServiceId;
  label: string;
  /** 一句话说明，面板上显示在名字下面 */
  note?: string;
  running(): boolean;
  /** 正在干活（回答、建索引、录音、画图）：不能被自动停掉 */
  busy(): boolean;
  pid(): number | null;
  /** 跑起来大概要多少内存（字节）：模型文件 + 上下文之类的估算。有实测值时用实测的 */
  estimateBytes(): number;
  /**
   * 当前这套配置的记号（模型 + 上下文之类），实测内存按它归档。
   * 换了模型或改了上下文，上次的实测就不作数了
   */
  memoKey?: () => string;
  stop(): Promise<void>;
  /** 有的服务没有「单独启动」的意义（转写只随一场录音起） */
  start?: () => Promise<void>;
  /**
   * 给别人让位被停掉之后，等对方干完要不要自动回来。
   * 对话、嵌入这种「随时可能用到」的要；生图、转写是用的时候才起，不必占着
   */
  restorable?: boolean;
  /** 跟谁一起启停：嵌入模型填 'chat'，它就跟着对话模型一起起、一起停、一起让位 */
  groupWith?: ServiceId;
  /**
   * 面板上要不要给启停开关。转写这种「录音时自己起、一场结束自己退」的不需要：
   * 多给一个开关只会让人以为还得手动管它
   */
  managed?: boolean;
}

export interface SchedulerConfig {
  /** 空闲多少分钟自动停；0 = 不自动停。按组记（组长的 id） */
  idleMinutes: Record<ServiceId, number>;
  /**
   * 生图时总是先把对话与嵌入模型停掉，哪怕内存够用。默认关：内存不够时自然会请它们让位，
   * 不必一刀切。内存紧张、又不想让出图和别的模型抢 GPU 的可以打开
   */
  exclusiveImage: boolean;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = { idleMinutes: { chat: 15, embed: 15, asr: 0, image: 5 }, exclusiveImage: false };
export const EXCLUSIVE_BELOW_BYTES = 32 * 1024 ** 3;
/** 让位的等多久再回来：连着出好几张图时不来回折腾 */
export const RESTORE_DELAY_MS = 20000;
/** 允许超出「可用内存」多少倍——系统还能回收文件缓存、压缩内存，卡得太死会把跑得动的活拦下来 */
export const MEMORY_SLACK = 1.25;
/** 要用的那个正忙：最多等它多久（等一会儿总比直接报「内存不够」强） */
export const BUSY_WAIT_MS = 90000;
const BUSY_POLL_MS = 500;
/** 刚起来时权重还没读完，小于这个数的一律不当成实测值（嵌入模型本身才 64 MB，门槛不能设高） */
const MIN_SAMPLE_BYTES = 16 * 1024 * 1024;
/** 起来头这么久之内不采样：进程刚 fork 出来还没读权重，那会儿量到的是 150 MB，记下来就成了个假数 */
const SETTLE_MS = 20000;

export type ServiceStatus = 'stopped' | 'running' | 'busy';
export interface ServiceView {
  /** 组长的 id：启停、空闲超时都按这个来 */
  id: ServiceId;
  label: string;
  note?: string;
  /** 这一组里有哪些服务（对话组 = 对话 + 嵌入） */
  members: ServiceId[];
  status: ServiceStatus;
  pid: number | null;
  /** 真实常驻内存（跑着的时候，整组加起来）；量不到就是 null */
  rssBytes: number | null;
  estimateBytes: number;
  /** estimateBytes 是实测来的（true）还是按文件大小猜的（false） */
  measured: boolean;
  lastUsedAt: number | null;
  idleMinutes: number;
  /** 面板上要不要给启停 / 空闲超时的开关 */
  managed: boolean;
  canStart: boolean;
  canStop: boolean;
  /** 被谁挤下去了（那件事干完会自动回来）；没让位就是 null */
  displacedBy: ServiceId | null;
}
export interface ResourceState {
  totalBytes: number;
  availableBytes: number;
  /** 「总是先腾干净」这条在这台电脑上生效吗（开了开关、且内存不到 32 GB） */
  exclusiveApplies: boolean;
  services: ServiceView[];
  config: SchedulerConfig;
}

/** 实测内存的存档：`服务:配置记号` → 峰值字节 */
export type UsageMemo = Record<string, number>;

export interface SchedulerDeps {
  now: () => number;
  totalMemory: () => number;
  availableMemory: () => Promise<number>;
  rssOf: (pid: number) => Promise<number | null>;
  sleep: (ms: number) => Promise<void>;
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
 * 现在还能拿来用的内存。macOS 用活动监视器那套口径：总量 −（活跃 + 联动 + 已压缩）。
 * 早先只数 free + inactive，在这台机器上把 12 GB 可用算成了 6 GB，结果明明跑得动的出图被拦下来
 */
export async function availableMemory(): Promise<number> {
  if (process.platform === 'darwin') {
    const out = await exec('vm_stat', []);
    const page = Number(/page size of (\d+) bytes/.exec(out)?.[1] || 16384);
    const pages = (name: string) => Number(new RegExp(`${name}:\\s+(\\d+)`).exec(out)?.[1] || 0);
    const used = (pages('Pages active') + pages('Pages wired down') + pages('Pages occupied by compressor')) * page;
    const total = os.totalmem();
    if (used > 0 && used < total) return total - used;
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
  /** 实测占用：`服务:配置记号` → 历次采样的最大常驻内存 */
  private measured = new Map<string, number>();
  /** 给谁让的位：等那位干完就把它们叫回来 */
  private displaced = new Map<ServiceId, ServiceId>();
  private restoreTimers = new Map<ServiceId, ReturnType<typeof setTimeout>>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private deps: SchedulerDeps;

  constructor(deps: Partial<SchedulerDeps> = {}) {
    super();
    this.deps = {
      now: Date.now, totalMemory: os.totalmem, availableMemory, rssOf,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      log: (m) => console.log('[resources]', m),
      ...deps,
    };
  }

  register(driver: ServiceDriver) { this.drivers.set(driver.id, driver); this.emit('change'); }
  get(id: ServiceId) { return this.drivers.get(id); }

  // ── 分组：嵌入跟着对话一起启停 ───────────────────────────────────────────────
  /** 这个服务归哪一组（返回组长的 id；自己就是组长时返回自己） */
  leaderOf(id: ServiceId): ServiceId {
    const with_ = this.drivers.get(id)?.groupWith;
    return with_ && this.drivers.has(with_) ? with_ : id;
  }
  /** 一组里有哪些服务，组长排在最前面 */
  membersOf(leader: ServiceId): ServiceDriver[] {
    const out: ServiceDriver[] = [];
    const lead = this.drivers.get(leader);
    if (lead) out.push(lead);
    for (const id of SERVICE_IDS) {
      const d = this.drivers.get(id);
      if (d && d.id !== leader && this.leaderOf(d.id) === leader) out.push(d);
    }
    return out;
  }
  /** 所有组的组长，按 SERVICE_IDS 的顺序 */
  private leaders(): ServiceId[] { return SERVICE_IDS.filter((id) => this.drivers.has(id) && this.leaderOf(id) === id); }
  /** 一组的名字：「对话模型（含嵌入模型）」 */
  groupLabel(leader: ServiceId): string {
    const members = this.membersOf(leader);
    if (!members.length) return leader;
    if (members.length === 1) return members[0].label;
    return `${members[0].label}（含${members.slice(1).map((d) => d.label).join('、')}）`;
  }
  private groupRunning(leader: ServiceId) { return this.membersOf(leader).some((d) => d.running()); }
  private groupBusy(leader: ServiceId) { return this.membersOf(leader).some((d) => this.isBusy(d.id)); }
  private groupLastUsed(leader: ServiceId): number | null {
    const ts = this.membersOf(leader).map((d) => this.lastUsedOf(d.id)).filter((t): t is number => t != null);
    return ts.length ? Math.max(...ts) : null;
  }
  /** 把这一组起起来还要多少内存：已经在跑的那几个不算（它们的内存早就占着了） */
  private groupNeed(leader: ServiceId) {
    return this.membersOf(leader).filter((d) => !d.running()).reduce((sum, d) => sum + this.estimateOf(d.id), 0);
  }

  // ── 实测占用 ──────────────────────────────────────────────────────────────
  private keyOf(id: ServiceId): string | null {
    const d = this.drivers.get(id);
    if (!d?.memoKey) return null;
    const k = d.memoKey();
    return k ? `${id}:${k}` : null;
  }
  /**
   * 这个服务要多少内存：实测和公式取大的那个。
   * 实测能补上公式少算的（对话模型 128k 上下文：公式 6.7 GB，实际 8.8 GB）；
   * 反过来不能只信实测——采到的可能是「还没读完权重」那一瞬（生图曾采到 150 MB），
   * 按那个数去规划内存等于不规划
   */
  estimateOf(id: ServiceId): number {
    const d = this.drivers.get(id);
    if (!d) return 0;
    const key = this.keyOf(id);
    return Math.max(d.estimateBytes(), (key && this.measured.get(key)) || 0);
  }
  /** 面板上那个数是实测撑起来的（比公式还大），还是公式猜的 */
  private isMeasured(id: ServiceId): boolean {
    const d = this.drivers.get(id);
    const key = this.keyOf(id);
    const seen = (key && this.measured.get(key)) || 0;
    return !!d && seen > 0 && seen >= d.estimateBytes();
  }
  /**
   * 把跑着的服务此刻占了多少记一笔（取历次最大值：刚起来时权重还没读完，那会儿的数不算数）。
   * 返回这一轮量到的 RSS，面板顺手用
   */
  async sampleUsage(): Promise<Map<ServiceId, number>> {
    const sampled = new Map<ServiceId, number>();
    const at = this.deps.now();
    let changed = false;
    for (const id of SERVICE_IDS) {
      const d = this.drivers.get(id);
      if (!d?.running()) { this.firstSeenRunning.delete(id); continue; }
      if (!this.firstSeenRunning.has(id)) this.firstSeenRunning.set(id, at);
      const pid = d.pid();
      if (!pid) continue;
      const rss = await this.deps.rssOf(pid);
      if (!rss || rss < MIN_SAMPLE_BYTES) continue;
      sampled.set(id, rss);
      // 刚起来那会儿量到的不算数
      if (at - (this.firstSeenRunning.get(id) ?? at) < SETTLE_MS) continue;
      const key = this.keyOf(id);
      if (key && rss > (this.measured.get(key) || 0) && rss < this.deps.totalMemory()) { this.measured.set(key, rss); changed = true; }
    }
    if (changed) this.emit('usage', this.usage());
    return sampled;
  }
  usage(): UsageMemo { return Object.fromEntries(this.measured); }
  loadUsage(memo: UsageMemo | null | undefined) {
    if (!memo || typeof memo !== 'object') return;
    const total = this.deps.totalMemory();
    for (const [k, v] of Object.entries(memo)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > MIN_SAMPLE_BYTES && n < total) this.measured.set(k, n);
    }
  }

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
   * 把给 by 让位的那些叫回来。开着「总是先腾干净」时得先把 by 停掉（它俩本来就互斥），
   * 反正它的活已经干完了；内存不够就把能起的起起来，起不动的下次用时再说。
   * force = 撤销刚才的腾挪（腾了半天还是不够），此时不必再算预算
   */
  async restoreDisplaced(by: ServiceId, opts: { force?: boolean } = {}): Promise<ServiceId[]> {
    const waiting = [...this.displaced.entries()].filter(([, who]) => who === by).map(([id]) => id);
    if (!waiting.length || this.isBusy(by)) return [];
    for (const t of this.restoreTimers.values()) clearTimeout(t);
    this.restoreTimers.clear();
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
        // force：这是在撤销刚才的腾挪，内存状况和动手之前一模一样，不必再算一遍预算
        // （再算一遍只会又失败一次，人就一直停在那儿了）
        if (!opts.force) await this.ensureCapacity(this.leaderOf(id));
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
  /** 正在给别的服务让位（等着被叫回来） */
  isDisplaced(id: ServiceId) { return this.displaced.has(this.leaderOf(id)) || this.displaced.has(id); }
  isBusy(id: ServiceId) { return (this.work.get(id) || 0) > 0 || !!this.drivers.get(id)?.busy(); }

  setConfig(patch: Partial<SchedulerConfig>) {
    this.config = normalizeSchedulerConfig({ ...this.config, ...patch, idleMinutes: { ...this.config.idleMinutes, ...(patch.idleMinutes || {}) } });
    // 一组的空闲超时是一个数：跟组的谁都别单独设，免得对话停了嵌入还留着
    for (const id of SERVICE_IDS) {
      const leader = this.leaderOf(id);
      if (leader !== id) this.config.idleMinutes[id] = this.config.idleMinutes[leader];
    }
    this.emit('config', this.config);
    this.emit('change');
  }

  get exclusiveApplies() { return this.config.exclusiveImage && this.deps.totalMemory() < EXCLUSIVE_BELOW_BYTES; }

  private lastUsedOf(id: ServiceId): number | null {
    return this.lastUsed.get(id) ?? this.firstSeenRunning.get(id) ?? null;
  }

  /** 空闲超时的停掉（整组一起）。定时器每 30 秒叫一次，也可以手动叫 */
  async sweep(): Promise<ServiceId[]> {
    const now = this.deps.now();
    const stopped: ServiceId[] = [];
    for (const d of this.drivers.values()) {
      if (d.running()) { if (!this.firstSeenRunning.has(d.id)) this.firstSeenRunning.set(d.id, now); }
      else this.firstSeenRunning.delete(d.id);
    }
    for (const leader of this.leaders()) {
      const running = this.membersOf(leader).filter((d) => d.running());
      if (!running.length) continue;
      const idle = this.config.idleMinutes[leader];
      if (!idle || this.groupBusy(leader)) continue;
      const since = this.groupLastUsed(leader) ?? now;
      if (now - since < idle * 60000) continue;
      for (const d of running) {
        try {
          await d.stop();
          stopped.push(d.id);
          this.displaced.delete(d.id);   // 自己闲停的，不是让位
        } catch (err: any) {
          this.deps.log(`停 ${d.label} 失败：${err?.message || err}`);
        }
      }
      this.deps.log(`${this.groupLabel(leader)}空闲 ${idle} 分钟，已停掉`);
    }
    if (stopped.length) { this.emit('stopped', { ids: stopped, reason: 'idle' }); this.emit('change'); }
    await this.sampleUsage();
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
   * 等一组把手里的活干完，最多等 BUSY_WAIT_MS。
   * 「对话模型正在答题 → 出图直接报内存不够」是最让人火大的一种失败：其实等它答完就够了
   */
  private async waitIdle(leader: ServiceId, target: ServiceId): Promise<boolean> {
    if (!this.groupBusy(leader)) return true;
    const label = this.groupLabel(leader);
    this.emit('waiting', { id: leader, target, label });
    this.deps.log(`${label}正在忙，等它干完再动它`);
    const deadline = this.deps.now() + BUSY_WAIT_MS;
    let ok = false;
    while (this.deps.now() < deadline) {
      await this.deps.sleep(BUSY_POLL_MS);
      if (!this.groupBusy(leader)) { ok = true; break; }
    }
    this.emit('waiting', { id: null, target, label: null });
    if (!ok) this.deps.log(`${label}一直没闲下来，不等了`);
    return ok;
  }

  /**
   * 要启动 target 这一组之前叫这个：先处理互斥，再看内存够不够；不够就停空闲的、最久没用的，
   * 正忙的先等一会儿；实在腾不出来才报错。返回被停掉的服务，调用方可以提示用户
   */
  async ensureCapacity(target: ServiceId): Promise<{ stopped: ServiceId[] }> {
    try {
      return await this.ensureCapacityInner(this.leaderOf(target));
    } catch (err) {
      // 腾了一半却没腾够：把刚请下去的立刻叫回来，别让它们白白停着
      // （这一步要是不做，一次「内存不够」就能让对话模型一直停在那儿没人管）
      await this.restoreDisplaced(this.leaderOf(target), { force: true }).catch(() => []);
      throw err;
    }
  }

  private async ensureCapacityInner(target: ServiceId): Promise<{ stopped: ServiceId[] }> {
    const stopped: ServiceId[] = [];
    const targetLabel = this.groupLabel(target);
    const stopGroup = async (leader: ServiceId) => {
      const members = this.membersOf(leader).filter((d) => d.running());
      for (const d of members) {
        await d.stop();
        stopped.push(d.id);
        // 还会用到的（对话、嵌入）记一笔，等 target 干完自动回来；用的时候才起的就算了
        if (d.restorable) this.displaced.set(d.id, target);
      }
      const back = members.some((d) => d.restorable);
      this.deps.log(`为了${targetLabel}，先停掉${this.groupLabel(leader)}${back ? '（用完会自动回来）' : ''}`);
    };

    if (this.exclusiveApplies) {
      const conflicts = target === 'image' ? this.leaders().filter((l) => l !== 'image' && l !== 'asr') : target === 'chat' ? (['image'] as ServiceId[]) : [];
      for (const leader of conflicts) {
        if (!this.groupRunning(leader)) continue;
        if (!(await this.waitIdle(leader, target))) throw new Error(`${this.groupLabel(leader)}一直在忙，等它完成再${targetLabel}`);
        await stopGroup(leader);
      }
    }

    const need = this.groupNeed(target);
    if (need > 0) {
      // 系统还能回收一部分文件缓存、压缩一部分内存，所以不按一分不差卡：
      // 差得不多就让它跑（顶多慢一点），差得离谱才拦下来
      const fits = (avail: number) => need <= avail * MEMORY_SLACK;
      let avail = await this.deps.availableMemory();
      if (!fits(avail)) {
        const others = this.leaders().filter((l) => l !== target && this.groupRunning(l));
        others.sort((a, b) => (this.groupLastUsed(a) ?? 0) - (this.groupLastUsed(b) ?? 0));
        // 闲着的先请；都请完还不够，再等正在忙的那几个干完
        const order = [...others.filter((l) => !this.groupBusy(l)), ...others.filter((l) => this.groupBusy(l))];
        for (const leader of order) {
          if (fits(avail)) break;
          if (!this.groupRunning(leader)) continue;
          if (!(await this.waitIdle(leader, target))) continue;   // 等不到就先放过它，看别的能不能腾出来
          await stopGroup(leader);
          await this.deps.sleep(300); // 进程退了，内存要一小会儿才还回来
          avail = await this.deps.availableMemory();
        }
        if (!fits(avail)) {
          const busy = this.leaders().filter((l) => l !== target && this.groupRunning(l) && this.groupBusy(l)).map((l) => this.groupLabel(l));
          throw new Error(`内存不够：${targetLabel}大约要 ${formatGB(need)}，现在可用约 ${formatGB(avail)}${busy.length ? `（${busy.join('、')}等了 ${Math.round(BUSY_WAIT_MS / 1000)} 秒还在忙）` : ''}。关掉些别的程序${target === 'image' ? '，或者把出图尺寸调小一档' : ''}`);
        }
      }
    }
    if (stopped.length) { this.emit('stopped', { ids: stopped, reason: 'capacity', target }); this.emit('change'); }
    return { stopped };
  }

  /** 启动一组（嵌入跟着对话一起起来） */
  async start(id: ServiceId) {
    const leader = this.leaderOf(id);
    const members = this.membersOf(leader).filter((d) => !!d.start);
    if (!members.length) throw new Error('这个服务不能单独启动');
    await this.ensureCapacity(leader);
    let first: any = null;
    for (const d of members) {
      if (d.running()) continue;
      try {
        await d.start!();
        this.touch(d.id);
        this.displaced.delete(d.id);
      } catch (err: any) {
        // 一组里有一个起不来不该把另一个也拖下水（嵌入没装模型时很常见）
        this.deps.log(`${d.label}没起来：${err?.message || err}`);
        first = first ?? err;
      }
    }
    this.emit('change');
    if (first && !this.groupRunning(leader)) throw first;
  }

  /** 停一组 */
  async stop(id: ServiceId) {
    const leader = this.leaderOf(id);
    const members = this.membersOf(leader);
    if (!members.length) throw new Error('没有这个服务');
    const busy = members.find((d) => this.isBusy(d.id));
    if (busy) throw new Error(`${busy.label}正在忙，等它完成再停`);
    for (const d of members) {
      if (d.running()) await d.stop();
      this.displaced.delete(d.id);   // 用户自己停的，别再自作主张叫回来
    }
    this.emit('change');
  }

  async getState(): Promise<ResourceState> {
    const rss = await this.sampleUsage();
    const services: ServiceView[] = [];
    for (const leader of this.leaders()) {
      const members = this.membersOf(leader);
      const running = members.filter((d) => d.running());
      const busy = this.groupBusy(leader);
      const managed = members.some((d) => d.managed !== false);
      const rssSum = running.reduce((sum, d) => sum + (rss.get(d.id) || 0), 0);
      services.push({
        id: leader,
        label: this.groupLabel(leader),
        note: members[0]?.note,
        members: members.map((d) => d.id),
        status: running.length ? (busy ? 'busy' : 'running') : 'stopped',
        pid: running[0]?.pid() ?? null,
        rssBytes: rssSum > 0 ? rssSum : null,
        estimateBytes: members.reduce((sum, d) => sum + this.estimateOf(d.id), 0),
        measured: members.every((d) => this.isMeasured(d.id)),
        lastUsedAt: this.groupLastUsed(leader),
        idleMinutes: this.config.idleMinutes[leader],
        managed,
        // 一组里有一个在跑就只给「停止」：两个按钮一起出现，人会以为点哪个都行
        canStart: managed && !running.length && members.some((d) => d.start),
        canStop: managed && running.length > 0 && !busy,
        displacedBy: this.displaced.get(leader) ?? null,
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

/** 实测内存另存一份：换机器、换模型都不影响配置本身 */
export function loadUsageMemo(file: string): UsageMemo {
  try { const raw = JSON.parse(fs.readFileSync(file, 'utf8')); return raw && typeof raw === 'object' ? raw : {}; } catch { return {}; }
}
export function saveUsageMemo(file: string, memo: UsageMemo) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(memo, null, 2), 'utf8'); } catch (err) { console.warn('[resources] save usage failed:', err); }
}
