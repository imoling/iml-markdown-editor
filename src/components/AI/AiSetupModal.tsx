import React, { useEffect, useRef, useState } from 'react';
import { X, Cpu, Gift, Plug, Check } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { PRESETS } from '../../utils/aiService';
import { pickBestLocalModel, useAiReadiness } from '../../utils/aiReadiness';
import { stripIpcError } from './ModelConfigModal';
import type { LocalState } from '../../types/window';
import { GATEKEEPER_SCAN, DOWNLOAD_IN_BACKGROUND } from '../../utils/uiText';

interface Props {
  onClose: () => void;
}

const formatSize = (bytes: number) => (bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`);

/** 改配置时先读回磁盘上那份再合并：ai:saveConfig 是整体覆盖，直接写会把别的字段抹掉 */
async function patchAiConfig(patch: Record<string, unknown>) {
  const current = (await window.api.ai.getConfig()) || {};
  await window.api.ai.saveConfig({ ...current, ...patch });
}

/**
 * 「快速开始 AI」：新用户打开 AI 气泡时，最常见的卡点不是不会用，而是压根还没配过模型。
 * 这里把三条路摆在一起各自一键 —— 本机模型（免费离线，但要下载）、Agnes（免费额度，但要注册）、
 * 已有的服务（填地址和 Key）。选哪条都行，选完就能用。
 */
export const AiSetupModal: React.FC<Props> = ({ onClose }) => {
  const openDialog = useAppStore((s) => s.openDialog);
  const aiEnabled = useAppStore((s) => s.aiEnabled);
  const notify = useAppStore((s) => s.notify);
  const readiness = useAiReadiness(aiEnabled);

  const [local, setLocal] = useState<LocalState | null>(null);
  const [running, setRunning] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 状态广播很密，用它记住已经发起过的动作，避免重复触发下载
  const kicked = useRef<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    window.api.local.getState().then((s) => { if (alive && s) setLocal(s); }).catch(() => {});
    const off = window.api.local.onState((s) => { if (alive) setLocal(s); });
    return () => { alive = false; off(); };
  }, []);

  // 一键流程的状态机：装运行时 → 下模型 → 写配置。每一步都由主进程广播的新状态推进
  useEffect(() => {
    if (!running || !local) return;
    const { runtime, install, models } = local;

    if (install.error) { setError(`安装运行时失败：${install.error}`); setRunning(false); return; }
    if (!runtime.installed) {
      if (!install.active && !kicked.current.has('runtime')) {
        kicked.current.add('runtime');
        window.api.local.installRuntime().catch((e) => { setError(stripIpcError(e)); setRunning(false); });
      }
      return;
    }

    const target = models.find((m) => m.id === targetId) ?? pickBestLocalModel(models);
    if (!target) { setError('没有可下载的模型'); setRunning(false); return; }
    if (target.id !== targetId) setTargetId(target.id);
    if (target.download?.error) { setError(`下载失败：${target.download.error}`); setRunning(false); return; }

    if (target.downloaded) {
      setRunning(false);
      patchAiConfig({ serviceType: 'builtin', local: { ...(local.config || {}), modelId: target.id } })
        .then(() => notify(`本机模型已就绪：${target.name}`))
        .catch((e) => setError(stripIpcError(e)));
      return;
    }
    if (!target.download?.active && !kicked.current.has(`dl:${target.id}`)) {
      kicked.current.add(`dl:${target.id}`);
      window.api.local.downloadModel(target.id).catch((e) => { setError(stripIpcError(e)); setRunning(false); });
    }
  }, [running, local, targetId]);

  const startOneClick = () => {
    kicked.current.clear();
    setError(null);
    setRunning(true);
  };

  const cancelOneClick = () => {
    setRunning(false);
    if (local?.install.active) window.api.local.cancelInstall().catch(() => {});
    if (targetId) window.api.local.cancelDownload(targetId).catch(() => {});
  };

  /** Agnes：把地址和模型先填好，用户只差一个 Key */
  const useAgnes = async () => {
    const preset = PRESETS.find((p) => p.label === 'Agnes 国内站');
    if (!preset) return;
    try {
      await patchAiConfig({ serviceType: 'cloud', protocol: preset.protocol, endpoint: preset.endpoint, model: preset.model });
      openDialog('ai-config');
    } catch (e: any) {
      setError(stripIpcError(e));
    }
  };

  const best = local ? pickBestLocalModel(local.models) : null;
  const target = local?.models.find((m) => m.id === targetId) ?? best;
  const dl = target?.download;
  const dlPct = dl?.active && dl.total ? Math.round(((dl.received || 0) / dl.total) * 100) : 0;
  const installPct = local?.install.active && local.install.total
    ? Math.round(((local.install.received || 0) / local.install.total) * 100) : 0;

  const progressText = () => {
    if (!running) return null;
    if (!local) return '正在读取本机信息…';
    if (!local.runtime.installed) {
      if (local.install.phase === 'downloading') return `下载推理运行时 ${installPct}%`;
      if (local.install.phase === 'extracting') return '解压推理运行时…';
      if (local.install.phase === 'warming') return GATEKEEPER_SCAN;
      return '准备安装推理运行时…';
    }
    if (dl?.phase === 'verifying') return '校验模型完整性…';
    if (dl?.active) return `下载 ${target?.name} ${dlPct}% · ${formatSize(dl.received || 0)} / ${formatSize(dl.total || target?.size || 0)}`;
    return '准备下载模型…';
  };

  const builtinDone = readiness.ready && !running;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--wide modal-card--flush" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h1 className="modal-title">快速开始 AI</h1>
            <p className="modal-subtitle">续写、润色、配图都要先有一个模型，三条路选一条</p>
          </div>
          <button onClick={onClose} className="icon-btn" title="关闭"><X size={20} /></button>
        </header>

        <div className="modal-body modal-body--headed">
          {!aiEnabled && (
            <div className="lm-line lm-line--error mb-16">
              AI 功能在设置里关掉了，先打开总开关
            </div>
          )}

          {/* 路线一：本机模型 —— 唯一一条完全不用注册、不用花钱的路 */}
          <section className="lm-section">
            <div className="lm-card">
              <div className="lm-card__head">
                <div className="lm-card__title"><Cpu size={14} /> 用本机模型</div>
                <span className="lm-badge lm-badge--ok">免费 · 离线 · 不用注册</span>
              </div>
              <div className="lm-line">
                编辑器自己下载模型并在这台电脑上跑，笔记不出本机。
                {best && <> 按你的配置会选 <strong>{best.name}</strong>，连同运行时约 {formatSize(best.size + 12 * 1024 * 1024)}。</>}
              </div>
              {running && <div className="lm-progress"><div className={`lm-progress__bar ${dl?.phase === 'verifying' ? 'lm-progress__bar--verify' : ''}`} style={{ width: `${local && !local.runtime.installed ? installPct : dlPct}%` }} /></div>}
              {running && <div className="lm-line lm-line--muted">{progressText()}</div>}
              {error && <div className="lm-line lm-line--error">{error}</div>}
              <div className="lm-actions">
                {running ? (
                  <>
                    <button className="btn btn-secondary btn-xs" onClick={cancelOneClick}>取消</button>
                    <span className="lm-line lm-line--muted">{DOWNLOAD_IN_BACKGROUND}</span>
                  </>
                ) : builtinDone ? (
                  <span className="lm-line"><Check size={13} /> 已就绪，回到笔记里按空格就能用</span>
                ) : (
                  <>
                    <button className="btn btn-primary btn-xs" disabled={!aiEnabled || !local} onClick={startOneClick}>一键装好</button>
                    <button className="btn-link" onClick={() => openDialog('ai-config')}>自己挑模型…</button>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* 路线二：Agnes 免费额度 —— 不占磁盘，代价是要注册 */}
          <section className="lm-section">
            <div className="lm-card">
              <div className="lm-card__head">
                <div className="lm-card__title"><Gift size={14} /> 用 Agnes 的免费额度</div>
                <span className="lm-badge lm-badge--info">免费额度 · 不占磁盘</span>
              </div>
              <div className="lm-line">
                在 www.agnes-ai.cn 创建 Key 填进来，不用下载模型
              </div>
              <div className="lm-actions">
                <button className="btn btn-secondary btn-xs" disabled={!aiEnabled} onClick={useAgnes}>填 Key 用起来</button>
              </div>
            </div>
          </section>

          {/* 路线三：已经有服务的人，直接去填 */}
          <section className="lm-section">
            <div className="lm-card">
              <div className="lm-card__head">
                <div className="lm-card__title"><Plug size={14} /> 我已经有模型服务</div>
              </div>
              <div className="lm-line">
                OpenAI、DeepSeek，或自己跑着的 Ollama / LM Studio
              </div>
              <div className="lm-actions">
                <button className="btn btn-secondary btn-xs" disabled={!aiEnabled} onClick={() => openDialog('ai-config')}>去填写…</button>
              </div>
            </div>
          </section>
        </div>

        <footer className="modal-footer">
          <span className="hint history-modal__note">这些设置随时可以在「智能 → 写作助手」里改</span>
          <button onClick={onClose} className="btn btn-primary btn-wide">完成</button>
        </footer>
      </div>
    </div>
  );
};
