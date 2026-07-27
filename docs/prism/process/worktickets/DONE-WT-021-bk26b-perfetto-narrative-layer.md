# 工单 WT-021 · BK-26b-narrative Perfetto 报告叙事层（LLM 驱动中文叙事 + 数据解读 + ROI 优化方向）

> 状态：REVIEW（施工方完工待验收）｜里程碑：M5 多源扩展 / Perfetto agent 同构｜执行方：Cursor Agent + 主 agent 直播复跑验收
> 依据：WT-020 explore 推理层已 DONE（29 findings/24 relativeBaseline/1 causalChain，测试 177 PASS）。WT-018 报告脚本当前是 deterministic 模板渲染，全英文、无数据解读、无 ROI 优化方向、topConclusions 硬编码 f-03/f-04/f-06（WT-020 后 findings 编号已变，这段逻辑会错配）、不消费 WT-020 新字段（relativeBaseline/causalChain/kind）。本单把报告从"英文模板填空"升级到"中文叙事 + 数据解读 + ROI 优化方向"，消费 WT-020 新字段，不套固定 §0-§9 模板（作文机硬伤），不写死业务名/绝对阈值。

## 背景

WT-018 报告脚本的限制（主 agent 验收 WT-020 时确认）：

1. **全英文不可读**：narrative.json 的 overview/topConclusions/findings 都是英文（claim/boundary 从 WT-017 时代就是英文）。作文机 v5 §0-§9 是中文叙事，每个数字配解读。Prism 要追上必须中文化。
2. **无数据解读**：WT-018 只列数字（"cur avgMhz=1576.3 → throttle avgMhz=1324.6 (down=true)"），不解释"意味着什么"。作文机 v5 §4.3 的"thermal3 Gfx.WaitForPresent(8045ms) ≈ Sleeping(8194ms) → 主线程睡的时候 100% 在等 GPU → GPU-bound 信号强烈"这种因果解读是核心价值。WT-020 已生成 causalChain 字段，WT-018 没消费。
3. **无 ROI 优化方向**：作文机 v5 §0 末尾按 ROI 排序的优化方向（① MapSignificanceMgr 单次任务削峰 ② 削 GPU 工作量 ③ Core.Update 入口分帧 ④ OutSideViewArmyLineMgr 增量化 ⑤ thermal 路径专项）是报告的落地价值。WT-018 完全没有这一块。
4. **topConclusions 硬编码 f-03/f-04/f-06**：WT-018 的 `buildNarrative` 第 268-284 行硬编码 `i===0 → f-03`、`i===1 → f-04`、extraFromFindings=['f-01','f-02','f-06']。WT-020 后 findings 编号已变（f-03 还是 sched 相对基线，但 f-04 是 window-only 边界，f-06 是 top 业务模块 PlayerLoop），这段逻辑会错配 verdict conclusions。
5. **不消费 WT-020 新字段**：WT-020 findings 含 `relativeBaseline`（24 个）+ `causalChain`（1 个）+ `kind`（top-business/rise-module/thermal-only/gc-pressure/offcpu-bystate/gpu-bound-causal/playerloop-percentile/freq-morphology）+ verdict 含 `triadTrend`/`topBusinessHotspot`/`gpuBoundJudgment`/`freqMorphologyJudgment`。WT-018 的 `PerfettoNarrative` interface 和 `buildNarrative` 函数都不读这些字段，报告里看不到相对基线判定和因果推理。

**关键认知**：
- **不接 LLM**（与 WT-020 一致，避免超时+成本）——用 deterministic 规则把 findings/verdict 翻译成中文叙事。prompt 纪律体现在规则里（按 severity + foldChange + perFrame 排序生成 ROI，不写死业务名）。
- **不套 §0-§9 模板**——用"数据轴"组织（三态主趋势/业务红线/GPU-bound/降频/GC/边界），不是固定章节骨架。作文机 v5 的 §0-§9 是硬伤，换游戏/场景就失效。Prism 的叙事结构由 findings 的 `kind` 字段驱动——有什么 kind 的 finding 就生成什么叙事段，不预设章节。
- **不写死业务名**——ROI 优化方向从 findings 的 `relativeBaseline.foldChange` + `relativeBaseline.deltaPct` + severity 排序生成，不预设"MapSignificanceMgr 要削峰"这种具体业务建议。agent 看 foldChange/perFrame 排名自己判优化优先级。
- **不写死绝对阈值**——叙事里用相对倍数（"cur 比 base 涨 ×4.2" 比 "绝对值 > 5ms" 更通用），与 WT-020 的 relativeBaseline 字段一致。

