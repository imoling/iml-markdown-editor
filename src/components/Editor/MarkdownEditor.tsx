import React, { useEffect, useRef } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import { useAppStore } from '../../stores/appStore';
import { markdownToHtml } from '../../utils/markdown';
import '../styles/editor.css';

export const MarkdownEditor: React.FC = () => {
  const { activeTabId, tabs, updateTabContent, navigationRequest } = useAppStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  if (!activeTab) return null;

  const handleUpdate = (val: string) => {
    if (activeTabId) {
       updateTabContent(activeTabId, val);
    }
  };

  // Handle navigation requests
  useEffect(() => {
    if (editorRef.current?.view && navigationRequest) {
      const view = editorRef.current.view;
      const { id } = navigationRequest.heading;
      
      // Extract line index from ID (heading-0, heading-1, etc.)
      const match = id.match(/^heading-(\d+)$/);
      if (match) {
        const lineIndex = parseInt(match[1]);
        const lineCount = view.state.doc.lines;
        
        // Ensure line index is within bounds
        const safeLineIndex = Math.min(lineIndex + 1, lineCount);
        const line = view.state.doc.line(safeLineIndex);
        
        view.dispatch({
          selection: { head: line.from, anchor: line.from },
          effects: [EditorView.scrollIntoView(line.from, { y: 'center' })]
        });
        
        view.focus();
      }
    }
  }, [navigationRequest]);

  const domHandlers = EditorView.domEventHandlers({
    drop(event, view) {
      if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
        const file = event.dataTransfer.files[0];
        if (file.type.startsWith('image/')) {
           event.preventDefault();
           file.arrayBuffer().then(buffer => {
              window.api.fs.saveImage(activeTabId!, file.name, buffer).then(result => {
                  if (result.success && result.path) {
                      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                      if (pos !== null) {
                         view.dispatch({
                           changes: { from: pos, insert: `\n![${file.name}](${result.path})\n` }
                         });
                      }
                  }
              });
           });
           return true;
        }
      }
      return false;
    },
    paste(event, view) {
      if (event.clipboardData && event.clipboardData.files && event.clipboardData.files[0]) {
        const file = event.clipboardData.files[0];
        if (file.type.startsWith('image/')) {
           event.preventDefault();
           file.arrayBuffer().then(buffer => {
              window.api.fs.saveImage(activeTabId!, file.name, buffer).then(result => {
                  if (result.success && result.path) {
                      const { from } = view.state.selection.main;
                      view.dispatch({
                        changes: { from, insert: `\n![${file.name}](${result.path})\n` }
                      });
                  }
              });
           });
           return true;
        }
      }
      return false;
    }
  });

  const previewHtml = markdownToHtml(activeTab.content);

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', width: '100%' }}>
      {/* Source Code Panel */}
      <div style={{ flex: 1, borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ height: 44, minHeight: 44, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', padding: '0 24px' }}>
          <span style={{color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13}}>Source Code</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <CodeMirror
            ref={editorRef}
            value={activeTab.content}
            height="100%"
            theme="light"
            className="cm-theme-override"
            extensions={[markdown({ base: markdownLanguage, codeLanguages: languages }), domHandlers]}
            onChange={handleUpdate}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightActiveLine: true,
            }}
          />
        </div>
      </div>
      
      {/* Preview Panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--bg-surface)' }}>
        <div style={{ height: 44, minHeight: 44, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', padding: '0 24px' }}>
          <span style={{color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13}}>Preview</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '24px 40px' }}>
           <div 
             className="tiptap-prosemirror" 
             dangerouslySetInnerHTML={{ __html: previewHtml }} 
           />
        </div>
      </div>
    </div>
  );
};
