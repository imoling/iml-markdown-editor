import { describe, expect, it } from 'vitest';
import { rebaseRelativeLinks } from './rebaseLinks';

describe('rebaseRelativeLinks', () => {
  const down = (md: string) => rebaseRelativeLinks(md, '/lib', '/lib/项目/甲');

  it('搬到更深的目录：图片、附件、html 图片都改', () => {
    expect(down('![图](assets/a.png)')).toBe('![图](../../assets/a.png)');
    expect(down('[附件](./docs/b.pdf "说明")')).toBe('[附件](../../docs/b.pdf "说明")');
    expect(down('<img src="assets/a.png" width="200">')).toBe('<img src="../../assets/a.png" width="200">');
    expect(down('<audio src="assets/rec.webm" controls></audio>')).toBe('<audio src="../../assets/rec.webm" controls></audio>');
    expect(down('[甲]: assets/a.png')).toBe('[甲]: ../../assets/a.png');
  });

  it('搬回上层：地址变短', () => {
    expect(rebaseRelativeLinks('![图](../assets/a.png)', '/lib/项目', '/lib')).toBe('![图](assets/a.png)');
  });

  it('尖括号包住的带空格路径、锚点都留着', () => {
    expect(down('![图](<assets/a b.png>)')).toBe('![图](<../../assets/a b.png>)');
    expect(down('[小节](other.md#标题)')).toBe('[小节](../../other.md#标题)');
  });

  it('网址、页内锚点、绝对路径、脚注不动', () => {
    const md = '[a](https://x.com) [b](mailto:a@b.c) [c](#本节) ![d](/abs/a.png) ![e](data:image/png;base64,AA==)\n[^1]: assets/a.png';
    expect(down(md)).toBe(md);
  });

  it('代码和 frontmatter 不动', () => {
    const md = '---\ncover: assets/a.png\nlink: "[a](b.md)"\n---\n\n`![x](a.png)` 和 ![y](a.png)\n\n```\n![z](a.png)\n```\n';
    expect(down(md)).toBe('---\ncover: assets/a.png\nlink: "[a](b.md)"\n---\n\n`![x](a.png)` 和 ![y](../../a.png)\n\n```\n![z](a.png)\n```\n');
  });

  it('整个文件夹一起搬：指向里面的不动，指向外面的要改', () => {
    const md = '![里](assets/a.png) ![外](../assets/b.png)';
    expect(rebaseRelativeLinks(md, '/lib/旧/甲', '/lib/新/深/甲', '/lib/旧/甲')).toBe('![里](assets/a.png) ![外](../../../旧/assets/b.png)');
  });

  it('Windows 路径和 CRLF', () => {
    expect(rebaseRelativeLinks('![图](assets/a.png)\r\n正文\r\n', 'C:\\lib', 'C:\\lib\\项目')).toBe('![图](../assets/a.png)\r\n正文\r\n');
  });
});
