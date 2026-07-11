---
id: unity-cpu-aoe-issue-mapsignificancemgr
category: priors
createdAt: 2026-07-11T06:26:04.534Z
source: unity-cpu
title: "AOE 已知问题：MapSignificanceMgr 高耗时"
tags: ["aoe","已知问题","lua","aoi","热点"]
---

**触发场景**：战斗/行军压测。
**现象**：3.5~4.5ms（Lua 层最大热点）。
**根因**：AOI 更新 + ProcessTasks 遍历开销。
**状态**：优化中。