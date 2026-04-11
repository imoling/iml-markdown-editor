import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Extension } from '@tiptap/core';
import { EditorContent, useEditor, BubbleMenu, FloatingMenu } from '@tiptap/react';
import { DOMSerializer } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { ListItem } from '@tiptap/extension-list-item';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { TextAlign } from '@tiptap/extension-text-align';
import { all, createLowlight } from 'lowlight';
import { 
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Sigma, 
  Table as TableIcon, Image as ImageIcon, Plus, Trash2, Columns, Rows, LayoutGrid,
  Type, ListOrdered, List, SquareCheck, Quote, Minus, Link as LinkIcon,
  Sparkles, Wand2, FileText, FastForward, Loader2, BrainCircuit,
  Activity, FileCode, Send, BookOpen,
  Trophy, AlignLeft, AlignCenter, AlignRight, RotateCcw
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { markdownToHtml, htmlToMarkdown } from '../../utils/markdown';
import { MathExtension } from '../../extensions/MathExtension';
import { DiagramExtension } from '../../extensions/DiagramExtension';
import { SVGExtension } from '../../extensions/SVGExtension';
import { Editor } from '@tiptap/core';
import { useAI } from '../../hooks/useAI';
import { AIPalette } from '../AI/AIPalette';
import '../styles/editor.css';

const lowlight = createLowlight(all);

interface PromptDialogProps {
  title: string;
  fields: { name: string; label: string; defaultValue: string; type?: string }[];
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
}

const PromptDialog: React.FC<PromptDialogProps> = ({ title, fields, onConfirm, onCancel }) => {
  const [values, setValues] = React.useState<Record<string, string>>(
    fields.reduce((acc, f) => ({ ...acc, [f.name]: f.defaultValue }), {})
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.2)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-page)',
        padding: '24px',
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2), 0 0 0 1px var(--border-subtle)',
        width: '320px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{title}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {fields.map(field => (
            <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{field.label}</label>
              <input
                type={field.type || 'text'}
                autoFocus={fields[0].name === field.name}
                value={values[field.name]}
                onChange={e => setValues({ ...values, [field.name]: e.target.value })}
                onKeyDown={e => {
                  if (e.key === 'Enter') onConfirm(values);
                  if (e.key === 'Escape') onCancel();
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-strong)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  fontSize: 14
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button 
            onClick={onCancel}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
              backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer',
              fontSize: 14, fontWeight: 500
            }}
          >取消</button>
          <button 
            onClick={() => onConfirm(values)}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
              backgroundColor: 'var(--color-accent-indigo)', color: 'white', cursor: 'pointer',
              fontSize: 14, fontWeight: 500
            }}
          >确定</button>
        </div>
      </div>
    </div>
  );
};

// ── 图片插入对话框 ─────────────────────────────────────────────────────────────
interface ImageInsertDialogProps {
  onConfirm: (src: string, alt: string) => void;
  onCancel: () => void;
}

