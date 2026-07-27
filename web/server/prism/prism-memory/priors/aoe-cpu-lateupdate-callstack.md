---
id: aoe-cpu-lateupdate-callstack
category: priors
createdAt: 2026-07-11T06:29:27.437Z
source: aoe-cpu
title: "LateUpdate 中 Lua 与 C# 的对应消耗"
tags: ["LateUpdate","调用栈","Lua","C#"]
dataSource: unity
---

除 Core.Update 外，LateUpdate 中也有一组对应消耗。调用栈：

`PlayerLoop -> Update.ScriptRunBehaviourLateUpdate -> LateBehaviourUpdate -> GameLauncher.LateUpdate() -> Core.LateUpdate`

其下包含 `CS:AOE.LuaMgr` 与 `CS:AOE.Outside.MapManager`。