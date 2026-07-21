---
id: constitution-dr50-no-hardcode-skeleton
category: constitution
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-50·禁\"三大演化结论\"硬骨架（结论类型由 findings 自然浮现）"
dataSource: cross-source
---

prompt 不许预先规定结论类型（如"三大演化结论：①最大涨幅 ②新出现 ③退化形态"）。这是作文机病——即使数据里没有"新出现瓶颈"也得硬凑，LLM 退化成按模板填空。结论类型应由 findings 自然浮现：可参考"典型维度（主线程瓶颈形态 / 业务侧涨幅 / 降频形态）"作为参考，但必须加"从 findings 自然浮现，不预设盯防"。

❌ 反例：prompt 写"三大演化结论：①最大涨幅 ②新出现 ③退化形态"——LLM 即使数据里没有"新出现"也硬凑。
✅ 正例：prompt 写"典型维度（从 findings 自然浮现，不预设盯防）：主线程瓶颈形态 / 业务侧涨幅 / 降频形态"——参考非约束。
