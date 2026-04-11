import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Loader2, BookOpen, Activity, FileCode, BrainCircuit, Wand2 } from 'lucide-react';
import { SKILLS } from '../../data/skills';

export type PaletteSkillRef = { skillId: string; stepId: string; inputAs: 'vibe' | 'prevOutput' };

interface AIPaletteProps {
  onClose: () => void;
  onAction: (
    prompt: string,
    useContext: boolean,
    mode: 'text' | 'mermaid' | 'svg' | 'outline' | 'skill',
    skillRef?: PaletteSkillRef
  ) => void;
  onStop?: () => void;
  loading?: boolean;
}

export const AIPalette: React.FC<AIPaletteProps> = ({ onClose, onAction, onStop, loading }) => {
  const [input, setInput] = useState('');
  const [useContext, setUseContext] = useState(false);
  const [activeMode, setActiveMode] = useState<'text' | 'mermaid' | 'svg' | 'outline' | 'skill'>('text');
  const [skillRef, setSkillRef] = useState<PaletteSkillRef | null>(null);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 收集所有 skill 的 paletteEntries
  const allSkillEntries = SKILLS.flatMap(s =>
    (s.paletteEntries || []).map(e => ({ ...e, skillId: s.id, skillLabel: s.label }))
  );

  const submit = () => {
    if (!input.trim() || loading) return;
    if (activeMode === 'skill' && skillRef) {
      onAction(input, useContext, 'skill', skillRef);
    } else {
      onAction(input, useContext, activeMode);
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div 
      className="ai-palette-container"
      onClick={e => e.stopPropagation()}
      style={{
        width: 480, backgroundColor: 'var(--bg-elevated)', borderRadius: 12,
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2), 0 0 0 1px var(--border-subtle)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        animation: 'paletteIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        backdropFilter: 'blur(20px)',
        zIndex: 100
      }}
    >
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: 16, top: 18 }}>
            {loading ? <Loader2 size={18} className="animate-spin" color="var(--color-brand-indigo)" /> : <Sparkles size={18} color="var(--color-brand-indigo)" />}
          </div>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入指令让 AI 生成内容..."
            rows={1}
            style={{
              width: '100%', padding: '16px 16px 16px 48px', border: 'none', background: 'transparent',
              fontSize: 15, color: 'var(--text-main)', outline: 'none',
              resize: 'none', overflow: 'hidden', lineHeight: 1.6,
              fontFamily: 'inherit', boxSizing: 'border-box'
            }}
          />
        </div>
        <div style={{ 
          backgroundColor: 'var(--bg-card)', display: 'flex', flexDirection: 'column',
          gap: 0
        }}>

          <div style={{ 
            padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 8
          }}>
            {/* 左侧：快捷键 + 结合上下文按钮 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* 结合上下文切换按钮 */}
            <button
              onClick={() => setUseContext(v => !v)}
              title={useContext ? '已启用：结合当前文档内容生成' : '启用：结合当前文档内容生成'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
                backgroundColor: useContext ? 'var(--color-brand-indigo)' : 'var(--bg-card)',
                color: useContext ? '#fff' : 'var(--text-secondary)',
                boxShadow: useContext ? '0 4px 12px var(--brand-glow)' : '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                outline: 'none',
              }}
            >
              <BookOpen size={14} />
              结合上下文
            </button>

            <div style={{ width: 1, height: 16, backgroundColor: 'var(--border-subtle)', margin: '0 4px' }} />

            {/* Mermaid 模式按钮 */}
            <button
              onClick={() => setActiveMode(activeMode === 'mermaid' ? 'text' : 'mermaid')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
                backgroundColor: activeMode === 'mermaid' ? 'var(--color-accent-indigo)' : 'var(--bg-card)',
                color: activeMode === 'mermaid' ? '#fff' : 'var(--text-secondary)',
                boxShadow: activeMode === 'mermaid' ? '0 4px 12px rgba(99, 102, 241, 0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                outline: 'none',
              }}
            >
              <Activity size={14} />
              Mermaid
            </button>

            {/* SVG 模式按钮 */}
            <button
              onClick={() => setActiveMode(activeMode === 'svg' ? 'text' : 'svg')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
                backgroundColor: activeMode === 'svg' ? 'var(--color-accent-orange)' : 'var(--bg-card)',
                color: activeMode === 'svg' ? '#fff' : 'var(--text-secondary)',
                boxShadow: activeMode === 'svg' ? '0 4px 12px rgba(255, 127, 80, 0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                outline: 'none',
              }}
            >
              <FileCode size={14} />
              SVG
            </button>

            {/* SKILL 模式按钮 + 下拉 */}
            {allSkillEntries.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setSkillMenuOpen(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', cursor: 'pointer',
                    fontSize: 12, fontWeight: 500,
                    backgroundColor: activeMode === 'skill' ? 'var(--color-brand-indigo)' : 'var(--bg-card)',
                    color: activeMode === 'skill' ? '#fff' : 'var(--text-secondary)',
                    boxShadow: activeMode === 'skill' ? '0 4px 12px var(--brand-glow)' : '0 1px 2px rgba(0,0,0,0.05)',
                    outline: 'none',
                  }}
                >
                  <Wand2 size={14} />
                  {activeMode === 'skill' && skillRef
                    ? (allSkillEntries.find(e => e.skillId === skillRef.skillId && e.stepId === skillRef.stepId)?.label || 'SKILL')
                    : 'SKILL'}
                </button>
                {skillMenuOpen && (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 4px)', left: 0,
                    minWidth: 200, backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)', borderRadius: 8,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 200,
                    padding: 4, maxHeight: 240, overflowY: 'auto',
                  }}>
                    {allSkillEntries.map(entry => (
                      <div
                        key={`${entry.skillId}-${entry.id}`}
                        onClick={() => {
                          setActiveMode('skill');
                          setSkillRef({ skillId: entry.skillId, stepId: entry.stepId, inputAs: entry.inputAs });
                          setSkillMenuOpen(false);
                        }}
                        style={{
                          padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                          fontSize: 12, color: 'var(--text-primary)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-card)'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        {entry.label}
                      </div>
                    ))}
                    {activeMode === 'skill' && (
                      <div
                        onClick={() => { setActiveMode('text'); setSkillRef(null); setSkillMenuOpen(false); }}
                        style={{
                          padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                          fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', marginTop: 4,
                        }}
                      >
                        清除选择
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 智能大纲模式按钮 */}
            <button
              onClick={() => setActiveMode(activeMode === 'outline' ? 'text' : 'outline')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)', cursor: 'pointer',
                fontSize: 12, fontWeight: 500,
                backgroundColor: activeMode === 'outline' ? 'var(--color-brand-purple)' : 'var(--bg-card)',
                color: activeMode === 'outline' ? '#fff' : 'var(--text-secondary)',
                boxShadow: activeMode === 'outline' ? '0 4px 12px rgba(139, 92, 246, 0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                outline: 'none',
              }}
            >
              <BrainCircuit size={14} />
              智能大纲
            </button>
          </div>

          {/* 右侧：发送 / 生成中 */}
          {loading ? (
            <div 
              onClick={onStop}
              style={{ 
                cursor: 'pointer', padding: '6px 12px', borderRadius: 8, backgroundColor: 'rgba(255, 71, 87, 0.1)',
                color: '#ff4757', display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600, flexShrink: 0,
                border: '1px solid rgba(255, 71, 87, 0.2)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 71, 87, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 71, 87, 0.1)';
              }}
            >
              <Loader2 size={13} className="animate-spin" />
              停止
            </div>
          ) : (
            <div 
              onClick={submit}
              style={{ 
                cursor: input.trim() ? 'pointer' : 'default', 
                padding: '6px 12px', borderRadius: 8, 
                backgroundColor: input.trim() ? 'var(--color-brand-indigo)' : 'var(--bg-surface)',
                color: input.trim() ? '#fff' : 'var(--text-muted)', 
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600, flexShrink: 0,
                boxShadow: input.trim() ? '0 4px 12px var(--brand-shadow)' : 'none',
                opacity: input.trim() ? 1 : 0.6,
                border: input.trim() ? 'none' : '1px solid var(--border-subtle)',
                transition: 'all 0.2s ease'
              }}
            >
              <Send size={13} />
              发送
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
