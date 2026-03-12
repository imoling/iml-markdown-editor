import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { all, createLowlight } from 'lowlight';
import { 
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Sigma, 
  Table as TableIcon, Image as ImageIcon, Plus, Trash2, Columns, Rows,
  Type, ListOrdered, List, SquareCheck, Quote, Minus, Link as LinkIcon
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { markdownToHtml, htmlToMarkdown } from '../../utils/markdown';
import { MathExtension } from '../../extensions/MathExtension';
import { Editor } from '@tiptap/core';
import '../styles/editor.css';

const lowlight = createLowlight(all);

interface PromptDialogProps {
  title: string;
  fields: { name: string; label: string; defaultValue: string; type?: string }[];
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}

const PromptDialog: React.FC<PromptDialogProps> = ({ title, fields, onConfirm, onCancel }) => {
  const [values, setValues] = React.useState<Record<string, string>>(
    fields.reduce((acc, f) => ({ ...acc, [f.name]: f.defaultValue }), {})
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.2)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-page)',
        padding: '24px',
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2), 0 0 0 1px var(--border-subtle)',
        width: '320px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{title}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.map(field => (
            <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{field.label}</label>
              <input
                type={field.type || 'text'}
                autoFocus={fields[0].name === field.name}
                value={values[field.name]}
                onChange={e => setValues({ ...values, [field.name]: e.target.value })}
                onKeyDown={e => {
                  if (e.key === 'Enter') onConfirm(values);
                  if (e.key === 'Escape') onCancel();
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-strong)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontSize: 14
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button 
            onClick={onCancel}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
              backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
              fontSize: 14, fontWeight: 500
            }}
          >取消</button>
          <button 
            onClick={() => onConfirm(values)}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
              backgroundColor: 'var(--color-accent-indigo)', color: 'white', cursor: 'pointer',
              fontSize: 14, fontWeight: 500
            }}
          >确定</button>
        </div>
      </div>
    </div>
  );
};

