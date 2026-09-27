import { useAppStore } from '../stores/appStore';

/**
 * 拖进窗口的文件。
 * 页面收到的 drop 事件里只有文件名和内容，没有路径；路径向主进程问（window.api.app.droppedPaths）。
 * 图片不归这里：两种模式的编辑器自己接，插到松手的位置；落在正文周围空白处的接到正文末尾。
 */

export interface DroppedPath { path: string; isDirectory: boolean }

const DOC_RE = /\.(md|markdown|mdown|mkd|txt)$/i;
const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() || '';
const trimSep = (p: string) => (p.length > 1 ? p.replace(/[\\/]+$/, '') : p);

/** 拖的是不是磁盘上的文件（页面内拖文字、拖图片节点不算） */
export function isFileDrag(dt: DataTransfer | null): boolean {
  return !!dt && Array.from(dt.types).includes('Files');
}

/**
 * 文件夹：就是当前笔记库、或在它里面的，到文件树里展开它。
 * 别处的先问一句再换库（App 里的确认框）：拖是随手的动作，换库的后果却是全局的——日记、快速捕获、搜索都跟着走
 */
async function openFolder(folderPath: string): Promise<void> {
  const store = useAppStore.getState();
  const folder = trimSep(folderPath);
  const current = store.workspacePath ? trimSep(store.workspacePath) : null;
  useAppStore.setState({ sidebarTab: 'library', sidebarVisible: true });
  if (current && folder === current) return;
  if (current && (folder.startsWith(`${current}/`) || folder.startsWith(`${current}\\`))) {
    // revealInSidebar 展开的是「这个路径所在的那几级目录」，它自己那一级另外展开
    await store.revealInSidebar(folder);
    store.setExpanded(folder, true);
    useAppStore.setState({ selectedNodePath: folder });
    await store.refreshWorkspace();
    return;
  }
  useAppStore.setState({ libraryToConfirm: folder });
}

/** 笔记打开成标签页；文件夹见 openFolder（拖了几个只认第一个）；别的说一声 */
export async function openDropped(items: DroppedPath[]): Promise<void> {
  const store = useAppStore.getState();
  const folder = items.find((d) => d.isDirectory);
  const docs = items.filter((d) => !d.isDirectory && DOC_RE.test(d.path));
  const others = items.filter((d) => !d.isDirectory && !DOC_RE.test(d.path));
  if (folder) await openFolder(folder.path);
  for (const doc of docs) await store.openFileByPath(doc.path);
  if (others.length) store.notify(`打不开 ${baseName(others[0].path)}：只认 Markdown 和纯文本文件`);
}

/** 非图片的文件：问到路径就打开。问不到（拖来的东西不在磁盘上，比如从网页里拖的）就说一声 */
export async function handleDroppedFiles(files: File[]): Promise<void> {
  const items = await window.api.app.droppedPaths(files);
  if (items.length === 0) {
    useAppStore.getState().notify(`打不开 ${files[0].name}：它不在磁盘上，先存下来再拖进来`);
    return;
  }
  await openDropped(items);
}

/**
 * 编辑器没接住的图片。落在编辑区里（笔记短的时候正文只占上面一小块，下面和两边的空白都不算正文）就接到正文末尾；
 * 落在侧边栏、标题栏这些地方的不猜，说一声
 */
function appendImage(file: File, target: EventTarget | null): void {
  const { editorActions, activeTabId, notify } = useAppStore.getState();
  const inEditor = target instanceof Element && !!target.closest('.editor-area');
  if (inEditor && activeTabId && editorActions?.appendImage) editorActions.appendImage(file);
  else notify('把图片拖到正文里，才会插进笔记');
}

/**
 * 装到 window 上。dragover 放行所有文件拖拽（不放行的话在侧边栏、预览这些地方松手，drop 不会发出来）；
 * drop 在冒泡阶段处理——编辑器先接图片（接到了会 preventDefault），非图片的文件归这里
 */
export function installFileDrop(): () => void {
  const onDragOver = (e: DragEvent) => {
    if (!isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: DragEvent) => {
    if (!isFileDrag(e.dataTransfer)) return;
    const files = Array.from(e.dataTransfer?.files || []);
    const taken = e.defaultPrevented;
    e.preventDefault(); // 不拦的话窗口会把文件当网页打开
    // 「插入图片」对话框里那块地方是给它自己的
    if (e.target instanceof Element && e.target.closest('.dropzone')) return;
    const others = files.filter((f) => !f.type.startsWith('image/'));
    if (others.length === 0) {
      if (files.length && !taken) appendImage(files[0], e.target);
      return;
    }
    handleDroppedFiles(others).catch((err) => console.warn('[drop]', err));
  };
  window.addEventListener('dragover', onDragOver, true);
  window.addEventListener('drop', onDrop);
  return () => {
    window.removeEventListener('dragover', onDragOver, true);
    window.removeEventListener('drop', onDrop);
  };
}
