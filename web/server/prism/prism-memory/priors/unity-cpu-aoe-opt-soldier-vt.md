---
id: unity-cpu-aoe-opt-soldier-vt
category: priors
createdAt: 2026-07-11T06:26:04.885Z
source: unity-cpu
title: "AOE 士兵 VT 渲染方案"
tags: ["aoe","士兵vt","virtual-texture","优化"]
dataSource: unity
---

- 用 Virtual Texture 替代传统 3D 渲染士兵，减少 GPU Draw 开销。
- CPU 开销：1 档机(888) 0.76ms，3 档机(480) 2.36ms。
- GPU 优化效果(iPhone12PM)：传统非简化 17ms -> VT 12ms（节省 ~2ms）。
- VT 模式下简化参数需与 3D 简化模式保持一致（关 ghosting、切 LOD3、圆片阴影）。
- 已知问题：攻城车不走 VT（贴图过大）、ECB Complete 阻塞点需优化。