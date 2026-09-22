/**
 * 把一条公式画成 PNG（data: 地址）：公众号编辑器没有 KaTeX 的字体，公式只能当图片贴。
 * 做法和长图一样：KaTeX 的 HTML + 样式 + 内联字体包进 SVG 的 <foreignObject>，当图片画到画布上，2 倍清晰度。
 * 尺寸先在页面里量（界面本来就加载了 KaTeX 的样式）。任何一步不行都返回 null，由调用方退回 LaTeX 原文
 */
import katex from 'katex';
import { katexStyles } from './katexExport';

const XHTML = 'http://www.w3.org/1999/xhtml';
const FONT_SIZE = 16;
const SCALE = 2;
let cssPromise: Promise<string> | null = null;

export async function renderMathImage(latex: string, display: boolean): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const html = katex.renderToString(latex, { displayMode: display, throwOnError: false });
    const boxStyle = `display:inline-block;font-size:${FONT_SIZE}px;line-height:1.2;color:#333;padding:2px 4px;white-space:nowrap;`;
    // 量尺寸
    const probe = document.createElement('div');
    probe.setAttribute('style', `position:absolute;left:-99999px;top:0;${boxStyle}`);
    probe.innerHTML = html;
    document.body.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    if (!width || !height) return null;
    cssPromise ||= katexStyles(true);
    const css = await cssPromise;
    if (!css) return null;
    // SVG 里的东西得是 XHTML：样式和公式都放进带命名空间的 div 里再序列化
    const box = document.createElementNS(XHTML, 'div');
    box.setAttribute('style', boxStyle);
    const style = document.createElementNS(XHTML, 'style');
    style.textContent = css;
    box.appendChild(style);
    const inner = document.createElementNS(XHTML, 'div');
    inner.innerHTML = html;
    box.appendChild(inner);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="${width}" height="${height}">${new XMLSerializer().serializeToString(box)}</foreignObject></svg>`;
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('svg decode failed')); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; });
    const canvas = document.createElement('canvas');
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/png'), width, height };
  } catch (err) {
    console.warn('[wechat] formula image failed:', err);
    return null;
  }
}
