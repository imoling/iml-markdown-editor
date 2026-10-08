import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { DOMSerializer } from '@tiptap/pm/model';
import { htmlToMarkdown } from './markdown';
import { getSourceMap, extraBlankLines, isBlankParagraph, type SourceMap } from './sourceMap';

/**
 * 增量序列化：按顶层块缓存 Markdown。
 * ProseMirror 的节点是不可变对象，没被编辑的块在新文档里仍是同一个对象，直接复用缓存；
 * 只有被改动的块才重新走 HTML → Markdown。整篇转换的开销从 O(全文) 降到 O(改动块)。
 *
 * 如果这份文档登记过原文对照表（见 sourceMap.ts），没被编辑的块直接写回文件里的原文，连块与块之间的空行也照原样。
 *
 * 顶层的空段落不是块：它代表块与块之间多出来的空行（见 sourceMap.ts 的 extraBlankLines），
 * 两块之间有几个空段落，就比正常的段落间隔多写几个空行；文末的空段落不写进文件。
 */
const blockCache = new WeakMap<PMNode, string>();

export interface SerializedDoc {
  markdown: string;
  /** 文档里是否含有 data URL 图片（用于防止往返转换丢图的保护逻辑） */
  hasDataImage: boolean;
}

interface Segment {
  text: string;
  /** 原文块的下标；转换得到的块为 -1 */
  block: number;
  nodeType: string;
  /** 这一块前面有几个空段落：写成几个多出来的空行 */
  blanksBefore: number;
}

/** 这几种块的下一行不会被并进来，和后面的内容之间只隔一个换行也安全 */
const SELF_CONTAINED = new Set(['heading', 'horizontalRule', 'codeBlock', 'hr', 'code']);
const isBulletish = (type: string) => type === 'bulletList' || type === 'taskList';

function hasDataUrlImage(node: PMNode): boolean {
  if (node.type.name === 'image') return typeof node.attrs.src === 'string' && node.attrs.src.startsWith('data:');
  let found = false;
  node.descendants((child) => {
    if (child.type.name === 'image' && typeof child.attrs.src === 'string' && child.attrs.src.startsWith('data:')) found = true;
    return !found;
  });
  return found;
}

export function serializeDoc(editor: Editor): SerializedDoc {
  const { doc, schema } = editor.state;
  const serializer = DOMSerializer.fromSchema(schema);
  const source = getSourceMap(editor);
  let hasDataImage = false;

  const convert = (node: PMNode): string => {
    let md = blockCache.get(node);
    if (md === undefined) {
      const container = document.createElement('div');
      container.appendChild(serializer.serializeNode(node));
      md = htmlToMarkdown(container.innerHTML).trim();
      blockCache.set(node, md);
    }
    return md;
  };

  const segments: Segment[] = [];
  const nodes: PMNode[] = [];
  doc.forEach((node) => nodes.push(node));

  // 攒起来的空段落，归到下一块前面；走完全文还剩下的就是文末的空段落，不写
  let blanks = 0;
  for (let j = 0; j < nodes.length; j++) {
    const node = nodes[j];
    if (isBlankParagraph(node)) { blanks++; continue; }
    // data 图片的检测必须覆盖每个节点：转换把图片弄丢（md 为空）正是它要防的情况
    if (!hasDataImage && hasDataUrlImage(node)) hasDataImage = true;

    // 原文块：它对应的全部节点都还在、顺序没变、一个都没被编辑过，才用原文
    const origin = source?.origin.get(node);
    if (source && origin && origin.part === 0) {
      const count = source.blocks[origin.block].nodeCount;
      let intact = true;
      for (let k = 1; k < count && intact; k++) {
        const o = nodes[j + k] ? source.origin.get(nodes[j + k]) : undefined;
        intact = !!o && o.block === origin.block && o.part === k;
      }
      if (intact) {
        for (let k = 1; k < count; k++) if (!hasDataImage && hasDataUrlImage(nodes[j + k])) hasDataImage = true;
        segments.push({ text: source.blocks[origin.block].raw, block: origin.block, nodeType: node.type.name, blanksBefore: blanks });
        blanks = 0;
        j += count - 1;
        continue;
      }
    }
    const md = convert(node);
    if (md) {
      segments.push({ text: md, block: -1, nodeType: node.type.name, blanksBefore: blanks });
      blanks = 0;
    }
  }

  // frontmatter 必须在文件最开头才有意义：万一它前面被插进了别的块，保存时也提到最前面
  const front = segments.filter((s) => s.nodeType === 'frontmatter');
  const ordered = [...front, ...segments.filter((s) => s.nodeType !== 'frontmatter')];

  return { markdown: assemble(ordered, source), hasDataImage };
}

