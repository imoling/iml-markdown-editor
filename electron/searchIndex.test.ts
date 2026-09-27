import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SearchIndex } from './searchIndex';

let root: string;
const write = (rel: string, content: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  return full;
};

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'iml-index-'));
  write('a.md', '# 苹果笔记\n\n今天吃了苹果，苹果很甜。');
  write('sub/b.md', '# 香蕉\n\n香蕉和 Apple 都是水果。链接到 [[苹果笔记]] 和 [[苹果笔记|别名]]。');
  write('sub/.hidden.md', '苹果 隐藏');
  write('pic.png', '苹果');
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('SearchIndex', () => {
  it('递归建索引，跳过隐藏文件和非笔记文件；标题取一级标题', async () => {
    const index = new SearchIndex();
    await index.build(root);
    expect(index.status()).toMatchObject({ count: 2, building: false });
    expect(index.listNotes().map((n) => n.title)).toEqual(['苹果笔记', '香蕉']);
  });

  it('不区分大小写，多词 AND，标题命中优先，片段带上下文', async () => {
    const index = new SearchIndex();
    await index.build(root);
    const results = index.search('苹果');
    expect(results.map((r) => r.title)).toEqual(['苹果笔记', '香蕉']);
    expect(results[0].count).toBe(3);
    expect(results[0].snippets[0].match).toBe('苹果');
    expect(index.search('apple 香蕉').map((r) => r.title)).toEqual(['香蕉']);
    expect(index.search('apple 苹果笔记')).toHaveLength(1);
    expect(index.search('')).toEqual([]);
  });

  it('refresh 增量更新：改文件、删文件、新目录', async () => {
    const index = new SearchIndex();
    await index.build(root);
    const c = write('c.md', '# 樱桃\n樱桃');
    await index.refresh([c]);
    expect(index.search('樱桃')).toHaveLength(1);
    fs.unlinkSync(c);
    await index.refresh([c]);
    expect(index.search('樱桃')).toHaveLength(0);
    write('deep/d.md', '# 榴莲');
    await index.refresh([path.join(root, 'deep')]);
    expect(index.search('榴莲')).toHaveLength(1);
    fs.rmSync(path.join(root, 'deep'), { recursive: true });
    await index.refresh([path.join(root, 'deep')]);
    expect(index.search('榴莲')).toHaveLength(0);
  });

  it('反向链接按目标标题匹配，别名写法也算', async () => {
    const index = new SearchIndex();
    await index.build(root);
    const links = index.backlinks('苹果笔记');
    expect(links.map((l) => l.title)).toEqual(['香蕉']);
    expect(links[0].snippets).toHaveLength(2);
    expect(index.backlinks('不存在')).toEqual([]);
  });

  it('反向链接：认小节 / 嵌入 / 路径写法 / 别名，传路径时文件名和标题都算；代码里的和自己链自己的不算', async () => {
    const target = write('links/目标.md', '---\naliases: [靶子, Target]\n---\n\n# 目标笔记\n\n自己提到 [[目标]]。');
    write('links/一.md', '# 一\n\n见 [[目标#小节]]，嵌入 ![[目标]]，路径 [[links/目标|看这里]]。');
    write('links/二.md', '# 二\n\n按标题 [[目标笔记]]，按别名 [[靶子]] 和 [[target#^blk]]。');
    write('links/三.md', '# 三\n\n```\n[[目标]]\n```\n\n行内 `[[目标]]` 也不算。[[目标不是它]]');
    const index = new SearchIndex();
    await index.build(root);
    const links = index.backlinks(target);
    expect(links.map((l) => l.title)).toEqual(['一', '二']);
    expect(links[0].snippets.map((s) => s.match)).toEqual(['[[目标#小节]]', '![[目标]]', '[[links/目标|看这里]]']);
    expect(links[1].snippets.map((s) => s.match)).toEqual(['[[目标笔记]]', '[[靶子]]', '[[target#^blk]]']);
    expect(index.listNotes().find((n) => n.path === target)?.aliases).toEqual(['靶子', 'Target']);
  });

  it('未链接提及：提到名字但没加链接的地方，给出原文里的位置', async () => {
    const target = write('mention/苹果派.md', '---\naliases: [Pie]\n---\n\n# 苹果派\n');
    const a = write('mention/甲.md', '---\ntitle: 苹果派\n---\n\n# 甲\n\n今天做了苹果派，已经链过的 [[苹果派]] 不算。\n\n`苹果派` 和 https://x.com/苹果派 也不算。');
    write('mention/乙.md', '# 乙\n\nA pie is nice, but Pieces and magpie are not. <span title="苹果派">x</span>');
    write('mention/丙.md', '# 丙\n\n没提到。');
    const index = new SearchIndex();
    await index.build(root);
    const found = index.unlinkedMentions(target);
    expect(found.map((m) => m.title).sort()).toEqual(['乙', '甲'].sort());
    const inA = found.find((m) => m.title === '甲')!;
    const inB = found.find((m) => m.title === '乙')!;
    // frontmatter、已有链接、行内代码、网址里的都不算，只剩正文那一处
    expect(inA.snippets).toHaveLength(1);
    const hit = inA.snippets[0];
    expect(fs.readFileSync(a, 'utf8').slice(hit.offset, hit.offset + hit.length)).toBe('苹果派');
    expect(hit.before.endsWith('今天做了')).toBe(true);
    // 英文名整词命中：pie 算，Pieces / magpie 不算；HTML 属性里的不算
    expect(inB.snippets.map((s) => s.match)).toEqual(['pie']);
    expect(index.unlinkedMentions('/不在库里.md')).toEqual([]);
  });

  it('图片写进了笔记里的：再大也进索引，那一长串 base64 搜不到、不算字数；未链接提及给的仍是原文里的位置', async () => {
    const b64 = 'QUJD'.repeat(700_000); // 2.8 MB，整篇超过了普通笔记的大小上限
    const target = write('inline/苹果派.md', '# 苹果派\n');
    const note = write('inline/带图.md', `# 带图\n\n![截图](data:image/webp;base64,${b64})\n\n图后面提到了苹果派。\n\n- [ ] 图后面的待办`);
    const index = new SearchIndex();
    await index.build(root);
    const listed = index.listNotes().find((n) => n.path === note)!;
    expect(listed.title).toBe('带图');
    expect(listed.chars).toBeLessThan(100);
    expect(index.search('QUJDQUJD')).toEqual([]);
    expect(index.search('图后面提到了').map((r) => r.path)).toEqual([note]);
    expect(index.listTasks().find((t) => t.path === note)!.tasks.map((t) => t.line)).toEqual([6]);
    const hit = index.unlinkedMentions(target).find((m) => m.path === note)!.snippets[0];
    expect(fs.readFileSync(note, 'utf8').slice(hit.offset, hit.offset + hit.length)).toBe('苹果派');
    expect(hit.offset).toBeGreaterThan(b64.length);
    // 没有图、单纯就是太大的文件照旧不收
    const huge = write('inline/太大.md', `# 太大\n\n${'字'.repeat(800_000)}`);
    await index.refresh([huge]);
    expect(index.listNotes().some((n) => n.path === huge)).toBe(false);
  });

  it('未链接提及：一个字的名字不找；长名字里套着的短名字不重复报', async () => {
    const single = write('mention2/茶.md', '# 茶\n');
    const nested = write('mention2/note.md', '---\naliases: [红茶, 红茶拿铁]\n---\n\n# note\n');
    write('mention2/日记.md', '# 日记\n\n喝了茶，又点了红茶拿铁。');
    const index = new SearchIndex();
    await index.build(root);
    expect(index.unlinkedMentions(single)).toEqual([]);
    expect(index.unlinkedMentions(nested)[0].snippets.map((s) => s.match)).toEqual(['红茶拿铁']);
  });

  it('附件：![[截图.png]] 按文件名全库查找，重名先取笔记旁边的，再取路径最短的；增删跟着更新', async () => {
    write('att/附件/截图.PNG', 'x');
    write('att/深/一层/截图.png', 'x');
    write('att/深/录音.webm', 'x');
    write('att/深/文档.pdf', 'x');
    const index = new SearchIndex();
    await index.build(root);
    expect(index.findAttachment('截图.png')).toBe(path.join(root, 'att/附件/截图.PNG'));
    expect(index.findAttachment('截图.png', path.join(root, 'att/深'))).toBe(path.join(root, 'att/深/一层/截图.png'));
    expect(index.findAttachment('一层/截图.png')).toBe(path.join(root, 'att/深/一层/截图.png'));
    expect(index.findAttachment('录音.webm')).toBe(path.join(root, 'att/深/录音.webm'));
    // PDF、视频也进附件索引；不放行的类型、不存在的、不是附件的名字找不到
    expect(index.findAttachment('文档.pdf')).toBe(path.join(root, 'att/深/文档.pdf'));
    expect(index.knownAttachment(path.join(root, 'att/深/文档.pdf'))).toBe(path.join(root, 'att/深/文档.pdf'));
    expect(index.knownAttachment('/etc/passwd')).toBeNull();
    expect(index.knownAttachment(path.join(root, 'a.md'))).toBeNull();
    expect(index.findAttachment('脚本.sh')).toBeNull();
    expect(index.findAttachment('没有.png')).toBeNull();
    expect(index.findAttachment('苹果笔记')).toBeNull();
    expect(index.findAttachment('图.png')).toBeNull(); // 不能从文件名中间截

    const added = write('att/新图.jpg', 'x');
    await index.refresh([added]);
    expect(index.findAttachment('新图.jpg')).toBe(added);
    fs.unlinkSync(added);
    await index.refresh([added]);
    expect(index.findAttachment('新图.jpg')).toBeNull();
    fs.rmSync(path.join(root, 'att/深'), { recursive: true });
    await index.refresh([path.join(root, 'att/深')]);
    expect(index.findAttachment('录音.webm')).toBeNull();
    expect(index.findAttachment('截图.png')).toBe(path.join(root, 'att/附件/截图.PNG'));
  });

  it('全库待办：默认只要没勾的，最近改过的笔记在前；模板目录里的不算；勾掉后增量更新', async () => {
    const older = write('todo/旧.md', '# 旧\n\n- [ ] 旧的事\n- [x] 做完的\n');
    fs.utimesSync(older, new Date(2026, 0, 1), new Date(2026, 0, 1));
    const newer = write('todo/新.md', '# 新\n\n- [ ] 新的事 📅 2026-09-30\n  - [ ] 子任务\n');
    write('模板/会议记录.md', '# {{title}}\n\n- [ ] 模板里的占位\n');
    write('todo/全做完.md', '# 全做完\n\n- [x] 一\n');
    const index = new SearchIndex();
    await index.build(root);
    const mine = (list: { path: string }[]) => list.filter((n) => n.path.includes(`${path.sep}todo${path.sep}`) || n.path.includes('模板'));
    const open = mine(index.listTasks());
    expect(open.map((n) => n.title)).toEqual(['新', '旧']);
    expect(open[0].tasks.map((t) => [t.text, t.due, t.depth])).toEqual([['新的事', '2026-09-30', 0], ['子任务', null, 1]]);
    expect(open[1].tasks.map((t) => t.text)).toEqual(['旧的事']);
    expect(mine(index.listTasks(true)).map((n) => [n.title, n.tasks.length]).sort()).toEqual([['全做完', 1], ['新', 2], ['旧', 2]].sort());
    fs.writeFileSync(newer, '# 新\n\n- [x] 新的事 📅 2026-09-30\n  - [x] 子任务\n');
    await index.refresh([newer]);
    expect(mine(index.listTasks()).map((n) => n.title)).toEqual(['旧']);
  });

  it('标签：正文 #标签 与 frontmatter tags 合并统计，层级标签计入父标签', async () => {
    write('tagged/one.md', '---\ntags: [读书, 项目/甲]\n---\n\n# 一\n\n正文 #想法 #项目/乙\n\n```\n#不是标签\n```');
    write('tagged/two.md', '# 二\n\n#读书 和 #想法');
    const index = new SearchIndex();
    await index.build(root);
    const tags = Object.fromEntries(index.listTags().map((t) => [t.tag, t.count]));
    expect(tags).toMatchObject({ 读书: 2, 想法: 2, 项目: 1, '项目/甲': 1, '项目/乙': 1 });
    expect(tags['不是标签']).toBeUndefined();
    expect(index.notesByTag('项目').map((n) => n.title)).toEqual(['一']);
    expect(index.notesByTag('读书').map((n) => n.title).sort()).toEqual(['一', '二']);
    // frontmatter 里的 # 注释不会被当成标题
    expect(SearchIndex.titleOf('/x/文件名.md', '---\n# 注释\ntags: []\n---\n\n正文')).toBe('文件名');
  });
});
