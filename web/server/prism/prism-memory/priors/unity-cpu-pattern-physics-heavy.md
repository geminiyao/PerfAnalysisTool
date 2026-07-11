---
id: unity-cpu-pattern-physics-heavy
category: priors
createdAt: 2026-07-11T06:26:04.217Z
source: unity-cpu
title: "性能问题模式：Physics Heavy"
tags: ["unity","physics","性能模式"]
---

**关键指标**：`FixedUpdate` > 8ms 或 `Physics.Simulate` > 5ms。
**根因**：Collider 过多 / FixedTimestep 过小 / 复杂碰撞。
**优化方向**：减少 Collider、增大 FixedTimestep、简化碰撞层。