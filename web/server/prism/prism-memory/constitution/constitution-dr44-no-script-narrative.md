---
id: constitution-dr44-no-script-narrative
category: constitution
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-44·narrative.json 必须是 LLM 产的不许脚本拼"
dataSource: cross-source
---

narrative.json 必须由 LLM 产出，narrativeProvenance.generatedBy === "LLM"。脚本拼的 narrative.json 退化成作文机——没有 LLM 推理，只是按模板填空。验收时 provenance=LLM 只证明"narrative 是 LLM 产的"，不证明"LLM 拿到了完整 prompt"——必须端到端对照标杆核结构（DR-45 §8.3）。

❌ 反例：脚本拼 narrative.json，generatedBy 标 "LLM" 伪装；或 LLM 拿到裸 prompt（{{REPORT_TEMPLATE}} 没注入）按自由指令交差。
✅ 正例：LLM 拿到完整 prompt（含模板 + lessons + constitution），产出符合模板章节骨架的 narrative.json。
