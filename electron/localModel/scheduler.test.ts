import { describe, expect, it, vi } from 'vitest';
import { Scheduler, normalizeSchedulerConfig, formatGB, RESTORE_DELAY_MS, BUSY_WAIT_MS, type ServiceDriver, type ServiceId } from './scheduler';

const GB = 1024 ** 3;

/** 一个假服务：跑 / 停、忙不忙、配置记号都由测试摆 */
function fake(id: ServiceId, label: string, bytes: number, opts: { startable?: boolean; restorable?: boolean; groupWith?: ServiceId; managed?: boolean } = {}) {
  const state = { running: false, busy: false, memo: 'v1' };
  const driver: ServiceDriver & { state: typeof state; stop: ReturnType<typeof vi.fn> } = {
    id, label, estimateBytes: () => bytes, running: () => state.running, busy: () => state.busy, pid: () => (state.running ? 100 : null),
    memoKey: () => state.memo,
    stop: vi.fn(async () => { state.running = false; }),
    ...(opts.startable === false ? {} : { start: async () => { state.running = true; } }),
    restorable: opts.restorable ?? false,
    ...(opts.groupWith ? { groupWith: opts.groupWith } : {}),
    ...(opts.managed === false ? { managed: false } : {}),
    state,
  } as any;
  return driver;
}

function make(total = 24 * GB) {
  let now = 1_000_000;
  let avail = 8 * GB;
  let rss = 1.5 * GB;
  const log: string[] = [];
  const hooks = { onSleep: (_ms: number) => { /* 测试可以在「等待」的间隙改状态 */ } };
  const s = new Scheduler({
    now: () => now,
    totalMemory: () => total,
    availableMemory: async () => avail,
    rssOf: async () => rss,
    // 假的等待：只推进虚拟时间，测试不真的睡
    sleep: async (ms: number) => { now += ms; hooks.onSleep(ms); },
    log: (m) => log.push(m),
  });
  const chat = fake('chat', '对话模型', 6 * GB, { restorable: true });
  const embed = fake('embed', '嵌入模型', 0.3 * GB, { restorable: true, groupWith: 'chat' });
  const asr = fake('asr', '实时转写', 0.7 * GB, { startable: false, managed: false });
  const image = fake('image', '本机生图', 12 * GB);
  [chat, embed, asr, image].forEach((d) => s.register(d));
  return {
    s, chat, embed, asr, image, log, hooks,
    tick: (min: number) => { now += min * 60000; },
    setAvail: (gb: number) => { avail = gb * GB; },
    setRss: (gb: number) => { rss = gb * GB; },
  };
}

