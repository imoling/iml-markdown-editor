import { useState } from 'react';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export const useAI = () => {
  const [loading, setLoading] = useState(false);

  const generate = async (
    messages: Message[], 
    onStream?: (content: string) => void,
    requestId?: string
  ) => {
    const rid = requestId || Math.random().toString(36).substring(7);
    setLoading(true);
    try {
      // 通过 IPC 调用主进程的 chat 方法，避开 CSP 限制
      const result = await window.api.ai.chat(messages, (chunk) => {
        if (onStream) {
          onStream(chunk);
        }
      }, rid);
      return result;
    } catch (err: any) {
      if (err.message === 'REQUEST_ABORTED') {
        console.log('[AI] Request aborted');
      } else {
        console.error('AI Request Error:', err);
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const stop = (requestId: string) => {
    window.api.ai.stop(requestId);
  };

  return { generate, stop, loading };
};
