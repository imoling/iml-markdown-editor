import Image from '@tiptap/extension-image';
import { resolveAssetUrl } from '../utils/assetUrl';
import { currentNoteDir } from '../utils/currentNoteDir';

/**
 * 图片节点：文档里保存的仍是 Markdown 里写的地址（assets/a.png），
 * 显示时按笔记所在目录解析成可加载的地址 —— 否则相对路径会相对应用自身去找，图片永远是裂的。
 *
 * 图下带一行图片描述（Markdown 的替代文字）；默认藏着，设置「图下显示图片描述」打开时才显示（#6）。
 * 外层多一个容器是为了放这行字，样式让它只包住图，选中框还是贴着图的。
 */
export const NoteImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // 源文件里路径带空格、又没用 <> 包起来的宽松写法：保存时原样写回
      lenient: {
        default: false,
        parseHTML: (el: HTMLElement) => el.hasAttribute('data-lenient'),
        renderHTML: (attrs: Record<string, any>) => (attrs.lenient ? { 'data-lenient': '' } : {}),
      },
    };
  },

  addNodeView() {
    return ({ node }) => {
      let current = node;
      const dom = document.createElement('div');
      dom.className = 'note-image';
      const img = document.createElement('img');
      const caption = document.createElement('div');
      caption.className = 'note-image__caption';
      dom.append(img, caption);
      const apply = () => {
        img.src = resolveAssetUrl(current.attrs.src || '', currentNoteDir());
        img.alt = current.attrs.alt || '';
        caption.textContent = current.attrs.alt || '';
        if (current.attrs.title) img.title = current.attrs.title;
        else img.removeAttribute('title');
      };
      apply();
      return {
        dom,
        update: (updated) => {
          if (updated.type !== current.type) return false;
          const changed = updated.attrs.src !== current.attrs.src || updated.attrs.alt !== current.attrs.alt || updated.attrs.title !== current.attrs.title;
          current = updated;
          if (changed) apply();
          return true;
        },
      };
    };
  },
});
