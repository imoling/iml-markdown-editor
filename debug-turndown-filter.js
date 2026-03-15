
import TurndownService from 'turndown';
const turndownService = new TurndownService();

turndownService.addRule('debug', {
  filter: (node) => {
    console.log('Filtering node:', node.nodeName, 'Has attr:', node.getAttribute('data-mermaid-block'));
    return false;
  },
  replacement: () => ''
});

const html = '<pre data-mermaid-block="yes">test</pre>';
turndownService.turndown(html);
