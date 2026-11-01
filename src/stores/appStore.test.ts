import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createMockApi } from '../test/setup';
import { useAppStore, readLibraryDir } from './appStore';

const LIB = '/lib';
const initialState = useAppStore.getInitialState();

function useApi(files: Record<string, string>) {
  const api = createMockApi(files);
  (window as any).api = api;
  return api;
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({ ...initialState, tabs: [], expandedPaths: [], starredFiles: [], recentFiles: [] }, true);
});

describe('updateTabContent', () => {
  it('内容没变时不把标签页标脏', () => {
    useAppStore.setState({ tabs: [{ id: '/lib/a.md', title: 'a', content: 'x', isDirty: false, mode: 'word' }] });
    useAppStore.getState().updateTabContent('/lib/a.md', 'x');
    expect(useAppStore.getState().tabs[0].isDirty).toBe(false);
    useAppStore.getState().updateTabContent('/lib/a.md', 'y');
    expect(useAppStore.getState().tabs[0]).toMatchObject({ content: 'y', isDirty: true });
  });
});

describe('editTabContent：编辑器之外的功能改写笔记（转写、纪要）', () => {
  it('先把编辑器里没写回的字刷进来，再基于最新内容改；并留下记号让富文本编辑器重载', () => {
    useAppStore.setState({ tabs: [{ id: '/lib/a.md', title: 'a', content: '旧', isDirty: false, mode: 'word' }] });
    // 模拟编辑器里还压着 150ms 防抖没写回的字
    useAppStore.getState().registerEditorFlush(() => useAppStore.getState().updateTabContent('/lib/a.md', '旧 + 刚打的字'));
    expect(useAppStore.getState().editTabContent('/lib/a.md', (c) => `${c}\n\n转写块`)).toBe(true);
    expect(useAppStore.getState().tabs[0]).toMatchObject({ content: '旧 + 刚打的字\n\n转写块', isDirty: true });
    expect(useAppStore.getState().externalWrite).toEqual({ id: '/lib/a.md', rev: 1 });
    useAppStore.getState().editTabContent('/lib/a.md', (c) => `${c}!`);
    expect(useAppStore.getState().externalWrite?.rev).toBe(2);
  });

  it('内容没变不留记号；笔记已经关掉返回 false', () => {
    useAppStore.setState({ tabs: [{ id: '/lib/a.md', title: 'a', content: 'x', isDirty: false, mode: 'word' }] });
    expect(useAppStore.getState().editTabContent('/lib/a.md', (c) => c)).toBe(true);
    expect(useAppStore.getState().externalWrite).toBeNull();
    expect(useAppStore.getState().tabs[0].isDirty).toBe(false);
    expect(useAppStore.getState().editTabContent('/lib/gone.md', () => 'y')).toBe(false);
  });
});

describe('查找面板开关', () => {
  it('⌘F：开 → 有替换时收起替换 → 关闭并清空查找词', () => {
    const s = useAppStore.getState();
    s.toggleFind();
    expect(useAppStore.getState()).toMatchObject({ findVisible: true, replaceVisible: false });
    s.toggleReplace();
    expect(useAppStore.getState()).toMatchObject({ findVisible: true, replaceVisible: true });
    s.setSearch({ query: 'abc', total: 3, current: 1 });
    s.toggleFind();
    expect(useAppStore.getState()).toMatchObject({ findVisible: true, replaceVisible: false });
    s.toggleFind();
    expect(useAppStore.getState()).toMatchObject({ findVisible: false, replaceVisible: false });
    expect(useAppStore.getState().search).toMatchObject({ query: '', total: 0, current: 0 });
  });

  it('命令被消费后清空，计数只在变化时更新', () => {
    const s = useAppStore.getState();
    s.sendSearchCommand('replaceAll');
    expect(useAppStore.getState().searchCommand).toEqual({ type: 'replaceAll' });
    s.consumeSearchCommand();
    expect(useAppStore.getState().searchCommand).toBeNull();
    const before = useAppStore.getState().search;
    s.setSearchCounts(0, 0);
    expect(useAppStore.getState().search).toBe(before);
  });
});

describe('笔记库', () => {
  it('readLibraryDir 过滤隐藏文件和非笔记文件，保留文件夹', async () => {
    useApi({ '/lib/a.md': '', '/lib/.DS_Store': '', '/lib/pic.png': '', '/lib/sub/b.txt': '', '/lib/sub/c.md': '' });
    const nodes = await readLibraryDir(LIB);
    expect(nodes?.map((n) => n.name).sort()).toEqual(['a.md', 'sub']);
  });

  it('loadLibrary 设树根并开始监听；setActiveTab 不再改变树根', async () => {
    const api = useApi({ '/lib/a.md': 'A', '/lib/sub/b.md': 'B', '/other/x.md': 'X' });
    await useAppStore.getState().loadLibrary(LIB);
    expect(useAppStore.getState().workspacePath).toBe(LIB);
    expect(api.library.watch).toHaveBeenCalledWith(LIB);
    useAppStore.getState().openTab({ id: '/other/x.md', title: 'x', content: 'X', isDirty: false, mode: 'word' });
    await new Promise((r) => setTimeout(r, 0));
    expect(useAppStore.getState().workspacePath).toBe(LIB);
  });

  it('打开子目录文件时自动展开祖先并加载子节点', async () => {
    useApi({ '/lib/a.md': 'A', '/lib/sub/deep/b.md': 'B' });
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().setActiveTab('/lib/sub/deep/b.md');
    const { expandedPaths, fileTree } = useAppStore.getState();
    expect(expandedPaths).toEqual(expect.arrayContaining([LIB, '/lib/sub', '/lib/sub/deep']));
    const sub = fileTree.find((n) => n.name === 'sub');
    expect(sub?.children?.[0].name).toBe('deep');
  });

  it('createNoteIn 同名自动加序号', async () => {
    const api = useApi({ '/lib/未命名笔记.md': '' });
    await useAppStore.getState().loadLibrary(LIB);
    const created = await useAppStore.getState().createNoteIn(LIB);
    expect(created).toBe('/lib/未命名笔记 2.md');
    expect(api.files.has('/lib/未命名笔记 2.md')).toBe(true);
    expect(useAppStore.getState().renamingPath).toBe(created);
  });

  it('重命名目录时其下的标签页与收藏路径一并改写', async () => {
    useApi({ '/lib/sub/b.md': 'B' });
    await useAppStore.getState().loadLibrary(LIB);
    useAppStore.setState({
      tabs: [{ id: '/lib/sub/b.md', title: 'b', content: 'B', isDirty: false, mode: 'word' }],
      activeTabId: '/lib/sub/b.md',
      starredFiles: ['/lib/sub/b.md'],
    });
    await useAppStore.getState().renameFile('/lib/sub', 'renamed');
    const s = useAppStore.getState();
    expect(s.tabs[0].id).toBe('/lib/renamed/b.md');
    expect(s.activeTabId).toBe('/lib/renamed/b.md');
    expect(s.starredFiles).toEqual(['/lib/renamed/b.md']);
  });
});

