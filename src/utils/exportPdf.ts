import { useAppStore } from '../stores/appStore';
import { markdownToStaticHtml } from './markdown';
import { expandEmbedsForExport } from './exportEmbeds';
import { katexStyles } from './katexExport';
import { resolveAssetUrl, noteDirOf } from './assetUrl';
import type { NoticeAction } from '../stores/appStore';

const REVEAL_LABEL = window.api.app.platform === 'darwin' ? '在访达中显示' : '在资源管理器中显示';

/**
 * 「已导出」的提示带两个按钮：打开文件、在访达里选中它——导出到哪去了，不用再翻文件夹找。
 * 分成好几张的长图只给「显示」：打开只能开一张，不如在文件夹里一起看。
 */
function notifyExported(text: string, paths: string[]) {
  const [first] = paths;
  const actions: NoticeAction[] = [];
  if (paths.length === 1) actions.push({ label: '打开', run: () => { void window.api.export.open(first); } });
  actions.push({ label: REVEAL_LABEL, run: () => { void window.api.export.reveal(first); } });
  useAppStore.getState().notify(text, undefined, actions);
}

/**
 * 文档里有公式时，把 KaTeX 的样式和字体随导出的 HTML 一起带上（放在正文前面的 <style> 里，外壳不用改）：
 * 导出是在另一个隐藏窗口里排版、或者拿到别的电脑上看的，界面已经加载的字体帮不上忙。没有公式的文档一个字节都不多带
 */
async function withMathStyles(html: string): Promise<string> {
  if (!/class="katex/.test(html)) return html;
  const css = await katexStyles(true);
  return css ? `<style>${css}</style>${html}` : html;
}

/** 把当前活动文档导出为 PDF（菜单与 ⌘P 共用） */
export async function exportActiveTabToPdf(): Promise<void> {
  // 编辑器写回是防抖的，导出前先刷新到 store
  useAppStore.getState().editorFlush?.();
  const { tabs, activeTabId } = useAppStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return;
  const staticHtml = await withMathStyles(await expandEmbedsForExport(await markdownToStaticHtml(tab.content), tab.id));
  const result = await window.api.export.pdf(staticHtml, tab.title, tab.id);
  if (result?.success && result.path) notifyExported('已导出 PDF', [result.path]);
  else if (result && !result.canceled) useAppStore.getState().notify(`导出失败：${result.error || '未知错误'}`);
}

/** 导出为长图（PNG）：发群里、发朋友圈用。很长的笔记会自动分成几张 */
export async function exportActiveTabToImage(): Promise<void> {
  useAppStore.getState().editorFlush?.();
  const { tabs, activeTabId, notify } = useAppStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return;
  notify('正在生成长图…', 60000);
  const staticHtml = await withMathStyles(await expandEmbedsForExport(await markdownToStaticHtml(tab.content), tab.id));
  const result = await window.api.export.image(staticHtml, tab.title, tab.id);
  if (result?.success && result.path) notifyExported(result.paths && result.paths.length > 1 ? `笔记很长，分成了 ${result.paths.length} 张图` : '已导出长图', result.paths?.length ? result.paths : [result.path]);
  else if (result?.canceled) useAppStore.setState({ notice: null });
  else notify(`导出失败：${result?.error || '未知错误'}`);
}

const MAX_DOCX_IMAGE_PIXELS = 1600;

/**
 * 给 Word 导出取一张图：不管原来是什么格式（webp、avif、svg、gif…）都画到画布上转成 PNG——Word 和 WPS 都认。
 * 本地图片走 fetch 拿字节再转成 data: 地址去加载：直接拿 iml-asset:// 当 <img> 的地址画到画布上，画布会被当成跨源而「污染」，导不出来。
 */
async function loadImageAsPng(src: string, noteDir: string | null): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  try {
    let dataUrl: string;
    if (src.startsWith('svg:')) dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src.slice(4))}`;
    else if (src.startsWith('data:')) dataUrl = src;
    else {
      const blob = await (await fetch(resolveAssetUrl(src, noteDir))).blob();
      dataUrl = await new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
    }
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('decode failed')); img.src = dataUrl; });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const scale = Math.min(1, MAX_DOCX_IMAGE_PIXELS / w);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const g = canvas.getContext('2d');
    if (!g) return null;
    g.fillStyle = '#fff'; // 透明底的图在 Word 的深色界面里会是一团黑
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) return null;
    return { data: new Uint8Array(await png.arrayBuffer()), width: canvas.width, height: canvas.height };
  } catch {
    return null; // 取不到的图在文档里留一行说明，不让整个导出失败
  }
}

/** 导出为 Word（.docx）：标题、列表、表格、代码、图片都转成 Word 自己的结构，WPS / Pages 也能开 */
export async function exportActiveTabToDocx(): Promise<void> {
  useAppStore.getState().editorFlush?.();
  const { tabs, activeTabId, notify, getNewNoteDir } = useAppStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return;
  notify('正在生成 Word 文档…', 60000);
  try {
    const staticHtml = await expandEmbedsForExport(await markdownToStaticHtml(tab.content), tab.id);
    const noteDir = noteDirOf(tab.id, getNewNoteDir());
    const { htmlToDocx } = await import('./exportDocx');
    const bytes = await htmlToDocx(staticHtml, { title: tab.title.replace(/\.(md|markdown|mdown|mkd|txt)$/i, ''), loadImage: (src) => loadImageAsPng(src, noteDir) });
    const result = await window.api.export.saveFile(tab.title, bytes, 'Word 文档', 'docx');
    if (result?.success && result.path) notifyExported('已导出 Word 文档', [result.path]);
    else if (result?.canceled) useAppStore.setState({ notice: null });
    else notify(`导出失败：${result?.error || '未知错误'}`);
  } catch (err: any) {
    notify(`导出失败：${err?.message || err}`);
  }
}

/** 导出为单文件 HTML（本地图片内联，拷到哪里都能看）；frontmatter 作为属性卡片保留 */
export async function exportActiveTabToHtml(): Promise<void> {
  useAppStore.getState().editorFlush?.();
  const { tabs, activeTabId, notify } = useAppStore.getState();
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return;
  const staticHtml = await withMathStyles(await expandEmbedsForExport(await markdownToStaticHtml(tab.content, { keepFrontmatter: true }), tab.id));
  const result = await window.api.export.html(staticHtml, tab.title, tab.id);
  if (result?.success && result.path) notifyExported('已导出 HTML', [result.path]);
  else if (result && !result.canceled) notify(`导出失败：${result.error || '未知错误'}`);
}
