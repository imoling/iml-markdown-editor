
import TurndownService from 'turndown';
const turndownService = new TurndownService();

// Unicode 安全的 Base64 编码/解码工具
const toBase64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const fromBase64 = (base64) => {
  if (!base64 || !base64.trim()) return '';
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
};

// TELL TURNDOWN TO KEEP CUSTOM TAGS
turndownService.keep(['mermaid-block', 'svg-block']);

turndownService.addRule('diagram', {
  filter: (node) => {
    return (node.nodeName.toUpperCase() === 'MERMAID-BLOCK');
  },
  replacement: (content, node) => {
    let code = node.getAttribute('data-code') || '';
    if (code.startsWith('base64:')) {
      code = fromBase64(code.substring(7));
    }
    return '\n\n```mermaid\n' + code.trim() + '\n```\n\n';
  }
});

const testCode = 'graph TD\n  A --> B';
const encoded = `base64:${toBase64(testCode)}`;
const html = `<div><p>Hello</p><mermaid-block data-code="${encoded}"></mermaid-block><p>World</p></div>`;

console.log('Input HTML:', html);
const md = turndownService.turndown(html);
console.log('Output Markdown:');
console.log(md);

if (md.includes('```mermaid')) {
  console.log('--- SUCCESS ---');
} else {
  console.log('--- FAILURE ---');
}
