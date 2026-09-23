import React, { useEffect, useState } from 'react';
import { Network, RefreshCw } from 'lucide-react';
import type { SemanticState, EmbedModelEntry } from '../../types/window';
import { stripIpcError } from './ModelConfigModal';
import { VERIFYING_FILE } from '../../utils/uiText';

interface Props {
  notify: (type: 'success' | 'error', text: string, autoHide?: boolean) => void;
  /** 作为独立弹窗的正文（不再显示分区小标题） */
  standalone?: boolean;
}

const formatSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);

/**
 * 语义索引：用本机的嵌入模型给笔记库建向量索引，提供「相关笔记」和语义搜索。
 * 与对话用哪种模型服务无关 —— 即使对话走云端，这部分也始终在本机完成。
 */
export const SemanticIndexCard: React.FC<Props> = ({ notify, standalone = false }) => {
  const [state, setState] = useState<SemanticState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    window.api.semantic.getState().then((s) => { if (alive && s) setState(s); }).catch(() => {});
    const off = window.api.semantic.onState((s) => { if (alive) setState(s); });
    return () => { alive = false; off(); };
  }, []);

  if (!state) return null;

  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      const next = await fn();
      if (next && typeof next === 'object' && 'models' in (next as object)) setState(next as SemanticState);
      if (success) notify('success', success);
    } catch (err) {
      notify('error', stripIpcError(err), false);
    } finally {
      setBusy(false);
    }
  };

  const current = state.models.find((m) => m.id === state.modelId);
  const ready = state.runtimeInstalled && !!current?.downloaded;
  const pct = state.total ? Math.round((state.indexed / state.total) * 100) : 0;

  const statusText = () => {
    if (!state.enabled) return '未开启';
    if (!state.runtimeInstalled) return '缺少推理运行时';
    if (!current?.downloaded) return '等待下载模型';
    if (state.indexing) return `建立索引中 ${state.indexed} / ${state.total}`;
    if (state.error) return '出错';
    return state.total ? `已索引 ${state.indexed} 篇` : '就绪';
  };

  const renderModel = (m: EmbedModelEntry) => {
    const dl = m.download;
    const dlPct = dl?.active && dl.total ? Math.round(((dl.received || 0) / dl.total) * 100) : 0;
    const active = m.id === state.modelId;
    return (
      <div key={m.id} className={`lm-model ${active ? 'lm-model--active' : ''}`} onClick={() => { if (!active) run(() => window.api.semantic.setModel(m.id)); }}>
        <div className="lm-model__radio" />
        <div className="lm-model__body">
          <div className="lm-model__title">
            {m.name}
            <span className="lm-model__quant">· {m.quant}</span>
            {m.recommended && <span className="lm-badge lm-badge--info">推荐</span>}
            {m.downloaded && <span className="lm-badge lm-badge--ok">已下载</span>}
          </div>
          <div className="lm-model__meta">
            <span>{m.vendor}</span>
            <span>约 {formatSize(m.size)}</span>
            <span>{m.dims} 维</span>
          </div>
          <div className="lm-model__desc">{m.description}</div>
          {dl?.active && (
            <>
              <div className="lm-progress"><div className={`lm-progress__bar ${dl.phase === 'verifying' ? 'lm-progress__bar--verify' : ''}`} style={{ width: `${dlPct}%` }} /></div>
              <div className="lm-line lm-line--muted">{dl.phase === 'verifying' ? VERIFYING_FILE : `${dlPct}% · ${formatSize(dl.received || 0)} / ${formatSize(dl.total || m.size)}`}</div>
            </>
          )}
          {dl && !dl.active && dl.error && <div className="lm-line lm-line--error">下载失败：{dl.error}</div>}
        </div>
        <div className="lm-model__side" onClick={(e) => e.stopPropagation()}>
          {dl?.active ? (
            <button className="btn btn-secondary btn-xs" onClick={() => run(() => window.api.semantic.cancelDownload(m.id))}>取消</button>
          ) : m.downloaded ? (
            <button className="btn btn-ghost btn-xs" onClick={() => { if (window.confirm(`删除已下载的「${m.name}」？`)) run(() => window.api.semantic.deleteModel(m.id)); }}>删除</button>
          ) : (
            <button className="btn btn-primary btn-xs" onClick={() => run(() => window.api.semantic.downloadModel(m.id))}>{dl?.error ? '重试' : m.partialBytes > 0 ? '继续下载' : '下载'}</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className={`lm-section ${standalone ? '' : 'semantic-card'}`}>
      {!standalone && <label className="field-label">语义索引</label>}
      <div className="lm-card">
        <div className="lm-card__head">
          <div className="lm-card__title"><Network size={14} /> 相关笔记与语义搜索</div>
          <span className={`lm-badge ${state.enabled && ready && !state.error ? (state.indexing ? 'lm-badge--info' : 'lm-badge--run') : state.error ? 'lm-badge--fail' : 'lm-badge--muted'}`}>{statusText()}</span>
        </div>
        <div className="lm-line">一个很小的本机模型读懂每篇笔记的意思，全程不出这台电脑</div>
        <div className="lm-actions">
          <label className={`toggle ${state.enabled ? 'toggle--on' : ''}`}>
            <input type="checkbox" checked={state.enabled} disabled={busy} onChange={(e) => run(() => window.api.semantic.setEnabled(e.target.checked), e.target.checked ? '相关笔记已开启' : '相关笔记已关闭')} />
            <span className="toggle__track"><span className="toggle__thumb" /></span>
          </label>
          <span className="lm-line">{state.enabled ? '已开启，笔记改动后自动更新' : '开启'}</span>
          {state.enabled && ready && (
            <button className="btn-link" style={{ marginLeft: 'auto' }} disabled={state.indexing} onClick={() => run(() => window.api.semantic.rebuild(), '已开始重建索引')}><RefreshCw size={12} /> 重建索引</button>
          )}
        </div>
        {state.enabled && state.indexing && (
          <div className="lm-progress"><div className="lm-progress__bar" style={{ width: `${pct}%` }} /></div>
        )}
        {state.enabled && !state.runtimeInstalled && (
          <div className="lm-line lm-line--error">
            需要推理运行时，约 11 MB，和「本机模型」共用
            <button className="btn-link" onClick={() => run(() => window.api.local.installRuntime(), '已开始安装运行时')}>现在安装</button>
          </div>
        )}
        {state.error && <div className="lm-line lm-line--error">{state.error}</div>}
        <div className="lm-models">{state.models.map(renderModel)}</div>
        <div className="lm-line lm-line--muted">索引存在应用数据目录，不写进笔记库；换模型会重建。</div>
      </div>
    </section>
  );
};
