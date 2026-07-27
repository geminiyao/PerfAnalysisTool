---
id: unity-cpu-aoe-issue-ios-triple-buffer
category: priors
createdAt: 2026-07-11T06:26:04.453Z
source: unity-cpu
title: "AOE 已知问题：iOS triple-buffer 死锁"
tags: ["aoe","已知问题","ios","gpu-bound"]
dataSource: unity
---

**触发场景**：60fps + 静止 10s 后。
**现象**：`WaitForAvailableFrameBuffer` 每帧高耗时。
**根因**：一帧 GPU Bound 导致后续所有帧阻塞。
**状态**：切 30fps 恢复。