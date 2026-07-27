# TODO-WT-027 · perfetto 接入框架三段管线（DR-44 需求 B）

> 状态：TODO（重新派发）｜ 里程碑：M5 Perfetto agent 化 ｜ 执行方：Cursor（派发）
>
> 前置：**WT-026 验收通过**（框架契约层已建：`report-pipeline.ts` + `narrativeProvenance` 校验 + A3 识别清单）。
> 开工前必读：`docs/prism/memory/methodology/report-pipeline-contract.md`（DR-44）+ `docs/prism/memory/dev/conventions.md` + 项目根 `CODEBUDDY.md`。
>
> **重要现状（Cursor 上次施工后的进展，本次在此基础上继续）**：
> - ✅ B1 已完成：`web/server/prism/prompts/perfetto-explore-prompt.txt` 已建好（含 DR-42/43 多态/单态判定 + perfetto 工具集）
> - ✅ B2 部分完成：`explore-service.ts` 已加 `source: 'unity' | 'perfetto'` 参数路由 prompt
> - ❌ B2 未完成：`explore.cli.ts` 没同步 source 参数；narrative 阶段没有独立 service
> - ❌ B3 未做：`perfetto-report-mvp.ts` 脚本基座未废弃
> - ❌ 测试矛盾未处理：`tools.test.ts` [15][16] 节依赖旧脚本 `runReportMvp`

## 背景

perfetto 阶段三段管线一段都没走（DR-44 §1.2）：explore 是脚本（No LLM）、narrative 是脚本拼（`buildNarrative` + `humanizeFinding`）、产物含审计字段。

**关键发现**：unity 的 narrative 阶段**也没有自动化 service**——`narrative-prompt.txt` 存在但没有被任何 .ts 文件引用，unity 的 `narrative.json` 是手动跑的。所以 perfetto 不能"复用 unity 的 narrative service"，要**从零建 narrative service**。

## 四个需求（按顺序做）

### 需求 B1：补全 explore CLI 入口（已完成的部分确认 + 小补）

**已完成**：`prompts/perfetto-explore-prompt.txt` 已建好，`explore-service.ts` 已加 source 路由。

**本次要补**：
- `web/server/prism/explore.cli.ts` 加 `--source` 参数（默认 unity，可传 perfetto）
- 确认 `explore-service.ts` 的 source 路由能正确加载 perfetto-explore-prompt.txt
- 不需要跑通完整 explore（跑 LLM 太慢），只需类型检查 + dry-run 确认 prompt 能加载

**验收**：
- `explore.cli.ts --source perfetto` 能正确传参到 `runPrismExplore({source:'perfetto'})`
- 类型检查通过

### 需求 B2：新建 narrative-service.ts（从零建，unity/perfetto 共用）

**文件**：`web/server/prism/narrative-service.ts`（**新建**）

**任务**：建一个数据源无关的 narrative 阶段 service，读 findings.json + verdict.json，spawn CLI 用 narrative-prompt.txt，产出 narrative.json。

**参照** `explore-service.ts` 的 spawn CLI 模式：
```ts
export async function runPrismNarrative(opts: {
  source?: 'unity' | 'perfetto';
  runId?: string;
  outputDir?: string;  // 读 findings.json/verdict.json，写 narrative.json
}): Promise<NarrativeRunResult> {
  // 1. 读 outputDir/findings.json + verdict.json
  // 2. 加载 prompts/narrative-prompt.txt，替换 {{OUTPUT_DIR}} 等占位符
  // 3. spawn CLI（codebuddy/claude），把 prompt 喂进去
  // 4. 解析 LLM 产出，写 narrative.json
  // 5. 校验 narrativeProvenance.generatedBy === 'LLM'（WT-026 A2 机制）
}
```

**关键**：
- narrative-prompt.txt 是数据源无关的，unity/perfetto 共用
- 不需要跑通完整 narrative（跑 LLM 太慢），只需建好 service + 类型检查通过
- 占位符替换：`{{OUTPUT_DIR}}` / `{{RUN_ID}}` / `{{REPORT_TEMPLATE}}`（WT-028 填，本工单先用空字符串）

**验收**：
- `narrative-service.ts` 存在，导出 `runPrismNarrative` 函数
- 类型检查通过
- narrative-service 读 findings/verdict、spawn CLI、写 narrative.json 的流程完整

### 需求 B3：废弃 perfetto-report-mvp.ts 脚本基座 + 适配测试

**文件**：
- `web/server/scripts/perfetto-report-mvp.ts`（改为 thin wrapper 或保留但标记 deprecated）
- `web/server/prism/tools.test.ts`（改 [15][16] 节）

