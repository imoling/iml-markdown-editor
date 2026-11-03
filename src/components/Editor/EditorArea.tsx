import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { useShallow } from 'zustand/react/shallow';
import { TiptapEditor } from './TiptapEditor';
import { MarkdownEditor } from './MarkdownEditor';
import { FindReplacePanel } from './FindReplacePanel';
import { StartPage } from './StartPage';
import { LinkPreview } from './LinkPreview';
import { ExternalChangeBar } from './ExternalChangeBar';

const EditorAreaImpl: React.FC = () => {
  const { mode, activeTabId, autoSave, saveActiveFile } = useAppStore(useShallow((s) => ({ mode: s.mode, activeTabId: s.activeTabId, autoSave: s.autoSave, saveActiveFile: s.saveActiveFile })));

  const handleBlur = (e: React.FocusEvent) => {
    // 如果启用了无感保存，且焦点完全离开了编辑器区域（比如点击了侧边栏），则静默存盘
    if (autoSave && !e.currentTarget.contains(e.relatedTarget as Node)) {
      saveActiveFile(false, true);
    }
  };

  return (
    <main className="editor-area editor-area--host" onBlur={handleBlur}>
      <FindReplacePanel />
      <LinkPreview />
      <ExternalChangeBar />
      <div className={`editor-content ${mode === 'word' ? 'editor-content--column' : 'editor-content--row'}`}>
        {!activeTabId ? <StartPage /> : mode === 'word' ? <TiptapEditor /> : <MarkdownEditor />}
      </div>
    </main>
  );
};

/** 不接 props，只靠自己订阅的 store 片段更新：App 因为弹窗、标签页这类事重渲染时，这一整块不跟着重画 */
export const EditorArea = React.memo(EditorAreaImpl);
