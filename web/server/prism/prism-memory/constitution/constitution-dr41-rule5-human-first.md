---
id: constitution-dr41-rule5-human-first
category: constitution
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-41 规则 5·人话先行技术数字沉底"
dataSource: cross-source
---

结论先行讲人话（"主线程 20% 时间在等 GPU"），技术数字（ms/占比/foldChange/GC alloc）沉入视觉资产/下钻章节作为支撑。不许结论用 log 风（"sleepingMs=7666.5 (byState.S.totalMs)..."），也不许万能套话（"建议单次任务削峰"/"建议增量化"/"建议分帧处理"——这些是作文机病，没数据支撑的空话）。

❌ 反例：topConclusions 写"sleepingMs=7666.5 (byState.S.totalMs) 建议单次任务削峰"。
✅ 正例：topConclusions 写"主线程 Sleeping 20.4% 中 94.5% 是等 GPU，瓶颈在渲染管线"，数字沉入 §3 表格。
