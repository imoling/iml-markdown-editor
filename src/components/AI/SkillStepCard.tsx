import React, { useState } from 'react';
import {
  Check,
  Loader2,
  Play,
  RotateCcw,
  SkipForward,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Plus,
  Trash2,
  Database,
  Image,
  ZoomIn,
  X,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { SkillStep, POLISH_OPTIONS } from '../../data/skills';
import { SkillStepRun } from '../../stores/appStore';

interface Props {
  index: number;
  step: SkillStep;
  run: SkillStepRun;
  isCurrent: boolean;
  onExecute: () => void;
  onStop: () => void;
  onSkip: () => void;
  onPatch: (patch: Partial<SkillStepRun>) => void;
  onExecuteSection?: (sectionIndex: number) => void;
  /** 仅第一步（fetch_trends）传入：展示原始搜索数据 */
  webContext?: string;
  onSelectCover?: (index: number) => void;
  /** publish 步骤：触发真实发布动作 */
  onPublish?: (theme: string, color: string) => Promise<void>;
  /** 按提示词生成一张图片 */
  onGenerateImage?: (prompt: string) => Promise<{ url: string; localPath: string }>;
}

const statusBadge = (status: SkillStepRun['status']) => {
  switch (status) {
    case 'done':
      return { icon: <Check size={12} />, color: '#10B981', label: '已完成' };
    case 'running':
      return { icon: <Loader2 size={12} className="animate-spin" />, color: '#6366F1', label: '生成中' };
    case 'error':
      return { icon: <AlertCircle size={12} />, color: '#ff4757', label: '错误' };
    case 'skipped':
      return { icon: <SkipForward size={12} />, color: '#94A3B8', label: '已跳过' };
    default:
      return { icon: <Play size={12} />, color: '#94A3B8', label: '待执行' };
  }
};

export const SkillStepCard: React.FC<Props> = ({
  index,
  step,
  run,
  isCurrent,
  onExecute,
  onStop,
  onSkip,
  onPatch,
  onExecuteSection,
  webContext,
  onSelectCover,
  onPublish,
  onGenerateImage,
}) => {
  const [expanded, setExpanded] = useState(isCurrent || run.status === 'error');
  const [rawExpanded, setRawExpanded] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const badge = statusBadge(run.status);

  React.useEffect(() => {
    if (isCurrent) setExpanded(true);
  }, [isCurrent]);
  const isRunning = run.status === 'running';

  const updateOutlineItem = (i: number, v: string) => {
    const items = [...(run.outlineItems || [])];
    items[i] = v;
    onPatch({ outlineItems: items });
  };
  const removeOutlineItem = (i: number) => {
    const items = (run.outlineItems || []).filter((_, idx) => idx !== i);
    // 如果删掉了被选中的项，清空选择
    const newSelected =
      run.selectedItemIndex !== undefined && run.selectedItemIndex >= i
        ? Math.max(0, run.selectedItemIndex - 1)
        : run.selectedItemIndex;
    onPatch({ outlineItems: items, selectedItemIndex: newSelected });
  };
  const addOutlineItem = () => {
    onPatch({ outlineItems: [...(run.outlineItems || []), ''] });
  };

  return (
    <div
      style={{
        border: `1px solid ${isCurrent ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
        borderRadius: 10,
        backgroundColor: 'var(--bg-card)',
        marginBottom: 8,
        overflow: 'hidden',
        boxShadow: isCurrent ? '0 4px 12px var(--brand-shadow)' : 'none',
        transition: 'all 0.2s',
      }}
    >
      {/* 头部 */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 12px',
          cursor: 'pointer',
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            backgroundColor: badge.color,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {badge.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
              {index + 1}. {step.label}
            </span>
            {step.optional && (
              <span style={{ fontSize: 9, color: 'var(--text-muted)', padding: '0 4px', border: '1px solid var(--border-subtle)', borderRadius: 4 }}>
                可选
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {step.description} · {badge.label}
          </div>
        </div>
        {expanded ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div style={{ padding: '8px 12px 12px 12px' }}>
          {/* 错误信息 */}
          {run.error && (
            <div style={{ fontSize: 11, color: '#ff4757', padding: '8px 0' }}>{run.error}</div>
          )}

          {/* ── 原始搜索数据折叠面板（仅第一步有 webContext 时显示） ── */}
          {webContext && (
            <div style={{ marginTop: 4, borderRadius: 6, backgroundColor: 'var(--bg-main)', overflow: 'hidden' }}>
              <div
                onClick={() => setRawExpanded(!rawExpanded)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 8px', cursor: 'pointer',
                  backgroundColor: 'var(--bg-surface)',
                }}
              >
                <Database size={11} color="var(--text-muted)" />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>原始搜索数据（X · HN · GitHub）</span>
                {rawExpanded
                  ? <ChevronDown size={11} color="var(--text-muted)" />
                  : <ChevronRight size={11} color="var(--text-muted)" />}
              </div>
              {rawExpanded && (
                <pre style={{
                  margin: 0,
                  padding: '8px',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  backgroundColor: 'var(--bg-main)',
                  maxHeight: 200,
                  overflowY: 'auto',
                }}>
                  {webContext}
                </pre>
              )}
            </div>
          )}

          {/* ── article_type：2 列框架卡片 ── */}
          {step.id === 'article_type' && run.outlineItems && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '8px 0' }}>
              {run.outlineItems.map((item, i) => {
                const colonIdx = item.indexOf('：');
                const name = colonIdx > -1 ? item.slice(0, colonIdx).trim() : item;
                const flow = colonIdx > -1 ? item.slice(colonIdx + 1).trim() : '';
                const isSelected = run.selectedItemIndex === i;
                const icons = ['📖', '🎭', '💬', '🔍', '📈', '🔬'];
                return (
                  <div
                    key={i}
                    onClick={() => !isRunning && onPatch({ selectedItemIndex: i })}
                    style={{
                      padding: '10px 12px', borderRadius: 10,
                      cursor: isRunning ? 'default' : 'pointer',
                      border: `1.5px solid ${isSelected ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
                      backgroundColor: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--bg-main)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{icons[i] ?? '📝'}</div>
                    <div style={{
                      fontSize: 12, fontWeight: 600, marginBottom: 5,
                      color: isSelected ? 'var(--color-brand-indigo)' : 'var(--text-primary)',
                    }}>{name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {flow.split(' → ').map((node, ni, arr) => (
                        <span key={ni}>
                          <span style={{ color: isSelected ? 'var(--color-brand-indigo)' : 'var(--text-secondary)', fontWeight: 500 }}>{node}</span>
                          {ni < arr.length - 1 && <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>›</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── outline 类：单选卡片（通用，排除 article_type） ── */}
          {step.kind === 'outline' && step.singleSelect && step.id !== 'article_type' && run.outlineItems && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
              {run.outlineItems.map((item, i) => {
                const isSelected = run.selectedItemIndex === i;
                // 解析富文本格式：标题｜钩子：xxx｜大纲：①②③
                const parts = item.split('｜');
                const title = parts[0]?.trim() || item;
                const hookRaw = parts.find((p) => p.trim().startsWith('钩子：'));
                const outlineRaw = parts.find((p) => p.trim().startsWith('大纲：'));
                const hook = hookRaw?.replace(/^钩子：/, '').trim();
                const outline = outlineRaw?.replace(/^大纲：/, '').trim();
                const isRich = !!(hook || outline);

                return (
                  <div
                    key={i}
                    onClick={() => !isRunning && onPatch({ selectedItemIndex: i })}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      padding: '10px 10px', borderRadius: 10, cursor: isRunning ? 'default' : 'pointer',
                      border: `1px solid ${isSelected ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
                      backgroundColor: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--bg-main)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {/* 单选圆点 */}
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                      border: `2px solid ${isSelected ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
                      backgroundColor: isSelected ? 'var(--color-brand-indigo)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && <div style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#fff' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* 标题 */}
                      <div style={{
                        fontSize: 12, fontWeight: isSelected ? 600 : 500, lineHeight: 1.5,
                        color: isSelected ? 'var(--color-brand-indigo)' : 'var(--text-primary)',
                      }}>
                        <span style={{ color: 'var(--color-brand-indigo)', fontWeight: 700, marginRight: 4 }}>{i + 1}.</span>
                        {title}
                      </div>
                      {/* 钩子 */}
                      {hook && (
                        <div style={{
                          fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.45,
                          padding: '3px 6px', borderRadius: 4,
                          backgroundColor: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--bg-surface)',
                          borderLeft: '2px solid var(--color-brand-indigo)',
                        }}>
                          <span style={{ fontWeight: 600, color: 'var(--color-brand-indigo)', marginRight: 3 }}>钩子</span>
                          {hook}
                        </div>
                      )}
                      {/* 大纲思路 */}
                      {outline && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                          <span style={{ fontWeight: 600, marginRight: 3 }}>大纲</span>
                          {outline}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {run.selectedItemIndex === undefined && run.status === 'done' && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 2px', textAlign: 'center' }}>
                  ↑ 点击选择一条选题，后续步骤将围绕它展开
                </div>
              )}
            </div>
          )}

          {/* ── outline 类：普通可编辑列表（非 singleSelect） ── */}
          {step.kind === 'outline' && !step.singleSelect && run.outlineItems && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0' }}>
              {run.outlineItems.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--color-brand-indigo)', fontWeight: 700, minWidth: 16 }}>
                    {i + 1}
                  </span>
                  <input
                    value={item}
                    onChange={(e) => updateOutlineItem(i, e.target.value)}
                    disabled={isRunning}
                    style={{
                      flex: 1,
                      fontSize: 12,
                      padding: '4px 6px',
                      backgroundColor: 'var(--bg-main)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                      color: 'var(--text-primary)',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => removeOutlineItem(i)}
                    disabled={isRunning}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
              <button
                onClick={addOutlineItem}
                disabled={isRunning}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  padding: '4px 0', borderRadius: 6,
                  border: '1px dashed var(--border-subtle)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer',
                }}
              >
                <Plus size={10} /> 添加要点
              </button>
            </div>
          )}

          {/* section 类：每个 outline 项独立按钮 */}
          {step.kind === 'section' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
              {(run.outlineItems || []).map((item, i) => {
                const sec = run.sectionOutputs?.[String(i)];
                return (
                  <div key={i} style={{ border: '1px solid var(--border-subtle)', borderRadius: 6, padding: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: sec ? 4 : 0 }}>
                      <span style={{ fontSize: 10, color: 'var(--color-brand-indigo)', fontWeight: 700 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item}
                        </span>
                        {sec && (
                          <span style={{ display: 'block', fontSize: 9, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                            {sec.replace(/[#*`]/g, '').trim().slice(0, 45)}…
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => onExecuteSection?.(i)}
                        disabled={isRunning}
                        style={{
                          fontSize: 10, padding: '2px 6px', borderRadius: 4,
                          border: '1px solid var(--border-subtle)',
                          backgroundColor: sec ? 'var(--bg-main)' : 'var(--color-brand-indigo)',
                          color: sec ? 'var(--text-secondary)' : '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        {sec ? '重生成' : '生成'}
                      </button>
                    </div>
                    {sec && (
                      <textarea
                        value={sec}
                        onChange={(e) => {
                          const so = { ...(run.sectionOutputs || {}) };
                          so[String(i)] = e.target.value;
                          onPatch({ sectionOutputs: so });
                        }}
                        rows={4}
                        style={{
                          width: '100%', fontSize: 11, padding: 4,
                          backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-subtle)',
                          borderRadius: 4, color: 'var(--text-secondary)',
                          outline: 'none', resize: 'vertical',
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* draft / polish：内容直接写入文档，面板只显示状态提示 */}
          {(step.kind === 'draft' || step.kind === 'polish') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {/* polish 功能复选框 */}
              {step.kind === 'polish' && (
                <div style={{
                  borderRadius: 8, border: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-main)', overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '7px 10px', fontSize: 10, fontWeight: 600,
                    color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)',
                  }}>
                    润色功能（可多选）
                  </div>
                  <div style={{ padding: '6px 4px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {POLISH_OPTIONS.map((opt) => {
                      const selected = (run.polishOptions ?? []).includes(opt.id);
                      return (
                        <label
                          key={opt.id}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 8,
                            padding: '6px 8px', borderRadius: 6, cursor: isRunning ? 'default' : 'pointer',
                            backgroundColor: selected ? 'rgba(99,102,241,0.06)' : 'transparent',
                            transition: 'background 0.15s',
                          }}
                        >
                          <div
                            onClick={() => {
                              if (isRunning) return;
                              const cur = run.polishOptions ?? [];
                              const next = selected ? cur.filter((id) => id !== opt.id) : [...cur, opt.id];
                              onPatch({ polishOptions: next });
                            }}
                            style={{
                              width: 14, height: 14, borderRadius: 4, flexShrink: 0, marginTop: 1,
                              border: `1.5px solid ${selected ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
                              backgroundColor: selected ? 'var(--color-brand-indigo)' : 'transparent',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              cursor: isRunning ? 'default' : 'pointer',
                              transition: 'all 0.15s',
                            }}
                          >
                            {selected && <Check size={9} color="#fff" strokeWidth={3} />}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: selected ? 'var(--color-brand-indigo)' : 'var(--text-primary)' }}>
                              {opt.label}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, lineHeight: 1.4 }}>
                              {opt.description}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* 状态提示 */}
              <div style={{
                padding: '9px 12px', borderRadius: 6,
                backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-subtle)',
                fontSize: 11, color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {isRunning ? (
                  <><Loader2 size={12} className="animate-spin" style={{ flexShrink: 0 }} /> 正在写入文档…</>
                ) : run.status === 'done' ? (
                  <><Check size={12} style={{ color: '#10B981', flexShrink: 0 }} /> 已写入文档</>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>执行后内容将直接写入文档</span>
                )}
              </div>
            </div>
          )}

          {/* brainstorm：textarea 可编辑 */}
          {step.kind === 'brainstorm' && (
            <textarea
              value={run.output}
              onChange={(e) => onPatch({ output: e.target.value })}
              disabled={isRunning}
              rows={6}
              placeholder={isRunning ? '正在生成...' : '尚未生成，可点击"执行"'}
              style={{
                width: '100%',
                fontSize: 12,
                padding: 8,
                marginTop: 8,
                backgroundColor: 'var(--bg-main)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                color: 'var(--text-primary)',
                lineHeight: 1.5,
                outline: 'none',
                resize: 'vertical',
              }}
            />
          )}

          {/* custom：只读输出区域，带复制 + 预览（HTML）按钮（排除有专属 UI 的步骤；无输出时不渲染） */}
          {step.kind === 'custom' && step.id !== 'illustrations' && step.id !== 'wechat_html' && (run.output || isRunning) && (
            <div style={{ marginTop: 8, position: 'relative' }}>
              {run.output && (
                <div style={{
                  position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 1,
                }}>
                  <button
                    title="复制全部"
                    onClick={() => navigator.clipboard.writeText(run.output)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 3,
                      padding: '3px 7px', borderRadius: 4, border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)',
                      fontSize: 10, cursor: 'pointer', lineHeight: 1,
                    }}
                  >
                    <Copy size={10} /> 复制
                  </button>
                  {step.id === 'wechat_html' && (
                    <button
                      title="在新窗口预览 HTML"
                      onClick={() => {
                        const blob = new Blob([run.output], { type: 'text/html;charset=utf-8' });
                        window.open(URL.createObjectURL(blob), '_blank');
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        padding: '3px 7px', borderRadius: 4, border: '1px solid var(--border-subtle)',
                        backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)',
                        fontSize: 10, cursor: 'pointer', lineHeight: 1,
                      }}
                    >
                      <ExternalLink size={10} /> 预览
                    </button>
                  )}
                </div>
              )}
              <textarea
                value={run.output}
                readOnly
                rows={8}
                placeholder={isRunning ? '正在生成...' : '尚未生成，可点击"执行"'}
                style={{
                  width: '100%',
                  fontSize: 11,
                  padding: '8px 8px 8px 8px',
                  backgroundColor: 'var(--bg-main)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  color: 'var(--text-primary)',
                  lineHeight: 1.6,
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: step.id === 'wechat_html' ? 'monospace' : 'inherit',
                }}
              />
            </div>
          )}

          {/* ── illustrations：按图分卡片，含复制按钮 ── */}
          {step.id === 'illustrations' && step.kind === 'custom' && (() => {
            // 尝试解析 JSON，降级到纯文本
            let items: { n: number; position: string; prompt: string }[] = [];
            try {
              const cleaned = run.output.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim();
              items = JSON.parse(cleaned);
            } catch (_) { /* fall through */ }

            if (items.length === 0) {
              // 尚未执行：不渲染任何内容
              if (!run.output) return null;
              // 有输出但无法解析为结构化 JSON：降级为纯文本只读区
              return (
                <div style={{ marginTop: 8, position: 'relative' }}>
                  <button onClick={() => navigator.clipboard.writeText(run.output)}
                    style={{ position: 'absolute', top: 8, right: 8, zIndex: 1, display: 'flex', alignItems: 'center', gap: 3, padding: '3px 7px', borderRadius: 4, border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', fontSize: 10, cursor: 'pointer' }}>
                    <Copy size={10} /> 复制
                  </button>
                  <textarea value={run.output} readOnly rows={8}
                    placeholder={isRunning ? '正在生成...' : ''}
                    style={{ width: '100%', fontSize: 11, padding: 8, backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)', lineHeight: 1.6, outline: 'none', resize: 'vertical' }} />
                </div>
              );
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                {items.map((img) => {
                  const key = String(img.n);
                  const genImg = run.illustrationImages?.[key];
                  const loading = run.illustrationLoading?.[key] ?? false;
                  return (
                    <div key={img.n} style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', backgroundColor: 'var(--bg-main)' }}>
                      {/* 标题行 */}
                      <div style={{ padding: '6px 10px', backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Image size={11} color="var(--color-brand-indigo)" />
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-brand-indigo)' }}>插图 {img.n}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {img.position}</span>
                        <button
                          onClick={() => navigator.clipboard.writeText(img.prompt)}
                          title="复制提示词"
                          style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)', color: 'var(--text-muted)', fontSize: 9, cursor: 'pointer', flexShrink: 0 }}
                        >
                          <Copy size={9} /> 复制
                        </button>
                        {/* 生成 / 刷新按钮 */}
                        {onGenerateImage && (
                          <button
                            disabled={loading}
                            onClick={async () => {
                              onPatch({ illustrationLoading: { ...run.illustrationLoading, [key]: true } });
                              try {
                                const result = await onGenerateImage(img.prompt);
                                onPatch({
                                  illustrationImages: { ...run.illustrationImages, [key]: result },
                                  illustrationLoading: { ...run.illustrationLoading, [key]: false },
                                });
                              } catch {
                                onPatch({ illustrationLoading: { ...run.illustrationLoading, [key]: false } });
                              }
                            }}
                            title={genImg ? '重新生成' : '生成图片'}
                            style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-main)', color: 'var(--color-brand-indigo)', fontSize: 9, cursor: loading ? 'default' : 'pointer', flexShrink: 0, opacity: loading ? 0.6 : 1 }}
                          >
                            {loading ? <Loader2 size={9} className="animate-spin" /> : genImg ? <RotateCcw size={9} /> : <Play size={9} />}
                            {loading ? '生成中' : genImg ? '刷新' : '生图'}
                          </button>
                        )}
                      </div>
                      {/* 提示词 */}
                      <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>
                        {img.prompt}
                      </div>
                      {/* 已生成图片 */}
                      {genImg && (
                        <div style={{ position: 'relative', margin: '0 10px 8px' }}>
                          <img
                            src={genImg.url}
                            alt={`插图 ${img.n}`}
                            style={{ width: '100%', borderRadius: 6, display: 'block', maxHeight: 200, objectFit: 'cover', cursor: 'pointer' }}
                            onClick={() => setLightboxSrc(genImg.url)}
                          />
                          <button
                            onClick={() => setLightboxSrc(genImg.url)}
                            title="放大"
                            style={{ position: 'absolute', bottom: 5, left: 5, width: 22, height: 22, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <ZoomIn size={11} color="#fff" />
                          </button>
                        </div>
                      )}
                      {loading && !genImg && (
                        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Loader2 size={20} color="var(--text-muted)" className="animate-spin" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ── wechat_html：主题卡片 + 颜色选择 + 预览输出 ── */}
          {step.id === 'wechat_html' && (() => {
            const THEMES = [
              { id: 'default', label: '标准简洁', desc: '清晰层次，蓝色强调', accent: '#3d7de0' },
              { id: 'grace', label: '优雅精致', desc: '细腻排版，留白充足', accent: '#7c6ef0' },
              { id: 'simple', label: '极简白',  desc: '纯净底色，内容优先', accent: '#64748b' },
              { id: 'modern', label: '现代商务', desc: '深色标题，商务感强', accent: '#0f172a' },
            ];
            const COLORS = [
              { id: 'blue', hex: '#3d7de0' }, { id: 'green', hex: '#10b981' },
              { id: 'purple', hex: '#8b5cf6' }, { id: 'red', hex: '#ef4444' },
              { id: 'orange', hex: '#f97316' }, { id: 'black', hex: '#1a1a1a' },
            ];
            const theme = run.publishTheme ?? 'default';
            const color = run.publishColor ?? 'blue';

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                {/* 主题选择 */}
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>排版主题</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {THEMES.map((t) => {
                    const sel = theme === t.id;
                    return (
                      <div key={t.id} onClick={() => !isRunning && onPatch({ publishTheme: t.id })}
                        style={{ padding: '10px 12px', borderRadius: 10, cursor: 'pointer', position: 'relative',
                          border: `2px solid ${sel ? t.accent : 'var(--border-subtle)'}`,
                          backgroundColor: sel ? `${t.accent}14` : 'var(--bg-main)',
                          transition: 'all 0.15s' }}>
                        {/* 选中角标 */}
                        {sel && (
                          <div style={{ position: 'absolute', top: 6, right: 6, width: 14, height: 14, borderRadius: '50%', backgroundColor: t.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: '#fff', fontSize: 9, lineHeight: 1 }}>✓</span>
                          </div>
                        )}
                        {/* 主题示意图 */}
                        <div style={{ height: 28, borderRadius: 4, marginBottom: 6, background: `linear-gradient(135deg, ${t.accent}cc, ${t.accent}55)`, display: 'flex', alignItems: 'center', padding: '0 6px', gap: 4 }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
                          <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.5)', borderRadius: 2 }} />
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: sel ? t.accent : 'var(--text-primary)', marginBottom: 2 }}>{t.label}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{t.desc}</div>
                      </div>
                    );
                  })}
                </div>

                {/* 颜色选择 */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>主题色</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {COLORS.map((c) => {
                      const colorSel = color === c.id;
                      return (
                        <div key={c.id} onClick={() => !isRunning && onPatch({ publishColor: c.id })}
                          style={{ position: 'relative', width: 26, height: 26, borderRadius: '50%', backgroundColor: c.hex, cursor: 'pointer',
                            boxShadow: colorSel ? `0 0 0 2.5px var(--bg-main), 0 0 0 5px ${c.hex}` : `0 0 0 1.5px transparent`,
                            transform: colorSel ? 'scale(1.15)' : 'scale(1)',
                            transition: 'all 0.15s', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {colorSel && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1, fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 排版输出区域 */}
                {isRunning && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    正在生成排版 HTML，内容较长请耐心等待…
                  </div>
                )}
                {!isRunning && run.output && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => navigator.clipboard.writeText(run.output)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px 0', borderRadius: 6, border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
                    >
                      <Copy size={12} /> 复制 HTML
                    </button>
                    <button
                      onClick={() => {
                        const blob = new Blob([run.output], { type: 'text/html;charset=utf-8' });
                        window.open(URL.createObjectURL(blob), '_blank');
                      }}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px 0', borderRadius: 6, border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
                    >
                      <ExternalLink size={12} /> 预览效果
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* cover 类：单张封面图 + 放大 + 刷新 */}
          {step.kind === 'cover' && (
            <div style={{ padding: '8px 0' }}>
              {run.status === 'running' && (
                <div style={{
                  width: '100%', aspectRatio: '16/9', borderRadius: 8,
                  backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}>
                  <Loader2 size={20} color="var(--text-muted)" className="animate-spin" />
                </div>
              )}
              {run.status !== 'running' && run.coverImages && run.coverImages.length > 0 && (
                <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                  <img
                    src={run.coverImages[0].url}
                    alt="封面图"
                    style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', display: 'block' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  {/* 放大 */}
                  <button
                    onClick={() => setLightboxSrc(run.coverImages![0].url)}
                    title="放大预览"
                    style={{
                      position: 'absolute', bottom: 6, left: 6,
                      width: 24, height: 24, borderRadius: 5,
                      backgroundColor: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <ZoomIn size={12} color="#fff" />
                  </button>
                  {/* 刷新 */}
                  <button
                    onClick={onExecute}
                    title="重新生成"
                    disabled={isRunning}
                    style={{
                      position: 'absolute', bottom: 6, right: 6,
                      width: 24, height: 24, borderRadius: 5,
                      backgroundColor: 'rgba(0,0,0,0.55)', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: isRunning ? 0.5 : 1,
                    }}
                  >
                    <RotateCcw size={11} color="#fff" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 操作按钮 */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {isRunning ? (
              <button
                onClick={onStop}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 6,
                  border: '1px solid rgba(255,71,87,0.3)',
                  backgroundColor: 'rgba(255,71,87,0.1)',
                  color: '#ff4757', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}
              >
                <Loader2 size={12} className="animate-spin" /> 停止
              </button>
            ) : (
              <>
                <button
                  onClick={onExecute}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 6,
                    border: 'none',
                    background: 'var(--brand-gradient)',
                    color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}
                >
                  {run.status === 'done' ? <RotateCcw size={12} /> : <Play size={12} />}
                  {run.status === 'done' ? '重跑' : (step.kind === 'cover' && run.coverImages?.length ? '换一批' : step.id === 'wechat_html' ? '生成预览' : '执行')}
                </button>
                {step.optional && run.status !== 'skipped' && (
                  <button
                    onClick={onSkip}
                    style={{
                      padding: '6px 10px', borderRadius: 6,
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <SkipForward size={11} /> 跳过
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, cursor: 'zoom-out',
          }}
        >
          <button
            onClick={() => setLightboxSrc(null)}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,0.1)', border: 'none',
              borderRadius: '50%', width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#fff',
            }}
          >
            <X size={18} />
          </button>
          <img
            src={lightboxSrc}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '90vh',
              borderRadius: 12, objectFit: 'contain',
              boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
              cursor: 'default',
            }}
          />
        </div>
      )}
    </div>
  );
};
