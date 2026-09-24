import { afterEach, describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { editorExtensions } from '../components/Editor/editorExtensions';
import { markdownToHtml } from '../utils/markdown';
import { AutoContinue, autoContinueKey, continueContext, type ContinueRequest } from './AutoContinue';
import { cleanContinuation, normalizeAutoContinue } from '../utils/autoContinue';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

/** 编辑器 + 一个假的模型：每次请求都记下来，回什么由测试决定 */
function setup(md: string, enabled = true) {
  const requests: ContinueRequest[] = [];
  let cancelled = 0;
  const provider = {
    settings: () => (enabled ? { delay: 0 } : null),
    request: (req: ContinueRequest) => { requests.push(req); return { done: Promise.resolve(), cancel: () => { cancelled++; } }; },
  };
  const extensions = [...editorExtensions.filter((e) => e.name !== 'autoContinue'), AutoContinue.configure({ provider })];
  editor = new Editor({ extensions, content: markdownToHtml(md) });
  editor.view.hasFocus = () => true;
  return { ed: editor, requests, cancelled: () => cancelled };
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const endOf = (ed: Editor, text: string) => {
  let at = -1;
  ed.state.doc.descendants((node, pos) => { if (at < 0 && node.isText && node.text?.includes(text)) at = pos + node.text.indexOf(text) + text.length; return at < 0; });
  ed.commands.setTextSelection(at);
};
const typeText = (ed: Editor, text: string) => ed.view.dispatch(ed.state.tr.insertText(text));
const ghost = (ed: Editor) => ed.view.dom.querySelector('.ai-ghost')?.textContent ?? null;
const key = (ed: Editor, k: string) => {
  const event = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  let handled = false;
  ed.view.someProp('handleKeyDown', (f) => { if (f(ed.view, event)) { handled = true; return true; } return false; });
  return handled;
};

describe('自动续写：什么时候去要', () => {
  it('段落末尾打了字、停一下才要；前文带上', async () => {
    const { ed, requests } = setup('第一段。\n\n今天天气');
    endOf(ed, '今天天气');
    typeText(ed, '很');
    expect(requests).toHaveLength(0);
    await tick();
    expect(requests).toHaveLength(1);
    expect(requests[0].before).toBe('第一段。\n\n今天天气很');
  });

  it('输入法拼字时上屏的那一笔也算：拼完之后照样去要（不会因为上屏时还在拼字状态就不计时）', async () => {
    const { ed, requests } = setup('床前');
    endOf(ed, '床前');
    const input = (ed.view as any).input;
    input.composing = true;
    typeText(ed, '明月光');
    await tick();
    expect(requests).toHaveLength(0);   // 还在拼：先不要
    input.composing = false;
    await tick();
    expect(requests).toHaveLength(1);
    expect(requests[0].before).toBe('床前明月光');
  });

  it('一整句拼音一次上屏（一步替换二三十个字符）也算打字', async () => {
    const { ed, requests } = setup('开头');
    endOf(ed, '开头');
    const py = 'chuang qian ming yue guang';
    typeText(ed, py);
    const at = ed.state.selection.from;
    ed.view.dispatch(ed.state.tr.insertText('床前明月光', at - py.length, at).setMeta('composition', 1));
    await tick();
    expect(requests.at(-1)?.before).toBe('开头床前明月光');
  });

  it('关着就不要；段落中间、代码块、标题、/ 命令、[[ 链接都不要', async () => {
    const off = setup('今天天气', false);
    endOf(off.ed, '今天天气'); typeText(off.ed, '很'); await tick();
    expect(off.requests).toHaveLength(0);
    off.ed.destroy();

    const cases: Array<[string, string, string]> = [
      ['今天天气真好', '今天天', 'x'],
      ['```\ncode\n```', 'code', 'x'],
      ['# 标题', '标题', 'x'],
      ['看看', '看看', ' /ta'],
      ['看看', '看看', '[[笔'],
    ];
    for (const [md, at, typed] of cases) {
      const { ed, requests } = setup(md);
      endOf(ed, at); typeText(ed, typed); await tick();
      expect(requests, md).toHaveLength(0);
      ed.destroy();
    }
  });

  it('只看光标处的小改动：整篇换内容不算停顿', async () => {
    const { ed, requests } = setup('一');
    endOf(ed, '一');
    ed.commands.setContent(markdownToHtml('很长的一篇新笔记，换了个标签页'));
    await tick();
    expect(requests).toHaveLength(0);
  });

  it('continueContext 给出段落末尾的前后文', () => {
    const { ed } = setup('甲\n\n乙丙\n\n丁');
    endOf(ed, '乙丙');
    const ctx = continueContext(ed.state)!;
    expect(ctx.before).toBe('甲\n\n乙丙');
    expect(ctx.after).toBe('\n\n丁');
  });
});

describe('自动续写：灰字', () => {
  async function withGhost(text = '结果排起了长队。') {
    const s = setup('本以为人不多');
    endOf(s.ed, '本以为人不多'); typeText(s.ed, '，'); await tick();
    s.requests[0].onUpdate(text);
    return s;
  }

  it('画在光标后，不进文档', async () => {
    const { ed } = await withGhost();
    expect(ghost(ed)).toBe('结果排起了长队。');
    expect(ed.getText()).toBe('本以为人不多，');
  });

  it('Tab 收下：文字进文档、光标跟到末尾、灰字没了，一步就能撤销', async () => {
    const { ed } = await withGhost();
    expect(key(ed, 'Tab')).toBe(true);
    expect(ed.getText()).toBe('本以为人不多，结果排起了长队。');
    expect(ed.state.selection.from).toBe(ed.state.doc.content.size - 1);
    expect(ghost(ed)).toBeNull();
    ed.commands.undo();
    expect(ed.getText()).toBe('本以为人不多，');
  });

  it('没有灰字时 Tab 不归它管', async () => {
    const { ed } = setup('一');
    expect(key(ed, 'Tab')).toBe(false);
  });

  it('Esc 收起，同一处不再要', async () => {
    const { ed, requests } = await withGhost();
    expect(key(ed, 'Escape')).toBe(true);
    expect(ghost(ed)).toBeNull();
    await tick();
    expect(requests).toHaveLength(1);
  });

  it('照着灰字往下打，灰字跟着缩短；打了别的就消失', async () => {
    const { ed } = await withGhost();
    typeText(ed, '结果');
    expect(ghost(ed)).toBe('排起了长队。');
    typeText(ed, '没');
    expect(ghost(ed)).toBeNull();
  });

  it('光标挪走，灰字消失；请求回来晚了、文档已经变了就作废', async () => {
    const { ed, requests } = setup('本以为人不多');
    endOf(ed, '本以为人不多'); typeText(ed, '，'); await tick();
    typeText(ed, '啊');
    requests[0].onUpdate('晚到的');
    expect(ghost(ed)).toBeNull();

    await tick();
    const last = requests[requests.length - 1];
    last.onUpdate('续上');
    expect(ghost(ed)).toBe('续上');
    ed.commands.setTextSelection(1);
    expect(ghost(ed)).toBeNull();
    expect(autoContinueKey.getState(ed.state)).toBeNull();
  });
});

describe('cleanContinuation：把模型的话洗成能直接接上的一段', () => {
  it('去掉帽子、引号，只要第一行', () => {
    expect(cleanContinuation('续写：结果排起了长队。\n第二行', '人不多，')).toBe('结果排起了长队。');
    expect(cleanContinuation('「结果排起了长队」', '人不多，')).toBe('结果排起了长队');
    expect(cleanContinuation('<think>想想</think>结果排队了。', '人不多，')).toBe('结果排队了。');
  });

  it('把前文又抄一遍的部分砍掉', () => {
    expect(cleanContinuation('本以为人不多，结果排起了长队。', '周末去爬山，本以为人不多，')).toBe('结果排起了长队。');
    expect(cleanContinuation('在于理解经济的逻辑。', '最打动我的地方在于')).toBe('理解经济的逻辑。');
    expect(cleanContinuation('that it is light.', 'The reason is that')).toBe(' it is light.');
    // 碰巧相同的一个字、半个单词不算抄
    expect(cleanContinuation('果然如此。', '结果')).toBe('果然如此。');
    expect(cleanContinuation('hat trick.', 'that')).toBe(' hat trick.');
  });

  it('在句末收住，太长就截断', () => {
    expect(cleanContinuation('结果排起了长队。我们只好改去别处。', '人不多，')).toBe('结果排起了长队。');
    expect(Array.from(cleanContinuation('字'.repeat(200), '前文')).length).toBe(80);
  });

  it('英文单词之间补空格，前文已有空格就不重复', () => {
    expect(cleanContinuation('world.', 'hello')).toBe(' world.');
    expect(cleanContinuation(' world', 'hello ')).toBe('world');
  });

  it('设置读回来不认识的值用默认', () => {
    expect(normalizeAutoContinue(null)).toEqual({ enabled: false, delay: 1000 });
    expect(normalizeAutoContinue({ enabled: true, delay: 7 })).toEqual({ enabled: true, delay: 1000 });
  });
});