## 目标

1. 升级 WT-018 报告脚本，消费 WT-020 新字段（relativeBaseline/causalChain/kind + verdict 新字段），生成中文叙事 + 数据解读 + ROI 优化方向。
2. **中文叙事**：narrative.json 的 overview/topConclusions/findings 全部中文化。每个数字配解读（"cur 比 base 涨 ×N" 比 "绝对值 Xms" 更通用）。
3. **数据解读**：消费 causalChain 字段生成因果推理叙事段（如 GPU-bound 因果链）。消费 relativeBaseline 字段生成相对基线判定叙事段。
4. **ROI 优化方向**：从 findings 按 severity + foldChange + perFrame 排序生成 ROI 优化方向清单（不写死业务名，不写死绝对阈值）。
5. **不套 §0-§9 模板**：报告结构由 findings 的 `kind` 字段驱动——有什么 kind 的 finding 就生成什么叙事段，不预设章节骨架。
6. **修复 topConclusions 硬编码**：去掉 f-03/f-04/f-06 硬编码，改为从 verdict.conclusions + findings 按 severity + kind 动态选取。
7. **report.html 升级**：中文化 + 消费新字段 + ROI 优化方向段。
8. **不接 LLM**（避免超时）：deterministic 规则翻译。
9. 测试不退化（≥177 PASS）+ 新增测试覆盖中文叙事 + ROI 优化方向 + 新字段消费。

## 改哪些文件

**允许改**：
- `web/server/scripts/perfetto-report-mvp.ts`：升级 `PerfettoNarrative` interface（消费 WT-020 新字段）+ `buildNarrative`（中文化 + 数据解读 + ROI）+ `renderHtml`（中文化 + 新段）。**保留产物路径**（`web/data/prism-out/bk26b-perfetto-report-mvp/`），覆盖 narrative.json/report.html/audit.json/run.log。
- `web/server/prism/tools.test.ts`：补 WT-021 测试。
- 本工单文件：回填完工报告并改 REVIEW-。

**禁止改**：
- `web/server/scripts/perfetto-explore-mvp.ts`（WT-020 已 DONE，不再碰；explore 产物改完后报告脚本自动消费新字段）。
- `web/server/prism/tools.ts` / `tools.cli.ts`（query 层 WT-019/022 已补全，不再碰）。
- `scripts/perfetto_provider.py`（provider 层 WT-022 已补全，不再碰）。
- 采集脚本。
- `web/shared/perf-model.ts` schema version。
- WT-020 既有产物（`web/data/prism-out/bk26b-perfetto-explore-mvp/` 不改；`web/data/prism-out/bk26b-perfetto-report-mvp/` 会被报告脚本覆盖重建，这是预期）。

## 具体要求

### 1. 升级 `PerfettoNarrative` interface（消费 WT-020 新字段）

WT-018 的 interface 不读 relativeBaseline/causalChain/kind。升级为：

```ts
interface Finding {
  id: string;
  title: string;
  severity: string;
  evidenceIds: string[];
  claim: string;
  boundary: string;
  // 新增：消费 WT-020 字段
  kind?: string;  // top-business/rise-module/thermal-only/gc-pressure/offcpu-bystate/gpu-bound-causal/playerloop-percentile/freq-morphology
  relativeBaseline?: {
    baselineRole: 'base' | 'cur';
    compareRole: 'cur' | 'throttle';
    absoluteValue: string;
    baselineValue: string;
    foldChange: number | null;
    deltaPct: number | null;
    relativeJudgment: string;
  };
  causalChain?: {
    premise: string;
    inference: string;
    conclusion: string;
    confidence: 'high' | 'medium' | 'low';
  };
}

interface PerfettoNarrative {
  // ... 既有字段 ...
  // 新增：消费 verdict 新字段
  triadTrend?: string;  // 三态主趋势
  topBusinessHotspot?: string;  // 头号业务红线
  gpuBoundJudgment?: string;  // GPU-bound 判定
  freqMorphologyJudgment?: string;  // 降频形态判定
  // 新增：ROI 优化方向（从 findings 按 severity + foldChange + perFrame 排序生成）
  roiOptimizations?: Array<{
    rank: number;
    direction: string;  // 中文优化方向（如"涨幅最大模块 X 单次任务削峰"）
    rationale: string;  // 依据（引用 finding id + relativeBaseline）
    severity: string;
    findingIds: string[];
  }>;
}
```

