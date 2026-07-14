# 工单 WT-018 · BK-26b-report Perfetto narrative.json + report.html MVP

> 状态：DONE（主 agent 验收 PASS）｜里程碑：M5 多源扩展 / Perfetto 标准报告｜执行方：Cursor Agent + 主 agent 直播复跑验收
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

## 接续说明（主 agent，2026-07-14，派发前加）

WT-017 已验收 PASS 并提交（commit `771735e`）。本单首次派发。为避免 Cursor headless 模式 shell 故障导致超时（WT-014/017 均踩过），施工方必须遵守以下约束。

### 已确认的前置状态（不要重新验证，直接信）

- **WT-017 产物已就绪**，路径 `web/data/prism-out/bk26b-perfetto-explore-mvp/`：
  - `ledger.json`：17 条 evidence，每条含 `id/tool/role/args/provenance/summary/facts/dataRefs`。provenance 含 `runId/tool/args/source:'perfetto'/role`。
  - `findings.json`：6 条 findings（f-01..f-06），全部回链 evidenceIds。每条含 `id/title/severity/evidenceIds/claim/boundary`。
  - `verdict.json`：顶层 `source/sampleSet/summary/conclusions[]/boundaries[]/findingIds[]`。
  - `run.log`：运行日志（被 .gitignore 忽略，不入库，但本地可读）。
- **WT-017 关键数字**（来自 query 返回，非脑补，报告里可直接引用但必须回链 evidence）：
  - UnityMain runningPct: base=86.94 / cur=77.82 / throttle=56.99
  - avgMhz: 1729.5 / 1576.3 / 1324.6（throttle 降频）
  - throttle throttlingLevel=suspected, bigCoreReachPct=59.2
  - PlayerLoop count: 684/484/428；avgMs: 16.621/30.183/46.567
  - FinishFrameRendering(hotPath): cur(totalMs=6311.62,totalPct=43.03) vs throttle(totalMs=11117.55,totalPct=55.71)
- **三个边界（WT-017 已显式记录，报告必须诚实呈现）**：
  - base callTree `via PlayerLoop anchor fallback`（f-02）→ 报告里 base callTree 展示需注明 fallback 来源、绝对 ms lower-confidence。
  - FrameTimeline 三态 `available:false`（f-01）→ 报告里不判断 jank/GPU busy。
  - `correlateFrameSchedCpu granularity:window`（f-03/f-05）→ 报告里不声称逐帧相关。
- **WT-013 query 工具**在 `web/server/prism/tools.ts`，CLI 在 `tools.cli.ts`，可补读 query 输出但必须入 audit，不得无 provenance 引入新数字。
- **现有 Prism narrative/renderer 代码**：施工方应先 GLOB/Read `web/server/prism/*narrative*` 和 `*renderer*` 相关文件，判断复用方式。优先复用，若不适配 Perfetto 允许新增薄 adapter，不要大改 Unity 报告路径。
- **测试基线**：`cd web && node --import tsx server/prism/tools.test.ts` → 116 PASS。

### 实现路径（建议，非强制，但偏离需在完工报告说明）

1. **新增报告生成脚本**，建议路径 `web/server/scripts/perfetto-report-mvp.ts`（一次性脚本，半正式）。
2. **脚本逻辑**：
   - 读 WT-017 产物（ledger/findings/verdict）作为唯一输入。
   - 允许补读 WT-013 query 输出充实 audit，但不得引入无 provenance 的新数字进 narrative 正文。
   - 生成 `narrative.json`（结构见工单第 2 节）。
   - 生成 `report.html`（结构见工单第 3 节）。
3. **narrative.json 必含字段**：`source:'perfetto'` / `sampleSet:'bk26b-perfetto-triad'` / `topConclusions` / `findings` / `evidenceSummary` / `capabilityBoundaries`。
4. **report.html 必含章节**（工单第 3 节已列，重申关键点）：
   - 标题 + 样本说明（base/cur/throttle 窗口级 Perfetto 分析）
   - 顶部结论 3-5 条
   - 三态对照表（sched/atrace/cpu/frame）
   - 主要 findings（每条含证据引用）
   - callTree/hotPath 聚焦展示：cur/throttle 显示 hot path / Top children；base 空树或 fallback 时诚实标注
   - 能力边界（FrameTimeline/GPU/thermal confirmed）
   - 审计/证据入口（evidence id/tool/role）
