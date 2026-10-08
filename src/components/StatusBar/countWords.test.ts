import { describe, expect, it } from 'vitest';
import { countWords } from './StatusBar';

describe('状态栏字数', () => {
  it('中西文混排：中文按字、英文按词', () => {
    expect(countWords('你好 world 再见').words).toBe(5);
    expect(countWords('a\nb\nc').lines).toBe(3);
  });
  it('写进文档里的图片（base64）不算字（#10）', () => {
    const withImage = `一张图\n\n![图](data:image/png;base64,${'iVBORw0KGgoAAAANSUhEUg'.repeat(2000)})\n`;
    const withoutBase64 = '一张图\n\n![图]()\n';
    expect(countWords(withImage).words).toBe(countWords(withoutBase64).words);
  });
});
