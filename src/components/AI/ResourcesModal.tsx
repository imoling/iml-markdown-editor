import React, { useEffect, useState } from 'react';
import { X, Gauge, Play, Square } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';

interface Props { onClose: () => void }

type ServiceId = 'chat' | 'embed' | 'asr' | 'image';
interface ServiceView { id: ServiceId; label: string; note?: string; status: 'stopped' | 'running' | 'busy'; pid: number | null; rssBytes: number | null; estimateBytes: number; lastUsedAt: number | null; idleMinutes: number; canStart: boolean; canStop: boolean; displacedBy: ServiceId | null }
interface ResourceState { totalBytes: number; availableBytes: number; exclusiveApplies: boolean; services: ServiceView[]; config: { idleMinutes: Record<ServiceId, number>; exclusiveImage: boolean } }

const GB = 1024 ** 3;
export const fmtGB = (bytes: number) => `${(bytes / GB).toFixed(bytes >= 10 * GB ? 0 : 1)} GB`;
export const fmtAgo = (at: number | null, now = Date.now()) => {
  if (!at) return '还没用过';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.round(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
  return `${Math.round(s / 86400)} 天前`;
};
const IDLE_OPTIONS = [0, 5, 10, 15, 30, 60];

/**
 * 本机资源：对话、嵌入、转写、生图各占多少内存、在不在跑、多久没用了，手动启停，设空闲多久自动停。
 * 24 GB 以下的电脑上生图和对话互斥，这里能关掉
 */
const ResourcesModal: React.FC<Props> = ({ onClose }) => {
  const notify = useAppStore((s) => s.notify);
  const [state, setState] = useState<ResourceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ServiceId | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => window.api.resources?.getState().then((s) => { if (alive) { setState(s); setError(null); } }).catch((e: any) => { if (alive) setError(e?.message || String(e)); });
    load();
    const off = window.api.resources?.onState((s) => { if (alive) setState(s); });
    const timer = setInterval(load, 4000);
    return () => { alive = false; off?.(); clearInterval(timer); };
  }, []);

  const act = async (id: ServiceId, what: 'start' | 'stop') => {
    setPending(id);
    try {
      const s = await window.api.resources[what](id);
      setState(s);
      setError(null);
    } catch (e: any) {
      const msg = String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      setError(msg);
      notify(msg);
    } finally { setPending(null); }
  };
  const setIdle = async (id: ServiceId, minutes: number) => {
    const s = await window.api.resources.setConfig({ idleMinutes: { [id]: minutes } as any });
    setState(s);
  };

  const used = state ? state.services.reduce((sum, s) => sum + (s.rssBytes || 0), 0) : 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--wide modal-card--flush" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h1 className="modal-title">本机资源</h1>
            <p className="modal-subtitle">几个本机模型各占多少内存、在不在跑。内存不够时会让路（对话、嵌入让完自动回来），空闲久了自动停；正在干活的不会被停</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="modal-body modal-body--headed">
          {error && <div className="lm-line lm-line--error" style={{ marginBottom: 12 }}>{error}</div>}
          {state && (
            <>
              <div className="lm-card" style={{ marginBottom: 12 }}>
                <div className="lm-card__head">
                  <div className="lm-card__title"><Gauge size={14} /> 这台电脑</div>
                  <span className="lm-badge lm-badge--info">本机模型共占 {fmtGB(used)}</span>
                </div>
                <div className="lm-kv">
                  <div><span className="lm-kv__k">内存</span><span className="lm-kv__v">{fmtGB(state.totalBytes)}</span></div>
                  <div><span className="lm-kv__k">现在可用</span><span className="lm-kv__v">约 {fmtGB(state.availableBytes)}</span></div>
                </div>
                <label className="lm-check">
                  <input type="checkbox" checked={state.config.exclusiveImage} onChange={async (e) => setState(await window.api.resources.setConfig({ exclusiveImage: e.target.checked }))} />
                  <span>生图时先停掉对话与嵌入模型，画完再按需拉起{state.exclusiveApplies ? '（这台电脑不到 32 GB，建议开着）' : '（32 GB 及以上的电脑不受此限，这一项不生效）'}</span>
                </label>
              </div>
              <div className="res-list">
                {state.services.map((s) => (
                  <div key={s.id} className="lm-card res-row" data-service={s.id}>
                    <div className="res-row__main">
                      <div className="res-row__name">
                        <span className="res-row__label">{s.label}</span>
                        {s.status === 'busy' ? <span className="lm-badge lm-badge--warn">正在用</span>
                          : s.status === 'running' ? <span className="lm-badge lm-badge--run">运行中</span>
                            : s.displacedBy ? <span className="lm-badge lm-badge--info">让位中</span>
                              : <span className="lm-badge lm-badge--muted">已停</span>}
                      </div>
                      {s.note && <div className="lm-line lm-line--muted">{s.note}</div>}
                      <div className="lm-line lm-line--muted">
                        {s.status === 'stopped' ? `启动后约占 ${fmtGB(s.estimateBytes)}` : s.rssBytes != null ? `占用 ${fmtGB(s.rssBytes)}` : `约占 ${fmtGB(s.estimateBytes)}`}
                        {' · '}最近使用：{fmtAgo(s.lastUsedAt)}
                        {s.displacedBy && ` · 给${state?.services.find((x) => x.id === s.displacedBy)?.label || '别的服务'}腾了地方，完事自动回来`}
                      </div>
                    </div>
                    <div className="res-row__side">
                      <label className="res-row__idle">
                        <span>空闲</span>
                        <select className="lm-select" value={s.idleMinutes} onChange={(e) => void setIdle(s.id, Number(e.target.value))}>
                          {IDLE_OPTIONS.map((m) => <option key={m} value={m}>{m === 0 ? '不自动停' : `${m} 分钟后停`}</option>)}
                        </select>
                      </label>
                      {s.canStop && <button className="btn btn-secondary btn-sm" disabled={pending === s.id} onClick={() => void act(s.id, 'stop')}><Square size={12} /> 停止</button>}
                      {s.canStart && <button className="btn btn-primary btn-sm" disabled={pending === s.id} onClick={() => void act(s.id, 'start')}><Play size={12} /> 启动</button>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {!state && !error && <div className="lm-line lm-line--muted">正在读取…</div>}
        </div>
        <footer className="modal-footer">
          <span className="hint history-modal__note">改动即时生效，不需要保存。</span>
          <button onClick={onClose} className="btn btn-primary btn-wide">完成</button>
        </footer>
      </div>
    </div>
  );
};

export default ResourcesModal;
