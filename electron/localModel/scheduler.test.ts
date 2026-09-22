import { describe, expect, it, vi } from 'vitest';
import { Scheduler, normalizeSchedulerConfig, formatGB, RESTORE_DELAY_MS, type ServiceDriver, type ServiceId } from './scheduler';

const GB = 1024 ** 3;

/** 一个假服务：跑 / 停、忙不忙都由测试摆 */
function fake(id: ServiceId, label: string, bytes: number, opts: { startable?: boolean; restorable?: boolean } = {}) {
  const state = { running: false, busy: false };
  const driver: ServiceDriver & { state: typeof state; stop: ReturnType<typeof vi.fn> } = {
    id, label, estimateBytes: () => bytes, running: () => state.running, busy: () => state.busy, pid: () => (state.running ? 100 : null),
    stop: vi.fn(async () => { state.running = false; }),
    ...(opts.startable === false ? {} : { start: async () => { state.running = true; } }),
    restorable: opts.restorable ?? false,
    state,
  } as any;
  return driver;
}

function make(total = 24 * GB) {
  let now = 1_000_000;
  let avail = 8 * GB;
  const log: string[] = [];
  const s = new Scheduler({ now: () => now, totalMemory: () => total, availableMemory: async () => avail, rssOf: async () => 1.5 * GB, log: (m) => log.push(m) });
  const chat = fake('chat', '对话模型', 6 * GB, { restorable: true });
  const embed = fake('embed', '嵌入模型', 0.3 * GB, { restorable: true });
  const asr = fake('asr', '实时转写', 0.7 * GB, { startable: false });
  const image = fake('image', '本机生图', 12 * GB);
  [chat, embed, asr, image].forEach((d) => s.register(d));
  return { s, chat, embed, asr, image, log, tick: (min: number) => { now += min * 60000; }, setAvail: (gb: number) => { avail = gb * GB; } };
}

