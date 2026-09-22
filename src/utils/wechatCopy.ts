/**
 * 「复制为公众号格式」的胶水：取当前文档的静态 HTML → 改写成公众号能吃的 HTML → 写进剪贴板。
 * 改写本身在 exportWechat.ts 里（纯 DOM，有测试）；读图、画公式这两件要浏览器的事在这里注入
 */
import { useAppStore } from '../stores/appStore';
import { markdownToStaticHtml } from './markdown';
import { expandEmbedsForExport } from './exportEmbeds';
import { noteDirOf } from './assetUrl';
import { htmlToWechat, WECHAT_THEMES, type WechatResult, type WechatTheme } from './exportWechat';
import { loadImageAsDataUrl } from './exportPdf';
import { renderMathImage } from './mathImage';

export const WECHAT_THEME_KEY = 'iml.wechat.theme';

export function themeById(id: string | null | undefined): WechatTheme {
  return WECHAT_THEMES.find((t) => t.id === id) || WECHAT_THEMES[0];
}

/** 当前活动文档按某个主题排好版。没有打开的文档时返回 null */
export async function buildWechatCopy(theme: WechatTheme): Promise<WechatResult | null> {
  useAppStore.getState().editorFlush?.();
  const { tabs, activeTabId, getNewNoteDir } = useAppStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return null;
  const staticHtml = await expandEmbedsForExport(await markdownToStaticHtml(tab.content), tab.id);
  const noteDir = noteDirOf(tab.id, getNewNoteDir());
  return htmlToWechat(staticHtml, {
    theme,
    loadImage: (src) => loadImageAsDataUrl(src, noteDir),
    renderMath: renderMathImage,
  });
}

/**
 * 把富文本写进剪贴板：先走外壳（主进程的 clipboard 不挑焦点、不要用户手势），
 * 没有外壳接口再用页面自己的 navigator.clipboard，最后退回 execCommand
 */
export async function copyRichText(html: string, text: string): Promise<void> {
  const shell = (window.api as any)?.clipboard?.writeHtml as ((h: string, t: string) => Promise<boolean>) | undefined;
  if (shell) { if (await shell(html, text)) return; }
  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return;
    } catch { /* 下面 */ }
  }
  const holder = document.createElement('div');
  holder.setAttribute('contenteditable', 'true');
  holder.setAttribute('style', 'position:fixed;left:-9999px;top:0;opacity:0;');
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const range = document.createRange();
  range.selectNodeContents(holder);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  const ok = document.execCommand('copy');
  sel?.removeAllRanges();
  holder.remove();
  if (!ok) throw new Error('剪贴板写不进去');
}
