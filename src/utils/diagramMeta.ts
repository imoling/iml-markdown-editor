/**
 * 图表卡片「看」的设置：缩放倍数和拖出来的高度，写在 Mermaid 代码第一行的注释里：
 *
 *     %% iml: zoom=0.8 height=320
 *
 * Mermaid 把 `%%` 开头的行当注释，GitHub、Obsidian、Typora 照常渲染、照常忽略；文件里别的东西不动。
 * 打开时这一行拆成节点属性、从代码里去掉（「代码」页看不到它），保存时按属性写回；都是默认值就不写这一行。
 */
export interface DiagramMeta {
  /** 1 是 Mermaid 自己定的自然大小 */
  zoom: number;
  /** 'auto' 或 '320px' */
  height: string;
}

export const DEFAULT_DIAGRAM_META: DiagramMeta = { zoom: 1, height: 'auto' };
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;

const META_LINE = /^%%\s*iml:([^\n]*)(?:\n|$)/;

export const clampZoom = (zoom: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));

/** 拆出第一行的设置；没有这一行就是默认值，代码原样 */
export function splitDiagramMeta(code: string): { code: string; meta: DiagramMeta } {
  const m = META_LINE.exec(code);
  if (!m) return { code, meta: { ...DEFAULT_DIAGRAM_META } };
  const meta = { ...DEFAULT_DIAGRAM_META };
  for (const [, key, value] of m[1].matchAll(/(\w+)=(\S+)/g)) {
    if (key === 'zoom') {
      const zoom = parseFloat(value);
      if (Number.isFinite(zoom) && zoom > 0) meta.zoom = clampZoom(zoom);
    } else if (key === 'height') {
      const height = parseInt(value, 10);
      if (height > 0) meta.height = `${height}px`;
    }
  }
  return { code: code.slice(m[0].length), meta };
}

/** 把设置写回第一行；全是默认值就不写 */
export function joinDiagramMeta(code: string, meta: DiagramMeta): string {
  const parts: string[] = [];
  if (meta.zoom !== 1) parts.push(`zoom=${clampZoom(meta.zoom)}`);
  const height = parseInt(meta.height, 10);
  if (meta.height !== 'auto' && height > 0) parts.push(`height=${height}`);
  return parts.length ? `%% iml: ${parts.join(' ')}\n${code}` : code;
}
