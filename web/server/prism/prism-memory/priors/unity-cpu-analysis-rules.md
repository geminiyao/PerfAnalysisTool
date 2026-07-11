---
id: unity-cpu-analysis-rules
category: priors
createdAt: 2026-07-11T06:26:04.302Z
source: unity-cpu
title: "Unity CPU 性能分析通用规则"
tags: ["unity","分析规则","self-time","spike"]
---

1. **对比 worst 和 median 帧**，区分“偶发 spike”和“持续性能问题”。
2. **关注 self-time**（非 total time）来定位真正的工作，而非只是父级包装。
3. **Spike 倍数** = 帧耗时 / median 耗时，>5x 严重，>10x 极端。
4. **Physics 高时**检查 FixedUpdate 是否每帧执行多次（追帧问题）。
5. **`Gfx.WaitForPresent` 高 + 帧耗时低** = GPU Bound（CPU 在等 GPU）。
6. **`GC.Collect` 出现在 spike 帧** = 内存分配问题，看父 Marker 定位分配源。
7. **多线程分析**：Main Thread 高不一定是瓶颈，需看是否在等其他线程。