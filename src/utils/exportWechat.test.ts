import { describe, expect, it, vi } from 'vitest';
import { markdownToStaticHtml } from './markdown';
import { htmlToWechat, WECHAT_THEMES } from './exportWechat';

const indigo = WECHAT_THEMES[0];
const ink = WECHAT_THEMES.find((t) => t.id === 'ink')!;
const MD = [
  '# 标题', '',
  '正文 **加粗** `行内代码` [外链](https://example.com/a) 再来[同一个](https://example.com/a) [公众号](https://mp.weixin.qq.com/s/abc) [[双向链接]] #标签 脚注[^1]。', '',
  '> [!TIP] 提示', '> 提示块正文', '',
  '- [x] 做完的', '- [ ] 没做的', '',
  '```js', 'const a = 1; // 注释', '```', '',
  '| 列一 | 列二 |', '|---|--:|', '| 1 | 2 |', '',
  '$E=mc^2$', '',
  '![本地图](assets/pic.png)', '',
  '![网图](https://example.com/p.png)', '',
  '[^1]: 脚注内容', '',
].join('\n');

const convert = async (md = MD, opts: Partial<Parameters<typeof htmlToWechat>[1]> = {}) => htmlToWechat(await markdownToStaticHtml(md), { theme: indigo, ...opts });

describe('复制为公众号格式：静态 HTML → 公众号编辑器能吃的 HTML', () => {
  it('只剩行内样式：没有 class / id / data-*，外面包一层带字体、字号的 section', async () => {
    const { html } = await convert();
    expect(html.startsWith('<section style="font-family:')).toBe(true);
    expect(html).not.toMatch(/ class=| id=| data-[a-z]+=/);
    expect(html).toMatch(/<h1 style="[^"]*font-size:22px/);
    expect(html).toMatch(/<h2 style="[^"]*border-left:4px solid #4f46e5|<h1/); // 没有二级标题也行
    expect(html).toMatch(/<p style="margin:0 0 1em;/);
  });

  it('外链变上标 [n]，同一个地址只编一号，文末列「参考链接」；公众号文章的链接留着；双向链接、锚点只留字', async () => {
    const { html, stats } = await convert();
    expect(html.match(/<sup style="[^"]*">\[1\]<\/sup>/g)).toHaveLength(2);
    expect(html).not.toContain('[2]');
    expect(html).toContain('参考链接');
    expect(html).toContain('[1] 外链：https://example.com/a');
    expect(html).toMatch(/<a href="https:\/\/mp\.weixin\.qq\.com\/s\/abc" style="/);
    expect(html).not.toContain('href="https://example.com/a"');
    expect(html).not.toContain('href="#');
    expect(html).toContain('>双向链接</span>');
    expect(stats.links).toBe(2);
  });

  it('任务列表：复选框换成 ☑ / ☐，label / input 不留', async () => {
    const { html } = await convert();
    expect(html).toContain('☑ 做完的'); // 字紧跟在框后面，不换行
    expect(html).toContain('☐ 没做的');
    expect(html).not.toMatch(/<input|<label/);
    expect(html).toMatch(/<ul style="[^"]*list-style:none/);
  });

  it('提示块：按类型配色的 section，标题一行加粗', async () => {
    const { html } = await convert();
    expect(html).toMatch(/<section style="[^"]*border-left:4px solid #10b981[^"]*"><p style="[^"]*font-weight:600[^"]*">提示<\/p>/);
    expect(html).toContain('提示块正文');
  });

  it('代码块：pre 自动换行，高亮的类名换成颜色', async () => {
    const { html } = await convert();
    expect(html).toMatch(/<pre style="[^"]*white-space:pre-wrap/);
    expect(html).toContain('<span style="color:#d73a49;">const</span>');
    expect(html).toContain('<span style="color:#6a737d;font-style:italic;">// 注释</span>');
    expect(html).not.toContain('hljs');
    expect(html).toMatch(/<code style="[^"]*background:#f5f5f7[^"]*">行内代码<\/code>/);
  });

  it('表格：每格画线，右对齐的列保留对齐；外面包一层能横向滚动的 section', async () => {
    const { html } = await convert();
    expect(html).toMatch(/<section style="overflow-x:auto;[^"]*"><table style="border-collapse:collapse/);
    expect(html).toMatch(/<th style="border:1px solid #e5e5ea[^"]*text-align:right;">列二<\/th>/);
    expect(html).toMatch(/<td style="[^"]*text-align:right;">2<\/td>/);
  });

  it('公式：能画就画成图片（带尺寸），画不了留 LaTeX 原文', async () => {
    const plain = await convert();
    expect(plain.html).toMatch(/<code style="[^"]*">\$E=mc\^2\$<\/code>/);
    expect(plain.html).not.toContain('katex');
    const renderMath = vi.fn(async () => ({ dataUrl: 'data:image/png;base64,x', width: 40, height: 20 }));
    const pic = await convert(MD, { renderMath });
    expect(renderMath).toHaveBeenCalledWith('E=mc^2', false);
    expect(pic.html).toMatch(/<img src="data:image\/png;base64,x" width="40" height="20" alt="E=mc\^2" style="display:inline-block/);
    expect(pic.stats.formulas).toBe(1);
  });

  it('图片：网址原样留给公众号转存，本地图读成 data: 内嵌，读不到就留一行说明', async () => {
    const loadImage = vi.fn(async (src: string) => (src.endsWith('pic.png') ? 'data:image/png;base64,AAAA' : null));
    const { html, stats } = await convert(MD, { loadImage });
    expect(loadImage).toHaveBeenCalledWith('assets/pic.png');
    expect(html).toMatch(/<img src="data:image\/png;base64,AAAA" alt="本地图" style="display:block/);
    expect(html).toContain('src="https://example.com/p.png"');
    expect(stats).toMatchObject({ localImages: 1, remoteImages: 1, failedImages: 0 });
    const missing = await convert(MD, { loadImage: async () => null });
    expect(missing.html).toContain('[图片：本地图]');
    expect(missing.stats.failedImages).toBe(1);
  });

  it('脚注：正文里的角标只留数字，文末的脚注列表没有「↩」', async () => {
    const { html } = await convert();
    expect(html).toMatch(/脚注<sup style="[^"]*">1<\/sup>。/);
    expect(html).toContain('脚注内容');
    expect(html).not.toContain('↩');
    expect(html).not.toMatch(/<a[^>]*href="#/);
  });

  it('主题：素黑不给加粗染色、二级标题竖条是黑的；iML 紫反之', async () => {
    const md = '## 二级\n\n**重点**';
    const a = await convert(md, { theme: indigo });
    const b = await convert(md, { theme: ink });
    expect(a.html).toContain('border-left:4px solid #4f46e5');
    expect(a.html).toContain('<strong style="font-weight:700;color:#4f46e5;">重点</strong>');
    expect(b.html).toContain('border-left:4px solid #111111');
    expect(b.html).toContain('<strong style="font-weight:700;">重点</strong>');
  });

  it('纯文本备份：按块换行，粘到只收文字的地方也能看', async () => {
    const { text } = await convert('# 标题\n\n第一段 **加粗**\n\n- 一\n- 二');
    expect(text).toBe('标题\n\n第一段 加粗\n\n一\n二');
  });
});
