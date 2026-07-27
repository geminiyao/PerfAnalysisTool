---
id: unity-cpu-pattern-gc-spike
category: priors
createdAt: 2026-07-11T06:26:04.238Z
source: unity-cpu
title: "性能问题模式：GC Spike"
tags: ["unity","gc","性能模式"]
dataSource: unity
---

**关键指标**：`GC.Collect` 出现在 spike 帧且耗时 > 2ms。
**根因**：大量临时对象分配。
**优化方向**：对象池、减少装箱、缓存查询结果。