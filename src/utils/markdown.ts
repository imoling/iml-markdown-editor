import { marked } from 'marked';
import TurndownService from 'turndown';
// @ts-ignore
import { tables } from 'turndown-plugin-gfm';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

turndownService.use(tables);

// Unicode 安全的 Base64 编码/解码工具
export const toBase64 = (str: string) => {
  if (!str) return '';
  try {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (e) {
    console.warn('toBase64 failed:', e);
    return '';
  }
};

export const fromBase64 = (base64: string) => {
  if (!base64 || !base64.trim()) return '';
  try {
    // 移除可能的自动填充错误
    const cleanBase64 = base64.replace(/\s/g, '');
    const binary = atob(cleanBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    console.warn('fromBase64 failed:', e);
    return '';
  }
};

// Custom rule for mermaid blocks
turndownService.addRule('diagram', {
  filter: (node) => {
    const nodeName = node.nodeName.toUpperCase();
    return (nodeName === 'DIV' || nodeName === 'PRE' || nodeName === 'FIGURE' || nodeName === 'MERMAID-BLOCK') && 
           (node.hasAttribute('data-mermaid-block') || (node as HTMLElement).classList.contains('mermaid-diagram'));
  },
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const codeNode = el.querySelector('code');
    let code = el.getAttribute('data-code') || codeNode?.getAttribute('data-code') || '';
    
    if (code.startsWith('base64:')) {
      code = fromBase64(code.substring(7));
    }
    
    // 如果属性里没有，尝试从文本内容提取（仅作为最后的退路）
    if (!code.trim() && el.textContent?.includes('graph')) {
      code = el.textContent;
    }
    
    return '\n\n```mermaid\n' + code.trim() + '\n```\n\n';
  }
});

// Custom rule for svg blocks
turndownService.addRule('svg', {
  filter: (node) => {
    const nodeName = node.nodeName.toUpperCase();
    return (nodeName === 'DIV' || nodeName === 'PRE' || nodeName === 'SVG-BLOCK') && node.hasAttribute('data-svg-block');
  },
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const codeNode = el.querySelector('code');
    let code = el.getAttribute('data-code') || codeNode?.getAttribute('data-code') || '';
    
    if (code.startsWith('base64:')) {
      code = fromBase64(code.substring(7));
    }
    
    return '\n\n```svg\n' + code.trim() + '\n```\n\n';
  }
});

// Custom rule for math blocks
turndownService.addRule('math', {
  filter: (node) => {
    return node.nodeName === 'DIV' && (node.classList.contains('math-block') || node.classList.contains('math-block-container'));
  },
  replacement: (content, node) => {
    const latex = (node as HTMLElement).getAttribute('data-latex') || content || '';
    return '\n\n$$\n' + latex.trim() + '\n$$\n\n';
  }
});

export const markdownToHtml = (markdownContent: string): string => {
  if (!markdownContent) return '';

  // 1. Process Mermaid code blocks (支持未闭合的代码块以便流式预览)
  const mermaidRegex = /```mermaid\s*([\s\S]*?)(?:```|$)/g;
  const diagrams: string[] = [];
  const placeholderMermaid = (index: number) => `:::MERMAID_BLOCK_${index}:::`;

  let processed = markdownContent.replace(mermaidRegex, (match, code) => {
    const index = diagrams.length;
    // 使用 Base64 以保证在 HTML 属性中存储复杂字符与换行的稳定性
    const encoded = `base64:${toBase64(code.trim())}`;
    // 使用非空 div 确保在 Turndown 转换过程中不被剥离（即便不显示）
    const html = `<div data-mermaid-block="" data-code="${encoded}">[mermaid]</div>`;
    diagrams.push(html);
    return placeholderMermaid(index);
  });

  // 2. Process SVG code blocks (支持未闭合的代码块)
  const svgRegex = /```svg\s*([\s\S]*?)(?:```|$)/g;
  const svgs: string[] = [];
  const placeholderSVG = (index: number) => `:::SVG_BLOCK_${index}:::`;

  processed = processed.replace(svgRegex, (match, code) => {
    const index = svgs.length;
    const encoded = `base64:${toBase64(code.trim())}`;
    const html = `<div data-svg-block="" data-code="${encoded}">[svg]</div>`;
    svgs.push(html);
    return placeholderSVG(index);
  });

  // 3. Parse with marked
  let htmlResult = marked.parse(processed, { async: false }) as string;
  
  // 4. Restore Mermaid blocks
  diagrams.forEach((diagramHtml, index) => {
    const pStr = placeholderMermaid(index);
    // 灵活匹配：可能被 wrap 在 <p> 中，也可能直接作为文本存在
    const pRegex = new RegExp(`<p>\\s*${pStr.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*</p>`, 'g');
    if (htmlResult.includes(pStr)) {
      const replaced = htmlResult.replace(pRegex, () => diagramHtml);
      htmlResult = replaced === htmlResult ? htmlResult.split(pStr).join(diagramHtml) : replaced;
    }
  });

  // 5. Restore SVG blocks
  svgs.forEach((svgHtml, index) => {
    const pStr = placeholderSVG(index);
    const pRegex = new RegExp(`<p>\\s*${pStr.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*</p>`, 'g');
    if (htmlResult.includes(pStr)) {
      const replaced = htmlResult.replace(pRegex, () => svgHtml);
      htmlResult = replaced === htmlResult ? htmlResult.split(pStr).join(svgHtml) : replaced;
    }
  });

  return htmlResult;
};

export const htmlToMarkdown = (htmlContent: string): string => {
  return turndownService.turndown(htmlContent);
};
