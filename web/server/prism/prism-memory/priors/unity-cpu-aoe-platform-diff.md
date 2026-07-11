---
id: unity-cpu-aoe-platform-diff
category: priors
createdAt: 2026-07-11T06:26:05.032Z
source: unity-cpu
title: "AOE 平台差异注意事项"
tags: ["aoe","平台差异","ios","android","gpu-bound"]
---

- iOS 60fps triple-buffer 问题：一帧 GPU Bound 会导致后续每帧阻塞（30fps 正常）。
- Android `Gfx.PresentFrame` 是 GPU Bound 指标（iOS 对应 `WaitForAvailableFrameBuffer`）。
- 华为 GPU 有非必现的驱动 bug，`Gfx.PresentFrame` 莫名高耗时。
- iPhone12 城内高清画质 60FPS，优于 Android 1 档机默认设置。
- 3 档机（骁龙480）全场景帧率偏低，流畅/省电画质均难达 60FPS。