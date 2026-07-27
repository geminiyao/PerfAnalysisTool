# TODO-WT-026 · 报告生成框架契约层（DR-44 需求 A）

> 状态：TODO ｜ 里程碑：M5 Perfetto agent 化 / 跨源报告基建 ｜ 执行方：Cursor（派发）
>
> 前置：读 `docs/prism/memory/methodology/report-pipeline-contract.md`（DR-44 完整设计）+ `docs/prism/memory/dev/conventions.md`（开发约定）+ 项目根 `CODEBUDDY.md`。
>
> 关联工单：本工单是 DR-44 三段管线修复的**第一阶段**（框架契约）。后续 WT-027（perfetto 接入）依赖本工单验收通过，WT-028（v5.3 反向沉淀）依赖 WT-027。

## 背景

perfetto 阶段三段管线一段都没走，退化成作文机（`web/server/scripts/perfetto-explore-mvp.ts:4` 明写 "No LLM"，`perfetto-report-mvp.ts:1674` 的 `buildNarrative` 脚本拼 narrative）。

Unity 阶段（`web/server/prism/`）正确走了三段管线，是参照实现：
- `explore-service.ts` spawn CLI ← `prompts/explore-prompt.txt` → LLM 写 findings.json
- 第二段 spawn CLI ← `prompts/narrative-prompt.txt` → LLM 写 narrative.json
- `render-html.ts` 纯代码读 narrative.json → 渲染 report.html

本工单把三段管线从"设计文档"升级为"可执行框架契约"，让数据源接入时**机制上无法绕过 LLM**。

## 三个需求

### 需求 A1：定义 ReportPipeline 抽象接口

**文件**：`web/server/prism/report-pipeline.ts`（新建）

定义数据源接入报告生成三段管线的契约接口。核心原则（DR-44 §2.1）：
- narrative-prompt 和 render-html 是**数据源无关的，所有数据源共用**
- 每个数据源**只实现 explore 侧**：explore-prompt.txt + 工具集注册 + 报告章节模板路径
- 不存在"perfetto 三段管线""unity 三段管线"——三段管线只有一份，是框架层

接口设计（参考 DR-44 §2.2）：

```ts
import type { ToolRegistry } from './tools.js';

/**
 * 数据源接入报告生成三段管线的契约。
 * 每个数据源（unity/perfetto/simpleperf）实现一份，注册到 pipeline registry。
 *
 * 三段管线（DR-44）：
 *   explore LLM → findings.json
 *   narrative LLM → narrative.json（数据源无关，框架提供）
 *   render 纯代码 → report.html（数据源无关，框架提供）
 *
 * 数据源只实现 explore 侧 + 报告模板路径，narrative/render 不写。
 */
export interface ReportPipeline {
  /** 数据源标识（如 'unity' / 'perfetto' / 'simpleperf'） */
  source: string;

  // ── 数据源特定：explore 阶段 ──
  /** explore prompt 路径（如 'prompts/explore-prompt.txt' for unity, 'prompts/perfetto-explore-prompt.txt' for perfetto） */
  explorePromptPath: string;
  /** explore 阶段可用的工具集注册（数据源特定工具） */
  exploreTools: ToolRegistry;

  // ── 数据源特定：报告章节模板（注入 narrative-prompt 的 {{REPORT_TEMPLATE}}） ──
  /** 报告章节模板路径（如 'prompts/report-templates/perfetto-multi-state.txt'）。null = 用默认骨架 */
  reportTemplatePath: string | null;

  // ── 数据源无关：narrative 阶段（框架固定提供，数据源不写） ──
  // narrativePromptPath 固定为 'prompts/narrative-prompt.txt'，不暴露在接口里

  // ── 数据源无关：渲染阶段（框架固定提供，数据源不写） ──
  // renderHtml 固定为 render-html.ts，不暴露在接口里
}

/** 数据源 pipeline 注册表 */
export interface PipelineRegistry {
  get(source: string): ReportPipeline | undefined;
  register(pipeline: ReportPipeline): void;
  list(): string[];
}
```

**实现**：
- 新建 `report-pipeline.ts`，定义上述接口 + 一个默认的 `PipelineRegistry` 实现（Map-based）
- 提供 `getDefaultPipeline(source)` 工厂函数
- **不修改 unity 现有代码**——unity 暂时不强制接入 registry，本工单只建框架，接入是 WT-027 的事

