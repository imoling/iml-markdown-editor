import { marked } from 'marked';
import TurndownService from 'turndown';
import mermaid from 'mermaid';
// @ts-ignore
import { tables } from 'turndown-plugin-gfm';

export const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**'
});

turndownService.use(tables);

// Flatten paragraphs inside table cells to prevent Markdown table breakage
turndownService.addRule('tableCellParagraphs', {
  filter: (node) => {
    return node.nodeName === 'P' && 
           (node.parentNode?.nodeName === 'TD' || node.parentNode?.nodeName === 'TH');
  },
  replacement: (content) => content
});

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

export const markdownToHtml = (markdownContent: string, inlineActual: boolean = false): string => {
  if (!markdownContent) return '';

  // 1. Process Mermaid code blocks
  const mermaidRegex = /```mermaid\s*([\s\S]*?)(?:```|$)/g;
  const diagrams: string[] = [];
  const placeholderMermaid = (index: number) => `:::MERMAID_BLOCK_${index}:::`;

  let processed = markdownContent.replace(mermaidRegex, (match, code) => {
    const index = diagrams.length;
    let html = '';
    
    if (inlineActual) {
      // In MD preview mode, we just want the raw code for Mermaid to be handled by some outer logic 
      // or just show it as a clean pre block if no renderer is attached.
      // But for SVG, we definitely want the actual SVG.
      html = `<div class="mermaid-diagram">${code.trim()}</div>`;
    } else {
      const encoded = `base64:${toBase64(code.trim())}`;
      html = `<div data-mermaid-block="" data-code="${encoded}">[mermaid]</div>`;
    }
    
    diagrams.push(html);
    return placeholderMermaid(index);
  });

  // 2. Process SVG code blocks
  const svgRegex = /```svg\s*([\s\S]*?)(?:```|$)/g;
  const svgs: string[] = [];
  const placeholderSVG = (index: number) => `:::SVG_BLOCK_${index}:::`;

  processed = processed.replace(svgRegex, (match, code) => {
    const index = svgs.length;
    let html = '';
    
    if (inlineActual) {
      // Directly inject the SVG code
      html = `<div class="svg-preview-container">${code.trim()}</div>`;
    } else {
      const encoded = `base64:${toBase64(code.trim())}`;
      html = `<div data-svg-block="" data-code="${encoded}">[svg]</div>`;
    }
    
    svgs.push(html);
    return placeholderSVG(index);
  });

  // 3. Parse with marked
  let htmlResult = marked.parse(processed, { async: false }) as string;
  
  // 4. Restore Mermaid blocks
  diagrams.forEach((diagramHtml, index) => {
    const pStr = placeholderMermaid(index);
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

/**
 * 异步将 Markdown 转换为带静态渲染组件的 HTML
 * 主要用于 PDF 导出，此时需要将 Mermaid 等代码块预先转换为静态 SVG
 */
export const markdownToStaticHtml = async (markdownContent: string): Promise<string> => {
  if (!markdownContent) return '';

  mermaid.initialize({
    startOnLoad: false,
    theme: 'neutral',
    securityLevel: 'loose',
    fontFamily: 'var(--font-body)',
  });

  // 1. 采集并替换占位符
  const mermaidCodes: string[] = [];
  const svgCodes: string[] = [];
  
  const mermaidRegex = /```mermaid\s*([\s\S]*?)(?:```|$)/g;
  const svgRegex = /```svg\s*([\s\S]*?)(?:```|$)/g;

  // 使用显式的 HTML 块标签作为占位符，防止被 marked 误处理
  let processed = markdownContent.replace(mermaidRegex, (_, code) => {
    const index = mermaidCodes.length;
    mermaidCodes.push(code.trim());
    return `\n\n<div data-mermaid-static-index="${index}"></div>\n\n`;
  });

  processed = processed.replace(svgRegex, (_, code) => {
    const index = svgCodes.length;
    svgCodes.push(code.trim());
    return `\n\n<div data-svg-static-index="${index}"></div>\n\n`;
  });

  // 2. 执行 Markdown 解析
  const htmlResult = await marked.parse(processed, { async: true }) as string;
  
  // 3. 使用 DOMParser 精准回填
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlResult, 'text/html');

  const restoreNodes = async (selector: string, contentArray: string[], type: 'mermaid' | 'svg') => {
    const placeholders = Array.from(doc.querySelectorAll(selector));
    for (const placeholder of placeholders) {
      const idxStr = placeholder.getAttribute(`data-${type}-static-index`);
      if (idxStr === null) continue;
      const index = parseInt(idxStr);
      const rawContent = contentArray[index];
      
      let finalHtml = '';
      if (type === 'mermaid') {
        try {
          const id = `mermaid-static-${index}-${Math.random().toString(36).substring(7)}`;
          const { svg } = await mermaid.render(id, rawContent);
          finalHtml = `<div class="mermaid-static-rendered">${svg}</div>`;
        } catch (err) {
          console.error('Static mermaid render error:', err);
          finalHtml = `<pre class="mermaid-error">${rawContent}</pre>`;
        }
      } else {
        finalHtml = `<div class="svg-static-rendered">${rawContent}</div>`;
      }

      // 脱壳逻辑：解析器可能会将我们的 <div> 包裹在 <p>, <pre> 或 <code> 中
      let target: Element = placeholder;
      while (target.parentElement && 
             (target.parentElement.tagName === 'P' || 
              target.parentElement.tagName === 'PRE' || 
              target.parentElement.tagName === 'CODE')) {
        target = target.parentElement;
      }
      
      const tempDoc = parser.parseFromString(finalHtml, 'text/html');
      const fragment = tempDoc.body.firstChild;
      if (fragment) {
        target.replaceWith(doc.importNode(fragment, true));
      }
    }
  };

  await restoreNodes('div[data-mermaid-static-index]', mermaidCodes, 'mermaid');
  await restoreNodes('div[data-svg-static-index]', svgCodes, 'svg');

  return doc.body.innerHTML;
};

