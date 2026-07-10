# 工单目录（worktickets）

> 开发工单流转处。每张工单一个文件 `BK-XX-<短标题>.md`，结构见 `../harness.md` 的「工单协议」。
> 状态靠文件名前缀标注：`TODO-` 待施工 / `WIP-` 施工中 / `REVIEW-` 待验收 / `DONE-` 已验收通过。

## 流转

1. 主 agent 写工单 → `TODO-BK-XX-xxx.md`
2. 用户搬给 Cursor（或主 agent 派子 agent）施工 → 施工方回填「完工报告」→ 改名 `REVIEW-`
3. 主 agent 验收 → PASS 改 `DONE-` + 更新 now/backlog；打回 → 补「返工说明」回 `WIP-`

## 当前工单

（暂无。M1 第一张工单待与用户敲定开发顺序后创建。）
