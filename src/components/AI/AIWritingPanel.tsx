import React, { useState, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import {
  Sparkles,
  Send,
  Loader2,
  Globe,
  Settings2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Trash2,
  Clock,
  Upload,
  CheckCircle2,
  Flame,
  RefreshCw,
  Link,
  X,
  FileText,
} from 'lucide-react';
import { SKILLS, getSkillById } from '../../data/skills';
import { createSkillRun, useSkillRunner } from '../../hooks/useSkillRunner';
import { SkillStepCard } from './SkillStepCard';

const ellipsisStyle: React.CSSProperties = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  width: '100%',
};

// ─────────────────────────────────────────────
// 入口态：选 SKILL + 输入 vibe + 历史列表
// ─────────────────────────────────────────────
// Tavily 限制 400 字符
// 若内容超限：有模型时用 AI 提取关键词摘要，否则硬截断
async function buildSearchQuery(raw: string): Promise<string> {
  const MAX = 380;
  const trimmed = raw.trim();
  if (trimmed.length <= MAX) return trimmed;

  try {
    const cfg = await window.api.ai.getConfig();
    const hasModel = cfg?.apiKey || cfg?.openaiApiKey || cfg?.anthropicApiKey || cfg?.modelId;
    if (hasModel) {
      const result = await window.api.ai.chat(
        [
          { role: 'system', content: '你是搜索词提取助手。将用户提供的内容提炼为不超过 80 个字符的中文搜索关键词，只输出关键词本身，不要解释。' },
          { role: 'user', content: trimmed },
        ],
        () => {},
        `search-query-${Date.now()}`,
        100,
      );
      const extracted = result.trim();
      if (extracted && extracted.length <= MAX) return extracted;
    }
  } catch {
    // 模型调用失败，降级截断
  }

  return trimmed.slice(0, MAX).replace(/[，。！？,.!?\s]+$/, '');
}

