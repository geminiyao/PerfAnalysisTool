---
id: aoe-cpu-lua-mainloop
category: priors
createdAt: 2026-07-11T06:29:27.291Z
source: aoe-cpu
title: "Lua 主循环调用栈：LuaMgr.OnTick & UpdateSchedule"
tags: ["Lua","调用栈","LuaMgr"]
---

游戏重度使用 Lua 脚本，Lua 主循环调用值得重点关注。调用栈：

`PlayerLoop -> Update.ScriptRunBehaviourUpdate -> BehaviourUpdate -> GameLauncher.Update() -> Core.Update -> CS:AOE.LuaMgr -> LuaMgr.OnTick & UpdateSchedule`

其下是各个 Lua 主要管理器的调用。压测场景中可能出现 MapSignificanceMgr（重要度管理器）、BattleHeadMgr（头像管理器）等。