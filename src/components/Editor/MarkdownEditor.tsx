import React, { useEffect, useRef } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import { useAppStore } from '../../stores/appStore';
import { markdownToHtml } from '../../utils/markdown';
import mermaid from 'mermaid';
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

  // Handle Mermaid rendering in preview
  useEffect(() => {
    const renderMermaid = async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'loose',
          fontFamily: 'var(--font-body)',
          // @ts-ignore
          flowchart: { useMaxWidth: true, htmlLabels: true },
          // @ts-ignore
          sequence: { useMaxWidth: true },
          // @ts-ignore
          gantt: { useMaxWidth: true }
        });
        
        // Find all mermaid divs in the preview and render them
        const diagrams = document.querySelectorAll('.md-editor-preview-container .mermaid-diagram');
        if (diagrams.length > 0) {
          // Force a re-run of mermaid
          await mermaid.run({
            nodes: Array.from(diagrams) as HTMLElement[]
          });
        }
      } catch (err) {
        console.error('Mermaid rendering failed in MD preview:', err);
      }
    };

    // Use a small delay to ensure DOM is updated
    const timer = setTimeout(renderMermaid, 50);
    return () => clearTimeout(timer);
  }, [activeTab.content]);

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

  // Render markdown to HTML with static components for MD preview mode
  const previewHtml = markdownToHtml(activeTab.content, true);

  return (
    <div 
      style={{ 
        display: 'flex', 
        flex: 1, 
        height: '100%', 
        width: '100%',
        overflow: 'hidden' /* Disable global horizontal scroll */
      }}
    >
      {/* Source Code Panel */}
      <div style={{ 
        flex: '1 1 50%', 
        width: '50%',
        maxWidth: '50%',
        borderRight: '1px solid var(--border-subtle)', 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%' 
      }}>
        <div style={{ height: 44, minHeight: 44, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', padding: '0 24px' }}>
          <span style={{color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, letterSpacing: '0.02em'}}>SOURCE CODE</span>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }} className="md-editor-source">
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
      <div style={{ 
        flex: '1 1 50%', 
        width: '50%',
        maxWidth: '50%',
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%', 
        backgroundColor: 'var(--bg-surface)' 
      }}>
        <div style={{ height: 44, minHeight: 44, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', padding: '0 24px' }}>
          <span style={{color: 'var(--text-secondary)', fontWeight: 600, fontSize: 13, letterSpacing: '0.02em'}}>PREVIEW</span>
        </div>
        <div 
          className="custom-scrollbar md-editor-preview-container"
          style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', padding: '24px 40px' }}
        >
           <div 
             className="tiptap-prosemirror markdown-body" 
             style={{ minWidth: 'min-content' }}
             dangerouslySetInnerHTML={{ __html: previewHtml }} 
           />
        </div>
      </div>
    </div>
  );
};
