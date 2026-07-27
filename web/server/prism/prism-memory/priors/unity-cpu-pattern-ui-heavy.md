---
id: unity-cpu-pattern-ui-heavy
category: priors
createdAt: 2026-07-11T06:26:04.267Z
source: unity-cpu
title: "性能问题模式：UI Heavy"
tags: ["unity","ui","性能模式"]
dataSource: unity
---

**关键指标**：`UI.LayoutUpdate` / `Canvas.BuildBatch` > 2ms。
**根因**：UI 层级复杂 / 频繁 Rebuild。
**优化方向**：拆分 Canvas、减少 Layout 嵌套、静态缓存。