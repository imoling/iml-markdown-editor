import React from 'react';
import { Loader2, Sparkles, RotateCcw } from 'lucide-react';
import { isLocalImage, localImageEta, clock, describeProgress } from '../../../utils/localImageEta';
import { useAppStore } from '../../../stores/appStore';

interface ImageInsertDialogProps {
  onConfirm: (src: string, alt: string) => void;
  onCancel: () => void;
}

type Tab = 'upload' | 'url' | 'ai';
const TABS: { id: Tab; label: string }[] = [
  { id: 'upload', label: '本地上传' },
  { id: 'url', label: '网络链接' },
  { id: 'ai', label: 'AI 生成' },
];

/** 插入图片：本地上传 / 网络链接 / AI 生成 */
export const ImageInsertDialog: React.FC<ImageInsertDialogProps> = ({ onConfirm, onCancel }) => {
  const imageGenConfig = useAppStore((s) => s.imageGenConfig);
  const aiEnabled = useAppStore((s) => s.aiEnabled);
  const [tab, setTab] = React.useState<Tab>('upload');
  const [url, setUrl] = React.useState('');
  const [alt, setAlt] = React.useState('');
  const [preview, setPreview] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [aiPrompt, setAiPrompt] = React.useState('');
  const [aiImages, setAiImages] = React.useState<{ url: string }[]>([]);
  const [aiSelected, setAiSelected] = React.useState<number | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiElapsed, setAiElapsed] = React.useState('');
  const progressRef = React.useRef<any>(null);
  // 本机出图：主进程一路报「腾内存 / 读模型 / 第几步」，照实显示，别让人对着一个转圈干等
  React.useEffect(() => window.api.image?.onProgress?.((p) => { progressRef.current = p; }) ?? undefined, []);
  const [aiError, setAiError] = React.useState('');
  const [lightboxSrc, setLightboxSrc] = React.useState<string | null>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
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
    const local = isLocalImage(imageGenConfig);
    const startedAt = Date.now();
    let timer: ReturnType<typeof setInterval> | null = null;
    if (local) {
      const eta = await localImageEta(imageGenConfig);
      progressRef.current = null;
      setAiElapsed(describeProgress(null, '0:00', eta));
      timer = setInterval(() => setAiElapsed(`${describeProgress(progressRef.current, clock(Date.now() - startedAt), eta)} · ${clock(Date.now() - startedAt)}`), 1000);
    }
    try {
      const results = await window.api.ai.generateImage({ prompt: aiPrompt.trim(), config: imageGenConfig });
      setAiImages(results);
      if (results.length > 0) setAiSelected(0);
    } catch (err: any) {
      setAiError(err.message || (local ? '本机生图失败' : '生成失败，检查一下 AI 配图的配置'));
    } finally {
      if (timer) clearInterval(timer);
      setAiElapsed('');
      setAiLoading(false);
    }
  };

  /** 本机生图很慢，中途可以不要了 */
  const cancelGenerate = () => { void window.api.image.cancelGeneration().catch(() => {}); };

  /**
   * 关掉对话框时，正在出的那张本机图也一起停掉。
   * 不然人一关窗，GPU 还在为一张没人要的图转好几分钟
   */
  const closeDialog = () => {
    if (aiLoading && isLocalImage(imageGenConfig)) cancelGenerate();
    onCancel();
  };

  const canConfirm = tab === 'upload' ? !!preview : tab === 'url' ? !!url.trim() : aiSelected !== null && aiImages.length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    if (tab === 'upload') onConfirm(preview, alt.trim());
    else if (tab === 'url') onConfirm(url.trim(), alt.trim());
    else if (aiSelected !== null && aiImages[aiSelected]) onConfirm(aiImages[aiSelected].url, alt.trim() || aiPrompt.trim());
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canConfirm) handleConfirm();
    if (e.key === 'Escape') closeDialog();
  };

  return (
    <div className="modal-backdrop modal-backdrop--light" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="modal-card image-dialog">
        <div className="image-dialog__head">
          <h3 className="modal-title modal-title--sm">插入图片</h3>
          <div className="segmented">
            {TABS.filter((t) => t.id !== 'ai' || aiEnabled).map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`segmented__btn ${tab === t.id ? 'segmented__btn--active' : ''}`}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="image-dialog__body">
          {tab === 'upload' && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
              >
                {preview ? (
                  <img src={preview} alt="preview" className="dropzone__preview" />
                ) : (
                  <div className="dropzone__hint">
                    <div className="dropzone__icon">🖼️</div>
                    <div className="text-md text-secondary fw-500">拖进来，或点一下选文件</div>
                    <div className="text-xs text-muted mt-4"></div>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </>
          )}

          {tab === 'url' && (
            <div className="col gap-8">
              <label className="text-sm text-secondary fw-500">图片 URL</label>
              <input autoFocus type="url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={onInputKey} placeholder="https://example.com/image.jpg" className="field-input field-input--xs" />
              {url.trim() && (
                <div className="image-dialog__url-preview">
                  <img src={url.trim()} alt="preview" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              )}
            </div>
          )}

          {tab === 'ai' && (
            <div className="col gap-10">
              <div className="row gap-8">
                <input
                  autoFocus type="text" value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); if (e.key === 'Escape') closeDialog(); }}
                  placeholder="描述你想要的图片"
                  className="field-input field-input--xs flex-1"
                />
                <button onClick={handleGenerate} disabled={!aiPrompt.trim() || aiLoading} className="btn btn-gradient btn-xs image-dialog__generate">
                  {aiLoading ? <><Loader2 size={13} className="animate-spin" /> {aiElapsed || '生成中'}</> : <><Sparkles size={13} /> 生成</>}
                </button>
                {aiLoading && isLocalImage(imageGenConfig) && <button onClick={cancelGenerate} className="btn btn-secondary btn-xs">取消</button>}
              </div>

              {aiLoading && aiImages.length === 0 && (
                <div className="image-dialog__skeleton"><Loader2 size={20} className="animate-spin" color="var(--text-muted)" /></div>
              )}

              {aiImages.length > 0 && (
                <div className="image-dialog__result">
                  <img src={aiImages[0].url} alt="生成图" />
                  <button onClick={() => setLightboxSrc(aiImages[0].url)} title="查看大图" className="overlay-btn overlay-btn--left">
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M1 1h4M1 1v4M13 1h-4M13 1v4M1 13h4M1 13v-4M13 13h-4M13 13v-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  </button>
                  <button onClick={handleGenerate} title="重新生成" className="overlay-btn overlay-btn--right"><RotateCcw size={12} /></button>
                </div>
              )}

              {aiError && <div className="error-box">{aiError}</div>}

              {!aiLoading && aiImages.length === 0 && !aiError && (
                <div className="hint text-center image-dialog__tip">
                  {!imageGenConfig.apiKey ? (
                    <span className="image-dialog__tip--warn">
                      需先配置 API Key<br />
                      <span className="image-dialog__tip-small">到「智能 → AI 配图」里选服务并填 Key</span>
                    </span>
                  ) : (
                    <>先写一句描述<br />
                    <span className="image-dialog__tip-small">当前提供商：{imageGenConfig.provider}　可在「智能」→ AI 配图中切换</span></>
                  )}
                </div>
              )}
            </div>
          )}

          {tab !== 'ai' && (
            <div className="col gap-6">
              <label className="text-sm text-secondary fw-500">图片描述 <span className="text-muted fw-400">可选</span></label>
              <input type="text" value={alt} onChange={(e) => setAlt(e.target.value)} onKeyDown={onInputKey} placeholder="图片说明文字" className="field-input field-input--xs" />
            </div>
          )}

          <div className="row gap-10 mt-2">
            <button onClick={closeDialog} className="btn btn-ghost btn-sm btn-block">取消</button>
            <button onClick={handleConfirm} disabled={!canConfirm} className="btn btn-primary btn-sm btn-block">插入</button>
          </div>
        </div>
      </div>

      {lightboxSrc && (
        <div className="lightbox" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightboxSrc(null)} className="lightbox__close">×</button>
        </div>
      )}
    </div>
  );
};
