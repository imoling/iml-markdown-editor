import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Laptop, Package, Boxes, Activity, ChevronDown, ChevronRight, FolderOpen, FileInput, RefreshCw } from 'lucide-react';
import type { LocalState, LocalModelConfig, LocalModelEntry } from '../../types/window';
import { stripIpcError } from './ModelConfigModal';
import { GATEKEEPER_SCAN, DOWNLOAD_IN_BACKGROUND, VERIFYING_FILE } from '../../utils/uiText';

interface Props {
  /** 表单里的本机模型配置（尚未保存） */
  draft: LocalModelConfig;
  onChange: (patch: Partial<LocalModelConfig>) => void;
  onSwitchBack: () => void;
  notify: (type: 'success' | 'error', text: string, autoHide?: boolean) => void;
}

const CONTEXT_OPTIONS = [4096, 8192, 16384, 32768, 65536, 131072];
const formatCtx = (n: number) => (n >= 1048576 ? `${Math.round(n / 1048576)}M` : n >= 1024 ? `${Math.round(n / 1024)}k` : String(n));

const formatSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};
const formatSpeed = (bps: number) => (bps > 0 ? `${formatSize(bps)}/s` : '');
const formatEta = (remaining: number, speed: number) => {
  if (!speed || speed <= 0 || remaining <= 0) return '';
  const s = Math.round(remaining / speed);
  if (s < 60) return `${s} 秒`;
  if (s < 3600) return `${Math.round(s / 60)} 分钟`;
  return `${(s / 3600).toFixed(1)} 小时`;
};

const SOURCE_LABEL: Record<string, string> = { managed: '编辑器托管', system: '系统已安装', custom: '手动指定' };
const STATUS_LABEL: Record<string, string> = { stopped: '已停止', starting: '启动中…', running: '运行中', error: '启动失败' };

