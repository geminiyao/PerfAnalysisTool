---
id: dr-bcf836c4cbbee0a1
category: capabilities
createdAt: 2026-07-11T15:11:08.522Z
source: unity-outside-stressmove
title: "YzEntityMoveLineNtf 每次消息的 fullUpdateLine 数量、pathPoint 数量、coordPath 数组长度。"
dataSource: unity
---

Want: YzEntityMoveLineNtf 每次消息的 fullUpdateLine 数量、pathPoint 数量、coordPath 数组长度。
Rationale: Profiler 只显示 frame273 该 handler 自耗时 14.8995ms；源码显示它遍历 fullUpdateLine 并克隆路径数组，但现有工具没有 payload 大小，无法建立耗时与消息规模的关系。
Axis: network
ClosestTool: getFrameCallTree 与 getSourceForSymbol（能看到耗时和代码，但看不到消息内容规模）