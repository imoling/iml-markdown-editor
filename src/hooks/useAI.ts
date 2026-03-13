import { useState } from 'react';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export const useAI = () => {
  const [loading, setLoading] = useState(false);

  const generate = async (
    messages: Message[], 
    onStream?: (content: string) => void
  ) => {
    setLoading(true);
    try {
      // 通过 IPC 调用主进程的 chat 方法，避开 CSP 限制
      const result = await window.api.ai.chat(messages, (chunk) => {
        if (onStream) {
          onStream(chunk);
        }
      });
      return result;
    } catch (err: any) {
      console.error('AI Request Error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { generate, loading };
};
