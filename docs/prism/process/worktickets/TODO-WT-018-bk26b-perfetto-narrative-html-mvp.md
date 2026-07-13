# 工单 WT-018 · BK-26b-report Perfetto narrative.json + report.html MVP

> 状态：TODO（待施工）｜里程碑：M5 多源扩展 / Perfetto 标准报告｜执行方：Cursor/CodeBuddy agent
> 依据：用户明确要求 Perfetto 不仅停留在 query/explore，还希望最终能做一个漂亮报告。但 Prism 标准报告不是 markdown skeleton，而是 `narrative.json + report.html`。本单依赖 WT-017 的 ledger/findings/verdict。

## 背景

WT-013 提供 Perfetto query，WT-017 将提供 Perfetto explore + ledger + findings/verdict。当前还缺报告层：

- 没有 `narrative.json`
- 没有 `report.html`
- 没有证明 Perfetto 能走 Prism 标准交付链路

本单做报告 MVP：优先复用现有 Prism narrative / renderer 能力，产出一份能给人看的 HTML。目标是“结构完整、证据可信、可读”，不是一次性完成 BK-25 的复杂图文流大改。

## 前置条件

- `DONE-WT-013-bk26b-perfetto-query-tools-mvp.md`
- `REVIEW/DONE-WT-017-bk26b-perfetto-explore-ledger-mvp.md`
- 强烈建议 WT-014 已完成或至少明确 provider sidecar/base callTree 边界；若未完成，本报告必须显式标注对应能力边界。

## 目标

1. 读取 WT-017 产物：ledger / findings / verdict。
2. 生成 Perfetto `narrative.json`。
3. 生成 Perfetto `report.html`。
4. 报告中每个关键结论能追溯到 evidence/provenance。
5. 报告诚实展示缺失能力：FrameTimeline/GPU/thermal confirmed/base callTree（视 WT-014 状态）。
6. 报告可读性达到 MVP：不是墙文 + 原始树 dump；至少有清晰章节、结论卡片、关键表格、聚焦 callTree/hot path 摘要。

## 建议产物路径

优先写到：

- `web/data/prism-out/bk26b-perfetto-report-mvp/narrative.json`
- `web/data/prism-out/bk26b-perfetto-report-mvp/report.html`
- `web/data/prism-out/bk26b-perfetto-report-mvp/report-audit.json` 或 `audit.json`（如需要）
- `web/data/prism-out/bk26b-perfetto-report-mvp/run.log`

如沿用现有 Prism run 目录规范，完工报告必须写清楚实际路径。

## 具体要求

### 1. narrative 输入

输入必须来自 WT-017 的结构化产物，而不是重新读 summary 自由写：

- ledger
- findings
- verdict

允许补读 WT-013 query 输出，但必须入 ledger 或 audit，不得无 provenance 引入新数字。

### 2. narrative.json

可以复用现有 narrative schema，也可以做最小 Perfetto narrative adapter，但必须包含：

- `source: 'perfetto'`
- `sampleSet: 'bk26b-perfetto-triad'`
- `topConclusions`
- `findings`
- `evidenceSummary` 或等价审计引用
- `capabilityBoundaries`

### 3. report.html 内容结构

至少包含：

1. 标题与样本说明：base / cur / throttle，窗口级 Perfetto 分析。
2. 顶部结论：3–5 条。
3. 三态对照表：sched / atrace / cpu / frame。
4. 主要 findings：每条含证据引用。
5. Perfetto callTree/hotPath 聚焦展示：
   - cur/throttle 有树时显示 hot path / Top children。
   - base 空树时显示“callTree unavailable”，不造树。
6. 能力边界：
   - 无 Android FrameTimeline → 不判断 jank。
   - 无 GPU → 不判断 GPU busy。
   - 若 WT-014 未完成 confirmed thermal → 降频仍为 suspected。
7. 审计/证据入口：至少能看到 evidence id / tool / role。

### 4. “漂亮报告”边界

本单允许做轻量美化：

- HTML 章节卡片
- 表格
- 简单条形/百分比视觉
- hot path 聚焦块

不要求：

- 全量 BK-25 图文流重构
- ECharts 复杂图
- 完整交互式 drilldown
- 多源统一报告抽象

### 5. 复用优先

优先复用现有 Prism HTML renderer / narrative 代码。若不适配 Perfetto，允许新增薄 adapter，不要大改 Unity 报告路径。

## 允许修改文件

施工方可根据现有结构最小选择：

- `web/server/prism/*narrative*` / `*renderer*` 相关文件
- `web/server/scripts/*perfetto*report*.ts`（可新增报告生成脚本）
- `web/shared/*narrative*` 类型（如确需扩展）
- `web/data/prism-out/bk26b-perfetto-report-mvp/**`（产物）
- `web/server/prism/*.test.ts` 或新增 smoke 测试
- 本工单文件（回填完工报告并改 REVIEW）

若需要改其它文件，必须在完工报告说明原因和范围。

## 禁止事项

- 不要绕过 WT-017，直接从 summary 写作文报告。
- 不要把 `report.md` 或 skeleton 当作标准交付。
- 不要伪造 FrameTimeline/GPU/thermal/callTree。
- 不要声称逐帧相关。
- 不要大改 Unity 报告现有行为。

## 验收标准

1. 产出 `narrative.json` 和 `report.html`。
2. 报告关键结论均可回链 WT-017 evidence/provenance。
3. base 空 callTree、FrameTimeline 缺失、window-only correlation 被报告诚实呈现。
4. HTML 至少具备清晰章节、对照表、finding 卡片、hot path 聚焦块、证据入口。
5. 有一条命令可复现生成报告。
6. 测试或 smoke 命令通过。
7. 完工报告列出产物路径、命令、报告截图/摘要（如无法截图则列 HTML 主要结构）、边界。

## 完工报告（施工方填）

待填写。

## 验收结论（主 agent 填）

待验收。
