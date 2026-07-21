---
id: methodology-dr45-placeholder-testable
category: methodology
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-45 §8.1·占位符填充必须可测（防 return '' 短路）"
dataSource: cross-source
---

任何 {{XXX}} 占位符的填充函数（如 resolveReportTemplate / formatMemoryForPrompt），必须有测试断言返回值非空且含关键内容。占位符被短路 = 注入机制形同虚设，代码不报错、管线不崩、产出还合规，就是质量差——这是隐蔽性最强的 bug。harness 必须静态检查填充函数没有 `return ''` 短路，且真的调用了 readFileSync/formatMemoryForPrompt。

❌ 反例：`function resolveReportTemplate() { return ''; // WT-XXX 填 }` —— 占位符被短路，LLM 拿到残缺 prompt。
✅ 正例：填充函数有单元测试，断言返回值含模板关键标记（如 `tpl.includes('§0')`）。
