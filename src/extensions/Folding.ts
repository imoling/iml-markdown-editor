import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';

/**
 * 标题和列表的折叠：点标题左边的箭头收起整节（到下一个同级或更高级的标题为止），有子项的列表项也能收。
 *
 * 只是视图层的事：被收起的块用 display:none 藏起来（node decoration），文档一个字都不动，保存、原样保存都不受影响。
 * 折叠的锚点按块的位置记，编辑时随 tr.mapping 走；锚点被删了，折叠一起没了。
 * 光标进了被藏起来的内容（查找跳过去、方向键走进去）自动展开那一节；在折起来的标题末尾按回车，先展开再换行——
 * 不然新的一行会写进看不见的地方。
 */
export const foldingKey = new PluginKey<FoldingState>('folding');

export interface FoldRange { anchor: number; from: number; to: number }
export interface FoldingState { folded: number[]; hidden: FoldRange[]; decorations: DecorationSet }
interface FoldMeta { toggle?: number[]; fold?: number[]; unfold?: number[]; all?: boolean; none?: boolean }

const HEADING = 'heading';
const isListItem = (node: PMNode) => node.type.name === 'listItem' || node.type.name === 'taskItem';
const isAnchorNode = (node: PMNode) => node.type.name === HEADING || isListItem(node);

/** 这个块折起来要藏哪一段：标题藏到下一个同级或更高级标题之前；列表项藏第一个子块之后的（嵌套列表、多出来的段落）。不能折返回 null */
export function foldableRange(doc: PMNode, pos: number): { from: number; to: number } | null {
  const node = doc.nodeAt(pos);
  if (!node) return null;
  if (node.type.name === HEADING) {
    const $pos = doc.resolve(pos);
    const parent = $pos.parent;
    const level = node.attrs.level as number;
    const from = pos + node.nodeSize;
    let to = from;
    for (let i = $pos.index() + 1; i < parent.childCount; i++) {
      const sib = parent.child(i);
      if (sib.type.name === HEADING && (sib.attrs.level as number) <= level) break;
      to += sib.nodeSize;
    }
    return to > from ? { from, to } : null;
  }
  if (isListItem(node) && node.childCount > 1) return { from: pos + 1 + node.child(0).nodeSize, to: pos + node.nodeSize - 1 };
  return null;
}

/** 光标所在的那一节的锚点：光标在标题里就是它；在正文里就往前找最近的标题（它的范围得盖住光标）；在有子项的列表项里就是那一项 */
export function anchorAt(state: EditorState): number | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth >= 1; depth--) {
    const node = $from.node(depth);
    const pos = $from.before(depth);
    if (node.type.name === HEADING) return foldableRange(state.doc, pos) ? pos : null;
    if (isListItem(node) && foldableRange(state.doc, pos)) return pos;
  }
  // 正文段落：往前找同一层里最近的标题
  for (let depth = $from.depth; depth >= 1; depth--) {
    const parent = $from.node(depth - 1);
    const index = $from.index(depth - 1);
    let p = $from.before(depth);
    for (let i = index - 1; i >= 0; i--) {
      const sib = parent.child(i);
      p -= sib.nodeSize;
      if (sib.type.name === HEADING) {
        const range = foldableRange(state.doc, p);
        return range && $from.pos > range.from && $from.pos < range.to ? p : null;
      }
    }
  }
  return null;
}

function makeToggle(anchor: number, folded: boolean): HTMLElement {
  const btn = document.createElement('span');
  btn.className = 'fold-toggle';
  btn.setAttribute('data-fold-anchor', String(anchor));
  btn.setAttribute('contenteditable', 'false');
  btn.setAttribute('role', 'button');
  btn.setAttribute('aria-expanded', String(!folded));
  btn.setAttribute('title', folded ? '展开' : '折叠');
  btn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5.5 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return btn;
}

function build(doc: PMNode, folded: number[]): { hidden: FoldRange[]; decorations: DecorationSet } {
  const decorations: Decoration[] = [];
  const hidden: FoldRange[] = [];
  const foldedSet = new Set(folded);
  doc.descendants((node, pos) => {
    if (!isAnchorNode(node)) return true;
    const range = foldableRange(doc, pos);
    if (!range) return true;
    const isFolded = foldedSet.has(pos);
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: `fold-anchor${isFolded ? ' is-folded' : ''}` }));
    // 箭头放在第一个文本块的开头：标题自己 / 列表项的第一段
    const inner = node.type.name === HEADING ? pos + 1 : pos + 2;
    decorations.push(Decoration.widget(inner, () => makeToggle(pos, isFolded), { side: -1, key: `fold-${pos}-${isFolded ? 1 : 0}`, ignoreSelection: true }));
    if (!isFolded) return true;
    hidden.push({ anchor: pos, from: range.from, to: range.to });
    if (node.type.name === HEADING) {
      const $pos = doc.resolve(pos);
      const parent = $pos.parent;
      let p = range.from;
      for (let i = $pos.index() + 1; i < parent.childCount && p < range.to; i++) {
        const sib = parent.child(i);
        decorations.push(Decoration.node(p, p + sib.nodeSize, { class: 'fold-hidden' }));
        p += sib.nodeSize;
      }
    } else {
      let p = pos + 1 + node.child(0).nodeSize;
      for (let i = 1; i < node.childCount; i++) {
        const child = node.child(i);
        decorations.push(Decoration.node(p, p + child.nodeSize, { class: 'fold-hidden' }));
        p += child.nodeSize;
      }
    }
    return true;
  });
  return { hidden, decorations: DecorationSet.create(doc, decorations) };
}

