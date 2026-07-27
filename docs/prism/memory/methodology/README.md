# 报告层方法论统一索引（WT-025 需求 1）

> **每个数据源的报告脚本开发前必读此索引。**
>
> 此索引把散落在 DR-41 / DR-42 draft / DR-43 draft / 标杆报告 / report-utils.ts 的报告层方法论收拢成统一入口，避免"每次写报告脚本都重新推导报告怎么写"。
>
> 关联（本目录内）：
> - `report-layer-rules.md`（DR-41 报告层五条硬规则，多态/单态通用宪法）
> - `single-state.md`（DR-42 单态分析方法论）
> - `multi-state.md`（DR-43 多态分析方法论）
> - `report-pipeline-contract.md`（DR-44 三段管线可插拔契约）
>
> 关联（其它）：
> - 可复用工具：`web/server/prism/report-utils.ts`
> - 自动检查：`web/server/prism/tools.test.ts` [16] 节（DR-41 五条硬规则自动检查）
> - 开发约定：`../dev/conventions.md`

---

## 一、报告层方法论体系（三层）

```
┌─────────────────────────────────────────────────────────────┐
│ 第 1 层：DR-41 五条硬规则（宪法，多态/单态通用，不可违反）    │
│   ① 审计剥离  ② 热点模块归并  ③ 宏观→各线程→下钻分层        │
│   ④ 图文穿插四段式  ⑤ 人话先行技术数字沉底                  │
└─────────────────────────────────────────────────────────────┘
          ▲                                        ▲
          │                                        │
┌─────────┴────────┐                       ┌──────┴──────────┐
│ 第 2 层：判定方法 │                       │ 第 2 层：叙事结构 │
│  （态数自适应）   │                       │  （态数自适应）   │
│                  │                       │                  │
│  多态（DR-43）    │                       │  多态（DR-43）    │
│  - foldChange    │                       │  - 演化型         │
│  - 演化趋势      │                       │  - 三态对照表     │
│                  │                       │                  │
│  单态（DR-42）    │                       │  单态（DR-42）    │
│  - 占 p50%       │                       │  - 当前态型       │
│  - 占 vsync%     │                       │  - 多信号同向验证 │
└──────────────────┘                       └──────────────────┘
          │                                        │
          ▼                                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 第 3 层：可复用工具 + 自动检查（执行层）                      │
│  - report-utils.ts：子树归并/人话化/判定/叙事/渲染 5 类工具  │
│  - tools.test.ts [16]：DR-41 五条硬规则自动检查（防返工）   │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、DR-41 五条硬规则（宪法，必读）

> 完整文档：`dr-41-report-layer-methodology.md`

### 规则 1：报告 = 呈现层，审计 = 底稿层
- **报告里只能有**：数据可视化（图表/ASCII/调用树）+ 人话结论 + 优化建议
- **报告里不能有**：evidence id / tool name / runId / provenance / 证据链 / 字段名（claim/boundary/relativeBaseline）
- **归属**：审计信息全部沉入 `audit.json` + `narrative.json` 的 `evidenceSummary`
- **自动检查**：`tools.test.ts` [16] 规则 1（9 assert）

### 规则 2：热点模块归并——同一子树的节点不重复出现在 top 列表
- **问题**：红线矩阵 top 8 里 URP.Render / RenderCameraStack / RenderSingleCamera 是同一棵子树不同层，不是独立问题
- **规则**：top 列表（红线矩阵/顶部结论/ROI）必须做子树归并——若模块 A 是模块 B 的祖先，只保留贡献最大那个，child 归并到 parent 的 `mergedChildren`
- **实现**：`report-utils.ts` 的 `buildNameParentChains` + `mergeBySubtree`（数据源无关）
- **自动检查**：`tools.test.ts` [16] 规则 2（4 assert，结构检查不硬编码业务名）

### 规则 3：报告结构 = 宏观 → 各线程汇总 → 下钻详情
- **正确结构**：§0 结论 → §1 元信息 → §2 多线程 → §3 off-CPU+GPU-bound → §4 降频 → §5 callTree+红线 → §6 ROI
- **错误结构**：findings 按 kind 罗列成 7 个 section（按 finding 分类，不是按读者认知层次组织）
- **规则**：报告章节按"读者认知层次"组织（宏观→细节），不按 finding 的 kind 字段组织
- **自动检查**：`tools.test.ts` [16] 规则 3（9 assert，h2 顺序检查）

### 规则 4：叙事 = 图文穿插，不是一大段文字
- **错误**：一整段文字里掺杂 5 个以上数字，像 log
- **正确**：引用块 + 加粗一句话 + ASCII 图/表格 + 关键数字解读 + 详见 §X（四段式）
- **规则**：每个结论用四段式；数字必须配解读；禁止超过 3 行的文字段落
- **实现**：`report-utils.ts` 的 `buildTopConclusionBlock` + `renderFourPartBlock`
- **自动检查**：`tools.test.ts` [16] 规则 4（4 assert）

### 规则 5：人话先行，技术数字沉底
- **反例**："throttle sleepingMs=7666.5 (byState.S.totalMs), maxWaitSlice=URP.WaitForPresent, coveragePct=691.53%"
- **正例**："throttle 上主线程 Sleeping 39% 中约 99% 是等 GPU"
- **规则**：报告正文只用"人话 + 关键数字"；技术细节沉入 `narrative.json` 的 `findings[].claim` + `boundary`
- **实现**：`report-utils.ts` 的 `humanizeRelativeJudgment` / `humanizeCausalInference` / `humanizeFoldChange`
- **自动检查**：`tools.test.ts` [16] 规则 5（2 assert，11 个字段名黑名单）

---

## 三、态数自适应（DR-42 单态 + DR-43 多态，DR-43 统一覆盖 2 态和 ≥3 态）

> 完整文档：`dr-42-single-state-methodology-draft.md` + `dr-43-multi-state-methodology-draft.md`
>
> **状态**：DR-42 / DR-43 均为 DRAFT，需 simpleperf/unity 单源 + WT-024 验证后定稿。
>
> **DR-43 覆盖范围**（WT-041 扩展）：
> - **2 态（diff）**：相对倍数 + 绝对增量，叙事"基线→当前"——N=2 的多态特例
> - **≥3 态**：相对倍数 + 演化趋势单调性，叙事"健康→病态"
> - **不单独开 DR-46**：2 态和 ≥3 态判定逻辑本质相同，统一用 DR-43

### 3.1 态数检测

报告脚本启动时先检测态数，决定走单态还是多态路径：

```ts
// report-utils.ts
detectStateMode(triadSummaries) → 'single' | 'multi'
// ≥2 个 role → 'multi'（DR-43，统一覆盖 2 态和 ≥3 态）；1 个 role → 'single'（DR-42）
```

**多态内部再分 2 态/≥3 态**（DR-43 扩展，WT-041）：
- 2 个 role → 2 态多态（diff）：用 foldChange + 绝对增量，叙事"基线→当前"
- ≥3 个 role → ≥3 态多态：用 foldChange + 演化趋势单调性，叙事"健康→病态"

### 3.2 判定方法论对照

| 维度 | 2 态多态（DR-43 扩展） | ≥3 态多态（DR-43 已有） | 单态（DR-42） |
|---|---|---|---|
| 业务热点 | foldChange ≥ 2 + 绝对增量 ≥ p50 的 1% | foldChange ≥ 2 + 演化趋势单调性 | 占 PlayerLoop p50 ≥ 5%（相对占比） |
| 红线触发 | foldChange ≥ 2 + perFrameMs 占 p50 ≥ 5% | foldChange ≥ 2 + perFrameMs ≥ 1.0ms | 占 p50 ≥ 5% + 单次 avg ≥ vsync 50% |
| GPU-bound | 基线→当前 wait slice 增量归因 | 三态 wait slice 重叠演化 | 单次 wait > vsync + Sleep 中 wait ≥ 80% |
| 降频形态 | 基线→当前 reach 变化（涨/跌） | 三态 reach 演化（单调下降） | reach < 65% + 温度 ≥ 75°C 双信号 |
| 多线程健康 | 基线/当前 run/sleep 对照 + 涨幅 | 三态 run/sleep 演化（单调性） | 单态分布 + 线程间对比 |

**关键**：所有阈值都是"相对占比"或"相对周期"，不是绝对 ms/绝对温度。换设备/换场景自适应。
**2 态专属防误判**：foldChange ≥ 2 但绝对增量 < p50 的 1% 不算回归（防"从 0.01 涨到 0.05 涨 5 倍但无意义"的统计噪声）。

### 3.3 叙事结构对照

| 维度 | 2 态多态（基线→当前） | ≥3 态多态（健康→病态） | 单态（当前态型） |
|---|---|---|---|
| §0 结论 | 三大对比结论（基线 vs 当前） | 三大演化结论（base→cur→throttle） | 三大当前态结论（多信号同向验证） |
| §0 ① | "最大涨幅模块: 当前比基线涨 ×N.N" | "从 base 的 XX 演化到 throttle 的 YY" | "当前形态为 YY（XX 信号同向验证）" |
| §0 ② | "新出现瓶颈: 基线无 + 当前触红线" | "cur 比 base 涨 ×N.N" | "占主线程 p50 的 NN%（top 1 业务消耗）" |
| §0 ③ | "退化形态: 基线健康→当前病态" | "bigReach 从 XX 跌到 YY" | "bigReach XX% < 65% + 温度 YY°C 双信号" |
| 红线矩阵 | foldChange 一列（基线→当前） | foldChange 两列（cur vs base + throttle vs cur） | 占 p50% 一列 |
| ROI 排序 | foldChange × 占 p50% + severity | foldChange + severity | 占 p50% + severity |

### 3.4 措辞模板

| 2 态措辞（基线→当前） | ≥3 态措辞（base→cur→throttle） | 单态措辞（当前态） |
|---|---|---|
| "从基线的健康态到当前的病态" | "从 base 的健康态演化到 throttle 的病态" | "当前形态为病态（XX 信号同向验证）" |
| "当前比基线涨 ×4.2" | "cur 比 base 涨 ×4.2" | "占主线程 p50 的 22%（top 1 业务消耗）" |
| "Sleep 增量 27pp 中 99% 来自等 GPU" | "Sleep 增量 27pp 中 99% 来自等 GPU" | "Sleep 38.99% 中 97.7% 是等 GPU（wait slice 重叠法）" |
| "基线在健康档，当前超预算——这是回归" | "bigReach 从 74.9 跌到 59.2" | "bigReach 59.2% < 65% 严重低频 + 温度 76.7°C ≥ 75°C 双信号" |

---

## 四、标杆报告对照表

> 每个数据源的报告脚本开发前，对照该数据源的标杆报告结构。

### 4.1 perfetto 标杆：v5.3

> 文件：`docs/report/performance-report_perfetto_ULTIMATE_v5.3.md`
>
> 形态：多态（base/cur/throttle 三态）

| 标杆章节 | 内容 | Prism 对应 |
|---|---|---|
| §-1 数据采集·能力声明 | 数据列表 + 维度矩阵 + 能/不能回答 | `narrative.capabilityBoundaries` |
| §0 结论先行 | 三大独立结论 + ASCII 图穿插 | `topConclusionBlocks`（四段式） |
| §1 采集质量声明 + 数据口径 | 帧数/fps/p50/温度/binder | `triadComparison` |
| §2 采集元信息表 | 三态对照表 | §1 元信息表 |
| §3 多线程独立分析 | 各线程 run/sleep + 线程间对比 | `multiThreadMacro` |
| §4 主线程 off-CPU 归因 | byState + wait slice 重叠 + ASCII 状态分布 + ASCII 因果链 | `offCpuAttribution` |
| §5 降频时序证据链 | 三态对照 + 形态 ASCII + per-CPU + 判定矩阵 | `freqMatrix` |
| §6 主线程一帧时间去向 | callTree 缩进树 + 红线矩阵 + Top 模块下钻 | `callTreeDrilldown` + `redlineMatrix` + §5.5 下钻 |
| §7（无独立 §7） | GPU-bound 合并进 §3.5 | `gpuBoundMatrix`（渲染在 §3.5） |

### 4.2 simpleperf 标杆：v4

> 文件：`docs/report/performance-report_simpleperf_ULTIMATE_v4.md`
>
> 形态：多态（base/cur 两态 diff，DR-43 扩展覆盖 2 态）

| 标杆章节 | 内容 | Prism 对应（未来 simpleperf-report） |
|---|---|---|
| §0 结论先行 | 三大结论 | `topConclusionBlocks` |
| §1 采集元信息与质量门 | 元信息 + 符号化质量 | 元信息表 |
| §2 库（so）维度对比 | 库占比 + 绝对增量柱状图 | 库维度矩阵 |
| §3 线程维度对比 | 线程占比 + 身份识别 + 同名陷阱 | `multiThreadMacro`（simpleperf 适配） |
| §4 全局性能热点 Top-N | Top-N 总表 + 逐个解读 | 红线矩阵 + 下钻 |
| §5 主线程深度分析 | PlayerLoop 阶段表 + 完整调用树 + 红线扫描 | `callTreeDrilldown` + `redlineMatrix` |
| §6 渲染相关线程 | URP 管线下钻 + RHI + GPU-bound 判定 | 渲染子树归并 + `gpuBoundMatrix` |
| §7 ECS / Worker 线程 | Job 均衡度 + 主线程 Job Wait + Burst Job | 多线程宏观扩展 |
| §8 中间件专章 | Wwise | 按数据浮现（不硬编码） |
| §9 Lua GC 工作线程专章 | GC 线程 | 按数据浮现 |
| §10 反查清单 | 运行时函数 → 业务模块 | `getSourceForSymbol` |

### 4.3 unity-profiler 标杆：v1

> 文件：`docs/report/performance-report_unity_v1.md`
>
> 形态：单态（unity profiler 单源）
>
> **注**：v1 是早期标杆，结构未对齐 DR-41，仅作"单态叙事措辞"参考。

| 标杆章节 | 内容 | Prism 对应（未来 unity-report） |
|---|---|---|
| 一、概览 | overview | `overview` |
| 二、核心结论 | 热点列表 | `topConclusionBlocks`（单态版） |
| 三、热点分析 | 判定依据 + 逐个热点 | `redlineMatrix`（单态：占 p50% 排序） |
| 四、Jank 卡顿分析 | 卡顿模式 + BigJank 逐个 | FrameTimeline 驱动（unity 有 FrameTimeline） |
| 五、Marker 波动分析 | 波动 Marker 列表 | `computeStatsPack` + `computeAutocorr` |
| 六、优化建议 | ROI | `roiOptimizations`（单态：占 p50% + severity） |

---

## 五、报告脚本对照检查清单

> 每个数据源的报告脚本开发前/验收时必对照此清单。

### 5.1 开发前检查

- [ ] 读 DR-41 五条硬规则（`dr-41-report-layer-methodology.md`）
- [ ] 读对应数据源的标杆报告（perfetto→v5.3 / simpleperf→v4 / unity→v1）
- [ ] 读本索引的"态数自适应"章节，确定单态/多态路径
- [ ] 检查 `report-utils.ts` 已有所需工具函数（子树归并/人话化/判定/叙事/渲染）
- [ ] 若需新工具函数，先抽到 `report-utils.ts`（数据源无关），再在报告脚本里调用

### 5.2 验收检查（自动 + 人工）

**自动检查**（`tools.test.ts` [16] 节，DR-41 五条硬规则）：
- [ ] 规则 1 审计剥离：HTML 无 evidence id / tool / runId / 字段名
- [ ] 规则 2 子树归并：mergedChildren 不与其它行 module 重复；至少 1 行有 mergedChildren；无自引用
- [ ] 规则 3 结构层次：§0-§6 h2 顺序正确；无 §7
- [ ] 规则 4 图文穿插：≥3 个结论块；每块四段完整；≥3 个 blockquote；≥3 个 pre.ascii
- [ ] 规则 5 人话先行：HTML 无字段名泄漏；oneLiner 含中文

**人工检查**（对照标杆）：
- [ ] §0 三大结论块是否达到标杆的图文穿插水准
- [ ] 红线矩阵子树归并后的可读性（同一子树不超过 1 行）
- [ ] 下钻详情是否按归并后的 top 模块组织（不按 finding kind）
- [ ] 整体是否还有"一大段文字"或"字段名泄漏"
- [ ] 单态/多态判定阈值是否相对值（占 p50% / 占 vsync% / foldChange），不硬编码绝对 ms/温度

### 5.3 约束（不可违反）

- **不硬编码业务名清单**：不许把"URP/BattleHead/MapSignificance"等业务模块名写死在脚本里
- **不硬编码绝对阈值**：不许把"单次 > 1-2ms 不合理""温度 ≥ 75°C"等绝对值写死（用相对占比/相对周期）
- **不硬编码 §0-§9 死模板**：章节顺序按 DR-41 规则 3，但每节内容由数据驱动
- **数据源无关**：`report-utils.ts` 的工具函数必须 perfetto/simpleperf/unity 都能用

---

## 六、可复用工具速查（report-utils.ts）

> 文件：`web/server/prism/report-utils.ts`（WT-025 需求 2）

| 类别 | 函数 | 用途 |
|---|---|---|
| 子树归并 | `buildNameParentChains(root, frameCount)` | 从 callTree 构建 name→parentChain 映射 |
| 子树归并 | `isAncestorOf(ancestor, child, parentChains)` | 判断祖先关系 |
| 子树归并 | `mergeBySubtree(entries, parentChains, getName)` | top 列表子树归并 |
| 人话化 | `humanizeRelativeJudgment(rb)` | relativeBaseline → 人话 |
| 人话化 | `humanizeCausalInference(inference)` | causalChain.inference → 人话 |
| 人话化 | `humanizeFoldChange(fc)` | foldChange → "新增"/"×N"/"持平" |
| 判定 | `detectStateMode(summaries)` | 检测单态/多态 |
| 判定 | `judgeByFoldChange(fc, threshold)` | 多态判定（foldChange） |
| 判定 | `judgeByP50Ratio(perFrame, p50, threshold)` | 单态判定（占 p50%）*draft* |
| 判定 | `judgeByVsync(avg, vsync, threshold)` | 单态 GPU-bound 判定 *draft* |
| 叙事 | `buildTopConclusionBlock(params)` | 构建四段式块 |
| 叙事 | `buildAsciiBar(value, max, width)` | ASCII 柱状图 |
| 叙事 | `buildSubtreeDrilldown(module, root, topN)` | 子树下钻结构 |
| 渲染 | `renderFourPartBlock(block, sevClass)` | 四段式块 HTML |
| 渲染 | `renderDrilldownCard(card)` | 下钻卡片 HTML |
| 渲染 | `renderCallTreeWithSeverity(root, severityOf, maxDepth)` | 带🔴🟡🟢标注的 callTree |
| 渲染 | `htmlEsc(s)` | HTML 转义 |

**单态判定函数**（`judgeByP50Ratio` / `judgeByVsync`）标注 `// draft, pending DR-42 validation`，待 simpleperf/unity 单源验证后定稿。

