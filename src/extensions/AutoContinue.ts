import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import { ReplaceStep } from '@tiptap/pm/transform';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as PMNode } from '@tiptap/pm/model';
import { BEFORE_CHARS, AFTER_CHARS } from '../utils/autoContinue';

/**
 * 自动续写的编辑器半边：打字停顿一会儿，在光标后面画一段灰字（widget decoration，文档一个字都不动），
 * Tab 收下，Esc 或者点别处就收起；接着打的字正好和灰字开头一样时，灰字跟着缩短而不是消失。
 *
 * 什么时候去要：光标在一个普通段落的末尾、段落里已经有字、不在代码块 / 标题里、没选中文字、没在输入法拼字、
 * 没在打 / 命令或 [[ 链接。要回来的时候文档和光标得还是发请求那一刻的样子，否则作废。
 * 取续写的办法由外面给（provider），这里不认识模型服务，测试里用的编辑器也就不会发请求。
 */

export interface ContinueRequest {
  before: string;
  after: string;
  /** 流式回来的每一块都给洗好的完整续写（不是增量） */
  onUpdate: (text: string) => void;
}

export interface AutoContinueProvider {
  /** 现在要不要续写、停顿多久；返回 null 表示关着 */
  settings: () => { delay: number } | null;
  /** 发请求；返回的函数用来取消 */
  request: (req: ContinueRequest) => { done: Promise<void>; cancel: () => void };
}

interface GhostState {
  pos: number;
  text: string;
  decorations: DecorationSet;
}

type Meta = { show: { pos: number; text: string } } | { clear: true };

export const autoContinueKey = new PluginKey<GhostState | null>('autoContinue');


function ghostDecorations(doc: PMNode, pos: number, text: string) {
  return DecorationSet.create(doc, [
    Decoration.widget(pos, () => {
      const span = document.createElement('span');
      span.className = 'ai-ghost';
      span.textContent = text;
      span.setAttribute('contenteditable', 'false');
      return span;
    }, { side: 1, key: `ghost:${text}`, ignoreSelection: true }),
  ]);
}

const makeGhost = (doc: PMNode, pos: number, text: string): GhostState | null =>
  text ? { pos, text, decorations: ghostDecorations(doc, pos, text) } : null;

/**
 * 这一笔是不是「在光标处打字」（整篇换内容、粘贴大段、撤销一大片都不算）。
 * 输入法上屏一律算：一整句拼音「chuang qian ming yue guang」换成五个汉字，一步就要替换二三十个字符
 */
const SMALL_EDIT = 64;
function isSmallEdit(tr: Transaction) {
  if (!tr.docChanged) return false;
  // 输入法上屏放在最前：空笔记里打第一个字，编辑器可能把整段一起换掉，看着像换篇
  if (tr.getMeta('composition') !== undefined) return true;
  // 换篇（setContent）是一步把整篇换掉，哪怕内容很短
  const wholeDoc = tr.steps.some((s, i) => s instanceof ReplaceStep && (s as any).from === 0 && (s as any).to === tr.docs[i].content.size);
  if (wholeDoc) return false;
  if (tr.steps.length > 3) return false;
  return tr.steps.every((s) => s instanceof ReplaceStep && (s as any).slice.size <= SMALL_EDIT && (s as any).to - (s as any).from <= SMALL_EDIT);
}

/** 光标处这一笔插进来的纯文本（只认单个插入步） */
function insertedText(tr: Transaction): { at: number; text: string } | null {
  if (tr.steps.length !== 1) return null;
  const step = tr.steps[0] as any;
  if (!(step instanceof ReplaceStep) || step.from !== step.to) return null;
  const text = step.slice.content.textBetween(0, step.slice.content.size, '\n');
  return text && step.slice.content.childCount === 1 && step.slice.content.firstChild?.isText ? { at: step.from, text } : null;
}