export const TiptapEditor: React.FC = () => {
  const { activeTabId, tabs, updateTabContent, navigationRequest } = useAppStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  const [prompt, setPrompt] = React.useState<PromptDialogProps | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // Use lowlight instead
      }), 
      Image, 
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      CodeBlockLowlight.configure({
        lowlight,
      }),
      MathExtension,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Placeholder.configure({
        placeholder: '在此开始你的写作...',
      })
    ],
    content: activeTab ? markdownToHtml(activeTab.content) : '',
    editorProps: {
      attributes: {
        class: 'tiptap-prosemirror',
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
             event.preventDefault();
             file.arrayBuffer().then(buffer => {
                window.api.fs.saveImage(activeTabId!, file.name, buffer).then(result => {
                    if (result.success && result.path) {
                        const { schema } = view.state;
                        const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                        const node = schema.nodes.image.create({ src: result.path });
                        const transaction = view.state.tr.insert(coordinates?.pos || view.state.selection.to, node);
                        view.dispatch(transaction);
                    }
                });
             });
             return true;
          }
        }
        return false;
      },
      handlePaste: (view, event, slice) => {
        if (event.clipboardData && event.clipboardData.files && event.clipboardData.files[0]) {
          const file = event.clipboardData.files[0];
          if (file.type.startsWith('image/')) {
             event.preventDefault();
             file.arrayBuffer().then(buffer => {
                window.api.fs.saveImage(activeTabId!, file.name, buffer).then(result => {
                    if (result.success && result.path) {
                        const { schema } = view.state;
                        const node = schema.nodes.image.create({ src: result.path });
                        const transaction = view.state.tr.replaceSelectionWith(node);
                        view.dispatch(transaction);
                    }
                });
             });
             return true;
          }
        }
        return false;
      }
    },
    onUpdate: ({ editor }) => {
      if (activeTabId) {
        const html = editor.getHTML();
        const markdown = htmlToMarkdown(html);
        updateTabContent(activeTabId, markdown);
      }
    },
  });

  useEffect(() => {
    if (editor && activeTab) {
      const currentHtml = editor.getHTML();
      const newHtml = markdownToHtml(activeTab.content);
      if (currentHtml !== newHtml && htmlToMarkdown(currentHtml) !== activeTab.content) {
         editor.commands.setContent(newHtml);
      }
    } else if (editor && !activeTab) {
      editor.commands.setContent('');
    }
  }, [activeTabId, editor]);

  // Handle navigation requests
  useEffect(() => {
    if (editor && navigationRequest) {
      const { heading } = navigationRequest;
      let foundPos = -1;
      
      editor.state.doc.descendants((node, pos) => {
        if (foundPos !== -1) return false;
        if (node.type.name === 'heading' && node.attrs.level === heading.level && node.textContent === heading.text) {
          foundPos = pos;
          return false;
        }
        return true;
      });

      if (foundPos !== -1) {
        editor.commands.focus(foundPos);
        
        // Scroll to the element
        const element = editor.view.nodeDOM(foundPos) as HTMLElement;
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [editor, navigationRequest]);

  if (!editor || !activeTab) {
    return (
      <div style={{ padding: 40, color: 'var(--text-muted)' }}>
        未打开任何文档，请按 Cmd+O 打开文件。
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Format Toolbar */}
      <div className="tiptap-toolbar" style={{ 
        display: 'flex', 
        height: 48, 
        minHeight: 48,
        borderBottom: '1px solid var(--border-subtle)',
        alignItems: 'center',
        padding: '0 20px',
        gap: 8,
        backgroundColor: 'var(--bg-page)',
        WebkitAppRegion: 'no-drag',
        pointerEvents: 'auto'
      } as React.CSSProperties}>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('paragraph') ? 'active' : ''}`} onClick={() => editor.chain().focus().setParagraph().run()} title="正文"><Type size={16} /></button>
          <button type="button" className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</button>
          <button type="button" className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
          <button type="button" className={`toolbar-btn ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</button>
        </div>
        
        <div className="toolbar-divider"></div>
        
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('bold') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('italic') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('underline') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleUnderline().run()}><UnderlineIcon size={16} /></button>
        </div>
        
        <div className="toolbar-divider"></div>
        
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('orderedList') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="有序列表"><ListOrdered size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('bulletList') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()} title="无序列表"><List size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('taskList') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleTaskList().run()} title="任务列表"><SquareCheck size={16} /></button>
        </div>
        
        <div className="toolbar-divider"></div>
        
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('codeBlock') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="代码块"><Code size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('blockquote') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="引用"><Quote size={16} /></button>
          <button type="button" className={`toolbar-icon-btn`} style={{ opacity: 0.4, cursor: 'not-allowed' }} title="数学公式 (下个版本修复)"><Sigma size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('table') ? 'active' : ''}`} onClick={() => {
            setPrompt({
              title: '插入表格',
              fields: [
                { name: 'rows', label: '行数', defaultValue: '3', type: 'number' },
                { name: 'cols', label: '列数', defaultValue: '3', type: 'number' }
              ],
              onConfirm: (values) => {
                const rows = parseInt(values.rows);
                const cols = parseInt(values.cols);
                if (rows > 0 && cols > 0) {
                  editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
                }
                setPrompt(null);
              },
              onCancel: () => setPrompt(null)
            });
          }} title="插入表格"><TableIcon size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('link') ? 'active' : ''}`} onClick={() => {
            setPrompt({
              title: '插入链接',
              fields: [{ name: 'url', label: '链接地址 (URL)', defaultValue: editor.getAttributes('link').href || '' }],
              onConfirm: (values) => {
                const url = values.url;
                if (url) {
                  if (editor.state.selection.empty) {
                    editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
                  } else {
                    editor.chain().focus().setLink({ href: url }).run();
                  }
                } else {
                  editor.chain().focus().unsetLink().run();
                }
                setPrompt(null);
              },
              onCancel: () => setPrompt(null)
            });
          }} title="插入链接"><LinkIcon size={16} /></button>
          <button type="button" className="toolbar-icon-btn" onClick={() => alert('请直接将图片拖拽至编辑器内')} title="插入图片"><ImageIcon size={16} /></button>
        </div>

        { (editor.isActive('table') || editor.isActive('tableCell') || editor.isActive('tableHeader')) && (
          <>
            <div className="toolbar-divider"></div>
            <div style={{ display: 'flex', gap: 2 }}>
               <button type="button" className="toolbar-icon-btn" onClick={() => editor.chain().focus().addColumnAfter().run()} title="在右侧插入列"><Columns size={14} /><Plus size={8} style={{marginLeft: -4, marginTop: -8}} /></button>
                <button type="button" className="toolbar-icon-btn" onClick={() => {
                   if (!editor.chain().focus().deleteColumn().run()) {
                     editor.chain().focus().deleteTable().run();
                   }
                }} title="删除当前列"><Columns size={14} style={{opacity: 0.5}} /><Minus size={8} style={{marginLeft: -4, marginTop: -8, color: 'var(--color-accent-red)'}} /></button>
               <div style={{width: 1, height: 12, backgroundColor: 'var(--border-subtle)', margin: '0 2px'}}></div>
               <button type="button" className="toolbar-icon-btn" onClick={() => editor.chain().focus().addRowAfter().run()} title="在下方插入行"><Rows size={14} /><Plus size={8} style={{marginLeft: -4, marginTop: -8}} /></button>
                <button type="button" className="toolbar-icon-btn" onClick={() => {
                   if (!editor.chain().focus().deleteRow().run()) {
                     editor.chain().focus().deleteTable().run();
                   }
                }} title="删除当前行"><Rows size={14} style={{opacity: 0.5}} /><Minus size={8} style={{marginLeft: -4, marginTop: -8, color: 'var(--color-accent-red)'}} /></button>
               <div style={{width: 1, height: 12, backgroundColor: 'var(--border-subtle)', margin: '0 2px'}}></div>
                <button type="button" className="toolbar-icon-btn" onClick={() => editor.chain().focus().deleteTable().focus().run()} title="删除整个表格"><Trash2 size={14} color="var(--color-accent-red)" /></button>
            </div>
          </>
        )}
      </div>

      <div className="tiptap-container" style={{ flex: 1, overflowY: 'auto', padding: '40px 80px' }}>
        {prompt && <PromptDialog {...prompt} />}
        {editor && (
          <BubbleMenu 
            editor={editor} 
            shouldShow={({ editor }: { editor: Editor }) => {
              return editor.isActive('bold') || editor.isActive('italic') || editor.isActive('underline');
            }}
          >
            <div className="bubble-menu" style={{ 
              display: 'flex', 
              backgroundColor: 'var(--bg-elevated)', 
              padding: '4px', 
              borderRadius: '8px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              border: '1px solid var(--border-subtle)',
              gap: 4
            }}>
              <button onClick={() => editor.chain().focus().toggleBold().run()} className={`toolbar-icon-btn ${editor.isActive('bold') ? 'active' : ''}`}><Bold size={12} /></button>
              <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`toolbar-icon-btn ${editor.isActive('italic') ? 'active' : ''}`}><Italic size={12} /></button>
              <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`toolbar-icon-btn ${editor.isActive('underline') ? 'active' : ''}`}><UnderlineIcon size={12} /></button>
            </div>
          </BubbleMenu>
        )}

        {editor && (
          <FloatingMenu 
            editor={editor}
            options={{ 
              offset: 20,
              placement: 'bottom-start'
            }}
            shouldShow={({ state, editor }) => {
              const { selection } = state;
              const { $from } = selection;
              
              if ($from.parent.type.name === 'paragraph' && $from.parent.content.size === 0) {
                return true;
              }
              
              if (editor.isActive('table') || editor.isActive('tableCell') || editor.isActive('tableHeader')) {
                return true;
              }
              
              return false;
            }}
          >
             <div className="floating-menu" style={{ 
               display: 'flex', 
               flexDirection: 'column',
               backgroundColor: 'var(--bg-elevated)', 
               padding: '12px', 
               borderRadius: '12px', 
               boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
               border: '1px solid var(--border-subtle)',
               gap: 12,
               width: 'fit-content'
             }}>
               <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => editor.chain().focus().setParagraph().run()} className={`toolbar-icon-btn ${editor.isActive('paragraph') ? 'active' : ''}`} title="正文"><Type size={18} /></button>
                  <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`}>H1</button>
                  <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`}>H2</button>
                  <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={`toolbar-btn ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`}>H3</button>
                  <div className="toolbar-divider" style={{ margin: '0 4px' }}></div>
                  <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`toolbar-icon-btn ${editor.isActive('orderedList') ? 'active' : ''}`} title="有序列表"><ListOrdered size={18} /></button>
                  <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`toolbar-icon-btn ${editor.isActive('bulletList') ? 'active' : ''}`} title="无序列表"><List size={18} /></button>
               </div>
               <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={`toolbar-icon-btn ${editor.isActive('taskList') ? 'active' : ''}`} title="任务列表"><SquareCheck size={18} /></button>
                  <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={`toolbar-icon-btn ${editor.isActive('codeBlock') ? 'active' : ''}`} title="代码块"><Code size={18} /></button>
                  <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`toolbar-icon-btn ${editor.isActive('blockquote') ? 'active' : ''}`} title="引用"><Quote size={18} /></button>
                  <button onClick={() => editor.chain().focus().setHorizontalRule().run()} className="toolbar-icon-btn" title="分割线"><Minus size={18} /></button>
                  <button onClick={() => {
                    setPrompt({
                      title: '编辑链接',
                      fields: [{ name: 'url', label: '链接地址 (URL)', defaultValue: editor.getAttributes('link').href || '' }],
                      onConfirm: (values) => {
                        const url = values.url;
                        if (url) {
                          if (editor.state.selection.empty) {
                            editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
                          } else {
                            editor.chain().focus().setLink({ href: url }).run();
                          }
                        } else {
                          editor.chain().focus().unsetLink().run();
                        }
                        setPrompt(null);
                      },
                      onCancel: () => setPrompt(null)
                    });
                  }} className={`toolbar-icon-btn ${editor.isActive('link') ? 'active' : ''}`} title="插入链接"><LinkIcon size={18} /></button>
               </div>

                { (editor.isActive('table') || editor.isActive('tableCell') || editor.isActive('tableHeader')) && (
                  <>
                    <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0 -4px' }}></div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                       <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} className="toolbar-icon-btn" title="在右侧插入列"><Columns size={16} /><Plus size={8} style={{marginLeft: -4, marginTop: -8}} /></button>
                       <button type="button" onClick={() => {
                         if (!editor.chain().focus().deleteColumn().run()) {
                           editor.chain().focus().deleteTable().run();
                         }
                       }} className="toolbar-icon-btn" title="删除当前列"><Columns size={16} style={{opacity: 0.5}} /><Minus size={8} style={{marginLeft: -4, marginTop: -8, color: 'var(--color-accent-red)'}} /></button>
                       <div className="toolbar-divider" style={{height: 16}}></div>
                       <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} className="toolbar-icon-btn" title="在下方插入行"><Rows size={16} /><Plus size={8} style={{marginLeft: -4, marginTop: -8}} /></button>
                       <button type="button" onClick={() => {
                         if (!editor.chain().focus().deleteRow().run()) {
                           editor.chain().focus().deleteTable().run();
                         }
                       }} className="toolbar-icon-btn" title="删除当前行"><Rows size={16} style={{opacity: 0.5}} /><Minus size={8} style={{marginLeft: -4, marginTop: -8, color: 'var(--color-accent-red)'}} /></button>
                       <div className="toolbar-divider" style={{height: 16}}></div>
                       <button type="button" onClick={() => editor.chain().focus().deleteTable().focus().run()} className="toolbar-btn" style={{ color: 'var(--color-accent-red)', gap: 4 }}>
                         <Trash2 size={16} />
                         <span>删除表格</span>
                       </button>
                    </div>
                  </>
                )}
             </div>
          </FloatingMenu>
        )}

        <EditorContent editor={editor} />
      </div>
    </div>
  );
};
