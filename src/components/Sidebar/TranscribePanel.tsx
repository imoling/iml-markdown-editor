import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Square, FileDown, FilePlus, ListChecks, Copy, Check, Eraser, Download, SlidersHorizontal, ShieldCheck, ChevronRight, Play, Pause, TriangleAlert, CircleCheck, Flag, FileText, Plus, FileAudio } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useTranscribeStore, hasUnsavedTranscript } from '../../stores/transcribeStore';
import { useAiReadiness } from '../../utils/aiReadiness';
import { currentMicLabel, micPermission } from '../../utils/micDevices';
import { formatClock, transcriptText } from '../../utils/transcript';
import { LevelBars } from '../AI/MicLevel';
import { ME_ID, type Speaker } from '../../utils/speakers';
import { PanelIntro } from './PanelIntro';
import { AI_DISABLED } from '../../utils/uiText';

const formatSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);

const privacyPoint = (keep: boolean) => (keep ? '识别在这台电脑上完成，录音只存在本机' : '识别在这台电脑上完成，音频不保存');
const introPoints = (keep: boolean) => [
  { icon: <FileText size={13} />, text: '点开始就新建一篇会议记录，停下来时全文和录音自动写进去' },
  { icon: <ShieldCheck size={13} />, text: privacyPoint(keep) },
  { icon: <ListChecks size={13} />, text: '结束后结合你记的要点，一键整理成纪要' },
];

/**
 * 回听：面板里的播放器。录音的时间轴和转写时间戳是同一条，所以「跳到第 N 秒」就是「从那句话开始听」。
 * 返回当前播到哪了，让正在播的那一句亮起来
 */
function usePlayer(url: string | null) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!url) { ref.current = null; setPlaying(false); setCurrent(0); return; }
    const audio = new Audio(url);
    audio.preload = 'auto';
    const onTime = () => setCurrent(audio.currentTime);
    // 同一时间只响一处：这里开播就停掉笔记里的播放器，反过来笔记里开播（冒泡不到这，走自定义事件）就停这里
    const onPlay = () => { setPlaying(true); document.querySelectorAll('audio').forEach((other) => other.pause()); };
    const onStop = () => setPlaying(false);
    const onOtherPlay = () => audio.pause();
    window.addEventListener('iml:audio-play', onOtherPlay);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('seeked', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onStop);
    audio.addEventListener('ended', onStop);
    ref.current = audio;
    return () => { window.removeEventListener('iml:audio-play', onOtherPlay); audio.pause(); audio.src = ''; ref.current = null; setPlaying(false); setCurrent(0); };
  }, [url]);

  const toggle = useCallback(() => { const a = ref.current; if (a) { if (a.paused) void a.play().catch(() => {}); else a.pause(); } }, []);
  const seek = useCallback((seconds: number, play = false) => {
    const a = ref.current;
    if (!a) return;
    a.currentTime = Math.max(0, seconds);
    setCurrent(a.currentTime);
    if (play) void a.play().catch(() => {});
  }, []);
  const pause = useCallback(() => ref.current?.pause(), []);
  return { playing, current, toggle, seek, pause };
}

/**
 * 说话人的小标签：点一下改名。改成和别人一样的名字就是把两个人合并（自动区分宁可分多、不可分少，分多了在这里合回去）；
 * 「这是我」会记住声纹，以后每场自动认出来
 */
const SpeakerChip: React.FC<{ speaker: Speaker; index: number; onRename: (name: string) => void; onMe: () => void }> = ({ speaker, index, onRename, onMe }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(speaker.name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) { setValue(speaker.name); inputRef.current?.select(); } }, [editing, speaker.name]);
  const commit = () => { setEditing(false); if (value.trim() && value.trim() !== speaker.name) onRename(value); };
  const color = `var(--spk-${index % 6})`;

  if (editing) {
    return (
      <span className="spk-edit" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef} className="spk-edit__input" value={value} maxLength={20} placeholder="名字"
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;   // 输入法组字时的回车是选词
            if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setEditing(false);
          }}
        />
        {speaker.id !== ME_ID && <button className="btn-link spk-edit__me" onMouseDown={(e) => { e.preventDefault(); setEditing(false); onMe(); }} title="记住这个声音，以后的转写里自动标成「我」">这是我</button>}
      </span>
    );
  }
  return (
    <button className="spk-chip" style={{ '--spk': color } as React.CSSProperties} title="点一下改名；改成已有的名字就是合并成同一个人" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>
      <span className="spk-chip__dot" />{speaker.name}
    </button>
  );
};

