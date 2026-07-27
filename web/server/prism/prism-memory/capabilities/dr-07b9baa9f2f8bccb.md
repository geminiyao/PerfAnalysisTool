---
id: dr-07b9baa9f2f8bccb
category: capabilities
createdAt: 2026-07-24T09:44:28.698Z
source: camera_ab_24072PX77C_20260723_194703
title: "本次采集的帧计数器数据（gc_allocated_in_frame / batches / triangles / set_pass_calls / total_used_memory 全部为 0 或 null）"
dataSource: "unity"
---

Want: 本次采集的帧计数器数据（gc_allocated_in_frame / batches / triangles / set_pass_calls / total_used_memory 全部为 0 或 null）
Rationale: queryFrameCounters 对帧 [143, 257, 278, 283, 469, 552, 566, 576] 查询返回所有计数器字段为 0/null。这导致无法用渲染负载（batches/triangles）判断尖峰帧是否是渲染压力导致，也无法用 GC 分配归因 GC 触发源。需要确认是采集配置未开启计数器记录，还是工具读取出错。
Axis: meta
ClosestTool: queryFrameCounters（返回全 0，数据缺失）