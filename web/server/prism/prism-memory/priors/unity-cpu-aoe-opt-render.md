---
id: unity-cpu-aoe-opt-render
category: priors
createdAt: 2026-07-11T06:26:04.850Z
source: unity-cpu
title: "AOE 渲染优化经验（GPU Bound）"
tags: ["aoe","渲染优化","gpu-bound","面数裁剪"]
dataSource: unity
---

- 移动端渲染分辨率从 2K 降至 900P，大幅减轻 GPU 负载。
- 描边 PostOutline 耗时优化。
- 阴影和描边 Pass 强制使用 LOD2，减少面数。
- DOTS 弹道特效（火把/弓箭/火箭）设置数量上限（默认 100）。
- 玩家城堡 OpacityBake 渲染优化。
- 地形渲染占比 35%，是 GPU 端主要开销。
- SMAA 抗锯齿渲染负载占比 7%，低端机可考虑关闭。
- DECAL 渲染负载 7%（曾有 bug 已修复）。
- 面数裁剪效果实测（350队/4000兵）：未裁剪 500w 面；关阴影 320~400w；关阴影+关描边 170~190w；关阴影+关描边+简化模式 80w（帧率平稳、不发热）。