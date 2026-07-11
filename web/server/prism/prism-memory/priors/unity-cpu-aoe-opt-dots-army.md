---
id: unity-cpu-aoe-opt-dots-army
category: priors
createdAt: 2026-07-11T06:26:04.965Z
source: unity-cpu
title: "AOE DOTS/部队优化经验"
tags: ["aoe","dots","部队","job同步点","优化"]
---

- ParallelJob 弹道特效上限控制逻辑重构。
- Job 同步点在低端机（中大核少的设备）问题尤为突出。
- 部队延迟销毁避免同帧大量 ArmyCleanUp。
- ECB Complete 阻塞点需优化（士兵 VT 场景）。