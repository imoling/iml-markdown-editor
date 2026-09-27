/**
 * 最近用过的笔记库：新的在前，当前这个排第一。
 * 换库是全局的动作（日记、快速捕获、搜索都跟着走），得让人随时回得去——不然换一次就要在文件选择框里重新找一遍目录。
 * 主进程在存设置时维护这份名单，不管是从哪个入口换的（菜单、拖进来、设置、同步盘）。
 */
export const MAX_RECENT_LIBRARIES = 8;

const clean = (p: unknown): string => (typeof p === 'string' && p.trim().length > 1 ? p.trim().replace(/[\\/]+$/, '') : typeof p === 'string' ? p.trim() : '');

/** 存下来的名单不一定靠得住（旧版本没有、手改坏了）：去掉不是路径的、重复的，当前的笔记库放到最前 */
export function normalizeRecentLibraries(stored: unknown, current: unknown): string[] {
  const out: string[] = [];
  for (const p of [current, ...(Array.isArray(stored) ? stored : [])]) {
    const path = clean(p);
    if (path && !out.includes(path)) out.push(path);
  }
  return out.slice(0, MAX_RECENT_LIBRARIES);
}

/** 换到 next 之后的名单；previous 是换之前的笔记库（名单是后来才有的，第一次换库时它还不在里面） */
export function touchRecentLibraries(stored: unknown, previous: unknown, next: unknown): string[] {
  return normalizeRecentLibraries([previous, ...(Array.isArray(stored) ? stored : [])], next);
}

/** 给人看的名字和位置：名字是最后一级目录，位置是它上面那一截（用户目录缩成 ~） */
export function describeLibrary(path: string): { name: string; where: string } {
  const parts = clean(path).split(/[\\/]/);
  const name = parts.pop() || path;
  const sep = path.includes('\\') ? '\\' : '/';
  const where = parts.join(sep).replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, '~').replace(/^[A-Za-z]:\\Users\\[^\\]+(?=\\|$)/, '~');
  return { name, where: where || sep };
}
