---
id: lesson-bk26b-perfetto-triad-visual-asset-empty-1784188236894
category: lessons
createdAt: 2026-07-16T07:50:36.894Z
source: narrative-redteam/bk26b-perfetto-triad
title: "visual-asset-empty: v5.3 §0-§5 视觉资产"
dataSource: perfetto
---

runId=bk26b-perfetto-triad 的 narrative 所有可选视觉资产字段全空（metaInfo/threadOverview/throttlingMatrix/redlineMatrix/asciiArt）。修法：narrative LLM 必须按 {{REPORT_TEMPLATE}} 注入的模板章节骨架填视觉资产——可能 {{REPORT_TEMPLATE}} 没注入或 LLM 忽略了模板。检查 resolveReportTemplate 是否真的读到了 perfetto-multi-state.txt。