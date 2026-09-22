import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useAppStore } from '../stores/appStore';
import { exportActiveTabToPdf, exportActiveTabToImage, exportActiveTabToHtml } from './exportPdf';

// 公式样式的真身要读打包后的字体文件，jsdom 里没有；这里只管「有公式才带、带在正文前面」这条规则
const katexStyles = vi.fn(async (_withFonts: boolean) => '.katex{font:1.21em KaTeX_Main}');
vi.mock('./katexExport', () => ({ katexStyles: (withFonts: boolean) => katexStyles(withFonts) }));

const initialState = useAppStore.getInitialState();

beforeEach(() => {
  useAppStore.setState({ ...initialState, tabs: [{ id: '/lib/a.md', title: 'a.md', content: '# 甲\n\n正文', isDirty: false, mode: 'word' }], activeTabId: '/lib/a.md' }, true);
  (window.api.export.open as any).mockClear();
  (window.api.export.reveal as any).mockClear();
});

describe('导出成功后的提示', () => {
  it('导出 PDF：提示带「打开」和「在访达中显示」，点了就调用对应接口', async () => {
    (window.api.export.pdf as any).mockResolvedValueOnce({ success: true, path: '/out/a.pdf' });
    await exportActiveTabToPdf();
    const notice = useAppStore.getState().notice!;
    expect(notice.text).toBe('已导出 PDF');
    expect(notice.actions?.map((a) => a.label)).toEqual(['打开', '在访达中显示']);
    notice.actions![0].run();
    notice.actions![1].run();
    expect(window.api.export.open).toHaveBeenCalledWith('/out/a.pdf');
    expect(window.api.export.reveal).toHaveBeenCalledWith('/out/a.pdf');
  });

  it('长图分成几张时只给「在访达中显示」，指向第一张', async () => {
    (window.api.export.image as any).mockResolvedValueOnce({ success: true, path: '/out/a-1.png', paths: ['/out/a-1.png', '/out/a-2.png'] });
    await exportActiveTabToImage();
    const notice = useAppStore.getState().notice!;
    expect(notice.text).toBe('笔记很长，分成了 2 张图');
    expect(notice.actions?.map((a) => a.label)).toEqual(['在访达中显示']);
    notice.actions![0].run();
    expect(window.api.export.reveal).toHaveBeenCalledWith('/out/a-1.png');
    expect(window.api.export.open).not.toHaveBeenCalled();
  });

  it('取消保存对话框：不提示；失败：提示错误、没有按钮', async () => {
    (window.api.export.html as any).mockResolvedValueOnce({ success: false, canceled: true });
    await exportActiveTabToHtml();
    expect(useAppStore.getState().notice).toBeNull();
    (window.api.export.html as any).mockResolvedValueOnce({ success: false, error: '磁盘满了' });
    await exportActiveTabToHtml();
    expect(useAppStore.getState().notice).toMatchObject({ text: '导出失败：磁盘满了' });
    expect(useAppStore.getState().notice?.actions).toBeUndefined();
  });
});

describe('导出里的公式（issue：主版本导出的 PDF / HTML / 长图里公式没有样式）', () => {
  beforeEach(() => { katexStyles.mockClear(); (window.api.export.pdf as any).mockClear(); (window.api.export.html as any).mockClear(); (window.api.export.image as any).mockClear(); });

  it('文档里有公式：PDF、长图、HTML 三条路都把 KaTeX 的样式（连字体）放在正文前面的 <style> 里', async () => {
    useAppStore.setState({ tabs: [{ id: '/lib/m.md', title: 'm.md', content: '# 甲\n\n质能方程 $E=mc^2$\n\n$$\\int_0^1 x\\,dx$$', isDirty: false, mode: 'word' }], activeTabId: '/lib/m.md' });
    await exportActiveTabToPdf();
    await exportActiveTabToImage();
    await exportActiveTabToHtml();
    for (const api of [window.api.export.pdf, window.api.export.image, window.api.export.html]) {
      const html = (api as any).mock.calls[0][0] as string;
      expect(html.startsWith('<style>.katex{font:1.21em KaTeX_Main}</style>')).toBe(true);
      expect(html).toContain('class="katex');
    }
    expect(katexStyles).toHaveBeenCalledWith(true); // 隐藏窗口 / 别的电脑上看，字体要一起带
  });

  it('没有公式的文档一个字节都不多带', async () => {
    await exportActiveTabToPdf();
    const html = (window.api.export.pdf as any).mock.calls[0][0] as string;
    expect(html.startsWith('<style>')).toBe(false);
    expect(katexStyles).not.toHaveBeenCalled();
  });
});
