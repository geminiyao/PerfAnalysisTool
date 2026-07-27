---
id: dr-a27604dce12aab0f
category: capabilities
createdAt: 2026-07-24T11:38:21.757Z
source: camera_ab_24072PX77C_20260723_194703
title: "WorldEnvironmentMeshItemMgr 类与 RecycleGOTask 方法的源码定位（getSourceForSymbol 返回 not-found，未在 codegraph/map-source 索引）"
dataSource: "unity"
---

Want: WorldEnvironmentMeshItemMgr 类与 RecycleGOTask 方法的源码定位（getSourceForSymbol 返回 not-found，未在 codegraph/map-source 索引）
Rationale: camera-recycle-burst 条目是最差两帧（54ms/48ms）的根因，但源码未索引无法看回收逻辑实现，建议只能推断‘加分帧上限/对象池’，无法指着代码说‘这里没有节流’。
Axis: cpu
ClosestTool: getSourceForSymbol symbol=WorldEnvironmentMeshItemMgr / RecycleGOTask（均 not-found）