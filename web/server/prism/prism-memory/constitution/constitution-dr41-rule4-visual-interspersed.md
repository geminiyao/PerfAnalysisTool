---
id: constitution-dr41-rule4-visual-interspersed
category: constitution
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-41 规则 4·图文穿插四段式（非一大段文字）"
dataSource: cross-source
---

报告不许"一大段文字 + 一棵调用树"，要图文穿插的阅读流：每个核心结论配视觉资产（callTree/ASCII/表格/矩阵），文字解释 + 可视化对照。调用树要有焦点（强调 hot path / top contributors），折叠低价值分支，标注"为什么展示这棵树"，不许 raw 全树 dump。

❌ 反例：§0 一段 500 字文字结论，§3 一棵 200 节点未剪枝的全树，中间无穿插。
✅ 正例：每条核心结论配 ASCII 调用树或表格，文字 + 可视化交替呈现，有焦点。
