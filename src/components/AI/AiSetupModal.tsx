import React, { useEffect, useRef, useState } from 'react';
import { X, Cpu, Gift, Check, Wand2, MessageCircleQuestion, Mic, Image as ImageIcon } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { PRESETS } from '../../utils/aiService';
import { chatModelOf, describeSetup, formatSize, oneClickBytes, ONE_CLICK_ROWS, type SetupRow, type SetupRowId } from '../../utils/aiSetup';
import { stripIpcError } from './ModelConfigModal';
import { StorageLine } from './StorageCard';
import type { LocalState, SemanticState, AsrState, ImageGenState } from '../../types/window';
import { DOWNLOAD_IN_BACKGROUND } from '../../utils/uiText';

interface Props {
  onClose: () => void;
}

/** 改配置时先读回磁盘上那份再合并：ai:saveConfig 是整体覆盖，直接写会把别的字段抹掉 */
async function patchAiConfig(patch: Record<string, unknown>) {
  const current = (await window.api.ai.getConfig()) || {};
  await window.api.ai.saveConfig({ ...current, ...patch });
}

/** 四行各自是干什么的；meta 里再接模型名和大小 */
const ROW_META: Record<SetupRowId, { title: string; icon: React.ReactNode; note?: string }> = {
  chat: { title: '写作助手、自动续写', icon: <Wand2 size={14} /> },
  embed: { title: '问你的笔记', icon: <MessageCircleQuestion size={14} />, note: '回答靠上面的对话模型，找笔记靠它' },
  asr: { title: '实时转写', icon: <Mic size={14} /> },
  image: { title: 'AI 配图', icon: <ImageIcon size={14} />, note: '想用再装；一张图要一两分钟' },
};

/**
 * 「快速开始 AI」：对话、问笔记、转写、配图都在这台电脑上跑，各自要一个模型。
 * 这里把四样的状态摆在一起，缺什么装什么，也能一键把常用的三样装齐；要下十几 GB，所以放在哪也在这里改。
 * 不想下载模型的，底下还有 Agnes 的免费额度和自己的服务两条路——它们只替对话，转写只有本机一条路。
 */
