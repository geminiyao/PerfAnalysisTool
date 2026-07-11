---
id: unity-cpu-aoe-scene-baseline
category: priors
createdAt: 2026-07-11T06:26:04.406Z
source: unity-cpu
title: "AOE 各场景性能基线（帧率与关键瓶颈）"
tags: ["aoe","性能基线","帧率","场景"]
---

基于多轮采集的实际帧率数据：

| 场景 | 配置 | 1档机(MateXs2) | 3档机(iQOO U3x) | iPhone12 | 关键瓶颈 |
|------|------|---------------|-----------------|----------|---------|
| 城内（默认画质） | -- | 40 FPS (GPU Bound) | 28 FPS (GPU Bound) | 60 FPS | GPU: 分辨率/面数 |
| 空旷野外-滑动 | 标准画质 | 60 FPS | 35 FPS | -- | TerrainVT/WorldTile |
| 名城场景 | 流畅画质 | -- | 29 FPS (GPU Bound) | -- | GPU: 城模面数高 |
| 战斗压测 | 300队/2700兵 | 58 FPS | 30~40 FPS | -- | MapSignificanceMgr/渲染面数 |
| 行军压测 | 300队/2700兵 | 60 FPS | 35~45 FPS | -- | MapSignificanceMgr/MapManager |
| 攻城压测 | 279队/1900兵 | 43 FPS | -- | -- | 渲染(100w面)+UGUI(6.5ms)+VT(5ms) |
| 战斗(带UI) | 300队/300兵 | -- | 10 FPS | -- | 战斗UI: 80ms（**Critical**） |
| 战斗(隐UI) | 300队/300兵 | -- | 23~27 FPS | -- | 渲染面数(300w)+网络解包 |
| 无极缩放-高650 | -- | -- | 30 FPS (GPU Bound) | -- | Gfx.PresentFrame |