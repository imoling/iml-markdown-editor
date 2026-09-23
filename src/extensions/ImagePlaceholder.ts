import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * 出图时先在正文里占个位：一块带微光动效的方框，上面写着提示词和进度（正在读模型 / 第几步），
 * 画完原地换成真图。本机出图要好几分钟，气泡菜单一关就什么都看不见了，占位块留在文里，
 * 人就知道「这儿有张图在路上」，也能随时点它取消。
 *
 * 只是一层装饰（widget decoration），不进文档、不会被保存——生成到一半保存文件，落盘的还是原文。
 */
export const imagePlaceholderKey = new PluginKey<PlaceholderState>('imagePlaceholder');

export interface PlaceholderItem {
  id: string;
  /** 插在哪：编辑时跟着位置走 */
  pos: number;
  prompt: string;
  /** 进度文案，每秒更新 */
  text: string;
  onCancel?: () => void;
}
export interface PlaceholderState { items: PlaceholderItem[]; decorations: DecorationSet }
interface Meta { add?: Omit<PlaceholderItem, 'text'> & { text?: string }; update?: { id: string; text: string }; remove?: string }

function render(item: PlaceholderItem): HTMLElement {
  const box = document.createElement('div');
  box.className = 'img-ph';
  box.setAttribute('contenteditable', 'false');
  box.setAttribute('data-ph-id', item.id);
  const art = document.createElement('div');
  art.className = 'img-ph__art';
  box.appendChild(art);
  const body = document.createElement('div');
  body.className = 'img-ph__body';
  const title = document.createElement('div');
  title.className = 'img-ph__title';
  title.textContent = item.prompt.length > 40 ? `${item.prompt.slice(0, 40)}…` : item.prompt;
  title.title = item.prompt;
  const note = document.createElement('div');
  note.className = 'img-ph__note';
  note.textContent = item.text;
  body.append(title, note);
  box.appendChild(body);
  if (item.onCancel) {
    const cancel = document.createElement('button');
    cancel.className = 'img-ph__cancel';
    cancel.type = 'button';
    cancel.textContent = '取消';
    cancel.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); item.onCancel?.(); });
    box.appendChild(cancel);
  }
  return box;
}

function build(doc: any, items: PlaceholderItem[]): DecorationSet {
  const max = doc.content.size;
  return DecorationSet.create(doc, items.map((item) => Decoration.widget(Math.min(item.pos, max), () => render(item), {
    // key 带上文案：文案变了才重建这个节点，动效不会每秒重头开始
    key: `img-ph-${item.id}-${item.text}`,
    side: 1,
    ignoreSelection: true,
  })));
}

const plugin = new Plugin<PlaceholderState>({
  key: imagePlaceholderKey,
  state: {
    init: (_c, state) => ({ items: [], decorations: build(state.doc, []) }),
    apply(tr, prev, _old, state) {
      const meta = tr.getMeta(imagePlaceholderKey) as Meta | undefined;
      if (!tr.docChanged && !meta) return prev;
      let items = prev.items;
      if (tr.docChanged) {
        items = items.map((it) => {
          const r = tr.mapping.mapResult(it.pos);
          return r.deleted ? null : { ...it, pos: r.pos };
        }).filter(Boolean) as PlaceholderItem[];
      }
      if (meta?.add) items = [...items, { text: '正在准备…', ...meta.add }];
      if (meta?.update) items = items.map((it) => (it.id === meta.update!.id ? { ...it, text: meta.update!.text } : it));
      if (meta?.remove) items = items.filter((it) => it.id !== meta.remove);
      return { items, decorations: build(state.doc, items) };
    },
  },
  props: { decorations: (state) => imagePlaceholderKey.getState(state)?.decorations },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    imagePlaceholder: {
      /** 在光标处占个位，返回的 id 用来更新进度、收尾 */
      addImagePlaceholder: (item: { id: string; prompt: string; onCancel?: () => void }) => ReturnType;
      updateImagePlaceholder: (id: string, text: string) => ReturnType;
      removeImagePlaceholder: (id: string) => ReturnType;
    };
  }
}

export const ImagePlaceholder = Extension.create({
  name: 'imagePlaceholder',
  addProseMirrorPlugins() { return [plugin]; },
  addCommands() {
    return {
      addImagePlaceholder: (item) => ({ state, dispatch }) => {
        dispatch?.(state.tr.setMeta(imagePlaceholderKey, { add: { ...item, pos: state.selection.from } }));
        return true;
      },
      updateImagePlaceholder: (id, text) => ({ state, dispatch }) => {
        dispatch?.(state.tr.setMeta(imagePlaceholderKey, { update: { id, text } }));
        return true;
      },
      removeImagePlaceholder: (id) => ({ state, dispatch }) => {
        dispatch?.(state.tr.setMeta(imagePlaceholderKey, { remove: id }));
        return true;
      },
    };
  },
});

/** 占位块现在在哪（编辑过之后位置会变）；已经没了就返回 null */
export function placeholderPos(state: any, id: string): number | null {
  const found = imagePlaceholderKey.getState(state)?.items.find((it: PlaceholderItem) => it.id === id);
  return found ? found.pos : null;
}