const EntryView: React.FC<{ onStart: (skillId: string, vibe: string, webContext?: string) => void; skillId: string; setSkillId: (id: string) => void }> = ({ onStart, skillId, setSkillId }) => {
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const isWide = sidebarWidth >= 360;
  const [vibe, setVibe] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const isWechatSkill = skillId === 'wechat-hot-topic';
  const isScenarioSkill = skillId === 'wechat-scenario';

  // 参考资料（仅 wechat-scenario）
  type Ref = { id: string; type: 'url' | 'file'; name: string; content: string };
  const [refs, setRefs] = useState<Ref[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [urlLoading, setUrlLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addUrlRef = async () => {
    const url = urlInput.trim();
    if (!url) return;
    setUrlLoading(true);
    try {
      const content = await window.api.ai.fetchUrl(url);
      const name = url.replace(/^https?:\/\//, '').slice(0, 40);
      setRefs(r => [...r, { id: Date.now().toString(), type: 'url', name, content }]);
      setUrlInput('');
    } catch (e: any) {
      alert(`无法获取页面内容：${e.message}`);
    } finally {
      setUrlLoading(false);
    }
  };

  const addFileRef = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = (ev.target?.result as string) || '';
      setRefs(r => [...r, { id: Date.now().toString(), type: 'file', name: file.name, content: content.slice(0, 8000) }]);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const skillRuns = useAppStore((s) => s.skillRuns);
  const setActiveSkillRun = useAppStore((s) => s.setActiveSkillRun);
  const deleteSkillRun = useAppStore((s) => s.deleteSkillRun);

  const unfinishedRuns = Object.values(skillRuns)
    .filter((r) => r.steps.some((s) => s.status !== 'done' && s.status !== 'skipped'))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3);

  const handleSend = async () => {
    if (!vibe.trim()) return;
    let webContext: string | undefined;
    const selectedSkill = getSkillById(skillId);

    if (skillId === 'wechat-hot-topic') {
      // 用用户的关键词做定向搜索，失败时静默继续（不阻断流程）
      setIsSearching(true);
      try {
        webContext = await window.api.ai.webSearch(
          await buildSearchQuery(`${vibe.trim()} 热点话题 最新动态`),
        );
      } catch {
        // 无 Tavily Key 或网络故障时直接跳过，不影响选题生成
      }
      setIsSearching(false);
    } else if (selectedSkill?.autoSearchQuery) {
      setIsSearching(true);
      try {
        webContext = await window.api.ai.webSearch(await buildSearchQuery(selectedSkill.autoSearchQuery));
      } catch (err: any) {
        alert(`自动联网搜索失败：${err.message}`);
        setIsSearching(false);
        return;
      }
      setIsSearching(false);
    } else if (useWebSearch) {
      setIsSearching(true);
      try {
        webContext = await window.api.ai.webSearch(await buildSearchQuery(vibe));
      } catch (err: any) {
        alert(err.message);
        setIsSearching(false);
        return;
      }
      setIsSearching(false);
    }
    const fullVibe = refs.length > 0
      ? `${vibe.trim()}\n\n---\n参考资料：\n${refs.map(r => `【${r.name}】\n${r.content}`).join('\n\n')}`
      : vibe.trim();
    onStart(skillId, fullVibe, webContext);
  };

  return (
    <div className="ai-writing-panel" style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 12 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, cursor: 'pointer' }}
          onClick={() => setCollapsed(!collapsed)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={16} color="var(--color-brand-indigo)" />
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-main)' }}>SKILL 写作</span>
            <span style={{
              fontSize: 10, color: 'var(--color-brand-indigo)',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              padding: '1px 6px', borderRadius: 4, fontWeight: 500,
            }}>
              3.0
            </span>
          </div>
          {collapsed ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronUp size={14} color="var(--text-muted)" />}
        </div>

        {!collapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {[...SKILLS].sort((a, b) => {
              const order = ['wechat-hot-topic', 'wechat-scenario'];
              const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
              if (ai !== -1 && bi !== -1) return ai - bi;
              if (ai !== -1) return -1;
              if (bi !== -1) return 1;
              return 0;
            }).map((s) => {
              const isFeatured = s.id === 'wechat-hot-topic' || s.id === 'wechat-scenario';
              const isSelected = skillId === s.id;
              return (
                <React.Fragment key={s.id}>
                  <div
                    onClick={() => setSkillId(s.id)}
                    title={`${s.label}: ${s.description}（${s.steps.length} 步）`}
                    style={{
                      padding: '6px 12px', borderRadius: 10, position: 'relative',
                      border: `1px solid ${isSelected ? 'transparent' : 'var(--border-subtle)'}`,
                      background: isSelected ? 'var(--brand-gradient)' : 'var(--bg-card)',
                      boxShadow: isSelected ? '0 4px 12px var(--brand-glow)' : 'none',
                      cursor: 'pointer', transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-elevated)'; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-card)'; }}
                  >
                    {isFeatured && (
                      <span style={{
                        position: 'absolute', top: 6, right: 8,
                        fontSize: 9, fontWeight: 600,
                        color: isSelected ? 'rgba(255,255,255,0.9)' : 'var(--color-brand-indigo)',
                        background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(99,102,241,0.12)',
                        padding: '1px 5px', borderRadius: 4, letterSpacing: '0.02em',
                      }}>作者热荐</span>
                    )}
                    <div style={{
                      fontSize: 12, fontWeight: 600,
                      color: isSelected ? '#fff' : 'var(--text-primary)',
                      ...ellipsisStyle, paddingRight: isFeatured && !isSelected ? 52 : 0,
                    }}>
                      {s.label}
                      <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 400, color: isSelected ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)' }}>{s.steps.length} 步</span>
                    </div>
                    <div style={{ fontSize: 11, marginTop: 1, color: isSelected ? 'rgba(255,255,255,0.75)' : 'var(--text-muted)', ...ellipsisStyle }}>
                      {s.description}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {collapsed && (
          <div style={{
            fontSize: 11, color: 'var(--color-brand-indigo)', marginBottom: 8,
            padding: '4px 8px', backgroundColor: 'rgba(99,102,241,0.06)', borderRadius: 6,
          }}>
            当前 SKILL：{getSkillById(skillId)?.label}
          </div>
        )}


        <div style={{ position: 'relative' }}>
          <textarea
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            disabled={isSearching}
            placeholder={
              isSearching
                ? '正在检索相关热点资讯...'
                : isWechatSkill
                ? '输入话题关键词，例如：职场副业、健康养生、AI工具、亲子教育...'
                : '输入您的愿景或想法 (Vibe)...'
            }
            style={{
              width: '100%', height: 140, padding: '12px 12px 48px 12px',
              borderRadius: 12, border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)',
              fontSize: 13, resize: 'none', outline: 'none', lineHeight: 1.5,
              opacity: isSearching ? 0.6 : 1,
            }}
          />
          <div style={{
            position: 'absolute', bottom: 10, left: 10, right: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            pointerEvents: 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>

              {!isWechatSkill && (
                <>
                  <div
                    onClick={() => setUseWebSearch(!useWebSearch)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 10px', borderRadius: 20,
                      backgroundColor: useWebSearch ? 'rgba(99,102,241,0.1)' : 'var(--bg-main)',
                      border: `1px solid ${useWebSearch ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
                      cursor: 'pointer',
                    }}
                  >
                    <Globe size={12} color={useWebSearch ? 'var(--color-brand-indigo)' : 'var(--text-muted)'} />
                    <span style={{ fontSize: 11, fontWeight: 500, color: useWebSearch ? 'var(--color-brand-indigo)' : 'var(--text-muted)' }}>
                      联网
                    </span>
                  </div>
                  <div
                    onClick={() => window.api.ai.openSearchConfig()}
                    title="配置联网搜索"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, borderRadius: 6,
                      backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-subtle)',
                      cursor: 'pointer', color: 'var(--text-muted)',
                    }}
                  >
                    <Settings2 size={12} />
                  </div>
                </>
              )}
            </div>
            <button
              onClick={handleSend}
              disabled={!vibe.trim() || isSearching}
              style={{
                width: 32, height: 32, borderRadius: 10,
                background: isSearching ? 'rgba(99,102,241,0.2)' : (!vibe.trim() ? 'var(--bg-elevated)' : 'var(--brand-gradient)'),
                border: isSearching ? '1px solid rgba(99,102,241,0.3)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: isSearching ? 'wait' : 'pointer',
                color: isSearching ? 'var(--color-brand-indigo)' : '#fff',
                boxShadow: isSearching ? 'none' : (!vibe.trim() ? 'none' : '0 4px 10px var(--brand-shadow)'),
                pointerEvents: 'auto',
              }}
            >
              {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* 参考资料（仅 wechat-scenario）*/}
      {isScenarioSkill && (
        <div style={{ marginBottom: 10 }}>
          {/* 已添加的 refs */}
          {refs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
              {refs.map(r => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 8px', borderRadius: 8,
                  backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
                  fontSize: 11,
                }}>
                  {r.type === 'url' ? <Link size={10} color="var(--color-brand-indigo)" /> : <FileText size={10} color="var(--color-brand-indigo)" />}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{r.name}</span>
                  <button onClick={() => setRefs(prev => prev.filter(x => x.id !== r.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {/* URL 输入行 */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addUrlRef()}
              placeholder="粘贴网页链接..."
              style={{
                flex: 1, padding: '5px 10px', borderRadius: 8, fontSize: 11,
                border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)',
                color: 'var(--text-primary)', outline: 'none',
              }}
            />
            <button
              onClick={addUrlRef}
              disabled={!urlInput.trim() || urlLoading}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)',
                color: 'var(--color-brand-indigo)', cursor: urlLoading ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
              }}
            >
              {urlLoading ? <Loader2 size={10} className="animate-spin" /> : <Link size={10} />}
              {urlLoading ? '获取中' : '添加链接'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-card)',
                color: 'var(--text-muted)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
              }}
            >
              <Upload size={10} /> 上传文档
            </button>
            <input ref={fileInputRef} type="file" accept=".txt,.md,.markdown" style={{ display: 'none' }} onChange={addFileRef} />
          </div>
        </div>
      )}

      {/* 未完成的写作 */}
      {unfinishedRuns.length > 0 && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-subtle)', paddingTop: 12, overflow: 'hidden' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} /> 未完成的写作
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {unfinishedRuns.map((r) => {
              const sk = getSkillById(r.skillId);
              const doneCount = r.steps.filter((s) => s.status === 'done').length;
              return (
                <div
                  key={r.id}
                  style={{
                    padding: '8px 10px', borderRadius: 8,
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--bg-card)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <div
                    style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                    onClick={() => setActiveSkillRun(r.id)}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', ...ellipsisStyle }}>
                      {sk?.label || r.skillId}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, ...ellipsisStyle }}>
                      {doneCount}/{r.steps.length} 步 · {r.vibe}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteSkillRun(r.id)}
                    title="删除"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// 运行态：步骤时间线
// ─────────────────────────────────────────────
const RunView: React.FC<{ runId: string; onBack: () => void }> = ({ runId, onBack }) => {
  const { run, skill, executeStep, skipStep, editStepOutput, stopCurrent, assembleMarkdown, selectCover } = useSkillRunner(runId);
  const imageGenConfig = useAppStore((s) => s.imageGenConfig);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const updateTabContent = useAppStore((s) => s.updateTabContent);
  const autoTriggeredRef = React.useRef(false);
  const [publishState, setPublishState] = React.useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const [publishMsg, setPublishMsg] = React.useState('');
  const [accounts, setAccounts] = React.useState<{ id: string; name: string }[]>([]);
  const [showAccountPicker, setShowAccountPicker] = React.useState(false);
  const [selectedAccountId, setSelectedAccountId] = React.useState<string | null>(null);

  // 加载账号列表
  React.useEffect(() => {
    window.api.wechat.getConfig().then((cfg) => {
      const list = (cfg.accounts || []).map((a: any) => ({ id: a.id, name: a.name }));
      setAccounts(list);
      if (list.length > 0) setSelectedAccountId(list[0].id);
    });
  }, []);

  const doPublish = async (accountId?: string) => {
    if (publishState === 'loading') return;
    setPublishState('loading');
    setPublishMsg('');
    setShowAccountPicker(false);
    try {
      const coverStep = run?.steps.find((s) => s.stepId === 'cover');
      const coverLocalPath =
        coverStep?.coverImages && coverStep.selectedCoverIndex !== undefined
          ? coverStep.coverImages[coverStep.selectedCoverIndex]?.localPath
          : undefined;

      // 从当前文档内容里提取手动插入的图片（data: URL）
      const activeTab = tabs.find((t) => t.id === activeTabId);
      const docContent = activeTab?.content ?? '';
      const inlineImageDataUrls: string[] = [];
      const imgRegex = /!\[[^\]]*\]\((data:image\/[^)]+)\)/g;
      let imgMatch: RegExpExecArray | null;
      while ((imgMatch = imgRegex.exec(docContent)) !== null) {
        inlineImageDataUrls.push(imgMatch[1]);
      }

      // 从 title_factory 选中项取标题
      const titleStep = run?.steps.find((s) => s.stepId === 'title_factory');
      const selectedTitle =
        titleStep?.outlineItems && titleStep.selectedItemIndex !== undefined
          ? titleStep.outlineItems[titleStep.selectedItemIndex]?.trim()
          : undefined;

      // 从 seo 步骤提取搜一搜摘要
      const seoStep = run?.steps.find((s) => s.stepId === 'seo');
      let abstract: string | undefined;
      if (seoStep?.output) {
        const m = seoStep.output.match(/②[^\n]*\n+([\s\S]*?)(?:\n+[①-⑩]|\n+\*\*[①-⑩]|$)/);
        abstract = m?.[1]?.replace(/\*\*/g, '').trim();
      }

      // 优先使用 wechat_html 步骤的输出（直接 HTML，保留排版）
      const htmlStep = run?.steps.find((s) => s.stepId === 'wechat_html');
      if (htmlStep?.output) {
        await window.api.wechat.publishHtml(htmlStep.output, { title: selectedTitle, abstract, accountId, coverLocalPath, inlineImageDataUrls });
      } else {
        const md = assembleMarkdown?.();
        if (!md) { setPublishMsg('暂无可发布内容，请先完成写作步骤'); setPublishState('error'); return; }
        await window.api.wechat.publish(md, { accountId, coverLocalPath });
      }

      setPublishState('done');
      setPublishMsg('已发布到草稿箱 ✓');
    } catch (err: any) {
      setPublishState('error');
      setPublishMsg(err.message || '发布失败');
    }
  };

  const handlePublishClick = () => {
    if (publishState === 'loading') return;
    if (accounts.length > 1) {
      setShowAccountPicker((v) => !v);
    } else {
      doPublish(selectedAccountId ?? undefined);
    }
  };

  // 新建 run 时自动执行第一步
  React.useEffect(() => {
    if (autoTriggeredRef.current || !run || !skill) return;
    const isFresh = Date.now() - run.createdAt < 2000;
    const firstStep = run.steps[0];
    if (isFresh && firstStep && firstStep.status === 'pending') {
      autoTriggeredRef.current = true;
      executeStep(firstStep.stepId);
    }
  }, [run, skill, executeStep]);

  if (!run || !skill) return null;

  return (
    <div className="ai-writing-panel" style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶部栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 4px 12px 4px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 12,
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', padding: 4 }}
        >
          <ArrowLeft size={14} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', ...ellipsisStyle }}>
            {skill.label}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, ...ellipsisStyle }}>
            {run.vibe}
          </div>
        </div>
      </div>

      {/* 步骤列表 */}
      <div className="skill-timeline" style={{ flex: 1, overflowY: 'auto' }}>
        {skill.steps.map((step, i) => {
          const stepRun = run.steps.find((s) => s.stepId === step.id) ?? {
            stepId: step.id, status: 'pending' as const, output: '', updatedAt: Date.now(),
          };
          const isCurrent = run.currentStepIndex === i;
          return (
            <SkillStepCard
              key={step.id}
              index={i}
              step={step}
              run={stepRun}
              isCurrent={isCurrent}
              onExecute={() => executeStep(step.id)}
              onStop={stopCurrent}
              onSkip={() => skipStep(step.id)}
              onPatch={(patch) => editStepOutput(step.id, patch)}
              onExecuteSection={(idx) => executeStep(step.id, { sectionIndex: idx })}
              webContext={i === 0 ? run.webContext : undefined}
              onSelectCover={step.kind === 'cover' ? (idx) => selectCover(step.id, idx) : undefined}
              onGenerateImage={async (prompt) => {
                const results: { url: string; localPath: string }[] = await (window as any).api.ai.getCoverImages({
                  query: prompt,
                  vibe: run?.vibe ?? '',
                  config: { ...imageGenConfig, source: 'generate' },
                });
                if (!results.length) throw new Error('未生成图片');
                return results[0];
              }}
              onPublish={step.kind === 'publish' ? async (theme, color) => {
                const md = assembleMarkdown?.();
                if (!md) throw new Error('暂无可发布内容，请先完成写作步骤');
                const coverStep = run?.steps.find((s) => s.stepId === 'cover');
                const coverLocalPath =
                  coverStep?.coverImages && coverStep.selectedCoverIndex !== undefined
                    ? coverStep.coverImages[coverStep.selectedCoverIndex]?.localPath
                    : undefined;
                await window.api.wechat.publish(md, {
                  theme,
                  color,
                  accountId: selectedAccountId ?? undefined,
                  coverLocalPath,
                });
              } : undefined}
              onWriteToDoc={step.kind === 'polish' && activeTabId ? (content) => updateTabContent(activeTabId, content) : undefined}
            />
          );
        })}
      </div>

      {/* 底部装配按钮 */}
      <div style={{ paddingTop: 12, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* 发布到公众号 */}
          <div style={{ position: 'relative', flex: 1 }}>
            <button
              onClick={handlePublishClick}
              title={accounts.length > 1 ? '选择账号并发布到微信公众号草稿箱' : '发布到微信公众号草稿箱'}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: 'none',
                background: publishState === 'done' ? 'rgba(16,185,129,0.12)' : 'var(--brand-gradient)',
                color: publishState === 'done' ? '#10B981' : publishState === 'error' ? '#ff4757' : '#fff',
                fontSize: 12, fontWeight: 600, cursor: publishState === 'loading' ? 'wait' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                boxShadow: publishState === 'done' ? 'none' : '0 4px 12px var(--brand-shadow)',
              }}
            >
              {publishState === 'loading' ? (
                <><Loader2 size={13} className="animate-spin" /> 发布中</>
              ) : publishState === 'done' ? (
                <><CheckCircle2 size={13} /> 已发布</>
              ) : (
                <><Upload size={13} /> 发布到公众号{accounts.length > 1 && <ChevronDown size={11} style={{ marginLeft: 2 }} />}</>
              )}
            </button>

            {/* 多账号下拉选择器 */}
            {showAccountPicker && (
              <div style={{
                position: 'absolute', bottom: '110%', right: 0,
                backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                minWidth: 180, zIndex: 100, overflow: 'hidden',
                animation: 'fadeIn 0.12s ease-out',
              }}>
                <div style={{ padding: '8px 12px 6px', fontSize: 10, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>
                  选择发布账号
                </div>
                {accounts.map((acct, i) => (
                  <button
                    key={acct.id}
                    onClick={() => { setSelectedAccountId(acct.id); doPublish(acct.id); }}
                    style={{
                      width: '100%', padding: '9px 12px', textAlign: 'left',
                      background: selectedAccountId === acct.id ? 'rgba(99,102,241,0.08)' : 'none',
                      border: 'none', cursor: 'pointer',
                      color: selectedAccountId === acct.id ? 'var(--color-brand-indigo)' : 'var(--text-primary)',
                      fontSize: 12, fontWeight: selectedAccountId === acct.id ? 600 : 400,
                      display: 'flex', alignItems: 'center', gap: 8,
                      borderBottom: i < accounts.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    }}
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                      background: 'var(--brand-gradient)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 10, fontWeight: 700,
                    }}>
                      {acct.name.charAt(0)}
                    </div>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acct.name}</span>
                    {i === 0 && (
                      <span style={{ fontSize: 9, color: 'var(--color-brand-indigo)', border: '1px solid var(--color-brand-indigo)', borderRadius: 3, padding: '1px 3px' }}>默认</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 发布状态消息 */}
        {publishMsg && (
          <div style={{
            fontSize: 11, padding: '6px 8px', borderRadius: 6,
            backgroundColor: publishState === 'done' ? 'rgba(16,185,129,0.08)' : 'rgba(255,71,87,0.08)',
            color: publishState === 'done' ? '#10B981' : '#ff4757',
            lineHeight: 1.5, maxHeight: 160, overflowY: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {publishMsg}
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// 主组件
// ─────────────────────────────────────────────
export const AIWritingPanel: React.FC = () => {
  const activeSkillRunId = useAppStore((s) => s.activeSkillRunId);
  const setActiveSkillRun = useAppStore((s) => s.setActiveSkillRun);
  const upsertSkillRun = useAppStore((s) => s.upsertSkillRun);
  const [skillId, setSkillId] = useState('wechat-hot-topic');

  const handleStart = (sid: string, vibe: string, webContext?: string) => {
    const skill = getSkillById(sid);
    if (!skill) return;
    const run = createSkillRun(skill, vibe, webContext);
    upsertSkillRun(run);
    setActiveSkillRun(run.id);
  };

  if (activeSkillRunId) {
    return <RunView runId={activeSkillRunId} onBack={() => setActiveSkillRun(null)} />;
  }
  return <EntryView onStart={handleStart} skillId={skillId} setSkillId={setSkillId} />;
};
