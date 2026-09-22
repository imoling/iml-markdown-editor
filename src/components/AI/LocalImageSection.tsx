import React, { useEffect, useState } from 'react';
import { Download, Square, Trash2, Cpu } from 'lucide-react';
import { useAppStore, type ImageGenConfig } from '../../stores/appStore';
import { SIZE_OPTIONS, STEP_OPTIONS, DEFAULT_SIZE, DEFAULT_STEPS } from '../../../electron/imageGen/catalog';
import type { ImageGenState } from '../../../electron/imageGen/index';

const GB = 1024 ** 3;
const fmt = (b: number) => (b >= GB ? `${(b / GB).toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`);
const fmtSpeed = (b: number) => (b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB/s` : `${Math.round(b / 1024)} KB/s`);

interface Props { cfg: ImageGenConfig; update: (patch: Partial<ImageGenConfig>) => void }

/**
 * 「AI 配图」里选「本机生图」时的这一段：下载运行时和三个模型文件（约 10 GB，能续传）、选尺寸和步数、看服务状态。
 * 出图时服务按需启动，几分钟不用自动停（智能 → 本机资源 里可调）
 */
export const LocalImageSection: React.FC<Props> = ({ cfg, update }) => {
  const openDialog = useAppStore((s) => s.openDialog);
  const [st, setSt] = useState<ImageGenState | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => window.api.image.getState().then((s) => { if (alive) setSt(s); }).catch(() => {});
    load();
    const off = window.api.image.onState((s) => { if (alive) setSt(s); });
    return () => { alive = false; off(); };
  }, []);
  if (!st) return <div className="lm-line lm-line--muted">正在读取…</div>;
  const inst = st.install;
  const pct = inst && inst.total ? Math.min(100, Math.round((inst.received / inst.total) * 100)) : 0;
  const anyInstalled = st.runtime.installed || st.installedBytes > 0;
  const act = async (fn: () => Promise<unknown>) => { setPending(true); try { await fn(); } catch (err: any) { useAppStore.getState().notify(String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); } finally { setPending(false); } };

  return (
    <section className="lm-section">
      <div className="lm-card">
        <div className="lm-card__head">
          <div className="lm-card__title"><Cpu size={14} /> Qwen-Image 2.1 · Q4_K_M · 阿里通义</div>
          {!st.supported ? <span className="lm-badge lm-badge--muted">这个平台暂不支持</span>
            : st.ready ? <span className="lm-badge lm-badge--ok">可以出图</span>
              : inst?.active ? <span className="lm-badge lm-badge--info">正在下载 {pct}%</span>
                : <span className="lm-badge lm-badge--warn">还没下载</span>}
        </div>
        <div className="lm-line">文生图模型，全程离线。运行时（stable-diffusion.cpp）+ 三个模型文件共约 {fmt(st.totalBytes)}，需要 16 GB 以上内存；一张 768 的图在 Apple M 系列上要一两分钟。</div>
        <div className="lm-kv">
          {st.files.map((f) => <div key={f.key}><span className="lm-kv__k">{f.label}</span><span className="lm-kv__v">{f.downloaded ? `已下载 · ${fmt(f.bytes)}` : fmt(f.size)}</span></div>)}
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
          {st.supported && !st.ready && !inst?.active && <button className="btn btn-primary btn-xs" disabled={pending} onClick={() => void act(() => window.api.image.install())}><Download size={12} /> {anyInstalled ? '继续下载' : `下载（约 ${fmt(st.totalBytes)}）`}</button>}
          {inst?.active && <button className="btn btn-secondary btn-xs" onClick={() => void window.api.image.cancelInstall()}><Square size={11} /> 暂停</button>}
          {st.server.status === 'running' && <span className="lm-badge lm-badge--run">服务运行中</span>}
          {st.server.status === 'starting' && <span className="lm-badge lm-badge--info">服务启动中…</span>}
          {(st.server.status === 'running' || st.server.status === 'starting') && <button className="btn btn-secondary btn-xs" disabled={pending} onClick={() => void act(() => window.api.image.stop())}><Square size={11} /> 停止服务</button>}
          {anyInstalled && !inst?.active && <button className="btn-link" disabled={pending} onClick={() => void act(() => window.api.image.delete())}><Trash2 size={11} /> 删除全部</button>}
        </div>
        <div className="lm-line lm-line--muted">出图时服务自动启动，几分钟不用会自动停，24 GB 以下的电脑上出图前会先停掉对话模型——都在 <button className="btn-link" onClick={() => openDialog('resources')}>本机资源</button> 里管。</div>
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
          <select className="lm-select" value={cfg.localSteps || DEFAULT_STEPS} onChange={(e) => update({ localSteps: e.target.value })}>
            {STEP_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="lm-line lm-line--muted">步数越多细节越好、越慢；换了步数下一次出图会重启一次服务。</div>
      </div>
    </section>
  );
};
