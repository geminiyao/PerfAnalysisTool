---
id: lesson-section-layout-chaos-1784190644517
category: lessons
createdAt: 2026-07-16T08:30:44.517Z
source: manual-sediment/2026-07-16-wt030-035-review
title: "section-layout-chaos: 章节编排乱（视觉资产独立渲染在 sections 之前）"
dataSource: cross-source
---

runId=bk26b-perfetto-triad/2026-07-16_wt030-035 的 report.html 章节编排乱：核心结论表后先渲染采集元信息/多线程宏观/降频矩阵/红线清单（无章节号），然后又渲染 §0-§7 sections（有章节号），同一内容出现两次（先表格后 §X 解释）。根因是 render-html.ts 把视觉资产字段（metaInfo/threadOverview/throttlingMatrix/redlineMatrix/asciiArt）独立渲染在 sections 之前，没有合并进对应 §X section。修法：render-html 按 section heading 模糊匹配合并视觉资产到对应 §X section（§1 元信息→metaInfo，§2 多线程→threadOverview，§4 降频→throttlingMatrix，§5 红线→redlineMatrix），未匹配的兜底渲染。narrative LLM 也要建全 §0-§7 八章节，不要只建 §0/§3/§5/§6/§7 漏掉 §1/§2/§4。