import React, { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { toAccelerator, displayAccelerator } from '../../../electron/shared/capture';

export interface QuickCaptureValue { enabled: boolean; shortcut: string }

interface Props {
  value: QuickCaptureValue;
  onChange: (value: QuickCaptureValue) => void;
}

/**
 * 设置里的「快速捕获」：开关 + 录一个全局快捷键 + 试一下。
 * 全局快捷键可能被别的应用占着注册不上，这种事得如实告诉用户，不能装作生效了。
 */
export const QuickCaptureRow: React.FC<Props> = ({ value, onChange }) => {
  const isMac = window.api.app.platform === 'darwin';
  const [saved, setSaved] = useState<{ enabled: boolean; shortcut: string; registered: boolean } | null>(null);
  const [recording, setRecording] = useState(false);
  const [rejected, setRejected] = useState(false);

  useEffect(() => { window.api.capture.status().then(setSaved).catch(() => setSaved(null)); }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation(); // Esc 是「不录了」，别把整个设置窗口关掉
    if (e.key === 'Escape') { setRecording(false); setRejected(false); return; }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return; // 还在按修饰键，等主键
    const accelerator = toAccelerator(e);
    if (!accelerator) { setRejected(true); return; }
    setRejected(false);
    setRecording(false);
    onChange({ ...value, shortcut: accelerator });
  };

  const unchanged = !!saved && saved.enabled === value.enabled && saved.shortcut === value.shortcut;
  const status = !value.enabled ? ''
    : rejected ? `要带上 ${isMac ? '⌃ / ⌥ / ⌘' : 'Ctrl / Alt'} 之一，再加一个字母、数字或 F 键`
    : recording ? '按下新的快捷键… Esc 取消'
    : !unchanged ? '保存后生效'
    : saved!.registered ? '已生效：在任何软件里按它，弹出输入框'
    : '没注册上：这个组合多半被别的应用占了，换一个试试';
  const warn = rejected || (value.enabled && unchanged && !recording && !saved!.registered);

  return (
    <>
      <div className="settings-row">
        <div className="settings-row__label">
          <Zap size={18} color="var(--text-muted)" />
          <div>
            <div className="settings-row__title">快速捕获</div>
            <div className="settings-row__desc">在任何软件里按快捷键弹出小输入框，回车就存进今天的日记</div>
          </div>
        </div>
        <label className={`toggle ${value.enabled ? 'toggle--on' : ''}`}>
          <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} />
          <span className="toggle__track"><span className="toggle__thumb" /></span>
        </label>
      </div>
      {value.enabled && (
        <div className="quick-capture-row">
          <button
            className={`quick-capture-row__keys ${recording ? 'quick-capture-row__keys--recording' : ''}`}
            onClick={() => { setRecording(true); setRejected(false); }}
            onKeyDown={onKeyDown}
            onBlur={() => { setRecording(false); setRejected(false); }}
            title="点一下，然后按下新的快捷键"
          >
            {recording ? '…' : displayAccelerator(value.shortcut, isMac)}
          </button>
          <span className={`quick-capture-row__status ${warn ? 'quick-capture-row__status--warn' : ''}`}>{status}</span>
          {unchanged && saved!.registered && <button className="btn btn-ghost btn-xs" onClick={() => void window.api.capture.show()}>试一下</button>}
        </div>
      )}
    </>
  );
};
