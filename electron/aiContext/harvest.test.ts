// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { applyHarvest, guessDomain, harvestMemories, normalizeLine } from './harvest';
import { memoryDirOf } from './memory';
import { projectLabel, scanAiContext } from './scan';

let home: string;
let lib: string;
const write = (rel: string, content: string) => {
  const p = path.join(home, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
};
const claudeMemory = (project: string, name: string, type: string, description: string, modified = '2026-10-31T11:29:44.503Z') =>
  write(`.claude/projects/${project}/memory/${name}.md`, `---\nname: ${name}\ndescription: ${description}\nmetadata:\n  node_type: memory\n  type: ${type}\n  modified: ${modified}\n---\n\n正文略。\n**Why:** 略\n`);
const harvest = async () => harvestMemories(lib, await scanAiContext(home, 'darwin'));

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'iml-harvest-'));
  lib = path.join(home, '笔记库');
  fs.mkdirSync(memoryDirOf(lib), { recursive: true });
  fs.writeFileSync(path.join(memoryDirOf(lib), '工作方式.md'), '# 工作方式\n\n- 改文件前先备份（2026-10-09，Claude / WeChat Account）\n');
  fs.writeFileSync(path.join(memoryDirOf(lib), '公众号.md'), '# 公众号\n\n');
});
afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

describe('采集', () => {
  it('Claude 的 user / feedback 记忆取 description；project 记忆不要；整行已在记忆库里的不列', async () => {
    claudeMemory('-Users-me-Personal-MBA---', 'formal-quotes', 'feedback', '正式书面作业里引号用“”');
    claudeMemory('-Users-me-Personal-MBA---', 'release-state', 'project', '26.9 已发版');
    claudeMemory('-Users-me-imoling-git-x', 'who', 'user', '用户是康伟');
    claudeMemory('-Users-me-Personal-WeChat-Account', 'backup', 'feedback', '改文件前先备份');
    const { candidates, domains } = await harvest();
    expect(domains).toEqual(['工作方式', '公众号']);
    expect(candidates.map((c) => [c.text, c.kind, c.project, c.domain, c.date])).toEqual([
      ['用户是康伟', 'user', 'imoling / git / x', '我是谁', '2026-10-31'],
      ['正式书面作业里引号用“”', 'feedback', 'Personal / MBA', '课件与 PPT', '2026-10-31'],
    ]);
    expect(candidates[0].tool).toBe('Claude Code');
    expect(candidates[0].file).toContain('who.md');
  });

  it('Codex 只取 memory_summary 的 User preferences 一节，每个要点一条', async () => {
    write('.codex/AGENTS.md', '# rules\n');
    write('.codex/memories/memory_summary.md', 'v1\n\n## User Profile\n\n一大段。\n\n## User preferences\n\n- Weekly reports: 不要编，先问清楚\n- ManagerZone: use only 433\n\n## General Tips\n- 不是偏好\n');
    write('.codex/memories/raw_memories.md', '# Raw\n- 不算\n');
    const { candidates } = await harvest();
    expect(candidates.map((c) => [c.tool, c.text, c.project])).toEqual([
      ['Codex', 'Weekly reports: 不要编，先问清楚', 'Weekly reports'],
      ['Codex', 'ManagerZone: use only 433', 'ManagerZone'],
    ]);
  });

  it('追加：勾上的写进对应篇、带日期和来源；没勾但标已处理的记账；两种下次都不再列；文件改了又算新的', async () => {
    claudeMemory('-Users-me-Personal-MBA---', 'a', 'feedback', '同级项不单独换色');
    claudeMemory('-Users-me-Personal-MBA---', 'b', 'feedback', '备注要口语化');
    const first = await harvest();
    expect(first.candidates).toHaveLength(2);
    const a = first.candidates.find((c) => c.text === '同级项不单独换色')!;
    const b = first.candidates.find((c) => c.text === '备注要口语化')!;
    const result = await applyHarvest(lib, { accepted: [{ id: a.id, text: a.text, domain: '课件与 PPT', date: a.date, tool: a.tool, project: a.project }], dismissed: [b.id] });
    expect(result.appended).toBe(1);
    expect(fs.readFileSync(path.join(memoryDirOf(lib), '课件与 PPT.md'), 'utf8')).toBe('# 课件与 PPT\n\n- 同级项不单独换色（2026-10-31，Claude Code / Personal / MBA）\n');
    expect((await harvest()).candidates).toEqual([]);
    claudeMemory('-Users-me-Personal-MBA---', 'b', 'feedback', '备注要口语化，像宣讲');
    expect((await harvest()).candidates.map((c) => c.text)).toEqual(['备注要口语化，像宣讲']);
    const ledger = JSON.parse(fs.readFileSync(path.join(memoryDirOf(lib), '.采集记录.json'), 'utf8'));
    expect(Object.keys(ledger.handled)).toHaveLength(2);
  });

  it('没有记忆目录也能采，追加时会建目录', async () => {
    fs.rmSync(memoryDirOf(lib), { recursive: true });
    claudeMemory('-Users-me-x', 'a', 'user', '我是谁谁');
    const { candidates, domains } = await harvest();
    expect(domains).toEqual([]);
    expect(candidates).toHaveLength(1);
    await applyHarvest(lib, { accepted: [{ ...candidates[0], domain: '我是谁' }], dismissed: [] });
    expect(fs.existsSync(path.join(memoryDirOf(lib), '我是谁.md'))).toBe(true);
  });
});

