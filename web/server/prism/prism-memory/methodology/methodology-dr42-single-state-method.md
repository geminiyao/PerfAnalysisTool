---
id: methodology-dr42-single-state-method
category: methodology
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-42·单态判定（1 样本，相对占比 + 相对周期）"
dataSource: cross-source
---

单态报告（1 个样本，无基线对照）判定瓶颈用相对值：(1) 相对占比——某模块占主线程总 CPU 的百分比（如 33.3%）；(2) 相对周期——某模块单次耗时占 vsync 周期的百分比（如占 16.67ms 帧预算的 20%）。不许硬编码绝对阈值（如"单次 >1-2ms 不合理"）——绝对阈值换游戏换场景就失效，是作文机病。

❌ 反例：判定"sleepingMs=7666.5 不合理"——绝对阈值，换场景失效。
✅ 正例：判定"主线程 Sleeping 占 20.4%，其中 94.5% 是等 GPU"——相对占比，跨场景通用。
