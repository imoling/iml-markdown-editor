import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { DOMSerializer } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { all, createLowlight } from 'lowlight';
import { 
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Sigma, 
  Table as TableIcon, Image as ImageIcon, Plus, Trash2, Columns, Rows,
  Type, ListOrdered, List, SquareCheck, Quote, Minus, Link as LinkIcon,
  Sparkles, Wand2, FileText, FastForward, Loader2, BrainCircuit
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { markdownToHtml, htmlToMarkdown } from '../../utils/markdown';
import { MathExtension } from '../../extensions/MathExtension';
import { DiagramExtension } from '../../extensions/DiagramExtension';
import { SVGExtension } from '../../extensions/SVGExtension';
import { Editor } from '@tiptap/core';
import { useAI } from '../../hooks/useAI';
import { AIPalette } from '../AI/AIPalette';
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

/**
 * 对 Markdown 中同级别的编号标题/条目进行重新排序。
 * 支持多种格式：
 *   - "### 1. 标题"（ATX标题 + 编号）
 *   - "1. 标题"（纯编号行，非列表上下文）
 *   - "**1. 标题**"（加粗编号）
 * 按照同一格式前缀的连续编号分组，重新排序。
 */
function renumberHeadings(md: string): string {
  const lines = md.split('\n');
  
  // 编号行正则：捕获前缀（#、空白等）和数字
  // Group 1: prefix (e.g. "### " or "**" or "")
  // Group 2: the number
  // Group 3: suffix after number (e.g. ". " or ". **")
  const numberedLineRegex = /^(#{1,6}\s+|\*\*)?(\d+)(\.[\s])/;
  
  let i = 0;
  while (i < lines.length) {
    const match = lines[i].match(numberedLineRegex);
    if (match) {
      const prefix = match[1] || '';  // e.g. "### " or "**" or ""
      const groupStart = i;
      let counter = parseInt(match[2]);
      
      // Scan consecutive same-prefix numbered lines
      while (i < lines.length) {
        const m = lines[i].match(numberedLineRegex);
        if (m && (m[1] || '') === prefix) {
          if (i === groupStart) {
            counter = parseInt(m[2]); // Start from the first number in the group
          } else {
            counter++;
          }
          // Replace only the number, preserving everything else
          lines[i] = lines[i].replace(numberedLineRegex, `${prefix}${counter}$3`);
          i++;
          // Skip non-numbered lines (body text, lists, blank lines under this heading)
          while (i < lines.length) {
            const nextMatch = lines[i].match(numberedLineRegex);
            if (nextMatch && (nextMatch[1] || '') === prefix) break; // Same-level numbered line
            // If it's a different heading level, break out of the group
            if (lines[i].match(/^#{1,6}\s/) && !lines[i].match(numberedLineRegex)) break;
            i++;
          }
        } else {
          break;
        }
      }
    } else {
      i++;
    }
  }
  
  const result = lines.join('\n');
  console.log('[renumberHeadings] applied:', result !== md ? 'YES, fixed numbering' : 'no changes needed');
  return result;
}

export const TiptapEditor: React.FC = () => {
  const { activeTabId, tabs, updateTabContent, openTab, navigationRequest } = useAppStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  const [prompt, setPrompt] = React.useState<PromptDialogProps | null>(null);
  const { generate, stop, loading: aiLoading } = useAI();
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showStyleSelector, setShowStyleSelector] = React.useState(false);
  const [showAIPalette, setShowAIPalette] = useState(false);
  const [palettePos, setPalettePos] = useState<{ top: number; left: number } | null>(null);
  // 触发气泡时立即缓存光标前后的文本，避免提交时编辑器失焦导致位置丢失
  const [paletteContext, setPaletteContext] = useState<{ before: string; after: string }>({ before: '', after: '' });
  const [docSnapshot, setDocSnapshot] = useState<string | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const lastActiveTabIdRef = useRef<string | null>(null);
  const editorRef = useRef<any>(null);
  const activeTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

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
      DiagramExtension,
      SVGExtension,
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
      const currentTabId = activeTabIdRef.current;
      if (currentTabId) {
        const html = editor.getHTML();
        const markdown = htmlToMarkdown(html);
        
        // 安全检查：如果文档原本有内容，但转换出的 Markdown 却为空（可能是序列化逻辑异常），
        // 则跳过本次 Store 同步，防止文档被意外“清空”。
        // 特别是在流式生成或复杂的模式切换过程中。
        if (!markdown && editor.state.doc.textContent.trim()) {
          console.warn('[Tiptap] htmlToMarkdown returned empty, skipping store sync to prevent data loss.');
          return;
        }

        updateTabContent(currentTabId, markdown);
      }
    },
  });

  // 光标移动时关闭 AI 面板（生成中不关闭）
  useEffect(() => {
    if (!editor || !showAIPalette) return;
    
    const handleSelectionUpdate = () => {
      if (aiGenerating) return; // 生成中不自动关闭
      setShowAIPalette(false);
      setPalettePos(null);
    };
    
    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, showAIPalette, aiGenerating]);

  // 点击气泡外部或按 Escape 时关闭
  useEffect(() => {
    if (!showAIPalette) return;

    const handleMouseDown = (e: MouseEvent) => {
      const paletteEl = document.getElementById('ai-palette-portal');
      if (paletteEl && !paletteEl.contains(e.target as Node)) {
        setShowAIPalette(false);
        setPalettePos(null);
        editor?.chain().focus().run();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAIPalette(false);
        setPalettePos(null);
        editor?.chain().focus().run();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAIPalette, editor]);

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

    // 开启生成前保存文档快照，以便由于“停止”时回滚
    setDocSnapshot(editor.getHTML());
    const rid = Math.random().toString(36).substring(7);
    setActiveRequestId(rid);
    
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
      let accumulated = '';
      const startPos = from;
      let currentPos = to; // 初始化为选区终点，确保首个 chunk 就能替换掉整个选区

      await generate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], (chunk) => {
        accumulated += chunk;
        // 清理潜在的辅助性文字
        const cleanAccumulated = accumulated.replace(/^(.*?)(如下[:：]|结果[:：]|总结[:：]|内容[:：])|^\s*/gi, '').trim();
        const html = markdownToHtml(cleanAccumulated);
        
        editor.chain()
          .focus()
          .insertContentAt({ from: startPos, to: currentPos }, html)
          .run();
        
        // 关键：更新当前插入内容的终点位置
        currentPos = editor.state.selection.to;
      }, rid);
    } catch (err: any) {
      console.error('AI Action Failed:', err);
    } finally {
      setAiGenerating(false);
      setActiveRequestId(null);
      setDocSnapshot(null);
    }
  };

  const handleAIPaletteStop = () => {
    if (activeRequestId) {
      stop(activeRequestId);
      setActiveRequestId(null);
    }
    if (docSnapshot && editor) {
      editor.commands.setContent(docSnapshot);
      setDocSnapshot(null);
    }
    setAiGenerating(false);
  };

  const handleAIPaletteAction = async (prompt: string, useCtx: boolean = false) => {
    if (!editor) return;
    
    setShowAIPalette(true); // 保持气泡开启
    setAiGenerating(true);
    
    // 开启生成前保存文档快照，以便由于“停止”时回滚
    setDocSnapshot(editor.getHTML());
    const requestId = Math.random().toString(36).substring(7);
    setActiveRequestId(requestId);

    // 使用触发时缓存的前后文（在编辑器有焦点时已计算好，不受后续失焦影响）
    const { before: textBefore, after: textAfter } = paletteContext;

    const systemPrompt = `您是一位卓越的文档写作助手。请严格按照用户的指令，输出 Markdown 格式的内容，不要任何解释或开场白。`;

    const userMessage = useCtx && (textBefore || textAfter)
      ? `以下是我文档中光标所在位置的上下文（Markdown 格式）：

【前文】
${textBefore || '（文档开头，无前文）'}

【此处需要插入内容 ↓】

【后文】
${textAfter || '（文档末尾，无后文）'}

---

**严格要求：**
1. 生成的内容只能是【此处需要插入内容 ↓】处的补充，不要重复前文或后文已有的内容。
2. 严格延续前文的编号序号（如果前文最后是 "2."，新内容应从 "3." 开始）。
3. 严格保持前文的 Markdown 格式风格（标题层级、列表样式、缩进）。
4. 内容需与前后文主题衔接，语气和深度保持一致。

请在插入位置完成以下任务：${prompt}`
      : prompt;

    console.log('[AIPalette] useCtx:', useCtx, '| before length:', textBefore.length, '| after length:', textAfter.length);
    if (useCtx) {
      console.log('[AIPalette] textBefore (last 300):', textBefore.slice(-300));
      console.log('[AIPalette] textAfter (first 200):', textAfter.slice(0, 200));
    }

    try {
      let accumulated = '';
      // 此时 selectionUpdate 已经重置了编辑器选区，需要先把焦点放回去
      editor.chain().focus().run();
      const startPos = editor.state.selection.from;
      let currentPos = startPos;

      await generate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ], (chunk) => {
        accumulated += chunk;
        const html = markdownToHtml(accumulated);
        
        try {
          // 在开始之前记录当前的文档大小，用于简单修正（如果需要）
          // 但更稳健的方法是利用 insertContentAt 后的 selection
          
          editor.chain()
            .insertContentAt({ from: startPos, to: currentPos }, html)
            .run();
          
          // insertContentAt 会自动将选区移动到新插入内容的末尾
          // 我们只需要记录这个位置作为下一次替换的终点
          currentPos = editor.state.selection.to;

          // 降低写入频率，仅当积累一定长度或遇到换行时同步到 Store
          if (accumulated.length % 20 === 0 || chunk.includes('\n')) {
            const currentTabId = activeTabIdRef.current;
            if (currentTabId) {
              const currentHtml = editor.getHTML();
              const currentMd = htmlToMarkdown(currentHtml);
              // 极端安全检查：确保不会因为转换错误清空文档
              if (currentMd.trim() || !editor.state.doc.textContent.trim()) {
                updateTabContent(currentTabId, currentMd);
              }
            }
          }
        } catch (e) {
          // 流式过程中产生无效 HTML 时忽略
        }
      }, requestId);

      // 生成完成后，执行一次最终的显式同步
      const finalTabId = activeTabIdRef.current;
      if (finalTabId) {
        updateTabContent(finalTabId, htmlToMarkdown(editor.getHTML()));
        console.log('[AI] Final content sync completed');
      }

      // 生成完成后：直接在 ProseMirror 节点层面重排编号
      // 生成完成后：在同一章节内重排连续编号标题
      if (useCtx) {
        const { tr } = editor.state;
        let modified = false;

        // 收集所有 heading 节点及其位置（按文档顺序）
        type HeadingInfo = { pos: number; textPos: number; currentNum: string; level: number };
        const allHeadings: Array<HeadingInfo | { pos: number; level: number; isBreak: true }> = [];
        
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading') {
            const text = node.textContent;
            const match = text.match(/^(\d+)[.．、]\s*/);
            const level = node.attrs.level as number;
            if (match) {
              allHeadings.push({ pos, textPos: pos + 1, currentNum: match[1], level });
            } else {
              // 非编号标题作为 "断点"
              allHeadings.push({ pos, level, isBreak: true });
            }
          }
        });

        // 按连续的同级编号标题分组（遇到断点或不同级别则断开）
        const runs: HeadingInfo[][] = [];
        let currentRun: HeadingInfo[] = [];
        let currentLevel: number | null = null;

        for (const item of allHeadings) {
          if ('isBreak' in item) {
            if (currentRun.length > 0) { runs.push(currentRun); currentRun = []; }
            currentLevel = null;
          } else {
            if (currentLevel === null || item.level === currentLevel) {
              currentRun.push(item);
              currentLevel = item.level;
            } else {
              // 级别变了 → 结束当前 run，开新 run
              if (currentRun.length > 0) { runs.push(currentRun); }
              currentRun = [item];
              currentLevel = item.level;
            }
          }
        }
        if (currentRun.length > 0) { runs.push(currentRun); }

        // 对每个 run 内部重排编号（从后往前修改避免偏移）
        for (const run of runs) {
          if (run.length < 2) continue;
          
          // 查找该 run 在文档中的大致起始序号。如果是新插入，可能第一个序号也是错的。
          // 逻辑：如果这个 run 包含刚刚插入的范围，则需要更细致的处理。
          // 简单起见：如果第一个序号是 1，则重排为 1, 2, 3...
          // 如果第一个序号不是 1 且前文有中断，则尊重第一个序号。
          const startNum = parseInt(run[0].currentNum);
          
          const reversed = [...run].reverse();
          reversed.forEach((item, reverseIdx) => {
            const indexInRun = run.length - 1 - reverseIdx;
            const expectedNum = startNum + indexInRun;
            if (item.currentNum !== String(expectedNum)) {
              tr.replaceWith(item.textPos, item.textPos + item.currentNum.length, editor.schema.text(String(expectedNum)));
              modified = true;
            }
          });
        }

        if (modified) {
          editor.view.dispatch(tr);
          console.log('[renumber] 已修复同章节内的局部编号');
        }
      }
    } finally {
      setAiGenerating(false);
      setActiveRequestId(null);
      // 生成完成后延迟清除 snapshot，防止 handleAIPaletteStop 在此时被意外触发导致回滚
      setTimeout(() => setDocSnapshot(null), 100);
      // 注意：根据用户需求，不关闭气泡，也不在 AI 操作成功后清除 PalettePos 缓存的坐标
    }
  };
 
  // 统一触发 AI 面板的逻辑
  const triggerAIPalette = useCallback(() => {
    if (!editor) return;
    const { from } = editor.state.selection;
    const cursorCoords = editor.view.coordsAtPos(from);
    
    // 用 DOMSerializer 提取光标前后 HTML 片段，再转 Markdown，保留所有格式
    const docSize = editor.state.doc.content.size;
    const serializer = DOMSerializer.fromSchema(editor.schema);
    
    // 前文：doc.slice(0, from) → HTML → Markdown
    const beforeFragment = editor.state.doc.slice(0, Math.min(from, docSize)).content;
    const beforeDiv = document.createElement('div');
    beforeDiv.appendChild(serializer.serializeFragment(beforeFragment));
    const mdBefore = htmlToMarkdown(beforeDiv.innerHTML);
    
    // 后文：doc.slice(from, end) → HTML → Markdown
    const afterFragment = editor.state.doc.slice(Math.min(from, docSize), docSize).content;
    const afterDiv = document.createElement('div');
    afterDiv.appendChild(serializer.serializeFragment(afterFragment));
    const mdAfter = htmlToMarkdown(afterDiv.innerHTML);
    
    setPaletteContext({
      before: mdBefore.slice(-2000), // 前文最后 2000 字
      after: mdAfter.slice(0, 1000),  // 后文前 1000 字
    });
    
    setPalettePos({ 
      top: cursorCoords.bottom + 12, 
      left: Math.max(cursorCoords.left, 20) 
    });
    setShowAIPalette(true);
  }, [editor]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // 组件卸载时强制同步一次最新内容到 Store
  useEffect(() => {
    return () => {
      if (editorRef.current && activeTabIdRef.current) {
        const html = editorRef.current.getHTML();
        const markdown = htmlToMarkdown(html);
        useAppStore.getState().updateTabContent(activeTabIdRef.current, markdown);
        console.log('[Tiptap] Unmount sync completed');
      }
    };
  }, []);

  // 同步外部内容变更到编辑器（如切换标签或外部 AI 写入）
  useEffect(() => {
    if (!editor || !activeTab) return;

    const currentHtml = editor.getHTML();
    const newHtml = markdownToHtml(activeTab.content);
    const isTabSwitch = activeTabId !== lastActiveTabIdRef.current;

    // 如果是切换 Tab，无论如何都要强制刷新
    if (isTabSwitch) {
      editor.commands.setContent(newHtml);
      lastActiveTabIdRef.current = activeTabId;
      return;
    }

    // 非切换 Tab 时（例如侧边栏 AI 写入内容到当前 Tab）：
    // 如果当前编辑器正获得焦点，或者 AI 正在生成内容，不接受由 store 反馈回来的同步（避免回流冲突和内容丢失）
    if (editor.isFocused || aiGenerating) return;

    // 只有在 HTML 发生实质性变化时才更新
    if (currentHtml !== newHtml) {
      editor.commands.setContent(newHtml, { emitUpdate: false });
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
        {showAIPalette && palettePos && ReactDOM.createPortal(
          <div 
            id="ai-palette-portal"
            style={{ 
              position: 'fixed', 
              top: palettePos.top, 
              left: palettePos.left,
              zIndex: 9999 
            }}
          >
            <AIPalette 
              onClose={() => { 
                setShowAIPalette(false); 
                setPalettePos(null); 
                editor?.chain().focus().run(); 
              }} 
              onAction={(p, useCtx) => handleAIPaletteAction(p, useCtx)}
              onStop={handleAIPaletteStop}
              loading={aiGenerating}
            />
          </div>,
          document.body
        )}
        
        <div className="tiptap-page" onClick={() => editor.chain().focus().run()}>
          {editor && (
            <BubbleMenu 
              editor={editor} 
              shouldShow={({ state, editor }) => {
                if (state.selection.empty) return false;
                // Don't show for custom block nodes
                const { selection } = state;
                const isCustomBlock = editor.isActive('diagram') || editor.isActive('svgBlock');
                return !isCustomBlock;
              }}
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

        {aiGenerating && (
          <div className="ai-status-indicator" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Loader2 size={14} className="animate-spin" />
              <span>AI 正在全力输出中...</span>
            </div>
            <button 
              onClick={handleAIPaletteStop}
              style={{
                padding: '2px 8px',
                borderRadius: 6,
                backgroundColor: 'rgba(255, 71, 87, 0.15)',
                color: '#ff4757',
                border: '1px solid rgba(255, 71, 87, 0.2)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 71, 87, 0.25)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 71, 87, 0.15)'}
            >
              停止生成
            </button>
          </div>
        )}

        <EditorContent 
            editor={editor} 
            onKeyDown={(e) => {
                const { selection, doc } = editor.state;
                if (!selection.empty || aiGenerating) return;

                // 触发判定
                const { $from } = selection;
                const isAtStart = $from.parentOffset === 0;
                const isEmptyLine = $from.parent.textContent.trim() === '';

                // 1. 空格触发 (仅限行首且该行原本为空)
                if (e.key === ' ' && isAtStart && isEmptyLine && !showAIPalette) {
                    e.preventDefault();
                    triggerAIPalette();
                    return;
                }

                // 2. 斜杠触发 (仅限行首)
                if (e.key === '/' && isAtStart && !showAIPalette) {
                    // 我们不preventDefault，让 '/' 输入进去，或者也可以拦截它
                    // 这里选择拦截并在显示面板后手动处理，或者让面板自己带一个 '/'
                    e.preventDefault();
                    triggerAIPalette();
                    return;
                }

                // 3. Esc 关闭
                if (e.key === 'Escape' && showAIPalette) {
                    setShowAIPalette(false);
                    setPalettePos(null);
                }
            }}
          />
        </div>
      </div>
    </div>
  );
};
