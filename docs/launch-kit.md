# 发版分发物料

每次发版按这张清单走一遍。**稿子都在下面，直接复制改数字。**
诊断和完整方案见 `docs/github-traffic-plan.html`，流量记录见 `docs/traffic-log.md`。

---

## 发版日清单

```
□ Release 标题写「用户拿到什么」，不写版本号（护栏测试会拦自嘲 + 量化的写法）
□ 有新功能就换一张社交预览图（screenshots/social-preview.png → 仓库 Settings）
□ 公众号：文章 + 二维码 + 网盘直下 + 一句明确的「给个 star」
□ V2EX 分享创造
□ 即刻 / 小红书：15 秒录屏
□ 英文渠道：一次只发一个，间隔三天以上
□ 一周后：./scripts/traffic-log.sh，看哪个渠道有效
```

---

## 一、V2EX · 节点「分享创造」

> 标题写功能，不写产品名。V2EX 的人讨厌广告，喜欢「我做了个东西，技术上这么解决的」。

**标题**

```
做了个 Markdown 编辑器，AI 全在本机跑：写作、问笔记、转写、生图都不出电脑
```

**正文**

```
自己写笔记用的，做了半年，最近把 AI 那部分全搬到本机了。

四件事都在自己电脑上完成，笔记和声音都不上传：
- 写作助手：llama.cpp 托管 GGUF，模型用到才下，装包只有 80 MB
- 问你的笔记：本机嵌入模型建索引，答案只来自你的笔记，每条结论标出处
- 实时转写：sherpa-onnx + SenseVoice，开会边听边出字，能区分说话人（声纹只存本机）
- 本机生图：stable-diffusion.cpp，说一句话三分钟出图，图存在笔记旁边

做的过程中最麻烦的其实不是接模型，是**它们同时装不进 24 GB**。
所以写了个调度器：对话和嵌入合成一组一起启停，转写用时自动起、用完自己退，
生图出图时才起；内存按实测算（不是按文件大小猜——4.4 GB 的模型开 128k 上下文实际吃 8.8 GB），
不够时请对话模型让位、画完自己回来，对方正在回答就等它答完而不是直接报错。

笔记就是普通的 .md 文件，从 Obsidian 搬过来可以直接用（[[链接#小节]]、![[嵌入]]、别名、未链接提及都认）。
富文本模式保存时没编辑过的块一个字节都不动，git diff 里只有你改的那一行。

开源 MIT：https://github.com/imoling/iml-markdown-editor
macOS / Windows 都有安装包。轻量版（只有编辑器，4 MB）：https://github.com/imoling/iml-editor-lite

（另：如果你机器内存不大，出图尺寸调到 512 一分半一张，24 GB 跑 768 大概三分钟）
```

---

## 二、小众软件 appinn 投稿

> 投稿入口在 appinn.com 页面底部。他们喜欢「一句话说清楚 + 截图 + 下载地址」。

```
【名称】iML Markdown Editor
【平台】macOS（Apple 芯片 / Intel）、Windows（x64 / ARM）
【价格】免费开源（MIT）
【一句话】一个 Markdown 编辑器，AI 全在你自己电脑上跑，笔记不出门。

【介绍】
写作助手、问你的笔记、实时转写、本机生图——四件事全在本机完成，模型用到才下载，
笔记和录音都不上传。笔记是普通的 .md 文件，放在你自己的文件夹里。

富文本和源码双模式，保存时没编辑过的内容一个字节都不动；从 Obsidian 搬过来
双向链接、嵌入、属性、标签、日记都能直接用。导出 PDF / Word / 长图，
还能一键复制成公众号排好版的格式。

安装包 80~90 MB（模型不进安装包）。

【下载】https://github.com/imoling/iml-markdown-editor/releases/latest
【项目】https://github.com/imoling/iml-markdown-editor
```

---

## 三、Reddit · r/LocalLLaMA

> 这是回报最高的一个。角度不是「我做了个笔记软件」，是「我解决了本机多模型抢内存的问题」——
> 那个板块的人对调度、量化、内存占用有真兴趣。发之前先把 README.en.md 准备好（已经有了）。

**Title**

```
I built a notes app that runs chat, embeddings, ASR and image-gen fully local — with a scheduler so they don't OOM a 24GB laptop
```

**Body**

