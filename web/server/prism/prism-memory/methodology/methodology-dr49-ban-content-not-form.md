---
id: methodology-dr49-ban-content-not-form
category: methodology
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-49·prompt 约束禁内容不只禁形式（LLM 会换形式绕过）"
dataSource: cross-source
---

prompt 约束写"禁 X"时，必须想清楚 X 是形式还是内容。禁形式（如"不许用 ├─/└─ 缩进树"）= LLM 会换形式绕过（换成柱状图/因果链）。禁内容（如"不许讲子节点 ms/占比/foldChange/GC alloc 等具体数字"）= LLM 不能换形式绕过。优先禁内容，形式约束作为补充。约束 + 范例 + 反例三处一致才算改完——范例比约束更强，LLM 看范例学写法。

❌ 反例：prompt 写"任何形式的 ├─/└─ 缩进"——LLM 换成柱状图讲子节点 ms/占比/foldChange/GC alloc 细节，§0/§3 内容仍然重复。
✅ 正例：prompt 写"§0 不许讲子节点 ms/占比/foldChange/GC alloc 等具体数字"——禁内容，LLM 不能换形式绕过。
