import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { TiptapEditor } from './TiptapEditor';
import { MarkdownEditor } from './MarkdownEditor';
import { FindReplacePanel } from './FindReplacePanel';
import { StartPage } from './StartPage';

export const EditorArea: React.FC = () => {
  const { mode, activeTabId, autoSave, saveActiveFile } = useAppStore();

  const handleBlur = (e: React.FocusEvent) => {
    // 如果启用了无感保存，且焦点完全离开了编辑器区域（比如点击了侧边栏），则静默存盘
    if (autoSave && !e.currentTarget.contains(e.relatedTarget as Node)) {
      saveActiveFile(false, true);
    }
  };

  const renderContent = () => {
    if (!activeTabId) {
      return <StartPage />;
    }

    return mode === 'word' ? <TiptapEditor /> : <MarkdownEditor />;
  };

  return (
    <main 
      className="editor-area" 
      style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, height: '100%' }}
      onBlur={handleBlur}
    >
      <FindReplacePanel />
      <div className="editor-content" style={{
        flex: 1,
        padding: '0',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: mode === 'word' ? 'column' : 'row',
        height: '100%'
      }}>
        {renderContent()}
      </div>
    </main>
  );
};
