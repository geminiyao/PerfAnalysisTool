---
id: unity-cpu-aoe-dots-ecs
category: priors
createdAt: 2026-07-11T06:26:04.421Z
source: unity-cpu
title: "AOE DOTS/ECS 部队系统与性能关注点"
tags: ["aoe","dots","ecs","部队","弹道特效"]
---

AOE 使用 Unity DOTS (ECS + Burst) 进行大规模部队模拟。
- **核心功能**：部队行军、战斗士兵动画、弹道特效（弓箭/火箭/火把）。
- **Job 同步点**：中大核越少的设备，Job 阻塞越严重（低端机问题尤为突出）。
- **DOTS 弹道特效面数**：火把 366 面、弓箭 67 面、火箭 227 面，数量失控时面数爆炸。
- **弹道特效上限控制**：ParallelJob 控制上限逻辑曾有 bug，已重构，默认上限=100。
- **LOD 与画质联动**：精致以上用 LOD0，标准用 LOD1，标准以下用 LOD2；阴影和描边改为 LOD2。
- **ArmyCleanUp**：大量部队同时销毁时 spike（攻城战 50 队场景复现）。