const allAnchors = (doc: PMNode): number[] => {
  const out: number[] = [];
  doc.descendants((node, pos) => { if (isAnchorNode(node) && foldableRange(doc, pos)) out.push(pos); return true; });
  return out;
};

const plugin = new Plugin<FoldingState>({
  key: foldingKey,
  state: {
    init: (_config, state) => ({ folded: [], ...build(state.doc, []) }),
    apply(tr, prev, _old, state) {
      const meta = tr.getMeta(foldingKey) as FoldMeta | undefined;
      if (!tr.docChanged && !meta) return prev;
      let folded = prev.folded;
      if (tr.docChanged) folded = folded.map((p) => { const r = tr.mapping.mapResult(p); return r.deleted ? -1 : r.pos; }).filter((p) => p >= 0);
      if (meta) {
        const set = new Set(folded);
        meta.toggle?.forEach((p) => (set.has(p) ? set.delete(p) : set.add(p)));
        meta.fold?.forEach((p) => set.add(p));
        meta.unfold?.forEach((p) => set.delete(p));
        if (meta.all) allAnchors(state.doc).forEach((p) => set.add(p));
        if (meta.none) set.clear();
        folded = Array.from(set);
      }
      // 位置映射之后可能已经不是能折的块了（标题被改成段落、列表项的子项删光了）
      folded = folded.filter((p) => foldableRange(state.doc, p));
      return { folded, ...build(state.doc, folded) };
    },
  },
  props: {
    decorations: (state) => foldingKey.getState(state)?.decorations,
    handleDOMEvents: {
      mousedown(view: EditorView, event: MouseEvent) {
        const toggle = (event.target as HTMLElement | null)?.closest?.('.fold-toggle');
        if (!toggle) return false;
        event.preventDefault();
        view.dispatch(view.state.tr.setMeta(foldingKey, { toggle: [Number(toggle.getAttribute('data-fold-anchor'))] }));
        return true;
      },
    },
    handleKeyDown(view: EditorView, event: KeyboardEvent) {
      if (event.key !== 'Enter') return false;
      const st = foldingKey.getState(view.state);
      const { $from, empty } = view.state.selection;
      if (!st?.hidden.length || !empty || $from.parent.type.name !== HEADING || $from.parentOffset !== $from.parent.content.size) return false;
      const anchor = $from.before($from.depth);
      if (!st.hidden.some((h) => h.anchor === anchor)) return false;
      view.dispatch(view.state.tr.setMeta(foldingKey, { unfold: [anchor] }));
      return false; // 展开之后回车照常
    },
  },
  appendTransaction(trs, _old, state) {
    const st = foldingKey.getState(state);
    if (!st?.hidden.length || !trs.some((tr) => tr.selectionSet || tr.docChanged)) return null;
    const { from, to } = state.selection;
    const hit = st.hidden.filter((h) => (from > h.from && from < h.to) || (to > h.from && to < h.to));
    return hit.length ? state.tr.setMeta(foldingKey, { unfold: hit.map((h) => h.anchor) }) : null;
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    folding: {
      /** 折起 / 展开光标所在的那一节 */
      toggleFold: () => ReturnType;
      foldSection: () => ReturnType;
      unfoldSection: () => ReturnType;
      foldAll: () => ReturnType;
      unfoldAll: () => ReturnType;
    };
  }
}

export const Folding = Extension.create({
  name: 'folding',
  addProseMirrorPlugins() { return [plugin]; },
  addCommands() {
    const withAnchor = (key: keyof FoldMeta) => () => ({ state, dispatch }: { state: EditorState; dispatch?: (tr: any) => void }) => {
      const anchor = anchorAt(state);
      if (anchor == null) return false;
      dispatch?.(state.tr.setMeta(foldingKey, { [key]: [anchor] }));
      return true;
    };
    return {
      toggleFold: withAnchor('toggle'),
      foldSection: withAnchor('fold'),
      unfoldSection: withAnchor('unfold'),
      foldAll: () => ({ state, dispatch }) => { dispatch?.(state.tr.setMeta(foldingKey, { all: true })); return true; },
      unfoldAll: () => ({ state, dispatch }) => { dispatch?.(state.tr.setMeta(foldingKey, { none: true })); return true; },
    };
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-[': () => this.editor.commands.foldSection(),
      'Mod-Alt-]': () => this.editor.commands.unfoldSection(),
    };
  },
});
