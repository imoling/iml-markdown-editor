
import TurndownService from 'turndown';
const turndownService = new TurndownService();

// Unicode 安全的 Base64 编码/解码工具
const fromBase64 = (base64) => {
  if (!base64 || !base64.trim()) return '';
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
};

turndownService.addRule('diagram', {
  filter: (node) => {
    const nodeName = node.nodeName.toUpperCase();
    return (nodeName === 'MERMAID-BLOCK' || nodeName === 'PRE') && node.hasAttribute('data-mermaid-block');
  },
  replacement: (content, node) => {
    console.log('Rule diagram matched!');
    let code = node.getAttribute('data-code') || '';
    if (code.startsWith('base64:')) {
      code = fromBase64(code.substring(7));
    }
    return '\n\n```mermaid\n' + code.trim() + '\n```\n\n';
  }
});

const html = '<p>Start</p><pre data-mermaid-block="" data-code="base64:Z3JhcGggVEQ="> </pre><p>End</p>';
console.log('Input HTML:', html);
const md = turndownService.turndown(html);
console.log('Output Markdown:');
console.log(md);
