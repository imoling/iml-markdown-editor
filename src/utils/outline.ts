import { HeadingNode } from '../stores/appStore';
import { splitFrontmatter } from '../../electron/shared/noteMeta';

export function extractHeadings(markdown: string): HeadingNode[] {
  const headings: HeadingNode[] = [];
  // Windows 换行（CRLF）的文件：`.` 不匹配 \r，不去掉的话下面的正则一个标题都认不出来
  const lines = markdown.split(/\r?\n/);
  // frontmatter 里的 `# 注释`、围栏代码里的 `# xxx` 都不是标题；行号保持与源文件一致（目录跳转靠它定位）
  const skipUntil = splitFrontmatter(markdown).lineOffset;
  let fence: string | null = null;
  
  lines.forEach((line, index) => {
    if (index < skipUntil) return;
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
      return;
    }
    if (fence) return;
    // 允许标题前面存在数字标号或无序列表符（如 `1. # 标题` 或 `- # 标题`）
    const match = line.match(/^(\s*(?:\d+\.\s+|[-*+]\s+)?)(#{1,6})\s+(.+)$/);
    if (match) {
      // Strip common markdown formatting symbols for a cleaner catalog view
      const cleanText = match[3].trim()
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
