---
id: aoe-cpu-battleui-armyline
category: priors
createdAt: 2026-07-11T06:29:27.410Z
source: aoe-cpu
title: "BattleUIManager 与 OutSideViewArmyLineMgr 的负载特征"
tags: ["C#","BattleUIManager","OutSideViewArmyLineMgr","行军线"]
dataSource: unity
---

- `BattleUIManager` 往往与 Lua 中的 `BattleHeadMgr` 热点呈现一致的状态。
- `OutSideViewArmyLineMgr` 主要是场景中行军线的刷新负载，在压测场景中往往表现出高负载。