const ImageInsertDialog: React.FC<ImageInsertDialogProps> = ({ onConfirm, onCancel }) => {
  const imageGenConfig = useAppStore((s) => s.imageGenConfig);
  const [tab, setTab] = React.useState<'upload' | 'url' | 'ai'>('upload');
  const [url, setUrl] = React.useState('');
  const [alt, setAlt] = React.useState('');
  const [preview, setPreview] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // AI 生成状态
  const [aiPrompt, setAiPrompt] = React.useState('');
  const [aiImages, setAiImages] = React.useState<{ url: string; localPath: string }[]>([]);
  const [aiSelected, setAiSelected] = React.useState<number | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState('');
  const [lightboxSrc, setLightboxSrc] = React.useState<string | null>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      if (!alt) setAlt(file.name.replace(/\.[^.]+$/, ''));
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleGenerate = async () => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true);
    setAiError('');
    setAiImages([]);
    setAiSelected(null);
    try {
      const cfg = { ...imageGenConfig, source: 'generate' as const };
      const results: { url: string; localPath: string }[] = await (window as any).api.ai.getCoverImages({
        query: aiPrompt.trim(),
        vibe: aiPrompt.trim(),
        config: cfg,
      });
      setAiImages(results);
      if (results.length > 0) setAiSelected(0);
    } catch (err: any) {
      setAiError(err.message || '生成失败，请检查 API Key 配置');
    } finally {
      setAiLoading(false);
    }
  };

  const handleConfirm = () => {
    if (tab === 'upload' && preview) { onConfirm(preview, alt.trim()); return; }
    if (tab === 'url' && url.trim()) { onConfirm(url.trim(), alt.trim()); return; }
    if (tab === 'ai' && aiSelected !== null && aiImages[aiSelected]) {
      onConfirm(aiImages[aiSelected].url, alt.trim() || aiPrompt.trim());
    }
  };

  const canConfirm =
    tab === 'upload' ? !!preview :
    tab === 'url' ? !!url.trim() :
    aiSelected !== null && aiImages.length > 0;

  const TABS = [
    { id: 'upload' as const, label: '本地上传' },
    { id: 'url' as const, label: '网络链接' },
    { id: 'ai' as const, label: 'AI 生成' },
  ];

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        backgroundColor: 'var(--bg-page)', borderRadius: 18,
        boxShadow: '0 24px 48px rgba(0,0,0,0.22), 0 0 0 1px var(--border-subtle)',
        width: 440, display: 'flex', flexDirection: 'column', gap: 0,
        overflow: 'hidden', animation: 'scaleIn 0.22s cubic-bezier(0.16,1,0.3,1)',
      }}>
        {/* 头部 */}
        <div style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>插入图片</h3>
          {/* Tabs */}
          <div style={{
            display: 'flex', backgroundColor: 'var(--bg-surface)',
            borderRadius: 8, padding: 3, gap: 2,
          }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
                  backgroundColor: tab === t.id ? 'var(--bg-page)' : 'transparent',
                  color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                  boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* 内容区 */}
        <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tab === 'upload' && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragging ? 'var(--color-brand-indigo)' : 'var(--border-subtle)'}`,
                  borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
                  backgroundColor: dragging ? 'rgba(99,102,241,0.04)' : 'var(--bg-surface)',
                  overflow: 'hidden', minHeight: 140,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {preview ? (
                  <img src={preview} alt="preview" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', display: 'block' }} />
                ) : (
                  <div style={{ textAlign: 'center', padding: 24 }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🖼️</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>点击选择或拖拽图片到此处</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>支持 JPG、PNG、GIF、WebP</div>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </>
          )}

          {tab === 'url' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>图片 URL</label>
              <input
                autoFocus type="url" value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) handleConfirm(); if (e.key === 'Escape') onCancel(); }}
                placeholder="https://example.com/image.jpg"
                style={{ padding: '9px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--border-strong)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none' }}
              />
              {url.trim() && (
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', backgroundColor: 'var(--bg-surface)', maxHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={url.trim()} alt="preview" style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain', display: 'block' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}
            </div>
          )}

          {tab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  autoFocus
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); if (e.key === 'Escape') onCancel(); }}
                  placeholder="描述你想要的图片…"
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--border-strong)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none' }}
                />
                <button
                  onClick={handleGenerate}
                  disabled={!aiPrompt.trim() || aiLoading}
                  style={{
                    padding: '9px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600, cursor: aiLoading || !aiPrompt.trim() ? 'not-allowed' : 'pointer',
                    background: aiLoading || !aiPrompt.trim() ? 'var(--border-subtle)' : 'var(--brand-gradient)',
                    color: aiLoading || !aiPrompt.trim() ? 'var(--text-muted)' : '#fff',
                    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0,
                    boxShadow: aiLoading || !aiPrompt.trim() ? 'none' : '0 3px 10px var(--brand-shadow)',
                  }}
                >
                  {aiLoading ? <><Loader2 size={13} className="animate-spin" /> 生成中</> : <><Sparkles size={13} /> 生成</>}
                </button>
              </div>

              {/* 单张图片预览 */}
              {aiLoading && aiImages.length === 0 && (
                <div style={{ width: '100%', aspectRatio: '16/9', borderRadius: 10, backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 size={20} className="animate-spin" color="var(--text-muted)" />
                </div>
              )}

              {aiImages.length > 0 && (
                <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                  <img src={aiImages[0].url} alt="生成图" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  {/* 左下角：放大 */}
                  <button
                    onClick={() => setLightboxSrc(aiImages[0].url)}
                    title="查看大图"
                    style={{
                      position: 'absolute', bottom: 8, left: 8,
                      width: 28, height: 28, borderRadius: 6, border: 'none',
                      backgroundColor: 'rgba(0,0,0,0.5)', color: 'white',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1h4M1 1v4M13 1h-4M13 1v4M1 13h4M1 13v-4M13 13h-4M13 13v-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  </button>
                  {/* 右下角：重新生成 */}
                  <button
                    onClick={handleGenerate}
                    title="重新生成"
                    style={{
                      position: 'absolute', bottom: 8, right: 8,
                      width: 28, height: 28, borderRadius: 6, border: 'none',
                      backgroundColor: 'rgba(0,0,0,0.5)', color: 'white',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              )}

              {aiError && (
                <div style={{ fontSize: 11, color: '#ff4757', padding: '8px 10px', borderRadius: 6, backgroundColor: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.15)' }}>
                  {aiError}
                </div>
              )}

              {!aiLoading && aiImages.length === 0 && !aiError && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                  {!imageGenConfig.apiKey ? (
                    <span style={{ color: '#f97316' }}>
                      需先配置 API Key<br />
                      <span style={{ fontSize: 10 }}>智能菜单（右键编辑区）→ 图片生成配置 → 选择提供商并填入 Key</span>
                    </span>
                  ) : (
                    <>输入描述后点击「生成」<br />
                    <span style={{ fontSize: 10 }}>当前提供商：{imageGenConfig.provider}　可在智能菜单 → 图片生成配置中切换</span></>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Alt text（AI 生成 tab 时隐藏，使用 prompt 作为 alt） */}
          {tab !== 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                图片描述 <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(可选)</span>
              </label>
              <input
                type="text" value={alt}
                onChange={(e) => setAlt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) handleConfirm(); if (e.key === 'Escape') onCancel(); }}
                placeholder="图片说明文字"
                style={{ padding: '9px 12px', borderRadius: 8, fontSize: 13, border: '1px solid var(--border-strong)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', outline: 'none' }}
              />
            </div>
          )}

          {/* 按钮 */}
          <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
            <button
              onClick={onCancel}
              style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border-subtle)', backgroundColor: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
            >取消</button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              style={{
                flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                background: canConfirm ? 'var(--color-accent-indigo)' : 'var(--border-subtle)',
                color: canConfirm ? 'white' : 'var(--text-muted)',
                cursor: canConfirm ? 'pointer' : 'not-allowed',
                fontSize: 14, fontWeight: 500, transition: 'all 0.15s',
              }}
            >插入</button>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.15s ease-out', cursor: 'zoom-out',
          }}
        >
          <img
            src={lightboxSrc}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain',
              borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              animation: 'scaleIn 0.2s cubic-bezier(0.16,1,0.3,1)',
              cursor: 'default',
            }}
          />
          <button
            onClick={() => setLightboxSrc(null)}
            style={{
              position: 'absolute', top: 20, right: 20, width: 36, height: 36,
              borderRadius: '50%', border: 'none', backgroundColor: 'rgba(255,255,255,0.15)',
              color: 'white', cursor: 'pointer', fontSize: 18, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >×</button>
        </div>
      )}
    </div>
  );
};

interface StyleSelectorProps {
  onSelect: (style: string) => void;
  onCancel: () => void;
}

const StyleSelector: React.FC<StyleSelectorProps> = ({ onSelect, onCancel }) => {
  const styles = [
    { id: 'professional', label: '专业 (Professional)', desc: '正式、稳重，适合文档和汇报', color: 'var(--color-accent-indigo)' },
    { id: 'literary', label: '文学 (Literary)', desc: '优美、感性，适合随感和创作', color: 'var(--color-accent-green)' },
    { id: 'concise', label: '简洁 (Concise)', desc: '精炼、直接，拒绝冗余', color: 'var(--color-accent-orange)' },
    { id: 'humorous', label: '幽默 (Humorous)', desc: '风趣、亲和，适合社交分享', color: 'var(--color-accent-red)' }
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.2)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      animation: 'fadeIn 0.15s ease-out'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-page)',
        padding: '20px',
        borderRadius: '20px',
        boxShadow: '0 24px 48px rgba(0,0,0,0.3), 0 0 0 1px var(--border-subtle)',
        width: '360px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>选择润色风格</h3>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
            <Trash2 size={18} />
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {styles.map(s => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-surface)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
                gap: 2
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                e.currentTarget.style.borderColor = s.color;
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
                e.currentTarget.style.transform = 'none';
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: s.color }}>{s.label}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * 对 Markdown 中同级别的编号标题/条目进行重新排序。
 * 支持多种格式：
 *   - "### 1. 标题"（ATX标题 + 编号）
 *   - "1. 标题"（纯编号行，非列表上下文）
 *   - "**1. 标题**"（加粗编号）
 * 按照同一格式前缀的连续编号分组，重新排序。
 */
function renumberHeadings(md: string): string {
  const lines = md.split('\n');
  
  // 编号行正则：捕获前缀（#、空白等）和数字
  // Group 1: prefix (e.g. "### " or "**" or "")
  // Group 2: the number
  // Group 3: suffix after number (e.g. ". " or ". **")
  const numberedLineRegex = /^(#{1,6}\s+|\*\*)?(\d+)(\.[\s])/;
  
  let i = 0;
  while (i < lines.length) {
    const match = lines[i].match(numberedLineRegex);
    if (match) {
      const prefix = match[1] || '';  // e.g. "### " or "**" or ""
      const groupStart = i;
      let counter = parseInt(match[2]);
      
      // Scan consecutive same-prefix numbered lines
      while (i < lines.length) {
        const m = lines[i].match(numberedLineRegex);
        if (m && (m[1] || '') === prefix) {
          if (i === groupStart) {
            counter = parseInt(m[2]); // Start from the first number in the group
          } else {
            counter++;
          }
          // Replace only the number, preserving everything else
          lines[i] = lines[i].replace(numberedLineRegex, `${prefix}${counter}$3`);
          i++;
          // Skip non-numbered lines (body text, lists, blank lines under this heading)
          while (i < lines.length) {
            const nextMatch = lines[i].match(numberedLineRegex);
            if (nextMatch && (nextMatch[1] || '') === prefix) break; // Same-level numbered line
            // If it's a different heading level, break out of the group
            if (lines[i].match(/^#{1,6}\s/) && !lines[i].match(numberedLineRegex)) break;
            i++;
          }
        } else {
          break;
        }
      }
    } else {
      i++;
    }
  }
  
  const result = lines.join('\n');
  console.log('[renumberHeadings] applied:', result !== md ? 'YES, fixed numbering' : 'no changes needed');
  return result;
}

const CustomHeadingEnter = Extension.create({
  name: 'customHeadingEnter',
  priority: 1000, // Highest priority to ensure it runs before StarterKit's Heading/ListItem
  addKeyboardShortcuts() {
    const handleHeadingSplit = (editor: any, isMod: boolean) => {
      const { state } = editor;
      const { selection } = state;
      const { $from, empty } = selection;

      if (!empty) return false;

      const parentNode = $from.parent;
      if (parentNode.type.name !== 'heading') return false;

      // 如果用户在空的 heading 里按键盘，放行
      if (parentNode.textContent.trim() === '') return false;

      const grandParent = $from.node(-1);
      if (!grandParent || (grandParent.type.name !== 'listItem' && grandParent.type.name !== 'taskItem')) return false;

      const level = parentNode.attrs.level;
      
      // Execute splitListItem
      const success = editor.chain().splitListItem(grandParent.type.name).run();
      
      if (success) {
        // 如果是 Cmd+Enter，将新产生的段落强行转换为刚才的同级标题
        if (isMod) {
          editor.chain().setNode('heading', { level }).run();
          console.log('[CustomHeadingEnter] Cmd+Enter triggered: spawned same-level heading');
        } else {
          // 如果是普通的 Enter，我们不仅要劈开，还要强制它跳出列表（剥离），成为一干二净的纯文本！
          editor.chain().liftListItem(grandParent.type.name).run();
          console.log('[CustomHeadingEnter] Normal Enter triggered: extracted to pure paragraph outside list');
        }
        return true;
      }

      return false;
    };

    return {
      'Mod-Enter': ({ editor }) => handleHeadingSplit(editor, true),
      Enter: ({ editor }) => handleHeadingSplit(editor, false)
    };
  }
});

export const TiptapEditor: React.FC = () => {
  const { 
    activeTabId, tabs, updateTabContent, openTab, navigationRequest, setAIStatus, zoom,
    sidebarTab, 
    setSidebarTab,
    outline,
  } = useAppStore();
  const activeTab = tabs.find(t => t.id === activeTabId);
  const [prompt, setPrompt] = React.useState<PromptDialogProps | null>(null);
  const [showImageDialog, setShowImageDialog] = React.useState(false);
  const { generate, stop, loading: aiLoading } = useAI();
  const [aiGenerating, setAiGenerating] = useState(false);
  const [showStyleSelector, setShowStyleSelector] = React.useState(false);
  const [showAIPalette, setShowAIPalette] = useState(false);
  const [palettePos, setPalettePos] = useState<{ top: number; left: number } | null>(null);
  // 触发气泡时立即缓存光标前后的文本，避免提交时编辑器失焦导致位置丢失
  const [paletteContext, setPaletteContext] = useState<{ before: string; after: string }>({ before: '', after: '' });
  const [docSnapshot, setDocSnapshot] = useState<string | null>(null);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const lastActiveTabIdRef = useRef<string | null>(null);
  const editorRef = useRef<any>(null);
  const activeTabIdRef = useRef<string | null>(null);
  // Tracks the previous editor instance to detect fresh mounts (e.g. after mode switch)
  const prevEditorRef = useRef<ReturnType<typeof useEditor> | null>(null);
  // Tracks previous activeTabId for the content-sync effect, to detect tab switches
  const prevSyncTabIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeTabIdRef.current = activeTabId;
  }, [activeTabId]);

  const editor = useEditor({
    extensions: [
      CustomHeadingEnter,
      StarterKit.configure({
        codeBlock: false, 
        listItem: false,
      }), 
      ListItem.extend({
        content: 'block+',
      }),
      Image.configure({ allowBase64: true }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      CodeBlockLowlight.configure({
        lowlight,
      }),
      MathExtension,
      DiagramExtension,
      SVGExtension,
      TaskList,
      TaskItem.extend({
        content: 'block+',
      }).configure({
        nested: true,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph', 'tableCell', 'tableHeader'],
      }),
      Placeholder.configure({
        placeholder: '在此开始你的写作...',
      })
    ],
    content: activeTab ? markdownToHtml(activeTab.content) : '',
    editorProps: {
      attributes: {
        class: 'tiptap-prosemirror',
      },
      handleDoubleClick: (view, pos, event) => {
        const coords = { left: event.clientX, top: event.clientY };
        const result = view.posAtCoords(coords);
        if (!result) return false;

        const { state } = view;
        let nodePos = result.inside;
        // 如果 inside 为 -1，说明点在了顶级（直接的 doc 子节点之间），我们尝试探测 pos
        if (nodePos === -1) {
          const $pos = state.doc.resolve(pos);
          nodePos = $pos.before();
        }

        if (nodePos < 0) return false;

        const targetEl = event.target as HTMLElement;
        const inTable = targetEl.closest('td') || targetEl.closest('th');

        // 绝对免疫：避免劫持正常的代码高亮选词和独立按键的双击
        if (targetEl.closest('.cm-editor') || targetEl.closest('button') || targetEl.closest('input')) {
          return false;
        }

        // 如果在表格里，只有直接点击在非常靠近边缘的 td/th 留白处时，才作为触发（保护里面的普通文本段落双击）
        if (inTable) {
          if (targetEl.tagName.toLowerCase() === 'p' || targetEl.tagName.toLowerCase() === 'span') {
            return false; // 点到文字本身，不要劫持
          }
          const tableEl = targetEl.closest('table');
          if (tableEl) {
             const rect = tableEl.getBoundingClientRect();
             // 只有点击在整个表格绝对上下边缘的 30px 内，才认为是意图“插在表格外”。否则放行。
             const isTopEdge = event.clientY < rect.top + 30;
             const isBottomEdge = event.clientY > rect.bottom - 30;
             if (!isTopEdge && !isBottomEdge) {
                return false;
             }
          }
        }
        
        const node = state.doc.nodeAt(nodePos);
        if (!node) return false;

        // 我们关心的富容器：diagram (mermaid), svgBlock (svg拓展), image, table
        const blockTypes = ['diagram', 'svgBlock', 'image', 'table'];
        
        // 向上层层追溯，看看点击究竟属于哪个块级容器
        let targetNode = node;
        let targetPos = nodePos;
        
        if (!blockTypes.includes(node.type.name)) {
          const $resolved = state.doc.resolve(pos);
          for (let depth = $resolved.depth; depth > 0; depth--) {
            const ancestor = $resolved.node(depth);
            if (blockTypes.includes(ancestor.type.name)) {
              targetNode = ancestor;
              targetPos = $resolved.before(depth);
              break;
            }
          }
        }

        if (blockTypes.includes(targetNode.type.name)) {
          const dom = view.nodeDOM(targetPos);
          if (dom instanceof HTMLElement) {
            const rect = dom.getBoundingClientRect();
            // 点击位置位于元素上半区还是下半区
            const isTopHalf = event.clientY < rect.top + rect.height / 2;
            
            // 确保不超过文档最大范围
            let insertPos = isTopHalf ? targetPos : targetPos + targetNode.nodeSize;
            insertPos = Math.min(insertPos, state.doc.content.size);
            
            // 创建段落并插入
            let tr = state.tr.insert(insertPos, state.schema.nodes.paragraph.create());
            
            // 计算新光标位置：段落开始标签之后，并强制使用 TextSelection 规避 GapCursor 横线
            const focusPos = insertPos + 1;
            const newSelection = TextSelection.create(tr.doc, focusPos);
            tr = tr.setSelection(newSelection);
            
            view.dispatch(tr);
            view.focus();
            
            return true;
          }
        }
        return false;
      },
      handleDrop: (view, event, slice, moved) => {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
             event.preventDefault();
             file.arrayBuffer().then(buffer => {
                window.api.fs.saveImage(activeTabId!, file.name, buffer).then(result => {
                    if (result.success && result.path) {
                        const { schema } = view.state;
                        const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                        const node = schema.nodes.image.create({ src: result.path });
                        const transaction = view.state.tr.insert(coordinates?.pos || view.state.selection.to, node);
                        view.dispatch(transaction);
                    }
                });
             });
             return true;
          }
        }
        return false;
      },
      handlePaste: (view, event, slice) => {
        if (event.clipboardData && event.clipboardData.files && event.clipboardData.files[0]) {
          const file = event.clipboardData.files[0];
          if (file.type.startsWith('image/')) {
             event.preventDefault();
             file.arrayBuffer().then(buffer => {
                window.api.fs.saveImage(activeTabId!, file.name, buffer).then(result => {
                    if (result.success && result.path) {
                        const { schema } = view.state;
                        const node = schema.nodes.image.create({ src: result.path });
                        const transaction = view.state.tr.replaceSelectionWith(node);
                        view.dispatch(transaction);
                    }
                });
             });
             return true;
          }
        }
        return false;
      }
    },
    onUpdate: ({ editor }) => {
      const currentTabId = activeTabIdRef.current;
      if (currentTabId) {
        const html = editor.getHTML();
        const hasDataImg = html.includes('data:image/');
        const markdown = htmlToMarkdown(html);
        const mdHasDataImg = markdown.includes('data:image/');
        if (hasDataImg && !mdHasDataImg) {
          console.warn('[Tiptap:onUpdate] htmlToMarkdown dropped data URL image, skipping sync');
          return;
        }
        if (!markdown && editor.state.doc.textContent.trim()) {
          console.warn('[Tiptap] htmlToMarkdown returned empty, skipping store sync to prevent data loss.');
          return;
        }
        updateTabContent(currentTabId, markdown);
      }
    },
  });

  // 光标移动时关闭 AI 面板（生成中不关闭）
  useEffect(() => {
    if (!editor || !showAIPalette) return;
    
    const handleSelectionUpdate = () => {
      if (aiGenerating) return; // 生成中不自动关闭
      setShowAIPalette(false);
      setPalettePos(null);
    };
    
    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor, showAIPalette, aiGenerating]);

  // 点击气泡外部或按 Escape 时关闭
  useEffect(() => {
    if (!showAIPalette) return;

    const handleMouseDown = (e: MouseEvent) => {
      const paletteEl = document.getElementById('ai-palette-portal');
      if (paletteEl && !paletteEl.contains(e.target as Node)) {
        setShowAIPalette(false);
        setPalettePos(null);
        editor?.chain().focus().run();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAIPalette(false);
        setPalettePos(null);
        editor?.chain().focus().run();
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAIPalette, editor]);

  const handleAIAction = async (action: 'polish' | 'summarize' | 'expand', style?: string) => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, ' ');
    if (!selectedText) return;

    if (action === 'polish' && !style) {
      setShowStyleSelector(true);
      return;
    }

    setShowStyleSelector(false);
    setAiGenerating(true);
    setAIStatus({ generating: true, onStop: handleAIPaletteStop });

    // 开启生成前保存文档快照，以便由于“停止”时回滚
    setDocSnapshot(editor.getHTML());
    const rid = Math.random().toString(36).substring(7);
    setActiveRequestId(rid);
    
    let systemPrompt = `您是一位卓越的文档编辑专家。
