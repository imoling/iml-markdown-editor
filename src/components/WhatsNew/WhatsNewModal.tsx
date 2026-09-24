import React, { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ExternalLink, Check } from 'lucide-react';
import type { WhatsNewEntry, WhatsNewImage } from '../../data/whatsNew';
import heroImg from '../../assets/whats-new/hero.png';
import slashImg from '../../assets/whats-new/slash.png';
import wikiImg from '../../assets/whats-new/wiki.png';
import searchImg from '../../assets/whats-new/search.png';
import dailyImg from '../../assets/whats-new/daily.png';
import localImg from '../../assets/whats-new/local.png';
import v262Hero from '../../assets/whats-new/v262-hero.webp';
import v262Source from '../../assets/whats-new/v262-source.webp';
import v262Compat from '../../assets/whats-new/v262-compat.webp';
import v262Paste from '../../assets/whats-new/v262-paste.webp';
import v262History from '../../assets/whats-new/v262-history.webp';
import v262Semantic from '../../assets/whats-new/v262-semantic.webp';
import v262Focus from '../../assets/whats-new/v262-focus.webp';
import v263Hero from '../../assets/whats-new/v263-hero.webp';
import v263Ask from '../../assets/whats-new/v263-ask.webp';
import v263Transcribe from '../../assets/whats-new/v263-transcribe.webp';
import v263Playback from '../../assets/whats-new/v263-playback.webp';
import v263Config from '../../assets/whats-new/v263-config.webp';
import v263Update from '../../assets/whats-new/v263-update.webp';
import v264Hero from '../../assets/whats-new/v264-hero.webp';
import v264Palette from '../../assets/whats-new/v264-palette.webp';
import v264Tasks from '../../assets/whats-new/v264-tasks.webp';
import v264Daily from '../../assets/whats-new/v264-daily.webp';
import v264Export from '../../assets/whats-new/v264-export.webp';
import v264Transcribe from '../../assets/whats-new/v264-transcribe.webp';
import v264AsrConfig from '../../assets/whats-new/v264-asrconfig.webp';
import v265Image from '../../assets/whats-new/v265-image.webp';
import v265Hero from '../../assets/whats-new/v265-hero.webp';
import v265Resources from '../../assets/whats-new/v265-resources.webp';
import v265Fold from '../../assets/whats-new/v265-fold.webp';
import v265Syscap from '../../assets/whats-new/v265-syscap.webp';
import v265Wechat from '../../assets/whats-new/v265-wechat.webp';
import v265Daily from '../../assets/whats-new/v265-daily.webp';
import v266AutoContinue from '../../assets/whats-new/v266-autocontinue.webp';
import v266Accepted from '../../assets/whats-new/v266-accepted.webp';
import v266Settings from '../../assets/whats-new/v266-settings.webp';
import v266Start from '../../assets/whats-new/v266-start.webp';

const IMAGES: Record<WhatsNewImage, string> = {
  hero: heroImg, slash: slashImg, wiki: wikiImg, search: searchImg, daily: dailyImg, local: localImg,
  'v262-hero': v262Hero, 'v262-source': v262Source, 'v262-compat': v262Compat, 'v262-paste': v262Paste,
  'v262-history': v262History, 'v262-semantic': v262Semantic, 'v262-focus': v262Focus,
  'v263-hero': v263Hero, 'v263-ask': v263Ask, 'v263-transcribe': v263Transcribe, 'v263-playback': v263Playback, 'v263-config': v263Config, 'v263-update': v263Update,
  'v264-hero': v264Hero, 'v264-palette': v264Palette, 'v264-tasks': v264Tasks, 'v264-daily': v264Daily, 'v264-export': v264Export, 'v264-transcribe': v264Transcribe, 'v264-asrconfig': v264AsrConfig,
  'v265-image': v265Image, 'v265-hero': v265Hero, 'v265-resources': v265Resources, 'v265-fold': v265Fold, 'v265-syscap': v265Syscap, 'v265-wechat': v265Wechat, 'v265-daily': v265Daily,
  'v266-autocontinue': v266AutoContinue, 'v266-accepted': v266Accepted, 'v266-settings': v266Settings, 'v266-start': v266Start,
};

interface Props {
  entry: WhatsNewEntry;
  onClose: () => void;
}

/** 首次安装 / 升级后展示的新特性介绍：左文右图，一页一个特性；帮助菜单里也能随时打开 */
export const WhatsNewModal: React.FC<Props> = ({ entry, onClose }) => {
  const [index, setIndex] = useState(0);
  const pages = entry.pages;
  const page = pages[index];
  const last = index === pages.length - 1;

  const go = (next: number) => setIndex(Math.max(0, Math.min(pages.length - 1, next)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1);
      else if (e.key === 'ArrowLeft') go(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, pages.length]);

  if (!page) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--flush whats-new" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="icon-btn whats-new__close" title="关闭"><X size={18} /></button>

        <div className="whats-new__stage" key={page.key}>
          <div className="whats-new__copy">
            <div className="whats-new__kicker">
              <span className="whats-new__version">{entry.version}</span>
              {page.kicker}
            </div>
            <h1 className="whats-new__title">
              {page.title}
              {page.hint && <kbd className="whats-new__hint">{page.hint}</kbd>}
            </h1>
            <p className="whats-new__desc">{page.desc}</p>
            {page.bullets && (
              <ul className="whats-new__bullets">
                {page.bullets.map((b) => <li key={b}><Check size={13} /><span>{b}</span></li>)}
              </ul>
            )}
            {last && entry.removed && <div className="whats-new__removed">{entry.removed}</div>}
          </div>
          <div className={`whats-new__visual whats-new__visual--${page.image}`}>
            <img className="whats-new__img" src={IMAGES[page.image]} alt={page.title} draggable={false} />
          </div>
        </div>

        <footer className="whats-new__footer">
          <button className="btn-link" onClick={() => window.api.shell.openExternal(entry.releaseUrl)}><ExternalLink size={12} /> 完整更新日志</button>
          <div className="whats-new__dots">
            {pages.map((p, i) => (
              <button key={p.key} className={`whats-new__dot ${i === index ? 'whats-new__dot--active' : ''}`} onClick={() => go(i)} title={p.title} />
            ))}
          </div>
          <div className="row gap-8">
            {index > 0 && <button className="btn btn-secondary btn-xs whats-new__nav" onClick={() => go(index - 1)}><ChevronLeft size={14} /> 上一页</button>}
            {last
              ? <button className="btn btn-primary btn-xs whats-new__nav" onClick={onClose}>开始使用</button>
              : <button className="btn btn-primary btn-xs whats-new__nav" onClick={() => go(index + 1)}>下一页 <ChevronRight size={14} /></button>}
          </div>
        </footer>
      </div>
    </div>
  );
};
