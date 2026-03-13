import { HeadingNode } from '../stores/appStore';

export function extractHeadings(markdown: string): HeadingNode[] {
  const headings: HeadingNode[] = [];
  const lines = markdown.split('\n');
  
  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      // Remove markdown escapes (e.g. \. becomes .) for cleaner display in the catalog
      const cleanText = match[2].trim().replace(/\\([\\`*_{}[\]()#+-.!])/g, '$1');
      headings.push({
        level: match[1].length,
        text: cleanText,
        id: `heading-${index}`
      });
    }
  });
  
  return headings;
}