您的任务是根据用户的要求处理文本。
关键规则：
1. 仅返回处理后的正文结果。
2. 严禁包含任何前言、引言、解释说明、括号内的备注或修改日志。
3. 严禁包含任何如"好的，这是为您处理后的结果"之类的废话。
4. 如果用户要求润色，请直接给出润色后的文本。
5. 对于总结任务，请直接给出总结正文，不可包含"总结如下"等任何辅助性标签。`;

    let userPrompt = '';

    if (action === 'polish') {
      const stylePrompts: Record<string, string> = {
        professional: '使其更专业、稳重、正式，适合商务汇报。',
        literary: '使其更具文学美感、意蕴悠长，适合散文随感。',
        concise: '使其极其精炼、有力，剔除所有冗余词汇。',
        humorous: '使其风趣幽默、诙谐亲和，增加社交感染力。'
      };
      userPrompt = `请对以下文字进行【${style || '专业'}】风格的润色，${stylePrompts[style || 'professional']}\n\n文字内容：\n"${selectedText}"`;
    } else if (action === 'summarize') {
      userPrompt = `请为以下内容提供一个精炼、深度的总结：\n\n"${selectedText}"`;
    } else if (action === 'expand') {
      userPrompt = `请在保持文风一致的前提下，对以下内容进行深度扩写，增加细节：\n\n"${selectedText}"`;
    }

    try {
      let accumulated = '';
      const startPos = from;
      let currentPos = to;

      await generate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], (chunk) => {
        accumulated += chunk;
        const cleanAccumulated = accumulated.replace(/^(.*?)(如下[:：]|结果[:：]|总结[:：]|内容[:：])|^\s*/gi, '').trim();
        const html = markdownToHtml(cleanAccumulated);
        editor.chain()
          .focus()
          .insertContentAt({ from: startPos, to: currentPos }, html)
          .run();
        currentPos = editor.state.selection.to;
      }, rid);
    } catch (err: any) {
      console.error('AI Action Failed:', err);
    } finally {
      setAiGenerating(false);
      setAIStatus({ generating: false, onStop: null });
      setActiveRequestId(null);
      setDocSnapshot(null);
    }
  };

  const handleAIPaletteStop = () => {
    if (activeRequestId) {
      stop(activeRequestId);
      setActiveRequestId(null);
    }
    if (docSnapshot && editor) {
      editor.commands.setContent(docSnapshot);
      setDocSnapshot(null);
    }
    setAiGenerating(false);
    setAIStatus({ generating: false, onStop: null });
  };

  const insertMermaid = () => {
    if (!editor) return;
    editor.chain().focus().insertContent({
      type: 'diagram',
      attrs: {
        code: 'graph TD\n  A[开始] --> B{选择}\n  B -->|选项1| C[结果1]\n  B -->|选项2| D[结果2]'
      }
    }).run();
    setShowAIPalette(false);
    setPalettePos(null);
  };

  const insertSVG = () => {
    if (!editor) return;
    editor.chain().focus().insertContent({
      type: 'svgBlock',
      attrs: {
        code: '<svg width="100" height="100" viewBox="0 0 100 100">\n  <circle cx="50" cy="50" r="40" stroke="var(--color-brand-indigo)" stroke-width="3" fill="var(--bg-elevated)" />\n  <text x="50" y="55" font-size="12" text-anchor="middle" fill="var(--text-main)">SVG</text>\n</svg>'
      }
    }).run();
    setShowAIPalette(false);
    setPalettePos(null);
  };

  const handleToggleHeading = useCallback((level: number) => {
    if (!editor) return;
    const isActive = editor.isActive('heading', { level });
    // Tiptap 的 toggleHeading() 命令有时会调用 clearNodes()，从而意外拔除包裹在外层的 list 节点。
    // 因此我们使用 setNode 手工强制转换，将该操作安全地束缚在当前的 Block 层级中！
    if (isActive) {
      editor.chain().focus().setParagraph().run();
    } else {
      editor.chain().focus().setNode('heading', { level }).run();
    }
  }, [editor]);

  const handleToggleOrderedList = useCallback(() => {
    if (!editor) return;
    // 强制保留内部节点的 wrap
    editor.chain().focus().toggleOrderedList().run();
  }, [editor]);

  const handleAIPaletteAction = async (
    prompt: string,
    useCtx: boolean = false,
    mode: 'text' | 'mermaid' | 'svg' | 'outline' | 'skill' = 'text',
    skillRef?: { skillId: string; stepId: string; inputAs: 'vibe' | 'prevOutput' }
  ) => {
    if (!editor) return;

    setShowAIPalette(true); // 保持气泡开启
    setAiGenerating(true);
    setAIStatus({ generating: true, onStop: handleAIPaletteStop });

    // 开启生成前保存文档快照，以便由于“停止”时回滚
    setDocSnapshot(editor.getHTML());
    const requestId = Math.random().toString(36).substring(7);
    setActiveRequestId(requestId);

    // 使用触发时缓存的前后文（在编辑器有焦点时已计算好，不受后续失焦影响）
    const { before: textBefore, after: textAfter } = paletteContext;

    let systemPrompt = `您是一位卓越的文档写作助手。请严格按照用户的指令，输出 Markdown 格式的内容，不要任何解释或开场白。`;

    // SKILL 模式：用 skill 的 step prompt 替换默认 systemPrompt
    let skillUserPromptOverride: string | null = null;
    if (mode === 'skill' && skillRef) {
      // 动态导入避免循环依赖
      const { getSkillById, getStepById, renderTemplate } = await import('../../data/skills');
      const skill = getSkillById(skillRef.skillId);
      const step = skill ? getStepById(skill, skillRef.stepId) : undefined;
      if (skill && step) {
        systemPrompt = step.systemPrompt;
        // 选区文本通过 prompt 传入；按 inputAs 注入
        const vars: Record<string, string | number | undefined> = {
          vibe: skillRef.inputAs === 'vibe' ? prompt : '',
          prevOutput: skillRef.inputAs === 'prevOutput' ? prompt : '',
          outline: '',
          webContext: '',
        };
        skillUserPromptOverride = renderTemplate(step.userPromptTemplate, vars);
      }
    }

    if (mode === 'mermaid') {
      systemPrompt = `您是一位 Mermaid 图表专家。请根据用户指令生成标准的 Mermaid 代码块。
