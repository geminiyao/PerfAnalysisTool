---
id: dr-cfc2e41c99fc0c02
category: capabilities
createdAt: 2026-07-23T03:46:10.665Z
source: run_1781782881102_b35ee5a7
title: "per-marker 的 GC 分配字节和分配调用栈，能回答哪个函数或 Lua marker 在持续分配"
dataSource: "unity"
---

Want: per-marker 的 GC 分配字节和分配调用栈，能回答哪个函数或 Lua marker 在持续分配
Rationale: queryFrameCounters 只有整帧 gc_allocated_in_frame 总量；frame 194 的 LuaMtGc.ExecuteMtGc 21.59ms 不是当帧分配尖峰触发（该帧 gc_allocated_in_frame 不高），是累积达阈值触发的 full GC，要定位是哪个 Lua 函数/C# 函数在长期累积分配需要到函数级。burstFrames [343,350,351,352] 连续四帧 GC 可能与某段密集分配有关，需 per-marker 分配源才能定位。
Axis: memory
ClosestTool: queryFrameCounters（只有整帧 gc_allocated_in_frame，到不了函数级）