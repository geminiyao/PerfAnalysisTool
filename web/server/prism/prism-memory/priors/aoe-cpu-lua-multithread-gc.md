---
id: aoe-cpu-lua-multithread-gc
category: priors
createdAt: 2026-07-11T06:29:27.766Z
source: aoe-cpu
title: "Lua 多线程 GC 时间片及其压力判断"
tags: ["Lua","GC","多线程","LuaMultiThreadGC"]
dataSource: unity
---

Lua 多线程 GC 的主线程时间片：

`PlayerLoop -> LuaMultiThreadGC -> UpdateFunction.Invoke -> LuaMtGc.WaitGCThread`，对应线程为 `Lua -> GC线程`。

往往发生次数不多，但如果一次消耗很高（如 3~10ms 或以上），都表明当前 Lua 的 GC 压力很大。