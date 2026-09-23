import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockApi } from '../test/setup';

// 麦克风在测试环境里不存在：换成一个假的，开始 / 停止的流程就能测了
vi.mock('../utils/micCapture', () => ({
  MIC_SILENCE_LEVEL: 0.02,
  startMicCapture: vi.fn(async () => ({ stop: vi.fn(), stream: {}, label: '测试麦克风', fellBack: false })),
}));

// 解码音频要靠 Chromium：测试里换成假的（50 秒的录音 = 每 20 秒一块，共三块）
const audioMock = vi.hoisted(() => ({ duration: 50 }));
vi.mock('../utils/audioFile', async (original) => ({
  ...(await original<typeof import('../utils/audioFile')>()),
  probeDuration: vi.fn(async () => audioMock.duration),
  decodeToMono16k: vi.fn(async () => new Float32Array(16000 * 50)),
}));

const DRAFT_KEY = 'iml.transcribe.draft';
const flush = () => new Promise((r) => setTimeout(r, 0));

/** 转写的 store 在模块加载时就会去找草稿，所以每个用例都重新加载一遍模块 */
async function loadStore(api = createMockApi()) {
  (window as any).api = api;
  vi.resetModules();
  const mod = await import('./transcribeStore');
  await flush(); await flush();
  return { ...mod, api };
}

