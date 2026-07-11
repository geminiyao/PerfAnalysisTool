---
id: unity-cpu-aoe-issue-heightmap-hash
category: priors
createdAt: 2026-07-11T06:26:04.737Z
source: unity-cpu
title: "AOE 已知问题：高度图 Hash 采样热点"
tags: ["aoe","已知问题","高度图","采样","cpu"]
---

**触发场景**：大地图移动。
**现象**：CPU 采样耗时高。
**根因**：Hash 方式采样高度图。
**状态**：已优化（线性采样，降至 1/10）。