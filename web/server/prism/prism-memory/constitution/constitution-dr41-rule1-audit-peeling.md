---
id: constitution-dr41-rule1-audit-peeling
category: constitution
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-41 规则 1·报告=呈现层，审计=底稿层"
dataSource: cross-source
---

报告 HTML 里只能有：数据可视化（图表/ASCII/调用树）+ 人话结论 + 优化建议。不能有：evidence id / tool name / runId / provenance / 证据链 / 自我审查 / 字段名（claim/boundary/relativeBaseline）。审计信息全部沉入 audit.json + narrative.json 的 evidenceSummary（供核查，不进报告视图）。

❌ 反例：report.html 出现 `<code>ev-001</code>` 或"证据：ev-xxx"或"evidenceIds"字样。
✅ 正例：审计字段沉入 audit.json，报告只展示人话结论 + 可视化。
