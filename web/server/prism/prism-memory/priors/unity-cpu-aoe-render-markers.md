---
id: unity-cpu-aoe-render-markers
category: priors
createdAt: 2026-07-11T06:26:04.395Z
source: unity-cpu
title: "AOE 渲染/引擎层 Marker 及典型耗时"
tags: ["aoe","渲染","marker","vt","gpu"]
---

| Marker | 含义 | 典型场景 | 典型耗时 |
|--------|------|---------|---------|
| `TerrainVT.LateUpdate` | Virtual Texture 地形更新 | 滑动地图 | 0.8~5ms（攻城战 5ms） |
| `VT_RenderMask` | VT 遮罩渲染 | Android 全场景 | 偶发高耗时 |
| `Gfx.ReadBackImage` | GPU 数据回读 | Android VT | 已修复(AsyncReadBack) |
| `WorldTileStreaming` | 世界块流式加载 | 滑动视野 | 0.5~0.8ms |
| `Gfx.PresentFrame` | GPU 提交帧（Android GPU Bound 指标） | 缩放层滑动 | 峰值 372ms |
| `WaitForAvailableFrameBuffer` | iOS triple-buffer 等待 | iOS 60fps 模式 | 持续高耗时 |
| `ForwardRenderPass` | 前向渲染 | 滑动地图 | 偶发 junk |
| `CreateGpuProgram` | Shader 编译（未 prewarm） | 首次滑动 | spike |
| `UGUI.Canvas` | UGUI 画布重建 | 攻城战 | 6.5ms |