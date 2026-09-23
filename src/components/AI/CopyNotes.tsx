import React from 'react';

/**
 * 几处配置页共用的定型句。以前各写各的（写作助手和 AI 配图里一字不差地各存了一份），
 * 改一处漏一处；统一放这里，界面上出现几次就是几次一样的话。
 */

/** API Key 存哪儿 */
export const KeyPrivacyNote: React.FC = () => (
  <div className="info-box__row">Key 加密存在本机，不上传</div>
);

/** 弹窗底部：这一页的改动不用点保存 */
export const LiveSettingsNote: React.FC<{ className?: string }> = ({ className }) => (
  <span className={className ?? 'hint'}>改动即时生效</span>
);