describe('外部改动', () => {
  it('未修改的标签页跟随磁盘，有未保存修改的标签页只打标记', async () => {
    const api = useApi({ '/lib/a.md': 'A2', '/lib/b.md': 'B2' });
    await useAppStore.getState().loadLibrary(LIB);
    useAppStore.setState({
      tabs: [
        { id: '/lib/a.md', title: 'a', content: 'A1', isDirty: false, mode: 'word' },
        { id: '/lib/b.md', title: 'b', content: 'B1', isDirty: true, mode: 'word' },
      ],
    });
    await useAppStore.getState().handleExternalChanges(['/lib/a.md', '/lib/b.md']);
    const [a, b] = useAppStore.getState().tabs;
    expect(a).toMatchObject({ content: 'A2', isDirty: false, externallyModified: false });
    expect(b).toMatchObject({ content: 'B1', isDirty: true, externallyModified: true });
    api.files.delete('/lib/a.md');
    await useAppStore.getState().handleExternalChanges(['/lib/a.md']);
    expect(useAppStore.getState().tabs[0]).toMatchObject({ externallyModified: true, diskMissing: true });
  });

  it('跟随磁盘时留下记号：光标在编辑器里也要重载，不然屏幕上是旧的', async () => {
    useApi({ '/lib/a.md': 'A2' });
    useAppStore.setState({ tabs: [{ id: '/lib/a.md', title: 'a', content: 'A1', isDirty: false, mode: 'word' }] });
    await useAppStore.getState().handleExternalChanges(['/lib/a.md']);
    expect(useAppStore.getState().externalWrite).toEqual({ id: '/lib/a.md', rev: 1 });
  });

  it('编辑器里防抖压着的字算改动：不被磁盘内容冲掉', async () => {
    useApi({ '/lib/a.md': 'A2' });
    useAppStore.setState({ tabs: [{ id: '/lib/a.md', title: 'a', content: 'A1', isDirty: false, mode: 'word', diskSig: 'old' }] });
    useAppStore.getState().registerEditorFlush(() => useAppStore.getState().updateTabContent('/lib/a.md', 'A1 + 刚打的字'));
    await useAppStore.getState().handleExternalChanges(['/lib/a.md']);
    expect(useAppStore.getState().tabs[0]).toMatchObject({ content: 'A1 + 刚打的字', isDirty: true, externallyModified: true });
  });

  it('文件被改回和这边一样：不再算冲突', async () => {
    useApi({ '/lib/a.md': '一样' });
    useAppStore.setState({ tabs: [{ id: '/lib/a.md', title: 'a', content: '一样', isDirty: true, mode: 'word', externallyModified: true }] });
    await useAppStore.getState().handleExternalChanges(['/lib/a.md']);
    expect(useAppStore.getState().tabs[0]).toMatchObject({ isDirty: false, externallyModified: false });
  });

  it('文件消失又回来：不再提示文件不在', async () => {
    const api = useApi({ '/lib/a.md': 'A' });
    await useAppStore.getState().openFileByPath('/lib/a.md');
    useAppStore.getState().updateTabContent('/lib/a.md', 'A + 改动');
    api.files.delete('/lib/a.md');
    await useAppStore.getState().handleExternalChanges(['/lib/a.md']);
    expect(useAppStore.getState().tabs[0].diskMissing).toBe(true);
    api.files.set('/lib/a.md', 'A');
    await useAppStore.getState().handleExternalChanges(['/lib/a.md']);
    expect(useAppStore.getState().tabs[0]).toMatchObject({ isDirty: true, externallyModified: true, diskMissing: false });
  });
});

describe('自动保存不盖掉外部的改动', () => {
  const dirtyTab = async (api: ReturnType<typeof useApi>) => {
    await useAppStore.getState().openFileByPath('/lib/a.md');
    useAppStore.getState().updateTabContent('/lib/a.md', '我的改动');
    api.fs.writeFile.mockClear();
  };

  it('已经标了冲突：自动保存不写盘，提示留着；手动保存才覆盖', async () => {
    const api = useApi({ '/lib/a.md': '原文' });
    await dirtyTab(api);
    api.files.set('/lib/a.md', 'Agent 写的');
    await useAppStore.getState().handleExternalChanges(['/lib/a.md']);

    expect(await useAppStore.getState().saveActiveFile(false, true)).toBe(false);
    expect(api.fs.writeFile).not.toHaveBeenCalled();
    expect(useAppStore.getState().tabs[0].externallyModified).toBe(true);

    expect(await useAppStore.getState().saveActiveFile()).toBe(true);
    expect(api.files.get('/lib/a.md')).toBe('我的改动');
    expect(useAppStore.getState().tabs[0]).toMatchObject({ isDirty: false, externallyModified: false });
  });

  it('文件监听的通知还没到就失焦：写之前再看一眼磁盘', async () => {
    const api = useApi({ '/lib/a.md': '原文' });
    await dirtyTab(api);
    api.files.set('/lib/a.md', 'Agent 写的');

    expect(await useAppStore.getState().saveActiveFile(false, true)).toBe(false);
    expect(api.files.get('/lib/a.md')).toBe('Agent 写的');
    expect(useAppStore.getState().tabs[0]).toMatchObject({ content: '我的改动', isDirty: true, externallyModified: true });
  });

  it('文件被移走：自动保存不把它写回原处', async () => {
    const api = useApi({ '/lib/a.md': '原文' });
    await dirtyTab(api);
    api.files.delete('/lib/a.md');

    expect(await useAppStore.getState().saveActiveFile(false, true)).toBe(false);
    expect(api.files.has('/lib/a.md')).toBe(false);
    expect(useAppStore.getState().tabs[0]).toMatchObject({ externallyModified: true, diskMissing: true });
  });

  it('磁盘没被动过：照常自动保存', async () => {
    const api = useApi({ '/lib/a.md': '原文' });
    await dirtyTab(api);
    expect(await useAppStore.getState().saveActiveFile(false, true)).toBe(true);
    expect(api.files.get('/lib/a.md')).toBe('我的改动');
  });

  it('载入新版本：换成磁盘内容，编辑器重载', async () => {
    const api = useApi({ '/lib/a.md': '原文' });
    await dirtyTab(api);
    api.files.set('/lib/a.md', 'Agent 写的');
    await useAppStore.getState().handleExternalChanges(['/lib/a.md']);

    expect(await useAppStore.getState().reloadTabFromDisk('/lib/a.md')).toBe(true);
    expect(useAppStore.getState().tabs[0]).toMatchObject({ content: 'Agent 写的', isDirty: false, externallyModified: false });
    expect(useAppStore.getState().externalWrite?.id).toBe('/lib/a.md');
  });

  it('另存为：冲突解除，之后的自动保存按新文件算', async () => {
    const api = useApi({ '/lib/a.md': '原文' });
    await dirtyTab(api);
    api.files.set('/lib/a.md', 'Agent 写的');
    await useAppStore.getState().handleExternalChanges(['/lib/a.md']);
    (api.dialog.save as any).mockResolvedValueOnce('/lib/b.md');

    expect(await useAppStore.getState().saveActiveFile(true)).toBe(true);
    expect(api.files.get('/lib/a.md')).toBe('Agent 写的');
    expect(api.files.get('/lib/b.md')).toBe('我的改动');
    expect(useAppStore.getState().tabs[0]).toMatchObject({ id: '/lib/b.md', externallyModified: false });

    useAppStore.getState().updateTabContent('/lib/b.md', '接着写');
    expect(await useAppStore.getState().saveActiveFile(false, true)).toBe(true);
    expect(api.files.get('/lib/b.md')).toBe('接着写');
  });

  it('退出期间文件被改过：恢复的修改和磁盘是两份，自动保存不盖', async () => {
    const api = useApi({ '/lib/a.md': 'Agent 写的' });
    await useAppStore.getState().loadLibrary(LIB);
    localStorage.setItem('iml_session', JSON.stringify({
      tabs: [{ id: '/lib/a.md', title: 'a.md', isDirty: true, mode: 'word', content: '上次没存的', diskSig: 'old' }],
      activeTabId: '/lib/a.md',
    }));
    await useAppStore.getState().loadSession();

    expect(useAppStore.getState().tabs[0]).toMatchObject({ content: '上次没存的', isDirty: true, externallyModified: true });
    expect(await useAppStore.getState().saveActiveFile(false, true)).toBe(false);
    expect(api.files.get('/lib/a.md')).toBe('Agent 写的');
  });
});

