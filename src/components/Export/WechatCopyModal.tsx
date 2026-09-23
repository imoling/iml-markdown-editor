import React, { useEffect, useMemo, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { WECHAT_THEMES } from '../../utils/exportWechat';
import type { WechatResult } from '../../utils/exportWechat';
import { buildWechatCopy, copyRichText, themeById, WECHAT_THEME_KEY } from '../../utils/wechatCopy';

interface Props { onClose: () => void }

/** 预览用的外壳：手机宽度的白纸，正文本身已经带全了行内样式 */
const previewDoc = (html: string) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff;} body{padding:20px 16px 40px;} img{max-width:100%;}</style></head><body>${html}</body></html>`;

/**
 * 复制为公众号格式：选个主题，右边是手机上看到的样子，「复制」之后到公众号编辑器里粘贴就行。
 * 排版在这一侧全部做完（行内样式、外链变参考、本地图内嵌、公式画成图），公众号那边不用再动
 */
const WechatCopyModal: React.FC<Props> = ({ onClose }) => {
  const notify = useAppStore((s) => s.notify);
  const [themeId, setThemeId] = useState(() => themeById(localStorage.getItem(WECHAT_THEME_KEY)).id);
  const [results, setResults] = useState<Record<string, WechatResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const result = results[themeId];

  useEffect(() => {
    let alive = true;
    if (results[themeId]) return;
    buildWechatCopy(themeById(themeId))
      .then((r) => { if (!alive) return; if (r) setResults((prev) => ({ ...prev, [themeId]: r })); else setError('没有打开的文档'); })
      .catch((err) => { if (alive) setError(err?.message || String(err)); });
    return () => { alive = false; };
  }, [themeId, results]);

  const pick = (id: string) => { setThemeId(id); localStorage.setItem(WECHAT_THEME_KEY, id); };

  const hints = useMemo(() => {
    if (!result) return [] as string[];
    const { stats } = result;
    const out: string[] = [];
    if (stats.links) out.push(`${stats.links} 个外链换成了上标，文末列了「参考链接」`);
    if (stats.localImages) out.push(`${stats.localImages} 张本地图片已内嵌，没显示出来的话在公众号里手动插入`);
    if (stats.remoteImages) out.push(`${stats.remoteImages} 张网络图片保留原地址，粘贴时公众号会自己转存`);
    if (stats.formulas) out.push(`${stats.formulas} 个公式画成了图片`);
    if (stats.diagrams) out.push(`${stats.diagrams} 张流程图 / SVG 画成了图片`);
    if (stats.failedImages) out.push(`${stats.failedImages} 张图没取到，正文里留了说明`);
    return out;
  }, [result]);

  const copy = async () => {
    if (!result) return;
    setCopying(true);
    try {
      await copyRichText(result.html, result.text);
      notify('已复制为公众号格式，到公众号编辑器里粘贴即可');
      onClose();
    } catch (err: any) {
      setError(`复制失败：${err?.message || err}`);
      setCopying(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--flush modal-card--wechat" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h1 className="modal-title">复制为公众号格式</h1>
            <p className="modal-subtitle">选个样子，复制，粘到公众号编辑器里就是排好的版</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="modal-body modal-body--headed">
          <div className="wechat-copy">
            <div className="wechat-copy__themes" role="radiogroup" aria-label="排版主题">
              {WECHAT_THEMES.map((t) => (
                <button key={t.id} type="button" role="radio" aria-checked={t.id === themeId} className={`wechat-theme${t.id === themeId ? ' wechat-theme--on' : ''}`} onClick={() => pick(t.id)}>
                  <span className="wechat-theme__swatch" style={{ background: t.accent }} />
                  <span>
                    <span className="wechat-theme__name">{t.name}</span>
                    <span className="wechat-theme__note">{t.note}</span>
                  </span>
                  {t.id === themeId && <Check size={16} className="wechat-theme__check" />}
                </button>
              ))}
              {hints.length > 0 && <ul className="wechat-copy__hints">{hints.map((h) => <li key={h}>{h}</li>)}</ul>}
            </div>
            <div className="wechat-copy__preview">
              <div className="wechat-copy__phone">
                {result ? <iframe title="公众号预览" sandbox="" srcDoc={previewDoc(result.html)} /> : <div className="wechat-copy__loading">{error || '正在排版…'}</div>}
              </div>
            </div>
          </div>
        </div>
        <footer className="modal-footer">
          <span className="hint history-modal__note">{error && result ? error : '样式都铺成行内的了，粘贴后不用再调'}</span>
          <button className="btn btn-primary btn-wide" onClick={copy} disabled={!result || copying}><Copy size={16} /> {copying ? '正在复制…' : '复制'}</button>
        </footer>
      </div>
    </div>
  );
};

export default WechatCopyModal;