export const AiSetupModal: React.FC<Props> = ({ onClose }) => {
  const openDialog = useAppStore((s) => s.openDialog);
  const aiEnabled = useAppStore((s) => s.aiEnabled);
  const notify = useAppStore((s) => s.notify);

  const [config, setConfig] = useState<any>(null);
  const [local, setLocal] = useState<LocalState | null>(null);
  const [semantic, setSemantic] = useState<SemanticState | null>(null);
  const [asr, setAsr] = useState<AsrState | null>(null);
  const [image, setImage] = useState<ImageGenState | null>(null);
  const [chatRunning, setChatRunning] = useState(false);
  const [embedRunning, setEmbedRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 状态广播很密，用它记住已经发起过的动作，避免重复触发下载
  const kicked = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const readConfig = () => window.api.ai.getConfig().then((c: any) => { if (alive) setConfig(c || {}); }).catch(() => { if (alive) setConfig({}); });
    readConfig();
    window.api.local.getState().then((s) => { if (alive && s) setLocal(s); }).catch(() => {});
    window.api.semantic.getState().then((s) => { if (alive && s) setSemantic(s); }).catch(() => {});
    window.api.asr.getState().then((s) => { if (alive && s) setAsr(s); }).catch(() => {});
    window.api.image.getState().then((s) => { if (alive && s) setImage(s); }).catch(() => {});
    const offs = [
      // 本机模型的状态广播里带着 serviceType，配置改了也会走这条——顺便重读一次 ai-config
      window.api.local.onState((s) => { if (alive) { setLocal(s); void readConfig(); } }),
      window.api.semantic.onState((s) => { if (alive) setSemantic(s); }),
      window.api.asr.onState((s) => { if (alive) setAsr(s); }),
      window.api.image.onState((s) => { if (alive) setImage(s); }),
    ];
    return () => { alive = false; offs.forEach((off) => off()); };
  }, []);

  const rows = describeSetup({ aiEnabled, config, local, semantic, asr, image });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r])) as Record<SetupRowId, SetupRow>;
  const fail = (e: unknown) => setError(stripIpcError(e));

  /** 运行组件是对话和嵌入共用的：谁先要谁去装，装一次 */
  const ensureRuntime = (): boolean => {
    if (!local) return false;
    if (local.runtime.installed) return true;
    if (!local.install.active && !kicked.current.has('runtime')) {
      kicked.current.add('runtime');
      window.api.local.installRuntime().catch((e) => { fail(e); setChatRunning(false); setEmbedRunning(false); });
    }
    return false;
  };

  // 对话：装运行组件 → 下模型 → 写配置。每一步都由主进程广播的新状态推进
  useEffect(() => {
    if (!chatRunning || !local) return;
    if (local.install.error) { setChatRunning(false); return; }
    if (!ensureRuntime()) return;
    const target = chatModelOf(local, config);
    if (!target) { setError('没有可下载的模型'); setChatRunning(false); return; }
    if (target.download?.error) { setChatRunning(false); return; }
    if (target.downloaded) {
      setChatRunning(false);
      patchAiConfig({ serviceType: 'builtin', local: { ...(local.config || {}), modelId: target.id } })
        .then(() => notify(`本机模型已就绪：${target.name}`))
        .catch(fail);
      return;
    }
    if (!target.download?.active && !kicked.current.has(`dl:${target.id}`)) {
      kicked.current.add(`dl:${target.id}`);
      window.api.local.downloadModel(target.id).catch((e) => { fail(e); setChatRunning(false); });
    }
  }, [chatRunning, local, config]);

  // 问笔记：运行组件 → 嵌入模型 → 打开语义索引
  useEffect(() => {
    if (!embedRunning || !semantic || !local) return;
    if (local.install.error) { setEmbedRunning(false); return; }
    const model = semantic.models.find((m) => m.id === semantic.modelId) ?? semantic.models[0];
    if (!model) { setError('没有可下载的嵌入模型'); setEmbedRunning(false); return; }
    if (model.download?.error) { setEmbedRunning(false); return; }
    if (model.downloaded) {
      if (!ensureRuntime()) return;
      setEmbedRunning(false);
      (semantic.enabled ? Promise.resolve() : window.api.semantic.setEnabled(true).then(() => undefined))
        .then(() => notify('问你的笔记已就绪，笔记多的话建索引要几分钟'))
        .catch(fail);
      return;
    }
    if (!model.download?.active && !kicked.current.has(`embed:${model.id}`)) {
      kicked.current.add(`embed:${model.id}`);
      window.api.semantic.downloadModel(model.id).catch((e) => { fail(e); setEmbedRunning(false); });
    }
  }, [embedRunning, semantic, local]);

  const install = (id: SetupRowId) => {
    setError(null);
    if (id === 'chat') { kicked.current.delete(`dl:${chatModelOf(local, config)?.id}`); kicked.current.delete('runtime'); setChatRunning(true); }
    else if (id === 'embed') { kicked.current.delete(`embed:${semantic?.modelId}`); kicked.current.delete('runtime'); setEmbedRunning(true); }
    else if (id === 'asr') window.api.asr.install().catch(fail);
    else if (id === 'image') window.api.image.install().catch(fail);
  };
  const cancel = (id: SetupRowId) => {
    if (id === 'chat') {
      setChatRunning(false);
      if (local?.install.active) window.api.local.cancelInstall().catch(() => {});
      const target = chatModelOf(local, config);
      if (target?.download?.active) window.api.local.cancelDownload(target.id).catch(() => {});
    } else if (id === 'embed') {
      setEmbedRunning(false);
      if (semantic) window.api.semantic.cancelDownload(semantic.modelId).catch(() => {});
      if (!chatRunning && local?.install.active) window.api.local.cancelInstall().catch(() => {});
    } else if (id === 'asr') window.api.asr.cancelInstall().catch(() => {});
    else if (id === 'image') window.api.image.cancelInstall().catch(() => {});
  };
  const installAll = () => { for (const id of ONE_CLICK_ROWS) if (byId[id].status === 'missing') install(id); };

  /** Agnes：把地址和模型先填好，用户只差一个 Key */
  const useAgnes = async () => {
    const preset = PRESETS.find((p) => p.label === 'Agnes 国内站');
    if (!preset) return;
    try {
      await patchAiConfig({ serviceType: 'cloud', protocol: preset.protocol, endpoint: preset.endpoint, model: preset.model });
      openDialog('ai-config');
    } catch (e) {
      fail(e);
    }
  };

  const toInstall = oneClickBytes(rows);
  const anyInstalling = rows.some((r) => r.status === 'installing');
  const loaded = rows.every((r) => r.status !== 'unknown');

  const side = (row: SetupRow) => {
    switch (row.status) {
      case 'unknown': return <span className="lm-line lm-line--muted">正在读取…</span>;
      case 'unsupported': return <span className="lm-line lm-line--muted">这台电脑不支持</span>;
      case 'ready': return <span className="setup-row__ok"><Check size={13} /> 已就绪</span>;
      case 'cloud': return (
        <>
          <span className="lm-line lm-line--muted">用的是网络服务</span>
          <button className="btn-link" disabled={!aiEnabled} onClick={() => install('chat')}>改用本机模型</button>
        </>
      );
      case 'installing': return <button className="btn btn-secondary btn-xs" onClick={() => cancel(row.id)}>取消</button>;
      default: return <button className="btn btn-secondary btn-xs" disabled={!aiEnabled} onClick={() => install(row.id)}>{row.error ? '重试' : '装好'}</button>;
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--wide modal-card--flush" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h1 className="modal-title">快速开始 AI</h1>
            <p className="modal-subtitle">对话、问笔记、转写、配图都在这台电脑上跑，笔记不出本机</p>
          </div>
          <button onClick={onClose} className="icon-btn" title="关闭"><X size={20} /></button>
        </header>

        <div className="modal-body modal-body--headed">
          {!aiEnabled && (
            <div className="lm-line lm-line--error mb-16">
              AI 功能在设置里关掉了，先打开总开关
            </div>
          )}

          <section className="lm-section">
            <div className="lm-card" data-setup>
              <div className="lm-card__head">
                <div className="lm-card__title"><Cpu size={14} /> 本机模型</div>
                <span className="lm-badge lm-badge--ok">免费 · 离线 · 不用注册</span>
              </div>
              <div className="setup-rows">
                {rows.map((row) => {
                  const meta = ROW_META[row.id];
                  const percent = row.progress === null ? null : Math.round(row.progress * 100);
                  return (
                    <div key={row.id} className={`setup-row setup-row--${row.status}`} data-setup-row={row.id}>
                      <div className="setup-row__icon">{meta.icon}</div>
                      <div className="setup-row__body">
                        <div className="setup-row__title">{meta.title}</div>
                        {row.model && (
                          <div className="setup-row__meta">
                            {row.id === 'embed' && '嵌入模型 '}{row.model}
                            {row.bytes > 0 && row.status !== 'ready' && ` · ${formatSize(row.bytes)}`}
                            {meta.note && row.status !== 'ready' && row.status !== 'installing' && <span className="setup-row__note">{meta.note}</span>}
                          </div>
                        )}
                        {row.status === 'installing' && (
                          <>
                            <div className="lm-progress"><div className={`lm-progress__bar ${percent === null ? 'lm-progress__bar--indeterminate' : ''}`} style={{ width: percent === null ? '100%' : `${percent}%` }} /></div>
                            <div className="lm-line lm-line--muted">{row.step}{percent !== null && ` ${percent}%`}</div>
                          </>
                        )}
                        {row.error && <div className="lm-line lm-line--error">{row.error}</div>}
                      </div>
                      <div className="setup-row__side">{side(row)}</div>
                    </div>
                  );
                })}
              </div>
              {error && <div className="lm-line lm-line--error">{error}</div>}
              <div className="lm-actions">
                {loaded && toInstall > 0 && !anyInstalling && (
                  <button className="btn btn-primary btn-xs" disabled={!aiEnabled} onClick={installAll}>一键装好 · 约 {formatSize(toInstall)}</button>
                )}
                {anyInstalling && <span className="lm-line lm-line--muted">{DOWNLOAD_IN_BACKGROUND}</span>}
                {loaded && toInstall === 0 && !anyInstalling && byId.image.status !== 'ready' && <span className="lm-line lm-line--muted">常用的三样都齐了；配图想用再装</span>}
                <button className="btn-link" onClick={() => openDialog('ai-config')}>自己挑模型…</button>
              </div>
              <StorageLine />
            </div>
          </section>

          {/* 不想下载模型的两条路：只替对话；转写只有本机一条路 */}
          <section className="lm-section">
            <div className="lm-card">
              <div className="lm-card__head">
                <div className="lm-card__title"><Gift size={14} /> 不想下载模型</div>
                <span className="lm-badge lm-badge--info">只替对话 · 不占磁盘</span>
              </div>
              <div className="setup-cloud">
                <div className="setup-cloud__row">
                  <div>
                    <div className="setup-row__title">用 Agnes 的免费额度</div>
                    <div className="setup-row__meta">在 www.agnes-ai.cn 创建 Key 填进来</div>
                  </div>
                  <button className="btn btn-secondary btn-xs" disabled={!aiEnabled} onClick={useAgnes}>填 Key 用起来</button>
                </div>
                <div className="setup-cloud__row">
                  <div>
                    <div className="setup-row__title">我已经有模型服务</div>
                    <div className="setup-row__meta">OpenAI、DeepSeek，或自己跑着的 Ollama / LM Studio</div>
                  </div>
                  <button className="btn btn-secondary btn-xs" disabled={!aiEnabled} onClick={() => openDialog('ai-config')}>去填写…</button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="modal-footer">
          <span className="hint history-modal__note">这些设置随时可以在「智能」菜单里改</span>
          <button onClick={onClose} className="btn btn-primary btn-wide">完成</button>
        </footer>
      </div>
    </div>
  );
};
