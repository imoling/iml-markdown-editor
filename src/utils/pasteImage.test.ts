import { describe, expect, it, beforeEach } from 'vitest';
import { createMockApi } from '../test/setup';
import { useAppStore } from '../stores/appStore';
import { persistDataUrl, storeImageFile } from './pasteImage';
import { htmlToMarkdown, markdownToHtml } from './markdown';
import { deriveNoteTitle } from './noteTitle';

const initialState = useAppStore.getInitialState();
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const png = (name = '截图.png') => new File([PNG], name, { type: 'image/png' });
const DATA_URL = `data:image/png;base64,${btoa(String.fromCharCode(...PNG))}`;

let api: ReturnType<typeof createMockApi>;
beforeEach(() => {
  useAppStore.setState({ ...initialState, tabs: [], expandedPaths: [], recentFiles: [] }, true);
  api = createMockApi({ '/lib/a.md': '' });
  api.fs.saveImage.mockImplementation(async (_owner: string, name: string) => ({ success: true, path: `assets/${name}`, bytes: PNG.length }));
  (window as any).api = api;
});

describe('图片存放位置', () => {
  it('默认：存进笔记旁的 assets/，正文里是相对路径；没保存过又没有笔记库的，没地方放', async () => {
    expect(await storeImageFile(png(), '/lib/a.md')).toBe('assets/截图.png');
    expect(api.fs.saveImage).toHaveBeenCalledTimes(1);
    expect(await storeImageFile(png(), 'new-1')).toBeNull();
  });

  it('选了「笔记里」：不落文件，返回 data: 地址；没保存过、没有笔记库也能插', async () => {
    useAppStore.setState({ imageStorage: 'inline' });
    expect(await storeImageFile(png(), '/lib/a.md')).toBe(DATA_URL);
    expect(await storeImageFile(png(), 'new-1')).toBe(DATA_URL);
    expect(api.fs.saveImage).not.toHaveBeenCalled();
    expect(useAppStore.getState().notice?.text).toBe('图片已写进笔记：1 KB');
  });

  it('本地上传、AI 生成的（拿到的是 data: 地址）：跟着同一个设置走', async () => {
    expect(await persistDataUrl(DATA_URL, '/lib/a.md', '示意图')).toBe('assets/示意图.png');
    useAppStore.setState({ imageStorage: 'inline' });
    expect(await persistDataUrl(DATA_URL, 'new-1', '示意图')).toBe(DATA_URL);
    expect(api.fs.saveImage).toHaveBeenCalledTimes(1);
  });

  it('写进笔记里的图片，富文本往返一遍不丢、不变——一张真截图那么大的也一样', () => {
    for (const url of [DATA_URL, `data:image/webp;base64,${'QUJD'.repeat(200_000)}`]) {
      const md = `前一段\n\n![示意图](${url})\n\n后一段`;
      const html = markdownToHtml(md);
      expect(html.includes(`src="${url}"`)).toBe(true);
      expect(htmlToMarkdown(html).includes(`![示意图](${url})`)).toBe(true);
    }
  });

  it('新笔记第一行就是图：文件名不从那一长串里取', () => {
    const url = `data:image/webp;base64,${'QUJD'.repeat(1000)}`;
    expect(deriveNoteTitle(`![](${url})\n\n周会纪要`)).toBe('周会纪要');
    expect(deriveNoteTitle(`![白板照片](${url})`)).toBe('白板照片');
  });

  it('设置里存的值不认识（旧版本、手改坏了）：按默认的来', async () => {
    api.app.getSettings.mockResolvedValue({ imageStorage: 'somewhere' } as never);
    await useAppStore.getState().loadSettings();
    expect(useAppStore.getState().imageStorage).toBe('assets');
    api.app.getSettings.mockResolvedValue({ imageStorage: 'inline' } as never);
    await useAppStore.getState().loadSettings();
    expect(useAppStore.getState().imageStorage).toBe('inline');
  });
});
