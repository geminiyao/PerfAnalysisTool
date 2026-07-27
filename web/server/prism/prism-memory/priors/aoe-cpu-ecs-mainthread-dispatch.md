---
id: aoe-cpu-ecs-mainthread-dispatch
category: priors
createdAt: 2026-07-11T06:29:27.608Z
source: aoe-cpu
title: "ECS 主线程只负责分发调度 job，不参与实际 run job"
tags: ["ECS","Job","多线程","JobWorker"]
dataSource: unity
---

ECS 是处理大量部队士兵逻辑的重点模块，已做并行化处理，所有负载放在 JobWorker 上。主线程上的三个主力调用栈只负责分发调度 job，不参与实际 run job：

- `PlayerLoop -> InitializationSystemGroup -> UpdateFunction.Invoke() -> Default World Unity.Entities.InitializationSystemGroup`
- `PlayerLoop -> SimulationSystemGroup -> UpdateFunction.Invoke() -> Default World Unity.Entities.SimulationSystemGroup`
- `PlayerLoop -> PresentationSystemGroup -> UpdateFunction.Invoke() -> Default World Unity.Entities.PresentationSystemGroup`