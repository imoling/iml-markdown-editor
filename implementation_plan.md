# iML-MarkdownEditor 实施计划

## 概述1

基于 PRD 文档，构建一款专为 macOS 设计的本地双模态 Markdown 编辑器。支持 Markdown 源码模式与类 Word 富文本 (WYSIWYG) 模式无缝切换。无账号、无云端，极致保护隐私。

* * *

## 技术选型

层级技术方案选择理由**桌面框架**Electron 33+macOS 原生体验 + 跨平台**构建工具**Vite 6极速 HMR，开发体验极佳**前端框架**React 19生态丰富，组件化开发**富文本编辑器**Tiptap v2 (ProseMirror)高度可定制的 WYSIWYG 编辑器**源码编辑器**CodeMirror v6专业级代码/Markdown 编辑器**数学公式**KaTeX高性能 LaTeX 渲染**代码高亮**highlight.js / ShikiGFM 代码块语法高亮**样式方案**CSS Modules + CSS Variables模块化 + 主题化**文件导出**docx (npm) + puppeteer/html-pdfWord/PDF 导出

* * *

## UI 设计方案

### 设计风格

采用 **深色主题 + macOS 原生融合** 风格：

*   **背景色系**: 深沉炭黑 `#0B0B0E` → 卡片 `#16161A` → 高亮 `#1A1A1E`
    
*   **文字色系**: 主文字 `#FAFAF9`、辅助文字 `#6B6B70`、占位符 `#4A4A50`
    
*   **强调色**: 翡翠绿 `#32D583`（成功/激活）、靛蓝 `#6366F1`（主操作）、珊瑚红 `#E85A4F`（警告）
    
*   **字体**: SF Pro / Inter（UI 文字） + JetBrains Mono / Fira Code（代码）
    
*   **圆角**: 卡片 12-16px、按钮 8-10px、全圆角标签 31px
    
*   **毛玻璃效果**: 侧边栏透明模糊，符合 macOS 14+ 风格
    

### 界面结构

```
┌─────────────────────────────────────────────────────┐
│  Traffic Light Buttons  │    Tab Bar    │  Window   │  ← 标题栏
├──────────┬──────────────────────────────┤  Controls │
│          │  Format Toolbar (可隐藏)      │           │
│  左侧栏  ├──────────────────────────────┤           │
│  240px   │                              │           │
│ ┌──────┐ │     编辑区 (主区域)            │           │
│ │文件树 │ │                              │           │
│ │      │ │   Word 模式: Tiptap WYSIWYG  │           │
│ └──────┘ │   MD 模式: CodeMirror + 预览  │           │
│ ┌──────┐ │                              │           │
│ │搜索  │ │                              │           │
│ │替换  │ │                              │           │
│ └──────┘ │                              │           │
├──────────┴──────────────────────────────┤           │
│  Status Bar: 字数 | 行:列 | 编码 | 模式  │           │
└─────────────────────────────────────────────────────┘
```

### Pen 文件中设计的界面

1.  **主界面完整布局** — 展示三栏结构的完整编辑器界面
    
2.  **Word 模式** — 展示富文本编辑状态下的 UI
    
3.  **Markdown 模式** — 展示源码编辑 + 实时预览的 UI
    

* * *

## 项目结构

```
iml-markdown-editor/
├── electron/
│   ├── main.ts              # Electron 主进程
│   ├── preload.ts           # 预加载脚本 (IPC通信)
│   └── ipc/                 # IPC 处理器
│       ├── fileSystem.ts    # 文件系统操作
│       └── dialog.ts        # 原生对话框
├── src/
│   ├── main.tsx             # React 入口
│   ├── App.tsx              # 根组件
│   ├── styles/
│   │   ├── index.css        # 全局样式 + CSS Variables
│   │   └── reset.css        # 样式重置
│   ├── components/
│   │   ├── Sidebar/         # 左侧导航栏
│   │   │   ├── FileTree.tsx
│   │   │   ├── SearchPanel.tsx
│   │   │   └── Sidebar.tsx
│   │   ├── Editor/          # 编辑区
│   │   │   ├── TiptapEditor.tsx    # Word 模式
│   │   │   ├── MarkdownEditor.tsx  # MD 模式
│   │   │   ├── TabBar.tsx          # 多标签
│   │   │   └── EditorContainer.tsx
│   │   ├── Toolbar/         # 顶部工具栏
│   │   │   └── FormatToolbar.tsx
│   │   ├── StatusBar/       # 底部状态栏
│   │   │   └── StatusBar.tsx
│   │   └── common/          # 通用组件
│   │       ├── Button.tsx
│   │       ├── IconButton.tsx
│   │       └── Tooltip.tsx
│   ├── hooks/               # 自定义 Hooks
│   │   ├── useFileSystem.ts
│   │   ├── useEditor.ts
│   │   └── useShortcuts.ts
│   ├── stores/              # 状态管理
│   │   ├── editorStore.ts
│   │   └── fileStore.ts
│   ├── extensions/          # Tiptap 扩展
│   │   ├── codeBlock.ts
│   │   ├── mathBlock.ts
│   │   └── imageBlock.ts
│   └── utils/
│       ├── markdown.ts      # MD 解析工具
│       └── export.ts        # 导出功能
├── package.json
├── vite.config.ts
├── electron-builder.json
└── tsconfig.json
```

