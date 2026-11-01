import { joinNotePath } from './assetUrl';
import { splitFrontmatter } from '../../electron/shared/noteMeta';

const parts = (p: string) => p.split(/[\\/]/).filter(Boolean);

/** 从 fromDir 指向 target 的相对地址 */
function relativeTo(fromDir: string, target: string): string {
  const a = parts(fromDir);
  const b = parts(target);
  let same = 0;
  while (same < a.length && same < b.length && a[same] === b[same]) same++;
  return [...a.slice(same).map(() => '..'), ...b.slice(same)].join('/');
}

/**
 * 笔记换了目录，文件里的相对地址要跟着改：assets/a.png → ../assets/a.png，不然图片全裂。
 * movedRoot：整个文件夹一起搬时传它的旧路径，指向文件夹里面的地址相对位置没变，不动。
 * 代码、frontmatter、网址、页内锚点、绝对路径都不碰。
 */
export function rebaseRelativeLinks(markdown: string, fromDir: string, toDir: string, movedRoot: string | null = null): string {
  const rebase = (raw: string): string => {
    const angled = raw.startsWith('<') && raw.endsWith('>');
    const target = angled ? raw.slice(1, -1) : raw;
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || /^[#/\\]/.test(target)) return raw;
    const [, file, rest] = /^([^#?]*)(.*)$/s.exec(target) as RegExpExecArray;
    if (!file) return raw;
    const absolute = joinNotePath(fromDir, file);
    if (movedRoot && (absolute === movedRoot || absolute.startsWith(`${movedRoot}/`) || absolute.startsWith(`${movedRoot}\\`))) return raw;
    const next = relativeTo(toDir, absolute) + rest;
    return angled ? `<${next}>` : next;
  };
  const rewriteProse = (text: string) => text
    .replace(/(\]\()(<[^>\n]+>|[^)\s]+)/g, (_m, head: string, target: string) => head + rebase(target))
    .replace(/(<(?:img|audio|video|source)\b[^>\n]*?\bsrc=")([^"\n]+)/gi, (_m, head: string, target: string) => head + rebase(target))
    .replace(/^( {0,3}\[[^\]^][^\]]*\]:[ \t]+)(<[^>\n]+>|\S+)/, (_m, head: string, target: string) => head + rebase(target));

  const skipUntil = splitFrontmatter(markdown).lineOffset;
  let fence: string | null = null;
  return markdown.split('\n').map((line, index) => {
    if (index < skipUntil) return line;
    const m = /^\s*(?:>\s*)*(`{3,}|~{3,})/.exec(line);
    if (m) {
      if (!fence) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      return line;
    }
    if (fence) return line;
    // 行内代码原样留着：单数下标是反引号里的内容
    return line.split(/(`[^`]*`)/).map((piece, i) => (i % 2 ? piece : rewriteProse(piece))).join('');
  }).join('\n');
}