describe('关标签页之前的把关提醒', () => {
  const guard = (tab: { id: string }) => (tab.id === '/lib/会议.md' ? { title: '正在转写', message: '关掉它，转写就结束了', confirmLabel: '结束转写并关闭' } : null);

  it('没有未保存修改的标签页也不能不声不响地关：先排进确认队列；点「继续」才关，点「取消」什么都不发生', () => {
    useAppStore.setState({ tabs: [{ id: '/lib/会议.md', title: '会议.md', content: 'x', isDirty: false, mode: 'word' }, { id: '/lib/b.md', title: 'b.md', content: 'y', isDirty: false, mode: 'word' }], activeTabId: '/lib/会议.md' });
    useAppStore.getState().registerCloseGuard(guard);
    useAppStore.getState().closeAllTabs();
    expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(['/lib/会议.md']);      // 别的照常关掉，这篇等用户决定
    expect(useAppStore.getState().tabToClose).toBe('/lib/会议.md');
    useAppStore.getState().cancelCloseQueue();
    expect(useAppStore.getState().tabs).toHaveLength(1);
    expect(useAppStore.getState().tabToClose).toBeNull();

    useAppStore.getState().requestCloseTab('/lib/会议.md');
    useAppStore.getState().passCloseGuard('/lib/会议.md');
    expect(useAppStore.getState().tabs).toEqual([]);
    expect(useAppStore.getState().tabToClose).toBeNull();
  });

  it('既在转写、又有没保存的修改：点了「继续」之后留在队列里，接着问要不要保存', () => {
    useAppStore.setState({ tabs: [{ id: '/lib/会议.md', title: '会议.md', content: 'x', isDirty: true, mode: 'word' }], activeTabId: '/lib/会议.md' });
    useAppStore.getState().registerCloseGuard(guard);
    useAppStore.getState().requestCloseTab('/lib/会议.md');
    useAppStore.getState().passCloseGuard('/lib/会议.md');
    expect(useAppStore.getState()).toMatchObject({ tabToClose: '/lib/会议.md', closeGuardPassed: '/lib/会议.md' });
    expect(useAppStore.getState().tabs).toHaveLength(1);
    useAppStore.getState().advanceCloseQueue();
    expect(useAppStore.getState().closeGuardPassed).toBeNull();
  });
});

describe('外部改动：不把自己打的字当成「磁盘被改了」', () => {
  it('应用新建文件 → 打开 → 用户马上打字，迟到的文件监听通知不该打「外部修改」的标记；磁盘真变了才打', async () => {
    const api = useApi({ '/lib/会议记录.md': '# 会议记录\n\n## 要点\n' });
    await useAppStore.getState().openFileByPath('/lib/会议记录.md');
    useAppStore.getState().updateTabContent('/lib/会议记录.md', '# 会议记录\n\n## 要点\n\n- 老王负责打包');
    await useAppStore.getState().handleExternalChanges(['/lib/会议记录.md']);         // 迟到的「新建」通知：磁盘其实没动
    expect(useAppStore.getState().tabs[0]).toMatchObject({ isDirty: true });
    expect(useAppStore.getState().tabs[0].externallyModified).toBeFalsy();

    api.files.set('/lib/会议记录.md', '# 会议记录\n\n别的编辑器写进来的');
    await useAppStore.getState().handleExternalChanges(['/lib/会议记录.md']);         // 这回磁盘真的被别人改了
    expect(useAppStore.getState().tabs[0].externallyModified).toBe(true);
  });
});

