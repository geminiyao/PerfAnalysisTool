---
id: unity-cpu-aoe-issue-face-count-fluctuation
category: priors
createdAt: 2026-07-11T06:26:04.466Z
source: unity-cpu
title: "AOE 已知问题：渲染面数波动"
tags: ["aoe","已知问题","渲染面数","foliage"]
---

**触发场景**：轻微拖动地图。
**现象**：面数 33w -> 67w。
**根因**：Foliage 阴影/白模导致。
**状态**：已修复。