```
I write a lot of notes and wanted the AI parts to stay on my machine. Turned out the hard part
wasn't wiring up the models — it was that they don't fit in 24 GB at the same time.

What runs locally:
- chat / writing assistant — llama.cpp, any GGUF you like
- "ask your notes" — local embeddings + local chat, every answer cites the source note
- live transcription + speaker diarization — sherpa-onnx + SenseVoice, voiceprints never leave the machine
- image generation — stable-diffusion.cpp (Z-Image Turbo ~3 min for 768x768 on an M4)

The scheduler is the part I'd actually like feedback on:
- chat + embeddings start/stop as one group; ASR starts on record and exits on stop; image-gen starts on demand
- memory need is *measured*, not estimated from file size. A 4.4 GB Q8 model with a 128k context actually
  resides at 8.8 GB — the naive formula (file size + capped KV) under-counted by 2 GB and happily
  started things that then swapped. It now records peak RSS per (model, context) and reuses it.
- when memory is short it asks the chat model to step aside and brings it back when the job finishes;
  if the chat model is mid-answer it waits (up to 90s) instead of failing
- measured-vs-formula takes the max, because a sample taken right after fork reads 150 MB and
  planning memory off that is worse than not planning at all

Notes are plain .md files. Obsidian-style links/embeds/properties work, so you can point it at an existing vault.
MIT, macOS + Windows: https://github.com/imoling/iml-markdown-editor

Happy to answer anything about the llama.cpp / sd.cpp plumbing.
```

**回帖准备**：大概率会被问 ① 为什么不用 Ollama（答：也支持，本机托管只是零配置的默认）
② Linux 什么时候有（答：Electron 能打，但没测过，想要就提 issue）③ 模型推荐（答：见 Discussions 那个帖子）。

---

## 四、Hacker News · Show HN

> 周二到周四，北京时间晚上 10 点到凌晨 1 点之间发（对应美西早上）。标题不要带感叹号。

```
Show HN: A Markdown editor where the AI never leaves your laptop
```

**第一条评论**（自己发，说清楚动机和技术选择）：

```
Author here. The goal was simple: keep writing in plain .md files, but have the AI parts
(writing help, retrieval over my own notes, meeting transcription, illustrations)
run on the same laptop instead of somebody's server.

Stack: Electron + Tiptap for the editor, llama.cpp for chat/embeddings,
sherpa-onnx for speech, stable-diffusion.cpp for images.

The interesting engineering problem was memory. Four model servers don't fit in 24 GB,
so there's a scheduler that groups them, measures their real resident size, and makes them
take turns — including waiting for the chat model to finish answering before evicting it.

Interface is Chinese today; the README has an English version and an English UI is on the list.
```

---

## 五、公众号文末模块（每篇都放）

> 微信里点不开 GitHub 链接，这是目前最大的一处漏水。

```
━━━━━━━━━━━━━━━

【下载】
· 网盘直下（不用翻墙）：<网盘短链>
· GitHub（觉得有用的话，帮我点个 star）：github.com/imoling/iml-markdown-editor

[二维码图片：指向 Releases 页或落地页]

开源 MIT，macOS / Windows 都有。
只想要个纯编辑器的，看轻量版（4 MB）：github.com/imoling/iml-editor-lite
```

**要点**
- 二维码必须有：微信里链接点不开，但扫码能跳浏览器
- 网盘和 GitHub 两个入口都给：想快的走网盘，愿意支持的去 GitHub
- **明确请求 star**：不说没人点。09-22 那天 85 个访客带来 6 个 star，说一句能更高

---

## 六、即刻 / 小红书（发录屏，不发截图）

素材：`screenshots/demo-image-gen.gif`（13 秒，真机录的），或者重录一段竖屏。

```
笔记写到一半想配张图，不用出门找素材，也不用把想法发给谁——
说一句「秋天的山间小路，落叶，晨雾」，三分钟后图就出现在笔记里。

全程离线，模型跑在自己电脑上，笔记不出门。
开源免费，macOS / Windows 都有。

#效率工具 #Markdown #本地AI #开源软件
```

---

## 七、awesome 列表（提 PR，一次性投入长期收益）

| 列表 | 提到哪一节 | 一句话 |
|---|---|---|
| `sindresorhus/awesome-electron` | Apps | A Markdown editor with fully local AI (chat, RAG, ASR, image generation) |
| `mundimark/awesome-markdown-editors` | Desktop | Local-first Markdown editor, plain .md files, offline AI |
| `awesome-selfhosted/awesome-selfhosted` | Note-taking | 需要先看清单的收录标准（有些只收 web 服务） |
| 中文的 `awesome-cn` 系列 | 效率工具 | 直接用 README 第一句 |

---

## 怎么知道哪个有效

微信、即刻这些渠道跳出来不带 referrer，GitHub 的统计里看不见。唯一的办法是**每个渠道用不同的短链**，
再对照 `docs/traffic-log.md` 里每周的快照看量的变化。

```bash
./scripts/traffic-log.sh    # 每周一跑一次，自动追加
```
