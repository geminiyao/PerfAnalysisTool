---
id: unity-cpu-pattern-particle-heavy
category: priors
createdAt: 2026-07-11T06:26:04.279Z
source: unity-cpu
title: "性能问题模式：Particle Heavy"
tags: ["unity","particle","性能模式"]
dataSource: unity
---

**关键指标**：`ParticleSystem.Update` > 2ms。
**根因**：粒子数过多 / 复杂粒子系统。
**优化方向**：减少粒子数、LOD、可见性剔除。