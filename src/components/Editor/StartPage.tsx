import React, { useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Plus, FolderOpen, FileText, Settings, Clock, Star, CalendarDays, Wand2, ChevronRight } from 'lucide-react';
import { formatVersion } from '../../utils/version';
import { useAiReadiness } from '../../utils/aiReadiness';

const isMac = window.api.app.platform === 'darwin';
/** 快捷键按平台写：mac 用符号，别的平台用 Ctrl+ */
const key = (mac: string, other: string) => (isMac ? mac : other);

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

const ActionButton: React.FC<{ icon: React.ComponentType<any>; label: string; hotkey: string; onClick: () => void }> = ({ icon: Icon, label, hotkey, onClick }) => (
  <div onClick={onClick} className="start-page-action">
    <div className="start-page-action__icon"><Icon size={24} strokeWidth={1.5} /></div>
    <div className="text-center">
      <div className="start-page-action__label">{label}</div>
      <div className="start-page-action__hotkey">{hotkey}</div>
    </div>
  </div>
);

const FileList: React.FC<{ paths: string[]; icon: React.ReactNode; empty: string; onOpen: (p: string) => void }> = ({ paths, icon, empty, onOpen }) =>
  paths.length > 0 ? (
    <div className="col gap-4">
      {paths.slice(0, 5).map((path) => (
        <div key={path} className="start-page-list-item" onClick={() => onOpen(path)} title={path}>
          {icon}
          <span className="truncate flex-1">{path.split(/[/\\]/).pop()}</span>
        </div>
      ))}
    </div>
  ) : (
    <div className="start-card__empty">{empty}</div>
  );

/** 无文档打开时的启动页 */
export const StartPage: React.FC = () => {
  const { createNewFile, openDirectory, openFile, recentFiles, starredFiles, openFileByPath, openDailyNote, openDialog } = useAppStore();
  const [timeGreeting] = useState(greetingForNow);
  // AI 没配好时在这里递一句 —— 配好了就不再出现，不打扰老用户
  const aiEnabled = useAppStore((s) => s.aiEnabled);
  const readiness = useAiReadiness(aiEnabled);

  return (
    <div className="start-page">
      <div className="start-page__blob start-page__blob--tl" />
      <div className="start-page__blob start-page__blob--br" />

      <div className="start-page__inner">
        <div className="text-center mb-48">
          <h1 className="start-page__title">
            {timeGreeting}，欢迎来到 <span className="start-page__brand">iML Markdown Editor</span>
          </h1>
          <p className="start-page__subtitle">
            <span><span className="text-brand fw-600">本机智能</span>，笔记不出门</span>
            <span className="start-page__version">v{formatVersion(window.api.appVersion)}</span>
          </p>
        </div>

        <div className="start-page__actions">
          <ActionButton icon={Plus} label="新建笔记" hotkey={key('⌘N', 'Ctrl+N')} onClick={createNewFile} />
          <ActionButton icon={CalendarDays} label="今日日记" hotkey={key('⇧⌘D', 'Ctrl+Shift+D')} onClick={openDailyNote} />
          <ActionButton icon={FolderOpen} label="切换笔记库" hotkey={key('⇧⌘O', 'Ctrl+Shift+O')} onClick={openDirectory} />
          <ActionButton icon={FileText} label="打开文件" hotkey={key('⌘O', 'Ctrl+O')} onClick={openFile} />
          <ActionButton icon={Settings} label="设置" hotkey={key('⌘,', 'Ctrl+,')} onClick={() => openDialog('settings')} />
        </div>

        {!readiness.ready && readiness.blocker !== 'disabled' && (
          <button className="start-page__ai-hint" onClick={() => openDialog('ai-setup')}>
            <Wand2 size={16} />
            <span><strong>还没配过 AI</strong> 本机模型免费离线，Agnes 有免费额度</span>
            <ChevronRight size={16} />
          </button>
        )}

        <div className="start-page__cards">
          <div className="start-card">
            <div className="start-card__title"><Clock size={16} /> <span>最近打开</span></div>
            <FileList paths={recentFiles} icon={<FileText size={14} color="var(--text-muted)" />} empty="还没有打开过的笔记" onOpen={openFileByPath} />
          </div>
          <div className="start-card">
            <div className="start-card__title"><Star size={16} color="#f59e0b" fill="#f59e0b" /> <span>收藏</span></div>
            <FileList paths={starredFiles} icon={<Star size={14} color="#f59e0b" />} empty="在笔记库里点一下笔记旁的星星就能收藏" onOpen={openFileByPath} />
          </div>
        </div>
      </div>
    </div>
  );
};