**验收**：
- `report-pipeline.ts` 存在，导出 `ReportPipeline` 接口 + `PipelineRegistry` 接口 + 默认实现
- 接口里 narrative/render 不暴露（数据源无关，框架固定）
- 类型检查通过（`tsx --typecheck` 或类似）

### 需求 A2：narrative.json provenance 强制校验

**文件**：
- `web/server/prism/narrative-types.ts`（修改）— 加 `narrativeProvenance` 字段到 `NarrativeReport`
- `web/server/prism/prompts/narrative-prompt.txt`（修改）— 让 LLM 产出时带 provenance
- `web/server/prism/render-html.ts`（修改）— 渲染前校验 `generatedBy === "LLM"`，非 LLM 拒绝渲染

**narrative-types.ts 改动**：

在 `NarrativeReport` 接口末尾加：

```ts
export interface NarrativeProvenance {
  /** 产出阶段标记，固定 'narrative-llm' */
  stage: 'narrative-llm';
  /** narrative-prompt 版本（如 'narrative-prompt.txt@v1'） */
  promptVersion: string;
  /** 产出方标记——必须是 'LLM'。脚本拼的 = 'script'，会被 render-html 拒绝渲染 */
  generatedBy: 'LLM' | 'script';
}

export interface NarrativeReport {
  // ... 现有字段 ...
  /** 产出溯源（DR-44 A2）：render-html 校验 generatedBy==='LLM'，非 LLM 拒绝渲染 */
  narrativeProvenance: NarrativeProvenance;
}
```

**narrative-prompt.txt 改动**：

在产出契约末尾加要求：LLM 写 narrative.json 时必须包含 `narrativeProvenance: { stage: 'narrative-llm', promptVersion: 'narrative-prompt.txt@v1', generatedBy: 'LLM' }`。

**render-html.ts 改动**：

读 narrative.json 后立即校验：

```ts
const report = JSON.parse(raw) as NarrativeReport;
if (!report.narrativeProvenance || report.narrativeProvenance.generatedBy !== 'LLM') {
  throw new Error(
    `render-html: narrative.json 的 narrativeProvenance.generatedBy 不是 'LLM'（实际：${report.narrativeProvenance?.generatedBy ?? 'missing'}）。` +
    `脚本拼的 narrative.json 会被拒绝渲染——必须走 narrative LLM 阶段（DR-44 A2）。`
  );
}
```

**验收**：
- `narrative-types.ts` 的 `NarrativeReport` 含 `narrativeProvenance` 字段
- `narrative-prompt.txt` 要求 LLM 产出带 provenance
- `render-html.ts` 渲染前校验，非 `generatedBy: "LLM"` 抛错
- 用 `web/data/prism-out/bk26b-perfetto-report-mvp/narrative.json`（脚本拼的，无 provenance）测试 render-html，应抛错
- 用 `web/data/prism-out/unity-outside-stressmove/2026-07-11_14-55-28/narrative.json`（LLM 写的）测试，需先补 provenance 字段才能通过

### 需求 A3：数据源特定逻辑移出报告层（本工单只做"识别 + 文档化"，移除在 WT-027）

**文件**：本工单**不修改** `perfetto-report-mvp.ts`，只做识别和文档化。

**任务**：扫描 `web/server/scripts/perfetto-report-mvp.ts`，列出所有"数据源特定判定逻辑"（不是渲染逻辑），写入本工单的"识别清单"。这些逻辑会在 WT-027 移到 perfetto explore-prompt 作为 LLM 推理任务。

**识别标准**（DR-44 §6.3）：
- ✅ 报告脚本可以做：HTML 渲染、ASCII 图、表格、调用树、数据换算（GC 子树次数→每帧次数）
- ❌ 报告脚本不可以做：写人话结论、写优化建议、写因果推理、把字段名翻译成中文句式、数据源特定判定（wait slice 重叠/降频矩阵/GPU-bound 判定）

**交付物**：在本工单末尾追加"## A3 识别清单"章节，列出：
- 函数名 + 行号
- 是"判定逻辑"还是"渲染逻辑"
- 如果是判定逻辑，建议移到 explore-prompt 的哪个推理任务

**验收**：
- 识别清单完整覆盖 `perfetto-report-mvp.ts` 里的所有判定逻辑
- 清单写入本工单文件末尾

## 验收命令

