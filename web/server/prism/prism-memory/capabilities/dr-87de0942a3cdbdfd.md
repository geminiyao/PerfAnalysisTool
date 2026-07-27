---
id: dr-87de0942a3cdbdfd
category: capabilities
createdAt: 2026-07-15T10:44:47.983Z
source: bk26b-perfetto-triad
title: "URP.RenderCameraStack 每帧渲染的相机数量和每个相机的耗时。throttle 态 URP.RenderCameraStack count=854（427 帧，约 2 相机/帧），但无法拆分每个相机的渲染成本，也无法确认是否有不必要的额外相机。"
dataSource: perfetto
---

Want: URP.RenderCameraStack 每帧渲染的相机数量和每个相机的耗时。throttle 态 URP.RenderCameraStack count=854（427 帧，约 2 相机/帧），但无法拆分每个相机的渲染成本，也无法确认是否有不必要的额外相机。
Rationale: GPU-bound 优化需要知道是哪个相机的渲染最贵（主相机/UI 相机/特效相机等），当前只有 RenderCameraStack 聚合数据，无法定位到具体相机。
Axis: gpu
ClosestTool: getPerfettoCallTree