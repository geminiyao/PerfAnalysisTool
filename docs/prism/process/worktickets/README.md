# 工单目录（worktickets）

> 开发工单流转处。每张工单一个文件 `BK-XX-<短标题>.md`，结构见 `../harness.md` 的「工单协议」。
> 状态靠文件名前缀标注：`TODO-` 待施工 / `WIP-` 施工中 / `REVIEW-` 待验收 / `DONE-` 已验收通过。

## 流转

1. 主 agent 写工单 → `TODO-BK-XX-xxx.md`
2. 施工方（Cursor CLI 或手动）施工 → 派发时自动改 `WIP-` → 完工回填报告 → 改名 `REVIEW-`
3. 主 agent 验收 → PASS 改 `DONE-` + 更新 now/backlog；打回 → 补「返工说明」回 `WIP-`

## 自动派发（Cursor CLI）

前置：用户环境变量 `CURSOR_API_KEY`（勿写进仓库）。

```powershell
# 派发最新 TODO 工单
.\docs\prism\process\scripts\dispatch-ticket.ps1 -Latest

# 派发指定工单
.\docs\prism\process\scripts\dispatch-ticket.ps1 -Ticket TODO-WT-001-bk17-html-polish.md

# 主 agent 出单后末尾调用（示例）
.\docs\prism\process\scripts\dispatch-ticket.ps1 -Ticket TODO-WT-001-bk17-html-polish.md

# 守护进程：新 TODO 工单自动派发
.\docs\prism\process\scripts\watch-worktickets.ps1 -ProcessExisting
```

日志：`worktickets/logs/` 下两份文件：
- `*.log` — 人类可读（思考/工具/结果）
- `*.jsonl` — 原始 stream-json（完整回放）

回放可读日志：
```powershell
Get-Content docs/prism/process/worktickets/logs/xxx.jsonl |
  .\docs\prism\process\scripts\format-agent-stream.ps1
```

手动测试可读输出（推荐用包装脚本，避免乱码）：
```powershell
cd K:\AI\PerfAnalysisTool_Codebuddy
.\docs\prism\process\scripts\run-readable-agent.ps1 `
  -p --trust --mode ask --workspace . `
  --output-format stream-json --stream-partial-output `
  "只读：一句话说明 docs/prism/state/now.md 当前里程碑"
```

若仍乱码：用 Windows Terminal，或在运行前先执行 `chcp 65001`。

## 当前工单

- `TODO-WT-001-bk17-html-polish.md` — BK-17 HTML 美化 + §0 空正文修复
