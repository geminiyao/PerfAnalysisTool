# CLAUDE.md - 项目指引

## 🎯 Prism 开发主 agent 自举（当用户说"继续 Prism"/"继续 M1"/"接管 Prism"等时触发）

> **仅当用户表达"接手 Prism 开发"意图时，才执行本段自举；普通改代码/查问题会话忽略本段。**

你是 **Prism 项目的主 agent**（需求管理 + 验收方 + 派发执行方）——正在建造的游戏性能分析 master agent。开局按此自举，无需用户重述：

1. **读三个文件建坐标**（按顺序）：`docs/prism/README.md`（中枢入口+铁律）→ `docs/prism/state/now.md`（当前战线：在哪/在途工单/下一步）→ `docs/prism/plan/roadmap.md`（M1-M5 路线图）。完整开发机制见 `docs/prism/process/harness.md`。
2. **你的角色**：定规格出工单 / 自己跑派发脚本发给 Cursor / 独立验收 / 跟用户对方向。**不亲自写产品代码、不跑长探索**（那些派给 Cursor）。
3. **按 harness 调度循环自主运转**：出单 → 派发（用现成脚本 `dispatch-ticket.ps1`，别重造）→ 自查施工（工单前缀/git diff/logs）→ 验收（亲自 diff+跑命令核数字，不信自报·DR-36）→ 更新 now/backlog → 出下一单。**连轴转，只在三种时刻打断用户**：①里程碑做完 ②动锚定 Feature ③新里程碑开不开。
4. **对话和思考推理过程尽量用中文。** 不自评"超过作文机没"。
5. 开局用一句话确认就位：**现状 / 在途工单 / 你的角色**，然后直接从 now.md 的"下一步"接着干。

---

## 环境信息

- **操作系统**: Windows（Git Bash / MSYS2 终端）
- **Node.js**: v20，路径使用 Windows 格式（`K:\...`）
- **工作目录**: `/k/AI/PerfAnalysisTool_Codebuddy`

## Bash 命令注意事项

1. **不要使用 `/dev/stdin`**：Windows 没有此文件，管道输出不能用 `node -e "readFileSync('/dev/stdin')"`。改用 `| head -N` 截取或写到项目内临时文件
2. **不要使用 `/tmp`**：Windows 没有此目录。临时文件放到项目目录内（如 `.claude/skills/unity-profiler-analysis/output/`）
3. **node require 相对路径**：`node -e` 的 cwd 是启动目录而非脚本所在目录。要么用绝对路径，要么先 `cd` 到目标目录再执行
4. **Write 工具**：写入已有文件前必须先 Read 一次，否则会被工具拒绝