describe('会话恢复', () => {
  it('恢复未保存的修改、丢弃已不存在的文件、保留未命名文档、合并启动时已打开的标签', async () => {
    useApi({ '/lib/a.md': 'disk-a', '/lib/b.md': 'disk-b' });
    await useAppStore.getState().loadLibrary(LIB);
    localStorage.setItem('iml_session', JSON.stringify({
      activeTabId: '/lib/gone.md',
      expandedPaths: ['/lib/sub'],
      starredFiles: ['/lib/a.md'],
      recentFiles: ['/lib/a.md'],
      tabs: [
        { id: '/lib/a.md', title: 'a', isDirty: true, mode: 'word', content: 'dirty-a' },
        { id: '/lib/b.md', title: 'b', isDirty: false, mode: 'word' },
        { id: '/lib/gone.md', title: 'gone', isDirty: false, mode: 'word' },
        { id: 'new-1.md', title: '未命名', isDirty: true, mode: 'word', content: 'draft' },
      ],
    }));
    // 启动时通过「打开方式」已经打开了一个文件
    useAppStore.setState({ tabs: [{ id: '/lib/b.md', title: 'b', content: 'pre', isDirty: false, mode: 'word' }], activeTabId: '/lib/b.md' });

    await useAppStore.getState().loadSession();
    const s = useAppStore.getState();
    const ids = s.tabs.map((t) => t.id);
    expect(ids).toEqual(['/lib/a.md', 'new-1.md', '/lib/b.md']);
    expect(s.tabs.find((t) => t.id === '/lib/a.md')).toMatchObject({ content: 'dirty-a', isDirty: true });
    expect(s.tabs.find((t) => t.id === 'new-1.md')).toMatchObject({ content: 'draft' });
    expect(s.tabs.find((t) => t.id === '/lib/b.md')?.content).toBe('pre');
    expect(s.activeTabId).toBe('/lib/b.md');
    expect(s.starredFiles).toEqual(['/lib/a.md']);
    expect(s.expandedPaths).toEqual(expect.arrayContaining([LIB, '/lib/sub']));
  });

  it('脏内容与磁盘一致时不再标脏', async () => {
    useApi({ '/lib/a.md': 'same' });
    await useAppStore.getState().loadLibrary(LIB);
    localStorage.setItem('iml_session', JSON.stringify({
      activeTabId: '/lib/a.md',
      tabs: [{ id: '/lib/a.md', title: 'a', isDirty: true, mode: 'word', content: 'same' }],
    }));
    await useAppStore.getState().loadSession();
    expect(useAppStore.getState().tabs[0]).toMatchObject({ content: 'same', isDirty: false });
  });
});

