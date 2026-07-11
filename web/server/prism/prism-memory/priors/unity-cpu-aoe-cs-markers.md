---
id: unity-cpu-aoe-cs-markers
category: priors
createdAt: 2026-07-11T06:26:04.376Z
source: unity-cpu
title: "AOE C# 层 Profiler Marker 及实测数据"
tags: ["aoe","csharp","marker","实测数据"]
---

AOE C# 层 Marker 实机耗时（单位 ms）：

| Marker | 模块 | PC战斗 | 二档机战斗 | PC行军 | 二档机行军 | 备注 |
|--------|------|-------|----------|-------|----------|------|
| `CS.MapManager` | 地图管理总控 | 0.85 | 2.14 | 3.90 | 3.16 | 行军时最高 |
| `CS.MeshUIManager.OnLateUpdate` | MeshUI 渲染 | 1.39 | 2.10 | 0.58 | 0.90 | 战斗时高 |
| `CS.BattleUIManager.OnUpdate` | 战斗 UI | 0.33 | 1.10 | 0.68 | 0.68 | |
| `CS.OutsideViewTreeMgr` | 视野树管理 | 0.11 | 0.44 | 0.18 | 0.34 | |
| `CS.OutsideRoadsMgr` | 道路管理 | 0.08 | 0.22 | 0.12 | 0.17 | |
| `CS.MapEntityEffectMgr` | 地图特效 | 0.08 | 0.30 | 0.09 | 0.24 | |
| `CS.OutsideEnvEffectMgr` | 环境特效 | 0.06 | 0.19 | 0.10 | 0.13 | |