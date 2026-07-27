# CODEBUDDY.md — 项目级开发约束

> 本文件是给所有开发 agent（CodeBuddy / Cursor / Claude Code 等）的**开工必读**。
> CodeBuddy Code 会在每次会话自动加载本文件；其它工具请手动读取。

---

## Prism 开发必读

如果本次会话涉及 Prism（性能分析 agent）相关开发，**开工前必须先读以下文档**：

### 设计决策层（`docs/prism/memory/`）

- `charter.md` — 宪法（F1-F8 锚定 Feature，不可漂移）
- `philosophy.md` — 立法精神（成体系的思想，读完懂每条 Feature 的分量）
- `rationale.md` — 判例法（DR-1~40，设计决策推演历史）

### 执行层方法论（`docs/prism/memory/methodology/`）

- `README.md` — 报告层方法论统一索引
- `report-layer-rules.md` — DR-41 报告层五条硬规则
- `single-state.md` — DR-42 单态判定方法论
- `multi-state.md` — DR-43 多态判定方法论
- `report-pipeline-contract.md` — **DR-44 报告生成三段管线可插拔契约**

### 开发约定与需求（`docs/prism/memory/dev/`）

- `conventions.md` — **开发协作约定（最容易漏的纪律）**
- `ticket-template.md` — **工单模板（所有新工单必须用这个结构，"验收 harness"字段必填）**
- `requirements-perfetto-pipeline-fix.md` — perfetto 三段管线修复需求（已完成，WT-026/027/028）
- `requirements-perfetto-template-fix.md` — perfetto 模板注入断链修复需求（当前活跃需求，DR-45）

### 通用 harness（开发完成前必跑 + 主 agent 验收时独立跑）

- `web/server/prism/harness.ts` — 报告管线通用 harness（DR-45 §三）
- 用法：`cd web && npx tsx server/prism/harness.ts --source perfetto --dir <run-dir>`
- 验什么：占位符填充非空（防 `return ''` 短路）+ narrative.json 结构契约 + report.html 视觉资产
- **开发 agent 标记工单 ✅ 前必跑，主 agent 验收时独立跑**（dev-conventions.md §八）

### 运行时记忆（不是给开发 agent 的）

- `web/server/prism/prism-memory/` — Prism 运行时 LLM 的持久大脑（priors/knowledge/capabilities/lessons）
- 这个目录的输入源是三大回路的沉淀物，开发 agent 一般不直接改

---

## 最容易踩的坑（perfetto 阶段 3 天教训）

**报告生成必须走三段管线**（philosophy.md:25-32 + methodology/report-pipeline-contract.md）：

```
explore LLM → findings.json（含 conclusion/reasoning/recommendation）
narrative LLM → narrative.json（含 overview/topConclusions/sections，无审计字段）
render 纯代码 → report.html
```

**任何数据源接入都必须走这三段。不允许：**
- 脚本拼 narrative.json（违反 = 退化成作文机）
- 脚本用 if-else 套模板写人话（违反 = 退化成作文机）
- 在 `web/server/scripts/` 下另起炉灶写报告生成器（必须复用 `web/server/prism/` 框架层）

**验收自检**：
1. findings conclusion 是人话还是 log 风？
2. narrative.json 有没有审计字段（evidenceIds/findingIds）？
3. 报告脚本有没有万能套话（"建议单次任务削峰"）？
4. 报告脚本有没有数据源特定判定逻辑？
5. narrative.json 的 `generatedBy` 是不是 `"LLM"`？

任一不通过 = 方向错了，停下来诊断，不要在错误基座上堆功能。

---

## 通用开发约束

- **严禁硬编码**：业务名/绝对阈值/叙事模板不许写死在代码里（DR-41 + dev/conventions.md）
- **数据源无关优先**：渲染能力向上沉淀到 `report-utils.ts`，判定逻辑向下沉淀到 explore prompt
- **验收对照标杆**：报告类工单必须对照标杆报告（v5.3/v4）逐项核结构 + 叙事可读性，不能只看"字段存在/测试 PASS"
- **先读后写**：改任何 Prism 文件前，先读相关 methodology 文档 + dev/conventions.md
