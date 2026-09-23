import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { formatVersion, isNewerVersion, summarizeReleaseNotes } from './version';

describe('version', () => {
  it('隐藏末尾的 .0，保留补丁号', () => {
    expect(formatVersion('26.1.0')).toBe('26.1');
    expect(formatVersion('26.1.2')).toBe('26.1.2');
    expect(formatVersion('')).toBe('');
    expect(formatVersion(undefined)).toBe('');
  });

  it('逐段比较，旧的 GitHub 发布不会被当成新版本', () => {
    expect(isNewerVersion('1.9.0', '26.1.0')).toBe(false);
    expect(isNewerVersion('v26.2.0', '26.1.0')).toBe(true);
    expect(isNewerVersion('26.1.1', '26.1.0')).toBe(true);
    expect(isNewerVersion('26.1.0', '26.1.0')).toBe(false);
    expect(isNewerVersion('26.10.0', '26.9.0')).toBe(true);
    expect(isNewerVersion(undefined, '26.1.0')).toBe(false);
  });
});

describe('更新提醒里的发布说明摘要', () => {
  const NOTES = [
    '## 26.2.0 — 放心把笔记搬进来', '', '这一版只做一件事：让你敢把 **Obsidian**、Typora 里的笔记直接搬过来用。', '',
    '### 下载', '', '| 平台 | 安装包 |', '|---|---|', '| macOS | `a.dmg` |', '', '安装包未做 Apple 公证。', '',
    '### 保真：改一个字，只变一个字', '', '- 没编辑过的块直接写回原文', '',
    '### 版本历史 `⌘⇧H`', '', '- 每次保存留一个版本', '', '### 其它', '', '- 小修小补',
  ].join('\n');

  it('取标题里的一句话、开头那段、各小节标题；「下载」「其它」不算要点，Markdown 记号去掉', async () => {
    const { summarizeReleaseNotes } = await import('./version');
    expect(summarizeReleaseNotes(NOTES)).toEqual({
      slogan: '放心把笔记搬进来',
      lead: '这一版只做一件事：让你敢把 Obsidian、Typora 里的笔记直接搬过来用。',
      highlights: ['保真：改一个字，只变一个字', '版本历史 ⌘⇧H'],
    });
  });

  it('要点有上限；说明是空的、或不是这个写法，也给出空结果而不是报错', async () => {
    const { summarizeReleaseNotes } = await import('./version');
    const many = ['## 1.0 — x', ...Array.from({ length: 10 }, (_, i) => `### 第 ${i} 件事`)].join('\n');
    expect(summarizeReleaseNotes(many, 3).highlights).toEqual(['第 0 件事', '第 1 件事', '第 2 件事']);
    expect(summarizeReleaseNotes('')).toEqual({ slogan: '', lead: '', highlights: [] });
    expect(summarizeReleaseNotes(undefined)).toEqual({ slogan: '', lead: '', highlights: [] });
    expect(summarizeReleaseNotes('Bug fixes and improvements.')).toEqual({ slogan: '', lead: 'Bug fixes and improvements.', highlights: [] });
  });
});

/**
 * 发布说明是更新提醒的数据源：弹窗里那几条要点就是各个 ### 小节的标题。
 * 26.5.1 第一版把小节写成了「改了什么」「顺带」，弹出来就是两条什么也没说的要点——
 * 写发布说明的时候看不出问题，只有真的弹出来才看得见。这条测试替人先看一眼
 */
describe('发布说明得能变成像样的更新提醒', () => {
  const dir = path.resolve(__dirname, '../../docs');
  const files = fs.readdirSync(dir).filter((f) => /^release-notes-.*\.md$/.test(f));

  it('每份发布说明都有口号、开头那段，和至少 2 条说得出内容的要点', () => {
    expect(files.length).toBeGreaterThan(0);
    const 没内容 = /^(改了什么|顺带|其它改动|杂项|细节|更新内容|说明)$/;
    // 标题说的应该是「用户拿到什么 / 现在是什么样」，不是「我们返工了多少」：
    // 「界面上的字，少说一半」这种自嘲 + 量化的写法，弹到用户面前像个段子
    const 自嘲 = /(少说一半|砍掉|返工|重构|优化了一遍)/;
    for (const f of files) {
      const s = summarizeReleaseNotes(fs.readFileSync(path.join(dir, f), 'utf8'));
      expect(`${f}: ${s.slogan}`).toMatch(/: .+/);
      expect(`${f}: ${s.lead.length}`).not.toMatch(/: 0$/);
      expect(`${f}: ${s.highlights.length} 条要点`).toMatch(/: [2-9]\d* 条/);
      for (const h of s.highlights) expect(`${f}: ${h}`).not.toMatch(没内容);
      expect(`${f}: ${s.slogan}`).not.toMatch(自嘲);
    }
  });
});
