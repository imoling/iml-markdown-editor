import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTreeDrag } from './treeDrag';

const at = (type: string, x: number, y: number) => window.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }));

describe('startTreeDrag', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });

  const row = (dir: string) => {
    const el = document.createElement('div');
    el.dataset.treeDir = dir;
    document.body.append(el);
    document.elementFromPoint = vi.fn(() => el);
    return el;
  };

  it('拖到文件夹上松手：高亮，然后移动', () => {
    const el = row('/lib/项目');
    const onDrop = vi.fn();
    startTreeDrag({ button: 0, clientX: 0, clientY: 0 }, '/lib/a.md', 'a', onDrop);
    at('mousemove', 20, 20);
    expect(el.classList.contains('tree-item--drop')).toBe(true);
    expect(document.querySelector('.tree-drag-ghost')?.textContent).toBe('a');
    at('mouseup', 20, 20);
    expect(onDrop).toHaveBeenCalledWith('/lib/项目');
    expect(document.querySelector('.tree-drag-ghost')).toBeNull();
    expect(el.classList.contains('tree-item--drop')).toBe(false);
  });

  it('没挪够：只是一次点击，不移动', () => {
    row('/lib/项目');
    const onDrop = vi.fn();
    startTreeDrag({ button: 0, clientX: 0, clientY: 0 }, '/lib/a.md', 'a', onDrop);
    at('mousemove', 2, 2);
    at('mouseup', 2, 2);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('所在目录、自己、自己里面都不能放', () => {
    for (const [path, dir] of [['/lib/a.md', '/lib'], ['/lib/甲', '/lib/甲'], ['/lib/甲', '/lib/甲/乙']]) {
      const el = row(dir);
      const onDrop = vi.fn();
      startTreeDrag({ button: 0, clientX: 0, clientY: 0 }, path, 'x', onDrop);
      at('mousemove', 20, 20);
      expect(el.classList.contains('tree-item--drop')).toBe(false);
      at('mouseup', 20, 20);
      expect(onDrop).not.toHaveBeenCalled();
    }
  });

  it('Esc 取消', () => {
    row('/lib/项目');
    const onDrop = vi.fn();
    startTreeDrag({ button: 0, clientX: 0, clientY: 0 }, '/lib/a.md', 'a', onDrop);
    at('mousemove', 20, 20);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    at('mouseup', 20, 20);
    expect(onDrop).not.toHaveBeenCalled();
    expect(document.querySelector('.tree-drag-ghost')).toBeNull();
  });

  it('右键不算拖', () => {
    const add = vi.spyOn(window, 'addEventListener');
    startTreeDrag({ button: 2, clientX: 0, clientY: 0 }, '/lib/a.md', 'a', vi.fn());
    expect(add).not.toHaveBeenCalled();
  });
});