/** 「本机模型」面板：运行状态、推荐模型、llama-server 运行时、设备信息与高级参数 */
export const LocalModelPanel: React.FC<Props> = ({ draft, onChange, onSwitchBack, notify }) => {
  const [state, setState] = useState<LocalState | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const logRef = useRef<HTMLPreElement>(null);

  // 启动中每秒刷新一次，用来显示已等待时长
  const starting = state?.server.status === 'starting';
  useEffect(() => {
    if (!starting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [starting]);

  useEffect(() => {
    let alive = true;
    window.api.local.getState().then((s) => { if (alive && s) setState(s); }).catch((err) => notify('error', stripIpcError(err)));
    const offState = window.api.local.onState((s) => { if (alive) setState(s); });
    const offLog = window.api.local.onLog((line) => { if (alive) setLogs((prev) => [...prev.slice(-299), line]); });
    return () => { alive = false; offState(); offLog(); };
  }, []);

  useEffect(() => {
    if (logsOpen) window.api.local.getLogs().then(setLogs).catch(() => {});
  }, [logsOpen]);

  useEffect(() => {
    if (logsOpen && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs, logsOpen]);

  const run = async (key: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(key);
    try {
      await fn();
      if (success) notify('success', success);
    } catch (err: any) {
      notify('error', stripIpcError(err), false);
    } finally {
      setBusy(null);
    }
  };

  if (!state) return <div className="empty-state">正在读取本机信息…</div>;

  const { device, runtime, install, models, server } = state;
  const selected = models.find((m) => m.id === draft.modelId) ?? null;
  const requirement = selected?.requirement ?? null;
  const ramGB = Math.round(device.totalMemBytes / 1024 ** 3);
  const ctxOptions = CONTEXT_OPTIONS.filter((c) => !selected || c <= selected.maxContext);
  const ctxValue = ctxOptions.includes(draft.ctxSize) ? draft.ctxSize : ctxOptions[ctxOptions.length - 1];
  const serverBusy = server.status === 'starting' || busy === 'start' || busy === 'stop';
  const canStart = runtime.installed && !!selected?.downloaded && server.status !== 'running' && !serverBusy;

  const installPhaseText = () => {
    if (!install.active) return null;
    if (install.phase === 'resolving') return '正在查询最新版本…';
    if (install.phase === 'downloading') {
      const pct = install.total ? Math.round(((install.received || 0) / install.total) * 100) : 0;
      return `下载 ${install.tag || ''} ${pct}% · ${formatSize(install.received || 0)} / ${formatSize(install.total || 0)} ${formatSpeed(install.speed || 0)}`;
    }
    if (install.phase === 'extracting') return '正在解压…';
    if (install.phase === 'warming') return GATEKEEPER_SCAN;
    return '处理中…';
  };

  const renderModel = (m: LocalModelEntry) => {
    const active = m.id === draft.modelId;
    const dl = m.download;
    const pct = dl?.active && dl.total ? Math.round(((dl.received || 0) / dl.total) * 100) : 0;
    const running = server.modelId === m.id && server.status === 'running';
    const starting = server.modelId === m.id && server.status === 'starting';
    const partialPct = !dl && m.partialBytes > 0 && m.size ? Math.round((m.partialBytes / m.size) * 100) : 0;
    return (
      <div key={m.id} className={`lm-model ${active ? 'lm-model--active' : ''} ${m.requirement.level === 'fail' ? 'lm-model--disabled' : ''}`} onClick={() => onChange({ modelId: m.id })}>
        <div className="lm-model__radio" />
        <div className="lm-model__body">
          <div className="lm-model__title">
            {m.name}
            {m.quant && <span className="lm-model__quant">· {m.quant}</span>}
            {m.recommended && <span className="lm-badge lm-badge--info">推荐</span>}
            {m.custom && <span className="lm-badge lm-badge--muted">已导入</span>}
            {running && <span className="lm-badge lm-badge--run">运行中</span>}
            {starting && <span className="lm-badge lm-badge--info">启动中</span>}
            {!running && !starting && m.downloaded && <span className="lm-badge lm-badge--ok">已下载</span>}
          </div>
          <div className="lm-model__meta">
            <span>{m.vendor}</span>
            <span>约 {formatSize(m.size)}</span>
            {!m.custom && <span>建议 {m.minRamGB}GB 内存 · {m.minCores} 核</span>}
            {!m.custom && <span title="模型支持的上限；实际用多少在上面选">最长 {formatCtx(m.maxContext)} 上下文</span>}
          </div>
          {m.description && <div className="lm-model__desc">{m.description}</div>}
          {m.requirement.level !== 'ok' && <div className={`lm-line ${m.requirement.level === 'fail' ? 'lm-line--error' : ''}`}>{m.requirement.message}</div>}
          {dl?.active && (
            <>
              <div className="lm-progress"><div className={`lm-progress__bar ${dl.phase === 'verifying' ? 'lm-progress__bar--verify' : ''}`} style={{ width: `${dl.phase === 'verifying' ? Math.round(((dl.received || 0) / (dl.total || 1)) * 100) : pct}%` }} /></div>
              <div className="lm-line lm-line--muted">
                {dl.phase === 'verifying'
                  ? VERIFYING_FILE
                  : `${pct}% · ${formatSize(dl.received || 0)} / ${formatSize(dl.total || m.size)} ${formatSpeed(dl.speed || 0)} ${formatEta((dl.total || m.size) - (dl.received || 0), dl.speed || 0) && `· 剩余约 ${formatEta((dl.total || m.size) - (dl.received || 0), dl.speed || 0)}`}`}
              </div>
            </>
          )}
          {dl && !dl.active && dl.error && <div className="lm-line lm-line--error">下载失败：{dl.error}</div>}
          {partialPct > 0 && !m.downloaded && <div className="lm-line lm-line--muted">已下载 {partialPct}%，可继续</div>}
        </div>
        <div className="lm-model__side" onClick={(e) => e.stopPropagation()}>
          {dl?.active ? (
            <button className="btn btn-secondary btn-xs" onClick={() => run(`cancel-${m.id}`, () => window.api.local.cancelDownload(m.id))}>取消</button>
          ) : m.downloaded ? (
            <button className="btn btn-ghost btn-xs" disabled={running || starting} title={m.custom ? '从列表移除（不删除文件）' : '删除模型文件'} onClick={() => {
              if (m.custom || window.confirm(`删除「${m.name} ${m.quant}」？以后可以重新下载。`)) run(`delete-${m.id}`, () => window.api.local.deleteModel(m.id));
            }}>{m.custom ? '移除' : '删除'}</button>
          ) : m.custom ? (
            <button className="btn btn-ghost btn-xs" onClick={() => run(`delete-${m.id}`, () => window.api.local.deleteModel(m.id))}>移除</button>
          ) : (
            <button className="btn btn-primary btn-xs" disabled={m.requirement.level === 'fail'} onClick={() => run(`dl-${m.id}`, () => window.api.local.downloadModel(m.id, { source: draft.source, customBase: draft.customBase }))}>
              {dl?.error ? '重试' : partialPct > 0 ? '继续下载' : '下载'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="lm-notice">
        <ShieldCheck size={16} />
        <span>全部在本机运行，笔记不会离开这台电脑</span>
      </div>

      {/* 顺序按「打开就想看什么」排：在不在跑 → 用哪个模型 → 运行时 → 设备信息 */}
      {/* 运行状态 */}
      <section className="lm-section">
        <div className="lm-card">
          <div className="lm-card__head">
            <div className="lm-card__title"><Activity size={14} /> 运行状态</div>
            <span className={`lm-badge ${server.status === 'running' ? 'lm-badge--run' : server.status === 'error' ? 'lm-badge--fail' : server.status === 'starting' ? 'lm-badge--info' : 'lm-badge--muted'}`}>{STATUS_LABEL[server.status]}</span>
          </div>
          {server.status !== 'stopped' && (
            <div className="lm-kv">
              <div><span className="lm-kv__k">模型</span><span className="lm-kv__v">{server.modelName}</span></div>
              <div><span className="lm-kv__k">地址</span><span className="lm-kv__v">127.0.0.1:{server.port}</span></div>
              <div><span className="lm-kv__k">PID</span><span className="lm-kv__v">{server.pid ?? '—'}</span></div>
              <div><span className="lm-kv__k">模型名</span><span className="lm-kv__v">{server.alias}</span></div>
            </div>
          )}
          {/* 停止状态只提示还缺什么（运行时卡片排在后面，这里直接给安装入口）；都齐了就不说话 */}
          {server.status === 'stopped' && (!selected || !runtime.installed || !selected.downloaded) && (
            <div className="lm-line lm-line--muted">
              {!runtime.installed ? (
                install.active ? installPhaseText() : (
                  <>
                    还没有安装推理运行时（约 11 MB）。
                    <button className="btn-link" onClick={() => run('install', () => window.api.local.installRuntime({ proxyPrefix: draft.proxyPrefix }))}>现在安装</button>
                  </>
                )
              ) : !selected ? '先在下面选一个模型' : '所选模型还没下载，在下面点「下载」'}
            </div>
          )}
          {server.status === 'starting' && (
            <div className="lm-line lm-line--muted">
              正在加载模型，已等待 {Math.max(0, Math.round((now - (server.startedAt || now)) / 1000))} 秒（首次运行要多等十几秒）。
            </div>
          )}
          {server.status === 'error' && server.error && <div className="lm-line lm-line--error">{server.error}</div>}
          <div className="lm-actions">
            {server.status === 'running' || server.status === 'starting' ? (
              <button className="btn btn-secondary btn-xs" disabled={busy === 'stop'} onClick={() => run('stop', () => window.api.local.stop(), '已停止本机模型')}>停止</button>
            ) : (
              <button className="btn btn-primary btn-xs" disabled={!canStart} onClick={() => run('start', () => window.api.local.start(draft), '本机模型已就绪')}>{busy === 'start' ? '启动中…' : '启动'}</button>
            )}
            <button className="btn btn-ghost btn-xs" onClick={onSwitchBack}>切回模型服务</button>
            {/* 模型卡片上的「最长」是原生上限；这里是本次启动实际预留多少，越大越占内存，所以最多开到 128k */}
            <span className="lm-line lm-line--muted" style={{ marginLeft: 'auto' }} title="越大越占内存；写作 32k 够用">
              分配上下文
              <select className="lm-select" value={ctxValue} onChange={(e) => onChange({ ctxSize: Number(e.target.value) })} style={{ marginLeft: 6 }}>
                {ctxOptions.map((c) => <option key={c} value={c}>{formatCtx(c)}</option>)}
              </select>
            </span>
          </div>
          <div className="lm-actions">
            <label className="lm-check"><input type="checkbox" checked={draft.autoStart} onChange={(e) => onChange({ autoStart: e.target.checked })} /> 随客户端启动</label>
            <label className="lm-check" title="先推理再作答，质量更好但明显变慢">
              <input type="checkbox" checked={draft.thinking} disabled={selected ? !selected.supportsThinking : false} onChange={(e) => onChange({ thinking: e.target.checked })} /> 思考模式（慢）
            </label>
            {server.status === 'running' && <span className="lm-line lm-line--muted">改动下次启动生效</span>}
            <button className="lm-toggle-btn" style={{ marginLeft: 'auto' }} onClick={() => setLogsOpen((v) => !v)}>
              {logsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 查看运行日志
            </button>
          </div>
          {logsOpen && <pre ref={logRef} className="lm-log">{logs.length ? logs.join('\n') : '（启动后这里显示模型服务的输出）'}</pre>}
        </div>
      </section>

      {/* 推荐模型 */}
      <section className="lm-section">
        <div className="lm-card">
          <div className="lm-card__head">
            <div className="lm-card__title"><Boxes size={14} /> 推荐模型</div>
            <select className="lm-select" value={draft.source} onChange={(e) => onChange({ source: e.target.value as LocalModelConfig['source'] })} title="模型下载源">
              <option value="hf-mirror">下载源：国内镜像</option>
              <option value="huggingface">下载源：Hugging Face</option>
              <option value="custom">下载源：自定义</option>
            </select>
          </div>
          {draft.source === 'custom' && (
            <input className="field-input field-input--xs" placeholder="自定义地址前缀" value={draft.customBase} onChange={(e) => onChange({ customBase: e.target.value })} />
          )}
          <div className="lm-models">{models.map(renderModel)}</div>
          {models.some((m) => m.download?.active) && <div className="lm-line lm-line--muted">{DOWNLOAD_IN_BACKGROUND}</div>}
          <div className="lm-actions">
            <button className="btn-link" onClick={() => run('import', async () => { const m = await window.api.local.importModel(); if (m) { onChange({ modelId: m.id }); notify('success', `已导入 ${m.name}`); } })}><FileInput size={12} /> 导入本地 GGUF…</button>
            <button className="btn-link" onClick={() => window.api.local.openModelsFolder()}><FolderOpen size={12} /> 打开模型目录</button>
          </div>
        </div>
      </section>

      {/* 推理运行时 */}
      <section className="lm-section">
        <div className="lm-card">
          <div className="lm-card__head">
            <div className="lm-card__title"><Package size={14} /> 推理运行时（llama-server）</div>
            {runtime.installed
              ? <span className="lm-badge lm-badge--ok">已安装 {runtime.version || ''}</span>
              : <span className="lm-badge lm-badge--warn">未安装</span>}
          </div>
          {install.active ? (
            <>
              <div className="lm-line">{installPhaseText()}</div>
              {install.phase === 'downloading' && install.total ? (
                <div className="lm-progress"><div className="lm-progress__bar" style={{ width: `${Math.round(((install.received || 0) / install.total) * 100)}%` }} /></div>
              ) : null}
              <div className="lm-actions">
                <button className="btn btn-secondary btn-xs" onClick={() => run('cancel-install', () => window.api.local.cancelInstall())}>取消</button>
              </div>
            </>
          ) : (
            <>
              {runtime.installed ? (
                <>
                  <div className="lm-line">{SOURCE_LABEL[runtime.source || ''] || ''}</div>
                  <div className="lm-path">{runtime.path}</div>
                </>
              ) : (
                <div className="lm-line">约 11 MB，下载到编辑器自己的目录，不影响系统</div>
              )}
              {install.error && <div className="lm-line lm-line--error">安装失败：{install.error}</div>}
              <div className="lm-actions">
                <button className={`btn ${runtime.installed ? 'btn-secondary' : 'btn-primary'} btn-xs`} disabled={server.status !== 'stopped'} onClick={() => run('install', () => window.api.local.installRuntime({ proxyPrefix: draft.proxyPrefix }))}>
                  <RefreshCw size={12} /> {runtime.installed ? (runtime.source === 'managed' ? '重装 / 更新' : '改用编辑器托管版本') : '安装'}
                </button>
                <button className="btn-link" onClick={() => run('pick', async () => { const p = await window.api.local.pickRuntime(); if (p) notify('success', '已改用手动指定的 llama-server'); })}>手动指定…</button>
                {runtime.source === 'custom' && <button className="btn-link" onClick={() => run('clear', () => window.api.local.clearRuntimePath())}>恢复自动检测</button>}
              </div>
            </>
          )}
        </div>
      </section>

      {/* 本机设备 */}
      <section className="lm-section">
        <div className="lm-card">
          <div className="lm-card__head">
            <div className="lm-card__title"><Laptop size={14} /> 本机设备</div>
            {requirement && <span className={`lm-badge lm-badge--${requirement.level}`}>{requirement.level === 'ok' ? '满足所选模型要求' : requirement.level === 'warn' ? '配置偏紧' : '不满足要求'}</span>}
          </div>
          <div className="lm-kv">
            <div><span className="lm-kv__k">系统</span><span className="lm-kv__v">{device.osName} {device.osVersion}</span></div>
            <div><span className="lm-kv__k">芯片</span><span className="lm-kv__v">{device.chip}</span></div>
            <div><span className="lm-kv__k">内存</span><span className="lm-kv__v">{ramGB} GB</span></div>
            <div><span className="lm-kv__k">核心</span><span className="lm-kv__v">{device.cores} 核 · {device.arch}</span></div>
            <div><span className="lm-kv__k">加速</span><span className="lm-kv__v">{device.accelLabel}</span></div>
          </div>
        </div>
      </section>

      {/* 高级设置 */}
      <section className="lm-section">
        <button className="lm-toggle-btn" onClick={() => setAdvancedOpen((v) => !v)}>
          {advancedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} 高级设置（参数）
        </button>
        {advancedOpen && (
          <div className="lm-card mt-8">
            <div className="lm-adv">
              <div className="lm-adv__field">
                <span className="lm-adv__label">端口（被占用时自动顺延）</span>
                <input className="field-input" type="number" min={1024} max={65535} value={draft.port} onChange={(e) => onChange({ port: Number(e.target.value) || 18080 })} />
              </div>
              <div className="lm-adv__field">
                <span className="lm-adv__label">线程数（留空 = 自动）</span>
                <input className="field-input" type="number" min={1} value={draft.threads ?? ''} onChange={(e) => onChange({ threads: e.target.value === '' ? null : Number(e.target.value) })} placeholder="自动" />
              </div>
              <div className="lm-adv__field">
                <span className="lm-adv__label">GPU 卸载层数（留空 = 全部）</span>
                <input className="field-input" type="number" min={0} value={draft.gpuLayers ?? ''} onChange={(e) => onChange({ gpuLayers: e.target.value === '' ? null : Number(e.target.value) })} placeholder="全部" />
              </div>
              <div className="lm-adv__field">
                <span className="lm-adv__label">温度（留空 = 模型默认）</span>
                <input className="field-input" type="number" step={0.1} min={0} max={2} value={draft.temperature ?? ''} onChange={(e) => onChange({ temperature: e.target.value === '' ? null : Number(e.target.value) })} placeholder="0.8" />
              </div>
              <div className="lm-adv__field lm-adv__field--wide">
                <span className="lm-adv__label">GitHub 加速前缀，下载慢时填</span>
                <input className="field-input" value={draft.proxyPrefix} onChange={(e) => onChange({ proxyPrefix: e.target.value })} placeholder="留空直接连 github.com" />
              </div>
              <div className="lm-adv__field lm-adv__field--wide">
                <span className="lm-adv__label">llama-server 额外参数（原样追加）</span>
                <input className="field-input field-input--mono" value={draft.extraArgs} onChange={(e) => onChange({ extraArgs: e.target.value })} placeholder="-fa on --batch-size 512" />
              </div>
            </div>
            <div className="lm-line lm-line--muted">参数改动需要「保存配置」并重新启动本机模型才会生效。数据目录：{state.modelsDir}</div>
          </div>
        )}
      </section>
    </div>
  );
};
