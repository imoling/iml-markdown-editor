import { create } from 'zustand';
import type { AsrState, AsrEvent } from '../types/window';
import { startMicCapture, MIC_SILENCE_LEVEL, type MicCapture } from '../utils/micCapture';
import { startSystemCapture } from '../utils/systemCapture';
import { SYSTEM_AUDIO_ID } from '../utils/micDevices';
import { getPreferredMic, setPreferredMic, listMics, type MicList } from '../utils/micDevices';
import { SessionRecorder } from '../utils/sessionRecorder';
import { noteDirOf, toAssetUrl } from '../utils/assetUrl';
import { AUDIO_FILE_EXTS, MAX_FILE_MINUTES, FILE_SAMPLE_RATE, isAudioFile, audioBaseName, probeDuration, decodeToMono16k } from '../utils/audioFile';
import { assignSpeaker, renameSpeaker, speakerNames, initialSpeakers, saveMyVoiceprint, forgetMyVoiceprint, loadMyVoiceprint, ME_ID, type Speaker } from '../utils/speakers';
import { useAppStore } from './appStore';
import {
  type TranscriptSegment, transcriptText, formatClock, buildTranscriptBlock, upsertBlock, insertMinutes, newMeetingNote, meetingNoteTitle,
  stripTranscriptBlocks, splitForSummary, recordingFileName, buildMinutesMessages, buildPartMessages, buildMergeMessages, cleanMinutes,
} from '../utils/transcript';
import { stripThinking } from '../utils/askNotes';

export type TranscribeStatus = 'idle' | 'starting' | 'recording' | 'stopping';

interface TranscribeState {
  asr: AsrState | null;
  status: TranscribeStatus;
  segments: TranscriptSegment[];
  /** 正在说的这一句（还会变） */
  partial: TranscriptSegment | null;
  /** 第一次按下开始的时刻；中途停了再继续，仍算同一场 */
  startedAt: number | null;
  /** 之前几段录音累计的时长（秒）：继续转写时，时间戳接着往下排 */
  offset: number;
  /** 本段录音开始的时刻（毫秒），用来算已经录了多久 */
  runStartedAt: number | null;
  level: number;
  /** 用户选的麦克风（空串 = 跟随系统）和当前能看到的设备 */
  micId: string;
  mics: MicList;
  /** 区分说话人（存在本机的偏好；要另外下载一个 27 MB 的声纹模型） */
  speakersOn: boolean;
  /** 这一场出现过的说话人 */
  speakers: Speaker[];
  /** 记过自己的声纹没有 */
  hasMyVoice: boolean;
  /** 留不留录音（用于回听）。存在本机的偏好；一场转写开始时定下来，中途改不影响这一场 */
  keepRecording: boolean;
  /**
   * 这一场的录音：停下来之后才有。url 给面板里的播放器用。
   * blob 为空有两种：filePath 有值 = 转写的是一段已有的录音（就是那个文件）；都没有 = 上次没保存、这次启动找回来的（在应用数据目录里）
   */
  audio: { blob: Blob | null; url: string; duration: number; filePath?: string } | null;
  /** 这一场的声音从哪来：麦克风现场转写，还是一段已有的录音文件 */
  source: 'mic' | 'file';
  /** 转写录音文件的进度：文件名、处理到哪了（0~1）、正在干什么 */
  fileJob: { name: string; progress: number; phase: 'reading' | 'transcribing' } | null;
  /** 这一场是上次退出前没放进笔记、这次启动找回来的 */
  restored: boolean;
  /** 这次运行里真的从麦克风收到过声音：有这个事实在，就不管系统 API 怎么说授权状态 */
  heardSignal: boolean;
  /** 这次录音实际在用的麦克风 */
  deviceLabel: string;
  /** 连续几秒一点信号都没有（不是「没人说话」，是数字静音）：多半是麦克风被静音了，或者选错了设备 */
  silent: boolean;
  error: string | null;
  /** 转写已经写进了哪篇笔记（生成纪要时往那里放） */
  savedTo: string | null;
  /** 上次放进笔记时有多少句：之后又多出来的就是「还没保存的」 */
  savedCount: number;
  /** 说话人的名字每改一次加一；和 savedNamesRev 不一样，说明笔记里那份的名字过时了 */
  namesRev: number;
  savedNamesRev: number;
  /** 这一场有没有在留录音 */
  recordingOn: boolean;
  minutes: { running: boolean; progress: string; error: string | null };

