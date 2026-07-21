---
id: methodology-dr45-narrative-structure-contract
category: methodology
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-45 §8.2·narrative.json 结构契约校验（软约束 warning）"
dataSource: cross-source
---

narrative-service 产出 narrative.json 后，校验 sections 结构是否符合模板章节骨架（软约束 warning，不阻塞但必须验收时检查）。不匹配时打 warning："narrative.json 有 N 个 section，模板要求 M 个章节 [§0...§7]，可能 LLM 没按模板组织"。warning 写进 narrativeProvenance 字段供验收查看。warning 必须在验收时被检查——不能打了 warning 没人看。

❌ 反例：narrative.json 有 5 个自由分群 section，模板要求 §0-§7 八章节，没人校验，LLM 拿到裸 prompt 交差。
✅ 正例：harness 校验 sections 数量与模板章节骨架匹配，不匹配打 warning，验收时人眼检查。