**严格要求：**
1. 必须且只能输出一个 \`\`\`mermaid ... \`\`\` 代码块。
2. 内部代码必须是有效的 Mermaid 语法。
3. 不要包含任何解释性文字、Markdown 标题或开场白。`;
    } else if (mode === 'svg') {
      systemPrompt = `您是一位 SVG 绘图专家。请根据用户指令生成标准的 SVG 代码块。
**严格要求：**
1. 必须且只能输出一个 \`\`\`svg ... \`\`\` 代码块，内部包含标准的 <svg> 标签。
2. 确保 SVG 具有合适的 viewBox 属性，以便自适应尺寸。
3. 不要包含任何解释性文字或开场白。`;
    }

    const outlineText = outline.length > 0
      ? `【全文大纲结构】
${outline.map(h => `${'  '.repeat(h.level - 1)}- ${h.text}`).join('\n')}
`
      : '';

    const contextInstruction = useCtx && (textBefore || textAfter)
      ? `以下是我文档中光标所在位置的上下文（Markdown 格式）：

${outlineText}
【前文】
${textBefore || '（文档开头，无前文）'}

【此处需要插入内容 ↓】

【后文】
${textAfter || '（文档末尾，无后文）'}

---

**严格要求：**
1. 生成的内容只能是【此处需要插入内容 ↓】处的补充，不要重复前文或后文已有的内容。
2. 严格延续前文的编号序号（如果前文最后是 "2."，新内容应从 "3." 开始）。
3. 严格保持前文的 Markdown 格式风格（标题层级、列表样式、缩进）。
4. 内容需与前后文主题衔接，语气和深度保持一致。
5. 参考【全文大纲结构】以确保生成的段落逻辑正确融入整体架构。

请在插入位置完成以下任务：${prompt}`
      : prompt;

    const userMessage = skillUserPromptOverride ?? contextInstruction;

    console.log('[AIPalette] useCtx:', useCtx, '| before length:', textBefore.length, '| after length:', textAfter.length);
    if (useCtx) {
      console.log('[AIPalette] textBefore (last 300):', textBefore.slice(-300));
      console.log('[AIPalette] textAfter (first 200):', textAfter.slice(0, 200));
    }

    try {
      let accumulated = '';
      // 此时 selectionUpdate 已经重置了编辑器选区，需要先把焦点放回去
      editor.chain().focus().run();
      const initialFrom = editor.state.selection.from;
      const initialTo = editor.state.selection.to;
      const $pos = editor.state.doc.resolve(initialFrom);
      const parentNode = $pos.parent;
      
      // 核心优化：锁定起始位置。如果是空段落，则直接替换整个段落节点
      const finalStartPos = (parentNode.type.name === 'paragraph' && parentNode.textContent.trim() === '') 
        ? $pos.before() 
        : initialFrom;
        
      let currentEndPos = (parentNode.type.name === 'paragraph' && parentNode.textContent.trim() === '')
        ? $pos.after()
        : initialTo;

      await generate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ], (chunk) => {
        accumulated += chunk;
        // 头部清洗：移除 AI 可能输出的起始换行符
        const processedMarkdown = accumulated.trimStart();
        if (!processedMarkdown) return;
        
        const html = markdownToHtml(processedMarkdown);
        
        try {
          editor.chain()
            .insertContentAt({ from: finalStartPos, to: currentEndPos }, html)
            .run();
          
          // 更新下一步替换的结束位置（即当前内容的末尾）
          currentEndPos = editor.state.selection.to;

          // 降低写入频率，仅当积累一定长度或遇到换行时同步到 Store
          if (accumulated.length % 20 === 0 || chunk.includes('\n')) {
            const currentTabId = activeTabIdRef.current;
            if (currentTabId) {
              const currentHtml = editor.getHTML();
              const currentMd = htmlToMarkdown(currentHtml);
              // 极端安全检查：确保不会因为转换错误清空文档
              if (currentMd.trim() || !editor.state.doc.textContent.trim()) {
                updateTabContent(currentTabId, currentMd);
              }
            }
          }
        } catch (e) {
          // 流式过程中产生无效 HTML 时忽略
        }
      }, requestId);

      setAiGenerating(false);
      setAIStatus({ generating: false, onStop: null });

      // 生成完成后，执行一次最终的显式同步
      const finalTabId = activeTabIdRef.current;
      if (finalTabId) {
        updateTabContent(finalTabId, htmlToMarkdown(editor.getHTML()));
        console.log('[AI] Final content sync completed');
      }

      // 生成完成后：直接在 ProseMirror 节点层面重排编号
      // 生成完成后：在同一章节内重排连续编号标题
      if (useCtx) {
        const { tr } = editor.state;
        let modified = false;

        // 收集所有 heading 节点及其位置（按文档顺序）
        type HeadingInfo = { pos: number; textPos: number; currentNum: string; level: number };
        const allHeadings: Array<HeadingInfo | { pos: number; level: number; isBreak: true }> = [];
        
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading') {
            const text = node.textContent;
            const match = text.match(/^(\d+)[.．、]\s*/);
            const level = node.attrs.level as number;
            if (match) {
              allHeadings.push({ pos, textPos: pos + 1, currentNum: match[1], level });
            } else {
              // 非编号标题作为 "断点"
              allHeadings.push({ pos, level, isBreak: true });
            }
          }
        });

        // 按连续的同级编号标题分组（遇到断点或不同级别则断开）
        const runs: HeadingInfo[][] = [];
        let currentRun: HeadingInfo[] = [];
        let currentLevel: number | null = null;

        for (const item of allHeadings) {
          if ('isBreak' in item) {
            if (currentRun.length > 0) { runs.push(currentRun); currentRun = []; }
            currentLevel = null;
          } else {
            if (currentLevel === null || item.level === currentLevel) {
              currentRun.push(item);
              currentLevel = item.level;
            } else {
              // 级别变了 → 结束当前 run，开新 run
              if (currentRun.length > 0) { runs.push(currentRun); }
              currentRun = [item];
              currentLevel = item.level;
            }
          }
        }
        if (currentRun.length > 0) { runs.push(currentRun); }

        // 对每个 run 内部重排编号（从后往前修改避免偏移）
        for (const run of runs) {
          if (run.length < 2) continue;
          
          // 查找该 run 在文档中的大致起始序号。如果是新插入，可能第一个序号也是错的。
          // 简单起见：如果第一个序号是 1，则重排为 1, 2, 3...
          // 如果第一个序号不是 1 且前文有中断，则尊重第一个序号。
          const startNum = parseInt(run[0].currentNum);
          
          const reversed = [...run].reverse();
          reversed.forEach((item, reverseIdx) => {
            const indexInRun = run.length - 1 - reverseIdx;
            const expectedNum = startNum + indexInRun;
            if (item.currentNum !== String(expectedNum)) {
              tr.replaceWith(item.textPos, item.textPos + item.currentNum.length, editor.schema.text(String(expectedNum)));
              modified = true;
            }
          });
        }

        if (modified) {
          editor.view.dispatch(tr);
          console.log('[renumber] 已修复同章节内的局部编号');
        }
      }
    } finally {
      setAiGenerating(false);
      setActiveRequestId(null);
      // 生成完成后延迟清除 snapshot，防止 handleAIPaletteStop 在此时被意外触发导致回滚
      setTimeout(() => setDocSnapshot(null), 100);
      // 注意：根据用户需求，不关闭气泡，也不在 AI 操作成功后清除 PalettePos 缓存的坐标
    }
  };
 
  // 统一触发 AI 面板的逻辑
  const triggerAIPalette = useCallback(() => {
    if (!editor) return;
    const { from } = editor.state.selection;
    const cursorCoords = editor.view.coordsAtPos(from);
    
    // 用 DOMSerializer 提取光标前后 HTML 片段，再转 Markdown，保留所有格式
    const docSize = editor.state.doc.content.size;
    const serializer = DOMSerializer.fromSchema(editor.schema);
    
    // 前文：doc.slice(0, from) → HTML → Markdown
    const beforeFragment = editor.state.doc.slice(0, Math.min(from, docSize)).content;
    const beforeDiv = document.createElement('div');
    beforeDiv.appendChild(serializer.serializeFragment(beforeFragment));
    const mdBefore = htmlToMarkdown(beforeDiv.innerHTML);
    
    // 后文：doc.slice(from, end) → HTML → Markdown
    const afterFragment = editor.state.doc.slice(Math.min(from, docSize), docSize).content;
    const afterDiv = document.createElement('div');
    afterDiv.appendChild(serializer.serializeFragment(afterFragment));
    const mdAfter = htmlToMarkdown(afterDiv.innerHTML);
    
    setPaletteContext({
      before: mdBefore.slice(-2000), // 前文最后 2000 字
      after: mdAfter.slice(0, 1000),  // 后文前 1000 字
    });
    
    setPalettePos({ 
      top: cursorCoords.bottom + 12, 
      left: Math.max(cursorCoords.left, 20) 
    });
    setShowAIPalette(true);
  }, [editor]);

  const toggleSmartCodeBlock = useCallback(() => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const isCodeBlock = editor.isActive('codeBlock');
    
    if (isCodeBlock) {
      editor.chain().focus().toggleCodeBlock().run();
      return;
    }

    // Not a code block yet. Let's try to join if multi-line is selected.
    // Use textBetween to get the actual text including internal newlines between blocks
    const text = editor.state.doc.textBetween(from, to, '\n');
    
    if (text.includes('\n')) {
      // If multi-line, replace the entire selection with one single code block
      editor.chain()
        .focus()
        .deleteSelection()
        .insertContent({
          type: 'codeBlock',
          content: [{ type: 'text', text }]
        })
        .run();
    } else {
      // Simple toggle for single line or word
      editor.chain().focus().toggleCodeBlock().run();
    }
  }, [editor]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // 组件卸载时强制同步一次最新内容到 Store
  useEffect(() => {
    return () => {
      if (editorRef.current && activeTabIdRef.current) {
        const html = editorRef.current.getHTML();
        const markdown = htmlToMarkdown(html);
        useAppStore.getState().updateTabContent(activeTabIdRef.current, markdown);
        console.log('[Tiptap] Unmount sync completed');
      }
    };
  }, []);

  // 同步外部内容变更到编辑器（如切换标签或外部 AI 写入）
  useEffect(() => {
    if (!editor || !activeTab) return;

    const isTabSwitch = prevSyncTabIdRef.current !== activeTabId;
    prevSyncTabIdRef.current = activeTabId;

    const newHtml = markdownToHtml(activeTab.content);

    // 检测是否是全新的 editor 实例（切换 word/markdown 模式后 TipTap 会完全卸载重载）
    const isNewEditor = prevEditorRef.current !== editor;
    prevEditorRef.current = editor;

    if (isNewEditor) {
      // 新实例时强制用 store 中的真实内容初始化，确保 data URL 图片不丢失
      editor.commands.setContent(newHtml, false);
      return;
    }

    // tab 切换时必须强制更新内容，不受焦点或 AI 生成状态影响
    if (!isTabSwitch) {
      // 非切换 Tab（例如 AI 写入内容到当前 Tab）：若编辑器有焦点或 AI 正在生成则跳过，避免回流冲突
      if (editor.isFocused || aiGenerating) return;

      const currentHtml = editor.getHTML();
      // 如果当前编辑器有 data URL 图片但 newHtml 没有，说明 markdown→html 转换丢失了图片，跳过
      if (currentHtml.includes('data:image/') && !newHtml.includes('data:image/')) {
        console.warn('[Tiptap:useEffect] newHtml dropped data URL images, skipping setContent');
        return;
      }
      // 只有在 HTML 发生实质性变化时才更新
      const currentHtml2 = currentHtml;
      if (currentHtml2 !== newHtml) {
        if (currentHtml2.replace(/\s/g, '') === newHtml.replace(/\s/g, '')) return;
        editor.commands.setContent(newHtml, false);
      }
      return;
    }

    // tab 切换：直接更新内容
    editor.commands.setContent(newHtml, false);
  }, [activeTabId, editor, activeTab?.content]);

  useEffect(() => {
    if (editor && navigationRequest) {
      const { heading } = navigationRequest;
      let foundPos = -1;
      
      editor.state.doc.descendants((node, pos) => {
        if (foundPos !== -1) return false;
        if (node.type.name === 'heading' && node.attrs.level === heading.level && node.textContent === heading.text) {
          foundPos = pos;
          return false;
        }
        return true;
      });

      if (foundPos !== -1) {
        editor.commands.focus(foundPos);
        const element = editor.view.nodeDOM(foundPos) as HTMLElement;
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }, [editor, navigationRequest]);

  if (!editor) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', position: 'relative' }}>

      {/* Format Toolbar */}
      <div className="tiptap-toolbar" style={{ 
        display: 'flex', height: 48, minHeight: 48,
        borderBottom: '1px solid var(--border-subtle)',
        alignItems: 'center', padding: '0 20px', gap: 8,
        backgroundColor: 'var(--bg-page)', WebkitAppRegion: 'no-drag',
        pointerEvents: 'auto',
        justifyContent: 'center'
      } as React.CSSProperties}>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('paragraph') ? 'active' : ''}`} onClick={() => editor.chain().focus().setParagraph().run()} title="正文"><Type size={16} /></button>
          <button type="button" className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`} onClick={() => handleToggleHeading(1)} title="标题 1">H1</button>
          <button type="button" className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`} onClick={() => handleToggleHeading(2)} title="标题 2">H2</button>
          <button type="button" className={`toolbar-btn ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`} onClick={() => handleToggleHeading(3)} title="标题 3">H3</button>
        </div>
        <div className="toolbar-divider"></div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('bold') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBold().run()} title="加粗"><Bold size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('italic') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleItalic().run()} title="倾斜"><Italic size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('underline') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleUnderline().run()} title="下划线"><UnderlineIcon size={16} /></button>
        </div>
        <div className="toolbar-divider"></div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('orderedList') ? 'active' : ''}`} onClick={handleToggleOrderedList} title="有序列表"><ListOrdered size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('bulletList') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBulletList().run()} title="无序列表"><List size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('taskList') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleTaskList().run()} title="任务列表"><SquareCheck size={16} /></button>
        </div>
        <div className="toolbar-divider"></div>
        <div style={{ display: 'flex', gap: 2 }}>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('code') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleCode().run()} title="行内代码"><Code size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('codeBlock') ? 'active' : ''}`} onClick={() => toggleSmartCodeBlock()} title="代码块"><FileCode size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('blockquote') ? 'active' : ''}`} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="引用"><Quote size={16} /></button>
          <button type="button" className={`toolbar-icon-btn`} onClick={() => editor.chain().focus().insertContent('$x = y^2$').run()} title="数学公式"><Sigma size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('table') ? 'active' : ''}`} onClick={() => {
            setPrompt({
              title: '插入表格',
              fields: [
                { name: 'rows', label: '行数', defaultValue: '3', type: 'number' },
                { name: 'cols', label: '列数', defaultValue: '3', type: 'number' }
              ],
              onConfirm: (values) => {
                const rows = parseInt(values.rows);
                const cols = parseInt(values.cols);
                if (rows > 0 && cols > 0) {
                  editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
                }
                setPrompt(null);
              },
              onCancel: () => setPrompt(null)
            });
          }} title="插入表格"><TableIcon size={16} /></button>
          <button type="button" className="toolbar-icon-btn" onClick={() => setShowImageDialog(true)} title="插入图片"><ImageIcon size={16} /></button>
          <button type="button" className={`toolbar-icon-btn ${editor.isActive('link') ? 'active' : ''}`} onClick={() => {
            setPrompt({
              title: '插入链接',
              fields: [{ name: 'url', label: '链接地址 (URL)', defaultValue: editor.getAttributes('link').href || '' }],
              onConfirm: (values) => {
                const url = values.url;
                if (url) {
                  if (editor.state.selection.empty) {
                    editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run();
                  } else {
                    editor.chain().focus().setLink({ href: url }).run();
                  }
                } else {
                  editor.chain().focus().unsetLink().run();
                }
                setPrompt(null);
              },
              onCancel: () => setPrompt(null)
            });
          }} title="插入链接"><LinkIcon size={16} /></button>
          <div className="toolbar-divider"></div>
          <button type="button" className={`toolbar-icon-btn`} onClick={insertMermaid} title="插入 Mermaid 图表"><Activity size={16} color="var(--color-accent-indigo)" /></button>
          <button type="button" className={`toolbar-icon-btn`} onClick={insertSVG} title="插入 SVG 组件"><FileCode size={16} color="var(--color-accent-orange)" /></button>
        </div>
      </div>

      <div className="tiptap-container">
        {prompt && <PromptDialog {...prompt} />}
        {showImageDialog && (
          <ImageInsertDialog
            onConfirm={(src, alt) => {
              setShowImageDialog(false);
              requestAnimationFrame(() => {
                if (!editor) return;
                editor.commands.focus();
                requestAnimationFrame(() => {
                  const imageNode = editor.schema.nodes.image?.create({ src, alt: alt || null });
                  if (imageNode) {
                    editor.view.dispatch(
                      editor.state.tr.replaceSelectionWith(imageNode)
                    );
                    // 插入后主动同步，避免 data URL 在 onUpdate 时序中丢失
                    requestAnimationFrame(() => {
                      const tabId = activeTabIdRef.current;
                      if (tabId) {
                        const md = htmlToMarkdown(editor.getHTML());
                        if (md) updateTabContent(tabId, md);
                      }
                    });
                  }
                });
              });
            }}
            onCancel={() => setShowImageDialog(false)}
          />
        )}
        {showStyleSelector && (
          <StyleSelector 
            onSelect={(style) => handleAIAction('polish', style)} 
            onCancel={() => setShowStyleSelector(false)} 
          />
        )}
        {showAIPalette && palettePos && ReactDOM.createPortal(
          <div 
            id="ai-palette-portal"
            style={{ 
              position: 'fixed', 
              top: palettePos.top, 
              left: palettePos.left,
              zIndex: 9999 
            }}
          >
            <AIPalette 
              onClose={() => { 
                setShowAIPalette(false); 
                setPalettePos(null); 
                editor?.chain().focus().run(); 
              }} 
              onAction={(p, useCtx, mode, skillRef) => handleAIPaletteAction(p, useCtx, mode as any, skillRef)}
              onStop={handleAIPaletteStop}
              loading={aiGenerating}
            />
          </div>,
          document.body
        )}
        
        <div className="tiptap-page" onClick={() => editor.chain().focus().run()} style={{
          transform: `scale(${zoom / 100})`
        }}>
          {editor && (
            <BubbleMenu 
              editor={editor} 
              tippyOptions={{ 
                interactive: true, 
                hideOnClick: false,
                duration: [150, 150]
              }}
              shouldShow={({ state, editor }) => {
                if (state.selection.empty) return false;
                // Don't show for custom block nodes
                const { selection } = state;
                const isCustomBlock = editor.isActive('diagram') || editor.isActive('svgBlock');
                return !isCustomBlock;
              }}
            >
              <div className="bubble-menu" style={{ 
                display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-elevated)', 
                padding: '8px', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                border: '1px solid var(--border-subtle)', gap: 8, minWidth: 'max-content'
              }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                  <button onClick={() => editor.chain().focus().setParagraph().run()} className={`toolbar-icon-btn ${editor.isActive('paragraph') ? 'active' : ''}`} title="正文"><Type size={16} /></button>
                  <div className="toolbar-divider"></div>
                  <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`toolbar-btn ${editor.isActive('heading', { level: 1 }) ? 'active' : ''}`} title="标题 1">H1</button>
                  <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`toolbar-btn ${editor.isActive('heading', { level: 2 }) ? 'active' : ''}`} title="标题 2">H2</button>
                  <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={`toolbar-btn ${editor.isActive('heading', { level: 3 }) ? 'active' : ''}`} title="标题 3">H3</button>
                  <div className="toolbar-divider"></div>
                  <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`toolbar-icon-btn ${editor.isActive('bulletList') ? 'active' : ''}`} title="无序列表"><List size={16} /></button>
                  <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`toolbar-icon-btn ${editor.isActive('orderedList') ? 'active' : ''}`} title="有序列表"><ListOrdered size={16} /></button>
                  <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={`toolbar-icon-btn ${editor.isActive('taskList') ? 'active' : ''}`} title="任务列表"><SquareCheck size={16} /></button>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                  <button onClick={() => editor.chain().focus().toggleBold().run()} className={`toolbar-icon-btn ${editor.isActive('bold') ? 'active' : ''}`} title="加粗"><Bold size={16} /></button>
                  <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`toolbar-icon-btn ${editor.isActive('italic') ? 'active' : ''}`} title="倾斜"><Italic size={16} /></button>
                  <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`toolbar-icon-btn ${editor.isActive('underline') ? 'active' : ''}`} title="下划线"><UnderlineIcon size={16} /></button>
                  <button onClick={() => editor.chain().focus().toggleCode().run()} className={`toolbar-icon-btn ${editor.isActive('code') ? 'active' : ''}`} title="行内代码"><Code size={16} /></button>
                  <button onClick={() => toggleSmartCodeBlock()} className={`toolbar-icon-btn ${editor.isActive('codeBlock') ? 'active' : ''}`} title="代码块"><FileCode size={16} /></button>
                  <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`toolbar-icon-btn ${editor.isActive('blockquote') ? 'active' : ''}`} title="引用"><Quote size={16} /></button>
                  <div className="toolbar-divider"></div>
                  <button onClick={() => handleAIAction('polish')} className="toolbar-icon-btn" title="AI 润色" disabled={aiGenerating}><Wand2 size={16} color="var(--color-accent-indigo)" /></button>
                  <button onClick={() => handleAIAction('summarize')} className="toolbar-icon-btn" title="AI 总结" disabled={aiGenerating}><FileText size={16} color="var(--color-accent-green)" /></button>
                  <button onClick={() => handleAIAction('expand')} className="toolbar-icon-btn" title="AI 扩写" disabled={aiGenerating}><Sparkles size={16} color="var(--color-accent-orange)" /></button>
                </div>
                {editor.isActive('codeBlock') && (
                  <>
                    <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '4px 0' }}></div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '0 4px' }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>语言：</span>
                      <select 
                        value={editor.getAttributes('codeBlock').language || ''}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => e.stopPropagation()}
                        onChange={e => {
                          e.stopPropagation();
                          editor.chain().focus().updateAttributes('codeBlock', { language: e.target.value }).run();
                        }}
                        style={{
                          background: 'var(--bg-surface)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '6px',
                          padding: '3px 8px',
                          fontSize: '11px',
                          outline: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">自动检测</option>
                        <option value="javascript">JavaScript</option>
                        <option value="typescript">TypeScript</option>
                        <option value="python">Python</option>
                        <option value="java">Java</option>
                        <option value="html">HTML</option>
                        <option value="css">CSS</option>
                        <option value="json">JSON</option>
                        <option value="markdown">Markdown</option>
                        <option value="bash">Bash</option>
                        <option value="sql">SQL</option>
                        <option value="cpp">C++</option>
                        <option value="rust">Rust</option>
                      </select>
                    </div>
                  </>
                )}
                {editor.isActive('table') && (
                  <>
                    <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '4px 0' }}></div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                      <button onClick={() => editor.chain().focus().addColumnAfter().run()} className="toolbar-icon-btn" title="在右侧增加列"><Columns size={16} /><Plus size={10} style={{ marginLeft: -4, marginTop: -8 }} /></button>
                      <button onClick={() => editor.chain().focus().addRowAfter().run()} className="toolbar-icon-btn" title="在下方增加行"><Rows size={16} /><Plus size={10} style={{ marginLeft: -4, marginTop: -8 }} /></button>
                      <div className="toolbar-divider"></div>
                      <button onClick={() => editor.chain().focus().setTextAlign('left').run()} className={`toolbar-icon-btn ${editor.isActive({ textAlign: 'left' }) ? 'active' : ''}`} title="靠左对齐"><AlignLeft size={16} /></button>
                      <button onClick={() => editor.chain().focus().setTextAlign('center').run()} className={`toolbar-icon-btn ${editor.isActive({ textAlign: 'center' }) ? 'active' : ''}`} title="居中对齐"><AlignCenter size={16} /></button>
                      <button onClick={() => editor.chain().focus().setTextAlign('right').run()} className={`toolbar-icon-btn ${editor.isActive({ textAlign: 'right' }) ? 'active' : ''}`} title="靠右对齐"><AlignRight size={16} /></button>
                      <div className="toolbar-divider"></div>
                      <button onClick={() => editor.chain().focus().deleteColumn().run()} className="toolbar-icon-btn" title="删除当前列"><Columns size={16} style={{ opacity: 0.5 }} /><Trash2 size={10} style={{ marginLeft: -10, marginTop: 6, color: 'var(--color-accent-red)' }} /></button>
                      <button onClick={() => editor.chain().focus().deleteRow().run()} className="toolbar-icon-btn" title="删除当前行"><Rows size={16} style={{ opacity: 0.5 }} /><Trash2 size={10} style={{ marginLeft: -10, marginTop: 6, color: 'var(--color-accent-red)' }} /></button>
                      <button onClick={() => editor.chain().focus().deleteTable().run()} className="toolbar-icon-btn" title="删除整个表格"><LayoutGrid size={16} style={{ opacity: 0.3 }} /><Trash2 size={10} style={{ marginLeft: -10, marginTop: 6, color: 'var(--color-accent-red)' }} /></button>
                    </div>
                  </>
                )}
              </div>
            </BubbleMenu>
          )}


        <EditorContent 
            editor={editor} 
            onKeyDown={(e) => {
                const { selection, doc } = editor.state;
                if (!selection.empty || aiGenerating) return;

                // 触发判定
                const { $from } = selection;
                const isAtStart = $from.parentOffset === 0;
                const isEmptyLine = $from.parent.textContent.trim() === '';

                // 1. 空格触发 (仅限行首且该行原本为空)
                if (e.key === ' ' && isAtStart && isEmptyLine && !showAIPalette) {
                    e.preventDefault();
                    triggerAIPalette();
                    return;
                }

                // 2. 斜杠触发 (仅限行首)
                if (e.key === '/' && isAtStart && !showAIPalette) {
                    // 我们不preventDefault，让 '/' 输入进去，或者也可以拦截它
                    // 这里选择拦截并在显示面板后手动处理，或者让面板自己带一个 '/'
                    e.preventDefault();
                    triggerAIPalette();
                    return;
                }

                // 3. Esc 关闭
                if (e.key === 'Escape' && showAIPalette) {
                    setShowAIPalette(false);
                    setPalettePos(null);
                }
            }}
          />
        </div>
      </div>
    </div>
  );
};
