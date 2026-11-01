import fs from 'fs';
import path from 'path';

/** 不在笔记库里的文件：库里的已经有整库的目录监听管着 */
export function filesOutsideLibrary(files: string[], root: string | null): string[] {
  if (!root) return files;
  return files.filter((file) => {
    const rel = path.relative(root, file);
    return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
  });
}

/**
 * 盯着标签页里打开的库外文件，变了就通知。
 * 监听所在目录而不是文件本身：Agent 和不少编辑器保存时是「写临时文件再改名」，文件一换，盯着原文件的监听就断了。
 */
export class OpenFileWatcher {
  private dirs = new Map<string, { watcher: fs.FSWatcher; files: Map<string, string> }>();
  private changed = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private onChange: (paths: string[]) => void, private delay = 400) {}

  /** 换成这一批文件：多出来的目录开始监听，不再需要的关掉 */
  sync(files: string[]): void {
    const wanted = new Map<string, Map<string, string>>();
    for (const file of files) {
      const dir = path.dirname(file);
      if (!wanted.has(dir)) wanted.set(dir, new Map());
      wanted.get(dir)!.set(path.basename(file).normalize('NFC'), file);
    }
    for (const [dir, entry] of this.dirs) {
      if (wanted.has(dir)) continue;
      entry.watcher.close();
      this.dirs.delete(dir);
    }
    for (const [dir, names] of wanted) {
      const entry = this.dirs.get(dir);
      if (entry) {
        entry.files = names;
        continue;
      }
      try {
        const watcher = fs.watch(dir, (_type, name) => this.touch(dir, name));
        watcher.on('error', (err) => console.warn('[open-files:watch]', err));
        this.dirs.set(dir, { watcher, files: names });
      } catch (err) {
        console.warn('[open-files:watch] failed:', err);
      }
    }
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.changed.clear();
    this.sync([]);
  }

  private touch(dir: string, name: string | null): void {
    const files = this.dirs.get(dir)?.files;
    if (!files) return;
    // 系统没说是哪个文件：这个目录里打开的都算
    const hits = name ? [files.get(name.normalize('NFC'))] : [...files.values()];
    for (const file of hits) if (file) this.changed.add(file);
    if (this.changed.size === 0) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const paths = [...this.changed];
      this.changed.clear();
      this.timer = null;
      this.onChange(paths);
    }, this.delay);
  }
}
