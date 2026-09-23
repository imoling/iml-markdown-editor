# iML Markdown Editor

## 界面文案

通用规矩在全局 CLAUDE.md 的「界面文案」一节，这里只放这个项目的术语表和例外。
护栏测试：`src/test/uiCopy.test.ts`（跟着 `npm run check` 跑）。

### 术语表：一个概念一个词

| 用 | 不用 | 备注 |
|---|---|---|
| 笔记库 | 知识库、资料库、工作区 | |
| 笔记 | 文档 | 「文档」只在指非 Markdown 文件时用（导出 Word 文档） |
| 本机 | 本地 | 模型跑在用户电脑上叫「本机」；「本地」只给「本地文件 / 本地上传 / 本地服务」这类物理含义 |
| 本地服务 | 本地模型 | 指用户自己起的 Ollama / LM Studio |
| 启动 / 停止 | 起来 / 停掉 | 按钮和状态用书面词，说明文案里可以口语 |
| 点一下 | 点击 | |
| 设置里 | 设置中 | |
| 让位 | 腾地方、腾干净 | 内存不够时请别的模型下去，用完自己回来 |
| 转写 | 识别 | 「识别」只在说语音转文字这个技术动作时用 |

### 例外（护栏测试里放行的）

- **「智能 → 写作助手」的高级面板**（`LocalModelPanel.tsx` 与 `electron/localModel/*`）：
  这一页是给会折腾的人看的，允许出现 llama-server、GGUF、端口、线程数这类词。
- **提示词不是界面文案**：`useEditorAI.ts`、`utils/transcript.ts`、`utils/askNotes.ts`、
  `semantic/catalog.ts` 里的长句是写给模型的，不受长度和口吻的约束。
- **新特性介绍**（`data/whatsNew.ts`）是成段的文章，句末照常加句号。

### 跨进程共用的句子

主进程和界面不能互相 import 组件，但能共用 `electron/shared/uiText.ts`（`AI_DISABLED`、`MIC_DENIED`）。
只在界面里出现的共用句放 `src/utils/uiText.ts` 与 `src/components/AI/CopyNotes.tsx`。
同一句话不要抄两份——护栏测试会拦。