  refresh: () => Promise<void>;
  refreshMics: () => Promise<void>;
  setMic: (id: string) => void;
  setKeepRecording: (keep: boolean) => void;
  setSpeakersOn: (on: boolean) => void;
  /** 改名；改成和别人一样的名字 = 合并成一个人 */
  renameSpeaker: (id: string, name: string) => void;
  /** 「这是我」：记住这个人的声纹，以后每场自动标成「我」 */
  rememberAsMe: (id: string) => void;
  forgetMe: () => void;
  install: () => void;
  cancelInstall: () => void;
  /**
   * 开始 / 继续。新的一场默认新建一篇会议记录并打开（'new'），也可以记在当前打开的笔记里（'current'）；
   * 这篇笔记就是这一场的「家」：停下来时转写全文和录音自动写进去，纪要也放在那里
   */
  start: (into?: 'new' | 'current') => Promise<void>;
  /** 转写一段已有的录音：不传路径就弹文件选择框。新建一篇笔记，全文和这段录音写进去，和现场转写的一场一样 */
  transcribeFile: (filePath?: string) => Promise<void>;
  /** 把转写全文（和录音）写进这一场绑定的笔记；笔记关掉了会重新打开。返回是否写成 */
  commit: (opts?: { quiet?: boolean }) => Promise<boolean>;
  /** 这一场的笔记被关掉了：转写跟着结束 —— 停止录音、把全文和录音写进那篇笔记的文件，面板回到待录音的状态 */
  endBecauseNoteClosed: () => Promise<void>;
  /** 上一场已经存好了：清掉面板，直接开始新的一场 */
  newSession: () => Promise<void>;
  /** 打点：在正文光标处插入当前的时间 [mm:ss]，之后点它，录音跳到这一刻 */
  markMoment: () => boolean;
  stop: () => Promise<void>;
  clear: () => void;
  elapsed: () => number;
  insertIntoActiveNote: () => Promise<boolean>;
  saveAsNewNote: () => Promise<string | null>;
  generateMinutes: () => Promise<void>;
}

const cleanError = (err: any) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');

let capture: MicCapture | null = null;
let recorder: SessionRecorder | null = null;
/** 正在转写的录音文件：release = 识别进程处理完一块，可以喂下一块了 */
let activeFileJob: { cancelled: boolean; release: (() => void) | null } | null = null;

const SPEAKERS_KEY = 'iml.transcribe.speakers';
function readFlag(key: string, fallback: boolean): boolean { try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; } catch { return fallback; } }
const KEEP_KEY = 'iml.keepRecording';
/** 默认留录音：想回听是常态；不想留的在「实时转写…」里关掉 */
function readKeepRecording(): boolean { try { return localStorage.getItem(KEEP_KEY) !== '0'; } catch { return true; } }

/** 正在处理「笔记被关掉」：期间标签页再怎么变都不重复触发 */
let ending = false;

const noteName = (path: string) => (path.split(/[\\/]/).pop() || path).replace(/\.md$/i, '');

/** 放开麦克风、让识别进程把最后一句吐出来、收好录音；不管写进哪（停止按钮和「笔记被关掉」共用） */
async function stopCapture() {
  const { getState: get, setState: set } = useTranscribeStore;
  set({ status: 'stopping' });
  const recording = collectRecording();   // 先让录音机暂停，再放开麦克风
  capture?.stop(); capture = null;
  const ran = get().runStartedAt ? (Date.now() - get().runStartedAt!) / 1000 : 0;
  try { await window.api.asr.stop(); } catch { /* 进程已经没了也算停了 */ }
  await recording;
  // 最后一句的定稿在 stop 返回之前已经送到；还挂着的临时文字说明那句没来得及定稿，保住它
  set((s) => ({
    status: 'idle', level: 0, silent: false, runStartedAt: null, offset: s.offset + ran,
    segments: s.partial?.text ? [...s.segments, s.partial] : s.segments, partial: null,
  }));
}

/**
 * 给新的一场转写找个「家」。默认新建一篇会议记录（属性 + 标题 + 留给用户记要点的地方）并打开，光标放进「要点」；
 * 没打开笔记库（不知道往哪建）就退回当前打开的笔记；两样都没有返回 null —— 转写照常进行，停下来之后由用户决定放哪
 */
