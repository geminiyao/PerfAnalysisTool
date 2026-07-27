---
id: unity-cpu-aoe-issue-terrainvt-readback
category: priors
createdAt: 2026-07-11T06:26:04.432Z
source: unity-cpu
title: "AOE 已知问题：TerrainVT 回读卡顿"
tags: ["aoe","已知问题","terrainvt","android"]
dataSource: unity
---

**触发场景**：Android 滑动地图。
**现象**：`Gfx.ReadBackImage` spike。
**根因**：Android 用 GetPixel 同步回读。
**状态**：已修复（AsyncReadBack）。