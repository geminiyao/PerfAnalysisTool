---
id: methodology-dr48-calltree-triple-prune
category: methodology
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-48·callTree 渲染三重剪枝（深度≤8+阈值≥0.05+宽度≤8）"
dataSource: cross-source
---

callTree 渲染必须三重剪枝：(1) 深度 ≤8 层（防巨长调用树）；(2) 节点占比阈值 ≥0.05（占父节点 <5% 的低价值分支折叠）；(3) 宽度 ≤8（每层最多保留 8 个子节点，超出的折叠）。harness 断言每棵 callTree 的 tree-row 数 ≤200（抓"完全没剪枝"的退化）。raw 全树 dump 不许——用聚焦子树 + 摘要可视化。

❌ 反例：callTree 有 4695 节点未剪枝，渲染成巨长页面，看不出重点。
✅ 正例：callTree 剪枝到 30-50 节点，强调 hot path / top contributors，折叠低价值分支。
