---
id: unity-cpu-aoe-opt-shader-async
category: priors
createdAt: 2026-07-11T06:26:04.926Z
source: unity-cpu
title: "AOE Shader 异步编译经验"
tags: ["aoe","shader","异步编译","warmup"]
---

- ShaderVariantCollection WarmUp 在进野外 Loading 时异步执行。
- 首次装机无 PSO Cache，WarmUp 耗时极高，需跳过分帧预热。
- 非首次装机有 Cache，WarmUp 极快（~2s 异步不阻塞主线程）。
- 运行时触发 `CreateGpuProgram` = Shader 未 prewarm，产生 spike。
- **风险**：异步编译未完成时主线程引用变体会触发同步 fallback 卡顿。