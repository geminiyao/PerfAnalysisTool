---
id: unity-cpu-aoe-issue-battle-ui-extreme
category: priors
createdAt: 2026-07-11T06:26:04.480Z
source: unity-cpu
title: "AOE 已知问题：战斗 UI 极端耗时"
tags: ["aoe","已知问题","ugui","战斗ui","critical"]
dataSource: unity
---

**触发场景**：300 部队带 UI。
**现象**：战斗 UI 80ms，帧率 10FPS。
**根因**：UGUI 大量实例化 + Canvas 重建。
**状态**：优化中。