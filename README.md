# iML Markdown Editor (v1.7.0)

**AI 时代的敏捷知识编辑中枢**
**极简其表 &middot; 极致内核** (Minimalist Surface, Maximalist Core).

![iML Main Interface](screenshots/ScreenShot_2026-03-17_034853_908.png)

## 🛡️ 核心哲学：灵感驱动，逻辑重塑
iML Markdown Editor 的诞生初衷，是让 **Vibe Coding 的第一步变得前所未有的简单**。

在 AI 编程时代，最大的挑战往往不是代码编写，而是如何将脑海中模糊的“灵感（Vibe）”转化为 AI 能够无损理解的“指令”。iML 旨在成为您与 AI 之间的最优接口，通过 **指令级 AI 助手** 与 **工程化文档系统**，让您的想象力能够毫无障碍地传递给 AI 编程工具。

作为一款根植于本地系统的编辑器，v1.7.0 版本更进一步，进化为具备**深度文件管理**能力的“知识管理库（Knowledge Base）”。它提供了极速的文件系统响应、专业的排版渲染以及丝滑的编辑体验，确保无论是在深度 AI 创作还是日常知识沉淀中，都能让您得心应手。

## ✨ 核心特性

### 🪄 AI 灵感驱动 (Knowledge Architect)
集成极致精简的 **指令级 AI 面板**，支持全链路流式生成，实现从灵感维度到标准 PRD/原型/文档的跨越：
- **常驻发送指令**：重新设计的 AI 气泡，具备实体感按钮与确认状态，优化盲操体验。
- **智能上下文引用**：一键引入文档大纲与全量内容，实现具备“逻辑深度”的内容润色与扩写。
- **AI 场景化工作室**：PRD 文档、Google AI Studio Prompts、Stitch 原型、Nano Banana PPT 模板等深度集成。

### 📁 深度文件管理系统 (File Management)
- **原生级右键菜单**：侧边栏支持重命名、复制副本、新建子文档、推入回收站等高阶操作。
- **极客快捷键网格**：`F2` 重命名、`Cmd+D` 快速克隆、`Backspace` 快速删除。
- **智能收藏与近期**：支持文档星标收藏，并自动记录近期活动文件，实现秒级上下文恢复。
- **无感自动保存**：监听失焦（Blur）事件自动存盘，确保数据安全万无一失。

### 🎨 极简控制台 (Smart Dashboard)
- **智能启动页**：当关闭所有标签页时，自动唤起具备毛玻璃质感的 Dashboard，展示近期文件与核心入口。
- **会话持久化 (Session Restore)**：冷启动时自动恢复上次的工作区、已打开的标签页（Tabs）及滚动位置。
- **可定制启动行为**：自由切换“恢复上次会话”或“展示启动控制台”。

### ⌨️ 专业级编辑能力
- **双模态无缝切换**：基于 Tiptap 2.0 (富文本) 与 CodeMirror 6 (源码模式)，支持物理隔离的图表编辑体验。
- **响应式图形引擎**：集成 Mermaid 与 SVG 实时渲染，支持 **拖拽式高度拉伸** 与等比缩放。
- **纸张态沉浸排版**：视网膜级“白纸”交互图层，背景随内容动态拉伸，带给您如同纸笔书写般的宁静感。

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
# 生成 Windows/Mac (x64/arm64) 安装包
npm run build
```

## 🛠 技术架构
- **Core**: React 19 + Vite + TypeScript
- **Runtime**: Electron (Main/Preload Bridge Layer)
- **State**: Zustand (Local Persistence Engine)
- **Engine**: Tiptap Gen-2 (Rich Text) / CodeMirror 6 (Markdown)
- **Styling**: Glassmorphism CSS Variables System

## ⌨️ 核心快捷键
| 动作 | 快捷键 |
|---|---|
| 新建 / 打开 / 保存 | `⌘ N` / `⌘ O` / `⌘ S` |
| 侧边栏重命名 / 克隆 | `F2` / `⌘ D` |
| 切换编辑模式 / 侧边栏 | `⌘ E` / `⌘ B` |
| 打开设置中心 / 关于 | `⌘ ,` / `⌘ I` |
| 另存为 | `⌘ ⇧ S` |

## 📄 许可证 & 愿景
本项目采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) 许可证。未经授权，禁止商业用途。

Logic & Design by [imoling.cn@gmail.com](mailto:imoling.cn@gmail.com) | Architected with Antigravity AI

&copy; 2026 iML Studio. **极简其表，极致内核。让 AI 真正读懂你的 Vibe。**

[![CC BY-NC 4.0](https://licensebuttons.net/l/by-nc/4.0/88x31.png)](https://creativecommons.org/licenses/by-nc/4.0/)