describe('本机模型调度', () => {
  it('空闲自动停：过了各自的超时才停，正在忙的不碰，超时 0 的永远不自动停', async () => {
    const { s, chat, embed, asr, tick } = make();
    chat.state.running = true; embed.state.running = true; asr.state.running = true;
    s.touch('chat'); s.touch('embed'); s.touch('asr');
    tick(11);
    expect(await s.sweep()).toEqual(['embed']); // 嵌入 10 分钟到了，对话 15 分钟还没到
    expect(chat.state.running).toBe(true);
    s.beginWork('chat');
    tick(30);
    expect(await s.sweep()).toEqual([]); // 对话正在回答
    s.endWork('chat');
    tick(16);
    expect(await s.sweep()).toEqual(['chat']);
    expect(asr.state.running).toBe(true); // 转写超时是 0：只随会话结束
  });

  it('没记过使用时间的服务（用户在设置里手动起的）：从第一次看到它在跑算起', async () => {
    const { s, chat, tick } = make();
    chat.state.running = true;
    expect(await s.sweep()).toEqual([]); // 第一次看到，开始计时
    tick(16);
    expect(await s.sweep()).toEqual(['chat']);
  });

  it('启动前算预算：内存不够先停空闲的、最久没用的；够了就不再停；还不够就拒绝并把数字说清楚', async () => {
    const { s, chat, embed, setAvail, tick } = make();
    chat.state.running = true; embed.state.running = true;
    s.touch('embed'); tick(1); s.touch('chat'); // 嵌入更久没用
    setAvail(0.5);
    let calls = 0;
    // 每停一个，可用内存涨回来一点
    (s as any).deps.availableMemory = async () => (calls++ === 0 ? 0.5 * GB : 1 * GB);
    await expect(s.ensureCapacity('asr')).resolves.toEqual({ stopped: ['embed'] }); // 转写要 0.7 GB：停掉嵌入就够了，对话留着
    expect(chat.state.running).toBe(true);

    const busy = make();
    busy.chat.state.running = true; busy.chat.state.busy = true; busy.setAvail(0.2);
    await expect(busy.s.ensureCapacity('asr')).rejects.toThrow(/内存不够：实时转写大约要 0\.7 GB，现在可用约 0\.2 GB（对话模型正在忙，没法停）/);
  });

  it('24 GB 的机器上生图和对话互斥：生图前停掉对话与嵌入，对话正在回答就拒绝；32 GB 及以上不管', async () => {
    const { s, chat, embed, image, setAvail } = make();
    chat.state.running = true; embed.state.running = true; setAvail(20);
    await expect(s.ensureCapacity('image')).resolves.toEqual({ stopped: ['chat', 'embed'] });
    image.state.running = true;
    await expect(s.ensureCapacity('chat')).resolves.toEqual({ stopped: ['image'] });

    const b = make(); b.chat.state.running = true; b.chat.state.busy = true; b.setAvail(20);
    await expect(b.s.ensureCapacity('image')).rejects.toThrow('对话模型正在忙，等它完成再本机生图');

    const big = make(64 * GB); big.chat.state.running = true; big.setAvail(40);
    await expect(big.s.ensureCapacity('image')).resolves.toEqual({ stopped: [] });
    big.s.setConfig({ exclusiveImage: false });
    expect(big.s.exclusiveApplies).toBe(false);
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

  it('状态给面板：跑着的量真实内存，没跑的给估算；正在忙的标出来', async () => {
    const { s, chat, setAvail } = make();
    setAvail(9);
    chat.state.running = true; s.beginWork('chat');
    const st = await s.getState();
    expect(st.totalBytes).toBe(24 * GB);
    expect(st.exclusiveApplies).toBe(true);
    const c = st.services.find((x) => x.id === 'chat')!;
    expect(c).toMatchObject({ status: 'busy', rssBytes: 1.5 * GB, canStop: false, canStart: false, idleMinutes: 15 });
    const a = st.services.find((x) => x.id === 'asr')!;
    expect(a).toMatchObject({ status: 'stopped', rssBytes: null, estimateBytes: 0.7 * GB, canStart: false, idleMinutes: 0 });
  });

  it('配置：坏值回默认，改一项别的不动', () => {
    expect(normalizeSchedulerConfig({ idleMinutes: { chat: -3, embed: 'x', image: 7.6 }, exclusiveImage: 'yes' })).toEqual({ idleMinutes: { chat: 15, embed: 10, asr: 0, image: 8 }, exclusiveImage: true });
    const s = new Scheduler({ totalMemory: () => 24 * GB });
    s.setConfig({ idleMinutes: { chat: 30 } as any });
    expect(s.config.idleMinutes).toEqual({ chat: 30, embed: 10, asr: 0, image: 5 });
    expect(formatGB(0.7 * GB)).toBe('0.7 GB');
    expect(formatGB(12 * GB)).toBe('12 GB');
  });
});

describe('让位与归位', () => {
  it('给生图让位的对话、嵌入，等出图干完自己回来（不用等下次提问）', async () => {
    const { s, chat, embed, image, setAvail } = make();
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
    const { s, chat, embed, setAvail, tick } = make();
    chat.state.running = true; embed.state.running = true; setAvail(20);
    await s.ensureCapacity('image');
    await s.start('chat');              // 用户手动起回来 → 不再是「让位中」
    expect((await s.getState()).services.find((x) => x.id === 'chat')!.displacedBy).toBeNull();
    await s.stop('chat');               // 手动停掉
    expect(await s.restoreDisplaced('image')).toEqual(['embed']);
    expect(chat.state.running).toBe(false);

    const b = make();
    b.chat.state.running = true; b.setAvail(20);
    b.s.touch('chat'); b.tick(16);
    await b.s.sweep();                  // 闲停
    expect(await b.s.restoreDisplaced('image')).toEqual([]);
    expect(tick).toBeDefined();
  });

  it('连着出好几张图不来回折腾：出图干完排了归位，新的一张开工就取消', async () => {
    const { s, chat, image, setAvail } = make();
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
