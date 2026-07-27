---
id: unity-cpu-aoe-issue-shader-not-prewarm
category: priors
createdAt: 2026-07-11T06:26:04.634Z
source: unity-cpu
title: "AOE 已知问题：Shader 未 prewarm"
tags: ["aoe","已知问题","shader","prewarm"]
dataSource: unity
---

**触发场景**：首次滑动地图。
**现象**：`CreateGpuProgram` spike。
**根因**：运行时编译 shader。
**状态**：需 prewarm。