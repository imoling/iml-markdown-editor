
import { marked } from 'marked';

// Mock utility functions
const toBase64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const markdownToHtml = (markdownContent) => {
  if (!markdownContent) return '';

  const mermaidRegex = /```mermaid\s*([\s\S]*?)(?:```|$)/g;
  const diagrams = [];
  const placeholderMermaid = (index) => `:::MERMAID_BLOCK_${index}:::`;

  let processed = markdownContent.replace(mermaidRegex, (match, code) => {
    const index = diagrams.length;
    const encoded = `base64:${toBase64(code.trim())}`;
    const html = `<pre data-mermaid-block="" data-code="${encoded}"> </pre>`;
    diagrams.push(html);
    return placeholderMermaid(index);
  });

  let htmlResult = marked.parse(processed, { async: false });
  
  diagrams.forEach((diagramHtml, index) => {
    const pStr = placeholderMermaid(index);
    const pRegex = new RegExp(`<p>\\s*${pStr.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*</p>`, 'g');
    if (htmlResult.includes(pStr)) {
      const replaced = htmlResult.replace(pRegex, () => diagramHtml);
      htmlResult = replaced === htmlResult ? htmlResult.split(pStr).join(diagramHtml) : replaced;
    }
  });

  return htmlResult;
};

const test1 = '```mermaid\ngraph TD';
console.log('Test 1 (Partial):', markdownToHtml(test1));

const test2 = 'Existing text\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nMore text';
console.log('Test 2 (Complete):', markdownToHtml(test2));
