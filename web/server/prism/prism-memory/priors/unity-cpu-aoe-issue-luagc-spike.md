---
id: unity-cpu-aoe-issue-luagc-spike
category: priors
createdAt: 2026-07-11T06:26:04.681Z
source: unity-cpu
title: "AOE 已知问题：LuaGC spike"
tags: ["aoe","已知问题","luagc","同步点"]
dataSource: unity
---

**触发场景**：战斗 + 同步点。
**现象**：LuaGC 高耗时。
**根因**：Lua 临时对象 + 同步点叠加。
**状态**：已解决。