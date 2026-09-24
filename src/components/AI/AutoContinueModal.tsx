import React, { useEffect, useState } from 'react';
import { X, PenLine } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { AUTO_CONTINUE_DELAYS } from '../../utils/autoContinue';
import { describeAiDestination } from '../../utils/aiService';
import { useAiReadiness } from '../../utils/aiReadiness';
import { LiveSettingsNote } from './CopyNotes';

interface Props { onClose: () => void }

/**
 * 「智能 → 自动续写…」：开关、停顿多久、用的是哪个模型。
 * 模型不单独配，跟写作助手走同一个服务；顶上画一行假的编辑器，让人一眼看懂灰字和 Tab 是怎么回事。
 */
export const AutoContinueModal: React.FC<Props> = ({ onClose }) => {
  const prefs = useAppStore((s) => s.autoContinue);
  const setPrefs = useAppStore((s) => s.setAutoContinue);
  const aiEnabled = useAppStore((s) => s.aiEnabled);
  const openDialog = useAppStore((s) => s.openDialog);
  const readiness = useAiReadiness(aiEnabled);
  const [dest, setDest] = useState<{ label: string; kind: 'local' | 'cloud' } | null>(null);

  useEffect(() => {
    window.api.ai.getConfig().then((cfg) => setDest(describeAiDestination(cfg))).catch(() => setDest(null));
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--flush auto-continue-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h1 className="modal-title">自动续写</h1>
            <p className="modal-subtitle">打字停一下，光标后浮出灰字；Tab 收下</p>
          </div>
          <button onClick={onClose} className="icon-btn" title="关闭"><X size={20} /></button>
        </header>
        <div className="modal-body modal-body--headed">
          <div className="auto-continue-demo" aria-hidden>
            {/* 几个 span 紧挨着写：换行会变成空格，光标前就多出一格 */}
            <span>周末去爬了香山，本以为工作日人不多，</span><span className="auto-continue-demo__caret" /><span className="auto-continue-demo__ghost">结果山脚下已经排起了长队。</span><kbd>Tab</kbd>
          </div>

          <div className="lm-card">
            <div className="lm-card__head">
              <div className="lm-card__title"><PenLine size={14} /> 打字停顿时续写</div>
              <label className={`toggle ${prefs.enabled ? 'toggle--on' : ''}`}>
                <input type="checkbox" checked={prefs.enabled} disabled={!aiEnabled} onChange={(e) => setPrefs({ enabled: e.target.checked })} />
                <span className="toggle__track"><span className="toggle__thumb" /></span>
              </label>
            </div>
            {dest?.kind === 'cloud' && <div className="lm-line lm-line--muted">每停一次发一次请求，按量计费的服务会花钱</div>}
            {!readiness.ready && <div className="lm-line lm-line--error">{readiness.message}</div>}

            <div className="auto-continue-row">
              <span className="lm-line">停顿多久</span>
              <div className="seg-switch">
                {AUTO_CONTINUE_DELAYS.map((d) => (
                  <button key={d.value} onClick={() => setPrefs({ delay: d.value })} className={`seg-switch__btn ${prefs.delay === d.value ? 'seg-switch__btn--active' : ''}`}>{d.label}</button>
                ))}
              </div>
            </div>
            <div className="auto-continue-row">
              <span className="lm-line">用的模型</span>
              <span className="lm-line">
                和写作助手同一个：{dest?.label ?? '…'}
                <button className="btn-link" onClick={() => openDialog('ai-config')}>换模型</button>
              </span>
            </div>
            <div className="lm-line lm-line--muted">Esc 不要这一段，接着打字它就消失；源码模式不续写</div>
          </div>
        </div>
        <footer className="modal-footer">
          <LiveSettingsNote className="hint history-modal__note" />
          <button onClick={onClose} className="btn btn-primary btn-wide">完成</button>
        </footer>
      </div>
    </div>
  );
};