async function bindNote(into: 'new' | 'current', at: Date, customTitle?: string): Promise<string | null> {
  const app = useAppStore.getState();
  const dir = app.getNewNoteDir();
  if (into === 'current' || !dir) {
    if (app.activeTabId) return app.activeTabId;
    if (!dir) return null;
  }
  try {
    const title = (customTitle || meetingNoteTitle(at)).replace(/[\\/:*?"<>|#]/g, ' ').replace(/\s+/g, ' ').trim();
    const sep = dir.includes('\\') ? '\\' : '/';
    let filePath = `${dir}${sep}${title}.md`;
    for (let i = 2; await window.api.fs.exists(filePath); i++) filePath = `${dir}${sep}${title} ${i}.md`;
    const res = await window.api.fs.writeFile(filePath, newMeetingNote(filePath.slice(dir.length + 1).replace(/\.md$/i, ''), at));
    if (!res.success) throw new Error(res.error || '写不进去');
    await app.refreshWorkspace();
    await app.openFileByPath(filePath);
    // 等编辑器把新笔记载进来，再在「要点」下面另起一个列表项、把光标放进去：点了开始就能直接打字
    setTimeout(() => { if (useAppStore.getState().activeTabId === filePath) useAppStore.getState().editorActions?.startList(); }, 350);
    return filePath;
  } catch (err) {
    useAppStore.getState().notify(`会议记录没建成（${cleanError(err)}），转写照常进行，结束后再选放到哪`);
    return useAppStore.getState().activeTabId;
  }
}

/** 一段录音停下来：从录音机那里拿到目前为止的整份录音，换掉面板播放器用的那一份 */
async function collectRecording() {
  if (!recorder) return;
  const wasFailed = recorder.failed;
  const recording = await recorder.detach().catch(() => null);
  if (recorder.failed && !wasFailed) useAppStore.getState().notify('录音中途断了，后面的部分没有录上（转写不受影响）');
  if (!recording) return;
  const old = useTranscribeStore.getState().audio;
  if (old?.blob) URL.revokeObjectURL(old.url);
  useTranscribeStore.setState({ audio: { blob: recording.blob, url: URL.createObjectURL(recording.blob), duration: recording.durationSec } });
  // 落一份到应用数据目录：还没放进笔记就退出了，下次打开还能找回来
  try { await window.api.asr.saveDraftAudio(await recording.blob.arrayBuffer()); } catch (err) { console.warn('[transcribe] 录音草稿没存上：', err); }
}

/** 把录音存到笔记旁边，返回写进转写块里的相对地址；没有录音、或存不了，返回 null（转写照样放进笔记） */
async function saveRecording(noteDir: string | null, startedAt: Date): Promise<string | null> {
  const audio = useTranscribeStore.getState().audio;
  if (!audio) return null;
  if (!noteDir) { useAppStore.getState().notify('这篇笔记还没有保存位置，录音没能跟着放进去'); return null; }
  try {
    const res = audio.blob
      ? await window.api.fs.saveRecording(noteDir, recordingFileName(startedAt), await audio.blob.arrayBuffer())
      : audio.filePath
        ? await window.api.fs.copyRecording(noteDir, audio.filePath, audio.filePath.split(/[\\/]/).pop() || 'recording')   // 转写的是一段已有的录音：原文件拷到笔记旁边
        : await window.api.asr.copyDraftAudio(noteDir, recordingFileName(startedAt));
    if (res.success && res.path) return res.path;
    useAppStore.getState().notify(`录音没存上：${res.error || '未知错误'}`);
  } catch (err) {
    useAppStore.getState().notify(`录音没存上：${cleanError(err)}`);
  }
  return null;
}

const SILENCE_MS = 4000;
/** 整理纪要是「照着材料写」：温度压低，本机小模型才不会自由发挥 */
const MINUTES_TEMPERATURE = 0.2;

/**
 * 实时转写的状态。放在独立的 store 里而不是面板组件里：侧边栏切到别的页、甚至收起来，录音都不能断。
 */
export const useTranscribeStore = create<TranscribeState>((set, get) => ({
  asr: null,
  status: 'idle',
  segments: [],
  partial: null,
  startedAt: null,
  offset: 0,
  runStartedAt: null,
  level: 0,
  micId: getPreferredMic(),
  mics: { systemDefault: '', mics: [], labelsAvailable: false },
  speakersOn: readFlag(SPEAKERS_KEY, false),
  speakers: [],
  hasMyVoice: !!loadMyVoiceprint(),
  keepRecording: readKeepRecording(),
  audio: null,
  source: 'mic',
  fileJob: null,
  restored: false,
  heardSignal: false,
  deviceLabel: '',
  silent: false,
  error: null,
  savedTo: null,
  savedCount: 0,
  namesRev: 0,
  savedNamesRev: 0,
  recordingOn: false,
  minutes: { running: false, progress: '', error: null },

  refresh: async () => { try { set({ asr: await window.api.asr.getState() }); } catch { /* 主进程还没准备好 */ } },
  refreshMics: async () => set({ mics: await listMics() }),
  setMic: (id) => { setPreferredMic(id); set({ micId: id }); },
  setSpeakersOn: (on) => { try { localStorage.setItem(SPEAKERS_KEY, on ? '1' : '0'); } catch { /* 只管这一次 */ } set({ speakersOn: on }); },
  renameSpeaker: (id, name) => {
    const before = get().namesRev;
    set((s) => {
    const r = renameSpeaker(s.speakers, id, name);
    if (r.speakers === s.speakers) return {};
    // 合并了的话，原来挂在他名下的句子改挂到合并后的那个人
    const segments = r.mergedInto ? s.segments.map((seg) => (seg.speaker === id ? { ...seg, speaker: r.mergedInto } : seg)) : s.segments;
    return { speakers: r.speakers, segments, namesRev: s.namesRev + 1 };
    });
    // 名字改了：笔记里那份跟着更新，不用人再点一次
    if (get().namesRev !== before && get().status === 'idle' && get().savedTo && get().savedCount > 0) void get().commit({ quiet: true });
  },
  rememberAsMe: (id) => {
    const speaker = get().speakers.find((p) => p.id === id);
    if (!speaker) return;
    saveMyVoiceprint(speaker);
    set({ hasMyVoice: true });
    if (id !== ME_ID) get().renameSpeaker(id, '我');
    useAppStore.getState().notify('记住了：以后的转写里，你说的话会自动标成「我」');
  },
  forgetMe: () => { forgetMyVoiceprint(); set({ hasMyVoice: false }); },
  setKeepRecording: (keep) => { try { localStorage.setItem(KEEP_KEY, keep ? '1' : '0'); } catch { /* 存不了就只管这一次 */ } set({ keepRecording: keep }); },
  install: () => { void window.api.asr.install(); },
  cancelInstall: () => { void window.api.asr.cancelInstall(); },

  elapsed: () => { const { offset, runStartedAt } = get(); return offset + (runStartedAt ? (Date.now() - runStartedAt) / 1000 : 0); },

  start: async (into = 'new') => {
    if (get().status !== 'idle') return;
    const fresh = get().segments.length === 0;
    set({ status: 'starting', error: null });
    try {
      const wantSpeakers = get().speakersOn && !!get().asr?.speaker?.installed;
      if (get().segments.length === 0) set({ speakers: wantSpeakers ? initialSpeakers() : [] });
      let lastSignalAt = Date.now();
      const onChunk = (samples: Float32Array, level: number) => {
        window.api.asr.sendPcm(samples);
        if (Math.abs(level - get().level) > 0.04) set({ level });
        // 再安静的房间也有底噪；电平贴着 0 超过几秒，说明根本没有声音进来
        if (level > MIC_SILENCE_LEVEL) { lastSignalAt = Date.now(); if (!get().heardSignal) set({ heardSignal: true }); }
        const silent = Date.now() - lastSignalAt > SILENCE_MS;
        if (silent !== get().silent) set({ silent });
      };
      if (get().micId === SYSTEM_AUDIO_ID) {
        // 系统声音：先把接收端摆好，再让主进程起捕获工具（识别进程就绪 + 屏幕录制权限）
        capture = await startSystemCapture(onChunk);
        await window.api.asr.start({ speakers: wantSpeakers, source: 'system' });
      } else {
        await window.api.asr.start({ speakers: wantSpeakers });   // 识别进程就绪（含 macOS 的麦克风授权）
        capture = await startMicCapture(onChunk, get().micId);
      }
      // 留不留录音在一场开始时定：中途变卦的话录音和时间戳就对不上了
      if (get().segments.length === 0 && !recorder && get().keepRecording && SessionRecorder.supported()) recorder = new SessionRecorder();
      recorder?.attach(capture.stream);
      set({ recordingOn: !!recorder && !recorder.failed });
      if (capture.fellBack) useAppStore.getState().notify(`选定的麦克风没连上，这次改用${capture.label ? `「${capture.label}」` : '系统默认的麦克风'}`);
      void get().refreshMics();   // 授权之后才读得到设备名字
      if (get().segments.length === 0) void window.api.asr.clearDraft?.().catch(() => {});   // 新的一场：上一场留下的录音草稿不要了
      // 麦克风和识别都就绪了再建笔记：授权没过的话，不留下一篇空的会议记录
      const startedAt = fresh ? Date.now() : get().startedAt ?? Date.now();
      const boundTo = fresh ? await bindNote(into, new Date(startedAt)) : get().savedTo;
      set({ status: 'recording', source: 'mic', deviceLabel: capture?.label ?? '', silent: false, runStartedAt: Date.now(), startedAt, savedTo: boundTo, restored: false });
    } catch (err) {
      capture?.stop(); capture = null;
      await window.api.asr.stop().catch(() => {});
      set({ status: 'idle', runStartedAt: null, error: cleanError(err) });
    }
  },

  stop: async () => {
    if (get().status !== 'recording') return;
    // 转写录音文件时，「停止」= 不再往下转：喂数据的循环自己收尾（把已经转出来的写进笔记）
    if (activeFileJob) { activeFileJob.cancelled = true; activeFileJob.release?.(); return; }
    await stopCapture();
    // 停下来就写进这一场的笔记：不用人再点「放进笔记」，也就不会忘
    await get().commit();
  },

  clear: () => {
    if (get().status !== 'idle') return;
    recorder?.dispose(); recorder = null;
    const old = get().audio;
    if (old?.blob) URL.revokeObjectURL(old.url);
    void window.api.asr.clearDraft?.().catch(() => {});
    set({ audio: null, source: 'mic', fileJob: null, restored: false, savedCount: 0, recordingOn: false, speakers: [], namesRev: 0, savedNamesRev: 0, segments: [], partial: null, startedAt: null, offset: 0, error: null, savedTo: null, minutes: { running: false, progress: '', error: null } });
  },

  insertIntoActiveNote: async () => {
    const app = useAppStore.getState();
    if (!app.activeTabId || get().segments.length === 0) return false;
    set({ savedTo: app.activeTabId });
    return get().commit();
  },

  transcribeFile: async (filePath) => {
    if (get().status !== 'idle') return;
    const app = useAppStore.getState();
    if (hasUnsavedTranscript(get())) { app.notify('上一场转写还没放进笔记，先处理它'); return; }
    let path = filePath;
    if (!path) {
      const picked = await window.api.dialog.open({ title: '选一段录音', properties: ['openFile'], filters: [{ name: '录音', extensions: AUDIO_FILE_EXTS }] });
      path = picked?.[0];
    }
    if (!path) return;
    if (!isAudioFile(path)) { set({ error: '这不是能转写的录音文件（支持 m4a、mp3、wav、flac、ogg、webm）' }); return; }

    get().clear();
    const name = (path.split(/[\\/]/).pop() || path);
    const url = toAssetUrl(path);
    const job = { cancelled: false, release: null as (() => void) | null };
    activeFileJob = job;
    set({ status: 'starting', error: null, source: 'file', fileJob: { name, progress: 0, phase: 'reading' } });
    try {
      const duration = await probeDuration(url);
      if (duration > MAX_FILE_MINUTES * 60) throw new Error(`这段录音有 ${Math.round(duration / 60)} 分钟，目前一次最多转写 ${MAX_FILE_MINUTES} 分钟，长的请先切成几段`);
      const wantSpeakers = get().speakersOn && !!get().asr?.speaker?.installed;
      set({ speakers: wantSpeakers ? initialSpeakers() : [] });
      // 识别进程和解码一起准备
      const [samples] = await Promise.all([decodeToMono16k(url), window.api.asr.start({ speakers: wantSpeakers, source: 'file' })]);
      const startedAt = Date.now();
      const boundTo = await bindNote('new', new Date(startedAt), `录音转写 ${audioBaseName(path)}`);
      set({ status: 'recording', runStartedAt: null, startedAt, savedTo: boundTo, restored: false, fileJob: { name, progress: 0, phase: 'transcribing' } });

      // 一块一块喂，等识别进程处理完这一块（回 fed）再给下一块：识别比说话快几十倍，但也不能把整段音频一口气堆进消息队列
      const CHUNK = FILE_SAMPLE_RATE * 20;
      for (let at = 0; at < samples.length && !job.cancelled; at += CHUNK) {
        const fed = new Promise<void>((resolve) => { job.release = resolve; });
        window.api.asr.sendPcm(samples.slice(at, at + CHUNK));
        await fed;
        set({ fileJob: { name, progress: Math.min(1, (at + CHUNK) / samples.length), phase: 'transcribing' } });
      }
      job.release = null;
      const processedSec = job.cancelled ? (get().fileJob?.progress ?? 0) * duration : duration;
      await stopCapture();                                   // 让识别进程把最后一句吐出来
      set({ offset: processedSec, fileJob: null, audio: { blob: null, url, duration, filePath: path } });
      if (get().segments.length === 0) { app.notify(job.cancelled ? '已取消' : '这段录音里没有识别出说话的内容'); return; }
      await get().commit();
    } catch (err) {
      await window.api.asr.stop().catch(() => {});
      set({ status: 'idle', runStartedAt: null, fileJob: null, error: cleanError(err) });
    } finally {
      if (activeFileJob === job) activeFileJob = null;
    }
  },

  commit: async ({ quiet = false } = {}) => {
    const { segments, startedAt, savedTo } = get();
    if (!savedTo || segments.length === 0) return false;
    const app = useAppStore.getState();
    const tab = app.tabs.find((t) => t.id === savedTo);
    // 还没落盘的未命名文档关掉就没了，写不回去
    if (!tab && savedTo.startsWith('new-')) return false;
    const at = new Date(startedAt ?? Date.now());
    // 录音跟着笔记走：存到笔记旁边的 assets/，转写块里带一个播放器
    const audioSrc = await saveRecording(noteDirOf(savedTo, app.getNewNoteDir() || ''), at);
    const block = buildTranscriptBlock(segments, at, get().elapsed(), audioSrc, speakerNames(get().speakers));
    if (tab) {
      // 用户多半正在这篇里记要点：editTabContent 会先把他没写回的字刷进来，再追加，光标也留在原地
      if (!app.editTabContent(tab.id, (current) => upsertBlock(current, block, at))) return false;
    } else {
      // 笔记没开着（用户关掉了）：直接改磁盘上的文件，不把它重新打开
      const file = await window.api.fs.readFile(savedTo);
      if (!file.success) return false;
      const res = await window.api.fs.writeFile(savedTo, upsertBlock(file.content || '', block, at));
      if (!res.success) return false;
    }
    set({ savedCount: segments.length, savedNamesRev: get().namesRev, restored: false });
    if (!quiet) app.notify(`转写已写进「${noteName(savedTo)}」`);
    return true;
  },

  endBecauseNoteClosed: async () => {
    const path = get().savedTo;
    if (!path || ending) return;
    ending = true;
    try {
      if (activeFileJob) {
        // 正在转写录音文件：叫喂数据的循环停下来，等它自己收好尾（状态回到 idle）
        activeFileJob.cancelled = true; activeFileJob.release?.();
        await new Promise<void>((resolve) => { if (get().status === 'idle') return resolve(); const off = useTranscribeStore.subscribe((st) => { if (st.status === 'idle') { off(); resolve(); } }); });
      } else if (get().status === 'recording') {
        await stopCapture();
      }
      const app = useAppStore.getState();
      if (get().segments.length === 0) { get().clear(); app.notify('笔记关了，转写也停了'); return; }
      const saved = !hasUnsavedTranscript(get()) || (await get().commit({ quiet: true }));
      if (saved) {
        get().clear();
        app.notify(`笔记关了，转写也停了：全文${get().keepRecording ? '和录音' : ''}已经写进「${noteName(path)}」`);
      } else {
        // 写不回去（没存过盘的未命名文档、文件被删了）：内容留在面板里，让人另找个地方放
        set({ savedTo: null });
        app.notify('笔记关了，转写也停了；这一场还没存上，在转写面板里选个地方放');
        app.openTranscribe();
      }
    } finally {
      ending = false;
    }
  },

  newSession: async () => {
    if (get().status !== 'idle') return;
    get().clear();
    await get().start('new');
  },

  markMoment: () => {
    if (get().status !== 'recording') return false;
    const app = useAppStore.getState();
    const bound = get().savedTo;
    // 时间点要打在这一场的笔记里：点它的时候，靠同一篇里的录音来跳
    if (bound && app.activeTabId !== bound && app.tabs.some((t) => t.id === bound)) {
      void app.setActiveTab(bound);
      app.notify('已切到这一场的笔记，把光标放到要记的地方再打点');
      return false;
    }
    return app.editorActions?.insertText(`[${formatClock(get().elapsed())}] `) ?? false;
  },

  saveAsNewNote: async () => {
    const { segments, startedAt } = get();
    if (segments.length === 0) return null;
    const app = useAppStore.getState();
    const at = new Date(startedAt ?? Date.now());
    const title = meetingNoteTitle(at);
    const dir = app.getNewNoteDir();
    if (!dir) { set({ error: '还没有打开笔记库，不知道存到哪里' }); return null; }
    const sep = dir.includes('\\') ? '\\' : '/';
    let filePath = `${dir}${sep}${title}.md`;
    for (let i = 2; await window.api.fs.exists(filePath); i++) filePath = `${dir}${sep}${title} ${i}.md`;
    const audioSrc = await saveRecording(dir, at);
    const res = await window.api.fs.writeFile(filePath, newMeetingNote(title, at, buildTranscriptBlock(segments, at, get().elapsed(), audioSrc, speakerNames(get().speakers))));
    if (!res.success) { set({ error: res.error || '保存失败' }); return null; }
    await app.refreshWorkspace();
    await app.openFileByPath(filePath);
    set({ savedTo: filePath, savedCount: segments.length, savedNamesRev: get().namesRev, restored: false });
    return filePath;
  },

  generateMinutes: async () => {
    const { segments, minutes } = get();
    if (minutes.running || segments.length === 0) return;
    const app = useAppStore.getState();
    // 纪要写进存了转写的那篇；还没存过就写进当前打开的这篇
    const target = app.tabs.find((t) => t.id === get().savedTo) ?? app.tabs.find((t) => t.id === app.activeTabId);
    if (!target) { set({ minutes: { running: false, progress: '', error: '先把转写存成笔记（或打开一篇笔记），纪要要有地方放' } }); return; }

    const ask = async (messages: { role: string; content: string }[], tag: string) =>
      stripThinking(await window.api.ai.chat(messages, () => {}, `minutes-${Date.now()}-${tag}`, 1500, MINUTES_TEMPERATURE));

    set({ minutes: { running: true, progress: '正在整理纪要…', error: null } });
    try {
      const userNotes = stripTranscriptBlocks(target.content);
      const parts = splitForSummary(transcriptText(segments, speakerNames(get().speakers)));
      let result: string;
      if (parts.length <= 1) {
        result = await ask(buildMinutesMessages(userNotes, parts[0] ?? ''), 'all');
      } else {
        // 长会议：逐段提炼再合并，每一步都告诉用户进行到哪了
        const summaries: string[] = [];
        for (let i = 0; i < parts.length; i++) {
          set({ minutes: { running: true, progress: `正在提炼第 ${i + 1} / ${parts.length} 段…`, error: null } });
          summaries.push(await ask(buildPartMessages(parts[i], i, parts.length), `p${i}`));
        }
        set({ minutes: { running: true, progress: '正在合并成一份纪要…', error: null } });
        result = await ask(buildMergeMessages(userNotes, summaries), 'merge');
      }
      result = cleanMinutes(result);
      if (!result) throw new Error('模型没有返回内容');
      // 写作助手正往正文里流式写字时先等它写完，两边同时改同一篇会互相覆盖
      while (useAppStore.getState().aiStatus.generating) await new Promise((r) => setTimeout(r, 300));
      // 生成期间用户可能又改了笔记：基于最新内容插入，别把他刚写的覆盖掉
      if (!useAppStore.getState().editTabContent(target.id, (current) => insertMinutes(current, result))) throw new Error('那篇笔记已经关掉了，纪要没地方放');
      useAppStore.getState().notify(`纪要已写进「${target.title}」`);
      set({ minutes: { running: false, progress: '', error: null } });
    } catch (err) {
      const message = cleanError(err);
      set({ minutes: { running: false, progress: '', error: message === 'REQUEST_ABORTED' ? null : message } });
    }
  },
}));

/** 有没有还没放进笔记的转写：放进去之后又录了新的，也算 */
export const hasUnsavedTranscript = (s: Pick<TranscribeState, 'segments' | 'savedCount'> & Partial<Pick<TranscribeState, 'namesRev' | 'savedNamesRev'>>) =>
  s.segments.length > 0 && (s.segments.length !== s.savedCount || (s.namesRev ?? 0) !== (s.savedNamesRev ?? 0));

// ── 正在转写时关它的笔记：先问一句 ───────────────────────────────────────────
// 关掉就意味着这一场结束（见下面），不能不声不响地发生。只在「正在录」时问：已经停下并存好的，关了也没有损失
if (typeof window !== 'undefined') {
  useAppStore.getState().registerCloseGuard((tab) => {
    const s = useTranscribeStore.getState();
    if (tab.id !== s.savedTo || (s.status !== 'recording' && s.status !== 'starting')) return null;
    return {
      title: '正在转写',
      message: `「${tab.title.replace(/\.md$/i, '')}」是这一场转写的笔记，关掉它，转写就结束了。已经转写出来的全文${s.recordingOn ? '和录音' : ''}会写进这篇笔记。`,
      confirmLabel: '结束转写并关闭',
    };
  });
}

// ── 这一场的笔记关掉了，转写跟着结束 ─────────────────────────────────────────
// 笔记是这一场的「家」：家没了还在录，全文和要点就对不上号了。改名 / 另存不算关 —— 同一个位置换了个路径，跟过去就行
if (typeof window !== 'undefined') {
  useAppStore.subscribe((state, prev) => {
    if (state.tabs === prev.tabs) return;
    const bound = useTranscribeStore.getState().savedTo;
    if (!bound || state.tabs.some((t) => t.id === bound)) return;
    const index = prev.tabs.findIndex((t) => t.id === bound);
    if (index < 0) return;                      // 本来就没开着（上次没存、这次找回来的那种）
    const moved = state.tabs.length === prev.tabs.length ? state.tabs[index] : null;
    if (moved && !prev.tabs.some((t) => t.id === moved.id)) { useTranscribeStore.setState({ savedTo: moved.id }); return; }
    void useTranscribeStore.getState().endBecauseNoteClosed();
  });
}

// ── 没放进笔记的转写先替用户留着 ─────────────────────────────────────────────
// 文字存 localStorage（每定稿一句就存，崩溃也丢不了几个字），录音每次停下来时由主进程落盘。
// 放进笔记之后草稿就删掉：下次启动不该再冒出一份已经保存过的转写
const DRAFT_KEY = 'iml.transcribe.draft';
interface Draft { segments: TranscriptSegment[]; startedAt: number | null; offset: number; savedTo: string | null; savedCount: number; audioDuration: number; audioPath?: string; speakers?: Speaker[]; namesRev?: number; savedNamesRev?: number }

function persistDraft(s: TranscribeState) {
  try {
    if (!hasUnsavedTranscript(s)) { localStorage.removeItem(DRAFT_KEY); return; }
    // 正在录的这一段还没计入 offset：按已经过去的时间算上，找回来之后「继续」时间戳才接得上
    const draft: Draft = { segments: s.segments, startedAt: s.startedAt, offset: s.elapsed(), savedTo: s.savedTo, savedCount: s.savedCount, audioDuration: s.audio?.duration ?? 0, audioPath: s.audio?.filePath, speakers: s.speakers, namesRev: s.namesRev, savedNamesRev: s.savedNamesRev };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* 存不下（极长的会议撑满了配额）就算了，界面上的提醒还在 */ }
}

async function restoreDraft() {
  let draft: Draft | null = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch { /* 坏了就当没有 */ }
  if (!draft || !Array.isArray(draft.segments) || draft.segments.length === 0) {
    void window.api.asr.clearDraft?.().catch(() => {});   // 没有文字草稿，留着的录音也没用了
    return;
  }
  useTranscribeStore.setState({
    segments: draft.segments, startedAt: draft.startedAt, offset: Math.max(draft.offset || 0, draft.segments[draft.segments.length - 1].start + 1),
    savedTo: draft.savedTo ?? null, savedCount: draft.savedCount || 0, restored: true,
    speakers: Array.isArray(draft.speakers) ? draft.speakers : [], namesRev: draft.namesRev || 0, savedNamesRev: draft.savedNamesRev || 0,
  });
  if (draft.audioPath && draft.audioDuration > 0) {   // 转写的是一段录音文件：录音就是那个文件
    useTranscribeStore.setState({ source: 'file', audio: { blob: null, url: toAssetUrl(draft.audioPath), duration: draft.audioDuration, filePath: draft.audioPath } });
    return;
  }
  const file = await window.api.asr.getDraftAudio?.().catch(() => null);
  if (file && draft.audioDuration > 0 && useTranscribeStore.getState().restored) {
    useTranscribeStore.setState({ audio: { blob: null, url: toAssetUrl(file.path), duration: draft.audioDuration } });
  }
}

if (typeof window !== 'undefined' && window.api?.asr) {
  void restoreDraft().finally(() => {
    let last = '';
    useTranscribeStore.subscribe((s) => {
      const key = `${s.segments.length}|${s.savedCount}|${s.savedTo}|${s.offset}|${s.audio?.duration ?? 0}|${s.namesRev}|${s.savedNamesRev}`;
      if (key !== last) { last = key; persistDraft(s); }
    });
  });
}

// 正在转写时退出 / 关窗口，主进程要拦一下：停下来的部分下次打开还在，正在录的这一段会丢
if (typeof window !== 'undefined' && window.api?.asr?.setUnsaved) {
  let reported = '';
  useTranscribeStore.subscribe((s) => {
    const state = s.status === 'recording' ? { recording: s.recordingOn } : null;
    const key = JSON.stringify(state);
    if (key !== reported) { reported = key; window.api.asr.setUnsaved(state); }
  });
}

// 插拔耳机 / 麦克风时更新设备列表
if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => { void useTranscribeStore.getState().refreshMics(); });
}

