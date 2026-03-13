import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { TiptapEditor } from './TiptapEditor';
import { MarkdownEditor } from './MarkdownEditor';
import { FindReplacePanel } from './FindReplacePanel';

export const EditorArea: React.FC = () => {
  const { mode, activeTabId, createNewFile } = useAppStore();

  const renderContent = () => {
    if (!activeTabId) {
      return (
        <div 
          onDoubleClick={createNewFile}
          style={{ 
            flex: 1, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: 'var(--text-muted)',
            cursor: 'default',
            userSelect: 'none',
            height: '100%'
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '15px' }}>未打开任何文档，请按 Cmd+O 打开文件。</p>
            <p style={{ margin: 0, fontSize: '12px', opacity: 0.6 }}>或双击此处新建文档</p>
          </div>
        </div>
      );
    }

    return mode === 'word' ? <TiptapEditor /> : <MarkdownEditor />;
  };

  return (
    <main className="editor-area" style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, height: '100%' }}>
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
