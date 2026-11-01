/** 按下之后挪动超过这么多才算拖，手抖的点击仍然是点击 */
const THRESHOLD = 5;

/**
 * 文件树里拖文件或文件夹。不用 HTML5 拖放：WebView 和窗口级的文件拖放都会抢它的事件，鼠标事件在两个壳里行为一样。
 * 能放的地方在 DOM 上标 data-tree-dir（这一行代表的目录）。
 */
export function startTreeDrag(start: { button: number; clientX: number; clientY: number }, path: string, label: string, onDrop: (dir: string) => void) {
  if (start.button !== 0) return;
  const sep = path.includes('\\') ? '\\' : '/';
  const parent = path.slice(0, path.lastIndexOf(sep));
  const canDrop = (dir: string) => dir !== parent && dir !== path && !dir.startsWith(path + sep);

  let ghost: HTMLElement | null = null;
  let target: HTMLElement | null = null;
  const setTarget = (next: HTMLElement | null) => {
    if (next === target) return;
    target?.classList.remove('tree-item--drop');
    next?.classList.add('tree-item--drop');
    target = next;
  };
  const finish = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('keydown', onKey, true);
    ghost?.remove();
    document.body.classList.remove('tree-dragging');
    setTarget(null);
  };
  const onMove = (e: MouseEvent) => {
    if (!ghost) {
      if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) < THRESHOLD) return;
      ghost = document.createElement('div');
      ghost.className = 'tree-drag-ghost';
      ghost.textContent = label;
      document.body.append(ghost);
      document.body.classList.add('tree-dragging');
    }
    ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 8}px)`;
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-tree-dir]') ?? null;
    setTarget(hit && canDrop(hit.dataset.treeDir as string) ? hit : null);
  };
  const onUp = () => {
    const dragged = !!ghost;
    const dir = target?.dataset.treeDir;
    finish();
    if (!dragged) return;
    // 松手时浏览器还会补一个 click：吞掉，不然等于又点开了这个文件
    const swallow = (e: MouseEvent) => e.stopPropagation();
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, true), 0);
    if (dir) onDrop(dir);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !ghost) return;
    e.stopPropagation();
    finish();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', onKey, true);
}