// 主进程推来的状态与识别结果。模块加载时订阅一次：录音期间面板可能根本没挂载
if (typeof window !== 'undefined' && window.api?.asr) {
  window.api.asr.onState((asr) => useTranscribeStore.setState({ asr }));
  window.api.asr.onEvent((event: AsrEvent) => {
    const s = useTranscribeStore.getState();
    if (event.type === 'partial') useTranscribeStore.setState({ partial: { start: s.offset + event.start, text: event.text } });
    else if (event.type === 'final') {
      // 带着声纹来的：看看是谁说的（新面孔就加进说话人列表）
      const r = assignSpeaker(s.speakers, event.embedding, event.duration);
      const segment: TranscriptSegment = { start: s.offset + event.start, text: event.text, ...(event.embedding ? { speaker: r.speakerId } : {}) };
      useTranscribeStore.setState({ segments: [...s.segments, segment], speakers: r.speakers, partial: null });
    }
    else if (event.type === 'fed') activeFileJob?.release?.();
    else if (event.type === 'error') {
      activeFileJob?.release?.();
      if (activeFileJob) activeFileJob.cancelled = true;
      void collectRecording();
      capture?.stop(); capture = null;
      useTranscribeStore.setState({ status: 'idle', runStartedAt: null, level: 0, silent: false, error: event.message });
    }
  });
}
