---
id: aoe-cpu-gfx-waitforpresent
category: priors
createdAt: 2026-07-11T06:29:27.711Z
source: aoe-cpu
title: "Gfx.WaitForPresentOnGfxThread 出现说明渲染负载很高"
tags: ["渲染","GPU","Gfx.WaitForPresentOnGfxThread"]
dataSource: unity
---

在 URP 渲染栈下，若出现时间片：

`URP.RenderSingleCamera -> URP.AfterRendering -> URP.Submit -> URP.WaitForPresent -> Gfx.WaitForPresentOnGfxThread`

说明当前游戏内渲染负载很高，一直在等前一帧的 GPU 渲染工作完毕，才能提交本帧的渲染任务。