describe('辅助', () => {
  it('规范化：去前缀、引号、末尾来源括号，不分大小写', () => {
    expect(normalizeLine('- 改文件前先备份（2026-10-09，Claude / X）')).toBe('改文件前先备份');
    expect(normalizeLine('“Weekly Reports”')).toBe('weekly reports');
  });
  it('项目名还原', () => {
    expect(projectLabel('-Users-imoling-Personal-MBA---')).toBe('Personal / MBA');
    expect(projectLabel('-Users-imoling-imoling-git-iml-markdown-editor')).toBe('imoling / git / iml / markdown / editor');
    expect(projectLabel('rollout_summaries')).toBe('rollout_summaries');
  });
  it('领域推断', () => {
    expect(guessDomain('user', '', '用户是康伟，在讯飞')).toBe('我是谁');
    expect(guessDomain('user', 'imoling.git / iml-switchboard', '技能统一加署名')).toBe('编程与产品');
    expect(guessDomain('feedback', 'Personal / WeChat Account', '开头从例子讲起')).toBe('公众号');
    expect(guessDomain('feedback', 'Work / training', '课件同级不换色')).toBe('课件与 PPT');
    expect(guessDomain('feedback', '', '不替我编口号')).toBe('工作方式');
  });
});

describe('照真实记忆的样子', () => {
  // 真实记忆的几种形状：同一条在几个项目里各记一份、摘要句在描述记忆本身、英文、带家人信息、目录名里有中文和空格
  let real: string;
  const encode = (p: string) => p.replace(/[^a-zA-Z0-9]/g, '-');
  const mem = (projectDir: string, name: string, type: string, description: string, body: string, modified: string) => {
    fs.mkdirSync(path.join(real, projectDir), { recursive: true });
    const dir = path.join(real, '.claude/projects', encode(path.join(real, projectDir)), 'memory');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\nname: ${name}\ndescription: ${description}\nmetadata:\n  type: ${type}\n  modified: ${modified}T00:00:00Z\n---\n\n${body}\n`);
  };
  beforeEach(() => {
    real = fs.realpathSync(home);
    mem('Personal/MBA 作业', 'no-peer-highlight', 'feedback', '课件里同级的并列项不要单独挑一个换颜色',
      '2026-10-13 港口课件里流程最后一步标黄。\n\n**Why:** 并列项本来就是同一个层级，单独上色会让人误以为它更重要。\n**How to apply:** 流程、卡片、表格列都用同一种颜色。', '2026-10-31');
    mem('Work/training', 'no-peer-highlight', 'feedback', '课件里同级的并列项不要单独挑一个换颜色',
      '同一条，培训课件里也记过。\n\n**Why:** 看着乱。', '2026-10-13');
    mem('Personal/WeChat Account', 'voice', 'feedback', '用户对公众号文章结构和口吻的具体偏好（2026-09-29 改安检一文时给的）',
      '他读完要求整体重排。\n\n**Why:** 我按结论先行写，他说不通俗。\n**How to apply:** 开篇从一个具体的例子讲起，不先列结论清单。小标题写完念一遍。', '2026-09-29');
    mem('imoling.git/iml-switchboard', 'verify', 'feedback', 'How to verify Switchboard UI changes without touching the user screen',
      'Use npm run dev.\n\n**Why:** Synthetic clicks once landed in the chat app.\n**How to apply:** Run an isolated copy of the daemon on another port. Never restart the real one.', '2026-11-03');
    mem('Personal/家庭材料', 'kid', 'user', '用户的女儿在某小学读六年级，家庭材料常围绕她的学校活动', '正文略。', '2026-09-15');
    mem('imoling.git/iml-switchboard', 'watermark', 'user', '用户给自己的技能统一加署名：license、author、contact 三项', '正文略。', '2026-10-31');
  });

  it('同一条只列一次，留最近的那份，记下另见几个项目；项目名还原成真实目录名', async () => {
    const { candidates } = await harvestMemories(lib, await scanAiContext(real, 'darwin'));
    const peer = candidates.filter((c) => c.text.startsWith('课件里同级的并列项'));
    expect(peer).toHaveLength(1);
    expect(peer[0].project).toBe('Personal / MBA 作业');
    expect(peer[0].alsoIn).toEqual(['Work / training']);
    expect(peer[0].why).toBe('并列项本来就是同一个层级，单独上色会让人误以为它更重要');
  });

  it('摘要句在描述记忆本身的，换成「怎么用」那段的第一句；英文的也一样', async () => {
    const { candidates } = await harvestMemories(lib, await scanAiContext(real, 'darwin'));
    expect(candidates.find((c) => c.project === 'Personal / WeChat Account')?.text).toBe('开篇从一个具体的例子讲起，不先列结论清单');
    expect(candidates.find((c) => c.file.includes('verify'))?.text).toBe('Run an isolated copy of the daemon on another port.');
  });

  it('带家人信息的标出来；用户类里不是身份的不进「我是谁」', async () => {
    const { candidates } = await harvestMemories(lib, await scanAiContext(real, 'darwin'));
    const kid = candidates.find((c) => c.file.includes('kid'))!;
    expect(kid.sensitive).toBe(true);
    expect(candidates.filter((c) => c.sensitive)).toHaveLength(1);
    expect(candidates.find((c) => c.file.includes('watermark'))?.domain).toBe('编程与产品');
  });

  it('追加时「为什么」写成下一行', async () => {
    const { candidates } = await harvestMemories(lib, await scanAiContext(real, 'darwin'));
    const peer = candidates.find((c) => c.text.startsWith('课件里同级的并列项'))!;
    await applyHarvest(lib, { accepted: [{ ...peer, domain: '课件与 PPT' }], dismissed: [] });
    expect(fs.readFileSync(path.join(memoryDirOf(lib), '课件与 PPT.md'), 'utf8')).toBe(
      '# 课件与 PPT\n\n- 课件里同级的并列项不要单独挑一个换颜色（2026-10-31，Claude Code / Personal / MBA 作业）\n  - 为什么：并列项本来就是同一个层级，单独上色会让人误以为它更重要\n');
  });
});
