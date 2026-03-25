import { HeadingNode } from '../stores/appStore';

export function extractHeadings(markdown: string): HeadingNode[] {
  const headings: HeadingNode[] = [];
  const lines = markdown.split('\n');
  
  lines.forEach((line, index) => {
    // 允许标题前面存在数字标号或无序列表符（如 `1. # 标题` 或 `- # 标题`）
    const match = line.match(/^(\s*(?:\d+\.\s+|[-*+]\s+)?)(#{1,6})\s+(.+)$/);
    if (match) {
      // Strip common markdown formatting symbols for a cleaner catalog view
      let cleanText = match[3].trim()
        .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold **
        .replace(/__([^_]+)__/g, '$1')     // Bold __
        .replace(/\*([^*]+)\*/g, '$1')     // Italic *
        .replace(/_([^_]+)_/g, '$1')       // Italic _
        .replace(/~~([^~]+)~~/g, '$1')     // Strikethrough ~~
        .replace(/`([^`]+)`/g, '$1')       // Code `
        .replace(/\\([\\`*_{}[\]()#+-.!])/g, '$1'); // Escapes
      
      headings.push({
        level: match[2].length,
        text: cleanText,
        id: `heading-${index}`
      });
    }
  });
  
  return headings;
}