**任务**：

1. **`perfetto-report-mvp.ts` 处理**：
   - 不删除文件（避免破坏 import）
   - 在文件顶部加 `@deprecated` 注释，说明已改走三段管线（WT-027）
   - `buildNarrative` / `humanizeFinding` / `buildRoiOptimizations` 等函数标记 `@deprecated`
   - `runReportMvp` 改为 thin wrapper：调 `render-html.ts` 渲染（不再自己拼 narrative）

2. **`tools.test.ts` [15][16] 节改造**：
   - [15] 节原测 `runReportMvp` 产出的旧结构（findings/roiOptimizations/triadTrend 等）→ 改为测新三段管线产出的 `NarrativeReport` 结构（overview/topConclusions/sections/prioritySummary）
   - [16] 节原测旧 report.html 的 §0-§6 章节标题 → 改为测新 report.html 的 NarrativeReport 渲染输出
   - 如果新三段管线还没跑出产物，[15][16] 节先改成"跳过 + TODO 注释"（等 WT-028 跑通后再补完整测试）

3. **[14] 节处理**：
   - [14] 节测 `runExploreMvp`（旧脚本 explore）→ 保留但标记 `// TODO: WT-027 后改测 runPrismExplore({source:'perfetto'})`

**验收**：
- `perfetto-report-mvp.ts` 标记 @deprecated，`runReportMvp` 不再拼 narrative
- `tools.test.ts` [15][16] 节不回归（改成跳过或测新结构）
- `tools.test.ts` 整体 PASS（允许 [15][16] 节 skip，但不能 FAIL）

### 需求 B4：注册 perfetto pipeline + 跑通三段管线（dry-run）

**文件**：`web/server/prism/report-pipeline.ts`（修改，注册 perfetto）

**任务**：
1. 在 `report-pipeline.ts` 加 perfetto pipeline 注册（`reportTemplatePath: null`，WT-028 填）
2. 建一个 dry-run 脚本 `web/server/prism/run-perfetto-pipeline.ts`，串起三段：
   - `runPrismExplore({source:'perfetto'})` → findings.json
   - `runPrismNarrative({source:'perfetto'})` → narrative.json
   - `render-html.ts --dir <output>` → report.html
3. **不需要实际跑 LLM**（太慢），只需脚本结构完整 + 类型检查通过

**验收**：
- `report-pipeline.ts` 注册了 perfetto pipeline
- `run-perfetto-pipeline.ts` 存在，串起三段
- 类型检查通过
- `tools.test.ts` 整体 PASS（[15][16] 可 skip）

## 验收命令

```bash
# 类型检查
cd web && npx tsc --noEmit -p tsconfig.server.json --ignoreDeprecations 6.0 2>&1 | findstr /V "node_modules" || echo "typecheck done"

# 测试不回归（[15][16] 可 skip）
cd web && node --import tsx server/prism/tools.test.ts
```

## 验收点

1. `explore.cli.ts` 支持 `--source perfetto`
2. `narrative-service.ts` 存在，导出 `runPrismNarrative`，数据源无关
3. `perfetto-report-mvp.ts` 标记 @deprecated，`runReportMvp` 不再拼 narrative
4. `tools.test.ts` [15][16] 节不回归（skip 或测新结构）
5. `report-pipeline.ts` 注册了 perfetto pipeline
6. `run-perfetto-pipeline.ts` 串起三段
7. `tools.test.ts` 整体 PASS（[15][16] 可 skip）
8. 类型检查通过

## 约束

- **三段管线硬契约**（DR-44 §6.1）：explore LLM → narrative LLM → render 纯代码
- **报告脚本只做渲染，不写内容**（DR-44 §6.2）
- **数据源特定逻辑只在 explore 阶段**（DR-44 §6.3）
- **复用框架层，不另起炉灶**（DR-44 §6.4）
- **严禁硬编码**业务名/绝对阈值/死模板
- **不需要实际跑 LLM**（太慢），只需建好 service + 类型检查通过 + 测试不回归
- 先读 DR-44 + dev/conventions.md 再动手

## 派发说明

本工单派给 Cursor。**给 30 分钟超时**（工单较重，10 分钟不够）。

派发命令（注意超时参数）：

```powershell
# 由于 dispatch 脚本默认超时 10 分钟，本工单需要手动派发或调整超时
.\docs\prism\process\scripts\dispatch-ticket-codebuddy.ps1 -Ticket TODO-WT-027-perfetto-pipeline-integration.md
```
