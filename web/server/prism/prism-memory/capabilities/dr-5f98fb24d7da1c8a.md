---
id: dr-5f98fb24d7da1c8a
category: capabilities
createdAt: 2026-07-16T07:46:27.828Z
source: bk26b-perfetto-triad
title: "OutSideViewArmyLineMgr 内部子模块的耗时 marker（顶点计算/线段更新/渲染提交），用于拆分 5.19% 的行军线管理成本"
dataSource: perfetto
---

Want: OutSideViewArmyLineMgr 内部子模块的耗时 marker（顶点计算/线段更新/渲染提交），用于拆分 5.19% 的行军线管理成本
Rationale: OutSideViewArmyLineMgr 是 cur→throttle 唯一涨幅显著的业务模块（×1.37），但是叶子节点无子 marker；callTree 显示它调用 OutsideLineCtrl:CalculateVertexJob (Burst)，但无法判断顶点计算占多少比例
Axis: script
ClosestTool: queryCallTreeSubtree