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

日志：`worktickets/logs/`。`-DryRun` 只打印 prompt 不执行。

## 当前工单

- `TODO-WT-001-bk17-html-polish.md` — BK-17 HTML 美化 + §0 空正文修复
