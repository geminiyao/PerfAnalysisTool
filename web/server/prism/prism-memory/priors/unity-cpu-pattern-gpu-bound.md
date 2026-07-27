---
id: unity-cpu-pattern-gpu-bound
category: priors
createdAt: 2026-07-11T06:26:04.198Z
source: unity-cpu
title: "性能问题模式：GPU Bound"
tags: ["unity","gpu-bound","性能模式"]
dataSource: unity
---

**关键指标**：`Gfx.WaitForPresent` > 40%。
**根因**：DrawCall 过多 / Shader 复杂 / 分辨率高。
**优化方向**：减少 DrawCall、简化 Shader、降低分辨率。