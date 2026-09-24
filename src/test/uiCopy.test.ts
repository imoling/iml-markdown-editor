import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * 界面文案的护栏。
 *
 * 文案最容易「改完又长回来」：一次清理能把说明文字砍掉一半，半年后又会一条一条长回去。
 * 所以把能被机器判的那几条规矩钉在这里——判不了的（比如「这句是不是在解释设计理由」）靠 review。
 *
 * 规矩本身写在全局 CLAUDE.md 的「界面文案」一节，这里只负责执行。
 */

const ROOT = path.resolve(__dirname, '../..');
const SCAN_DIRS = ['src', 'electron'];

/** 这些文件里的中文不是界面文案：写给模型看的提示词、发布说明、示例内容 */
const NOT_UI = [
  /\.test\.tsx?$/,
  /[/\\]test[/\\]/,
  /[/\\]__tests__[/\\]/,
  /components[/\\]Editor[/\\]useEditorAI\.ts$/,      // 给模型的系统提示词
  /utils[/\\]transcript\.ts$/,                        // 纪要提示词与笔记模板
  /utils[/\\]askNotes\.ts$/,                          // 问答提示词
  /utils[/\\]autoContinue\.ts$/,                      // 续写提示词
  /semantic[/\\]catalog\.ts$/,                        // 嵌入模型的指令前缀
  /utils[/\\]noteTemplates\.ts$/,                     // 新笔记模板的正文
  /data[/\\]whatsNew\.ts$/,                           // 新特性介绍是成段的文章，另一套写法
  /utils[/\\]markdown\.ts$/,                          // 渲染出来的 HTML 片段
  /utils[/\\]wechatHtml\.ts$/,                        // 公众号样式模板
];

interface UiString { file: string; line: number; text: string }

const CJK = /[一-鿿]/;
const STRING_LITERAL = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g;
// JSX 里的正文可能跨好几行（最长的几条正是这么藏起来的），所以整篇一起匹配
const JSX_TEXT = />([^<>{}]*[一-鿿][^<>{}]*)</gs;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

function collect(): UiString[] {
  const out: UiString[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file);
      if (NOT_UI.some((re) => re.test(rel))) continue;
      const src = fs.readFileSync(file, 'utf8');
      // 注释不是界面文案：块注释整段去掉，行注释按行去掉
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
      code.split('\n').forEach((line, i) => {
        if (!CJK.test(line)) return;
        for (const m of line.matchAll(STRING_LITERAL)) if (CJK.test(m[2])) out.push({ file: rel, line: i + 1, text: m[2].trim() });
      });
      for (const m of code.matchAll(JSX_TEXT)) {
        const text = m[1].replace(/\s+/g, ' ').trim();
        if (CJK.test(text)) out.push({ file: rel, line: code.slice(0, m.index ?? 0).split('\n').length, text });
      }
    }
  }
  return out;
}

const strings = collect();
const at = (s: UiString) => `${s.file}:${s.line} 「${s.text.slice(0, 60)}」`;
/** 纯文案：没有插值、不是 HTML / 代码片段 */
const prose = strings.filter((s) => !s.text.includes('${') && !s.text.includes('<') && !s.text.includes('\\n'));

describe('界面文案', () => {
  it('扫得到东西（扫描器本身别悄悄失效）', () => {
    expect(strings.length).toBeGreaterThan(800);
  });

  it('省略号只用「…」，不用三个点', () => {
    // 例外：示例值里的省略（API Key 形如 sk-...）、代码片段
    const bad = strings.filter((s) => s.text.includes('...') && !/sk-|eyJ|\.\.\.[a-zA-Z{([]/.test(s.text));
    expect(bad.map(at)).toEqual([]);
  });

  it('中文句子里不用半角冒号', () => {
    const bad = prose.filter((s) => /[一-鿿][^:]{0,24}: /.test(s.text));
    expect(bad.map(at)).toEqual([]);
  });

  it('不出现上一个产品的词，也不用「您」', () => {
    const banned = ['知识库', '浴火重生', '记忆快照', '会话现场', '星标状态', '您'];
    const bad = strings.filter((s) => banned.some((w) => s.text.includes(w)));
    expect(bad.map(at)).toEqual([]);
  });

  it('一个概念一个词', () => {
    // 「本地」只留给「本地文件 / 本地上传 / 本地服务」这类物理含义，模型跑在哪儿一律说「本机」
    const bad = strings.filter((s) => /本地模型|本地识别|本地推理/.test(s.text));
    expect(bad.map(at)).toEqual([]);
  });

  it('副文案不超过 40 字（超过说明一句话塞了好几件事）', () => {
    // 按「看起来多长」算：一个汉字顶一个字，英文和数字两个顶一个，免得品牌名一多就超标
    const width = (t: string) => {
      const cjk = (t.match(/[一-鿿]/g) || []).length;
      return cjk + Math.ceil((t.length - cjk) / 2);
    };
    const bad = prose.filter((s) => width(s.text) > 40);
    expect(bad.map(at)).toEqual([]);
  });

  it('实现细节不写到界面上', () => {
    // 面向普通使用者的字里不该出现这些；「写作助手」的高级面板是给会折腾的人看的，单独放行
    const ADVANCED = /LocalModelPanel\.tsx$|localModel[/\\](index|runtime|download)\.ts$/;
    const leaky = ['DPAPI', 'SHA256', '钥匙串', 'Base URL', 'predict 接口', 'generateContent'];
    const bad = strings.filter((s) => !ADVANCED.test(s.file) && leaky.some((w) => s.text.includes(w)));
    expect(bad.map(at)).toEqual([]);
  });

  it('同一句话不抄在两个文件里（要复用就抽常量 / 组件）', () => {
    const byText = new Map<string, Set<string>>();
    for (const s of strings) {
      if (s.text.length < 12) continue;
      if (s.text.includes('\\n') || s.text.includes('${')) continue;   // 代码示例与带插值的报错
      if (!byText.has(s.text)) byText.set(s.text, new Set());
      byText.get(s.text)!.add(s.file);
    }
    const dup = [...byText.entries()].filter(([, files]) => files.size > 1);
    // 主进程与渲染进程各有一份的（两边不能互相 import），以及菜单 / 命令面板 / 快捷键说明里同一个动作的名字
    const allowed = new Set([
      'AI 功能已在设置里关闭',
      '关于 iML Markdown Editor',
      '切换富文本 / 源码模式',
    ]);
    expect(dup.filter(([text]) => !allowed.has(text)).map(([text, files]) => `「${text.slice(0, 40)}」← ${[...files].join(', ')}`)).toEqual([]);
  });
});
