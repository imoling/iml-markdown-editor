import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { TiptapEditor } from './TiptapEditor';
import { MarkdownEditor } from './MarkdownEditor';
import { FindReplacePanel } from './FindReplacePanel';

export const EditorArea: React.FC = () => {
  const { mode } = useAppStore();

  return (
    <main className="editor-area" style={{ position: 'relative' }}>
      <FindReplacePanel />
      <div className="editor-content" style={{
        flex: 1,
        padding: '0',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: mode === 'word' ? 'column' : 'row'
      }}>
        {mode === 'word' ? (
          <TiptapEditor />
        ) : (
          <MarkdownEditor />
        )}
      </div>
    </main>
  );
};