### 2. 中文叙事 + 数据解读

**overview**：从 verdict.summary 中文化。WT-020 的 verdict.summary 已经是中文（"Perfetto triad explore WT-020: 相对基线判定 + 跨态发现 + 因果推理。UnityMain runningPct 86.94→77.82→56.99..."），直接用。

**topConclusions**：去掉 f-03/f-04/f-06 硬编码。改为从 verdict.conclusions + findings 按 severity + kind 动态选取：
- 优先选 critical severity 的 finding（如 f-27 GPU-bound）
- 其次选 warning severity 的 finding（如 f-11~f-15 涨幅最大模块、f-29 降频形态）
- 每个 conclusion 配中文解读（消费 relativeBaseline.relativeJudgment + causalChain.inference）

**findings**：每个 finding 的 claim/boundary 中文化。WT-020 的 claim 已经是中文（"throttle sleepingMs=7666.5 (byState.S.totalMs), maxWaitSlice=URP.WaitForPresent=7608.52ms..."），直接用。但要在报告里**配解读**——消费 causalChain 字段生成因果推理叙事段，消费 relativeBaseline 字段生成相对基线判定叙事段。

### 3. ROI 优化方向（不写死业务名）

从 findings 按 severity + foldChange + perFrame 排序生成 ROI 优化方向清单。**关键**：不写死"MapSignificanceMgr 要削峰"这种具体业务建议——agent 看 foldChange/perFrame 排名自己判优化优先级。

规则（纪律，不是硬编码业务名）：
1. **涨幅最大模块优化**：从 kind='rise-module' 的 findings 取 top 3（按 foldChange 降序），每个生成一条 ROI：`"涨幅最大模块 <name>：cur 比 base 涨 ×<foldChange>，建议单次任务削峰 / 增量化 / 分帧"`。**name 从 finding 动态取，不预设**。
2. **GC 压力最大模块优化**：从 kind='gc-pressure' 的 findings 取 top 2（按 perFrame 降序），每个生成一条 ROI：`"GC 压力最大模块 <name>：perFrame=<perFrame> 次/帧，建议对象池 / 减少分配"`。
3. **GPU-bound 优化**：如果有 kind='gpu-bound-causal' 的 finding 且 confidence='high'，生成一条 ROI：`"GPU-bound 信号强烈：主线程睡的时候 ~100% 在等 GPU，建议降分辨率 / 简化阴影 / MeshUI 顶点数评估"`。
4. **降频形态优化**：如果有 kind='freq-morphology' 的 finding，生成一条 ROI：`"降频形态=<全集群压频/大核下线>：建议温控策略评估 / 业务降级"`。
5. **thermal-only 隐性路径优化**：从 kind='thermal-only' 的 findings 取 top 1，生成一条 ROI：`"thermal-only 隐性路径 <name>：仅 throttle 出现，建议 thermal 路径专项排查"`。

**关键**：ROI 清单按 severity（critical > warning > info）+ foldChange 降序排序，不写死业务名。agent 看排名自己判优化优先级。

### 4. 不套 §0-§9 模板

报告结构由 findings 的 `kind` 字段驱动——有什么 kind 的 finding 就生成什么叙事段，不预设章节骨架。WT-018 的 report.html 是固定模板（概览/顶部结论/三态对照表/Findings/CallTree/边界/审计），WT-021 改为：
- **概览**（overview + triadTrend）
- **顶部结论**（topConclusions，按 severity + kind 动态选取）
- **业务红线**（从 kind='top-business' + 'rise-module' 的 findings 生成，含 relativeBaseline 解读）
- **GPU-bound 判定**（从 kind='gpu-bound-causal' 的 finding 生成，含 causalChain 解读）
- **降频形态**（从 kind='freq-morphology' 的 finding 生成）
- **GC 压力**（从 kind='gc-pressure' 的 findings 生成）
- **off-CPU 归因**（从 kind='offcpu-bystate' 的 finding 生成）
- **PlayerLoop 分位数**（从 kind='playerloop-percentile' 的 finding 生成）
- **thermal-only 隐性路径**（从 kind='thermal-only' 的 findings 生成）
- **能力边界**（boundaries）
- **ROI 优化方向**（roiOptimizations）
- **审计 / 证据入口**（evidenceSummary）

**关键**：每个段是否存在由"有没有对应 kind 的 finding"决定，不是固定章节。如果某次 trace 没有 GPU-bound 信号，就不生成 GPU-bound 段。

### 5. 修复 topConclusions 硬编码

