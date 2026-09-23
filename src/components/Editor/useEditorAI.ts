import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import type { Node as PMNode } from '@tiptap/pm/model';
import { isLocalImage, localImageEta, startLocalImageTicker } from '../../utils/localImageEta';
import { placeholderPos } from '../../extensions/ImagePlaceholder';
import { useAppStore, HeadingNode } from '../../stores/appStore';
import { useAI } from '../../hooks/useAI';
import { markdownToHtml, htmlToMarkdown } from '../../utils/markdown';
import { serializeDoc } from '../../utils/incrementalMarkdown';
import { persistDataUrl } from '../../utils/pasteImage';

export type PaletteMode = 'text' | 'mermaid' | 'svg' | 'image';

interface Params {
  editor: Editor | null;
  outline: HeadingNode[];
  activeTabIdRef: React.MutableRefObject<string | null>;
  /** 写回 store 并记录回声（由 TiptapEditor 提供） */
  pushToStore: (tabId: string, markdown: string) => void;
}

/**
 * 编辑器内的 AI 能力：选区润色 / 总结 / 扩写，以及空行行首唤起的 AI 气泡（续写、流程图、SVG、AI 图片）。
 * 从 TiptapEditor 拆出来，只依赖 editor 实例与几个回调。
 */
export function useEditorAI({ editor, outline, activeTabIdRef, pushToStore }: Params) {
  const setAIStatus = useAppStore((s) => s.setAIStatus);
  const { generate, stop } = useAI();
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showStyleSelector, setShowStyleSelector] = useState(false);
  const [showAIPalette, setShowAIPalette] = useState(false);
  const [palettePos, setPalettePos] = useState<{ top: number; left: number } | null>(null);
  // 触发气泡时立即缓存光标前后的文本，避免提交时编辑器失焦导致位置丢失
  const [paletteContext, setPaletteContext] = useState<{ before: string; after: string }>({ before: '', after: '' });
  // 快照存文档节点本身而不是 HTML：回滚时放回去的还是原来那批节点对象，「未编辑的块写回原文」的对照关系不会断
  const docSnapshotRef = useRef<PMNode | null>(null);
  const activeRequestIdRef2 = useRef<string | null>(null);

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
    setAIStatus({ generating: true, onStop: handleAIPaletteStop });

    // 开启生成前保存文档快照，以便由于”停止”时回滚
    docSnapshotRef.current = editor.state.doc;
    const rid = Math.random().toString(36).substring(7);
    activeRequestIdRef2.current = rid;
    
    const systemPrompt = `您是一位卓越的文档编辑专家。
您的任务是根据用户的要求处理文本。
关键规则：
1. 仅返回处理后的正文结果。
2. 严禁包含任何前言、引言、解释说明、括号内的备注或修改日志。
3. 严禁包含任何如"好的，这是为您处理后的结果"之类的废话。
4. 如果用户要求润色，请直接给出润色后的文本。
5. 对于总结任务，请直接给出总结正文，不可包含"总结如下"等任何辅助性标签。`;

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
      let currentPos = to;

      await generate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], (chunk) => {
        accumulated += chunk;
        const cleanAccumulated = accumulated.replace(/^(.*?)(如下[:：]|结果[:：]|总结[:：]|内容[:：])|^\s*/gi, '').trim();
        const html = markdownToHtml(cleanAccumulated);
        editor.chain()
          .focus()
          .insertContentAt({ from: startPos, to: currentPos }, html)
          .run();
        currentPos = editor.state.selection.to;
      }, rid);
    } catch (err: any) {
      console.error('AI Action Failed:', err);
    } finally {
      setAiGenerating(false);
      setAIStatus({ generating: false, onStop: null });
      activeRequestIdRef2.current = null;
      docSnapshotRef.current = null;
    }
  };

  const handleAIPaletteStop = () => {
    const rid = activeRequestIdRef2.current;
    if (rid) {
      stop(rid);
      activeRequestIdRef2.current = null;
    }
    const snap = docSnapshotRef.current;
    if (snap && editor) {
      editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, snap.content));
      docSnapshotRef.current = null;
    }
    setAiGenerating(false);
    setAIStatus({ generating: false, onStop: null });
  };

  const handleAIPaletteAction = async (
    prompt: string,
    useCtx: boolean = false,
    mode: 'text' | 'mermaid' | 'svg' | 'image' = 'text',
  ) => {
    if (!editor) return;

    // AI 图片生成模式：独立处理，不走文本流式生成
    if (mode === 'image') {
      if (!prompt.trim()) return;
      setAiGenerating(true);
      const imageGenConfig = useAppStore.getState().imageGenConfig;
      const local = isLocalImage(imageGenConfig);
      const cancelLocal = () => { void window.api.image.cancelGeneration().catch(() => {}); };
      // 正文里先占个位：出图要好几分钟，气泡一关就什么都看不见了。
      // 占位块是装饰层，不进文档也不会被保存；上面写着提示词和进度，点它就能不要了
      const phId = `img-${Date.now().toString(36)}`;
      let cancelled = false;
      const cancelAll = () => { cancelled = true; if (local) cancelLocal(); editor.commands.removeImagePlaceholder(phId); };
      editor.commands.addImagePlaceholder({ id: phId, prompt, onCancel: () => { cancelAll(); stopTicker?.(); setAiGenerating(false); setAIStatus({ generating: false, onStop: null, text: undefined }); } });
      // 占位块接手了进度和取消，气泡就该让开——它正好压在图要出来的地方
      setShowAIPalette(false);
      setPalettePos(null);
      // 一路报到哪一步了：状态栏和占位块上同时写；只写「正在生成」的话人会以为卡住直接关掉
      let stopTicker: (() => void) | null = null;
      const setProgress = (text: string) => { setAIStatus({ text }); editor.commands.updateImagePlaceholder(phId, text); };
      if (local) stopTicker = startLocalImageTicker(await localImageEta(imageGenConfig), setProgress, cancelLocal);
      else setProgress('正在生成图片…');
      setAIStatus({ generating: true, onStop: () => { cancelAll(); stopTicker?.(); setAiGenerating(false); setAIStatus({ generating: false, onStop: null, text: undefined }); } });
      try {
        const results = await window.api.ai.generateImage({ prompt, config: imageGenConfig });
        if (cancelled) return;
        if (results && results.length > 0) {
          // 生成结果是 data URL：存成笔记旁的文件，正文里只留相对路径
          const url = await persistDataUrl(results[0].url, activeTabIdRef.current, prompt.slice(0, 24));
          const { schema } = editor.state;
          const node = schema.nodes.image.create({ src: url, alt: prompt });
          // 插在占位块那儿——这几分钟里用户可能已经在别处写了字，光标早不在原地了
          const at = placeholderPos(editor.state, phId);
          const tr = at == null ? editor.state.tr.replaceSelectionWith(node) : editor.state.tr.insert(at, node);
          editor.view.dispatch(tr);
          editor.commands.removeImagePlaceholder(phId);
          // 换上来的真图淡入一下，别硬切
          requestAnimationFrame(() => {
            const img = editor.view.dom.querySelector(`img[src="${CSS.escape(url)}"]`);
            if (img) { img.classList.add('img-just-made'); setTimeout(() => img.classList.remove('img-just-made'), 600); }
          });
          // 同步到 store
          const tabId = activeTabIdRef.current;
          if (tabId) pushToStore(tabId, serializeDoc(editor).markdown);
        } else {
          useAppStore.getState().notify('AI 配图失败：服务没有返回图片，检查「智能 → AI 配图」或稍后再试', 8000);
        }
      } catch (err: any) {
        console.error('[AI Image] 生成失败:', err);
        // 主进程的报错带着 IPC 前缀，去掉再显示；状态栏放不下的部分悬停可见
        const reason = String(err?.message || '未知错误').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
        useAppStore.getState().notify(`AI 配图失败：${reason}`, 10000);
      } finally {
        stopTicker?.();
        editor.commands.removeImagePlaceholder(phId);
        setAiGenerating(false);
        setAIStatus({ generating: false, onStop: null, text: undefined });
      }
      return;
    }

    setShowAIPalette(true); // 保持气泡开启
    setAiGenerating(true);
    setAIStatus({ generating: true, onStop: handleAIPaletteStop });

    // 开启生成前保存文档快照，以便由于”停止”时回滚
    docSnapshotRef.current = editor.state.doc;
    const requestId = Math.random().toString(36).substring(7);
    activeRequestIdRef2.current = requestId;

    // 使用触发时缓存的前后文（在编辑器有焦点时已计算好，不受后续失焦影响）
    const { before: textBefore, after: textAfter } = paletteContext;

    let systemPrompt = `您是一位卓越的文档写作助手。请严格按照用户的指令，输出 Markdown 格式的内容，不要任何解释或开场白。`;

    if (mode === 'mermaid') {
      systemPrompt = `您是一位 Mermaid 图表专家。请根据用户指令生成标准的 Mermaid 代码块。
**严格要求：**
1. 必须且只能输出一个 \`\`\`mermaid ... \`\`\` 代码块。
2. 内部代码必须是有效的 Mermaid 语法。
3. 不要包含任何解释性文字、Markdown 标题或开场白。`;
    } else if (mode === 'svg') {
      systemPrompt = `您是一位 SVG 绘图专家。请根据用户指令生成标准的 SVG 代码块。
**严格要求：**
1. 必须且只能输出一个 \`\`\`svg ... \`\`\` 代码块，内部包含标准的 <svg> 标签。
2. 确保 SVG 具有合适的 viewBox 属性，以便自适应尺寸。
3. 不要包含任何解释性文字或开场白。`;
    }

    const outlineText = outline.length > 0
      ? `【全文大纲结构】
${outline.map(h => `${'  '.repeat(h.level - 1)}- ${h.text}`).join('\n')}
`
      : '';

    const contextInstruction = useCtx && (textBefore || textAfter)
      ? `以下是我文档中光标所在位置的上下文（Markdown 格式）：

${outlineText}
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
5. 参考【全文大纲结构】以确保生成的段落逻辑正确融入整体架构。

请在插入位置完成以下任务：${prompt}`
      : prompt;

    const userMessage = contextInstruction;

    console.log('[AIPalette] useCtx:', useCtx, '| before length:', textBefore.length, '| after length:', textAfter.length);
    if (useCtx) {
      console.log('[AIPalette] textBefore (last 300):', textBefore.slice(-300));
      console.log('[AIPalette] textAfter (first 200):', textAfter.slice(0, 200));
    }

    try {
      let accumulated = '';
      // 此时 selectionUpdate 已经重置了编辑器选区，需要先把焦点放回去
      editor.chain().focus().run();
      const initialFrom = editor.state.selection.from;
      const initialTo = editor.state.selection.to;
      const $pos = editor.state.doc.resolve(initialFrom);
      const parentNode = $pos.parent;
      
      // 核心优化：锁定起始位置。如果是空段落，则直接替换整个段落节点
      const finalStartPos = (parentNode.type.name === 'paragraph' && parentNode.textContent.trim() === '') 
        ? $pos.before() 
        : initialFrom;
        
      let currentEndPos = (parentNode.type.name === 'paragraph' && parentNode.textContent.trim() === '')
        ? $pos.after()
        : initialTo;

      await generate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ], (chunk) => {
        accumulated += chunk;
        // 去掉完整 <think> 块；若 <think> 尚未闭合则暂时隐藏该段
        const processedMarkdown = accumulated
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/<think>[\s\S]*$/i, '')
          .trimStart();
        if (!processedMarkdown) return;
        
        const html = markdownToHtml(processedMarkdown);
        
        try {
          editor.chain()
            .insertContentAt({ from: finalStartPos, to: currentEndPos }, html)
            .run();
          
          // 更新下一步替换的结束位置（即当前内容的末尾）
          currentEndPos = editor.state.selection.to;

          // 降低写入频率，仅当积累一定长度或遇到换行时同步到 Store
          if (accumulated.length % 20 === 0 || chunk.includes('\n')) {
            const currentTabId = activeTabIdRef.current;
            if (currentTabId) {
              const currentMd = serializeDoc(editor).markdown;
              // 极端安全检查：确保不会因为转换错误清空文档
              if (currentMd.trim() || !editor.state.doc.textContent.trim()) {
                pushToStore(currentTabId, currentMd);
              }
            }
          }
        } catch (e) {
          // 流式过程中产生无效 HTML 时忽略
        }
      }, requestId);

      setAiGenerating(false);
      setAIStatus({ generating: false, onStop: null });

      // 生成完成后：用干净内容重写编辑器（去 <think> + 非上下文模式时去标题前前言）
      let finalMarkdown = accumulated
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .trimStart();
      if (!useCtx) {
        const headingIdx = finalMarkdown.search(/^#{1,6}\s/m);
        if (headingIdx > 0) finalMarkdown = finalMarkdown.slice(headingIdx);
      }
      if (finalMarkdown !== accumulated.trimStart()) {
        try {
          editor.chain()
            .insertContentAt({ from: finalStartPos, to: currentEndPos }, markdownToHtml(finalMarkdown))
            .run();
          currentEndPos = editor.state.selection.to;
        } catch (_) { /* 忽略位置越界 */ }
      }

      // 生成完成后，执行一次最终的显式同步
      const finalTabId = activeTabIdRef.current;
      if (finalTabId) {
        pushToStore(finalTabId, serializeDoc(editor).markdown);
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
      activeRequestIdRef2.current = null;
      // 生成完成后延迟清除 snapshot，防止 handleAIPaletteStop 在此时被意外触发导致回滚
      setTimeout(() => { docSnapshotRef.current = null; }, 100);
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
    
    const PALETTE_HEIGHT = 130; // 气泡高度估算值
    const PALETTE_WIDTH = 480;
    const spaceBelow = window.innerHeight - cursorCoords.bottom;
    const top = spaceBelow >= PALETTE_HEIGHT + 12
      ? cursorCoords.bottom + 12
      : cursorCoords.top - PALETTE_HEIGHT - 12;
    const left = Math.min(
      Math.max(cursorCoords.left, 20),
      window.innerWidth - PALETTE_WIDTH - 20
    );
    setPalettePos({ top: Math.max(8, top), left });
    setShowAIPalette(true);
  }, [editor]);

  const closePalette = useCallback(() => {
    setShowAIPalette(false);
    setPalettePos(null);
  }, []);

  return {
    aiGenerating,
    showStyleSelector, setShowStyleSelector,
    showAIPalette, setShowAIPalette,
    palettePos, setPalettePos,
    handleAIAction,
    handleAIPaletteStop,
    handleAIPaletteAction,
    triggerAIPalette,
    closePalette,
  };
}
