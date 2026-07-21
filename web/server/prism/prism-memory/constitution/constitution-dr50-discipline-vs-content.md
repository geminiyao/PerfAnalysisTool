---
id: constitution-dr50-discipline-vs-content
category: constitution
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-50·prompt 约束只给纪律不给内容（禁预先规定数量/类型/挂载）"
dataSource: cross-source
---

prompt 约束只给纪律（怎么写：不许用字段名 / 不许用"吻合"风 / 不许硬编码业务名 / 不许用 ├─/└─ 缩进树 / 不许讲子节点 ms 数字），不给内容（写什么：必须写 N 条 / 必须按①②③产出 / 必须挂 callTree / 必须 ≤5 条）。内容由 findings 决定——结论数量、结论类型、挂载都从 findings 自然浮现，prompt 不预先规定。

❌ 反例：prompt 写"topConclusions 必须 ≤5 条" / "critical/high 必须挂 callTree" / "三大演化结论：①最大涨幅 ②新出现 ③退化形态"。
✅ 正例：prompt 写"按对整体贡献排序，每条带 dimensions + judgability" / "典型维度（从 findings 自然浮现，不预设盯防）" / "可以挂 callTree 或 asciiArt（有就挂，没有不硬挂）"。