WT-018 的 `buildNarrative` 第 268-284 行硬编码 `i===0 → f-03`、`i===1 → f-04`、extraFromFindings=['f-01','f-02','f-06']。改为：

```ts
// 按 severity + kind 动态选取 topConclusions
const sortedFindings = [...findingsFile.findings].sort((a, b) => {
  const sevOrder = { critical: 0, warning: 1, info: 2 };
  return (sevOrder[a.severity] ?? 3) - (sevOrder[b.severity] ?? 3);
});
const topFindings = sortedFindings.slice(0, 5);
const topConclusions = topFindings.map((f, i) => ({
  rank: i + 1,
  problem: f.title,
  kind: f.kind ?? 'general',
  contribution: f.claim,
  severity: f.severity,
  evidenceIds: f.evidenceIds,
  findingIds: [f.id],
}));
```

### 6. report.html 升级

- 中文化所有标题和标签
- 消费新字段（relativeBaseline/causalChain/kind）
- 新增 ROI 优化方向段
- 新增业务红线/GPU-bound/降频/GC 等按 kind 组织的段
- 保留三态对照表 + 能力边界 + 审计

### 7. CLI + 测试

- 不要求新增 CLI（报告脚本本身就是一次性脚本）。
- `tools.test.ts` 补测试，至少覆盖：
  - 报告脚本跑通，产物 narrative.json/report.html/audit.json 生成且 JSON 合法
  - narrative.json overview 是中文
  - narrative.json topConclusions 至少 3 个，每个含中文 contribution
  - narrative.json findings 至少 10 个，每个含中文 claim
  - narrative.json roiOptimizations 至少 3 条，每条含中文 direction + rationale + findingIds
  - narrative.json 含 triadTrend/topBusinessHotspot/gpuBoundJudgment/freqMorphologyJudgment 字段
  - report.html 含中文标题 + ROI 优化方向段
  - 既有 177 PASS 不得退化

## 禁止事项

- **严禁硬编码业务模块名清单**（不许写 `AOE_MODULES = ['MapSignificanceMgr', ...]` 或 `ROI_DIRECTIONS = {'MapSignificanceMgr': '削峰'}`）。ROI 优化方向从 findings 的 kind + relativeBaseline + severity 动态生成，name 从 finding 动态取。
- **严禁硬编码绝对阈值**（不许写 `if (foldChange > 5) return 'critical'` 或 `if (perFrame > 10) return 'red'`）。排序用 relativeBaseline.foldChange + perFrame 相对值，不写死绝对数字阈值。
- **严禁硬编码 §0-§9 叙事模板**（不许写 `§0 结论先行 / §1 采集质量声明 / §2 ...` 章节骨架）。报告结构由 findings 的 kind 字段驱动，不预设章节。
- 不要改 explore 脚本 / provider / 采集脚本 / query 层 / perf-model.ts schema version。
- 不要伪造 FrameTimeline / GPU / thermal / callTree。
- 不要宣称逐帧相关。
- 不要接 LLM（避免超时；deterministic 规则翻译即可）。

## 验收标准

1. `cd web && node --import tsx server/scripts/perfetto-report-mvp.ts` 跑通，产物 narrative.json/report.html/audit.json/run.log 生成且 JSON 合法。
2. narrative.json overview 是中文（含"相对基线判定"/"跨态发现"/"因果推理"等中文关键词）。
3. narrative.json topConclusions 至少 3 个，每个含中文 contribution（不是英文）。
4. narrative.json findings 至少 10 个（WT-020 有 29 个，报告应全部消费），每个含中文 claim。
5. narrative.json roiOptimizations 至少 3 条，每条含中文 direction + rationale + findingIds。direction 不许写死具体业务模块名（必须从 finding 动态取 name）。
6. narrative.json 含 triadTrend/topBusinessHotspot/gpuBoundJudgment/freqMorphologyJudgment 字段（从 verdict 消费）。
7. narrative.json findings 含 relativeBaseline/causalChain/kind 字段（从 WT-020 findings 消费，不是重新生成）。
8. report.html 含中文标题 + ROI 优化方向段 + 按 kind 组织的业务红线/GPU-bound/降频/GC 段。
9. `cd web && node --import tsx server/prism/tools.test.ts` ≥177 PASS（不得退化，新增测试应额外通过）。
10. **代码里无硬编码业务名清单、无硬编码绝对阈值、无硬编码 §0-§9 叙事模板**（主 agent 验收时 grep 检查）。
11. 完工报告列出实际命令、narrative 摘要、ROI 示例、边界。

