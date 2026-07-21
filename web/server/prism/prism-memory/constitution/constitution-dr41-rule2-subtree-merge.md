---
id: constitution-dr41-rule2-subtree-merge
category: constitution
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-41 规则 2·热点模块归并（同子树不重复）"
dataSource: cross-source
---

红线清单/热点表中，同一开销不许在父模块和子模块同时出现（会重复计算）。归并规则递归应用：(1) 分布形态——子节点占比都比较小且接近（无明显大头）→ 统筹在父模块；有明确大头子节点 → 拆出大头。(2) 语义独立性（有大头时再判）——大头语义不同 → 各自独立拆出；大头语义相同 → 统筹在父模块。

❌ 反例：红线清单同时列 `<父模块>` 和 `<父模块>.<大头子模块>`，大头子模块占比 80%。
✅ 正例：大头子模块独立拆出，父模块只列剩余小头或统筹在父级。
