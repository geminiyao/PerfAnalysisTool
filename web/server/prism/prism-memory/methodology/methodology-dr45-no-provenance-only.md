---
id: methodology-dr45-no-provenance-only
category: methodology
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-45 §8.3·验收不能只看 provenance=LLM"
dataSource: cross-source
---

`generatedBy: "LLM"` 只证明"narrative 是 LLM 产的"，不证明"narrative 拿到了完整 prompt"。必须端到端对照标杆核结构：sections 覆盖模板章节 / items 有 callTree.rootMarker / topConclusions 按贡献排序 / judgmentBoundary 非空 / report.html 含关键视觉资产。不许只看 provenance=LLM / 无审计字段 / 无套话 / 测试 PASS 就判 PASS。

❌ 反例：验收只看 generatedBy=LLM + 无 evidenceIds + 测试 PASS，就判 PASS——LLM 拿到裸 prompt 交了 5 个分群卡片也过了。
✅ 正例：验收开箱看货——sections 覆盖模板章节、items 有 callTree.rootMarker、topConclusions 按贡献排序、report.html 含视觉资产。
