---
id: constitution-dr41-rule3-structure-macro-to-detail
category: constitution
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-41 规则 3·报告结构=宏观→各线程→下钻"
dataSource: cross-source
---

报告结构按"宏观→各线程→下钻"层次组织：§0 结论先行（核心问题与优先级）→ §1 采集元信息 → §2 多线程宏观（哪些线程吃 CPU/GPU）→ §3 主线程下钻（callTree/子模块拆解）→ §4+ 数据源特定章节（降频/GPU 等）。不许倒序或乱序，宏观没讲清就钻细节 = 读者迷失。

❌ 反例：报告一上来就讲 `<子模块>` 的 foldChange，没先讲整体宏观。
✅ 正例：§0 先讲"主线程占整体 X%，主因是 <模块> 占 Y%"，§3 再下钻到子模块。
