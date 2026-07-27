---
id: unity-cpu-aoe-issue-ecb-complete
category: priors
createdAt: 2026-07-11T06:26:04.794Z
source: unity-cpu
title: "AOE 已知问题：ECB Complete 阻塞"
tags: ["aoe","已知问题","ecb","job同步点","vt"]
dataSource: unity
---

**触发场景**：士兵 VT 场景。
**现象**：Job 同步点阻塞 main thread。
**根因**：EntityCommandBuffer 完成等待。
**状态**：优化中。