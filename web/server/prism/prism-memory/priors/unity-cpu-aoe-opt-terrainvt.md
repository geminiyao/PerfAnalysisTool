---
id: unity-cpu-aoe-opt-terrainvt
category: priors
createdAt: 2026-07-11T06:26:04.867Z
source: unity-cpu
title: "AOE TerrainVT 优化经验"
tags: ["aoe","terrainvt","优化","android"]
dataSource: unity
---

- VT 分帧处理：由 6ms 降至 1ms。
- Android 用 AsyncReadBack 替代 GetPixel（8gen3 机器需正确判定为 Arm 设备）。
- 大面积跳变时的 VT 重建需分帧。