---
id: unity-cpu-aoe-issue-terrainvt-repaint
category: priors
createdAt: 2026-07-11T06:26:04.442Z
source: unity-cpu
title: "AOE 已知问题：TerrainVT 重绘 spike"
tags: ["aoe","已知问题","terrainvt","vt"]
dataSource: unity
---

**触发场景**：大面积跳变/滑动。
**现象**：`VT_RenderMask` 高耗时 6ms+。
**根因**：VT 页面大面积失效需重建。
**状态**：已优化（分帧）。