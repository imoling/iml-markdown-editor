import { describe, expect, it } from 'vitest';
import { abbreviateDataUrls, findDataUrlRanges, foldDataUrls, originalOffset, stripDataUrls } from './dataUrl';

const B64 = 'QUJD'.repeat(100); // 400 个字符 = 300 字节
const image = (alt = '图') => `![${alt}](data:image/webp;base64,${B64})`;

describe('写进笔记里的图片：那一长串 base64', () => {
  it('只算 base64 那一段，前面的 data:image/webp;base64, 留着；大小按字节算', () => {
    const text = `前面 ${image()} 后面`;
    const [range] = findDataUrlRanges(text);
    expect(text.slice(0, range.from).endsWith('data:image/webp;base64,')).toBe(true);
    expect(text.slice(range.from, range.to)).toBe(B64);
    expect(range.bytes).toBe(300);
    expect(findDataUrlRanges(text, 1000)[0].from).toBe(range.from + 1000);
  });

  it('短的（小图标）不算；不是图片的 data: 地址不算；一行里有几张就是几处', () => {
    expect(findDataUrlRanges('![](data:image/png;base64,AAAA)')).toEqual([]);
    expect(findDataUrlRanges(`data:text/plain;base64,${B64}`)).toEqual([]);
    expect(findDataUrlRanges(`${image('甲')} ${image('乙')}`)).toHaveLength(2);
  });

  it('去掉之后别的字一个不少；没有图的原样返回', () => {
    expect(stripDataUrls(`前面 ${image('甲')} 中间 ${image('乙')} 后面`)).toBe('前面 ![甲](data:image/webp;base64,) 中间 ![乙](data:image/webp;base64,) 后面');
    const plain = '# 标题\n\n没有图，只有 [链接](https://example.com)';
    expect(foldDataUrls(plain)).toEqual({ text: plain, cuts: [] });
    expect(abbreviateDataUrls(`${image('甲')} 后面`, (bytes) => `…${bytes}…`)).toBe('![甲](data:image/webp;base64,…300…) 后面');
    expect(abbreviateDataUrls(plain, () => 'x')).toBe(plain);
  });

  it('去掉之后的下标能换算回原文：图前面的不动，图后面的加上去掉的长度', () => {
    const original = `甲 ${image()} 乙 ${image()} 丙`;
    const { text, cuts } = foldDataUrls(original);
    for (const word of ['甲', '乙', '丙', '![图]', ')']) {
      for (let i = text.indexOf(word); i !== -1; i = text.indexOf(word, i + 1)) {
        expect(original.slice(originalOffset(cuts, i), originalOffset(cuts, i) + word.length)).toBe(word);
      }
    }
    expect(originalOffset(undefined, 7)).toBe(7);
  });
});
