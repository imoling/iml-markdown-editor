import React, { useEffect, useState } from 'react';
import { Download, Square, Trash2, Cpu, Check } from 'lucide-react';
import { useAppStore, type ImageGenConfig } from '../../stores/appStore';
import { SIZE_OPTIONS, DEFAULT_SIZE, sizeOf, stepsForModel, stepOptionsFor, estimateMs, formatDuration, imageModelOf } from '../../../electron/imageGen/catalog';
import type { ImageGenState } from '../../../electron/imageGen/index';

const GB = 1024 ** 3;
const fmt = (b: number) => (b >= GB ? `${(b / GB).toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`);
const fmtSpeed = (b: number) => (b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB/s` : `${Math.round(b / 1024)} KB/s`);

interface Props { cfg: ImageGenConfig; update: (patch: Partial<ImageGenConfig>) => void }

/**
 * 「AI 配图」里选「本机生图」时的这一段：挑模型、下载它的三个文件（能续传）、选尺寸和步数、看服务状态。
 * 出图时服务按需启动，几分钟不用自动停（智能 → 本机资源 里可调）
 */
export const LocalImageSection: React.FC<Props> = ({ cfg, update }) => {
  const openDialog = useAppStore((s) => s.openDialog);
  const [st, setSt] = useState<ImageGenState | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let alive = true;
    window.api.image.getState().then((s) => { if (alive) setSt(s); }).catch(() => {});
    const off = window.api.image.onState((s) => { if (alive) setSt(s); });
    return () => { alive = false; off(); };
  }, []);
  // 设置里选的模型是权威；主进程还没同步到就先推过去
  useEffect(() => { if (st && cfg.localModel && cfg.localModel !== st.modelId) void window.api.image.setModel(cfg.localModel).then(setSt).catch(() => {}); }, [st?.modelId, cfg.localModel]);
  if (!st) return <div className="lm-line lm-line--muted">正在读取…</div>;

  const modelId = cfg.localModel || st.modelId;
  const model = imageModelOf(modelId);
  const view = st.models.find((m) => m.id === modelId) || st.models[0];
  const steps = stepsForModel(model, cfg.localSteps);
  const inst = st.install;
  const pct = inst && inst.total ? Math.min(100, Math.round((inst.received / inst.total) * 100)) : 0;
  const ready = !!view?.downloaded && st.runtime.installed;
  const eta = formatDuration(estimateMs(model, sizeOf(cfg.localSize), steps, st.modelId === modelId ? st.lastRun : null, { includeModelLoad: st.server.status !== 'running' }));
  const act = async (fn: () => Promise<unknown>) => { setPending(true); try { await fn(); } catch (err: any) { useAppStore.getState().notify(String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } finally { setPending(false); } };
  const pickModel = async (id: string) => {
    update({ localModel: id, localSteps: imageModelOf(id).defaultStepsId });
    await act(() => window.api.image.setModel(id).then(setSt));
  };

  return (
    <section className="lm-section">
      <div className="img-models">
        {st.models.map((m) => (
          <button key={m.id} type="button" onClick={() => void pickModel(m.id)} className={`img-model${m.id === modelId ? ' img-model--on' : ''}`}>
            <span className="img-model__head">
              <span className="img-model__name">{m.name}</span>
              {m.downloaded ? <span className="lm-badge lm-badge--ok">已下载</span> : <span className="lm-badge lm-badge--muted">{fmt(m.totalBytes)}</span>}
              {m.id === modelId && <Check size={14} className="img-model__check" />}
            </span>
            <span className="img-model__note">{m.note}</span>
          </button>
        ))}
      </div>

      <div className="lm-card">
        <div className="lm-card__head">
          <div className="lm-card__title"><Cpu size={14} /> {model.name} · {model.quant} · {model.vendor}</div>
          {!st.supported ? <span className="lm-badge lm-badge--muted">这个平台暂不支持</span>
            : ready ? <span className="lm-badge lm-badge--ok">可以出图</span>
              : inst?.active ? <span className="lm-badge lm-badge--info">正在下载 {pct}%</span>
                : <span className="lm-badge lm-badge--warn">还没下载</span>}
        </div>
        <div className="lm-line">文生图模型，全程离线。运行时（stable-diffusion.cpp）+ 三个模型文件共约 {fmt(view?.totalBytes || 0)}，需要 {model.minRamGB} GB 以上内存。出图全靠这台电脑的 GPU，快慢看核心数。</div>
        <div className="lm-kv">
          {(view?.files || []).map((f) => <div key={f.key}><span className="lm-kv__k">{f.label}</span><span className="lm-kv__v">{f.downloaded ? `已下载 · ${fmt(f.bytes)}` : fmt(f.size)}</span></div>)}
          <div><span className="lm-kv__k">运行时</span><span className="lm-kv__v">{st.runtime.installed ? `已安装 · ${st.runtime.version}` : '未安装'}</span></div>
        </div>
        {inst?.active && (
          <>
            <div className="lm-progress"><div className="lm-progress__bar" style={{ width: `${pct}%` }} /></div>
            <div className="lm-line lm-line--muted">{inst.step} · {fmt(inst.received)} / {fmt(inst.total)}{inst.speed ? ` · ${fmtSpeed(inst.speed)}` : ''}</div>
          </>
        )}
        {inst?.error && <div className="lm-line lm-line--error">{inst.error}</div>}
        {st.server.error && <div className="lm-line lm-line--error">{st.server.error}</div>}
        <div className="lm-actions">
          {st.supported && !ready && !inst?.active && <button className="btn btn-primary btn-xs" disabled={pending} onClick={() => void act(() => window.api.image.install())}><Download size={12} /> {(view?.installedBytes || 0) > 0 || st.runtime.installed ? '继续下载' : `下载（约 ${fmt(view?.totalBytes || 0)}）`}</button>}
          {inst?.active && <button className="btn btn-secondary btn-xs" onClick={() => void window.api.image.cancelInstall()}><Square size={11} /> 暂停</button>}
          {st.server.status === 'running' && <span className="lm-badge lm-badge--run">服务运行中</span>}
          {st.server.status === 'starting' && <span className="lm-badge lm-badge--info">服务启动中…</span>}
          {(st.server.status === 'running' || st.server.status === 'starting') && <button className="btn btn-secondary btn-xs" disabled={pending} onClick={() => void act(() => window.api.image.stop())}><Square size={11} /> 停止服务</button>}
          {(view?.installedBytes || 0) > 0 && !inst?.active && <button className="btn-link" disabled={pending} onClick={() => void act(() => window.api.image.delete())}><Trash2 size={11} /> 删掉这个模型</button>}
        </div>
        <div className="lm-line lm-line--muted">出图时服务自动启动，几分钟不用会自动停；内存不够时才会请对话和嵌入模型让个位，出完图它们自己回来——都在 <button className="btn-link" onClick={() => openDialog('resources')}>本机资源</button> 里管。</div>
      </div>

      <div className="lm-card" style={{ marginTop: 10 }}>
        <div className="lm-card__head"><div className="lm-card__title">出图设置</div></div>
        <div className="tc-device">
          <label className="lm-line" style={{ minWidth: 48 }}>尺寸</label>
          <select className="lm-select" value={cfg.localSize || DEFAULT_SIZE} onChange={(e) => update({ localSize: e.target.value })}>
            {SIZE_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="tc-device">
          <label className="lm-line" style={{ minWidth: 48 }}>步数</label>
          <select className="lm-select" value={steps.id} onChange={(e) => update({ localSteps: e.target.value })}>
            {stepOptionsFor(model).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="lm-line">按这个设置，一张图{st.lastRun && st.modelId === modelId ? '大约要 ' : '预计 '}<strong>{eta}</strong>{st.lastRun && st.modelId === modelId ? `（上一张实测 ${formatDuration(st.lastRun.ms)}，已按这台电脑的速度折算）` : '（含第一次加载模型的时间）'}。</div>
        <div className="lm-line lm-line--muted">出图途中可以取消：那张图不要了，生图服务会一起停掉（下次出图重新加载模型）。</div>
      </div>
    </section>
  );
};
