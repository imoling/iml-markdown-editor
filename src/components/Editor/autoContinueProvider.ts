import type { AutoContinueProvider } from '../../extensions/AutoContinue';
import { useAppStore } from '../../stores/appStore';
import { buildContinueMessages, cleanContinuation, MAX_TOKENS } from '../../utils/autoContinue';

/**
 * 自动续写走「写作助手」同一个模型服务。请求带 quiet：
 * 出错一律不吭声（停顿一下就弹一条错误没法写字）；本机模型正在给生图 / 转写让位时主进程直接跳过，不去抢内存。
 */
export const autoContinueProvider: AutoContinueProvider = {
  settings: () => {
    const { aiEnabled, autoContinue } = useAppStore.getState();
    return aiEnabled && autoContinue.enabled ? { delay: autoContinue.delay } : null;
  },
  request: ({ before, after, onUpdate }) => {
    const rid = `ac-${Math.random().toString(36).slice(2, 9)}`;
    let raw = '';
    let last = '';
    const done = window.api.ai
      .chat(buildContinueMessages(before, after), (chunk: string) => {
        raw += chunk;
        const text = cleanContinuation(raw, before);
        if (text && text !== last) { last = text; onUpdate(text); }
      }, rid, MAX_TOKENS, 0.4, { quiet: true })
      .then(() => undefined)
      .catch(() => undefined);
    return { done, cancel: () => window.api.ai.stop(rid) };
  },
};
