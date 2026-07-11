---
id: unity-cpu-frame-budget
category: priors
createdAt: 2026-07-11T06:26:04.291Z
source: unity-cpu
title: "Unity 帧预算参考（60/30 FPS）"
tags: ["unity","帧预算","fps"]
---

| 目标 FPS | 帧预算 (ms) | 建议 Main Thread | 建议 Render Thread |
|---------|------------|-----------------|-------------------|
| 60 FPS | 16.67ms | < 12ms | < 14ms |
| 30 FPS | 33.33ms | < 28ms | < 30ms |