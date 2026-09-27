import React, { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import type { StorageState } from '../../types/window';

const isMac = window.api.app.platform === 'darwin';
const GB = 1024 ** 3;
const MB = 1024 ** 2;
export const fmtSize = (bytes: number) => (bytes >= GB ? `${(bytes / GB).toFixed(bytes >= 10 * GB ? 0 : 1)} GB` : `${Math.max(1, Math.round(bytes / MB))} MB`);

/**
 * 模型存放位置：对话 / 嵌入 / 转写 / 生图的模型和运行组件都在这个目录下。
 * 系统盘小的、想让模型跟着软件放在另一块盘上的，在这里换；换的时候已下载的会搬过去（主进程做，见 electron/modelStorage）
 */
export const StorageCard: React.FC = () => {
  const notify = useAppStore((s) => s.notify);
  const [state, setState] = useState<StorageState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    window.api.storage.getState().then((s) => { if (alive) setState(s); }).catch(() => {});
    const off = window.api.storage.onState((s) => { if (alive) setState(s); });
    return () => { alive = false; off?.(); };
  }, []);

  const change = async (target: string | null) => {
    setError(null);
    const hadFiles = (state?.usedBytes ?? 0) > 0;
    const result = await window.api.storage.change(target);
    setState(result.state);
    if (result.ok) notify(hadFiles ? '模型已搬到新位置' : '模型存放位置已更改');
    else setError(`更改失败：${result.error || '原因不明'}`);
  };
  const pick = async () => {
    const picked = await window.api.dialog.open({ properties: ['openDirectory', 'createDirectory'] });
    if (picked && picked.length > 0) await change(picked[0]);
  };

  if (!state) return null;
  const { moving } = state;
  const percent = moving && moving.totalBytes > 0 ? Math.min(100, Math.round((moving.movedBytes / moving.totalBytes) * 100)) : 0;

  return (
    <div className="lm-card" style={{ marginTop: 12 }} data-storage>
      <div className="lm-card__head">
        <div className="lm-card__title"><HardDrive size={14} /> 模型存放位置</div>
        {state.usedBytes > 0 && !moving && <span className="lm-badge lm-badge--info">已下载 {fmtSize(state.usedBytes)}</span>}
      </div>
      <div className="lm-path" title={state.path}><bdi>{state.path}</bdi></div>
      {moving ? (
        <>
          <div className="lm-progress"><div className={`lm-progress__bar ${moving.totalBytes > 0 ? '' : 'lm-progress__bar--indeterminate'}`} style={{ width: moving.totalBytes > 0 ? `${percent}%` : '100%' }} /></div>
          <div className="lm-line lm-line--muted">正在搬到新位置…{moving.totalBytes > 0 && ` ${fmtSize(moving.movedBytes)} / ${fmtSize(moving.totalBytes)}`}</div>
        </>
      ) : (
        <>
          {!state.available
            ? <div className="lm-line lm-line--error">这个位置现在打不开，接上磁盘或恢复默认</div>
            : <div className="lm-line lm-line--muted">更改时已下载的会搬过去；期间本机模型先停止</div>}
          {error && <div className="lm-line lm-line--error">{error}</div>}
          <div className="row gap-8">
            <button className="btn btn-secondary btn-sm" onClick={() => void pick()}>更改…</button>
            {!state.isDefault && <button className="btn btn-secondary btn-sm" onClick={() => void change(null)}>恢复默认</button>}
            {state.available && <button className="btn btn-ghost btn-sm" onClick={() => void window.api.storage.reveal()}>{isMac ? '在访达中显示' : '在资源管理器中显示'}</button>}
          </div>
        </>
      )}
    </div>
  );
};
