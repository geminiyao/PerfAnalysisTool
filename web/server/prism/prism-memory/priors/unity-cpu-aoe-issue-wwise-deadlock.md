---
id: unity-cpu-aoe-issue-wwise-deadlock
category: priors
createdAt: 2026-07-11T06:26:04.649Z
source: unity-cpu
title: "AOE 已知问题：Wwise 死锁崩溃"
tags: ["aoe","已知问题","wwise","崩溃","音频"]
---

**触发场景**：切后台再恢复。
**现象**：高频崩溃。
**根因**：WakeupFromSuspend 触发音频重初始化死锁。
**状态**：排查中。