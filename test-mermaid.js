
import { markdownToHtml, htmlToMarkdown } from './src/utils/markdown.js';

const md = `
# Test
This is a diagram:

\`\`\`mermaid
graph TD
  A[Start] --> B(End)
\`\`\`

End of test.
`;

console.log('--- Original Markdown ---');
console.log(md);

const html = markdownToHtml(md);
console.log('\n--- Generated HTML ---');
console.log(html);

const backToMd = htmlToMarkdown(html);
console.log('\n--- Roundtrip Markdown ---');
console.log(backToMd);

if (backToMd.includes('math-block') || backToMd.includes('mermaid')) {
    console.log('\n--- SUCCESS ---');
} else {
    console.log('\n--- FAILURE ---');
}
