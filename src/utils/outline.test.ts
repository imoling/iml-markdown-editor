import { describe, expect, it } from 'vitest';
import { extractHeadings } from './outline';

describe('extractHeadings', () => {
  it('提取各级标题并去掉行内格式', () => {
    const md = '# 标题 **一**\n\n正文\n\n## 二级 `code`\n### 三级 *斜体*\n';
    expect(extractHeadings(md)).toEqual([
      { level: 1, text: '标题 一', id: 'heading-0' },
      { level: 2, text: '二级 code', id: 'heading-4' },
      { level: 3, text: '三级 斜体', id: 'heading-5' },
    ]);
  });

  it('列表项里的标题也算', () => {
    expect(extractHeadings('1. # 第一章\n- ## 小节')).toEqual([
      { level: 1, text: '第一章', id: 'heading-0' },
      { level: 2, text: '小节', id: 'heading-1' },
    ]);
  });

  it('井号后没有空格的不是标题', () => {
    expect(extractHeadings('#tag 不是标题\n#\n')).toEqual([]);
  });
});

describe('Windows 换行（CRLF）', () => {
  it('标题一个不少，行号和 LF 一样；围栏里的仍然不算（轻量版 #16）', () => {
    const md = '---\r\ntitle: x\r\n---\r\n\r\n# 一\r\n\r\n```\r\n# 代码\r\n```\r\n\r\n## 二\r\n';
    expect(extractHeadings(md)).toEqual(extractHeadings(md.replace(/\r/g, '')));
    expect(extractHeadings(md).map((h) => h.text)).toEqual(['一', '二']);
  });
});
