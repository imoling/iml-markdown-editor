# iML Markdown Editor · [![Release v26.5.1](https://img.shields.io/badge/Release-v26.5.1-indigo?style=for-the-badge&logo=github)](https://github.com/imoling/iml-markdown-editor/releases)

**[中文](README.md)** · English

A local Markdown editor where **the AI runs on your machine**. Chat, retrieval, speech-to-text and image
generation all execute locally — your notes never leave your computer, and nothing is sent to a server
unless you explicitly configure a cloud provider.

![Type a prompt, wait a few minutes, the picture appears in your note — generated entirely offline](https://cdn.jsdelivr.net/gh/imoling/iml-markdown-editor@main/screenshots/demo-image-gen.gif)

Your notes are plain `.md` files in a folder you choose. Open them with any other tool, put them in Git,
sync them with whatever you already use.

---

## Why this one

Most "AI notes" apps ship your text to somebody's server. This one downloads the models instead.

| What | Runs where | Model |
|---|---|---|
| Writing assistant (continue, polish, summarize, diagrams) | **Your machine** (or any OpenAI-compatible endpoint) | llama.cpp, your pick of GGUF |
| Ask your notes (`⌘J`, answers cite the source note) | **Your machine** | local embeddings + local chat model |
| Live transcription (meetings, lectures) | **Your machine** | sherpa-onnx + SenseVoice, 5 languages |
| Speaker diarization | **Your machine** | 3D-Speaker CAM++ voiceprints, stored locally |
| Image generation | **Your machine** | stable-diffusion.cpp — Z-Image Turbo or Qwen-Image 2.1 |

Models are downloaded on demand, never bundled. The installer stays at 80–90 MB.

### A memory scheduler, because a laptop can't run all of them at once

Chat + embeddings + transcription + image generation do not fit in 24 GB simultaneously. So they take turns:

- Chat and embeddings start and stop **as one group**; transcription starts when you record and exits when you stop;
  image generation starts when you ask for a picture.
- Memory need is **measured, not guessed** — the scheduler records each model's real resident size
  (keyed by model + context length) and uses that next time.
- When memory runs short it asks the chat model to **step aside**, and brings it back when the job is done.
  If the chat model is mid-answer, it **waits** instead of failing.
- `Intelligence → Local resources` shows what is running, how much it takes, and when it auto-stops.

---

## Features

**Editing** — rich text and source mode (CodeMirror 6, optional Vim keys), slash menu, command palette (`⌘⇧P`),
tables, KaTeX math, Mermaid diagrams, SVG blocks, callouts, footnotes, code folding for headings and lists (`⌥⌘[`).

**Round-trip fidelity** — edit one word, and `git diff` shows one line. Untouched blocks are written back byte-for-byte
(40+ syntax variants verified in tests).

**Moving in from Obsidian** — `[[note#section]]`, `[[#section]]`, `[[note#^block]]`, `![[embeds]]`, aliases,
hover preview, backlinks, unlinked mentions, frontmatter properties, tags, daily notes, vault-wide tasks.

**Notes library** — full-text and semantic search, quick open (`⌘T`, pinyin initials work), tag rename/merge,
file tree sorting, version history, image cleanup, global quick capture hotkey.

**Export** — PDF, HTML, Word (.docx), long image (auto-split at paragraph boundaries), and
"copy as WeChat article" with inline styles.

---

## Download

| Platform | Installer |
|---|---|
| macOS Apple Silicon | `iML.Markdown.Editor-26.5.1-arm64.dmg` |
| macOS Intel | `iML.Markdown.Editor-26.5.1-x64.dmg` |
| Windows x64 | `iML.Markdown.Editor-Setup-26.5.1-x64.exe` |
| Windows on ARM | `iML.Markdown.Editor-Setup-26.5.1-arm64.exe` |

→ **[Latest release](https://github.com/imoling/iml-markdown-editor/releases/latest)**

The app is not notarized by Apple and not code-signed on Windows. On macOS, right-click the app and choose
**Open** the first time; on Windows, click **More info → Run anyway**.

> Want just a plain editor, no library and no AI?
> **[iML Editor Lite](https://github.com/imoling/iml-editor-lite)** — Tauri build, under 4 MB.

---

## Privacy

- Notes are plain files on your disk. The app never uploads them.
- Local models run as child processes on `127.0.0.1`; nothing listens on a public interface.
- Voiceprints and audio recordings stay on your machine.
- If you point the writing assistant at a cloud provider, the status bar says so **at all times** —
  the indicator reads either "local" or the hostname of the service your text is going to.
- API keys are encrypted at rest with the OS keystore.

---

## Build from source

```bash
npm install
npm run dev          # development
npm run check        # typecheck + ESLint + 714 tests
npm run build:mac    # macOS installers (arm64 + x64)
npm run build:win    # Windows installers
```

Electron 33 · React 19 · TypeScript · Vite 7 · Tiptap 2 (ProseMirror) · CodeMirror 6 · Zustand ·
llama.cpp · sherpa-onnx · stable-diffusion.cpp

---

## Status

Actively developed — version numbers are `year.minor`. Issues and feature requests are welcome in
[Discussions](https://github.com/imoling/iml-markdown-editor/discussions).
The interface is Chinese for now; an English UI is on the list if people ask for it.

## License

MIT
