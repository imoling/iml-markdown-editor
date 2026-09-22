import { afterEach, describe, expect, it, vi } from 'vitest';
import { inlineFontFaces, katexFontKey, readBundledFile } from './katexExport';

describe('导出里的公式样式与字体（和轻量版同一份实现）', () => {
  it('KaTeX 的 @font-face：只留 woff2 并换成内联地址；取不到的字体整条去掉，别的规则不动', async () => {
    const css = '@font-face{font-family:KaTeX_Main;src:url(fonts/Main.woff2) format("woff2"),url(fonts/Main.woff) format("woff"),url(fonts/Main.ttf) format("truetype");font-weight:400}'
      + '@font-face{font-family:KaTeX_Math;src:url(fonts/Math.woff2) format("woff2"),url(fonts/Math.ttf) format("truetype")}.katex{font:normal 1.21em KaTeX_Main}';
    const asked: string[] = [];
    const out = await inlineFontFaces(css, async (url) => { asked.push(url); return url.includes('Main') ? 'data:font/woff2;base64,AAAA' : null; });
    expect(asked).toEqual(['fonts/Main.woff2', 'fonts/Math.woff2']);
    expect(out).toBe('@font-face{font-family:KaTeX_Main;src:url(data:font/woff2;base64,AAAA) format("woff2");font-weight:400}.katex{font:normal 1.21em KaTeX_Main}');
  });

  it('打包时已经内联好的小字体（src 里第一个就是 data: 地址）：原样留着，不去读、也不丢掉；后面的 woff / ttf 地址去掉', async () => {
    const css = '@font-face{font-family:KaTeX_Size3;src:url(data:font/woff2;base64,d09GMgAB) format("woff2"),url(./KaTeX_Size3-Regular-x.woff) format("woff"),url(./KaTeX_Size3-Regular-y.ttf) format("truetype")}';
    const asked: string[] = [];
    const out = await inlineFontFaces(css, async (url) => { asked.push(url); return null; });
    expect(asked).toEqual([]);
    expect(out).toBe('@font-face{font-family:KaTeX_Size3;src:url(data:font/woff2;base64,d09GMgAB) format("woff2")}');
  });

  it('样式表里的字体地址认得出是哪一个字体：开发时的原文件名、打包后带哈希的都行', () => {
    const keys = ['/node_modules/katex/dist/fonts/KaTeX_Main-Regular.woff2', '/node_modules/katex/dist/fonts/KaTeX_Main-Bold.woff2', '/node_modules/katex/dist/fonts/KaTeX_Size1-Regular.woff2'];
    expect(katexFontKey('fonts/KaTeX_Main-Regular.woff2', keys)).toBe(keys[0]);
    expect(katexFontKey('/assets/KaTeX_Main-Bold-Cx986IdX.woff2', keys)).toBe(keys[1]);
    expect(katexFontKey('./assets/KaTeX_Size1-Regular-mCD8mA8B.woff2', keys)).toBe(keys[2]);
    expect(katexFontKey('/assets/KaTeX_Fraktur-Bold-abc.woff2', keys)).toBeNull();
  });

  describe('读包里的文件（公式字体不内联进 JS，导出时才读）', () => {
    afterEach(() => vi.unstubAllGlobals());
    const fakeXhr = (status: number, response: ArrayBuffer | null, fail = false) => class {
      status = status; response = response; responseType = ''; onload: (() => void) | null = null; onerror: (() => void) | null = null;
      open() {}
      send() { queueMicrotask(() => (fail ? this.onerror?.() : this.onload?.())); }
    };

    it('fetch 读得到：按给定的类型包成 data: 地址（服务器回什么类型不管）', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer })));
      expect(await readBundledFile('/assets/KaTeX_Main-Regular-abc.woff2', 'font/woff2')).toBe('data:font/woff2;base64,AQID');
    });

    it('fetch 不认 file://（正式包）：退回 XMLHttpRequest，那里状态码是 0 也算读到', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('URL scheme "file" is not supported.'); }));
      vi.stubGlobal('XMLHttpRequest', fakeXhr(0, new Uint8Array([1, 2, 3]).buffer));
      expect(await readBundledFile('file:///app/dist/assets/x.woff2', 'font/woff2')).toBe('data:font/woff2;base64,AQID');
    });

    it('两条路都读不到：返回 null，不抛（那个字体退回系统字体）；已经是 data: 地址的原样给回', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) })));
      vi.stubGlobal('XMLHttpRequest', fakeXhr(404, null, true));
      expect(await readBundledFile('/assets/gone.woff2', 'font/woff2')).toBeNull();
      expect(await readBundledFile('data:font/woff2;base64,AAAA', 'font/woff2')).toBe('data:font/woff2;base64,AAAA');
    });
  });
});
