import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: { label: string; keys: string[] }[];
}

const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const [currentPage, setCurrentPage] = useState(0);
  if (!isOpen) return null;

  const isStandalone = new URLSearchParams(window.location.search).get('window') === 'shortcuts';
  const isMac = window.api.app.platform === 'darwin';
  const modKey = isMac ? '⌘' : 'Ctrl';
  const altKey = isMac ? '⌥' : 'Alt';

  const shortcutPages: ShortcutGroup[][] = [
    [
      {
        title: '文件操作',
        shortcuts: [
          { label: '新建文档', keys: [modKey, 'N'] },
          { label: '打开文件', keys: [modKey, 'O'] },
          { label: '快速打开笔记（敲几个字就跳过去）', keys: [modKey, 'T'] },
          { label: '命令面板（敲几个字找到要做的事）', keys: [modKey, '⇧', 'P'] },
          { label: '切换笔记库', keys: [modKey, '⇧', 'O'] },
          { label: '保存', keys: [modKey, 'S'] },
          { label: '另存为', keys: [modKey, '⇧', 'S'] },
          { label: '导出 PDF / HTML', keys: [modKey, 'P', '·', modKey, '⇧', 'E'] },
          { label: '今日日记', keys: [modKey, '⇧', 'D'] },
          { label: '版本历史', keys: [modKey, '⇧', 'H'] },
        ],
      },
      {
        title: '标签页',
        shortcuts: [
          { label: '关闭当前标签页', keys: [modKey, 'W'] },
          { label: '关闭其他标签页', keys: [altKey, modKey, 'W'] },
          { label: '关闭右侧 / 已保存 / 全部', keys: ['标签页上右键'] },
          { label: '重开刚关的标签页', keys: [modKey, '⇧', 'T'] },
          { label: '下一个 / 上一个', keys: ['⌃', 'Tab', '·', '⌃', '⇧', 'Tab'] },
          { label: '第 1~8 个 / 最后一个', keys: [modKey, '1~8', '·', modKey, '9'] },
          { label: '关闭窗口', keys: [modKey, '⇧', 'W'] },
        ],
      },
      {
        title: '视图与导航',
        shortcuts: [
          { label: '切换富文本 / 源码模式', keys: [modKey, 'E'] },
          { label: '显示 / 隐藏侧边栏', keys: [modKey, '\\'] },
          { label: '专注模式（Esc 退出）', keys: [modKey, '⇧', '.'] },
          { label: '折叠 / 展开当前小节（标题、列表；也可点左边的箭头）', keys: [altKey, modKey, '[', '·', altKey, modKey, ']'] },
          { label: '文档内查找', keys: [modKey, 'F'] },
          { label: '查找并替换', keys: [altKey, modKey, 'F'] },
          { label: '搜索所有笔记', keys: [modKey, '⇧', 'F'] },
          { label: '问你的笔记', keys: [modKey, 'J'] },
          { label: '实时转写时打点（在正文里插入现在的时间，之后点它回听）', keys: [modKey, '⇧', 'L'] },
          { label: '写作助手设置', keys: [modKey, '⇧', 'M'] },
          { label: '全局设置', keys: [modKey, ','] },
          { label: '快捷键说明', keys: [modKey, '/'] },
        ],
      },
    ],
    [
      {
        title: '文本格式（富文本模式）',
        shortcuts: [
          { label: '加粗 / 斜体 / 下划线', keys: [modKey, 'B', 'I', 'U'] },
          { label: '删除线', keys: [modKey, '⇧', 'X'] },
          { label: '行内代码', keys: [modKey, '`'] },
          { label: '插入链接', keys: [modKey, 'K'] },
          { label: '链接其他笔记', keys: ['[['] },
          { label: '行内公式（敲完自动渲染）', keys: ['$…$'] },
          { label: '引用块变提示块', keys: ['[!NOTE]', 'Space'] },
          { label: '标题 1 ~ 6', keys: [modKey, altKey, '1~6'] },
          { label: '无序 / 有序 / 任务列表', keys: [modKey, '⇧', '8 / 7 / 9'] },
          { label: '引用块', keys: [modKey, '⇧', 'B'] },
          { label: '撤销 / 重做', keys: [modKey, 'Z', '·', modKey, '⇧', 'Z'] },
        ],
      },
      {
        title: 'AI 助手（富文本模式）',
        shortcuts: [
          { label: '行首打开插入菜单（含 AI）', keys: ['/'] },
          { label: '空行行首唤起 AI 气泡', keys: ['Space'] },
          { label: '发送指令', keys: ['↵'] },
          { label: '关闭气泡', keys: ['Esc'] },
        ],
      },
    ],
    [
      {
        title: '表格',
        shortcuts: [
          { label: '下一个单元格', keys: ['Tab'] },
          { label: '上一个单元格', keys: ['⇧', 'Tab'] },
          { label: '增删行列 / 对齐', keys: ['选中文本后用气泡菜单'] },
        ],
      },
      {
        title: '笔记库',
        shortcuts: [
          { label: '重命名', keys: ['F2'] },
          { label: '创建副本', keys: [modKey, 'D'] },
          { label: '推入废纸篓', keys: ['⌫'] },
          { label: '新建笔记 / 文件夹', keys: ['库名右侧按钮或右键'] },
          { label: '按标签筛选', keys: ['点击正文里的 #标签'] },
        ],
      },
    ],
  ];
  const totalPages = shortcutPages.length;

  return (
    <div className={isStandalone ? 'standalone shortcuts-standalone' : 'modal-backdrop modal-backdrop--light'} onClick={onClose}>
      {isStandalone && <div className="standalone-drag shortcuts-drag" />}
      <div className={isStandalone ? 'shortcuts-card shortcuts-card--standalone' : 'shortcuts-card'} onClick={(e) => e.stopPropagation()}>
        <div className={`shortcuts-header ${isStandalone ? 'shortcuts-header--standalone' : ''}`}>
          <div className="row gap-10">
            <div className="shortcuts-icon"><Keyboard size={18} color="var(--color-accent-indigo)" /></div>
            <h2 className="shortcuts-title">快捷键说明</h2>
          </div>
          {(!isStandalone || !isMac) && (
            <button onClick={onClose} className="icon-btn"><X size={20} /></button>
          )}
        </div>

        <div className={`shortcuts-body ${isStandalone ? 'shortcuts-body--standalone' : ''}`}>
          {shortcutPages[currentPage].map((group) => (
            <div key={group.title} className="shortcuts-group">
              <h3 className="shortcuts-group__title"><span className="shortcuts-group__dot" />{group.title}</h3>
              <div className="col gap-10">
                {group.shortcuts.map((s) => (
                  <div key={s.label} className="row row--between">
                    <span className="text-md text-secondary">{s.label}</span>
                    <div className="row gap-4">
                      {s.keys.map((k, i) => <kbd key={i} className="kbd">{k}</kbd>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="shortcuts-footer">
          <div className="row gap-6">
            {shortcutPages.map((_, i) => (
              <div key={i} className={`shortcuts-dot ${i === currentPage ? 'shortcuts-dot--active' : ''}`} onClick={() => setCurrentPage(i)} />
            ))}
          </div>
          <div className="row gap-8">
            <button disabled={currentPage === 0} onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} className="btn btn-secondary btn-xs">
              <ChevronLeft size={14} /> 上一页
            </button>
            <button disabled={currentPage === totalPages - 1} onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))} className="btn btn-secondary btn-xs">
              下一页 <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsModal;
