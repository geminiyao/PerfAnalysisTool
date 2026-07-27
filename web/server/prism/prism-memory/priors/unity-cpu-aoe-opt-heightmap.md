---
id: unity-cpu-aoe-opt-heightmap
category: priors
createdAt: 2026-07-11T06:26:04.945Z
source: unity-cpu
title: "AOE 高度图数据优化"
tags: ["aoe","高度图","优化","内存"]
dataSource: unity
---

- 原方案 Hash 采样 CPU 热点高，新方案改为 block 划分 + 线性编码。
- iPhone12PM：CPU 优化至原热点的 **1/10**。
- 内存从 30M GC + 16M 常驻 降至 6.4M NativeArray。