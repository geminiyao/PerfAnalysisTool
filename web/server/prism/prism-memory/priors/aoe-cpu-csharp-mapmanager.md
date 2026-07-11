---
id: aoe-cpu-csharp-mapmanager
category: priors
createdAt: 2026-07-11T06:29:27.381Z
source: aoe-cpu
title: "C# 负载调用栈：Core.Update 下的 MapManager"
tags: ["C#","调用栈","MapManager"]
---

C# 的负载消耗调用栈：

`PlayerLoop -> Update.ScriptRunBehaviourUpdate -> BehaviourUpdate -> GameLauncher.Update -> Core.Update -> CS:AOE.Outside.MapManager`

其下有几个主要管理器：
- `CS:AOE.Battle.BattleUIManager`
- `CS:AOE.Outside.OutSideViewArmyLineMgr`