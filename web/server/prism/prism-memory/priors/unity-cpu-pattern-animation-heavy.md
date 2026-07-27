---
id: unity-cpu-pattern-animation-heavy
category: priors
createdAt: 2026-07-11T06:26:04.257Z
source: unity-cpu
title: "性能问题模式：Animation Heavy"
tags: ["unity","animation","性能模式"]
dataSource: unity
---

**关键指标**：`Director.Update` / `Animator.Update` > 3ms。
**根因**：Animator 过多 / 状态机复杂。
**优化方向**：LOD 动画、可见性剔除、简化状态机。