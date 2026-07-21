---
id: methodology-dr48-redline-exception
category: methodology
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-48·红线例外（foldChange≥2 或 perFrameMs 占 p50≥5% 不剪）"
dataSource: cross-source
---

callTree 剪枝时，红线节点（严重程度 critical/high）不许剪。红线例外条件：foldChange ≥2（涨幅翻倍）或 perFrameMs 占 p50 ≥5%（单帧开销显著）。即使节点占比 <5% 但 foldChange ≥2，也不剪——这是关键发现，剪了就丢线索。剪枝只剪"低价值分支"，红线节点是高价值必须保留。

❌ 反例：剪枝把 foldChange=10 的子节点剪了（因为占比 0.03 <0.05），丢失关键发现。
✅ 正例：剪枝保留 foldChange ≥2 的节点，即使占比低也不剪；只剪低价值低涨幅分支。
