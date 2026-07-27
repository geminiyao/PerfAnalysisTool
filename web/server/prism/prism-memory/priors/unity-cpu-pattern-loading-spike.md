---
id: unity-cpu-pattern-loading-spike
category: priors
createdAt: 2026-07-11T06:26:04.246Z
source: unity-cpu
title: "性能问题模式：Loading Spike"
tags: ["unity","loading","性能模式"]
dataSource: unity
---

**关键指标**：单帧 > 100ms + `Resources.Load` / `AssetBundle.Load`。
**根因**：主线程同步加载资源。
**优化方向**：异步加载、预加载、分帧加载。