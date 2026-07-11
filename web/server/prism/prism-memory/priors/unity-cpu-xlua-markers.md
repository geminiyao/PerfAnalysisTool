---
id: unity-cpu-xlua-markers
category: priors
createdAt: 2026-07-11T06:26:04.326Z
source: unity-cpu
title: "xLua 关键 Marker 及性能影响"
tags: ["xlua","marker","桥接"]
---

| Marker | 含义 | 性能影响 |
|--------|------|---------|
| `xlua.access` | Lua 访问 C# 属性 | 高频调用时桥接开销大 |
| `xlua.call` | Lua 调用 C# 方法 | 每次调用有跨语言开销 |
| `LuaEnv.Tick` | Lua GC 周期 | 可能导致 spike |
| `Profiler.BeginSample("xxx")` | 项目自定义 Marker | 有业务语义，是分析重点 |