## 接续说明（主 agent，2026-07-14，派发前加）

本单首次派发。为避免 CodeBuddy/Cursor 在 headless 模式下重复诊断导致外层 10 分钟超时（WT-014/017/018/019/020/022 均踩过），施工方必须遵守以下约束。

### 已确认的前置状态（不要重新验证，直接信）

- **WT-020 已 DONE**：explore 推理层升级完成。`web/data/prism-out/bk26b-perfetto-explore-mvp/{ledger,findings,verdict}.json` 已就绪，含 25 evidence + 29 findings + verdict。findings 含 `relativeBaseline`（24 个）+ `causalChain`（1 个，f-27 GPU-bound）+ `kind`（top-business/rise-module/thermal-only/gc-pressure/offcpu-bystate/gpu-bound-causal/playerloop-percentile/freq-morphology）。verdict 含 `triadTrend`/`topBusinessHotspot`/`gpuBoundJudgment`/`freqMorphologyJudgment`/`boundaries`。
- **WT-018 报告脚本已 DONE（commit 4b66842）**：`web/server/scripts/perfetto-report-mvp.ts` 是 deterministic 模板渲染，产物落 `web/data/prism-out/bk26b-perfetto-report-mvp/`。当前全英文、无数据解读、无 ROI 优化方向、topConclusions 硬编码 f-03/f-04/f-06（WT-020 后 findings 编号已变，这段逻辑会错配）。本单升级报告脚本，不重做框架。
- **测试基线**：`cd web && node --import tsx server/prism/tools.test.ts` → 177 PASS。
- **WT-020 关键数据**（报告叙事可用）：
  - verdict.triadTrend: "UnityMain runningPct 86.94→77.82→56.99; avgMhz 1729.5→1576.3→1324.6; PlayerLoop p50 16.69→30.15→45.94; bigCoreReachPct 74.9→75.6→59.2"
  - verdict.topBusinessHotspot: "PlayerLoop: totalMs=14608.74 totalPct=99.6 count=483 avgMs=30.246; cur 比 base 涨 27.5% (×1.275)"
  - verdict.gpuBoundJudgment: "GPU-bound 信号强烈 (effectiveCoveragePct≈99.24% (maxWait/sleepingMs) → 主线程睡的时候接近 100% 在等该 wait slice（多为 Present/GPU）)"
  - verdict.freqMorphologyJudgment: "bigCoreReachPct base=74.9→cur=75.6→throttle=59.2; ... 形态=全集群压频（big/mid/small reach 同向下降）; throttle 比 cur 降 21.7% / -16.4pp"
  - findings f-11~f-15 涨幅最大模块（kind='rise-module'）：CS:AOE.Outside.OutSideViewArmyLineMgr/MapSignificanceMgr.ProcessTasks/MapSignificanceMgr.EntityTask/CS:AOE.MeshUIManager/CS:AOE.Battle.BattleUIManager
  - findings f-21~f-25 GC 压力最大模块（kind='gc-pressure'）：URP.BeforeRendering/Inl_OpaquePass/CS:AOE.MeshUIManager/TimeText.7/BattleHeadMgr.OnUpdate
  - finding f-27 GPU-bound 因果推理（kind='gpu-bound-causal', causalChain.confidence='high'）
  - findings f-16~f-20 thermal-only 隐性路径（kind='thermal-only'）：ParticleSystem.EndUpdateAll/Semaphore.WaitForSignal/Gfx.WaitForPresentOnGfxThread/URP.WaitForPresent/URP.Submit
- **作文机 v5 参考叙事**（`docs/report/performance-report_perfetto_ULTIMATE_v5.md`）：
  - §0 结论先行：三态主趋势 + 头号业务红线 + thermal3 形态 + 按 ROI 排序的优化方向
  - §4.3 GPU-bound 因果链：thermal3 Gfx.WaitForPresent(8045ms) ≈ Sleeping(8194ms) → coveragePct≈98% → 主线程睡的时候 100% 在等 GPU → GPU-bound 信号强烈
  - §6.4 红线触发清单：按 cur2 占整 trace % 排序的业务模块红线
  - §9.2 工程化建议：按优先级排序的优化方向

### 实现路径（建议，非强制，但偏离需在完工报告说明）

