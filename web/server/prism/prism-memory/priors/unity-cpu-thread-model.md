---
id: unity-cpu-thread-model
category: priors
createdAt: 2026-07-11T06:26:04.315Z
source: unity-cpu
title: "Unity 线程模型及各线程常见瓶颈"
tags: ["unity","线程模型","多线程"]
---

| 线程 | 作用 | 常见瓶颈 |
|------|------|---------|
| Main Thread | 游戏逻辑、脚本、物理、UI | Script/Physics/UI/GC |
| Render Thread | 渲染命令提交 | DrawCall 过多、Shader 编译 |
| Job Worker | DOTS/Burst 并行任务 | 任务粒度不均、依赖等待 |
| Loading Thread | 异步资源加载 | IO 瓶颈、解压缩 |