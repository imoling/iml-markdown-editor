import { HeadingNode } from '../stores/appStore';

export function extractHeadings(markdown: string): HeadingNode[] {
  const headings: HeadingNode[] = [];
  const lines = markdown.split('\n');
  
  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        id: `heading-${index}` // Simplified ID
      });
    }
  });
  
  return headings;
}
