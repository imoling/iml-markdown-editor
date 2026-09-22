/**
 * 导出（PDF / HTML / 长图）里公式要用的 KaTeX 样式与字体。
 * 导出用的 HTML 经过净化后只剩 KaTeX 的 HTML 结构（MathML 被去掉了），没有这份样式，分数、上下标全都摊成一行字；
 * 而导出是在另一个隐藏窗口里排版、或者拿到别的电脑上看的，界面已经加载的字体帮不上忙——字体也得内联进去。
 * 这几个函数和轻量版「iML 编辑器」的 exportImage.ts 里的逐字相同，改了要两边同步。
 */

// KaTeX 的字体不内联进 JS：界面渲染公式本来就要带一份 woff2，再内联一份 base64 等于安装包白背二百多 KB。
// 这里只记下包里那一份的地址，导出时才去读（见 readBundledFile）
const katexFonts = import.meta.glob('/node_modules/katex/dist/fonts/*.woff2', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

/** KaTeX 样式表里的字体地址（开发时是原文件名，打包后带哈希）→ 包里那一份字体的键 */
export function katexFontKey(url: string, keys: string[]): string | null {
  const name = /KaTeX_[A-Za-z0-9]+-[A-Za-z]+/.exec(url)?.[0];
  return (name && keys.find((k) => k.endsWith(`/${name}.woff2`))) || null;
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * 把应用包里的一个文件读成 data: 地址。先用 fetch；正式包的页面来自 file://，那里 fetch 不认这个协议，
 * 退回 XMLHttpRequest（file:// 下状态码是 0）。都读不到就返回 null，由调用的地方决定怎么凑合
 */
export async function readBundledFile(url: string, type: string): Promise<string | null> {
  if (url.startsWith('data:')) return url;
  let bytes: ArrayBuffer | null = null;
  try {
    const res = await fetch(url);
    if (res.ok) bytes = await res.arrayBuffer();
  } catch { /* 换下面那条路 */ }
  if (!bytes) {
    bytes = await new Promise<ArrayBuffer | null>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => resolve((xhr.status === 200 || xhr.status === 0) && xhr.response ? (xhr.response as ArrayBuffer) : null);
      xhr.onerror = () => resolve(null);
      xhr.send();
    });
  }
  return bytes && bytes.byteLength ? toDataUrl(new Blob([bytes], { type })) : null;
}

/**
 * 导出的内容里有公式时要带上的 KaTeX 样式。
 * withFonts：离开应用也要能看的（单文件 HTML）和在别的窗口里排版的（PDF、长图）把字体也内联进去；
 * 还在应用页面里的用界面已经加载的同名字体就行。拿不到就返回空串——公式难看一点，总比导出失败强
 */
export async function katexStyles(withFonts: boolean): Promise<string> {
  try {
    const raw = (await import('katex/dist/katex.min.css?inline')).default as string;
    if (!withFonts) return raw;
    return await inlineFontFaces(raw, async (url) => { const key = katexFontKey(url, Object.keys(katexFonts)); return key ? readBundledFile(katexFonts[key], 'font/woff2') : null; });
  } catch (err) {
    console.warn('[export] KaTeX styles unavailable:', err);
    return '';
  }
}

/**
 * KaTeX 样式表里的 @font-face：每种字体列了 woff2 / woff / ttf 三个地址，只留 woff2，并换成 load 给回来的 data: 地址。
 * 取不到的字体整条去掉（那几个字形退回系统字体，总比整份导出出不来强）
 */
export async function inlineFontFaces(css: string, load: (url: string) => Promise<string | null>): Promise<string> {
  const faces = css.match(/@font-face\s*\{[^}]*\}/g) || [];
  const replaced = await Promise.all(faces.map(async (face) => {
    // 很小的字体（不到 4 KB）打包时已经被内联成 data: 地址了，直接用那一份；
    // 下面换 src 的时候 url(...) 要整个认：data: 地址里自己带分号（;base64），不能在那儿断开
    const inlined = /url\(\s*["']?(data:font\/woff2[^"')]+)["']?\s*\)/i.exec(face)?.[1];
    const url = /url\(\s*["']?([^"')]+\.woff2[^"')]*)["']?\s*\)/i.exec(face)?.[1];
    const data = inlined || (url ? await load(url) : null);
    return data ? face.replace(/src\s*:(?:url\([^)]*\)|[^;}])*/i, `src:url(${data}) format("woff2")`) : '';
  }));
  return faces.reduce((out, face, i) => out.replace(face, replaced[i]), css);
}
