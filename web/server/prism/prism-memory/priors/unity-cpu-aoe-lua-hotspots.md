---
id: unity-cpu-aoe-lua-hotspots
category: priors
createdAt: 2026-07-11T06:26:04.832Z
source: unity-cpu
title: "AOE Lua 层热点函数（LuaProfiler 分场景）"
tags: ["aoe","lua","热点函数","luaprofiler"]
---

来自 LuaProfiler 采集的 Lua 热点函数（二档机，单位 ms）：

| 函数 | 战斗压测 | 行军压测 | 无极缩放 | 攻城压测 |
|------|--------|--------|--------|--------|
| `MapSignificanceMgr.OnUpdate` | 4.50 | 3.75 | 0.15 | 0.19 |
| `MapSignificanceMgr.ProcessTasks` | 4.04 | 3.51 | 0.11 | 0.14 |
| `BattleHeadMgr.OnUpdate` | 2.91 | 1.06 | 0.16 | 1.10 |
| `MapCameraCtrl.OnLateUpdate` | 0.08 | 0.07 | 1.87 | 0.07 |
| `Float_FieldEntityName.OnTick` | 0.02 | 0.01 | 0.01 | 0.18 |
| `UIManager.OnUpdate` | 0.13 | 0.16 | 0.14 | 0.17 |
| `SkillMgr.OnUpdate` | 0.15 | 0.09 | 0.08 | 0.10 |

**关键发现**：
- `MapSignificanceMgr` 是 Lua 层最大热点（战斗/行军 3.5~4.5ms）。
- `BattleHeadMgr` 在低端机上性能退化严重（PC 0.32ms -> 二档机 2.91ms，9x 退化）。
- `MapCameraCtrl` 是无极缩放场景独有的热点（1.87ms）。