describe('没放进笔记的转写：退出后还能找回来', () => {
  beforeEach(() => localStorage.clear());

  it('启动时把上次的文字和录音找回来；录音走应用数据目录里的文件', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ segments: [{ start: 0, text: '大家好' }, { start: 41, text: '下周三之前给结论' }], startedAt: 1_789_000_000_000, offset: 57, savedTo: null, savedCount: 0, audioDuration: 57 }));
    const api = createMockApi();
    (api.asr as any).getDraftAudio = vi.fn(async () => ({ path: '/data/transcribe-draft/recording.webm', bytes: 1000 }));
    const { useTranscribeStore, hasUnsavedTranscript } = await loadStore(api);
    const s = useTranscribeStore.getState();
    expect(s.segments).toHaveLength(2);
    expect(s).toMatchObject({ restored: true, offset: 57, status: 'idle', startedAt: 1_789_000_000_000 });
    expect(s.audio).toMatchObject({ blob: null, duration: 57 });
    expect(s.audio!.url).toBe(`iml-asset://local/${encodeURIComponent('/data/transcribe-draft/recording.webm')}`);
    expect(hasUnsavedTranscript(s)).toBe(true);
  });

  it('退出时正在录、那一段没来得及计入时长：找回来之后时间戳仍然接在最后一句后面', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ segments: [{ start: 0, text: '第一句' }, { start: 95, text: '最后一句' }], startedAt: 1, offset: 30, savedTo: null, savedCount: 0, audioDuration: 0 }));
    const { useTranscribeStore } = await loadStore();
    expect(useTranscribeStore.getState().offset).toBeGreaterThan(95);
    expect(useTranscribeStore.getState().audio).toBeNull();
  });

  it('每定稿一句就存一次；放进笔记之后草稿删掉，下次启动不会再冒出来', async () => {
    const { useTranscribeStore } = await loadStore();
    useTranscribeStore.setState({ segments: [{ start: 0, text: '第一句' }], startedAt: 5 });
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!)).toMatchObject({ segments: [{ start: 0, text: '第一句' }], savedCount: 0 });
    useTranscribeStore.setState({ segments: [{ start: 0, text: '第一句' }, { start: 3, text: '第二句' }] });
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).segments).toHaveLength(2);
    useTranscribeStore.setState({ savedTo: '/lib/a.md', savedCount: 2 });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('没有文字草稿：留着的录音也没用了，清掉；坏掉的草稿当作没有', async () => {
    localStorage.setItem(DRAFT_KEY, '{不是 JSON');
    const { useTranscribeStore, api } = await loadStore();
    expect(useTranscribeStore.getState().segments).toEqual([]);
    expect(api.asr.clearDraft).toHaveBeenCalled();
  });

  it('清空：文字草稿和录音草稿一起删', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ segments: [{ start: 0, text: '大家好' }], startedAt: 1, offset: 5, savedTo: null, savedCount: 0, audioDuration: 0 }));
    const { useTranscribeStore, api } = await loadStore();
    (api.asr.clearDraft as any).mockClear();
    useTranscribeStore.getState().clear();
    expect(useTranscribeStore.getState()).toMatchObject({ segments: [], restored: false, audio: null });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(api.asr.clearDraft).toHaveBeenCalled();
  });

  it('找回来的录音放进笔记：由主进程直接拷文件，不经过渲染进程的内存', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ segments: [{ start: 0, text: '大家好' }], startedAt: new Date(2026, 8, 20, 14, 5, 0).getTime(), offset: 5, savedTo: null, savedCount: 0, audioDuration: 5 }));
    const api = createMockApi({ '/lib/a.md': '# 周会' });
    (api.asr as any).getDraftAudio = vi.fn(async () => ({ path: '/data/transcribe-draft/recording.webm', bytes: 1000 }));
    const { useTranscribeStore } = await loadStore(api);
    const { useAppStore } = await import('./appStore');
    useAppStore.setState({ tabs: [{ id: '/lib/a.md', title: 'a.md', content: '# 周会', isDirty: false, mode: 'word' }], activeTabId: '/lib/a.md' });
    expect(await useTranscribeStore.getState().insertIntoActiveNote()).toBe(true);
    expect(api.asr.copyDraftAudio).toHaveBeenCalledWith('/lib', '录音-20260920-140500.webm');
    expect(api.fs.saveRecording).not.toHaveBeenCalled();
    expect(useAppStore.getState().tabs[0].content).toContain('<audio controls preload="metadata" src="assets/rec.webm"></audio>');
    expect(useTranscribeStore.getState()).toMatchObject({ savedCount: 1, restored: false });
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('区分说话人：带声纹的定稿会标上是谁说的；改名 / 合并之后句子跟着走，笔记里那份算过时；草稿里带着说话人', async () => {
    const fixture = (await import('../utils/__fixtures__/speakerEmbeddings.json')).default as { who: string; dur: number; emb: number[] }[];
    const api = createMockApi({ '/lib/a.md': '# 周会' });
    let emit: (e: any) => void = () => {};
    (api.asr as any).onEvent = vi.fn((cb: (e: any) => void) => { emit = cb; return () => {}; });
    const { useTranscribeStore, hasUnsavedTranscript } = await loadStore(api);
    const long = (who: string) => fixture.filter((u) => u.who === who && u.dur > 3);
    const say = (u: { dur: number; emb: number[] }, text: string, start: number) => emit({ type: 'final', text, start, duration: u.dur, decodeMs: 1, embedding: u.emb });

    say(long('A')[0], '开始吧。', 0); say(long('B')[0], '我这边提测了。', 6); say(long('A')[1], '好，下周三给结论。', 12);
    emit({ type: 'final', text: '没开区分说话人时的句子', start: 20, duration: 3, decodeMs: 1 });
    let s = useTranscribeStore.getState();
    expect(s.segments.map((x) => x.speaker)).toEqual(['s1', 's2', 's1', undefined]);
    expect(s.speakers.map((p) => p.name)).toEqual(['说话人 1', '说话人 2']);

    const { useAppStore } = await import('./appStore');
    useAppStore.setState({ tabs: [{ id: '/lib/a.md', title: 'a.md', content: '# 周会', isDirty: false, mode: 'word' }], activeTabId: '/lib/a.md' });
    await s.insertIntoActiveNote();
    expect(useAppStore.getState().tabs[0].content).toContain('<p>[00:06] 说话人 2：我这边提测了。</p>');
    expect(hasUnsavedTranscript(useTranscribeStore.getState())).toBe(false);

    useTranscribeStore.getState().renameSpeaker('s2', '老王');
    expect(hasUnsavedTranscript(useTranscribeStore.getState())).toBe(true);        // 笔记里还写着「说话人 2」
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).speakers.map((p: any) => p.name)).toEqual(['说话人 1', '老王']);
    await useTranscribeStore.getState().insertIntoActiveNote();
    expect(useAppStore.getState().tabs[0].content).toContain('<p>[00:06] 老王：我这边提测了。</p>');
    expect(useAppStore.getState().tabs[0].content.match(/<details data-iml-transcript>/g)).toHaveLength(1);

    useTranscribeStore.getState().renameSpeaker('s1', '老王');                     // 其实是同一个人：合并
    s = useTranscribeStore.getState();
    expect(s.speakers.map((p) => p.id)).toEqual(['s2']);
    expect(s.segments.map((x) => x.speaker)).toEqual(['s2', 's2', 's2', undefined]);
  });
});

