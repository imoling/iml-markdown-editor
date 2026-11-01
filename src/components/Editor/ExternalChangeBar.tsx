import React from 'react';
import { useAppStore } from '../../stores/appStore';

/** 磁盘上的文件和标签页对不上时，让用户决定留哪份。决定之前自动保存不写盘 */
export const ExternalChangeBar: React.FC = () => {
  const tab = useAppStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const saveActiveFile = useAppStore((s) => s.saveActiveFile);
  const reloadTabFromDisk = useAppStore((s) => s.reloadTabFromDisk);
  if (!tab?.externallyModified) return null;

  const missing = !!tab.diskMissing;
  return (
    <div className="external-bar" role="alert">
      <div className="external-bar__text">
        <strong>{missing ? '文件已不在原处' : '外部有新版本'}</strong>
        <span>{missing ? '不保存的话，关掉标签页内容就没了' : '自动保存已暂停；载入新版本会丢掉这边的改动'}</span>
      </div>
      {!missing && <button className="btn btn-primary btn-xs" onClick={() => void reloadTabFromDisk(tab.id)}>载入新版本</button>}
      <button className="btn btn-ghost btn-xs" onClick={() => void saveActiveFile(true)}>另存为…</button>
      <button className="btn btn-ghost btn-xs" title={missing ? undefined : '外部版本留在版本历史里'} onClick={() => void saveActiveFile()}>
        {missing ? '保存到原处' : '保留我的'}
      </button>
    </div>
  );
};
