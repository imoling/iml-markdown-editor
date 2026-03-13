import React, { useState } from 'react';
import { useAI, Message } from '../../hooks/useAI';
import { useAppStore } from '../../stores/appStore';
import { Sparkles, Send, Loader2 } from 'lucide-react';

const SCENARIOS = [
  {
    id: 'prd',
    label: 'AI 编程需求文档',
    description: '将用户灵感转化为AI编程需求PRD文档',
    prompt: (vibe: string) => `您是一位资深的 PRD 专家。请根据以下用户的“Vibe”（模糊的灵感/原始愿景）编写一份详尽、标准化的 Markdown 格式 PRD 文档。
请直接输出文档内容，不要有任何开场白或结束语。

文档结构必须包含：
1. 项目概述 (从 Vibe 入手，明确核心目标与愿景)
2. 核心功能描述 (将灵感具象化为可执行的功能逻辑)
3. 用户交互细节 (UX/UI 关键点)
4. 技术栈建议 (适配 Vibe Coding 的简洁方案)
5. 验证计划 (如何定义成功)

用户的 Vibe 是: "${vibe}"`
  },
  {
    id: 'ai-studio',
    label: 'AI Studio 验证系统',
    description: '生成Google AI Studio验证系统提示词',
    prompt: (vibe: string) => `请根据用户的需求 "${vibe}"，生成一段用于 Google AI Studio 的系统级 Demo 指令（System Prompt）。
该指令应指导 AI 表现为一个具备特定能力边界、交互规范和技术逻辑的功能原型。
要求：使用 Markdown 格式输出。内容应包含：角色设定、能力边界、交互规范、技术偏好以及具体的视觉指导建议。直接输出系统指令内容，严禁废话。`
  },
  {
    id: 'stitch',
    label: 'Stitch 原型设计',
    description: '生成Stitch高交互界面提示词',
    prompt: (vibe: string) => `请将以下设计构想 "${vibe}" 转化为专门用于 Stitch 的“视觉工程”设计指令。
该指令应精准描述页面布局、关键交互动效、组件规格以及整体设计语言（如玻璃拟态、极简主义），以便一键渲染出高交互界面。
使用 Markdown 格式直接输出指令，不需要任何额外解释。`
  },
  {
    id: 'nanobanana',
    label: 'Nano Banana PPT',
    description: '定制Nano Banana Pro 生成 PPT提示词',
    prompt: (vibe: string) => `您是一位顶级的 PPT 设计顾问与视觉专家。
请根据用户的输入内容 "${vibe}"，为您定制一套适配 Nano Banana Pro 级别的“高审美”视觉增效方案：

1. **模板意图识别**：从以下 10 套预置风格中，为该主题推荐 1 套最合适的风格，并说明理由：
   - 极简商务风：苹果发布会美学，大量留白，Helvetica，高端摄影。
   - 前沿科技风：深色模式，霓虹渐变，3D等距插图，发光粒子。
   - 创意艺术风：孟菲斯设计，大胆撞色，几何形状，波普艺术。
   - 温暖治愈风：莫兰迪色调，米色/鼠尾草绿，水彩纹理，优雅衬线体。
   - 新中式/国潮风：东方美学，水墨水墨，金箔纹理，禅意。
   - 学术/机构风：海军蓝/白配色，稳重权威，网格布局，高可读性。
   - 现代 SaaS 风：弥散渐变，磨砂玻璃，圆角卡片，Notion 风格图标。
   - 工业工程风：技术蓝图，混凝土灰，精密细线，机械美学。
   - 杂志排版风：字体驱动，大粗标题，不对称布局，时尚感。
   - 数据仪表盘风：哑光深色，霓虹数据视图，模块化布局，精确分析。

2. **内容整理**：根据选定的风格，将用户的主题内容整理为专业的 PPT 核心大纲文案。

3. **Nano Banana Pro 配图 Prompt**：基于所选风格，生成 3-5 条具备“高审美”特征的专业绘图提示词。

请使用 Markdown 格式直接输出，结构清晰，严禁任何废话。`
  },
  {
    id: 'report',
    label: '职场心流复盘',
    description: '日常工作整理成极具逻辑的专业汇报',
    prompt: (vibe: string) => `请根据以下零碎、随性的工作心流记录，将其“重构”为一份正式、精美且极具逻辑的专业汇报（如周报或月报）。使用 Markdown 格式。直接输出正文，不要有任何客套话。内容：${vibe}`
  },
  {
    id: 'tech',
    label: '架构拆解与工程化',
    description: '生成Vibe Coding技术骨架并模块化拆解',
    prompt: (vibe: string) => `请为以下技术需求 "${vibe}" 编写一份详细的技术架构设计与模块化拆解文档。
该文档应作为项目工程化的核心支撑，包含但不限于：技术选型逻辑、核心模块定义、数据流动模型以及为 Vibe Coding 提供的稳定性保障策略。
使用 Markdown 格式。直接输出内容，排除任何辅助性说明。`
  }
];

