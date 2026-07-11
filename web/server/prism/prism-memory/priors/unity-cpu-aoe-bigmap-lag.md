---
id: unity-cpu-aoe-bigmap-lag
category: priors
createdAt: 2026-07-11T06:26:05.010Z
source: unity-cpu
title: "AOE 大地图卡顿专项（iPhone14Pro 实测）"
tags: ["aoe","大地图","卡顿","iphone14pro"]
---

iPhone14Pro 大地图卡顿的主要来源：
- **Shader Compile**：运行时编译导致 spike。
- **RefreshLayerLevel**：无极缩放层级切换时高耗时。
- **LodStreamingManager**：LOD 流式加载卡顿。
- **WorldTileStreaming**：世界块加载 spike。
- **UGUI**：大地图 UI 重建。
- **pb decode**：protobuf 解包。