describe('本机模型调度', () => {
  it('嵌入跟着对话一起启停：算一组，空闲超时看整组最后一次用的时间', async () => {
    const { s, chat, embed, asr, tick } = make();
    chat.state.running = true; embed.state.running = true; asr.state.running = true;
    s.touch('embed'); tick(11); s.touch('chat');   // 嵌入 11 分钟没用了，但对话刚用过
    expect(await s.sweep()).toEqual([]);            // 一组的，谁用过都算用过
    tick(16);
    expect(await s.sweep()).toEqual(['chat', 'embed']);   // 整组一起停
    expect(asr.state.running).toBe(true);           // 转写超时是 0：只随会话结束
    // 起回来也是一起起
    await s.start('embed');
    expect([chat.state.running, embed.state.running]).toEqual([true, true]);
    await s.stop('chat');
    expect([chat.state.running, embed.state.running]).toEqual([false, false]);
  });

  it('正在干活的不碰', async () => {
    const { s, chat, embed, tick } = make();
    chat.state.running = true; embed.state.running = true;
    s.touch('chat');
    s.beginWork('chat');
    tick(30);
    expect(await s.sweep()).toEqual([]);   // 对话正在回答
    s.endWork('chat');
    tick(16);
    expect(await s.sweep()).toEqual(['chat', 'embed']);
  });

  it('没记过使用时间的服务（用户在设置里手动起的）：从第一次看到它在跑算起', async () => {
    const { s, chat, tick } = make();
    chat.state.running = true;
    expect(await s.sweep()).toEqual([]); // 第一次看到，开始计时
    tick(16);
    expect(await s.sweep()).toEqual(['chat']);
  });

  it('占多少按实测算：实测和公式取大的那个；刚起来那一瞬的数不算', async () => {
    const { s, chat, setRss, tick } = make();
    expect(s.estimateOf('chat')).toBe(6 * GB);      // 还没跑过：按公式猜
    chat.state.running = true;
    setRss(8.8);
    await s.sampleUsage();
    expect(s.estimateOf('chat')).toBe(6 * GB);      // 才刚起来，这会儿量到的不作数
    tick(1);                                        // 过了一分钟，权重读完了
    await s.sampleUsage();
    expect(s.estimateOf('chat')).toBe(8.8 * GB);    // 实测 8.8 GB（公式少算了 2.8 GB）
    setRss(2); await s.sampleUsage();
    expect(s.estimateOf('chat')).toBe(8.8 * GB);    // 取历次峰值
    // 存档能带到下次开应用
    const b = make();
    b.s.loadUsage(s.usage());
    expect(b.s.estimateOf('chat')).toBe(8.8 * GB);
    // 实测比公式还小时以公式为准：进程刚 fork 出来时量到的 150 MB 不能拿来规划内存
    const c = make();
    c.s.loadUsage({ 'chat:v1': 0.15 * GB });
    expect(c.s.estimateOf('chat')).toBe(6 * GB);
    // 换了模型 / 改了上下文，上次的实测就不作数了
    chat.state.memo = 'v2';
    expect(s.estimateOf('chat')).toBe(6 * GB);
  });

  it('启动前算预算：内存不够先停空闲的、最久没用的（整组一起）；够了就不再停', async () => {
    const { s, chat, embed, setAvail, tick } = make();
    chat.state.running = true; embed.state.running = true;
    s.touch('embed'); tick(1); s.touch('chat');
    setAvail(0.5);
    let calls = 0;
    (s as any).deps.availableMemory = async () => (calls++ === 0 ? 0.5 * GB : 8 * GB);
    await expect(s.ensureCapacity('asr')).resolves.toEqual({ stopped: ['chat', 'embed'] });
  });

  it('要腾地方的那位正在忙：等它干完再停，而不是张口就报「内存不够」', async () => {
    const { s, chat, embed, hooks, setAvail } = make();
    chat.state.running = true; embed.state.running = true; chat.state.busy = true;
    setAvail(0.2);
    let polls = 0;
    // 等到第三次轮询时，对话把这一问答完了
    hooks.onSleep = () => { if (++polls === 3) { chat.state.busy = false; setAvail(8); } };
    await expect(s.ensureCapacity('asr')).resolves.toEqual({ stopped: ['chat', 'embed'] });
    expect(polls).toBeGreaterThanOrEqual(3);
  });

  it('等超时了还在忙：这才报错，并说清楚等了多久', async () => {
    const { s, chat, setAvail } = make();
    chat.state.running = true; chat.state.busy = true;
    setAvail(0.2);
    await expect(s.ensureCapacity('asr')).rejects.toThrow(/实时转写大约要 0\.7 GB，现在可用约 0\.2 GB（对话模型（含嵌入模型）等了 90 秒还在忙）/);
    expect(BUSY_WAIT_MS).toBe(90000);
  });

  it('内存够就不赶人：24 GB 上对话 + 生图装得下，出图不该无故停掉对话模型', async () => {
    const { s, chat, embed, setAvail } = make();
    chat.state.running = true; embed.state.running = true; setAvail(20);
    await expect(s.ensureCapacity('image')).resolves.toEqual({ stopped: [] });
    expect([chat.state.running, embed.state.running]).toEqual([true, true]);
  });

  it('打开「总是先腾干净」才一律让位；对话一直在忙才拒绝；32 GB 及以上不管这条', async () => {
    const { s, chat, embed, image, setAvail } = make();
    s.setConfig({ exclusiveImage: true });
    chat.state.running = true; embed.state.running = true; setAvail(20);
    await expect(s.ensureCapacity('image')).resolves.toEqual({ stopped: ['chat', 'embed'] });
    image.state.running = true;
    await expect(s.ensureCapacity('chat')).resolves.toEqual({ stopped: ['image'] });

    const b = make(); b.s.setConfig({ exclusiveImage: true }); b.chat.state.running = true; b.chat.state.busy = true; b.setAvail(20);
    await expect(b.s.ensureCapacity('image')).rejects.toThrow('对话模型（含嵌入模型）一直在忙，等它完成再本机生图');

    const big = make(64 * GB); big.s.setConfig({ exclusiveImage: true }); big.chat.state.running = true; big.setAvail(40);
    expect(big.s.exclusiveApplies).toBe(false);   // 32 GB 以上不管这条
    await expect(big.s.ensureCapacity('image')).resolves.toEqual({ stopped: [] });
  });

  it('手动启停：启动也走预算；正在忙的不能停；不能单独启动的说清楚', async () => {
    const { s, chat, asr, setAvail } = make();
    setAvail(20);
    await s.start('chat');
    expect(chat.state.running).toBe(true);
    chat.state.busy = true;
    await expect(s.stop('chat')).rejects.toThrow('对话模型正在忙');
    chat.state.busy = false;
    await s.stop('chat');
    expect(chat.state.running).toBe(false);
    await expect(s.start('asr')).rejects.toThrow('不能单独启动');
    expect(asr.state.running).toBe(false);
  });

  it('状态给面板：一组一行，内存整组加起来；转写不给启停开关', async () => {
    const { s, chat, embed, setAvail, tick } = make();
    setAvail(9);
    chat.state.running = true; embed.state.running = true; s.beginWork('chat');
    await s.sampleUsage(); tick(1); await s.sampleUsage();   // 跑了一会儿，实测记上了（1.5 GB，比公式小）
    const st = await s.getState();
    expect(st.totalBytes).toBe(24 * GB);
    expect(st.exclusiveApplies).toBe(false);   // 默认不一刀切，内存不够时才请人让位
    expect(st.services.map((x) => x.id)).toEqual(['chat', 'image', 'asr']);   // 嵌入并进了对话那行
    const c = st.services.find((x) => x.id === 'chat')!;
    expect(c).toMatchObject({ label: '对话模型（含嵌入模型）', members: ['chat', 'embed'], status: 'busy', rssBytes: 3 * GB, canStop: false, canStart: false, idleMinutes: 15, managed: true });
    const a = st.services.find((x) => x.id === 'asr')!;
    expect(a).toMatchObject({ status: 'stopped', rssBytes: null, estimateBytes: 0.7 * GB, canStart: false, managed: false });
    // 逐个取大的：对话公式 6 GB 比实测的 1.5 GB 大，嵌入反过来（公式 0.3 GB，实测 1.5 GB）
    expect(c.estimateBytes).toBe(7.5 * GB);
    expect(c.measured).toBe(false);   // 组里还有人是按公式猜的，就不标「上次实测」
  });

  it('配置：坏值回默认；一组的空闲超时是一个数，改组长的，跟的那个自动跟上', () => {
    expect(normalizeSchedulerConfig({ idleMinutes: { chat: -3, embed: 'x', image: 7.6 }, exclusiveImage: 'yes' })).toEqual({ idleMinutes: { chat: 15, embed: 15, asr: 0, image: 8 }, exclusiveImage: false });
    const { s } = make();
    s.setConfig({ idleMinutes: { chat: 30 } as any });
    expect(s.config.idleMinutes).toEqual({ chat: 30, embed: 30, asr: 0, image: 5 });
    expect(formatGB(0.7 * GB)).toBe('0.7 GB');
    expect(formatGB(12 * GB)).toBe('12 GB');
  });
});

