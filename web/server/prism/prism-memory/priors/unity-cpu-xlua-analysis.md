---
id: unity-cpu-xlua-analysis
category: priors
createdAt: 2026-07-11T06:26:04.338Z
source: unity-cpu
title: "xLua 性能分析要点"
tags: ["xlua","分析要点","跨语言开销"]
dataSource: unity
---

1. `ScriptRunBehaviourUpdate` 高时，优先检查 `xlua.call` 子节点。
2. `xlua.access` self-time 高 = 跨语言属性访问过于频繁，考虑缓存。
3. `LuaEnv.Tick` spike = Lua 侧产生了大量临时 table/closure。
4. 自定义 Marker `Profiler.BeginSample("BusinessName")` 是定位 Lua 业务瓶颈的关键。