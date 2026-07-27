---
id: unity-cpu-aoe-lua-markers
category: priors
createdAt: 2026-07-11T06:26:04.361Z
source: unity-cpu
title: "AOE Lua 层 Profiler Marker 及实测数据"
tags: ["aoe","lua","marker","实测数据"]
dataSource: unity
---

AOE Lua 层通过 CustomSampler 插桩的 Marker 及实机采集耗时（PC/二档机，战斗压测/行军压测）：

| Marker | 模块 | 功能 | PC战斗 | 二档机战斗 | PC行军 | 二档机行军 | 备注 |
|--------|------|------|-------|----------|-------|----------|------|
| `MapSignificanceMgr.sampler_OnUpdate` | 地图重要性 | AOI 更新 | 3.65 | 4.50 | 3.41 | 3.75 | **Lua 层最大热点** |
| `MapSignificanceMgr.ProcessTasks` | 地图重要性 | 处理显著性任务 | 3.52 | 4.04 | 2.81 | 3.51 | 上者子项 |
| `BattleHeadMgr.OnUpdate` | 战斗头像 | 战斗 UI 头像更新 | 0.32 | 2.91 | 1.12 | 1.06 | 二档机暴增 |
| `UIManager.OnUpdate` | UI 管理 | UI 统一更新 | 0.34 | 0.13 | 0.47 | 0.16 | |
| `MapCameraCtrl.OnLateUpdate` | 地图相机 | 相机控制 | 0.04 | 0.08 | 0.06 | 0.07 | 无极缩放飙到 1.87ms |
| `Float_FieldEntityName.OnTick` | 浮动名牌 | 实体名称 UI | 0.01 | 0.02 | 0.01 | 0.01 | 攻城时 0.18ms |
| `SkillMgr.OnUpdate` | 技能系统 | 技能帧更新 | 0.07 | 0.15 | 0.06 | 0.09 | |
| `BattleEventMgr.OnUpdateNetEvent` | 战斗事件 | 网络战斗事件 | 0 | 0.01 | 0 | 0 | |
| `Hud_Common.OnTick` | HUD | 通用 HUD | 0.04 | 0.06 | 0.04 | 0.04 | |
| `ArmyEntityUIMgr.OnUpdate` | 部队 UI | 部队 UI 管理 | 0.01 | 0.02 | 0.01 | 0.01 | |

单位为 ms。测试机型：小米14/8gen3、小米8SE/二档机、MateXs2/一档机、iPhone12/13PM。