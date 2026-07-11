---
id: dr-2c58bb3bcc9ad27d
category: capabilities
createdAt: 2026-07-11T07:22:30.472Z
source: stressmove-run1
title: "GC.Collect（frame519/frame483）触发前的对象分配来源追踪"
---

Topic: GC.Collect（frame519/frame483）触发前的对象分配来源追踪
Description: 已确认frame519和frame483的gc_allocated_in_frame处于全程正常偏低水平（非当帧分配触发GC），但无法获取GC.Collect触发前若干帧的按marker/按调用来源的分配明细，因此无法定位是哪个系统长期累积的小分配最终触发了这次同步GC。
ReasonMissing: queryFrameCounters工具提供的gc_allocated_in_frame是逐帧的总量counter，没有按marker/按代码路径拆分分配来源的接口（这类数据通常需要Memory Profiler的Allocation Callstacks功能，超出当前Timeline式采样的能力范围）。
ImpactOnFindings: F01（GC同步卡顿）的recommendation只能给出排查方向（检查是否手动调用Collect、调整增量GC时间片），无法精确定位到具体是哪段业务代码在持续攒对象导致阈值触发。