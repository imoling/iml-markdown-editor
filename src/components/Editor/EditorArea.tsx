import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { TiptapEditor } from './TiptapEditor';
import { MarkdownEditor } from './MarkdownEditor';
import { FindReplacePanel } from './FindReplacePanel';
import { StartPage } from './StartPage';
import { LinkPreview } from './LinkPreview';
import { ExternalChangeBar } from './ExternalChangeBar';

export const EditorArea: React.FC = () => {
  const { mode, activeTabId, autoSave, saveActiveFile } = useAppStore();

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
