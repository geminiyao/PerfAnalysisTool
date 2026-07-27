---
id: unity-cpu-aoe-opt-network
category: priors
createdAt: 2026-07-11T06:26:04.989Z
source: unity-cpu
title: "AOE 网络优化经验"
tags: ["aoe","网络优化","protobuf","解包池"]
dataSource: unity
---

- 大规模战斗网络解包 1.66ms，计划引入解包池方案。
- pb decode 在大地图卡顿场景中也是热点之一。