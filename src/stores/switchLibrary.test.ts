import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createMockApi } from '../test/setup';
import { useAppStore } from './appStore';

const initialState = useAppStore.getInitialState();
let api: ReturnType<typeof createMockApi>;

beforeEach(async () => {
  useAppStore.setState({ ...initialState, tabs: [], expandedPaths: [], recentFiles: [] }, true);
  api = createMockApi({ '/lib/a.md': '# a', '/work/b.md': '# b', '/home/c.md': '# c' });
  (window as any).api = api;
  api.app.getSettings.mockResolvedValue({ defaultLibraryPath: '/lib', recentLibraries: ['/lib', '/work', '/gone'] } as never);
  await useAppStore.getState().loadSettings();
});

describe('切换笔记库', () => {
  it('启动时读到最近的笔记库；设置里没有这一项（旧版本）就只有当前这个', async () => {
    expect(useAppStore.getState().recentLibraries).toEqual(['/lib', '/work', '/gone']);
    api.app.getSettings.mockResolvedValue({ defaultLibraryPath: '/lib' } as never);
    await useAppStore.getState().loadSettings();
    expect(useAppStore.getState().recentLibraries).toEqual(['/lib']);
  });

  it('换到名单里的另一个：文件树、设置、名单都跟着变，当前的排到第一', async () => {
    expect(await useAppStore.getState().switchLibrary('/work')).toBe(true);
    await vi.waitFor(() => expect(useAppStore.getState().workspacePath).toBe('/work'));
    const s = useAppStore.getState();
    expect(s.fileTree.map((n) => n.name)).toEqual(['b.md']);
    expect(s.recentLibraries).toEqual(['/work', '/lib', '/gone']);
    expect(api.app.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ defaultLibraryPath: '/work' }));
    expect(s.notice?.text).toBe('已切换到笔记库：work');
  });

  it('换到当前这个：什么都不做', async () => {
    expect(await useAppStore.getState().switchLibrary('/lib/')).toBe(true);
    expect(api.app.saveSettings).not.toHaveBeenCalled();
    expect(useAppStore.getState().notice).toBeNull();
  });

  it('目录不在了（删了、磁盘没接上）：不换，说一声，从名单里拿掉', async () => {
    expect(await useAppStore.getState().switchLibrary('/gone')).toBe(false);
    const s = useAppStore.getState();
    expect(s).toMatchObject({ workspacePath: '/lib', defaultLibraryPath: '/lib', recentLibraries: ['/lib', '/work'] });
    expect(api.app.saveSettings).toHaveBeenCalledExactlyOnceWith({ recentLibraries: ['/lib', '/work'] });
    expect(s.notice?.text).toBe('切换失败：找不到「gone」，已从最近的笔记库里去掉');
  });

  it('从菜单选文件夹（切换笔记库…）：走的是同一条路；取消了就什么都不变', async () => {
    api.dialog.open.mockResolvedValueOnce(null as never);
    await useAppStore.getState().openDirectory();
    expect(useAppStore.getState().workspacePath).toBe('/lib');
    api.dialog.open.mockResolvedValueOnce(['/home'] as never);
    await useAppStore.getState().openDirectory();
    await vi.waitFor(() => expect(useAppStore.getState().workspacePath).toBe('/home'));
    expect(useAppStore.getState().recentLibraries).toEqual(['/home', '/lib', '/work', '/gone']);
  });
});
