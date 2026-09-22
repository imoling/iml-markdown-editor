import { describe, expect, it } from 'vitest';
import { exportCss, exportDocument } from './exportDoc';
import { markdownToHtml } from '../../src/utils/markdown';
import { sanitizeHtml } from '../../src/utils/sanitize';

/** 取出某条规则的声明部分：样式是手写的，每条规则一行（或一行里几条），选择器在行首或紧跟上一条的 } */
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  if (!m) throw new Error(`样式里没有「${selector}」这条规则`);
  return m[1].replace(/\s+/g, ' ').trim();
}

const css = exportCss();

describe('导出样式（PDF / HTML / 长图共用）：代码块与表格要和编辑器里看到的一致（issue #2）', () => {
  it('代码块换行：纸上没有横向滚动条，长行不换行就会被裁掉；没有空格的长串（网址、哈希）也要能断', () => {
    const pre = rule(css, 'pre');
    expect(pre).toContain('white-space: pre-wrap');
    expect(pre).toContain('overflow-wrap: anywhere');
    expect(pre).not.toContain('overflow-x');
  });

  it('表格列宽平分：编辑器是 table-layout: fixed，导出照做——否则按内容分宽，两个字的表头会被挤成竖排', () => {
    const table = rule(css, 'table');
    expect(table).toContain('table-layout: fixed');
    expect(table).toContain('width: 100%');
    expect(table).not.toContain('overflow: hidden'); // 打印分页时会裁掉内容
    expect(rule(css, 'th, td')).toContain('overflow-wrap: anywhere'); // 平分之后窄列里的长串要能断
  });

  it('表格线条照编辑器：单元格不再各画一圈，只画内部分隔线；最后一列、最后一行不画；表头底线 2px', () => {
    const cell = rule(css, 'th, td');
    expect(cell).not.toMatch(/(^|[; ])border: /);
    expect(cell).toContain('border-bottom: 1px solid');
    expect(cell).toContain('border-right: 1px solid');
    expect(rule(css, 'th:last-child, td:last-child')).toContain('border-right: none');
    expect(rule(css, 'tbody > tr:last-child > td')).toContain('border-bottom: none');
    expect(rule(css, 'th')).toContain('border-bottom-width: 2px');
  });

  it('斑马纹落在和编辑器同样的行上：编辑器把表头算作第 1 行、偶数行有底色，导出的表头在 thead 里，所以是 tbody 的奇数行', () => {
    expect(rule(css, 'tbody > tr:nth-child(odd)')).toContain('background-color');
    expect(css).not.toContain('tbody > tr:nth-child(even)');
  });

  it('这些选择器对得上 marked 生成的表格结构；单元格对齐进得了导出（align 属性已转成 style，净化后还在）', () => {
    const html = sanitizeHtml(markdownToHtml('| 名称 | 数量 | 金额 |\n|---|:-:|--:|\n| 苹果 | 3 | 12.00 |\n| 梨 | 10 | 8.50 |\n| 桃 | 1 | 5.00 |', true));
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.querySelectorAll('thead > tr:first-child > th:first-child')).toHaveLength(1);
    expect(Array.from(doc.querySelectorAll('tbody > tr:nth-child(odd) > td:first-child'), (td) => td.textContent)).toEqual(['苹果', '桃']);
    expect(doc.querySelectorAll('tbody > tr:last-child > td')).toHaveLength(3);
    expect((doc.querySelector('thead th:nth-child(2)') as HTMLElement).style.textAlign).toBe('center');
    expect((doc.querySelector('tbody td:nth-child(3)') as HTMLElement).style.textAlign).toBe('right');
  });

  it('换根容器：正文那条规则挂到指定选择器上，塞进应用页面里打印时不和界面样式打架；其余规则原样', () => {
    const scoped = exportCss('.export-body');
    expect(scoped).toContain('.export-body { font-family:');
    expect(scoped).not.toMatch(/^\s*body \{/m);
    expect(rule(scoped, 'pre')).toBe(rule(css, 'pre'));
  });

  it('独立的导出文件：带样式和正文，标题里的尖括号去掉', () => {
    const html = exportDocument('<p>正文</p>', 'a<b>.md', 'file:///notes/');
    expect(html).toContain('<title>ab.md</title>');
    expect(html).toContain('<base href="file:///notes/">');
    expect(html).toContain('white-space: pre-wrap');
    expect(html).toContain('<body><p>正文</p></body>');
  });
});
