import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Activity, AudioLines, Mic, Check, CircleAlert, Play, Square, Headphones, Users } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useTranscribeStore } from '../../stores/transcribeStore';
import { startMicCapture, MIC_SILENCE_LEVEL, type MicCapture } from '../../utils/micCapture';
import { currentMicLabel, resolveMic, micPermission, SYSTEM_AUDIO_ID } from '../../utils/micDevices';
import { startSystemCapture } from '../../utils/systemCapture';
import { formatClock } from '../../utils/transcript';
import { stripIpcError } from './ModelConfigModal';
import { LevelBars } from './MicLevel';
import { LiveSettingsNote } from './CopyNotes';

interface Props { onClose: () => void }

const formatSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);

/** 状态卡里的一行：这一项好了没有 */
const CheckRow: React.FC<{ ok: boolean; children: React.ReactNode }> = ({ ok, children }) => (
  <div className={`tc-check ${ok ? 'tc-check--ok' : ''}`}>
    {ok ? <Check size={13} /> : <CircleAlert size={13} />}
    <span>{children}</span>
  </div>
);

/**
 * 「实时转写」的设置弹窗（智能 → 实时转写…）：能不能用一眼看清，语音模型的下载与删除，收音设备的选择与试音。
 * 和其它几个 AI 配置一样，每个操作即时生效，没有「保存」这一步。
 */
