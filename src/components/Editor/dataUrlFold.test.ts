import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { SearchQuery } from '@codemirror/search';
import { dataUrlFold, dataUrlFoldField, inDataUrlFold } from './dataUrlFold';

const B64 = 'QUJD'.repeat(100); // 400 个字符 = 300 字节
const image = (alt = '图') => `![${alt}](data:image/webp;base64,${B64})`;

function folded(state: EditorState): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  state.field(dataUrlFoldField).between(0, state.doc.length, (from, to) => { out.push({ from, to }); });
  return out;
}

describe('源码模式：写进笔记里的图片折起来', () => {
  it('改别的行不重扫也不丢；改到图片所在的行，位置跟着走；把图片删了，折叠也没了', () => {
    let state = EditorState.create({ doc: `# 标题\n\n${image()}\n\n结尾`, extensions: dataUrlFold });
    const before = folded(state);
    expect(before).toHaveLength(1);

    state = state.update({ changes: { from: 0, insert: '新的一行\n' } }).state;
    expect(folded(state)).toEqual([{ from: before[0].from + 5, to: before[0].to + 5 }]);
    expect(state.doc.sliceString(folded(state)[0].from, folded(state)[0].to)).toBe(B64);

    const line = state.doc.lineAt(folded(state)[0].from);
    state = state.update({ changes: { from: line.from, insert: '看图：' } }).state;
    expect(state.doc.sliceString(folded(state)[0].from, folded(state)[0].to)).toBe(B64);

    const again = state.doc.lineAt(folded(state)[0].from);
    state = state.update({ changes: { from: again.from, to: again.to, insert: '图没了' } }).state;
    expect(folded(state)).toEqual([]);
  });

  it('查找跳过折起来的地方：base64 里碰巧有的字母不算命中，正文里的照常', () => {
    const doc = `QUJD 在正文里\n\n${image()}\n\n又一处 QUJD`;
    const state = EditorState.create({ doc, extensions: dataUrlFold });
    const hits = (test?: (m: string, s: EditorState, from: number, to: number) => boolean) => {
      const cursor = new SearchQuery({ search: 'QUJD', literal: true, caseSensitive: true, test }).getCursor(state);
      const out: number[] = [];
      for (let r = cursor.next(); !r.done; r = cursor.next()) out.push(r.value.from);
      return out;
    };
    expect(hits().length).toBe(102);
    expect(hits((_m, s, from, to) => !inDataUrlFold(s, from, to))).toEqual([0, doc.lastIndexOf('QUJD')]);
    // 没装折叠的编辑器里：什么都不跳
    expect(inDataUrlFold(EditorState.create({ doc }), 30, 34)).toBe(false);
  });
});