describe('日记与模板', () => {
  it('补写某一天的日记：文件名和模板里的日期、星期都是那一天；传进来的不是日期（点击事件）就当今天', async () => {
    const api = useApi({ '/lib/a.md': 'A', '/lib/模板/日记.md': '# {{date}} {{weekday}}\n\n{{year}}/{{month}}/{{day}}\n' });
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().openDailyNote(new Date(2026, 1, 1)); // 2026-02-01 星期日
    expect(api.files.get('/lib/日记/2026-02-01.md')).toBe('# 2026-02-01 星期日\n\n2026/02/01\n');
    expect(useAppStore.getState().activeTabId).toBe('/lib/日记/2026-02-01.md');
    const before = api.files.size;
    await (useAppStore.getState().openDailyNote as (x: unknown) => Promise<void>)({ type: 'click' });
    const created = [...api.files.keys()].filter((p) => p.startsWith('/lib/日记/') && p !== '/lib/日记/2026-02-01.md');
    expect(api.files.size).toBe(before + 1);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatch(/\/\d{4}-\d{2}-\d{2}\.md$/);
    expect(useAppStore.getState().activeTabId).toBe(created[0]);
  });

  it('今日日记：不存在则用内置模板新建并打开，再次调用不覆盖', async () => {
    const api = useApi({ '/lib/a.md': 'A' });
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().openDailyNote();
    const today = new Date();
    const name = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const path = `/lib/日记/${name}.md`;
    expect(api.files.get(path)).toContain(`# ${name}`);
    expect(useAppStore.getState().activeTabId).toBe(path);
    api.files.set(path, '已写过的内容');
    await useAppStore.getState().openDailyNote();
    expect(api.files.get(path)).toBe('已写过的内容');
  });

  it('优先使用笔记库里的「模板/日记.md」', async () => {
    const api = useApi({ '/lib/模板/日记.md': '自定义 {{date}}' });
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().openDailyNote();
    const created = [...api.files.keys()].find((p) => p.startsWith('/lib/日记/'))!;
    expect(api.files.get(created)).toMatch(/^自定义 \d{4}-\d{2}-\d{2}$/);
  });

  it('列出模板并用模板新建笔记（同名自动加序号，变量已替换）', async () => {
    const api = useApi({ '/lib/模板/会议记录.md': '# {{title}}\n{{date}}', '/lib/模板/.hidden.md': 'x' });
    await useAppStore.getState().loadLibrary(LIB);
    expect(await useAppStore.getState().listTemplates()).toEqual([{ name: '会议记录', path: '/lib/模板/会议记录.md' }]);
    const first = await useAppStore.getState().createNoteFromTemplate('/lib/模板/会议记录.md', LIB);
    const second = await useAppStore.getState().createNoteFromTemplate('/lib/模板/会议记录.md', LIB);
    expect(first).toMatch(/^\/lib\/会议记录 \d{4}-\d{2}-\d{2}\.md$/);
    expect(second).toBe(first!.replace('.md', ' 2.md'));
    expect(api.files.get(first!)).toMatch(/^# 会议记录 \d{4}-\d{2}-\d{2}\n\d{4}-\d{2}-\d{2}$/);
    expect(useAppStore.getState().renamingPath).toBe(second);
  });

  it('createSampleTemplates 写入示例且不覆盖已有模板', async () => {
    const api = useApi({ '/lib/模板/日记.md': 'mine' });
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().createSampleTemplates();
    expect(api.files.get('/lib/模板/日记.md')).toBe('mine');
    expect(api.files.has('/lib/模板/会议记录.md')).toBe(true);
    expect(api.files.has('/lib/模板/读书笔记.md')).toBe(true);
  });
});

describe('双向链接', () => {
  it('按文件名或标题解析，优先同目录；找不到则在当前笔记目录新建', async () => {
    const api = useApi({ '/lib/a.md': 'A', '/lib/sub/b.md': 'B', '/lib/sub/目标.md': 'in sub', '/lib/目标.md': 'in root' });
    (window as any).api.search.listNotes = async () => [
      { path: '/lib/sub/目标.md', title: '目标' },
      { path: '/lib/目标.md', title: '目标' },
      { path: '/lib/a.md', title: '标题A' },
    ];
    await useAppStore.getState().loadLibrary(LIB);
    useAppStore.setState({ tabs: [{ id: '/lib/sub/b.md', title: 'b', content: 'B', isDirty: false, mode: 'word' }], activeTabId: '/lib/sub/b.md' });
    await useAppStore.getState().openWikiLink('目标');
    expect(useAppStore.getState().activeTabId).toBe('/lib/sub/目标.md');
    await useAppStore.getState().openWikiLink('标题A');
    expect(useAppStore.getState().activeTabId).toBe('/lib/a.md');
    useAppStore.getState().setActiveTab('/lib/sub/b.md');
    await useAppStore.getState().openWikiLink('新想法');
    expect(api.files.get('/lib/sub/新想法.md')).toBe('# 新想法\n\n');
    expect(useAppStore.getState().activeTabId).toBe('/lib/sub/新想法.md');
  });
});

describe('双向链接：小节、别名', () => {
  const NOTE = '# 周会\n\n## 上周\n\n### 待办\n\n## 本周\n\n### 待办\n\n一段话 ^blk1\n';
  const FILES = { '/lib/a.md': '# A\n\n## 小结\n', '/lib/周会.md': NOTE };
  // useApi 按 hook 命名，lint 不许它出现在 async 函数里：各用例自己调，这里只做后面的准备
  const prepare = async () => {
    (window as any).api.search.listNotes = async () => [
      { path: '/lib/a.md', title: 'A', aliases: [] },
      { path: '/lib/周会.md', title: '周会', aliases: ['例会'] },
    ];
    await useAppStore.getState().loadLibrary(LIB);
    useAppStore.setState({ tabs: [{ id: '/lib/a.md', title: 'a', content: FILES['/lib/a.md'], isDirty: false, mode: 'word' }], activeTabId: '/lib/a.md', navigationRequest: null });
  };

  it('[[笔记#小节]] 打开那篇并跳到小节，不再新建一篇叫「笔记#小节」的笔记', async () => {
    const api = useApi(FILES);
    await prepare();
    await useAppStore.getState().openWikiLink('周会#本周#待办');
    expect(useAppStore.getState().activeTabId).toBe('/lib/周会.md');
    expect([...api.files.keys()].some((p) => p.includes('#'))).toBe(false);
    // 两个同名的「待办」：要的是「本周」下面那个（第 8 行），不是第一个
    expect(useAppStore.getState().navigationRequest?.heading).toMatchObject({ text: '待办', level: 3, id: 'heading-8' });
  });

  it('别名能打开；[[笔记#^块]] 跳到块；小节对不上就只打开、不跳', async () => {
    useApi(FILES);
    await prepare();
    await useAppStore.getState().openWikiLink('例会#^blk1');
    expect(useAppStore.getState().activeTabId).toBe('/lib/周会.md');
    expect(useAppStore.getState().navigationRequest?.blockId).toBe('blk1');
    useAppStore.setState({ navigationRequest: null });
    await useAppStore.getState().openWikiLink('A#没有这一节');
    expect(useAppStore.getState().activeTabId).toBe('/lib/a.md');
    expect(useAppStore.getState().navigationRequest).toBeNull();
  });

  it('[[#小节]] 在本篇内跳，不打开也不新建任何东西', async () => {
    const api = useApi(FILES);
    await prepare();
    const before = api.files.size;
    await useAppStore.getState().openWikiLink('#小结');
    expect(useAppStore.getState().activeTabId).toBe('/lib/a.md');
    expect(useAppStore.getState().navigationRequest?.heading?.text).toBe('小结');
    expect(api.files.size).toBe(before);
  });

  it('目标不存在时新建，名字只取笔记名那一段', async () => {
    const api = useApi(FILES);
    await prepare();
    await useAppStore.getState().openWikiLink('想法/新点子#展开');
    expect(api.files.get('/lib/新点子.md')).toBe('# 新点子\n\n');
    expect(useAppStore.getState().activeTabId).toBe('/lib/新点子.md');
  });
});

describe('未链接提及 → 链接', () => {
  const BODY = '# 日记\n\n今天做了苹果派，又做了一个苹果派。\n';
  const first = { offset: BODY.indexOf('苹果派'), length: 3, match: '苹果派' };

  it('没打开的笔记直接改磁盘上的文件，返回原文变长了多少', async () => {
    const api = useApi({ '/lib/日记.md': BODY, '/lib/苹果派.md': '# 苹果派\n' });
    await useAppStore.getState().loadLibrary(LIB);
    expect(await useAppStore.getState().linkMention('/lib/日记.md', first, '/lib/苹果派.md')).toBe(4);
    expect(api.files.get('/lib/日记.md')).toBe('# 日记\n\n今天做了[[苹果派]]，又做了一个苹果派。\n');
  });

  it('打开着且没改动的：磁盘和标签页一起更新，标签页不变脏', async () => {
    const api = useApi({ '/lib/日记.md': BODY, '/lib/pie.md': '# 苹果派\n' });
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().openFileByPath('/lib/日记.md');
    expect(await useAppStore.getState().linkMention('/lib/日记.md', first, '/lib/pie.md')).toBe('[[pie|苹果派]]'.length - 3);
    const tab = useAppStore.getState().tabs.find((t) => t.id === '/lib/日记.md')!;
    expect(tab.content).toContain('今天做了[[pie|苹果派]]，');
    expect(tab.isDirty).toBe(false);
    expect(api.files.get('/lib/日记.md')).toBe(tab.content);
  });

  it('有没存盘的改动：只改编辑器里的，不碰磁盘', async () => {
    const api = useApi({ '/lib/日记.md': BODY, '/lib/苹果派.md': '# 苹果派\n' });
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().openFileByPath('/lib/日记.md');
    useAppStore.getState().updateTabContent('/lib/日记.md', BODY + '\n没存盘的一行\n');
    expect(await useAppStore.getState().linkMention('/lib/日记.md', first, '/lib/苹果派.md')).toBe(4);
    const tab = useAppStore.getState().tabs.find((t) => t.id === '/lib/日记.md')!;
    expect(tab.content).toBe('# 日记\n\n今天做了[[苹果派]]，又做了一个苹果派。\n\n没存盘的一行\n');
    expect(tab.isDirty).toBe(true);
    expect(api.files.get('/lib/日记.md')).toBe(BODY);
  });

  it('位置对不上（那篇被改过）：什么都不写，返回 null', async () => {
    const api = useApi({ '/lib/日记.md': '开头加了一句。' + BODY, '/lib/苹果派.md': '# 苹果派\n' });
    await useAppStore.getState().loadLibrary(LIB);
    expect(await useAppStore.getState().linkMention('/lib/日记.md', first, '/lib/苹果派.md')).toBeNull();
    expect(api.files.get('/lib/日记.md')).toBe('开头加了一句。' + BODY);
  });
});

describe('全库待办：在面板里打勾', () => {
  const BODY = '# 周会\n\n- [ ] 给客户回邮件\n- [ ] 订会议室\n';
  const second = { line: 3, raw: '订会议室', text: '订会议室', done: false };

  it('没打开的笔记：直接改磁盘上那一行', async () => {
    const api = useApi({ '/lib/周会.md': BODY });
    await useAppStore.getState().loadLibrary(LIB);
    expect(await useAppStore.getState().toggleTask('/lib/周会.md', second, true)).toBe(true);
    expect(api.files.get('/lib/周会.md')).toBe('# 周会\n\n- [ ] 给客户回邮件\n- [x] 订会议室\n');
  });

  it('开着且有没存盘的改动：只改编辑器里的，行号变了也能找对', async () => {
    const api = useApi({ '/lib/周会.md': BODY });
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().openFileByPath('/lib/周会.md');
    useAppStore.getState().updateTabContent('/lib/周会.md', '刚加的一行\n\n' + BODY);
    expect(await useAppStore.getState().toggleTask('/lib/周会.md', second, true)).toBe(true);
    const tab = useAppStore.getState().tabs.find((t) => t.id === '/lib/周会.md')!;
    expect(tab.content).toBe('刚加的一行\n\n# 周会\n\n- [ ] 给客户回邮件\n- [x] 订会议室\n');
    expect(tab.isDirty).toBe(true);
    expect(api.files.get('/lib/周会.md')).toBe(BODY);
  });

  it('那一条已经不在了：不写文件，返回 false', async () => {
    const api = useApi({ '/lib/周会.md': '# 周会\n\n- [ ] 别的事\n' });
    await useAppStore.getState().loadLibrary(LIB);
    expect(await useAppStore.getState().toggleTask('/lib/周会.md', second, true)).toBe(false);
    expect(api.files.get('/lib/周会.md')).toBe('# 周会\n\n- [ ] 别的事\n');
  });

  it('点文字：打开那篇并请求跳到那一行', async () => {
    useApi({ '/lib/周会.md': BODY });
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().openTask('/lib/周会.md', second);
    expect(useAppStore.getState().activeTabId).toBe('/lib/周会.md');
    expect(useAppStore.getState().navigationRequest).toMatchObject({ line: 3, lineText: '订会议室' });
  });
});

describe('标签改名 / 合并', () => {
  const FILES = {
    '/lib/一.md': '---\ntags: [会议, 读书]\n---\n\n# 一\n\n#会议/周会 的记录',
    '/lib/二.md': '# 二\n\n#会议 和 `#会议`',
    '/lib/三.md': '# 三\n\n#读书',
  };
  const tagged = async (tag: string) => (tag === '会议' ? [{ path: '/lib/一.md' }, { path: '/lib/二.md' }] : []);

  it('全库逐篇改写：frontmatter、正文、子标签一起变；没用到它的笔记不碰', async () => {
    const api = useApi(FILES);
    (window as any).api.search.notesByTag = tagged;
    await useAppStore.getState().loadLibrary(LIB);
    expect(await useAppStore.getState().renameTag('会议', '开会')).toEqual({ changed: 2, failed: 0 });
    expect(api.files.get('/lib/一.md')).toBe('---\ntags: [开会, 读书]\n---\n\n# 一\n\n#开会/周会 的记录');
    expect(api.files.get('/lib/二.md')).toBe('# 二\n\n#开会 和 `#会议`');
    expect(api.files.get('/lib/三.md')).toBe(FILES['/lib/三.md']);
  });

  it('开着且有没存盘改动的那篇只改编辑器里的；正选中的标签跟着换成新名字', async () => {
    const api = useApi(FILES);
    (window as any).api.search.notesByTag = tagged;
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().openFileByPath('/lib/二.md');
    useAppStore.getState().updateTabContent('/lib/二.md', FILES['/lib/二.md'] + '\n\n没存盘的一行 #会议');
    useAppStore.setState({ selectedTag: '会议/周会' });
    await useAppStore.getState().renameTag('会议', '开会');
    const tab = useAppStore.getState().tabs.find((t) => t.id === '/lib/二.md')!;
    expect(tab.content).toBe('# 二\n\n#开会 和 `#会议`\n\n没存盘的一行 #开会');
    expect(tab.isDirty).toBe(true);
    expect(api.files.get('/lib/二.md')).toBe(FILES['/lib/二.md']);
    expect(useAppStore.getState().selectedTag).toBe('开会/周会');
  });

  it('新名字不合法、或和原来一样：什么都不做', async () => {
    const api = useApi(FILES);
    (window as any).api.search.notesByTag = tagged;
    await useAppStore.getState().loadLibrary(LIB);
    expect(await useAppStore.getState().renameTag('会议', '开 会')).toEqual({ changed: 0, failed: 0 });
    expect(await useAppStore.getState().renameTag('会议', '#会议')).toEqual({ changed: 0, failed: 0 });
    expect(api.files.get('/lib/一.md')).toBe(FILES['/lib/一.md']);
  });
});

describe('快速捕获', () => {
  const todayPath = () => { const d = new Date(); const p2 = (n: number) => String(n).padStart(2, '0'); return `/lib/日记/${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.md`; };

  it('今天还没有日记：按模板建一篇再追加；不打开、不切标签页', async () => {
    const api = useApi({ '/lib/a.md': 'A' });
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().openFileByPath('/lib/a.md');
    expect(await useAppStore.getState().captureToDaily('给客户回邮件')).toBe(true);
    const daily = api.files.get(todayPath())!;
    expect(daily).toMatch(/^# \d{4}-\d{2}-\d{2} 星期./);
    expect(daily).toMatch(/## 想法\n\n- \d{2}:\d{2} 给客户回邮件\n$/);
    expect(useAppStore.getState().activeTabId).toBe('/lib/a.md');
    expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(['/lib/a.md']);
  });

  it('连记两条连成一个列表；日记正开着且有没存盘的改动时只改编辑器里的，不冲掉那些改动', async () => {
    const api = useApi({ '/lib/a.md': 'A' });
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().captureToDaily('第一条');
    await useAppStore.getState().captureToDaily('第二条');
    expect(api.files.get(todayPath())).toMatch(/- \d{2}:\d{2} 第一条\n- \d{2}:\d{2} 第二条\n$/);

    await useAppStore.getState().openFileByPath(todayPath());
    const onDisk = api.files.get(todayPath())!;
    useAppStore.getState().updateTabContent(todayPath(), onDisk.replace('## 今天\n\n- ', '## 今天\n\n- 正在写、还没存'));
    expect(await useAppStore.getState().captureToDaily('第三条')).toBe(true);
    const tab = useAppStore.getState().tabs.find((t) => t.id === todayPath())!;
    expect(tab.content).toContain('- 正在写、还没存');
    expect(tab.content).toMatch(/第二条\n- \d{2}:\d{2} 第三条\n$/);
    expect(tab.isDirty).toBe(true);
    expect(api.files.get(todayPath())).toBe(onDisk);
  });

  it('内容是空白：不建文件也不写', async () => {
    const api = useApi({ '/lib/a.md': 'A' });
    await useAppStore.getState().loadLibrary(LIB);
    const before = api.files.size;
    expect(await useAppStore.getState().captureToDaily('   \n ')).toBe(false);
    expect(api.files.size).toBe(before);
  });
});

describe('iml:// 链接', () => {
  it('new：标题做文件名、永远不覆盖已有的；没给标题就用正文第一行', async () => {
    const api = useApi({ '/lib/想法.md': '原来的内容' });
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().runAppUrl({ action: 'new', title: '想法', content: '# 新的\n\n正文' });
    expect(api.files.get('/lib/想法.md')).toBe('原来的内容');
    expect(api.files.get('/lib/想法 2.md')).toBe('# 新的\n\n正文\n');
    expect(useAppStore.getState().activeTabId).toBe('/lib/想法 2.md');
    await useAppStore.getState().runAppUrl({ action: 'new', title: '', content: '从剪贴板来的一段话\n第二行' });
    expect(api.files.get('/lib/从剪贴板来的一段话.md')).toBe('从剪贴板来的一段话\n第二行\n');
    // 标题里不能当文件名的字符去掉；只有标题没有正文时给一个一级标题
    await useAppStore.getState().runAppUrl({ action: 'new', title: '周会: 09/20 #1', content: '' });
    expect(api.files.get('/lib/周会 0920 1.md')).toBe('# 周会 0920 1\n\n');
  });

  it('open-name 走双链的解析（可带小节）；open-path 直接打开；search 把词交给搜索面板', async () => {
    useApi({ '/lib/周会.md': '# 周会\n\n## 本周\n\n内容', '/lib/a.md': 'A' });
    (window as any).api.search.listNotes = async () => [{ path: '/lib/周会.md', title: '周会' }];
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().runAppUrl({ action: 'open-name', name: '周会#本周' });
    expect(useAppStore.getState().activeTabId).toBe('/lib/周会.md');
    expect(useAppStore.getState().navigationRequest?.heading?.text).toBe('本周');
    await useAppStore.getState().runAppUrl({ action: 'open-path', path: '/lib/a.md' });
    expect(useAppStore.getState().activeTabId).toBe('/lib/a.md');
    await useAppStore.getState().runAppUrl({ action: 'search', query: '周会 纪要' });
    expect(useAppStore.getState()).toMatchObject({ sidebarTab: 'search', sidebarVisible: true, globalSearchQuery: '周会 纪要' });
  });

  it('capture 追加到今天的日记，不切标签页', async () => {
    const api = useApi({ '/lib/a.md': 'A' });
    await useAppStore.getState().loadLibrary(LIB);
    await useAppStore.getState().openFileByPath('/lib/a.md');
    await useAppStore.getState().runAppUrl({ action: 'capture', text: '从快捷指令记的' });
    expect([...api.files.entries()].some(([p, c]) => p.startsWith('/lib/日记/') && /- \d{2}:\d{2} 从快捷指令记的\n$/.test(c))).toBe(true);
    expect(useAppStore.getState().activeTabId).toBe('/lib/a.md');
  });
});

describe('未命名文档的静默保存', () => {
  const newTab = (content: string) => {
    useAppStore.getState().createNewFile();
    const id = useAppStore.getState().activeTabId!;
    useAppStore.getState().updateTabContent(id, content);
    return id;
  };

  it('空文档或只有符号的文档不落盘，内容有了正文才按第一行命名', async () => {
    const api = useApi({ '/lib/a.md': 'A' });
    await useAppStore.getState().loadLibrary(LIB);
    const id = newTab('');
    expect(await useAppStore.getState().saveActiveFile(false, true)).toBe(false);
    expect(api.files.size).toBe(1);

    useAppStore.getState().updateTabContent(id, '$$\n\n$$');
    expect(await useAppStore.getState().saveActiveFile(false, true)).toBe(false);
    expect([...api.files.keys()].some((p) => p.includes('$$'))).toBe(false);

    useAppStore.getState().updateTabContent(id, '**大模型**是指具有大规模参数的模型\n\n正文');
    expect(await useAppStore.getState().saveActiveFile(false, true)).toBe(true);
    expect(api.files.get('/lib/大模型是指具有大规模参数的模型.md')).toContain('正文');
    expect(useAppStore.getState().activeTabId).toBe('/lib/大模型是指具有大规模参数的模型.md');
  });

  it('AI 生成期间不落盘；同名自动加序号', async () => {
    const api = useApi({ '/lib/周报.md': 'old' });
    await useAppStore.getState().loadLibrary(LIB);
    newTab('# 周报\n\n本周');
    useAppStore.getState().setAIStatus({ generating: true });
    expect(await useAppStore.getState().saveActiveFile(false, true)).toBe(false);
    useAppStore.getState().setAIStatus({ generating: false });
    expect(await useAppStore.getState().saveActiveFile(false, true)).toBe(true);
    expect(api.files.get('/lib/周报 2.md')).toContain('本周');
    expect(api.files.get('/lib/周报.md')).toBe('old');
  });
});

describe('弹窗', () => {
  it('openDialog / closeDialog', () => {
    useAppStore.getState().openDialog('ai-config');
    expect(useAppStore.getState().dialog).toBe('ai-config');
    useAppStore.getState().openDialog('settings');
    expect(useAppStore.getState().dialog).toBe('settings');
    useAppStore.getState().closeDialog();
    expect(useAppStore.getState().dialog).toBeNull();
  });
});

describe('标签页：关闭与重开', () => {
  const tab = (id: string, extra: any = {}) => ({ id, title: id.split('/').pop()!, content: '', isDirty: false, mode: 'word' as const, ...extra });

  it('干净的直接关；未保存的先弹确认框，不立刻关掉', () => {
    useAppStore.setState({ tabs: [tab('/lib/a.md'), tab('/lib/b.md', { isDirty: true })], activeTabId: '/lib/b.md' });
    useAppStore.getState().requestCloseTab('/lib/a.md');
    expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(['/lib/b.md']);
    expect(useAppStore.getState().tabToClose).toBeNull();

    useAppStore.getState().requestCloseTab('/lib/b.md');
    expect(useAppStore.getState().tabToClose).toBe('/lib/b.md');
    expect(useAppStore.getState().tabs).toHaveLength(1);   // 还没真关
  });

  it('空白的未命名文档直接关，写了东西的要确认', () => {
    useAppStore.setState({ tabs: [tab('new-1'), tab('new-2', { content: '写了一半' })] });
    useAppStore.getState().requestCloseTab('new-1');
    expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(['new-2']);
    useAppStore.getState().requestCloseTab('new-2');
    expect(useAppStore.getState().tabToClose).toBe('new-2');
  });

  it('⌘⇧T 按关闭顺序倒着开回来；未命名文档没有路径，不进栈', async () => {
    useApi({ '/lib/a.md': 'A', '/lib/b.md': 'B' });
    useAppStore.setState({ tabs: [tab('/lib/a.md'), tab('/lib/b.md'), tab('new-1')] });
    useAppStore.getState().closeTab('/lib/a.md');
    useAppStore.getState().closeTab('new-1');
    useAppStore.getState().closeTab('/lib/b.md');
    expect(useAppStore.getState().closedTabs).toEqual(['/lib/a.md', '/lib/b.md']);

    await useAppStore.getState().reopenClosedTab();
    expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(['/lib/b.md']);
    await useAppStore.getState().reopenClosedTab();
    expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(['/lib/b.md', '/lib/a.md']);
    // 栈空了再按不该出错
    await useAppStore.getState().reopenClosedTab();
    expect(useAppStore.getState().tabs).toHaveLength(2);
  });

  it('已经又打开的文件会被跳过，不会重复开同一个', async () => {
    useApi({ '/lib/a.md': 'A', '/lib/b.md': 'B' });
    useAppStore.setState({ tabs: [tab('/lib/b.md')], closedTabs: ['/lib/a.md', '/lib/b.md'] });
    await useAppStore.getState().reopenClosedTab();
    expect(useAppStore.getState().tabs.map((t) => t.id)).toEqual(['/lib/b.md', '/lib/a.md']);
  });

  it('重复关同一个文件不会在栈里留两份，且最多记 10 个', () => {
    useAppStore.setState({ tabs: [tab('/lib/a.md')], closedTabs: ['/lib/a.md', '/lib/x.md'] });
    useAppStore.getState().closeTab('/lib/a.md');
    expect(useAppStore.getState().closedTabs).toEqual(['/lib/x.md', '/lib/a.md']);

    const many = Array.from({ length: 10 }, (_, i) => `/lib/${i}.md`);
    useAppStore.setState({ tabs: [tab('/lib/new.md')], closedTabs: many });
    useAppStore.getState().closeTab('/lib/new.md');
    const stack = useAppStore.getState().closedTabs;
    expect(stack).toHaveLength(10);
    expect(stack[stack.length - 1]).toBe('/lib/new.md');
    expect(stack).not.toContain('/lib/0.md');   // 最旧的被挤出去
  });
});

describe('标签页：批量关闭', () => {
  const tab = (id: string, extra: any = {}) => ({ id, title: id.split('/').pop()!, content: 'x', isDirty: false, mode: 'word' as const, ...extra });
  const ids = () => useAppStore.getState().tabs.map((t) => t.id);

  it('关闭其他：干净的立刻关掉，只留下自己', () => {
    useAppStore.setState({ tabs: [tab('/lib/a.md'), tab('/lib/b.md'), tab('/lib/c.md')], activeTabId: '/lib/b.md' });
    useAppStore.getState().closeOtherTabs('/lib/b.md');
    expect(ids()).toEqual(['/lib/b.md']);
    expect(useAppStore.getState().tabToClose).toBeNull();
  });

  it('关闭右侧：只关右边的，左边和自己不动', () => {
    useAppStore.setState({ tabs: [tab('/lib/a.md'), tab('/lib/b.md'), tab('/lib/c.md'), tab('/lib/d.md')] });
    useAppStore.getState().closeTabsToRight('/lib/b.md');
    expect(ids()).toEqual(['/lib/a.md', '/lib/b.md']);
  });

  it('关闭已保存的：改过的留着，永远不弹确认框', () => {
    useAppStore.setState({ tabs: [tab('/lib/a.md'), tab('/lib/b.md', { isDirty: true }), tab('new-1', { content: '草稿' }), tab('new-2', { content: '  ' })] });
    useAppStore.getState().closeSavedTabs();
    expect(ids()).toEqual(['/lib/b.md', 'new-1']);   // 空白的 new-2 也算已保存，被关掉
    expect(useAppStore.getState().tabToClose).toBeNull();
  });

  it('全部关闭：脏的排队逐个问，干净的直接没了', () => {
    useAppStore.setState({ tabs: [tab('/lib/a.md'), tab('/lib/b.md', { isDirty: true }), tab('/lib/c.md', { isDirty: true })] });
    useAppStore.getState().closeAllTabs();
    expect(ids()).toEqual(['/lib/b.md', '/lib/c.md']);
    expect(useAppStore.getState().tabToClose).toBe('/lib/b.md');
    expect(useAppStore.getState().pendingCloseIds).toEqual(['/lib/c.md']);

    // 「不保存」→ 关掉当前这个，轮到下一个
    useAppStore.getState().closeTab('/lib/b.md');
    useAppStore.getState().advanceCloseQueue();
    expect(useAppStore.getState().tabToClose).toBe('/lib/c.md');
    expect(useAppStore.getState().pendingCloseIds).toEqual([]);

    useAppStore.getState().closeTab('/lib/c.md');
    useAppStore.getState().advanceCloseQueue();
    expect(useAppStore.getState().tabToClose).toBeNull();
    expect(ids()).toEqual([]);
  });

  it('确认框上点「取消」= 放弃整批，不是只跳过这一个', () => {
    useAppStore.setState({ tabs: [tab('/lib/a.md', { isDirty: true }), tab('/lib/b.md', { isDirty: true })] });
    useAppStore.getState().closeAllTabs();
    expect(useAppStore.getState().pendingCloseIds).toEqual(['/lib/b.md']);
    useAppStore.getState().cancelCloseQueue();
    expect(useAppStore.getState().tabToClose).toBeNull();
    expect(useAppStore.getState().pendingCloseIds).toEqual([]);
    expect(ids()).toEqual(['/lib/a.md', '/lib/b.md']);   // 一个都没关
  });

  it('批量关掉的文件都进重开栈，⌘⇧T 能一个个开回来', () => {
    useAppStore.setState({ tabs: [tab('/lib/a.md'), tab('/lib/b.md'), tab('/lib/c.md')], closedTabs: [] });
    useAppStore.getState().closeOtherTabs('/lib/c.md');
    expect(useAppStore.getState().closedTabs).toEqual(['/lib/a.md', '/lib/b.md']);
  });
});

describe('状态栏提示', () => {
  it('普通提示 5 秒后消失；带按钮的多停一会儿（15 秒），按钮原样带在提示上', () => {
    vi.useFakeTimers();
    try {
      useAppStore.getState().notify('已保存');
      expect(useAppStore.getState().notice).toMatchObject({ text: '已保存' });
      expect(useAppStore.getState().notice?.actions).toBeUndefined();
      vi.advanceTimersByTime(5000);
      expect(useAppStore.getState().notice).toBeNull();

      const run = vi.fn();
      useAppStore.getState().notify('已导出 PDF', undefined, [{ label: '打开', run }]);
      vi.advanceTimersByTime(5000);
      expect(useAppStore.getState().notice?.actions?.map((a) => a.label)).toEqual(['打开']);
      vi.advanceTimersByTime(10000);
      expect(useAppStore.getState().notice).toBeNull();
      expect(run).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('旧提示的定时器不会把后来的提示收掉', () => {
    vi.useFakeTimers();
    try {
      useAppStore.getState().notify('第一条');
      vi.advanceTimersByTime(4000);
      vi.setSystemTime(Date.now() + 1); // 两条提示要有不同的 id
      useAppStore.getState().notify('第二条');
      vi.advanceTimersByTime(1500);
      expect(useAppStore.getState().notice?.text).toBe('第二条');
    } finally {
      vi.useRealTimers();
    }
  });
});
