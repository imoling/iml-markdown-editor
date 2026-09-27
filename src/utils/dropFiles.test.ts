import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createMockApi } from '../test/setup';
import { useAppStore } from '../stores/appStore';
import { handleDroppedFiles, installFileDrop, isFileDrag, openDropped } from './dropFiles';

const initialState = useAppStore.getInitialState();
const file = (name: string, type = '') => new File(['x'], name, { type });
const FILES = { '/lib/a.md': '# a', '/lib/b.txt': 'b', '/lib/sub/deep/c.md': 'c', '/other/d.md': 'd' };

let api: ReturnType<typeof createMockApi>;
beforeEach(async () => {
  useAppStore.setState({ ...initialState, tabs: [], expandedPaths: [], recentFiles: [] }, true);
  api = createMockApi(FILES);
  (window as any).api = api;
  useAppStore.setState({ defaultLibraryPath: '/lib' });
  await useAppStore.getState().loadLibrary('/lib');
});

/** jsdom 没有 DragEvent：用普通事件带上 dataTransfer 顶替 */
function drop(target: EventTarget, files: File[], types = ['Files']) {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { types, files } });
  target.dispatchEvent(event);
  return event;
}

describe('拖进窗口的文件', () => {
  it('只有拖磁盘上的文件才算：页面内拖文字不算', () => {
    expect(isFileDrag({ types: ['Files'] } as any)).toBe(true);
    expect(isFileDrag({ types: ['text/plain', 'text/html'] } as any)).toBe(false);
    expect(isFileDrag(null)).toBe(false);
  });

  it('笔记打开成标签页，别的说一声', async () => {
    await openDropped([
      { path: '/lib/a.md', isDirectory: false },
      { path: '/lib/b.txt', isDirectory: false },
      { path: '/lib/x.pdf', isDirectory: false },
    ]);
    const s = useAppStore.getState();
    expect(s.tabs.map((t) => t.id)).toEqual(['/lib/a.md', '/lib/b.txt']);
    expect(s.workspacePath).toBe('/lib');
    expect(s.notice?.text).toBe('打不开 x.pdf：只认 Markdown 和纯文本文件');
  });

  it('文件夹在当前笔记库里：不换库，在文件树里一路展开到它', async () => {
    useAppStore.setState({ sidebarTab: 'search', sidebarVisible: false });
    await openDropped([{ path: '/lib/sub/deep/', isDirectory: true }]);
    const s = useAppStore.getState();
    expect(s.workspacePath).toBe('/lib');
    expect(s.defaultLibraryPath).toBe('/lib');
    expect(s).toMatchObject({ sidebarTab: 'library', sidebarVisible: true, selectedNodePath: '/lib/sub/deep' });
    expect(s.expandedPaths).toEqual(expect.arrayContaining(['/lib', '/lib/sub', '/lib/sub/deep']));
    expect(api.app.saveSettings).not.toHaveBeenCalled();
    expect(s.notice).toBeNull();
  });

  it('文件夹在别处：先问一句，点了「切换」才换库；一起拖进来的笔记照常打开', async () => {
    await openDropped([{ path: '/other/', isDirectory: true }, { path: '/other/d.md', isDirectory: false }]);
    let s = useAppStore.getState();
    expect(s.libraryToConfirm).toBe('/other');
    expect(s).toMatchObject({ workspacePath: '/lib', defaultLibraryPath: '/lib', notice: null });
    expect(api.app.saveSettings).not.toHaveBeenCalled();
    expect(s.tabs.map((t) => t.id)).toEqual(['/other/d.md']);

    expect(await s.switchLibrary('/other')).toBe(true);
    await vi.waitFor(() => expect(useAppStore.getState().workspacePath).toBe('/other'));
    s = useAppStore.getState();
    expect(s).toMatchObject({ defaultLibraryPath: '/other', libraryToConfirm: null, recentLibraries: ['/other', '/lib'] });
    expect(api.app.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ defaultLibraryPath: '/other' }));
    expect(s.notice).toMatchObject({ text: '已切换到笔记库：other' });
  });

  it('问的时候点了取消：什么都没变', async () => {
    await openDropped([{ path: '/other', isDirectory: true }]);
    useAppStore.setState({ libraryToConfirm: null });
    expect(useAppStore.getState()).toMatchObject({ workspacePath: '/lib', defaultLibraryPath: '/lib', recentLibraries: [] });
    expect(api.app.saveSettings).not.toHaveBeenCalled();
  });

  it('拖的就是当前笔记库：什么都不变，只把文件树亮出来', async () => {
    useAppStore.setState({ sidebarTab: 'tags', sidebarVisible: false });
    await openDropped([{ path: '/lib', isDirectory: true }]);
    expect(useAppStore.getState()).toMatchObject({ workspacePath: '/lib', sidebarTab: 'library', sidebarVisible: true, notice: null, libraryToConfirm: null });
    expect(api.app.saveSettings).not.toHaveBeenCalled();
  });

  it('问不到路径（拖来的东西不在磁盘上）：说一声，什么都不开', async () => {
    await handleDroppedFiles([file('a.md')]);
    expect(useAppStore.getState().tabs).toEqual([]);
    expect(useAppStore.getState().notice?.text).toBe('打不开 a.md：它不在磁盘上，先存下来再拖进来');
  });

  it('装到 window 上：非图片的文件交去问路径再打开，并拦住默认行为（不拦窗口会跳走）', async () => {
    api.app.droppedPaths.mockImplementation(async (files: File[]) => files.map((f) => ({ path: `/lib/${f.name}`, isDirectory: false })));
    const uninstall = installFileDrop();
    try {
      const event = drop(document.body, [file('shot.png', 'image/png'), file('a.md')]);
      expect(event.defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(['/lib/a.md']));
      expect(api.app.droppedPaths.mock.calls[0][0].map((f: File) => f.name)).toEqual(['a.md']);
    } finally { uninstall(); }
  });

  it('图片落在编辑区的空白处（笔记短，正文只占上面一小块）：接到正文末尾；没有开着的笔记就说一声', () => {
    const appendImage = vi.fn();
    const area = document.createElement('main');
    area.className = 'editor-area';
    const blank = area.appendChild(document.createElement('div'));
    document.body.appendChild(area);
    const uninstall = installFileDrop();
    try {
      useAppStore.setState({ activeTabId: '/lib/a.md', editorActions: { insertText: () => true, startList: () => {}, appendImage } });
      const shot = file('shot.png', 'image/png');
      const event = drop(blank, [shot]);
      expect(event.defaultPrevented).toBe(true);
      expect(appendImage).toHaveBeenCalledExactlyOnceWith(shot);
      expect(useAppStore.getState().notice).toBeNull();

      // 起始页也在编辑区里，但没有笔记可插
      useAppStore.setState({ activeTabId: null, editorActions: null });
      drop(blank, [shot]);
      expect(appendImage).toHaveBeenCalledTimes(1);
      expect(useAppStore.getState().notice?.text).toBe('把图片拖到正文里，才会插进笔记');
    } finally { uninstall(); area.remove(); }
  });

  it('图片：编辑器接走了就不管；落在正文外面的说一声；页面内拖文字不碰', () => {
    const uninstall = installFileDrop();
    try {
      // 编辑器先处理并 preventDefault
      const editor = document.createElement('div');
      document.body.appendChild(editor);
      editor.addEventListener('drop', (e) => e.preventDefault());
      drop(editor, [file('shot.png', 'image/png')]);
      expect(useAppStore.getState().notice).toBeNull();

      drop(document.body, [file('shot.png', 'image/png')]);
      expect(useAppStore.getState().notice?.text).toBe('把图片拖到正文里，才会插进笔记');

      const text = drop(document.body, [], ['text/plain']);
      expect(text.defaultPrevented).toBe(false);
      expect(api.app.droppedPaths).not.toHaveBeenCalled();
      editor.remove();
    } finally { uninstall(); }
  });

  it('「插入图片」对话框里那块地方留给它自己', async () => {
    const uninstall = installFileDrop();
    try {
      const zone = document.createElement('div');
      zone.className = 'dropzone';
      document.body.appendChild(zone);
      const event = drop(zone, [file('a.md')]);
      expect(event.defaultPrevented).toBe(true);
      await new Promise((r) => setTimeout(r, 10));
      expect(api.app.droppedPaths).not.toHaveBeenCalled();
      zone.remove();
    } finally { uninstall(); }
  });
});
