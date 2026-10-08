import { describe, expect, it, afterEach } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../components/Editor/editorExtensions';
import { markdownToHtml } from './markdown';
import { serializeDoc } from './incrementalMarkdown';
import { registerSource, loadDocFresh } from './sourceMap';
import { splitDiagramMeta, joinDiagramMeta } from './diagramMeta';

/** 图表卡片的缩放和高度存在代码第一行的 `%% iml:` 注释里（#8） */
let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });
const open = (md: string) => {
  editor = new Editor({ extensions: editorExtensions, content: markdownToHtml(md) });
  loadDocFresh(editor, markdownToHtml(md));
  registerSource(editor, md);
  return editor;
};
const diagram = (ed: Editor) => { let found: any = null; ed.state.doc.descendants((n) => { if (n.type.name === 'diagram') found = n; return !found; }); return found; };

describe('splitDiagramMeta / joinDiagramMeta', () => {
  it('没有这一行：默认值，代码原样', () => {
    expect(splitDiagramMeta('graph TD\nA-->B')).toEqual({ code: 'graph TD\nA-->B', meta: { zoom: 1, height: 'auto' } });
  });
  it('拆出缩放和高度，代码里不再有这一行', () => {
    expect(splitDiagramMeta('%% iml: zoom=0.8 height=320\ngraph TD\nA-->B')).toEqual({ code: 'graph TD\nA-->B', meta: { zoom: 0.8, height: '320px' } });
    expect(splitDiagramMeta('%%iml:height=200\npie\n"a": 1').meta).toEqual({ zoom: 1, height: '200px' });
  });
  it('作者自己的 %% 注释不是设置，不动', () => {
    expect(splitDiagramMeta('%% 我的注释\ngraph TD\nA-->B').code).toBe('%% 我的注释\ngraph TD\nA-->B');
  });
  it('离谱的值不认：缩放夹在 0.25 到 4 之间，高度得是正数', () => {
    expect(splitDiagramMeta('%% iml: zoom=99 height=-3\ngraph TD').meta).toEqual({ zoom: 4, height: 'auto' });
    expect(splitDiagramMeta('%% iml: zoom=abc\ngraph TD').meta.zoom).toBe(1);
  });
  it('写回：都是默认值就不写；缩放最多两位小数', () => {
    expect(joinDiagramMeta('graph TD', { zoom: 1, height: 'auto' })).toBe('graph TD');
    expect(joinDiagramMeta('graph TD', { zoom: 1.5625, height: '320px' })).toBe('%% iml: zoom=1.56 height=320\ngraph TD');
    expect(joinDiagramMeta('graph TD', { zoom: 0.8, height: 'auto' })).toBe('%% iml: zoom=0.8\ngraph TD');
  });
});

describe('图表卡片的缩放和高度跟着文件走', () => {
  const MD = '前面\n\n```mermaid\n%% iml: zoom=0.8 height=320\ngraph TD\n  A --> B\n```\n\n后面\n';

  it('打开：第一行变成节点属性，代码里没有它', () => {
    const node = diagram(open(MD));
    expect(node.attrs.zoom).toBe(0.8);
    expect(node.attrs.height).toBe('320px');
    expect(node.attrs.code).toBe('graph TD\n  A --> B');
  });

  it('没动过原样写回', () => {
    expect(serializeDoc(open(MD)).markdown).toBe(MD);
  });

  it('改了缩放：写回新值，高度还在；两项都回到默认就不写这一行', () => {
    const ed = open(MD);
    let pos = -1;
    ed.state.doc.descendants((n, p) => { if (pos < 0 && n.type.name === 'diagram') pos = p; return pos < 0; });
    ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...diagram(ed).attrs, zoom: 0.5 }));
    expect(serializeDoc(ed).markdown).toBe(MD.replace('zoom=0.8 height=320', 'zoom=0.5 height=320'));
    ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...diagram(ed).attrs, zoom: 1, height: 'auto' }));
    expect(serializeDoc(ed).markdown).toBe(MD.replace('%% iml: zoom=0.8 height=320\n', ''));
  });

  it('普通的图表块不会凭空多出这一行', () => {
    const md = '```mermaid\ngraph TD\n  A --> B\n```\n';
    const ed = open(md);
    let pos = -1;
    ed.state.doc.descendants((n, p) => { if (pos < 0 && n.type.name === 'diagram') pos = p; return pos < 0; });
    ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...diagram(ed).attrs, code: 'graph TD\n  A --> C' }));
    expect(serializeDoc(ed).markdown).toBe('```mermaid\ngraph TD\n  A --> C\n```\n');
  });
});