```bash
# 类型检查
cd web && npx tsc --noEmit server/prism/report-pipeline.ts server/prism/narrative-types.ts 2>&1 | grep -v "node_modules" || echo "typecheck pass"

# provenance 校验测试（脚本拼的应抛错）
cd web && node --import tsx -e "
const fs = require('fs');
const path = require('path');
// 读脚本拼的 narrative.json，模拟 render-html 的校验逻辑
const raw = fs.readFileSync('data/prism-out/bk26b-perfetto-report-mvp/narrative.json', 'utf8');
const report = JSON.parse(raw);
const ok = report.narrativeProvenance?.generatedBy === 'LLM';
console.log('provenance check:', ok ? 'PASS (不应 PASS，这是 bug)' : 'FAIL (预期，脚本拼的被拦截)');
process.exit(ok ? 1 : 0);
"

# 现有测试不回归
cd web && node --import tsx server/prism/tools.test.ts
```

## 验收点

1. `web/server/prism/report-pipeline.ts` 存在，导出 `ReportPipeline` + `PipelineRegistry` 接口 + 默认实现
2. `NarrativeReport` 含 `narrativeProvenance` 字段（`narrative-types.ts`）
3. `narrative-prompt.txt` 要求 LLM 产出带 `narrativeProvenance.generatedBy: "LLM"`
4. `render-html.ts` 渲染前校验 `generatedBy === "LLM"`，非 LLM 抛错
5. 用脚本拼的 narrative.json 测试 render-html，被拦截
6. A3 识别清单写入本工单末尾，覆盖 `perfetto-report-mvp.ts` 所有判定逻辑
7. `tools.test.ts` 不回归（原有测试全 PASS）

## 约束

- **不修改** `web/server/scripts/perfetto-report-mvp.ts`（A3 只识别不移除，移除在 WT-027）
- **不修改** unity 现有 explore/narrative/render 代码（unity 接入 registry 是后续工单）
- 严禁硬编码业务名/绝对阈值/死模板（DR-41 + dev/conventions.md）
- 复用 `web/server/prism/` 框架层，不在 `web/server/scripts/` 另起炉灶
- 先读 DR-44 + dev/conventions.md 再动手

## 派发说明

本工单派给 Cursor。派发命令：

```powershell
.\docs\prism\process\scripts\dispatch-ticket-codebuddy.ps1 -Ticket TODO-WT-026-report-pipeline-framework.md
```

或手动派 Cursor CLI。工单内容自包含，Cursor 读工单 + DR-44 + dev/conventions.md 即可开工。

---

## A3 识别清单（施工方回填）

> 施工方扫描 `web/server/scripts/perfetto-report-mvp.ts` 后回填本节。
>
> 识别标准（DR-44 §6.3）：
> - ✅ 报告脚本可以做：HTML 渲染、ASCII 图、表格、调用树、数据换算（GC 子树次数→每帧次数）
> - ❌ 报告脚本不可以做：写人话结论、写优化建议、写因果推理、把字段名翻译成中文句式、数据源特定判定（wait slice 重叠/降频矩阵/GPU-bound 判定）

### 判定逻辑（❌ 应移到 perfetto explore-prompt 的 LLM 推理任务）

