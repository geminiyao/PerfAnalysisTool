---
id: aoe-cpu-luamgr-other-ticks
category: priors
createdAt: 2026-07-11T06:29:27.356Z
source: aoe-cpu
title: "LuaMgr 下其它管理器与主界面 Hud_Common 的 tick 消耗"
tags: ["Lua","LuaMgr","Hud_Common"]
---

除重要度管理器外，LuaMgr 下还可能出现其它管理器或主界面（Hud_Common）等的 tick 消耗。虽然耗时有补偿机制，但每隔数帧如果出现 1~2ms 的消耗，也属于不合理情况。