* * *

## 分阶段开发计划

### Phase 1: 项目初始化 (Day 1)

#### \[NEW\] package.json

*   Electron + Vite + React 依赖配置
    
*   开发脚本与构建脚本
    

#### \[NEW\] electron/main.ts

*   Electron 主进程窗口创建
    
*   macOS 毛玻璃效果 (vibrancy)
    
*   窗口尺寸与行为配置
    

#### \[NEW\] src/styles/index.css

*   CSS Variables 设计系统
    
*   全局字体、颜色、间距定义
    

* * *

### Phase 2: 核心 UI 框架 (Day 2-3)

#### \[NEW\] src/components/Sidebar/

*   FileTree: 递归文件树组件，支持展开/折叠
    
*   SearchPanel: 搜索替换面板，支持正则匹配
    
*   Sidebar: 容器组件，Tab 切换
    

#### \[NEW\] src/components/Editor/

*   TabBar: 多标签管理
    
*   EditorContainer: 编辑器容器，管理模式切换
    

#### \[NEW\] src/components/StatusBar/

*   字数/行数统计
    
*   光标行列位置
    
*   当前模式显示
    

* * *

### Phase 3: 编辑器引擎 (Day 4-6)

#### \[NEW\] src/components/Editor/TiptapEditor.tsx

*   Tiptap v2 富文本编辑器
    
*   浮动格式条 (Bubble Menu)
    
*   代码块、公式、表格插入
    

#### \[NEW\] src/components/Editor/MarkdownEditor.tsx

*   CodeMirror v6 源码编辑器
    
*   GFM 语法高亮
    
*   实时预览 + 同步滚动
    

#### \[NEW\] src/extensions/

*   codeBlock: 带语言选择器的代码块
    
*   mathBlock: KaTeX 公式编辑框
    
*   imageBlock: 拖拽图片管理
    

* * *

### Phase 4: 文件系统与导出 (Day 7-8)

#### \[NEW\] electron/ipc/fileSystem.ts

*   文件读写、目录扫描
    
*   最近文件记录
    

#### \[NEW\] src/utils/export.ts

*   Markdown → DOCX 转换
    
*   Markdown → PDF 生成
    

* * *

## User Review Required

> \[!IMPORTANT\] **关于技术选型的三个关键决策：**
> 
> 1.  **Electron vs Tauri**: 选择 Electron 是因为生态丰富（Tiptap、CodeMirror 原生支持），但打包体积较大。如需更极致的性能和更小体积，可考虑 Tauri。
>     
> 2.  **状态管理**: 计划使用 Zustand（轻量级），还是偏好 Jotai/Recoil 等原子化方案？
>     
> 3.  **UI 界面设计**: 将在 .pen 文件中设计 3 个核心界面。完成后请确认设计方向是否符合预期。
>     

* * *

## 验证计划

### 自动化测试

```bash
# 构建测试 - 确保项目无编译错误
npm run build

# 开发环境启动测试
npm run dev
# 验证: Electron 窗口正常打开，显示编辑器界面
```

### 手动验证

1.  **界面布局验证**: 启动应用，确认三栏布局正确显示
    
2.  **模式切换**: 按 `Cmd+E`，确认 Word/MD 模式无缝切换
    
3.  **文件操作**: 新建/打开/保存 .md 文件
    
4.  **侧边栏**: 确认文件树正确显示目录结构，搜索功能正常
    
5.  **Rich Text**: Word 模式下插入代码块 (`Cmd+Shift+C`) 和公式 (`Cmd+Shift+M`)
    
6.  **导出**: 导出为 .docx 和 .pdf，验证格式正确
    

### UI 设计验证

*   使用 Pencil 工具截图验证每个设计界面的布局和视觉效果