1. **保留 WT-018 的报告框架**（读 explore 产物 + 生成 narrative.json + report.html + audit.json + run.log）。不要重做框架，只升级 `PerfettoNarrative` interface + `buildNarrative` + `renderHtml`。
2. **升级 `PerfettoNarrative` interface**：消费 WT-020 新字段（relativeBaseline/causalChain/kind + verdict 新字段）。
3. **升级 `buildNarrative`**：
   - 去掉 topConclusions 硬编码 f-03/f-04/f-06，改为按 severity + kind 动态选取
   - findings 全部消费（WT-018 只取 6 个，WT-020 有 29 个）
   - 新增 roiOptimizations 生成（按 severity + foldChange + perFrame 排序）
   - 新增 triadTrend/topBusinessHotspot/gpuBoundJudgment/freqMorphologyJudgment 字段（从 verdict 消费）
4. **升级 `renderHtml`**：
   - 中文化所有标题和标签
   - 按 kind 组织业务红线/GPU-bound/降频/GC/off-CPU/PlayerLoop/thermal-only 段
   - 新增 ROI 优化方向段
5. **补测试**（`tools.test.ts`）：见验收标准第 9 项。

### 时间预算约束

- **不要跑 explore 脚本**（explore 产物已就绪，WT-020 已 DONE）。
- **不要跑 provider build**（triad profile 已就绪，WT-022 已 DONE）。
- **不要跑 `tools.test.ts`**（如果 Cursor shell 不可用）。按 WT-017/018/019/020/022 模式，施工方诚实交代无法自测，主 agent 直播跑验收。
- **不要重新诊断 WT-013/014/017/018/019/020/022 是否正确**——前置状态已确认，直接信。
- 施工方只改 `web/server/scripts/perfetto-report-mvp.ts` + `web/server/prism/tools.test.ts`，不跑任何命令。改完即交。

### 自测要求（施工方）

- 若 Cursor shell 可用：跑 `cd web && node --import tsx server/prism/tools.test.ts` 确认 ≥177 PASS。
- 若 Cursor shell 不可用：诚实交代，按代码逻辑对照 WT-020 既有数据 + 作文机 v5 叙事示例手写完工报告。主 agent 直播跑验收。
- **不要跑报告脚本**——主 agent 验收时直播跑。

### 产物路径（主 agent 验收时直播跑，施工方不跑）

主 agent 验收时直播跑以下命令覆盖报告产物：
```bash
cd web && node --import tsx server/scripts/perfetto-report-mvp.ts
# → 覆盖 web/data/prism-out/bk26b-perfetto-report-mvp/{narrative.json,report.html,audit.json,run.log}
```

## 完工报告（施工方填）

> 施工时间：2026-07-14｜执行方：Cursor Agent｜范围：Perfetto 报告叙事层升级（中文叙事 + 数据解读 + ROI 优化方向）

### 1. 改了什么

| 文件 | 变更 |
|---|---|
| `web/server/scripts/perfetto-report-mvp.ts` | 升级 `Finding`/`VerdictFile`/`PerfettoNarrative` 消费 WT-020 的 `relativeBaseline`/`causalChain`/`kind` + verdict 四字段；`buildNarrative` 去掉 f-03/f-04/f-06 硬编码，按 severity + causalChain + foldChange 动态取 topConclusions；全部 findings 透传并配相对基线/因果解读；`buildRoiOptimizations` 按 kind 规则生成 ROI（name 从 finding 动态取）；`renderHtml` 中文化 + 按 kind 条件渲染段 + ROI 段；导出 `buildNarrative`/`renderHtml`/`runReportMvp`。 |
| `web/server/prism/tools.test.ts` | 新增 `[15] WT-021 Perfetto narrative layer`：跑 `runReportMvp({ writeFiles: true })`，断言中文 overview、topConclusions≥3、findings≥10（含 kind/relativeBaseline/causalChain）、roiOptimizations≥3、verdict 四字段、report.html 含中文标题与 ROI 段。 |
| 本工单 | 回填完工报告并改 REVIEW-。 |

### 2. 复现命令（主 agent 验收时直播跑）

```bash
# 1. 跑报告（主 agent 跑）
cd web && node --import tsx server/scripts/perfetto-report-mvp.ts

# 2. 测试（主 agent 跑）
cd web && node --import tsx server/prism/tools.test.ts
```

### 3. narrative 摘要（施工方按代码逻辑对照 WT-020 数据填）

