# iML Markdown Editor

一款追求极致简洁与专业排版的 Markdown 桌面编辑器，专为纯粹书写而生。

![iML Logo](assets/logo.png)

## ✨ 核心特性

- **双模态自由切换**：
  - **富文本模式 (Word 模式)**：基于 Tiptap，提供所见即所得的流畅编辑体验。
  - **源码模式 (Markdown 模式)**：基于 CodeMirror 6，支持实时预览与精准控制。
- **现代化视觉设计**：采用 Nordic Clarity 风格，辅以 macOS 毛玻璃背景效果与细腻动画。
- **专业排版能力**：
  - 支持 GFM 标准表格操作。
  - 代码高亮显示。
  - 数学公式渲染。
- **极致的原生体验**：
  - 采用自定义 TitleBar，深度适配 macOS 窗口风格。
  - 独立窗口设计的“关于”与“快捷键说明”。
  - 高性能的文件系统响应。

## 🚀 快速开始

### 环境依赖
- Node.js (推荐 v18+)
- npm 或 yarn

### 运行开发环境
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 构建应用
```bash
# 生成分发包
npm run build:mac
```

## 🛠 技术架构
- **核心框架**: React + Vite
- **原生容器**: Electron
- **状态管理**: Zustand
- **编辑器内核**: Tiptap (Rich Text), CodeMirror 6 (Source)
- **样式方案**: Vanilla CSS (CSS Variables)

## ⌨️ 常用快捷键
- `Cmd + N`: 新建文件
- `Cmd + O`: 打开文件
- `Cmd + S`: 保存文件
- `Cmd + E`: 切换编辑模式 (Word/Markdown)
- `Cmd + B`: 切换侧边栏显隐
- `Cmd + /`: 查看快捷键详细说明

## 🔗 项目链接
- **GitHub**: [https://github.com/imoling/iml-markdown-editor](https://github.com/imoling/iml-markdown-editor)

## 📄 许可证
Logic & Design by [imoling.cn@gmail.com](mailto:imoling.cn@gmail.com) | Developed by Gemini

&copy; 2026 iML Studio. 让书写回归纯粹。
