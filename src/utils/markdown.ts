import { marked } from 'marked';
import TurndownService from 'turndown';
// @ts-ignore
import { tables } from 'turndown-plugin-gfm';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

turndownService.use(tables);

// Ensure tables are handled correctly even if plugin fails on certain DOM structures
turndownService.addRule('tiptap-table', {
  filter: 'table',
  replacement: (content, node) => {
    // Basic GFM table conversion logic as a fallback/reinforcement
    const rows = Array.from((node as HTMLElement).querySelectorAll('tr'));
    if (rows.length === 0) return '';

    const mdRows = rows.map((row, index) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      const mdCells = cells.map(cell => {
        // Remove newlines and trim to keep GFM table row on one line
        return (cell.textContent || '').replace(/\n/g, ' ').trim();
      });
      
      let rowContent = '| ' + mdCells.join(' | ') + ' |';
      
      // Add separator after first row (header)
      if (index === 0) {
        const separator = '| ' + mdCells.map(() => '---').join(' | ') + ' |';
        return rowContent + '\n' + separator;
      }
      
      return rowContent;
    });

    return '\n\n' + mdRows.join('\n') + '\n\n';
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
  return marked.parse(markdownContent, { async: false }) as string;
};

export const htmlToMarkdown = (htmlContent: string): string => {
  return turndownService.turndown(htmlContent);
};
