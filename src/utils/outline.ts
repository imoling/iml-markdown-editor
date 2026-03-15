import { HeadingNode } from '../stores/appStore';

export function extractHeadings(markdown: string): HeadingNode[] {
  const headings: HeadingNode[] = [];
  const lines = markdown.split('\n');
  
  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      // Strip common markdown formatting symbols for a cleaner catalog view
      let cleanText = match[2].trim()
        .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold **
        .replace(/__([^_]+)__/g, '$1')     // Bold __
        .replace(/\*([^*]+)\*/g, '$1')     // Italic *
        .replace(/_([^_]+)_/g, '$1')       // Italic _
        .replace(/~~([^~]+)~~/g, '$1')     // Strikethrough ~~
        .replace(/`([^`]+)`/g, '$1')       // Code `
        .replace(/\\([\\`*_{}[\]()#+-.!])/g, '$1'); // Escapes
      
      headings.push({
        level: match[1].length,
        text: cleanText,
        id: `heading-${index}`
      });
    }
  });
  
  return headings;
}
