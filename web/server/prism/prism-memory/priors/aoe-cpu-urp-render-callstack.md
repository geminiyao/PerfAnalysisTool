---
id: aoe-cpu-urp-render-callstack
category: priors
createdAt: 2026-07-11T06:29:27.682Z
source: aoe-cpu
title: "主线程 URP 渲染管线调用栈（不负责真实 GPU 渲染）"
tags: ["渲染","URP","调用栈"]
dataSource: unity
---

主线程跑 URP 渲染管线的负载调用栈：

`PlayerLoop -> PostLateUpdate.FinishFrameRendering -> RenderPipelineManager.DoRenderLoop_Internal() -> URP.Render -> URP.RenderCameraStack`

该栈不负责真实 GPU 渲染，但其中很多时间片能反映当前渲染压力。