export const htmlToMarkdown = (htmlContent: string): string => {
  if (!htmlContent) return '';

  // Use DOMParser to clean up HTML in a more robust way than regex
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // 1. Remove colgroups, as they break GFM table detection in Turndown
  doc.querySelectorAll('colgroup').forEach(el => el.remove());

  // 2. Normalize table structure for GFM
  doc.querySelectorAll('table').forEach(table => {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length === 0) return;

    // Determine max columns to ensure consistency
    let maxCols = 0;
    rows.forEach(row => {
      const cellCount = row.querySelectorAll('td, th').length;
      if (cellCount > maxCols) maxCols = cellCount;
    });

    // Ensure all rows have the same number of cells
    rows.forEach(row => {
      const currentCells = row.querySelectorAll('td, th');
      for (let i = currentCells.length; i < maxCols; i++) {
        const td = doc.createElement('td');
        td.innerHTML = '&nbsp;';
        row.appendChild(td);
      }
    });

    // Handle proper header row for GFM
    let thead = table.querySelector('thead');
    if (!thead) {
      thead = doc.createElement('thead');
      const firstRow = rows[0];
      // Convert all cells in the first row to TH
      firstRow.querySelectorAll('td, th').forEach(cell => {
        const th = doc.createElement('th');
        th.innerHTML = cell.innerHTML || '&nbsp;';
        cell.parentNode?.replaceChild(th, cell);
      });
      thead.appendChild(firstRow);
      table.prepend(thead);
    } else {
      // Ensure thead rows use TH
      thead.querySelectorAll('td').forEach(td => {
        const th = doc.createElement('th');
        th.innerHTML = td.innerHTML || '&nbsp;';
        td.parentNode?.replaceChild(th, td);
      });
    }
  });

  // 3. Clear styles and classes and flatten nested structures in cells
  doc.querySelectorAll('table, thead, tbody, tr, th, td').forEach(el => {
    el.removeAttribute('style');
    el.removeAttribute('class');
    
    if (el.nodeName === 'TD' || el.nodeName === 'TH') {
      // Ensure cells aren't empty (Turndown needs something to see)
      if (!el.textContent?.trim() && !el.querySelector('br, img, input')) {
        el.innerHTML = '&nbsp;';
      }
      
      // Remove any div wrappers inside cells
      el.querySelectorAll('div').forEach(div => {
        const span = doc.createElement('span');
        span.innerHTML = div.innerHTML;
        div.parentNode?.replaceChild(span, div);
      });

      // Ensure headings inside cells don't break the table structure
      el.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
        const bold = doc.createElement('strong');
        bold.innerHTML = h.innerHTML;
        h.parentNode?.replaceChild(bold, h);
      });
    }
  });

  // 4. Convert back to markdown
  return turndownService.turndown(doc.body.innerHTML);
};