| 函数名 | 行号 | 逻辑类型 | 建议去向 |
|---|---|---|---|
| `humanizeFinding` | 487-590 | 判定逻辑（写人话结论 + GPU-bound 因果推理 + off-CPU byState 翻译 + 降频形态翻译 + PlayerLoop 分位数翻译 + 涨幅模块翻译 + GC 压力翻译 + thermal-only 翻译 + top-business 翻译 + sched-relative 翻译）——11 个正则匹配 + 句式填充，把 log 风 claim 翻译成人话 | 移到 perfetto explore-prompt：findings 的 conclusion 字段直接由 LLM 写人话，不需要脚本翻译。explore LLM 产出时 conclusion 就该是人话（DR-44 §1.1 unity 参照） |
| `buildContribution` | 592-604 | 判定逻辑（拼人话 contribution + 拼因果推理）——把 humanizeFinding + relativeBaseline.relativeJudgment + causalChain.inference 拼成 contribution 文本 | 移到 perfetto explore-prompt：contribution 由 LLM 在 findings 阶段直接推理写出，narrative 阶段再组织 |
| `buildRoiOptimizations` | 611-727 | 判定逻辑（写优化建议）——按 kind 分组（rise/gc/gpu/freq/thermal）套固定建议句式："建议单次任务削峰/增量化/分帧""建议对象池/减少分配/字符串池化""建议降分辨率/简化阴影/MeshUI 顶点数评估/drawcall 削减"等万能套话 | 移到 perfetto explore-prompt：优化建议由 LLM 根据 finding 具体内容推理产出（recommendation 字段），不套模板。narrative LLM 再汇总成 prioritySummary |
| `buildMultiThreadMacro`（线程 note 生成部分） | 756-788 | 判定逻辑（写人话线程定位）——基于三态 runningPct/sleepingPct 数值用 if-else 生成"越来越闲""高负载主线程形态""长期等待态非瓶颈"等人话注解 | 移到 perfetto explore-prompt：线程形态判定由 LLM 看 threadsSched 数据推理产出（可作为 finding 的 conclusion） |
| `buildOffCpuAttribution`（wait slice 重叠法） | 854-953 | 判定逻辑（wait slice 重叠 + GPU-bound 归因）——从 ledger/callTree 找 Gfx.WaitForPresent/URP.WaitForPresent，算 coveragePct = maxWaitMs / sTotalMs × 100，判定"主线程 Sleeping 中 X% 是等 GPU" | 移到 perfetto explore-prompt 的 "off-CPU 归因" 推理任务：LLM 用 queryOffCpuAttribution + querySchedState 工具数据推理"Sleeping 中多少是等 GPU" |
| `buildAsciiCausalChain` | 984-1054 | 判定逻辑（写因果链人话 + 排除项判定）——硬编码因果链文本"主线程发起 PostLateUpdate.FinishFrameRendering → ... → 等 swapchain Present 信号 → 真因双重叠加 (1) GPU 处理一帧本身要 ~Nms (2) swapchain 排队"；硬编码排除项"❌ binder IPC 阻塞""❌ ECS Worker 阻塞""❌ Lua GC spike" | 移到 perfetto explore-prompt：因果链由 LLM 基于 wait slice + sched 数据推理产出；排除项由 LLM 基于多信号推理（不是硬编码清单） |
| `buildFreqMatrix`（matrix 判定部分） | 1079-1148 | 判定逻辑（降频矩阵 confirmed/likely/suspected 三档判定）——用阈值 reach<65% 严重低频 / reach<80%+Run≥80% 背离 / Δ≥5°C 或采后≥75°C 温度旁路，逐态判定 ✅/❌ | 移到 perfetto explore-prompt 的 "降频判定" 推理任务：LLM 看 cpufreq + 温度数据推理 confirmed/likely/suspected 三档（阈值作为 prompt 纪律，不是硬编码 if-else） |
| `buildAsciiFreqMorphology`（形态识别部分） | 1175-1196 | 判定逻辑（降频形态识别）——用阈值 delta<-10 "重度降频 reach 暴跌" / delta<-3 "小幅下降" / else "持平"；凉机起步/起点饱和/温度走平判定 | 移到 perfetto explore-prompt：降频形态由 LLM 看三态 reach + 温度数据推理产出 |
| `buildRedlineMatrix`（红线判定部分） | 1342-1353 | 判定逻辑（红线类型判定）——用阈值 foldCurBase≥2 "🔴 cur 涨幅显著" / foldThrottleCur≥1.5 "🔴 throttle 涨幅显著" / perFrame≥1.0 "🟡 临近红线" / else "🟢 健康" | 移到 perfetto explore-prompt：红线判定由 LLM 看三态 perFrameMs + foldChange 推理产出（阈值作为 prompt 纪律） |
| `buildGpuBoundMatrix`（judgment 判定部分） | 1383-1435 | 判定逻辑（GPU-bound 多信号判定）——对每个信号硬编码 judgment："❌ GPU 满载硬证给不出""🔴 强信号""🔴 CPU 链路不是瓶颈""🔴 业务跨周期掉帧不是 SF 问题""排除 IPC 阻塞" | 移到 perfetto explore-prompt 的 "GPU-bound 判定" 推理任务：LLM 基于 wait slice 重叠 + Render/RHI 变闲 + Choreographer 稳 + binder 低等多信号同向推理产出 |
| `buildTopConclusionBlocks`（oneLiner + keyNumbers） | 1450-1672 | 判定逻辑（写人话结论 + 因果推理）——oneLiner "主线程瓶颈形态：从 base 几乎全程在算演化到 throttle 半睡型——核心增量是等 GPU 不是等锁/binder"；keyNumbers "throttle 单帧平均等 GPU Xms 已超 60Hz vsync 周期 → swapchain 撑爆""Sleep 增量 Xpp 中约 Y% 来自等 GPU" | 移到 perfetto explore-prompt + narrative-prompt：findings 的 conclusion/reasoning 由 explore LLM 写；narrative LLM 组织成 oneLiner/keyNumbers（基于 findings 推理，不是脚本拼） |
| `buildNarrative`（topConclusions 选取 + findings 映射） | 1762-1801 | 判定逻辑（topConclusions 排序选取 + contribution 拼接 + humanNarrative 生成）——按 severity + causalChain + foldChange 排序取 top5，contribution 用 buildContribution（脚本拼人话），humanNarrative 用 humanizeFinding（脚本翻译） | 移到 perfetto explore-prompt + narrative-prompt：findings 排序由 explore LLM 产出时自带 severity/reasoning；narrative LLM 读 findings 后自己组织 topConclusions（不是脚本排序拼接） |