describe('让位与归位', () => {
  it('给生图让位的对话、嵌入，等出图干完自己回来（不用等下次提问）', async () => {
    const { s, chat, embed, image, setAvail } = make();
    s.setConfig({ exclusiveImage: true });
    chat.state.running = true; embed.state.running = true; setAvail(20);
    // 出图：先把这两位请下去
    await s.ensureCapacity('image');
    expect([chat.state.running, embed.state.running]).toEqual([false, false]);
    let st = await s.getState();
    expect(st.services.find((x) => x.id === 'chat')!.displacedBy).toBe('image');
    // 出图中：不能提前叫回来
    image.state.running = true;
    s.beginWork('image');
    expect(await s.restoreDisplaced('image')).toEqual([]);
    expect(chat.state.running).toBe(false);
    // 出完图：内存不到 32 GB，先把生图停掉，两位再回来
    s.endWork('image');
    expect(await s.restoreDisplaced('image')).toEqual(['chat', 'embed']);
    expect([chat.state.running, embed.state.running, image.state.running]).toEqual([true, true, false]);
    st = await s.getState();
    expect(st.services.find((x) => x.id === 'chat')!.displacedBy).toBeNull();
  });

  it('用的时候才起的（生图、转写）不算让位，不会被叫回来', async () => {
    const { s, chat, image, asr, setAvail } = make();
    s.setConfig({ exclusiveImage: true });
    image.state.running = true; asr.state.running = true; setAvail(20);
    await s.ensureCapacity('chat');     // 互斥把生图挤掉
    expect(image.state.running).toBe(false);
    const st = await s.getState();
    expect(st.services.find((x) => x.id === 'image')!.displacedBy).toBeNull();
    s.beginWork('chat'); s.endWork('chat');
    expect(await s.restoreDisplaced('chat')).toEqual([]);
    expect(image.state.running).toBe(false);
    expect(chat.state.running).toBe(false);   // ensureCapacity 只腾地方，不负责启动
  });

  it('用户自己停掉的不会被自作主张叫回来；空闲停掉的也一样', async () => {
    const { s, chat, embed, setAvail } = make();
    s.setConfig({ exclusiveImage: true });
    chat.state.running = true; embed.state.running = true; setAvail(20);
    await s.ensureCapacity('image');
    await s.start('chat');              // 用户手动起回来 → 整组都不再是「让位中」
    expect((await s.getState()).services.find((x) => x.id === 'chat')!.displacedBy).toBeNull();
    await s.stop('chat');               // 手动停掉
    expect(await s.restoreDisplaced('image')).toEqual([]);
    expect(chat.state.running).toBe(false);

    const b = make();
    b.chat.state.running = true; b.setAvail(20);
    b.s.touch('chat'); b.tick(16);
    await b.s.sweep();                  // 闲停
    expect(await b.s.restoreDisplaced('image')).toEqual([]);
  });

  it('连着出好几张图不来回折腾：出图干完排了归位，新的一张开工就取消', async () => {
    const { s, chat, image, setAvail } = make();
    s.setConfig({ exclusiveImage: true });
    chat.state.running = true; setAvail(20);
    await s.ensureCapacity('image');
    image.state.running = true;
    s.beginWork('image'); s.endWork('image');        // 第一张完了，排了个延迟归位
    s.beginWork('image');                             // 第二张马上开工
    await new Promise((r) => setTimeout(r, 30));
    expect(chat.state.running).toBe(false);           // 没有被叫回来打断出图
    expect(RESTORE_DELAY_MS).toBeGreaterThan(5000);
  });
});

describe('腾内存失败时不留烂摊子', () => {
  it('停了一半发现还是不够：刚请下去的立刻回来，不会一直停着没人管', async () => {
    const { s, chat, embed, setAvail } = make();
    s.setConfig({ exclusiveImage: true });
    chat.state.running = true; embed.state.running = true;
    setAvail(0.1);   // 怎么停都不够
    await expect(s.ensureCapacity('image')).rejects.toThrow('内存不够');
    // 关键：两位都已经回到运行中，displaced 记号也清了
    expect([chat.state.running, embed.state.running]).toEqual([true, true]);
    const st = await s.getState();
    expect(st.services.filter((x) => x.displacedBy).map((x) => x.id)).toEqual([]);
  });
});