export const AIWritingPanel: React.FC = () => {
  const [vibe, setVibe] = useState('');
  const [scenario, setScenario] = useState(SCENARIOS[0]);
  const { generate, loading } = useAI();
  const { openTab, updateTabContent } = useAppStore();

  const handleGenerate = async () => {
    if (!vibe.trim()) return;

    const messages: Message[] = [
      { role: 'system', content: '您是一位专业的文档写作助手。您的任务是直接输出用户要求的结构化 Markdown 文档内容，严禁包含任何如“好的”、“收到”之类的对话式引导，也严禁包含任何非文档正文的后续行动建议。即刻开始，只输出 Markdown 本身。' },
      { role: 'user', content: scenario.prompt(vibe) }
    ];

    let accumulatedContent = '';
    let currentTabId = '';
    
    // Get current state to check for streaming callback
    const { streamingCallback, openTab, updateTabContent } = useAppStore.getState();

    try {
      await generate(messages, (chunk) => {
        accumulatedContent += chunk;
        
        if (streamingCallback) {
          // Contextual Generation: Stream directly into active editor
          streamingCallback(chunk);
        } else {
          // Default: Create new tab if no active editor
          if (!currentTabId) {
            currentTabId = `ai-gen-${Date.now()}.md`;
            openTab({
              id: currentTabId,
              title: scenario.label,
              content: '> AI 正在为您构思中...\n\n',
              isDirty: true,
              mode: 'word'
            });
          }
          updateTabContent(currentTabId, accumulatedContent);
        }
      });
      // 清空输入
      setVibe('');
    } catch (err: any) {
      if (currentTabId) {
        updateTabContent(currentTabId, `> 生成失败: ${err.message}`);
      } else {
        console.error('Contextual generation failed:', err);
      }
    }
  };

  const ellipsisStyle: React.CSSProperties = {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    width: '100%'
  };

  return (
    <div className="ai-writing-panel" style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Sparkles size={16} color="var(--color-accent-indigo)" />
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-main)' }}>场景写作</span>
        </div>

        <div className="scenario-grid" style={{ display: 'grid', gap: 4, marginBottom: 12 }}>
          {SCENARIOS.map(s => (
            <div
              key={s.id}
              onClick={() => setScenario(s)}
              title={`${s.label}: ${s.description}`} // Add tooltip for full text
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: `1px solid ${scenario.id === s.id ? 'var(--color-accent-indigo)' : 'var(--border-subtle)'}`,
                backgroundColor: scenario.id === s.id ? 'rgba(0, 122, 255, 0.03)' : 'var(--bg-card)',
                boxShadow: scenario.id === s.id ? '0 4px 12px rgba(0, 122, 255, 0.1)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={e => {
                if (scenario.id !== s.id) {
                  e.currentTarget.style.borderColor = 'var(--border-strong)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                }
              }}
              onMouseLeave={e => {
                if (scenario.id !== s.id) {
                  e.currentTarget.style.borderColor = 'var(--border-subtle)';
                  e.currentTarget.style.backgroundColor = 'var(--bg-card)';
                }
              }}
            >
              {scenario.id === s.id && (
                <div style={{
                  position: 'absolute', top: 0, left: 0, width: 3, height: '100%',
                  backgroundColor: 'var(--color-accent-indigo)'
                }} />
              )}
              <div style={{ 
                fontSize: 13, 
                fontWeight: 600, 
                color: scenario.id === s.id ? 'var(--color-accent-indigo)' : 'var(--text-main)', 
                ...ellipsisStyle 
              }}>{s.label}</div>
              <div style={{ 
                fontSize: 11, 
                color: 'var(--text-muted)', 
                ...ellipsisStyle,
                opacity: 0.8
              }}>{s.description}</div>
            </div>
          ))}
        </div>

        <div style={{ position: 'relative' }}>
          <textarea
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            placeholder="输入您的愿景或想法 (Vibe)..."
            style={{
              width: '100%',
              height: 180,
              padding: '16px',
              borderRadius: '16px',
              border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: 14,
              resize: 'none',
              outline: 'none',
              lineHeight: 1.6,
              transition: 'all 0.2s ease',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
            }}
            onFocus={e => {
              e.currentTarget.style.borderColor = 'var(--color-accent-indigo)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0, 122, 255, 0.1), inset 0 2px 4px rgba(0,0,0,0.02)';
            }}
            onBlur={e => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)';
              e.currentTarget.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.02)';
            }}
          />
          <button
            onClick={handleGenerate}
            disabled={loading || !vibe.trim()}
            style={{
              position: 'absolute',
              bottom: 12,
              right: 12,
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: loading || !vibe.trim() ? 'var(--bg-elevated)' : 'var(--color-accent-indigo)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(0, 122, 255, 0.2)'
            }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 8px', borderTop: '1px solid var(--border-subtle)' }}>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, opacity: 0.8 }}>
          <Sparkles size={11} style={{ marginRight: 6, display: 'inline', verticalAlign: 'text-top' }} color="var(--color-accent-indigo)" />
          <strong>智能导向模式</strong>：若当前光标在文档中，AI 内容将直接原地流式录入；否则将自动创建新文档。
        </p>
      </div>
    </div>
  );
};