export const TranscribeConfigModal: React.FC<Props> = ({ onClose }) => {
  const t = useTranscribeStore();
  const openTranscribe = useAppStore((s) => s.openTranscribe);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testLabel, setTestLabel] = useState('');
  const testRef = useRef<MicCapture | null>(null);
  const testLevel = useRef(0);
  const [, tick] = useState(0);

  const notify = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    if (type === 'success') setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 4000);
  };

  const stopTest = useCallback(() => { testRef.current?.stop(); testRef.current = null; testLevel.current = 0; setTesting(false); }, []);

  useEffect(() => { void t.refresh(); void t.refreshMics(); return stopTest; }, []);

  const asr = t.asr;
  const recording = t.status === 'recording' || t.status === 'starting' || t.status === 'stopping';
  // 转写中每秒走一下表
  useEffect(() => {
    if (t.status !== 'recording') return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [t.status]);

  const getLevel = useCallback(() => (testRef.current ? testLevel.current : useTranscribeStore.getState().level), []);

  if (!asr) return null;

  const permission = micPermission(asr.micAccess, t.heardSignal);
  const micOk = permission === 'ok';
  const dl = asr.install;
  const pct = dl?.active && dl.total ? Math.round((dl.received / dl.total) * 100) : 0;
  const { missing } = resolveMic(t.micId, t.mics);
  const micName = recording && t.deviceLabel ? t.deviceLabel : currentMicLabel(t.micId, t.mics);
  const ready = asr.supported && asr.installed && micOk;

  const startTest = async () => {
    try {
      const onLevel = (_s: Float32Array, level: number) => {
        testLevel.current = level;
        if (level > MIC_SILENCE_LEVEL && !useTranscribeStore.getState().heardSignal) useTranscribeStore.setState({ heardSignal: true });
      };
      let cap: MicCapture;
      if (t.micId === SYSTEM_AUDIO_ID) {
        // 试听系统声音：起捕获工具（会顺带起识别进程，停下来一起退）
        cap = await startSystemCapture(onLevel);
        try { await window.api.asr.start({ source: 'system' }); } catch (err) { cap.stop(); throw err; }
        const inner = cap.stop;
        cap = { ...cap, stop: () => { inner(); void window.api.asr.stop().catch(() => {}); } };
      } else {
        cap = await startMicCapture(onLevel, t.micId);
      }
      testRef.current = cap;
      setTestLabel(cap.label);
      setTesting(true);
      void t.refresh(); void t.refreshMics();   // 第一次授权之后，设备名字和授权状态都变了
    } catch (err) {
      notify('error', stripIpcError(err));
      void t.refresh();
    }
  };

  const allow = async () => {
    try { await window.api.asr.requestMicAccess(); await t.refresh(); await t.refreshMics(); } catch (err) { notify('error', stripIpcError(err)); }
  };

  const uninstall = async () => {
    if (!window.confirm(`删除语音模型和识别组件（${formatSize(asr.installedBytes)}）？以后可以重新下载。`)) return;
    try { await window.api.asr.uninstall(); await t.refresh(); notify('success', '已删除'); } catch (err) { notify('error', stripIpcError(err)); }
  };

  const statusBadge = t.status === 'recording'
    ? <span className="lm-badge lm-badge--run">正在转写 {formatClock(t.elapsed())}</span>
    : !asr.supported ? <span className="lm-badge lm-badge--muted">这个平台暂不支持</span>
      : ready ? <span className="lm-badge lm-badge--ok">可以转写</span>
        : <span className="lm-badge lm-badge--warn">还差一步</span>;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--wide modal-card--flush" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h1 className="modal-title">实时转写</h1>
            <p className="modal-subtitle">开会、听课时边听边出字，识别在这台电脑上完成</p>
          </div>
          <button onClick={onClose} className="icon-btn" title="关闭"><X size={20} /></button>
          {message && <div className={`toast toast--under-head toast--${message.type}`}>{message.text}</div>}
        </header>

        <div className="modal-body modal-body--headed">
          {/* ── 运行状态：能不能用，一眼看清 ── */}
          <section className="lm-section">
            <div className="lm-card">
              <div className="lm-card__head">
                <div className="lm-card__title"><Activity size={14} /> 运行状态</div>
                {statusBadge}
              </div>
              {asr.supported && (
                <div className="tc-checks">
                  <CheckRow ok={asr.installed}>{asr.installed ? '语音模型已就绪' : dl?.active ? `语音模型下载中 ${pct}%` : '语音模型还没下载'}</CheckRow>
                  <CheckRow ok={micOk}>{micOk ? `麦克风${micName ? `：${micName}` : '已授权'}` : permission === 'ask' ? '还没允许使用麦克风' : '麦克风权限被关掉了'}</CheckRow>
                </div>
              )}
              {(t.error || asr.error) && <div className="lm-line lm-line--error">{t.error || asr.error}</div>}
              <div className="lm-actions">
                {t.status === 'recording'
                  ? <button className="btn btn-secondary btn-xs" onClick={() => void t.stop()}><Square size={11} /> 停止转写</button>
                  : <button className="btn btn-primary btn-xs" disabled={!ready} onClick={() => { onClose(); openTranscribe(); }}><Mic size={12} /> 打开转写面板</button>}
                <span className="lm-line lm-line--muted">只在转写时运行，平时不占内存</span>
              </div>
            </div>
          </section>

          {/* ── 语音模型 ── */}
          {asr.supported && (
            <section className="lm-section">
              <div className="lm-card">
                <div className="lm-card__head">
                  <div className="lm-card__title"><AudioLines size={14} /> 语音模型</div>
                  {asr.installed ? <span className="lm-badge lm-badge--ok">已下载</span> : dl?.active ? <span className="lm-badge lm-badge--info">下载中 {pct}%</span> : <span className="lm-badge lm-badge--muted">未下载</span>}
                </div>
                <div className="lm-model lm-model--static">
                  <div className="lm-model__body">
                    <div className="lm-model__title">SenseVoice 多语种 <span className="lm-model__quant">· int8</span></div>
                    <div className="lm-model__meta"><span>阿里通义</span><span>约 {formatSize(asr.downloadBytes)}</span><span>识别组件 sherpa-onnx{asr.runtimeVersion ? ` ${asr.runtimeVersion}` : ''}</span></div>
                    <div className="lm-model__desc">中文、英语、粤语、日语、韩语，自动加标点</div>
                    {dl?.active && (
                      <>
                        <div className="lm-progress"><div className="lm-progress__bar" style={{ width: `${pct}%` }} /></div>
                        <div className="lm-line lm-line--muted">{dl.step} · {formatSize(dl.received)} / {formatSize(dl.total)}</div>
                      </>
                    )}
                    {dl && !dl.active && dl.error && <div className="lm-line lm-line--error">下载失败：{dl.error}</div>}
                  </div>
                  <div className="lm-model__side">
                    {dl?.active ? <button className="btn btn-secondary btn-xs" onClick={t.cancelInstall}>取消</button>
                      : asr.installed ? <button className="btn btn-ghost btn-xs" disabled={recording} title={recording ? '转写中不能删除' : ''} onClick={() => void uninstall()}>删除</button>
                        : <button className="btn btn-primary btn-xs" onClick={t.install}>{dl?.error ? '重试' : '下载'}</button>}
                  </div>
                </div>
                <div className="lm-line lm-line--muted">只下载一次，下载源与「本机模型」共用</div>
              </div>
            </section>
          )}

          {/* ── 区分说话人：可选，要另外下载一个小模型 ── */}
          {asr.supported && asr.speaker && (() => {
            const sp = asr.speaker;
            const spPct = sp.install?.active && sp.install.total ? Math.round((sp.install.received / sp.install.total) * 100) : 0;
            const on = t.speakersOn;
            const toggle = (next: boolean) => { t.setSpeakersOn(next); if (next && !sp.installed && !sp.install?.active) void window.api.asr.installSpeaker(); };
            return (
              <section className="lm-section">
                <div className="lm-card">
                  <div className="lm-card__head">
                    <div className="lm-card__title"><Users size={14} /> 区分说话人</div>
                    <span className={`lm-badge ${on && sp.installed ? 'lm-badge--ok' : on ? 'lm-badge--info' : 'lm-badge--muted'}`}>{!on ? '未开启' : sp.installed ? '已开启' : sp.install?.active ? `下载中 ${spPct}%` : '还差声纹模型'}</span>
                  </div>
                  <div className="lm-actions">
                    <label className={`toggle ${on ? 'toggle--on' : ''}`}>
                      <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} />
                      <span className="toggle__track"><span className="toggle__thumb" /></span>
                    </label>
                    <span className="lm-line">{on ? '标出每句话是谁说的；点名字可以改名或合并' : '转写里只有时间和文字，不分谁说的'}</span>
                  </div>
                  {on && (
                    <div className="lm-model lm-model--static">
                      <div className="lm-model__body">
                        <div className="lm-model__title">声纹模型 <span className="lm-model__quant">· CAM++</span>{sp.installed && <span className="lm-badge lm-badge--ok">已下载</span>}</div>
                        <div className="lm-model__meta"><span>阿里 3D-Speaker</span><span>约 {formatSize(sp.bytes)}</span><span>中文、英语</span></div>
                        {sp.install?.active && (
                          <>
                            <div className="lm-progress"><div className="lm-progress__bar" style={{ width: `${spPct}%` }} /></div>
                            <div className="lm-line lm-line--muted">{spPct}% · {formatSize(sp.install.received)} / {formatSize(sp.install.total)}</div>
                          </>
                        )}
                        {sp.install && !sp.install.active && sp.install.error && <div className="lm-line lm-line--error">下载失败：{sp.install.error}</div>}
                      </div>
                      <div className="lm-model__side">
                        {sp.install?.active ? <button className="btn btn-secondary btn-xs" onClick={() => void window.api.asr.cancelSpeakerInstall()}>取消</button>
                          : sp.installed ? <button className="btn btn-ghost btn-xs" disabled={recording} onClick={() => { void window.api.asr.uninstallSpeaker(); t.setSpeakersOn(false); }}>删除</button>
                            : <button className="btn btn-primary btn-xs" onClick={() => void window.api.asr.installSpeaker()}>{sp.install?.error ? '重试' : '下载'}</button>}
                      </div>
                    </div>
                  )}
                  {on && (
                    <div className="lm-actions">
                      <span className="lm-line">我的声音：{t.hasMyVoice ? '已记住，你说的话会自动标成「我」' : '还没记 —— 转写之后点自己的名字，选「这是我」'}</span>
                      {t.hasMyVoice && <button className="btn-link" style={{ marginLeft: 'auto' }} onClick={t.forgetMe}>忘掉</button>}
                    </div>
                  )}
                  <div className="lm-line lm-line--muted">
                    声纹只在这台电脑上算。很短的话判断不了，抢着说话时会标错
                    {recording && ' 改动从下一场转写生效'}
                  </div>
                </div>
              </section>
            );
          })()}

          {/* ── 录音：留不留，留在哪 ── */}
          {asr.supported && (
            <section className="lm-section">
              <div className="lm-card">
                <div className="lm-card__head">
                  <div className="lm-card__title"><Headphones size={14} /> 回听录音</div>
                  <span className={`lm-badge ${t.keepRecording ? 'lm-badge--ok' : 'lm-badge--muted'}`}>{t.keepRecording ? '保留' : '不保留'}</span>
                </div>
                <div className="lm-actions">
                  <label className={`toggle ${t.keepRecording ? 'toggle--on' : ''}`}>
                    <input type="checkbox" checked={t.keepRecording} onChange={(e) => t.setKeepRecording(e.target.checked)} />
                    <span className="toggle__track"><span className="toggle__thumb" /></span>
                  </label>
                  <span className="lm-line">{t.keepRecording ? '留一份录音，点哪句话就从哪句开始听' : '只留文字，声音识别完就丢掉'}</span>
                </div>
                <div className="lm-line lm-line--muted">
                  {t.keepRecording
                    ? '录音存在笔记旁的 assets 里，一小时约 11 MB'
                    : '已经留下的录音不受影响'}
                  {recording && ' 改动从下一场转写生效'}
                </div>
              </div>
            </section>
          )}

          {/* ── 收音设备 ── */}
          {asr.supported && (
            <section className="lm-section">
              <div className="lm-card">
                <div className="lm-card__head">
                  <div className="lm-card__title"><Mic size={14} /> 收音设备</div>
                  {micOk ? <span className="lm-badge lm-badge--ok">{asr.micAccess === 'granted' || t.heardSignal ? '已授权' : '可用'}</span> : permission === 'ask' ? <span className="lm-badge lm-badge--warn">还没授权</span> : <span className="lm-badge lm-badge--fail">权限被关掉了</span>}
                </div>

                {permission === 'ask' && (
                  <div className="lm-actions">
                    <button className="btn btn-primary btn-xs" onClick={() => void allow()}>允许使用麦克风</button>
                  </div>
                )}
                {permission === 'blocked' && (
                  <div className="lm-actions">
                    <button className="btn btn-primary btn-xs" onClick={() => void window.api.asr.openMicSettings()}>打开系统设置</button>
                    <span className="lm-line lm-line--muted">在「隐私与安全性 → 麦克风」里打开它</span>
                  </div>
                )}

                {micOk && (
                  <>
                    <div className="tc-device">
                      <select
                        className="lm-select tc-device__select"
                        value={missing ? '' : t.micId}
                        disabled={recording || testing}
                        title={recording ? '转写中不能换设备，停下来再换' : ''}
                        onChange={(e) => t.setMic(e.target.value)}
                      >
                        <option value="">跟随系统{t.mics.systemDefault ? `（现在是 ${t.mics.systemDefault}）` : ''}</option>
                        {t.mics.mics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                        {asr.systemAudio && <option value={SYSTEM_AUDIO_ID}>系统声音（网课、线上会议里电脑放出来的声音）</option>}
                      </select>
                      {recording
                        ? <span className="lm-line lm-line--muted">转写中</span>
                        : testing
                          ? <button className="btn btn-secondary btn-xs" onClick={stopTest}><Square size={11} /> 停止</button>
                          : <button className="btn btn-secondary btn-xs" onClick={() => void startTest()}><Play size={11} /> 试一下</button>}
                    </div>
                    {missing && <div className="lm-line lm-line--error">之前选的麦克风没连上，暂时跟随系统</div>}
                    <div className="tc-meter">
                      <LevelBars getLevel={getLevel} running={testing || t.status === 'recording'} bars={48} />
                      <span className="lm-line lm-line--muted">
                        {testing ? `正在听${testLabel ? `「${testLabel}」` : ''}，说句话音量条会跳` : t.status === 'recording' ? (t.silent ? '没有声音进来，检查麦克风是否静音或选错设备' : '转写中的实时音量') : '点「试一下」看看麦克风有没有在收音'}
                      </span>
                    </div>
                  </>
                )}
                {asr.systemAudio
                  ? <div className="lm-line lm-line--muted">「系统声音」收的是电脑放出来的声音；第一次用会请求「屏幕录制」权限。{t.micId === SYSTEM_AUDIO_ID && <> 没收到声音的话，<button className="btn-link" onClick={() => void window.api.asr.openScreenSettings()}>打开屏幕录制设置</button></>}</div>
                  : <div className="lm-line lm-line--muted">只收麦克风；戴耳机时对方的声音进不来</div>}
              </div>
            </section>
          )}
        </div>

        <footer className="modal-footer">
          <LiveSettingsNote className="hint history-modal__note" />
          <button onClick={onClose} className="btn btn-primary btn-wide">完成</button>
        </footer>
      </div>
    </div>
  );
};
