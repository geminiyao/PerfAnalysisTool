---
id: aoe-cpu-ecs-dependency-visualizer
category: priors
createdAt: 2026-07-11T06:29:27.657Z
source: aoe-cpu
title: "ECS 依赖关系检测离线工具 ECSDependencyVisualizer"
tags: ["ECS","工具","ECSDependencyVisualizer","依赖"]
---

`K:\AOEYZ_Trunk\AOE3D\Assets\Editor\AoE\Tools\ECSDependencyVisualizer` 是之前编写的检测 ECS 依赖关系的离线工具，可参考它了解该机制。目的是让 job 无阻塞地并发，避免 job 互相等待。