/** 光标处能不能续写；能的话给出前文和后文 */
export function continueContext(state: EditorState): { pos: number; before: string; after: string } | null {
  const { selection, doc } = state;
  if (!selection.empty) return null;
  const $pos = selection.$from;
  const block = $pos.parent;
  if (block.type.name !== 'paragraph' || block.type.spec.code) return null;
  for (let d = $pos.depth; d > 0; d--) if ($pos.node(d).type.spec.code) return null;
  // 段落末尾（后面只剩空白也算）
  const rest = block.textBetween($pos.parentOffset, block.content.size, '', ' ');
  if (rest.trim()) return null;
  const line = block.textBetween(0, $pos.parentOffset, '', ' ');
  if (!line.trim()) return null;
  // 正在打 / 命令、[[ 链接、#标签：那边有自己的补全菜单
  if (/(^|\s)\/\S*$/.test(line) || /\[\[[^\]]*$/.test(line) || /(^|\s)#[^\s#]*$/.test(line)) return null;
  const pos = $pos.pos;
  const before = doc.textBetween(Math.max(0, pos - BEFORE_CHARS), pos, '\n\n', ' ');
  const after = doc.textBetween(pos, Math.min(doc.content.size, pos + AFTER_CHARS), '\n\n', ' ');
  return { pos, before, after };
}

export const AutoContinue = Extension.create<{ provider: AutoContinueProvider | null }>({
  name: 'autoContinue',
  // 比列表的 Tab 缩进先拿到按键：有灰字时 Tab 是「收下」
  priority: 1000,

  addOptions() {
    return { provider: null };
  },

  addProseMirrorPlugins() {
    const provider = this.options.provider;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inflight: { cancel: () => void } | null = null;
    // Esc 之后同一个位置不再要，直到再动笔
    let dismissedDoc: PMNode | null = null;
    // 最近一笔改文档的事务是不是「在光标处打了几个字」，给 view.update 判断要不要开始计时
    let lastEditSmall = false;

    const cancelPending = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (inflight) { inflight.cancel(); inflight = null; }
    };

    const clear = (view: EditorView) => {
      cancelPending();
      if (autoContinueKey.getState(view.state)) view.dispatch(view.state.tr.setMeta(autoContinueKey, { clear: true } satisfies Meta));
    };

    const fire = (view: EditorView) => {
      timer = null;
      if (!provider || view.isDestroyed || !view.hasFocus()) return;
      // 还在输入法里拼字：再等一轮（拼完那一下文档往往已经不再变，不会有新的 update 来叫醒计时）
      if (view.composing) { schedule(view); return; }
      if (dismissedDoc === view.state.doc) return;
      const ctx = continueContext(view.state);
      if (!ctx) return;
      const doc = view.state.doc;
      const stillHere = () => !view.isDestroyed && view.state.doc === doc && view.state.selection.empty && view.state.selection.from === ctx.pos;
      const req = provider.request({
        before: ctx.before,
        after: ctx.after,
        onUpdate: (text) => {
          if (!stillHere()) return;
          view.dispatch(view.state.tr.setMeta(autoContinueKey, { show: { pos: ctx.pos, text } } satisfies Meta).setMeta('addToHistory', false));
        },
      });
      inflight = req;
      req.done.catch(() => {}).finally(() => { if (inflight === req) inflight = null; });
    };

    const schedule = (view: EditorView) => {
      cancelPending();
      const s = provider?.settings();
      if (!s) return;
      timer = setTimeout(() => fire(view), s.delay);
    };

    return [
      new Plugin<GhostState | null>({
        key: autoContinueKey,
        state: {
          init: () => null,
          apply(tr, ghost, _old, newState) {
            if (tr.docChanged) lastEditSmall = isSmallEdit(tr);
            const meta = tr.getMeta(autoContinueKey) as Meta | undefined;
            if (meta && 'clear' in meta) return null;
            if (meta && 'show' in meta) return makeGhost(newState.doc, meta.show.pos, meta.show.text);
            if (!ghost) return null;
            if (tr.docChanged) {
              // 照着灰字往下打：灰字吃掉打过的部分，剩下的留着
              const ins = insertedText(tr);
              if (ins && ins.at === ghost.pos && ghost.text.startsWith(ins.text) && ghost.text.length > ins.text.length) {
                return makeGhost(newState.doc, ghost.pos + ins.text.length, ghost.text.slice(ins.text.length));
              }
              return null;
            }
            if (tr.selectionSet && !(newState.selection.empty && newState.selection.from === ghost.pos)) return null;
            return ghost;
          },
        },
        props: {
          decorations(state) {
            return autoContinueKey.getState(state)?.decorations ?? DecorationSet.empty;
          },
          handleKeyDown(view, event) {
            const ghost = autoContinueKey.getState(view.state);
            if (!ghost) return false;
            if (event.key === 'Tab' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && !event.isComposing) {
              event.preventDefault();
              cancelPending();
              // 收下的这段单独算一步撤销：⌘Z 只退掉它，不连带前面自己打的字
              const tr = closeHistory(view.state.tr).insertText(ghost.text, ghost.pos).setMeta(autoContinueKey, { clear: true } satisfies Meta);
              view.dispatch(tr.scrollIntoView());
              // 收下之后接着停顿会续下一句
              schedule(view);
              return true;
            }
            if (event.key === 'Escape') {
              dismissedDoc = view.state.doc;
              clear(view);
              return true;
            }
            return false;
          },
          handleDOMEvents: {
            blur(view) { clear(view); return false; },
            compositionstart(view) { clear(view); return false; },
          },
        },
        view() {
          return {
            update(view, prev) {
              if (view.state.doc === prev.doc) {
                // 光标挪走了：还在等的那一下作废
                if (!view.state.selection.eq(prev.selection) && !autoContinueKey.getState(view.state)) cancelPending();
                return;
              }
              if (autoContinueKey.getState(view.state)) return; // 正在照着灰字打
              dismissedDoc = null;
              cancelPending();
              // 输入法拼字中也照常计时：汉字上屏的那一笔就发生在拼字状态里，到点时 fire 会再看一眼
              if (!provider?.settings()) return;
              // 只在光标处的小改动之后去要；换篇、粘贴、撤销一大片之后不算停顿
              if (!lastEditSmall) return;
              schedule(view);
            },
            destroy() { cancelPending(); },
          };
        },
      }),
    ];
  },
});
