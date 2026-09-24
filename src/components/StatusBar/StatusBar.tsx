import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { Minus, Plus, Loader2, ChevronUp } from 'lucide-react';
import { isLocalEndpoint, inferServiceType } from '../../utils/aiService';
import { useTranscribeStore } from '../../stores/transcribeStore';
import { formatClock } from '../../utils/transcript';

const ZOOM_OPTIONS = [300, 200, 150, 125, 100, 75, 50, 25];
const CJK_RE = /[一-龥぀-ヿ＀-￯ᄀ-ᇿ㄰-㆏ꓐ-꓿가-힯]/g;

/** 中西文混排的字数：CJK 按字计，其余按空白分词 */
function countWords(content: string) {
  const cjkCount = content.match(CJK_RE)?.length ?? 0;
  const nonCjk = content.replace(CJK_RE, ' ').trim();
  const westernWords = nonCjk ? nonCjk.split(/\s+/).length : 0;
  return { words: cjkCount + westernWords, lines: content.split('\n').length };
}

/** AI 请求发往哪里：让「笔记内容会不会离开这台电脑」一眼可见 */
function describeAiDestination(config: any): { label: string; kind: 'local' | 'cloud' } {
  if (inferServiceType(config) === 'builtin') return { label: '本机模型', kind: 'local' };
  const endpoint = String(config?.endpoint || '');
  if (!endpoint) return { label: '未配置', kind: 'local' };
  if (isLocalEndpoint(endpoint)) return { label: '本地服务', kind: 'local' };
  let host = endpoint;
  try { host = new URL(endpoint).host; } catch { /* 保持原样 */ }
  return { label: `云端 · ${host}`, kind: 'cloud' };
}

/**
 * 正在录音时状态栏常驻一个红点和计时：录音期间侧边栏可以切走、甚至收起来，但「正在听」这件事必须一直看得见。
 * 和「AI 请求发往哪里」是同一套信任语言。点一下回到转写面板。
 */
const RecordingIndicator: React.FC = () => {
  const recording = useTranscribeStore((s) => s.status === 'recording');
  const elapsed = useTranscribeStore((s) => s.elapsed);
  const keepRecording = useTranscribeStore((s) => s.keepRecording);
  const fileJob = useTranscribeStore((s) => s.fileJob);
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);
  if (!recording) return null;
  return (
    <button className="statusbar-recording" onClick={() => useAppStore.getState().openTranscribe()} title={`正在转写（本机识别，${keepRecording ? '录音只存在本机' : '音频不保存'}）`}>
      <span className="statusbar-recording__dot" /> {fileJob ? `录音转写 ${Math.round(fileJob.progress * 100)}%` : `转写中 ${formatClock(elapsed())}`}
    </button>
  );
};