### 渲染逻辑（✅ 可保留在报告层，数据源无关渲染）

| 函数名 | 行号 | 逻辑类型 | 说明 |
|---|---|---|---|
| `renderHtml` | 2163-2593 | 渲染逻辑 | HTML 渲染，纯代码无判定。**但应移到 render-html.ts 框架层**（DR-44 §6.4：复用框架层不另起炉灶） |
| `renderFindingCards` | 1895-1910 | 渲染逻辑 | HTML 渲染 finding card |
| `renderCallTreeIndentTree` | 1913-1990 | 渲染逻辑 | callTree 缩进树渲染 |
| `renderRedlineMatrix` | 1992-2020 | 渲染逻辑 | 红线矩阵表格渲染（只画表格，判定逻辑在 buildRedlineMatrix） |
| `renderFreqMatrix` | 2022-2071 | 渲染逻辑 | 降频矩阵表格渲染（只画表格，判定逻辑在 buildFreqMatrix） |
| `renderGpuBoundMatrix` | 2073-2089 | 渲染逻辑 | GPU-bound 矩阵表格渲染（只画表格，判定逻辑在 buildGpuBoundMatrix） |
| `renderMultiThreadMacro` | 2091-2114 | 渲染逻辑 | 多线程宏观表格渲染（只画表格，note 判定逻辑在 buildMultiThreadMacro） |
| `renderOffCpuAttribution` | 2116-2161 | 渲染逻辑 | off-CPU 归因表格渲染（只画表格，判定逻辑在 buildOffCpuAttribution） |
| `pctBar` / `mhzBar` / `sevClass` | 1878-1893 | 渲染逻辑 | 进度条/样式辅助函数 |
| `convertCallTreeNode` | 807-829 | 渲染逻辑 | callTree 结构转换（数据换算：totalMs → perFrameMs） |
| `buildCallTreeDrilldown` | 831-850 | 渲染逻辑 | callTree 下钻数据组装（取主树 + frameCount） |
| `buildNameParentChains` | 1212-1227 | 渲染逻辑 | 子树归并辅助：name → parentChain 映射（已抽到 report-utils.ts 的 buildNameParentChainsGeneric） |
| `buildAsciiStateDistribution`（ASCII 绘制部分） | 955-981 | 渲染逻辑（部分） | ASCII 柱状图绘制本身是渲染；但 970-979 的"base 形态：低 Sleep CPU-bound 健康态"注解是判定逻辑，应移到 explore |
| `buildAsciiFreqMorphology`（ASCII 绘制部分） | 1159-1199 | 渲染逻辑（部分） | ASCII 形态对比图绘制本身是渲染；但 1175-1196 的形态识别注解是判定逻辑，应移到 explore |
| `buildTopConclusionBlocks`（ASCII 绘制部分） | 1478-1488, 1565-1589, 1634-1644 | 渲染逻辑（部分） | ASCII 柱状图绘制本身是渲染；但 oneLiner/keyNumbers 是判定逻辑 |

### 汇总

- **判定逻辑 12 处**（应移到 perfetto explore-prompt 作为 LLM 推理任务）
- **渲染逻辑 15 处**（可保留，但应复用 `web/server/prism/` 框架层而非 `web/server/scripts/` 另起炉灶）
- **核心反模式**：`humanizeFinding`（11 个正则翻译 log→人话）+ `buildRoiOptimizations`（5 类套话建议）+ `buildAsciiCausalChain`（硬编码因果链文本）——这三处是"作文机"硬伤，WT-027 优先移除