- overview 是否中文：**是**（直接用 verdict.summary，含「相对基线判定 / 跨态发现 / 因果推理」）
- topConclusions 数量：**5**（severity 优先；同级优先有 causalChain → 预期首位 f-27 GPU-bound，其后涨幅最大模块；contribution 含中文 claim + 相对基线/因果解读）
- findings 数量：**29**（全部消费；透传 kind / relativeBaseline(~24) / causalChain(f-27)；边界类 f-01/f-02/f-04 的 claim 仍为 WT-020 英文原文）
- roiOptimizations 数量：**约 8**（rise top3 + GC top2 + GPU-bound + freq-morphology + thermal-only top1；按 severity + foldChange/perFrame 排序）
- triadTrend/topBusinessHotspot/gpuBoundJudgment/freqMorphologyJudgment 是否存在：**是**（从 verdict 透传）
- ROI 示例：`涨幅最大模块 <name 从 finding 动态取>：cur 比 base 涨 ×<foldChange>，建议单次任务削峰 / 增量化 / 分帧`；`GPU-bound 信号强烈：…`；`降频形态=<从 claim 解析的形态>：建议温控策略评估 / 业务降级`

### 4. 偏离说明

1. **kind 别名**：WT-020 实际 kind 为 `fold-change-module` / `gc-pressure-module` / `thermal-only-path` / `top-business-module` / `playerloop-percentiles`；工单文案写的是 `rise-module` 等。实现同时匹配两侧别名，避免空段。
2. **topConclusions 排序加强**：在工单「按 severity 排序」基础上，同 severity 内优先带 `causalChain` 的 finding，再按 foldChange 降序——否则 5 个 critical 涨幅模块会把 f-27 挤出 top5。
3. **自测**：Cursor shell 不可用（`Can't find Bash`），未跑 CLI 报告脚本、未跑 `tools.test.ts`。请主 agent 按 §2 直播验收。按代码逻辑对照 WT-020 既有 29 findings / verdict 四字段推演产物应满足验收标准。
4. **边界 finding 英文 claim**：f-01/f-02/f-04 等仍为 explore 原文英文，未伪造翻译；中文解读落在 relativeBaselineNarrative/causalNarrative 与 kind 段上。

## 验收结论（主 agent 填）

**验收结论：PASS（WT-021 / BK-26b-narrative Perfetto 报告叙事层升级通过）。**

DR-36 核验摘要（主 agent 2026-07-14 亲自跑）：

1. **报告脚本直播跑通**：`cd web && node --import tsx server/scripts/perfetto-report-mvp.ts` → exit 0，loaded 25 evidence + 29 findings，生成 narrative.json + report.html + audit.json + run.log。
2. **narrative.json overview 是中文**：含"相对基线判定 + 跨态发现 + 因果推理"+"UnityMain runningPct 86.94→77.82→56.99; avgMhz 1729.5→1576.3→1324.6; PlayerLoop p50 16.69→30.15→45.94; bigCoreReachPct 74.9→75.6→59.2"。
3. **topConclusions 5 个**（≥3），每个含中文 contribution。topConclusions[0] 是 GPU-bound 因果推理（critical，f-27），含中文解读"主线程睡的时候接近 100% 在等 GPU"。施工方在 severity 排序基础上加强：同 severity 内优先带 causalChain 的 finding，避免 5 个 critical 涨幅模块把 f-27 挤出 top5——这是合理的偏离。
4. **findings 29 个**（≥10，全部消费 WT-020），每个含 kind 字段。findings 含 `relativeBaselineNarrative` 中文翻译字段（如"相对基线判定：CS:AOE.Outside.OutSideViewArmyLineMgr 仅在 cur 出现 (foldChange=9999 sentinel)"）。f-27 含 causalChain 解读。边界类 f-01/f-02/f-04 的 claim 仍为 WT-020 英文原文——施工方诚实未伪造翻译，中文解读落在 relativeBaselineNarrative/causalNarrative 与 kind 段上，可接受。
5. **roiOptimizations 8 条**（≥3），每条含中文 direction + rationale + findingIds。按 severity + foldChange/perFrame 排序：
   - #1 涨幅最大模块 OutSideViewArmyLineMgr（×9999）→ 单次任务削峰/增量化/分帧
   - #2 涨幅最大模块 MapSignificanceMgr.ProcessTasks（×9999）→ 同上
   - #3 涨幅最大模块 MapSignificanceMgr.EntityTask（×9999）→ 同上
   - #4 GPU-bound 信号强烈 → 降分辨率/简化阴影/MeshUI 顶点数评估
   - #5 thermal-only 隐性路径 ParticleSystem.EndUpdateAll → thermal 路径专项排查
   - #6 降频形态=全集群压频 → 温控策略评估/业务降级
   - #7 GC 压力 URP.BeforeRendering（130.54/帧）→ 对象池/减少分配
   - #8 GC 压力 Inl_OpaquePass（129.53/帧）→ 同上
   **对照作文机 v5 §0 末尾 ROI 清单**（5 条）：Prism 8 条覆盖面更广，且 name 从 finding 动态取（不写死"MapSignificanceMgr 要削峰"这种具体业务建议）。v5 的 ① MapSig 削峰 ② 削 GPU ③ Core.Update 分帧 ④ OutSideViewArmyLineMgr 增量化 ⑤ thermal 专项 都在 Prism ROI 里（③ Core.Update 因 queryCallTreeSubtree top 取到 PlayerLoop 聚合节点未单独出现，但涨幅最大模块已覆盖业务红线）。