export const StatusBar: React.FC = () => {
  const { mode, toggleMode, activeTabId, tabs, statusBarVisible, aiStatus, zoom, setZoom } = useAppStore();
  const notice = useAppStore((s) => s.notice);
  const aiEnabled = useAppStore((s) => s.aiEnabled);
  const dialog = useAppStore((s) => s.dialog);
  const openDialog = useAppStore((s) => s.openDialog);
  const [aiDest, setAiDest] = React.useState<{ label: string; kind: 'local' | 'cloud' } | null>(null);

  // 配置弹窗关掉之后重读一次（可能刚换了服务）
  useEffect(() => {
    if (dialog) return;
    window.api.ai.getConfig().then((cfg) => setAiDest(describeAiDestination(cfg))).catch(() => setAiDest(null));
  }, [dialog]);
  const [showZoomMenu, setShowZoomMenu] = React.useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeTab = tabs.find(t => t.id === activeTabId);
  const selectionText = useAppStore((st) => st.selectionText);

  useEffect(() => {
    if (!showZoomMenu) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setShowZoomMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showZoomMenu]);

  if (!statusBarVisible) return null;

  const stats = activeTab ? countWords(activeTab.content || '') : null;
  const selectedWords = activeTab && selectionText.trim() ? countWords(selectionText).words : 0;

  return (
    <footer className={`statusbar ${aiStatus.generating ? 'statusbar-ai' : ''}`}>
      {aiStatus.generating && <div className="statusbar-shimmer" />}

      <div className="statusbar-section">
        {stats ? (
          <>
            <span>{stats.words.toLocaleString()} 字</span>
            {selectedWords > 0 && <span className="statusbar-selected" title="当前选中的字数">选中 {selectedWords.toLocaleString()} 字</span>}
            <span>共 {stats.lines} 行</span>
          </>
        ) : (
          <span className="statusbar-dim">没有打开的笔记</span>
        )}
        <RecordingIndicator />
      </div>

      {notice && !aiStatus.generating && (
        // 一行放不下会被截断，悬停能看到全文（报错信息往往比较长）；「已导出」这类提示带按钮，点过就收起
        <div className="statusbar-section statusbar-notice" key={notice.id} title={notice.text}>
          <span className="statusbar-notice__text">{notice.text}</span>
          {notice.actions?.map((action) => (
            <button key={action.label} className="statusbar-notice__action" onClick={() => { action.run(); useAppStore.setState({ notice: null }); }}>{action.label}</button>
          ))}
        </div>
      )}

      {aiStatus.generating && (
        <div className="statusbar-section statusbar-ai-status">
          <div className="row gap-6 text-brand">
            <Loader2 size={13} className="animate-spin" />
            <span className="text-xs fw-500" title={aiStatus.text || undefined}>{aiStatus.text || '正在生成…'}</span>
          </div>
          <button onClick={() => aiStatus.onStop?.()} className="statusbar-stop">停止</button>
        </div>
      )}

      <div className="statusbar-section statusbar-section--right">
        <span
          className="statusbar-ai-dest"
          onClick={() => openDialog(aiEnabled ? 'ai-config' : 'settings')}
          title={!aiEnabled ? 'AI 功能已在设置里关闭，不会发任何请求' : aiDest?.kind === 'cloud' ? '用 AI 时，选中的文字会发往这个云端服务' : 'AI 请求只发往本机，笔记不会离开这台电脑'}
        >
          <span className={`statusbar-ai-dest__dot ${!aiEnabled ? 'statusbar-ai-dest__dot--off' : aiDest?.kind === 'cloud' ? 'statusbar-ai-dest__dot--cloud' : ''}`} />
          {aiEnabled ? `AI：${aiDest?.label ?? '…'}` : 'AI 已关闭'}
        </span>
        <span>UTF-8</span>

        <div ref={menuRef} className="zoom-control">
          {showZoomMenu && (
            <div className="popover-menu zoom-menu">
              {ZOOM_OPTIONS.map(opt => (
                <button
                  key={opt}
                  onClick={() => { setZoom(opt); setShowZoomMenu(false); }}
                  className={`popover-menu__item ${zoom === opt ? 'popover-menu__item--active' : ''}`}
                >
                  {opt}%
                  {zoom === opt && <span className="zoom-menu__dot" />}
                </button>
              ))}
            </div>
          )}

          <div className="zoom-value" onClick={() => setShowZoomMenu(!showZoomMenu)}>
            {zoom}%
            <ChevronUp size={10} className={`zoom-value__chevron ${showZoomMenu ? 'zoom-value__chevron--open' : ''}`} />
          </div>

          <div className="row gap-2">
            <button onClick={() => setZoom(Math.max(10, zoom - 10))} title="缩小" className="icon-btn zoom-step"><Minus size={13} /></button>
            <input
              type="range" min="10" max="200" value={zoom}
              onChange={(e) => setZoom(parseInt(e.target.value))}
              className="zoom-slider"
            />
            <button onClick={() => setZoom(Math.min(400, zoom + 10))} title="放大" className="icon-btn zoom-step"><Plus size={13} /></button>
          </div>
        </div>

        <span className={`mode-indicator ${mode}`} onClick={toggleMode} title="点击切换编辑模式">
          {mode === 'word' ? '富文本模式' : 'MD 预览模式'}
        </span>
      </div>
    </footer>
  );
};
