# iML Markdown Editor (v1.5.0)

一款融合 **Vibe Coding** 哲学与顶级 AI 创作能力的现代化 Markdown 桌面编辑器。专为纯粹书写、极致排版与高效构思而生。

![iML Logo](assets/logo.png)

## 🛡️ 核心哲学：书写，而非录入
iML 不仅仅是一个编辑器，它是您在“灵感”与“工程”之间的桥梁。我们坚持极致的设计美学，让每一次敲击都是一种享受。

## ✨ 核心特性

### 🪄 Vibe Coding AI 驱动 (New!)
集成深度定制的 AI 场景写作面板，支持 **双进程全链路 SSE 流式生成**，即刻实现从灵感到实体的跨越：
- **AI 编程需求文档**：将用户灵感转化为 AI 编程需求 PRD 文档。
- **AI Studio 验证系统**：生成 Google AI Studio 验证系统提示词。
- **Stitch 原型设计**：生成 Stitch 高交互界面提示词。
- **Nano Banana PPT**：定制 Nano Banana Pro 生成 PPT 提示词。
- **职场心流复盘**：日常工作整理成极具逻辑的专业汇报。
- **架构拆解与工程化**：生成 Vibe Coding 技术骨架并模块化拆解。

### 🎨 高端视觉与交互 (UI/UX)
- **纸张态沉浸排版**：富文本模式采用层次明晰的“白纸”交互图层，背景自适应深度增长，带来极致视网膜级的书写体验。
- **Modern Nordic Clarity**: 继承北欧简约设计，辅以 macOS 级原生地图、毛玻璃效果、以及丝滑的微动画。
- **极简标签管理**: 隐藏原生滚动条，支持活动标签自动居中，标签宽度根据负载智能收缩。
- **紧凑型交互弹窗**: 重新设计的确认对话框与快捷键面板，符合苹果原生系统的克制之美。

### ⌨️ 专业级编辑能力
- **双模态无缝切换**：
    - **富文本模式 (Rich Text)**：基于 Tiptap 2.0，支持 GFM 表格、气泡菜单引导与图片即时插入。
    - **源码模式 (Source Code)**：基于 CodeMirror 6，集成高性能实时预览、代码高亮与数学公式。
- **全场景安全审计**：实时追踪文档变更，针对新建文件与未保存更改提供三态（保存/不保存/取消）闭环保护。

## 🚀 运行与构建

### 开发环境
```bash
# 安装依赖
npm install

# 启动开发服务器 (自动开启 Electron 容器)
npm run dev
```

### 生产构建
```bash
# 生成 macOS 架构安装包
npm run build:mac
```

## 🛠 技术架构
- **Core**: React 18 + Vite + TypeScript
- **Runtime**: Electron (Main/Renderer Process Communication Layer)
- **State**: Zustand (Local Persistence)
- **Engine**: Tiptap (Rich Text) / CodeMirror 6 (Markdown)
- **Logic**: Node.js Native FS + Buffer-based SSE Streaming protocol
- **Styling**: Modern CSS Variables & Glassmorphism Design System

## ⌨️ 核心快捷键
| 动作 | 快捷键 |
|---|---|
| 新建 / 打开 / 保存 | `⌘ N` / `⌘ O` / `⌘ S` |
| 切换编辑模式 | `⌘ E` |
| 切换侧边栏 | `⌘ B` |
| 快捷键全览 | `⌘ /` |
| 另存为 | `⌘ ⇧ S` |

## 📄 许可证 & 愿景
Logic & Design by [imoling.cn@gmail.com](mailto:imoling.cn@gmail.com) | Built with Gemini

&copy; 2026 iML Studio. **让书写回归纯粹，让创作充满“Vibe”。**
