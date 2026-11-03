# iml 命令行

给 Agent 和脚本用，读笔记库、记忆库和本机 AI 上下文。只读，不改任何文件。

在编辑器的「智能 → AI 上下文」里点「安装」，会写到 `~/.local/bin/iml`（Windows 是 `iml.cmd`）。这个目录不在 PATH 里时，用完整路径调用。

| 命令 | 输出 |
|---|---|
| `iml today` | 逾期和今天到期的待办；没有就什么都不输出，适合放进开工 hook |
| `iml tasks` | 全库未完成的待办，有日期的按日期排在前面 |
| `iml tasks --due today\|overdue\|week\|all` | 按范围筛；`today` 含逾期，`week` 是 7 天内含逾期 |
| `iml tasks --done` | 带上已完成的 |
| `iml context` | 本机各 AI 工具的身份、记忆、技能概况 |
| `iml memory` | 记忆库合集：我是谁、工作方式和各领域的规矩。换了工具，第一句话就让它跑这个 |
| `iml memory --domain 公众号` | 只打一篇 |
| `iml memory harvest` | 各工具里有、记忆库里还没有的条目，只列不写；给提炼技能当输入 |

所有命令都支持 `--json`。笔记库按这个顺序找：`--library <路径>`、环境变量 `IML_LIBRARY`、编辑器当前打开的笔记库。

待办的日期写法：`- [ ] 事情 📅 2026-11-05` 或 `- [ ] 事情 [due:: 2026-11-05]`。`模板/` 目录里的待办不算。

退出码：0 成功，1 找不到笔记库，2 参数不对。

`iml context` 和 `iml memory harvest` 只读工具表（`electron/aiContext/tools.ts`）里列出的路径，不读登录凭证、会话记录和数据库。

记忆库是笔记库里的 `记忆/` 目录，一个领域一篇，纯 Markdown 列表；开头写了「仅本机」的那篇不进合集。在编辑器侧栏的「上下文」页签里建立和维护。
