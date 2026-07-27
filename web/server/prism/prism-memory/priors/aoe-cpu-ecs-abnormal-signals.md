---
id: aoe-cpu-ecs-abnormal-signals
category: priors
createdAt: 2026-07-11T06:29:27.633Z
source: aoe-cpu
title: "ECS 主线程时间片过高或出现等待 job 的节点属于不合理状况"
tags: ["ECS","Job","阻塞","性能异常"]
dataSource: unity
---

对于 ECS 主线程调度时间片，若消耗大于 1ms，或其下叶子节点出现等待 job 完成的时间片（名称类似 Complete.Job，原文作者对确切名称不确定），都不是合理状况。目标是让 job 无阻塞并发，不在 Main Thread 及 Job Worker 线程上出现 job 互相等待。