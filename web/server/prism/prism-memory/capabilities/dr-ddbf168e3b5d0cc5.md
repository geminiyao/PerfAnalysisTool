---
id: dr-ddbf168e3b5d0cc5
category: capabilities
createdAt: 2026-07-20T07:59:05.284Z
source: udiff_1782983710451_be175ef1
title: "OnCameraMove执行时battleHeadQueue/waitShowEntityQueue的实体数量"
dataSource: "unity"
---

Want: OnCameraMove执行时battleHeadQueue/waitShowEntityQueue的实体数量
Rationale: OnCameraMove源码是两层pairs循环遍历buckets，43ms的耗时由实体数量决定。要判断是'实体数量过多'还是'RefreshDistancePriority()单次贵'，需要执行时的队列长度。当前只能从源码看到循环结构，拿不到运行时实体数
Axis: gameplay
ClosestTool: getSourceForSymbol（只给源码，给不了运行时状态）