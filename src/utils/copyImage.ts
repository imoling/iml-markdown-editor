import type { Node as PMNode } from '@tiptap/pm/model';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { useAppStore } from '../stores/appStore';
import { currentNoteDir } from './currentNoteDir';
import { loadImageAsPng } from './exportPdf';

const pngBlob = async (src: string, noteDir: string | null): Promise<Blob> => {
  const png = await loadImageAsPng(src, noteDir);
  if (!png) throw new Error('图片读不出来');
  return new Blob([png.data as BlobPart], { type: 'image/png' });
};

const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/** 文字连着图片一起复制：图片换成 data: 地址，贴到微信、Word 里才有图；data-note-src 留着原地址，贴回笔记时还原 */
async function htmlWithImages(dom: HTMLElement, noteDir: string | null): Promise<Blob> {
  await Promise.all([...dom.querySelectorAll('img')].map(async (img) => {
    const src = img.getAttribute('src');
    if (!src) return;
    const url = await pngBlob(src, noteDir).then(dataUrl).catch(() => null);
    if (!url) return; // 这张读不出来就留着原地址，不耽误别的
    img.setAttribute('data-note-src', src);
    img.setAttribute('src', url);
  }));
  return new Blob([dom.innerHTML], { type: 'text/html' });
}

/**
 * 选区里有图片时接管复制。ProseMirror 自己写进剪贴板的是 assets/a.png 这种相对地址，出了这篇笔记谁也看不到图。
 * 单选一张图写真正的图片；文字连图片写带图的 HTML。
 */
export function copyImageSelection(view: EditorView, event: ClipboardEvent): boolean {
  const { selection } = view.state;
  if (selection.empty) return false;
  const slice = selection.content();
  const single = selection instanceof NodeSelection && selection.node.type.name === 'image' ? (selection.node as PMNode) : null;
  let hasImage = !!single;
  if (!single) slice.content.descendants((node) => { hasImage ||= node.type.name === 'image'; return !hasImage; });
  if (!hasImage) return false;

  event.preventDefault();
  const noteDir = currentNoteDir();
  // 壳自己能写系统剪贴板就走壳：WKWebView 的剪贴板接口对手势的要求更严，写不进去也不报在明面上
  const shell = window.api.clipboard;
  let written: Promise<unknown>;
  if (single) {
    const png = pngBlob(single.attrs.src, noteDir);
    written = shell?.writeImage
      ? png.then((blob) => blob.arrayBuffer()).then(shell.writeImage)
      : navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  } else {
    const { dom, text } = view.serializeForClipboard(slice);
    const html = htmlWithImages(dom, noteDir);
    written = shell?.writeImage
      ? html.then((blob) => blob.text()).then((markup) => shell.writeHtml(markup, text))
      : navigator.clipboard.write([new ClipboardItem({ 'text/html': html, 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
  }
  written.catch((err) => {
    console.warn('[copy image]', err);
    useAppStore.getState().notify('复制图片失败：图片读不出来');
  });
  return true;
}
