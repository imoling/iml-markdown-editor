import React, { useEffect, useState } from 'react';
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
  Type, ListOrdered, List, SquareCheck, Quote, Minus, Link as LinkIcon,
  Sparkles, Wand2, FileText, FastForward, Loader2
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { markdownToHtml, htmlToMarkdown } from '../../utils/markdown';
import { MathExtension } from '../../extensions/MathExtension';
import { Editor } from '@tiptap/core';
import { useAI } from '../../hooks/useAI';
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

interface StyleSelectorProps {
  onSelect: (style: string) => void;
  onCancel: () => void;
}

const StyleSelector: React.FC<StyleSelectorProps> = ({ onSelect, onCancel }) => {
  const styles = [
    { id: 'professional', label: '专业 (Professional)', desc: '正式、稳重，适合文档和汇报', color: 'var(--color-accent-indigo)' },
    { id: 'literary', label: '文学 (Literary)', desc: '优美、感性，适合随感和创作', color: 'var(--color-accent-green)' },
    { id: 'concise', label: '简洁 (Concise)', desc: '精炼、直接，拒绝冗余', color: 'var(--color-accent-orange)' },
    { id: 'humorous', label: '幽默 (Humorous)', desc: '风趣、亲和，适合社交分享', color: 'var(--color-accent-red)' }
  ];

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
      animation: 'fadeIn 0.15s ease-out'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-page)',
        padding: '20px',
        borderRadius: '20px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.3), 0 0 0 1px var(--border-subtle)',
        width: '360px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>选择润色风格</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
            <Trash2 size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {styles.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
                gap: 2
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                e.currentTarget.style.borderColor = s.color;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: s.color }}>{s.label}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const TiptapEditor: React.FC = () => {
  const { activeTabId, tabs, updateTabContent, navigationRequest, setStreamingCallback } = useAppStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  const [prompt, setPrompt] = React.useState<PromptDialogProps | null>(null);
  const { generate, loading: aiLoading } = useAI();
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showStyleSelector, setShowStyleSelector] = React.useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, 
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

  // Register AI streaming callback for in-place generation
  useEffect(() => {
    if (editor) {
      setStreamingCallback((chunk: string) => {
        editor.chain().focus().insertContent(chunk).run();
      });
      return () => setStreamingCallback(null);
    }
  }, [editor, setStreamingCallback]);

  const handleAIAction = async (action: 'polish' | 'summarize' | 'expand', style?: string) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (!selectedText) return;

    if (action === 'polish' && !style) {
      setShowStyleSelector(true);
      return;
    }

    setShowStyleSelector(false);
    setAiGenerating(true);
    
    let systemPrompt = `您是一位卓越的文档编辑专家。
您的任务是根据用户的要求处理文本。
关键规则：
1. 仅返回处理后的正文结果。
2. 严禁包含任何前言、引言、解释说明、括号内的备注或修改日志。
3. 严禁包含任何如“好的，这是为您处理后的结果”之类的废话。
4. 如果用户要求润色，请直接给出润色后的文本。
5. 对于总结任务，请直接给出总结正文，不可包含“总结如下”等任何辅助性标签。`;

    let userPrompt = '';

    if (action === 'polish') {
      const stylePrompts: Record<string, string> = {
        professional: '使其更专业、稳重、正式，适合商务汇报。',
        literary: '使其更具文学美感、意蕴悠长，适合散文随感。',
        concise: '使其极其精炼、有力，剔除所有冗余词汇。',
        humorous: '使其风趣幽默、诙谐亲和，增加社交感染力。'
      };
      userPrompt = `请对以下文字进行【${style || '专业'}】风格的润色，${stylePrompts[style || 'professional']}\n\n文字内容：\n"${selectedText}"`;
    } else if (action === 'summarize') {
      userPrompt = `请为以下内容提供一个精炼、深度的总结：\n\n"${selectedText}"`;
    } else if (action === 'expand') {
      userPrompt = `请在保持文风一致的前提下，对以下内容进行深度扩写，增加细节：\n\n"${selectedText}"`;
    }

    try {
      const result = await generate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]);
      
      if (result) {
        // Double check to strip any leading/trailing common phrases just in case
        const cleanResult = result.replace(/^(.*?)(如下[:：]|结果[:：]|总结[:：]|内容[:：])|^\s*|[\s\n]*$/gi, '').trim();
        
        // Both polish and summarize now replace the selection directly
        editor.chain().focus().insertContentAt({ from, to }, cleanResult).run();
      }
    } catch (err: any) {
      console.error('AI Action Failed:', err);
    } finally {
      setAiGenerating(false);
    }
  };

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
  }, [activeTabId, editor, activeTab?.content]);

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
        const element = editor.view.nodeDOM(foundPos) as HTMLElement;
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [editor, navigationRequest]);

  if (!editor) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'relative' }}>
      {aiGenerating && (
        <div style={{ 
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
          backgroundColor: 'rgba(255, 255, 255, 0.4)', 
          backdropFilter: 'blur(4px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, gap: 12
        }}>
          <Loader2 size={32} className="animate-spin" color="var(--color-accent-indigo)" />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-main)' }}>AI 正在构思中...</span>
        </div>
      )}

      {/* Format Toolbar */}
      <div className="tiptap-toolbar" style={{ 
        display: 'flex', height: 48, minHeight: 48,
        borderBottom: '1px solid var(--border-subtle)',
        alignItems: 'center', padding: '0 20px', gap: 8,
        backgroundColor: 'var(--bg-page)', WebkitAppRegion: 'no-drag',
        pointerEvents: 'auto'
      } as React.CSSProperties}>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('paragraph') ? 'active' : ''}`} onClick={() => editor.chain().focus().setParagraph().run()} title="正文"><Type size={16} /></button>
          <button type="button" className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="标题 1">H1</button>
          <button type="button" className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="标题 2">H2</button>
          <button type="button" className={`toolbar-btn ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="标题 3">H3</button>
        </div>
        <div className="toolbar-divider"></div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('bold') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()} title="加粗"><Bold size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('italic') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()} title="倾斜"><Italic size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('underline') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleUnderline().run()} title="下划线"><UnderlineIcon size={16} /></button>
        </div>
        <div className="toolbar-divider"></div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('orderedList') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="有序列表"><ListOrdered size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('bulletList') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()} title="无序列表"><List size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('taskList') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleTaskList().run()} title="任务列表"><SquareCheck size={16} /></button>
        </div>
        <div className="toolbar-divider"></div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('code') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleCode().run()} title="行内代码"><Code size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('blockquote') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="引用"><Quote size={16} /></button>
          <button type="button" className={`toolbar-icon-btn`} onClick={() => editor.chain().focus().insertContent('$x = y^2$').run()} title="数学公式"><Sigma size={16} /></button>
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
          <button type="button" className="toolbar-icon-btn" onClick={() => {
            setPrompt({
              title: '插入图片',
              fields: [{ name: 'url', label: '图片链接 (URL)', defaultValue: '' }],
              onConfirm: (values) => {
                const url = values.url;
                if (url) {
                  editor.chain().focus().setImage({ src: url }).run();
                }
                setPrompt(null);
              },
              onCancel: () => setPrompt(null)
            });
          }} title="插入图片"><ImageIcon size={16} /></button>
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
        </div>
      </div>

      <div className="tiptap-container">
        {prompt && <PromptDialog {...prompt} />}
        {showStyleSelector && (
          <StyleSelector 
            onSelect={(style) => handleAIAction('polish', style)} 
            onCancel={() => setShowStyleSelector(false)} 
          />
        )}
        
        <div className="tiptap-page" onClick={() => editor.chain().focus().run()}>
          {editor && (
            <BubbleMenu 
              editor={editor} 
              shouldShow={({ state }) => !state.selection.empty}
            >
              <div className="bubble-menu" style={{ 
                display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-elevated)', 
                padding: '8px', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                border: '1px solid var(--border-subtle)', gap: 8, minWidth: 'max-content'
              }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                  <button onClick={() => editor.chain().focus().setParagraph().run()} className={`toolbar-icon-btn ${editor.isActive('paragraph') ? 'active' : ''}`} title="正文"><Type size={16} /></button>
                  <div className="toolbar-divider"></div>
                  <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`} title="标题 1">H1</button>
                  <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`} title="标题 2">H2</button>
                  <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={`toolbar-btn ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`} title="标题 3">H3</button>
                  <div className="toolbar-divider"></div>
                  <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`toolbar-icon-btn ${editor.isActive('bulletList') ? 'active' : ''}`} title="无序列表"><List size={16} /></button>
                  <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`toolbar-icon-btn ${editor.isActive('orderedList') ? 'active' : ''}`} title="有序列表"><ListOrdered size={16} /></button>
                  <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={`toolbar-icon-btn ${editor.isActive('taskList') ? 'active' : ''}`} title="任务列表"><SquareCheck size={16} /></button>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                  <button onClick={() => editor.chain().focus().toggleBold().run()} className={`toolbar-icon-btn ${editor.isActive('bold') ? 'active' : ''}`} title="加粗"><Bold size={16} /></button>
                  <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`toolbar-icon-btn ${editor.isActive('italic') ? 'active' : ''}`} title="倾斜"><Italic size={16} /></button>
                  <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`toolbar-icon-btn ${editor.isActive('underline') ? 'active' : ''}`} title="下划线"><UnderlineIcon size={16} /></button>
                  <button onClick={() => editor.chain().focus().toggleCode().run()} className={`toolbar-icon-btn ${editor.isActive('code') ? 'active' : ''}`} title="行内代码"><Code size={16} /></button>
                  <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`toolbar-icon-btn ${editor.isActive('blockquote') ? 'active' : ''}`} title="引用"><Quote size={16} /></button>
                  <div className="toolbar-divider"></div>
                  <button onClick={() => handleAIAction('polish')} className="toolbar-icon-btn" title="AI 润色" disabled={aiGenerating}><Wand2 size={16} color="var(--color-accent-indigo)" /></button>
                  <button onClick={() => handleAIAction('summarize')} className="toolbar-icon-btn" title="AI 总结" disabled={aiGenerating}><FileText size={16} color="var(--color-accent-green)" /></button>
                  <button onClick={() => handleAIAction('expand')} className="toolbar-icon-btn" title="AI 扩写" disabled={aiGenerating}><Sparkles size={16} color="var(--color-accent-orange)" /></button>
                </div>
              </div>
            </BubbleMenu>
          )}

          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
};
