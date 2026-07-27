---
id: unity-cpu-aoe-issue-gpu-bound-city
category: priors
createdAt: 2026-07-11T06:26:04.508Z
source: unity-cpu
title: "AOE 已知问题：城内 GPU Bound"
tags: ["aoe","已知问题","gpu-bound","城内"]
dataSource: unity
---

**触发场景**：城内默认高清画质。
**现象**：1 档机仅 40FPS。
**根因**：2K 分辨率 + OpacityBake + 面数超标。
**状态**：降分辨率 900P。