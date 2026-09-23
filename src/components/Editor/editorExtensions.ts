import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { ListItem } from '@tiptap/extension-list-item';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { lowlight } from '../../utils/highlight';
import { MathExtension } from '../../extensions/MathExtension';
import { DiagramExtension } from '../../extensions/DiagramExtension';
import { SVGExtension } from '../../extensions/SVGExtension';
import { SearchExtension } from '../../extensions/SearchExtension';
import { CustomHeadingEnter, ShortcutOverrides } from '../../extensions/EditorKeymaps';
import { SlashCommand } from '../../extensions/SlashCommand';
import { WikiLink } from '../../extensions/WikiLink';
import { WikiLinkSuggestion } from '../../extensions/WikiLinkSuggestion';
import { Frontmatter } from '../../extensions/Frontmatter';
import { Callout } from '../../extensions/Callout';
import { Toc } from '../../extensions/Toc';
import { WikiEmbed } from '../../extensions/WikiEmbed';
import { FootnoteLinks } from '../../extensions/FootnoteLinks';
import { MoveBlock } from '../../extensions/MoveBlock';
import { RawBlock, RawInline } from '../../extensions/RawHtml';
import { TimestampLinks } from '../../extensions/TimestampLinks';
import { Folding } from '../../extensions/Folding';
import { ImagePlaceholder } from '../../extensions/ImagePlaceholder';
import { InlineMath } from '../../extensions/InlineMath';
import { TagHighlight } from '../../extensions/TagHighlight';
import { Kbd, Subscript, Superscript, Highlight, SoftAwareHardBreak, NoteLink } from '../../extensions/InlineMarks';
import { NoteImage } from '../../extensions/NoteImage';
import { FocusMode } from '../../extensions/FocusMode';


/** 富文本编辑器的全部扩展；测试里也用同一份，保证序列化结果与真实编辑器一致 */
export const editorExtensions = [
  CustomHeadingEnter,
  ShortcutOverrides,
  SearchExtension,
  SlashCommand,
  WikiLink,
  WikiLinkSuggestion,
  // 兼容包：frontmatter / 提示块 / [TOC] / 原样保留的 HTML 与脚注 / 行内公式 / #标签 高亮
  Frontmatter,
  Callout,
  Toc,
  WikiEmbed,
  FootnoteLinks,
  MoveBlock,
  RawBlock,
  RawInline,
  TimestampLinks,
  Folding,
  ImagePlaceholder,
  InlineMath,
  TagHighlight,
  FocusMode,
  Kbd,
  Subscript,
  Superscript,
  Highlight,
  StarterKit.configure({
    codeBlock: false, 
    listItem: false,
    hardBreak: false,
  }), 
  SoftAwareHardBreak,
  ListItem.extend({
    content: 'block+',
  }),
  NoteImage.configure({ allowBase64: true }),
  Table.configure({
    resizable: true,
  }),
  TableRow,
  TableHeader,
  TableCell,
  CodeBlockLowlight.configure({
    lowlight,
  }),
  MathExtension,
  DiagramExtension,
  SVGExtension,
  TaskList,
  TaskItem.extend({
    content: 'block+',
  }).configure({
    nested: true,
  }),
  Underline,
  NoteLink.configure({
    openOnClick: false,
    // obsidian:// zotero:// 这类应用链接也要留住；只挡掉能执行脚本的协议
    isAllowedUri: (url) => !/^\s*(javascript|vbscript|data):/i.test(url || ''),
  }),
  TextAlign.configure({
    types: ['heading', 'paragraph', 'tableCell', 'tableHeader'],
  }),
  Placeholder.configure({
    placeholder: '在此开始你的写作…',
  })
];
