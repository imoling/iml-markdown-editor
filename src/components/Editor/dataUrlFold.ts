import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { StateField, type EditorState, type Range, type Text } from '@codemirror/state';
import { formatBytes } from '../../utils/pasteImage';
import { findDataUrlRanges } from '../../../electron/shared/dataUrl';

/**
 * 源码模式：写进笔记里的图片是一长串 base64（一张截图几十万个字符），原样摊开的话那一行没法看。
 * 这里把 `data:image/…;base64,` 后面那一长串折成一个小标签（「… 312 KB …」）。只是显示上折起来，文件内容不动；
 * 光标整体跳过它，删的时候整段删。
 */
class SizeWidget extends WidgetType {
  constructor(readonly bytes: number) { super(); }
  eq(other: SizeWidget) { return other.bytes === this.bytes; }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-data-url-fold';
    el.textContent = `… ${formatBytes(this.bytes)} …`;
    return el;
  }
}

/** base64 不会跨行：按行扫，短的行直接跳过 */
function scan(doc: Text, from: number, to: number): Range<Decoration>[] {
  const out: Range<Decoration>[] = [];
  for (let pos = from; pos <= to; ) {
    const line = doc.lineAt(pos);
    if (line.length >= 200) {
      for (const r of findDataUrlRanges(line.text, line.from)) out.push(Decoration.replace({ widget: new SizeWidget(r.bytes) }).range(r.from, r.to));
    }
    pos = line.to + 1;
  }
  return out;
}

export const dataUrlFoldField = StateField.define<DecorationSet>({
  create: (state) => Decoration.set(scan(state.doc, 0, state.doc.length)),
  update(deco, tr) {
    if (!tr.docChanged) return deco;
    let next = deco.map(tr.changes);
    // 只重扫改动碰到的那几行：整篇重扫的话，带着几 MB 图片的笔记每敲一个字都要卡一下
    tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
      const from = tr.newDoc.lineAt(fromB).from;
      const to = tr.newDoc.lineAt(toB).to;
      next = next.update({ filterFrom: from, filterTo: to, filter: () => false, add: scan(tr.newDoc, from, to) });
    });
    return next;
  },
  provide: (field) => [EditorView.decorations.from(field), EditorView.atomicRanges.of((view) => view.state.field(field))],
});

/** 这一段是不是落在折起来的地方（查找要跳过：那里面的字母数字不是正文，跳过去也看不见） */
export function inDataUrlFold(state: EditorState, from: number, to: number): boolean {
  const folds = state.field(dataUrlFoldField, false);
  if (!folds) return false;
  let hit = false;
  folds.between(from, to, (a, b) => { if (from < b && to > a) hit = true; return hit ? false : undefined; });
  return hit;
}

export const dataUrlFold = [dataUrlFoldField];