/** 录音期间每秒走一次的计时 */
function useElapsed(running: boolean): number {
  const elapsed = useTranscribeStore((s) => s.elapsed);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  return elapsed();
}

/**
 * 实时转写：开会、听课时点开始，你照常在正文里记要点，全文它来记。
 * 识别在本机完成，声音不上传；默认留一份录音用于回听（可关）。停下来之后可以回听、把全文折叠着放进笔记，再让模型结合你记的要点整理出纪要。
 */
export const TranscribePanel: React.FC = () => {
  const aiEnabled = useAppStore((s) => s.aiEnabled);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const openDialog = useAppStore((s) => s.openDialog);
  const t = useTranscribeStore();
  const readiness = useAiReadiness(aiEnabled);
  const [copied, setCopied] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const recording = t.status === 'recording';
  const elapsed = useElapsed(recording);
  const getLevel = useCallback(() => useTranscribeStore.getState().level, []);
  const player = usePlayer(t.status === 'idle' ? t.audio?.url ?? null : null);
  const POINTS = introPoints(t.keepRecording);
  // 正在播的是哪一句：最后一个「开始时间 ≤ 当前进度」的
  const playingIndex = t.audio && (player.playing || player.current > 0)
    ? t.segments.reduce((found, seg, i) => (seg.start <= player.current + 0.05 ? i : found), -1)
    : -1;
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => { if (player.playing && playingIndex >= 0) lineRefs.current[playingIndex]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [playingIndex, player.playing]);

  useEffect(() => { void t.refresh(); void t.refreshMics(); }, []);
  // 新的一句出来就滚到底
  // 停下来时底部多出一排按钮、列表变矮，也要再滚一次，不然最后一句被挡住
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [t.segments.length, t.partial?.text, t.status]);

  // 「清空」会丢掉还没放进笔记的内容：第一下只是变成确认，几秒内再点一下才真的清
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => { if (!confirmClear) return; const timer = setTimeout(() => setConfirmClear(false), 4000); return () => clearTimeout(timer); }, [confirmClear]);

  const asr = t.asr;
  const hasText = t.segments.length > 0;
  const unsaved = hasUnsavedTranscript(t);
  const what = t.recordingOn || t.audio ? '转写和录音' : '转写';
  const savedTitle = useAppStore((s) => s.tabs.find((tab) => tab.id === t.savedTo)?.title) ?? t.savedTo?.split(/[\\/]/).pop();
  // 这一场绑定的笔记：转写全文、录音、纪要都写进它
  const boundTitle = savedTitle?.replace(/\.md$/i, '');
  const openBound = () => { if (t.savedTo) void useAppStore.getState().openFileByPath(t.savedTo); };
  const onClear = () => { if (unsaved && !confirmClear) { setConfirmClear(true); return; } setConfirmClear(false); t.clear(); };
  const busy = t.status === 'starting' || t.status === 'stopping';
  const live = recording || t.status === 'stopping';
  const openConfig = () => openDialog('transcribe-config');

  const head = (
    <div className="ask-panel__head">
      <span className="sidebar-section-title">{t.source === 'file' && (t.fileJob || t.segments.length > 0) ? '录音转写' : '实时转写'}</span>
      <span className="row gap-6">
        {hasText && t.status === 'idle' && (
          <button className={`btn-link ${confirmClear ? 'btn-link--danger' : ''}`} onClick={onClear} title={unsaved ? `还没放进笔记，清空后${what}就没了` : '清空这次的转写'}>
            <Eraser size={12} /> {confirmClear ? '再点一次确认清空' : '清空'}
          </button>
        )}
        {aiEnabled && asr?.supported && <button className="icon-btn icon-btn--sm" onClick={openConfig} title="语音模型与收音设备"><SlidersHorizontal size={13} /></button>}
      </span>
    </div>
  );

  if (!aiEnabled) {
    return <div className="ask-panel">{head}<div className="tree-empty tree-empty--root">{AI_DISABLED}<button className="btn-link" onClick={() => openDialog('settings')}>去打开</button></div></div>;
  }
  if (!asr) return <div className="ask-panel">{head}</div>;
  if (!asr.supported) {
    return <div className="ask-panel">{head}<div className="tree-empty tree-empty--root">这个平台暂时还不支持实时转写</div></div>;
  }

  // ── 还没下载语音模型 ──
  if (!asr.installed) {
    const dl = asr.install;
    const pct = dl?.active && dl.total ? Math.round((dl.received / dl.total) * 100) : 0;
    return (
      <div className="ask-panel">
        {head}
        <div className="ask-panel__list">
          <PanelIntro icon={<Mic size={20} />} title="你记要点，全文它来记" lead="开会、听课时点开始，边听边出字。" points={POINTS}>
            <div className="panel-intro__action">
              {dl?.active ? (
                <>
                  <div className="lm-progress"><div className="lm-progress__bar" style={{ width: `${pct}%` }} /></div>
                  <div className="panel-intro__row">
                    <span>{dl.step} {pct}% · {formatSize(dl.received)} / {formatSize(dl.total)}</span>
                    <button className="btn-link" onClick={t.cancelInstall}>取消</button>
                  </div>
                </>
              ) : (
                <>
                  <button className="btn btn-primary btn-xs panel-intro__cta" onClick={t.install}><Download size={13} /> {dl?.error ? '重试下载' : `下载语音模型 · ${formatSize(asr.downloadBytes)}`}</button>
                  <div className="panel-intro__note">只下载一次</div>
                </>
              )}
              {dl?.error && <div className="ask-status ask-status--error">下载失败：{dl.error}</div>}
            </div>
          </PanelIntro>
        </div>
      </div>
    );
  }

  const denied = micPermission(asr.micAccess, t.heardSignal) === 'blocked';
  const micName = live && t.deviceLabel ? t.deviceLabel : currentMicLabel(t.micId, t.mics);
  const device = (
    <button className={`rec-device ${denied || t.silent ? 'rec-device--warn' : ''}`} onClick={openConfig} title="换麦克风、试音">
      {denied || t.silent ? <MicOff size={11} /> : <Mic size={11} />}
      <span className="truncate">{denied ? '麦克风权限被关掉了' : t.silent ? '没有声音进来，检查一下麦克风' : micName || '麦克风'}</span>
      <ChevronRight size={11} />
    </button>
  );

  return (
    <div className="ask-panel">
      {head}

      {(live || t.status === 'starting') && t.fileJob ? (
        // ── 正在转写一段录音文件：进度，而不是计时和音量 ──
        <div className="rec-card rec-card--file">
          <div className="rec-card__row">
            <span className="rec-file__title"><FileAudio size={13} /> {t.fileJob.phase === 'reading' ? '读取录音…' : '转写录音中'}</span>
            <span className="rec-clock">{t.fileJob.phase === 'reading' ? '' : `${Math.round(t.fileJob.progress * 100)}%`}</span>
            <button className="rec-stop" onClick={() => void t.stop()} disabled={t.status !== 'recording'} title="停下来，已经转出来的会写进笔记"><Square size={10} /> 取消</button>
          </div>
          <div className="lm-progress"><div className={`lm-progress__bar ${t.fileJob.phase === 'reading' ? 'lm-progress__bar--indeterminate' : ''}`} style={{ width: t.fileJob.phase === 'reading' ? '100%' : `${Math.round(t.fileJob.progress * 100)}%` }} /></div>
          <div className="rec-file__name truncate" title={t.fileJob.name}>{t.fileJob.name}</div>
        </div>
      ) : live ? (
        // ── 正在转写：状态、计时、音量、在用哪个麦克风 ──
        <div className="rec-card rec-card--live">
          <div className="rec-card__row">
            <span className="rec-live"><span className="rec-live__dot" /> 转写中</span>
            <span className="rec-clock">{formatClock(elapsed)}</span>
            <button className="rec-stop" onClick={() => void t.stop()} disabled={busy}><Square size={10} /> {t.status === 'stopping' ? '收尾中…' : '停止'}</button>
          </div>
          <LevelBars getLevel={getLevel} running={recording} bars={36} />
          <div className="rec-card__row rec-card__row--foot">
            {device}
            <button className="rec-mark" onClick={() => t.markMoment()} disabled={!recording} title="在光标处插入时间戳（⌘⇧L），点它录音就跳到这一刻"><Flag size={11} /> 打点</button>
          </div>
        </div>
      ) : hasText ? (
        // ── 停下来了：可以接着录 ──
        <div className="rec-card rec-card--paused">
          <div className="rec-card__row">
            <span className="rec-paused">{t.source === 'file' ? '录音转写' : '已停止'} · {t.segments.length} 句</span>
            <span className="rec-clock rec-clock--muted">{formatClock(elapsed)}</span>
            {/* 转写的是一段录音文件：没有「接着录」这回事 */}
            {t.source !== 'file' && <button className="rec-resume" onClick={() => { player.pause(); void t.start(); }} disabled={busy}><Mic size={11} /> {t.status === 'starting' ? '准备中…' : '继续'}</button>}
          </div>
          {t.audio && (
            <div className="rec-player">
              <button className="rec-player__btn" onClick={player.toggle} title={player.playing ? '暂停' : '回听'}>{player.playing ? <Pause size={12} /> : <Play size={12} />}</button>
              <input
                className="rec-player__bar" type="range" min={0} max={t.audio.duration} step={0.1} value={Math.min(player.current, t.audio.duration)}
                style={{ '--played': `${t.audio.duration ? Math.min(100, (player.current / t.audio.duration) * 100) : 0}%` } as React.CSSProperties}
                onChange={(e) => player.seek(Number(e.target.value))}
              />
              <span className="rec-player__time">{formatClock(player.current)}</span>
            </div>
          )}
        </div>
      ) : (
        // ── 还没开始：一个大按钮 ──
        <div className="rec-card rec-card--hero">
          <button className="rec-start" onClick={() => void t.start('new')} disabled={busy} title="新建一篇会议记录并开始转写"><Mic size={22} /></button>
          <div className="rec-start__label">{t.status === 'starting' ? '正在准备…' : '开始转写'}</div>
          {device}
          {!busy && (
            <div className="rec-start__alts">
              {activeTabId && <button className="btn-link" onClick={() => void t.start('current')} title="不新建会议记录，要点就记在现在打开的这篇里">记在当前笔记里</button>}
              <button className="btn-link" onClick={() => void t.transcribeFile()} title="选一个音频文件转成笔记，单个最长 90 分钟"><FileAudio size={12} /> 转写一段录音…</button>
            </div>
          )}
        </div>
      )}
      {t.error && <div className="ask-status ask-status--error">{t.error}</div>}
      {live && t.fileJob ? (
        <div className="transcribe-note"><FileText size={12} /><span>转完之后，全文和这段录音会写进「{boundTitle || '新笔记'}」；现在就可以在里面记要点。</span></div>
      ) : live && (
        t.savedTo
          ? <button className="transcribe-note transcribe-note--link" onClick={openBound} title="打开这篇笔记"><FileText size={12} /><span>要点记在「{boundTitle}」里；停下来时，全文{t.recordingOn ? '和录音' : ''}自动写进去。</span></button>
          : <div className="transcribe-note"><FileText size={12} /><span>还没打开笔记库，停下来之后再选放到哪</span></div>
      )}

      <div className="ask-panel__list" ref={listRef}>
        {!hasText && !t.partial ? (
          live
            ? <div className="rec-listening"><span className="ask-dots" /> 正在听，有人说话文字就会出现在这里</div>
            : <PanelIntro title="你记要点，全文它来记" lead="开会、听课时点开始，照常在正文里记你的要点。" points={POINTS} />
        ) : (
          <>
            {t.segments.map((s, i) => {
              // 有录音、且这句话在录音范围内（录音中途断过的话，后面的句子没有对应的声音）才能点
              const playable = !!t.audio && t.status === 'idle' && s.start < t.audio.duration;
              // 说话人只在换人的那一句上标出来，同一个人连着说就不重复
              const spkIndex = s.speaker ? t.speakers.findIndex((p) => p.id === s.speaker) : -1;
              const showSpeaker = spkIndex >= 0 && s.speaker !== t.segments[i - 1]?.speaker;
              return (
                <div
                  key={i} ref={(el) => { lineRefs.current[i] = el; }}
                  className={`transcribe-line ${playable ? 'transcribe-line--playable' : ''} ${i === playingIndex ? 'transcribe-line--playing' : ''}`}
                  title={playable ? '从这句话开始听' : undefined}
                  onClick={playable ? () => player.seek(s.start, true) : undefined}
                >
                  <span className="transcribe-line__time">{formatClock(s.start)}</span>
                  <span className="transcribe-line__body">
                    {showSpeaker && <SpeakerChip speaker={t.speakers[spkIndex]} index={spkIndex} onRename={(name) => t.renameSpeaker(s.speaker!, name)} onMe={() => t.rememberAsMe(s.speaker!)} />}
                    <span>{s.text}</span>
                  </span>
                </div>
              );
            })}
            {t.partial && <div className="transcribe-line transcribe-line--partial"><span className="transcribe-line__time">{formatClock(t.partial.start)}</span><span>{t.partial.text}<span className="transcribe-caret" /></span></div>}
          </>
        )}
      </div>

      {/* 停下来之后：全文已经自动写进这一场的笔记了，剩下的就是整理纪要、或者开始下一场。
          只有写不进去的时候（没有笔记库、笔记被删了、上次没存这次找回来的）才让人自己选放哪 */}
      {hasText && t.status === 'idle' && (
        <div className="transcribe-actions">
          {unsaved ? (
            <>
              <div className="transcribe-note transcribe-note--warn">
                <TriangleAlert size={12} />
                <span>{t.restored ? '上次没放进笔记的转写，替你留着' : '这一场还没写进笔记'}，点「清空」就没了。</span>
              </div>
              <div className="transcribe-actions__row transcribe-actions__row--two">
                <button className="transcribe-tool" disabled={!activeTabId} title={activeTabId ? '折叠着放到当前笔记的末尾' : '先打开一篇笔记'} onClick={() => void t.insertIntoActiveNote()}><FileDown size={13} /> 放进当前笔记</button>
                <button className="transcribe-tool" title="新建一篇会议记录，带上转写全文" onClick={() => void t.saveAsNewNote()}><FilePlus size={13} /> 存为新笔记</button>
              </div>
            </>
          ) : (
            <button className="transcribe-note transcribe-note--ok transcribe-note--link" onClick={openBound} title="打开这篇笔记">
              <CircleCheck size={12} /><span>已写进「{boundTitle || '笔记'}」{t.audio ? '，录音也存好了' : ''}</span>
            </button>
          )}
          <button
            className="btn btn-primary btn-xs transcribe-actions__main"
            disabled={t.minutes.running || !readiness.ready || unsaved}
            title={unsaved ? '先把转写放进一篇笔记，纪要要有地方放' : readiness.ready ? '结合你在笔记里记的要点，整理出议题、结论和待办' : `${readiness.message}，整理纪要要靠一个对话模型`}
            onClick={() => void t.generateMinutes()}
          >{t.minutes.running ? <><span className="ask-dots" /> {t.minutes.progress}</> : <><ListChecks size={13} /> 整理纪要</>}</button>
          {!readiness.ready && <button className="btn-link transcribe-actions__hint" onClick={() => openDialog('ai-setup')}>配置一个对话模型后可以整理纪要</button>}
          {t.minutes.error && <div className="ask-status ask-status--error">整理纪要失败：{t.minutes.error}</div>}
          <div className="transcribe-actions__row transcribe-actions__row--two">
            <button className="transcribe-tool" onClick={() => { void navigator.clipboard.writeText(transcriptText(t.segments, Object.fromEntries(t.speakers.map((p) => [p.id, p.name])))); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? <><Check size={13} /> 已复制</> : <><Copy size={13} /> 复制全文</>}
            </button>
            <button className="transcribe-tool" disabled={unsaved} title={unsaved ? '这一场还没写进笔记' : '这一场已经存好了：新建一篇会议记录，开始下一场'} onClick={() => void t.newSession()}><Plus size={13} /> 新的转写</button>
          </div>
        </div>
      )}
    </div>
  );
};
