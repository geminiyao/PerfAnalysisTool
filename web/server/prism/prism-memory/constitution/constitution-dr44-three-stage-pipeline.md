---
id: constitution-dr44-three-stage-pipeline
category: constitution
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-44·报告生成必须走三段管线（explore→narrative→render）"
dataSource: cross-source
---

报告生成必须走三段管线：explore LLM → findings.json（含 conclusion/reasoning/recommendation）→ narrative LLM → narrative.json（含 overview/topConclusions/sections，无审计字段）→ render 纯代码 → report.html。任何数据源接入都必须走这三段，不许脚本拼 narrative.json，不许 if-else 套模板写人话，不许在 web/server/scripts/ 下另起炉灶写报告生成器（必须复用 web/server/prism/ 框架层）。

❌ 反例：explore 阶段脚本拼 findings.json（No LLM）+ narrative 阶段脚本拼 narrative.json = 退化成作文机。
✅ 正例：三段都走 LLM，findings 和 narrative 都是 LLM 产的，render 是纯代码。