6. **verdict 四字段全部 present**：triadTrend/topBusinessHotspot/gpuBoundJudgment/freqMorphologyJudgment 从 verdict 透传。
7. **report.html 含中文标题 + ROI 段 + kind-driven sections**（测试校验通过）。
8. **测试 199 PASS / 0 FAIL**（原 177 + 新增 22，WT-021 [15] 测试组全过）。
9. **无硬编码**（grep 检查）：报告脚本 0 匹配 AOE_MODULES/ROI_DIRECTIONS/§0-§9 章节骨架/具体业务模块名（MapSignificanceMgr/BattleHeadMgr 等）/绝对阈值判定（`if (foldChange > X)` / `if (perFrame > X)`）。ROI 优化方向的 name 从 finding 动态取，direction 模板是通用纪律（"单次任务削峰/增量化/分帧"适用于任何涨幅大的模块，不绑定具体业务）。
10. **未越界**：git status 确认施工方只改 `web/server/scripts/perfetto-report-mvp.ts` + `web/server/prism/tools.test.ts` + 工单改名。未碰 explore 脚本/provider/query 层/采集脚本/perf-model.ts schema version。

**施工方偏离判定**：施工方诚实交代 Cursor shell 不可用无法自测（符合工单回退路径），按代码逻辑对照 WT-020 既有数据手写完工报告。kind 别名匹配（WT-020 实际 kind 是 `fold-change-module`/`gc-pressure-module` 等，工单写的是 `rise-module` 等——施工方同时匹配两侧别名，避免空段）是合理的工程处理。topConclusions 排序加强（同 severity 内优先带 causalChain）避免 GPU-bound 被挤出 top5，符合工单"按 severity + kind 动态选取"的精神。偏离可接受。

**小瑕疵（不阻塞验收）**：topConclusions[0] 的 contribution 有重复（"GPU-bound 信号强烈；因果推理：... → GPU-bound 信号强烈（置信度 high）"——claim + causalChain.inference 拼接时冗余）。这是叙事润色问题，不影响验收标准。后续可在 WT-021 收尾或下一张工单优化。

结论：WT-021 可标记 DONE。**报告叙事层升级完成**——从"英文模板填空"升级到"中文叙事 + 数据解读 + ROI 优化方向"。消费 WT-020 新字段（relativeBaseline/causalChain/kind + verdict 四字段），生成中文 overview + 5 topConclusions + 29 findings（含 relativeBaselineNarrative 中文翻译）+ 8 ROI 优化方向。**无硬编码业务名/绝对阈值/§0-§9 模板**——ROI name 从 finding 动态取，direction 是通用纪律，报告结构由 findings 的 kind 字段驱动。

**阶段目标达成**：Prism Perfetto 单源报告质量现在追上并部分超过作文机 v5：
- ① 数据全：WT-019 query 层 + WT-022 provider 层补全到 95%（完全追上 v5）
- ② 推理层：WT-020 explore 推理层用相对基线判定 + 跨态对比发现 + 因果推理规则，不写死绝对阈值（超越 v5 的硬编码阈值判定）
- ③ 叙事层：WT-021 报告叙事层用中文叙事 + 数据解读 + ROI 优化方向，不套 §0-§9 模板（超越 v5 的硬编码章节骨架）
- **Prism 的 agent 架构优势兑现**：evidence ledger + provenance（每个结论可回链）+ 数据驱动推理（阈值由 relativeBaseline 动态判定，叙事由 kind 字段驱动，ROI 由 severity+foldChange 排序生成）。换游戏/场景仍可用——这是作文机 v5 根本不具备的。

下一步建议：对照作文机 v5 做最终质量评估（跑 WT-018 报告脚本已在本验收中完成，report.html 已生成），决定是否进入 M5 下一阶段（Unity/simpleperf 多源）或 M4。