describe('一场转写 = 一篇笔记', () => {
  beforeEach(() => localStorage.clear());

  async function setup(files: Record<string, string> = {}) {
    const api = createMockApi(files);
    let emit: (e: any) => void = () => {};
    (api.asr as any).onEvent = vi.fn((cb: (e: any) => void) => { emit = cb; return () => {}; });
    (api.asr as any).start = vi.fn(async () => ({}));
    (api.asr as any).stop = vi.fn(async () => ({}));
    const mod = await loadStore(api);
    const { useAppStore } = await import('./appStore');
    useAppStore.setState({ workspacePath: '/lib', tabs: [], activeTabId: null, selectedNodePath: null });
    return { ...mod, useAppStore, say: (text: string, start: number) => emit({ type: 'final', text, start, duration: 3, decodeMs: 1 }) };
  }

  it('点开始就新建一篇会议记录并打开；停下来，全文自动写进去；「新的转写」直接开下一场', async () => {
    const { useTranscribeStore, useAppStore, hasUnsavedTranscript, api, say } = await setup();
    await useTranscribeStore.getState().start('new');
    const bound = useTranscribeStore.getState().savedTo!;
    expect(bound).toMatch(/^\/lib\/会议记录 \d{4}-\d{2}-\d{2} \d{4}\.md$/);
    expect(useAppStore.getState().activeTabId).toBe(bound);
    const skeleton = useAppStore.getState().tabs[0].content;
    expect(skeleton).toContain('type: meeting');
    expect(skeleton).toContain('## 要点');
    expect(skeleton).not.toContain('<details');          // 全文还没有，先给人一个记要点的地方

    say('大家好。', 0); say('下周三给结论。', 4);
    await useTranscribeStore.getState().stop();
    const note = useAppStore.getState().tabs.find((t) => t.id === bound)!.content;
    expect(note).toContain('<p>[00:04] 下周三给结论。</p>');
    expect(note.indexOf('## 要点')).toBeLessThan(note.indexOf('<details'));
    expect(hasUnsavedTranscript(useTranscribeStore.getState())).toBe(false);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

    // 停了再继续：还是这一篇，转写块是更新而不是再来一块
    await useTranscribeStore.getState().start();
    expect(useTranscribeStore.getState().savedTo).toBe(bound);
    say('散会。', 2);
    await useTranscribeStore.getState().stop();
    const again = useAppStore.getState().tabs.find((t) => t.id === bound)!.content;
    expect(again.match(/<details data-iml-transcript>/g)).toHaveLength(1);
    expect(again).toContain('散会。');

    // 下一场：面板清空，另起一篇
    await useTranscribeStore.getState().newSession();
    const next = useTranscribeStore.getState();
    expect(next.segments).toEqual([]);
    expect(next.savedTo).not.toBe(bound);
    expect(next.status).toBe('recording');
    expect((api.fs.writeFile as any).mock.calls.filter((c: any[]) => /会议记录/.test(c[0]))).toHaveLength(2);
  });

  it('「记在当前笔记里」：不新建，绑定到打开的这篇', async () => {
    const { useTranscribeStore, useAppStore, say } = await setup({ '/lib/议程.md': '# 议程\n\n- 排期' });
    await useAppStore.getState().openFileByPath('/lib/议程.md');
    await useTranscribeStore.getState().start('current');
    expect(useTranscribeStore.getState().savedTo).toBe('/lib/议程.md');
    say('先过排期。', 0);
    await useTranscribeStore.getState().stop();
    expect(useAppStore.getState().tabs[0].content).toContain('<p>[00:00] 先过排期。</p>');
  });

  it('这一场的笔记被关掉：录音跟着停，全文直接写进磁盘上的文件（不把笔记重新打开），面板回到待录音', async () => {
    const { useTranscribeStore, useAppStore, api, say } = await setup({ '/lib/议程.md': '# 议程\n\n- 排期' });
    await useAppStore.getState().openFileByPath('/lib/议程.md');
    await useTranscribeStore.getState().start('current');
    say('先过排期。', 0); say('下周三给结论。', 4);
    useAppStore.setState({ tabs: [], activeTabId: null });            // 会开到一半，用户把这篇关了
    await flush(); await flush(); await flush();
    expect(api.asr.stop).toHaveBeenCalled();
    const s = useTranscribeStore.getState();
    expect(s).toMatchObject({ status: 'idle', segments: [], savedTo: null, audio: null });
    expect(useAppStore.getState().tabs).toEqual([]);                  // 没有被重新打开
    const onDisk = api.files.get('/lib/议程.md')!;
    expect(onDisk).toContain('- 排期');
    expect(onDisk).toContain('<p>[00:04] 下周三给结论。</p>');
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it('已经停下、也存好了的一场：关掉它的笔记，面板同样回到待录音，不重复写文件', async () => {
    const { useTranscribeStore, useAppStore, api, say } = await setup({ '/lib/议程.md': '# 议程' });
    await useAppStore.getState().openFileByPath('/lib/议程.md');
    await useTranscribeStore.getState().start('current');
    say('散会。', 0);
    await useTranscribeStore.getState().stop();
    (api.fs.writeFile as any).mockClear();
    useAppStore.setState({ tabs: [], activeTabId: null });
    await flush(); await flush();
    expect(useTranscribeStore.getState().segments).toEqual([]);
    expect(api.fs.writeFile).not.toHaveBeenCalled();
  });

  it('正在转写时关它的笔记要先问：只对这一场的笔记、只在正在录的时候；停下之后不问', async () => {
    const { useTranscribeStore, useAppStore, say } = await setup({ '/lib/议程.md': '# 议程', '/lib/别的.md': '# 别的' });
    await useAppStore.getState().openFileByPath('/lib/别的.md');
    await useAppStore.getState().openFileByPath('/lib/议程.md');
    const guard = () => useAppStore.getState().closeGuard!;
    const tab = (id: string) => useAppStore.getState().tabs.find((t) => t.id === id)!;
    expect(guard()(tab('/lib/议程.md'))).toBeNull();                       // 还没开始
    await useTranscribeStore.getState().start('current');
    expect(guard()(tab('/lib/议程.md'))).toMatchObject({ title: '正在转写', confirmLabel: '结束转写并关闭' });
    expect(guard()(tab('/lib/别的.md'))).toBeNull();
    // 直接点关闭：不会关，也不会停
    useAppStore.getState().requestCloseTab('/lib/议程.md');
    expect(useAppStore.getState().tabs.some((t) => t.id === '/lib/议程.md')).toBe(true);
    expect(useTranscribeStore.getState().status).toBe('recording');
    useAppStore.getState().cancelCloseQueue();
    say('散会。', 0);
    await useTranscribeStore.getState().stop();
    expect(guard()(tab('/lib/议程.md'))).toBeNull();
  });

  it('笔记改名 / 另存不算关掉：跟到新路径上，转写继续', async () => {
    const { useTranscribeStore, useAppStore, say } = await setup({ '/lib/议程.md': '# 议程' });
    await useAppStore.getState().openFileByPath('/lib/议程.md');
    await useTranscribeStore.getState().start('current');
    say('先过排期。', 0);
    useAppStore.setState((st) => ({ tabs: st.tabs.map((t) => ({ ...t, id: '/lib/周会.md', title: '周会.md' })), activeTabId: '/lib/周会.md' }));
    await flush();
    expect(useTranscribeStore.getState()).toMatchObject({ status: 'recording', savedTo: '/lib/周会.md' });
    expect(useTranscribeStore.getState().segments).toHaveLength(1);
  });

  it('关掉的是还没存过盘的未命名文档：没地方写，这一场留在面板里，让人另找地方放', async () => {
    const { useTranscribeStore, useAppStore, hasUnsavedTranscript, say } = await setup();
    useAppStore.getState().openTab({ id: 'new-1.md', title: '未命名', content: '', isDirty: false, mode: 'word' });
    await useTranscribeStore.getState().start('current');
    expect(useTranscribeStore.getState().savedTo).toBe('new-1.md');
    say('随便说两句。', 0);
    useAppStore.setState({ tabs: [], activeTabId: null });
    await flush(); await flush(); await flush();
    const s = useTranscribeStore.getState();
    expect(s.status).toBe('idle');
    expect(s.segments).toHaveLength(1);
    expect(s.savedTo).toBeNull();
    expect(hasUnsavedTranscript(s)).toBe(true);
  });

  it('打点：往这一场的笔记里插入现在的时间；正开着别的笔记时先切回去，不往别处乱插', async () => {
    const { useTranscribeStore, useAppStore } = await setup({ '/lib/别的.md': '# 别的' });
    const insertText = vi.fn(() => true);
    useAppStore.getState().registerEditorActions({ insertText, startList: vi.fn() });
    expect(useTranscribeStore.getState().markMoment()).toBe(false);          // 没在转写
    await useTranscribeStore.getState().start('new');
    expect(useTranscribeStore.getState().markMoment()).toBe(true);
    expect(insertText).toHaveBeenCalledWith(expect.stringMatching(/^\[00:0\d\] $/));
    await useAppStore.getState().openFileByPath('/lib/别的.md');
    insertText.mockClear();
    expect(useTranscribeStore.getState().markMoment()).toBe(false);
    expect(insertText).not.toHaveBeenCalled();
    expect(useAppStore.getState().activeTabId).toBe(useTranscribeStore.getState().savedTo);
  });

  it('没打开笔记库、也没有打开的笔记：转写照常，停下来之后算「没保存」，由用户选放哪', async () => {
    const { useTranscribeStore, useAppStore, hasUnsavedTranscript, say } = await setup();
    useAppStore.setState({ workspacePath: null, defaultLibraryPath: '' } as any);
    await useTranscribeStore.getState().start('new');
    expect(useTranscribeStore.getState().savedTo).toBeNull();
    say('随便说两句。', 0);
    await useTranscribeStore.getState().stop();
    expect(hasUnsavedTranscript(useTranscribeStore.getState())).toBe(true);
  });
});

describe('转写一段已有的录音', () => {
  beforeEach(() => { localStorage.clear(); audioMock.duration = 50; });

  async function setup() {
    const api = createMockApi();
    let emit: (e: any) => void = () => {};
    let chunks = 0;
    (api.asr as any).onEvent = vi.fn((cb: (e: any) => void) => { emit = cb; return () => {}; });
    (api.asr as any).start = vi.fn(async () => ({}));
    (api.asr as any).stop = vi.fn(async () => ({}));
    // 识别进程的样子：每收到一块，吐一句定稿，再回一个 fed 表示「这块处理完了，给下一块」
    (api.asr as any).sendPcm = vi.fn((samples: Float32Array) => {
      const at = chunks++ * 20;
      queueMicrotask(() => { emit({ type: 'final', text: `第 ${chunks} 块里的一句话。`, start: at + 1, duration: 3, decodeMs: 1 }); emit({ type: 'fed', samples: chunks * samples.length }); });
    });
    const mod = await loadStore(api);
    const { useAppStore } = await import('./appStore');
    useAppStore.setState({ workspacePath: '/lib', tabs: [], activeTabId: null, selectedNodePath: null });
    return { ...mod, useAppStore };
  }

  it('新建一篇以文件名命名的笔记；一块一块喂、等上一块处理完再喂下一块；转完全文和原录音写进笔记', async () => {
    const { useTranscribeStore, useAppStore, api } = await setup();
    await useTranscribeStore.getState().transcribeFile('/rec/2026-09-20 周会.m4a');
    expect(api.asr.start).toHaveBeenCalledWith({ speakers: false, source: 'file' });        // 用不着麦克风
    expect(api.asr.sendPcm).toHaveBeenCalledTimes(3);
    const s = useTranscribeStore.getState();
    expect(s).toMatchObject({ status: 'idle', source: 'file', fileJob: null, savedTo: '/lib/录音转写 2026-09-20 周会.md', offset: 50 });
    expect(s.segments.map((x) => Math.round(x.start))).toEqual([1, 21, 41]);                // 时间戳就是录音里的位置
    expect(s.audio).toMatchObject({ blob: null, duration: 50, filePath: '/rec/2026-09-20 周会.m4a' });
    expect(api.fs.copyRecording).toHaveBeenCalledWith('/lib', '/rec/2026-09-20 周会.m4a', '2026-09-20 周会.m4a');
    const note = useAppStore.getState().tabs[0].content;
    expect(note).toContain('# 录音转写 2026-09-20 周会');
    expect(note).toContain('<audio controls preload="metadata" src="assets/2026-09-20 周会.m4a"></audio>');
    expect(note).toContain('<p>[00:21] 第 2 块里的一句话。</p>');
  });

  it('太长的录音在解码之前就挡掉：不建笔记、不启动识别进程；不是录音文件也一样', async () => {
    const { useTranscribeStore, useAppStore, api } = await setup();
    audioMock.duration = 3 * 3600;
    await useTranscribeStore.getState().transcribeFile('/rec/三小时的课.mp3');
    expect(useTranscribeStore.getState().error).toContain('最多转 90 分钟');
    expect(useTranscribeStore.getState().status).toBe('idle');
    expect(api.asr.start).not.toHaveBeenCalled();
    expect(useAppStore.getState().tabs).toEqual([]);
    await useTranscribeStore.getState().transcribeFile('/rec/不是录音.pdf');
    expect(useTranscribeStore.getState().error).toContain('这个格式转不了');
  });

  it('转到一半点「取消」：不再往下转，已经转出来的照样写进笔记', async () => {
    const { useTranscribeStore, useAppStore, api } = await setup();
    const original = (api.asr as any).sendPcm;
    (api.asr as any).sendPcm = vi.fn((samples: Float32Array) => { original(samples); if ((api.asr as any).sendPcm.mock.calls.length === 1) queueMicrotask(() => void useTranscribeStore.getState().stop()); });
    await useTranscribeStore.getState().transcribeFile('/rec/周会.m4a');
    expect((api.asr as any).sendPcm.mock.calls.length).toBeLessThan(3);
    expect(useTranscribeStore.getState().status).toBe('idle');
    expect(useAppStore.getState().tabs[0].content).toContain('第 1 块里的一句话。');
  });
});