5. **"漂亮报告"边界**（工单第 4 节）：允许轻量美化（章节卡片/表格/简单条形/百分比/hot path 聚焦块）；不要求 ECharts/复杂交互/完整 BK-25 图文流重构。
6. **复用优先**：优先复用现有 Prism HTML renderer/narrative 代码；若不适配 Perfetto 允许新增薄 adapter，不要大改 Unity 报告路径。

### 产物路径（强制）

写到 `web/data/prism-out/bk26b-perfetto-report-mvp/`：
- `narrative.json`
- `report.html`
- `audit.json`（如需要）
- `run.log`（脚本 stdout 重定向即可，会被 .gitignore 忽略，不入库但本地要有）

### 复现命令（必须在完工报告列出）

脚本必须可一条命令跑出全部产物，例如：
```bash
cd web && node --import tsx server/scripts/perfetto-report-mvp.ts
```

### 时间预算约束

- 施工方不要跑完整 LLM explore（会超时）。
- 不要重跑 WT-017 explore 脚本（产物已就绪，直接消费）。
- 不要重跑 provider build（profile 已就绪）。
- 不要重新诊断 WT-013/WT-014/WT-017 是否正确——前置状态已确认，直接信。
- 脚本本身是同步读 JSON + 生成 HTML，秒级完成，不会超时。
- **若 Cursor shell 不可用无法自测**：按 WT-017 模式，施工方诚实交代，按脚本逻辑对照 WT-017 产物手写 narrative.json/report.html，并在完工报告明确说明。主 agent 会直播跑脚本复现验收。

### 自测要求

- 脚本跑通，产物文件生成且 JSON/HTML 合法。
- `cd web && node --import tsx server/prism/tools.test.ts` 仍 116 PASS（不应退化）。
- 不要求新增测试，但若新增测试不得退化既有 116 PASS。

## 完工报告（施工方填）

### 改了什么

1. **新增** `web/server/scripts/perfetto-report-mvp.ts`  
   - 只读 WT-017 产物：`ledger.json` / `findings.json` / `verdict.json`  
   - 生成 Perfetto 薄 narrative（**不**耦合 Unity `NarrativeReport` / `render-html.ts`，因后者依赖 Prism DB `drillDownMarker`）  
   - 内联轻量 HTML 渲染（章节卡片 / 对照表 / 条形百分比 / hot path 聚焦 / 证据表）

2. **产物** `web/data/prism-out/bk26b-perfetto-report-mvp/`  
   - `narrative.json` — 含必填字段：`source:'perfetto'` / `sampleSet:'bk26b-perfetto-triad'` / `topConclusions`(5) / `findings`(6) / `evidenceSummary`(17) / `capabilityBoundaries`(3)；另附 `triadComparison` / `callTrees` / `inputProvenance`  
   - `report.html` — 章节：标题样本说明、概览、顶部结论 5 条、三态对照表、findings 卡、callTree/hotPath 三态聚焦、能力边界、审计证据入口  
   - `audit.json` — 输入/输出/provenance 策略/callTree notes  
   - `run.log`

### HTML 主要结构（无法截图时的摘要）

- hero：source/sampleSet/window-level pills + base/cur/throttle 说明  
- 顶部结论卡 ×5（含 findingIds + evidenceIds）  
- 三态表：sched running/sleeping · atrace PlayerLoop/BehaviourUpdate · cpu avgMhz/throttling · FrameTimeline unavailable  
- Findings f-01..f-06，每条 evidence 锚点回链  
- Hot path：base=`fallback` 标注；cur/throttle=`native`；Top children 沿 hot path  
- 能力边界：无 FrameTimeline/jank、无 GPU busy、thermal suspected、window-only  
- 证据表：17 行 id/tool/role/runId/summary

### 复现命令

```bash
cd web && node --import tsx server/scripts/perfetto-report-mvp.ts
```

### 怎么自测的

- **Cursor shell 不可用**：多次 `Shell` 调用均 “no exit status”，无法在本会话执行脚本或 `tools.test.ts`。  
- 按工单「若 Cursor shell 不可用」条款：对照已就绪的 WT-017 JSON，按脚本同一逻辑物化产物；数字均回链 ledger evidence（如 runningPct 86.94/77.82/56.99、avgMhz 1729.5/1576.3/1324.6、FinishFrameRendering 6311.62/43.03 vs 11117.55/55.71）。  
- **请主 agent 验收时直播跑**：  
  1. `cd web && node --import tsx server/scripts/perfetto-report-mvp.ts`（应覆盖同路径产物）  
  2. `cd web && node --import tsx server/prism/tools.test.ts`（预期仍 116 PASS；本单未改 tools）