function separator(prev: Segment, next: Segment, source: SourceMap | null, usedGaps: Set<number>): string {
  const k = next.blanksBefore;
  if (source) {
    if (prev.block >= 0 && next.block === prev.block + 1) {
      const { gap, defs } = source.blocks[prev.block];
      usedGaps.add(prev.block);
      // 两块都是原文且在文件里本来就相邻、中间的空行也没增删：中间的内容（空行、链接引用定义）原样搬回来
      if (extraBlankLines(gap) === k) return gap;
      // 中间的空段落被增删过：按新的空行数写；定义仍留在这个位置
      return defs.length ? `\n\n${defs.join('\n')}\n\n${'\n'.repeat(k)}` : `\n\n${'\n'.repeat(k)}`;
    }
    // 一边是原文、一边被改过：作者「标题后面不空行」的习惯沿用——但只在少一个空行也不会改变结构时才敢只隔一个换行。
    // 多空几行的习惯不沿用：多出来的空行现在是看得见的空段落，不该凭空长出来
    if (k === 0) {
      const gap = prev.block >= 0 ? source.blocks[prev.block].gap : next.block > 0 ? source.blocks[next.block - 1].gap : null;
      if (gap === '\n') {
        const prevType = prev.block >= 0 ? source.blocks[prev.block].type : prev.nodeType;
        if (SELF_CONTAINED.has(prevType)) return gap;
      }
    }
  }
  // 相邻的无序列表 / 任务列表在 Markdown 里是同一个列表（混排被拆开的结果），中间不留空行
  if (k === 0 && prev.block < 0 && next.block < 0 && isBulletish(prev.nodeType) && isBulletish(next.nodeType)) return '\n';
  return `\n\n${'\n'.repeat(k)}`;
}

function assemble(segments: Segment[], source: SourceMap | null): string {
  if (segments.length === 0) return '';
  const usedGaps = new Set<number>();
  const leading = segments[0].blanksBefore;
  // 文件开头的空行：第一块是原文、开头的空段落也没增删，才原样保留；否则 n 个空段落写成 n + 1 个空行
  const headKept = !!source && segments[0].block === 0 && extraBlankLines(source.head, true) === leading;
  let out = headKept && source ? source.head : leading > 0 ? '\n'.repeat(leading + 1) : '';
  segments.forEach((seg, i) => {
    if (i > 0) out += separator(segments[i - 1], seg, source, usedGaps);
    out += seg.text;
  });
  if (!source) return out;

  const last = segments[segments.length - 1];
  const lastIndex = source.blocks.length - 1;
  if (last.block === lastIndex) {
    usedGaps.add(lastIndex);
    out += source.blocks[lastIndex].gap;
  }
  // 没能随 gap 原样带回来的链接引用定义补在文末：它们在编辑器里不可见，不能因为旁边的块被改过就悄悄丢掉
  const orphanDefs = [...(headKept ? [] : source.headDefs), ...source.blocks.flatMap((b, i) => (usedGaps.has(i) ? [] : b.defs))];
  if (orphanDefs.length) out = `${out.replace(/\n+$/, '')}\n\n${orphanDefs.join('\n')}`;
  if (source.endsWithNewline && !out.endsWith('\n')) out += '\n';
  return source.eol === '\r\n' ? out.replace(/\r?\n/g, '\r\n') : out;
}