---

## 七、自动检查速查（tools.test.ts [16] 节）

> 文件：`web/server/prism/tools.test.ts` 第 [16] 节（WT-025 需求 3）

| 规则 | assert 数 | 检查内容 |
|---|---|---|
| 规则 1 审计剥离 | 9 | HTML 无 evidence id/evidenceIds/证据：/审计 section/runId/ev-001/ev-0/provenance.tool；无"审计"section 标题 |
| 规则 2 子树归并 | 4 | 红线矩阵非空；mergedChildren 不与其它行 module 重复；至少 1 行有 mergedChildren；无自引用 |
| 规则 3 结构层次 | 9 | <h2> 含 §0-§6 全部 7 个；无 §7；§0→§1→...→§6 顺序正确 |
| 规则 4 图文穿插 | 4 | §0 ≥3 个独立结论块；每块四段完整；≥3 个 blockquote；≥3 个 pre.ascii |
| 规则 5 人话先行 | 2 | HTML 无字段名泄漏（11 个字段名黑名单）；oneLiner 含中文 |

**设计要点**：检查不硬编码业务名（用结构不变量）；数据源无关（perfetto/simpleperf/unity 报告都能复用）；防返工（每次报告脚本改动后自动核五条硬规则）。

---

## 八、待办（DR-42/DR-43 定稿路径）

- [ ] WT-024 报告质量二期（三态对照+下钻深度+callTree 可读性）→ 验证 DR-43 多态方法论
- [ ] simpleperf 单源报告 → 验证 DR-42 单态方法论
- [ ] unity-profiler 单源报告 → 验证 DR-42 单态方法论
- [ ] 验证通过后：DR-42 / DR-43 从 draft 定稿，更新本索引
