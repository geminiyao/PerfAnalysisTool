---
id: aoe-cpu-map-significance-mgr
category: priors
createdAt: 2026-07-11T06:29:27.328Z
source: aoe-cpu
title: "重要度管理器 MapSignificanceMgr 是性能分析的重点考察对象"
tags: ["Lua","MapSignificanceMgr","重要度管理器","负载"]
dataSource: unity
---

MapSignificanceMgr（重要度任务管理器）从网络接收到服务器数据后，驱动游戏内实体对象（各类 MapEntity）的增删改，进而驱动后续各种资源数据的加载卸载。

- 当前每帧最多预留 3ms 给该管理器，以防卡顿。
- 若任务过多，会导致该管理器一直处于 3ms 顶格消耗。
- 因此该管理器的性能指标某种程度上反映了当前游戏的整体负载状况，值得作为每次性能分析的重点考察对象。