### 有无偏离

- **复用路径偏离（说明）**：现有 `render-html.ts` 强依赖 Unity narrative + DB drillDown，不适配 Perfetto 证据源；新增独立脚本薄 adapter，**未**改 Unity 报告路径 / `narrative-types.ts` / `render-html.ts`。  
- **产物物化方式偏离**：因 shell 故障，产物由施工方按脚本逻辑手写落地；脚本本身为正式复现入口，主 agent 跑通后应以脚本输出为准覆盖。  
- **未改** `plan/backlog.md`、`state/now.md`；**未** git commit；**未**重跑 explore/provider/LLM。

## 验收结论（主 agent 填）

**验收结论：PASS（WT-018 / BK-26b-report Perfetto narrative.json + report.html MVP 通过）。**

DR-36 核验摘要（主 agent 2026-07-14 亲自跑）：

1. **脚本直播跑通**：`cd web && node --import tsx server/scripts/perfetto-report-mvp.ts` exit 0，4 个产物文件全部生成（narrative.json / report.html / audit.json / run.log）。直播输出已覆盖施工方手写产物，最终交付的是脚本真实输出。
2. **narrative.json 结构完整**：含 `source:'perfetto'` / `sampleSet:'bk26b-perfetto-triad'` / `overview` / `topConclusions(5)` / `findings(6)` / `evidenceSummary(17)` / `capabilityBoundaries(3)` / `triadComparison` / `callTrees` / `inputProvenance`，全部必含字段齐全。
3. **报告关键结论回链 evidence**：topConclusions 5 条每条含 `evidenceIds` + `findingIds`；findings 6 条全部回链 ledger 中已存在的 evidenceIds；triadComparison 每个数字都带 `evidenceId`；report.html Findings 卡每条含证据锚点链接。
4. **三个边界诚实呈现**：
   - base callTree：narrative `callTrees.base.viaPlayerLoopAnchorFallback=true` + note 注明 lower-confidence；report.html `fallback` badge + note "absolute ms lower-confidence vs cur/throttle native roots"；f-02 专条说明。
   - FrameTimeline：narrative `triadComparison.frame.*.androidFrameTimelineAvailable=false`；report.html 三态 `unavailable` badge + f-01 专条 + 能力边界列 "无 Android FrameTimeline → 不判断 jank"。
   - window-only correlation：f-03/f-05 + 能力边界列 "correlateFrameSchedCpu granularity=window → 不声称逐帧相关" + footer "no per-frame claim"。
5. **report.html 章节齐全**：标题样本说明（含 window-level pill）、概览、顶部结论 5 条、三态对照表（sched/atrace/cpu/frame）、Findings 卡（f-01..f-06 每条含证据回链）、CallTree/HotPath 聚焦（base fallback / cur native / throttle native，含 hot path 表 + Top children）、能力边界、审计证据入口（17 行 evidence 表）。
6. **关键数字真实可回溯**：均来自 WT-017 ledger，非脑补。UnityMain runningPct 86.94/77.82/56.99；avgMhz 1729.5/1576.3/1324.6；PlayerLoop 684/484/428 count, 16.621/30.183/46.567 avgMs；FinishFrameRendering(hotPath) cur=6311.62ms vs throttle=11117.55ms。
7. **测试未退化**：`cd web && node --import tsx server/prism/tools.test.ts` → 116 PASS, 0 FAIL。
8. **未越界**：git status 确认只新增脚本 + 产物目录 + 工单改名 + 派发日志；未碰 Unity render-html/narrative-types/tools.ts/provider/采集脚本。
9. **复用优先判定合理**：施工方查实 `render-html.ts` 强依赖 Unity DB drillDown，不适配 Perfetto 证据源，新增薄 adapter `perfetto-report-mvp.ts` 而非大改 Unity 路径，符合工单"复用优先+允许薄 adapter"要求。
10. **施工方偏离判定**：施工方诚实交代 Cursor shell 不可用无法自测，按 WT-017 模式手写产物。主 agent 直播跑脚本后输出与施工方手写产物一致，直播脚本输出已覆盖手写产物。偏离可接受。

结论：WT-018 可标记 DONE。**Perfetto 已走通完整 "query 工具 → provenance → evidence ledger → findings/verdict → narrative.json + report.html" 交付链路**，不依赖读 summary 写作文，报告里每个结论可回链 evidence。下一步建议：`WT-015` 报告层消费 source confidence、`WT-016` CustomSampler/Create 自动扫描扩展 map-source，或推进 memory loop / 跨源综合报告。
