import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { SearchExtension, findMatches, searchPluginKey } from './SearchExtension';

let editor: Editor;

beforeEach(() => {
  editor = new Editor({
    extensions: [StarterKit, SearchExtension],
    content: '<p>Hello hello <strong>hel</strong>lo world</p><p>second Hello</p>',
  });
});
afterEach(() => editor.destroy());

const matchTexts = () =>
  (searchPluginKey.getState(editor.state)?.matches ?? []).map((m) => editor.state.doc.textBetween(m.from, m.to));

describe('findMatches', () => {
  it('不区分大小写时跨加粗边界也能命中', () => {
    const matches = findMatches(editor.state.doc, 'hello', false);
    expect(matches.map((m) => editor.state.doc.textBetween(m.from, m.to))).toEqual(['Hello', 'hello', 'hello', 'Hello']);
  });

  it('区分大小写时只命中精确匹配', () => {
    expect(findMatches(editor.state.doc, 'Hello', true)).toHaveLength(2);
  });

  it('小写化会改变长度的字符（İ）退回按原文匹配，偏移不漂移', () => {
    editor.commands.setContent('<p>İstanbul is a test city</p>');
    const matches = findMatches(editor.state.doc, 'test', false);
    expect(matches).toHaveLength(1);
    expect(editor.state.doc.textBetween(matches[0].from, matches[0].to)).toBe('test');
  });
});

describe('search commands', () => {
  it('设置查找词后高亮全部匹配并选中光标后最近的一个', () => {
    editor.commands.setSearchTerm('hello', false);
    const ps = searchPluginKey.getState(editor.state)!;
    expect(ps.matches).toHaveLength(4);
    expect(ps.current).toBe(0);
    expect(matchTexts()[ps.current]).toBe('Hello');
    expect(editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)).toBe('Hello');
  });

  it('findNext / findPrev 循环定位', () => {
    editor.commands.setSearchTerm('hello', false);
    editor.commands.findNext();
    expect(searchPluginKey.getState(editor.state)!.current).toBe(1);
    editor.commands.findPrev();
    editor.commands.findPrev();
    expect(searchPluginKey.getState(editor.state)!.current).toBe(3);
  });

  it('replaceCurrentMatch 替换当前并跳到下一个', () => {
    editor.commands.setSearchTerm('hello', false);
    editor.commands.replaceCurrentMatch('hi');
    expect(editor.state.doc.textContent).toBe('hi hello hello worldsecond Hello');
    const ps = searchPluginKey.getState(editor.state)!;
    expect(ps.matches).toHaveLength(3);
    expect(ps.current).toBe(0);
  });

  it('replaceAllMatches 全部替换后无匹配', () => {
    editor.commands.setSearchTerm('hello', false);
    editor.commands.replaceAllMatches('X');
    expect(editor.state.doc.textContent).toBe('X X X worldsecond X');
    expect(searchPluginKey.getState(editor.state)!.matches).toHaveLength(0);
  });

  it('清空查找词后没有高亮', () => {
    editor.commands.setSearchTerm('hello', false);
    editor.commands.setSearchTerm('', false);
    expect(searchPluginKey.getState(editor.state)!.matches).toHaveLength(0);
    expect(searchPluginKey.getState(editor.state)!.decorations.find()).toHaveLength(0);
  });

  it('用户手动编辑掉匹配项后计数跟着变', () => {
    editor.commands.setSearchTerm('world', false);
    expect(searchPluginKey.getState(editor.state)!.matches).toHaveLength(1);
    editor.commands.setContent('<p>nothing here</p>');
    expect(searchPluginKey.getState(editor.state)!.matches).toHaveLength(0);
  });
});

describe('跳转时把匹配滚出来（轻量版 #15）', () => {
  const calls: unknown[] = [];
  const original = Element.prototype.scrollIntoView;
  beforeEach(() => {
    calls.length = 0;
    Element.prototype.scrollIntoView = function (this: Element, arg?: unknown) { calls.push([this.className, arg]); };
  });
  afterEach(() => { Element.prototype.scrollIntoView = original; });

  it('焦点在查找框里也滚；只有一个匹配时再按下一个也要滚回去', () => {
    editor.commands.setContent('<p>only one needle here</p>');
    editor.commands.setSearchTerm('needle', false);
    expect(calls).toHaveLength(1);
    editor.commands.findNext();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(['search-match search-match-current', { block: 'center', inline: 'nearest' }]);
  });

  it('查不到、普通打字都不滚', () => {
    editor.commands.setSearchTerm('不存在', false);
    editor.commands.setSearchTerm('Hello', false);
    calls.length = 0;
    editor.commands.insertContentAt(1, 'x');
    expect(calls).toHaveLength(0);
  });
});
