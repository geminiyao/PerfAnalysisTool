# 工单 WT-020 · BK-26b-explore-reasoning Perfetto explore 推理层（相对基线判定 + 跨态对比发现 + 因果推理规则）

> 状态：TODO（首次派发）｜里程碑：M5 多源扩展 / Perfetto agent 同构｜执行方：Cursor Agent + 主 agent 直播复跑验收
> 依据：WT-022 已补全 provider 层数据缺口（PlayerLoop 分位数 + GC.Alloc 业务子树归因 + offCpuAttribution byState），WT-019 已补全 query 层覆盖度到 95%。但 WT-017 explore MVP 是 deterministic scripted loop + 硬编码 target slices（`['PlayerLoop', 'BehaviourUpdate', 'FinishFrameRendering']`）+ 硬编码 finding 规则（"throttle CPU freq decline co-directional with UnityMain running/sleeping"）。本单把 explore 从"被告诉盯谁"升级到"agent 推理发现"，阈值由 agent 根据基线动态判定（"cur 比 base 涨 ×4.2" 比 "绝对值 > 5ms" 更通用），不写死绝对阈值、不写死业务名。

## 背景

WT-017 explore MVP 的限制（用户明确指出）：

1. **硬编码 target slices**：`summarizeAtrace` 写死 `['PlayerLoop', 'BehaviourUpdate', 'FinishFrameRendering']` 三个 target，只看这三个 slice。但 WT-019 的 `queryCallTreeSubtree` 已能按 totalMs 通用排序自动暴露 top 业务模块（cur 读出 58 节点含 MapSignificanceMgr/BattleHeadMgr/Core.Update 等）——explore 没用上。
2. **硬编码 finding 规则**：`deriveFindings` 写死"throttle CPU freq decline + UnityMain running/sleeping 同向"这种特定模式。但 WT-019 的 `querySliceDeltas` 已能按 foldChange 排序自动发现"涨幅最大的模块"——explore 没用上。
3. **无相对基线判定**：当前 findings 只描述绝对值（"throttle runningPct=56.99"），不做跨态对比（"throttle 比 cur 降 29pp"）。作文机 v5 §0 的"cur2 主线程瓶颈分布转移"+"thermal3 形态：屏幕 90Hz 节拍下的主线程半睡"这种相对基线判定是核心价值，WT-017 没做。
4. **无因果推理**：当前 findings 只列事实，不推理"为什么"。作文机 v5 §4.3 的"thermal3 上 Gfx.WaitForPresent (8045ms) ≈ Sleeping (8194ms) → 主线程睡的时候 100% 在等 GPU"这种因果链是独家方法论，WT-017 没做。

**关键认知**：
- WT-019/022 已把数据层补全（query 层 95% 覆盖 + provider 层 PlayerLoop 分位数/GC.Alloc 归因/offCpu byState）。explore 推理层现在有足够数据轴可用。
- WT-017 的 deterministic scripted loop **保留**（不接 LLM，避免超时），但 finding 派生规则要从"硬编码 target + 硬编码模式"升级到"数据驱动 + 通用纪律"。
- **不写死业务名**：explore 用 `queryCallTreeSubtree` 按 totalMs 排序自动发现 top 模块，用 `querySliceDeltas` 按 foldChange 排序自动发现涨幅最大的模块，用 `queryGcAllocByModule` 按 perFrame 排序自动发现 GC 压力最大的模块。agent 看排名自己判，不预设盯谁。
- **不写死绝对阈值**：explore 用相对基线判定（"cur 比 base 涨 ×N" 比 "绝对值 > Xms" 更通用）。prompt/规则只给纪律（"按跨态变化倍数 + 占比排名判定红线"），不给业务词、不给绝对数字阈值。

## 目标

1. 升级 WT-017 explore MVP 的 finding 派生规则，从"硬编码 target + 硬编码模式"改为"数据驱动 + 通用纪律"。
2. **新增相对基线判定**：每个 finding 必须含跨态对比（base→cur / cur→throttle 的变化倍数 + 占比变化），不只描述绝对值。
3. **新增跨态对比发现**：用 `querySliceDeltas` 按 foldChange 排序自动发现"涨幅最大的模块"，用 `queryCallTreeSubtree` 按 totalMs 排序自动发现"top 业务模块"，用 `queryGcAllocByModule` 按 perFrame 排序自动发现"GC 压力最大的模块"。
4. **新增因果推理规则**：用 `queryOffCpuAttribution` 的 byState + waitSlices + coveragePct 推理"主线程睡的时候在等什么"（作文机 v5 §4.3 的 Gfx.WaitForPresent ≈ Sleeping → GPU-bound 因果链）。
5. **不接 LLM**（避免超时）：仍是 deterministic scripted loop，但 finding 派生规则是数据驱动的通用纪律，不是硬编码 target。
6. **保留 WT-017 既有边界**：FrameTimeline unavailable 不写 jank finding；base callTree via fallback 标注 lower-confidence；correlateFrameSchedCpu 仅 window 粒度不声称逐帧。
7. 测试不退化（≥158 PASS）+ 新增测试覆盖相对基线判定 + 跨态对比发现 + 因果推理。

## 改哪些文件

**允许改**：
- `web/server/scripts/perfetto-explore-mvp.ts`：升级 finding 派生规则。**保留产物路径**（`web/data/prism-out/bk26b-perfetto-explore-mvp/`），覆盖 ledger.json/findings.json/verdict.json。
- `web/server/prism/tools.ts`：如需新增辅助 query（如 `queryRelativeBaseline` 封装跨态对比），可加。但优先复用 WT-019 已有的 `querySliceDeltas`/`queryCallTreeSubtree`/`queryGcAllocByModule`/`queryOffCpuAttribution`。
- `web/server/prism/tools.cli.ts`：如新增 query，注册 CLI。
- `web/server/prism/tools.test.ts`：补测试。
- 本工单文件：回填完工报告并改 REVIEW-。

**禁止改**：
- `scripts/perfetto_provider.py`（provider 层 WT-022 已补全，不再碰）。
- `web/server/scripts/perfetto-report-mvp.ts`（WT-018 报告脚本不改；explore 产物改完后主 agent 另跑 WT-018 脚本重建报告）。
- `web/server/prism/narrative*` / `render-html*`（WT-021 负责）。
- 采集脚本。
- `web/shared/perf-model.ts` schema version。
- WT-017/018 既有产物（`web/data/prism-out/bk26b-perfetto-explore-mvp/` 会被 explore 脚本覆盖重建，这是预期；`web/data/prism-out/bk26b-perfetto-report-mvp/` 不改）。

## 具体要求

### 1. 升级 finding 派生规则（数据驱动，不硬编码 target）

**当前 WT-017 `summarizeAtrace` 硬编码 `['PlayerLoop', 'BehaviourUpdate', 'FinishFrameRendering']`**。改为：

- 调用 `queryCallTreeSubtree(role, topN=20)` 按 totalMs 通用排序取 top 20 业务模块（不预设名清单）。
- 调用 `querySliceDeltas(baseRole='base', compareRole='cur', tool='callTreeSubtree', minFoldChange=2, topN=10)` 按 foldChange 排序自动发现"cur 比 base 涨最多的是谁"。
- 调用 `querySliceDeltas(baseRole='cur', compareRole='throttle', tool='callTreeSubtree', minFoldChange=2, topN=10)` 自动发现"throttle 才出现的隐性路径"。
- 调用 `queryGcAllocByModule(role, topN=10)` 按 perFrame 排序自动发现 GC 压力最大的模块。
- 调用 `queryOffCpuAttribution(role)` 拿 byState + waitSlices + coveragePct 推理"主线程睡的时候在等什么"。

**关键**：explore 不再写死 `['PlayerLoop', 'BehaviourUpdate', 'FinishFrameRendering']`，而是从 query 返回的 rows 按数据轴（totalMs/foldChange/perFrame）通用排序自动发现。

### 2. 相对基线判定（每个 finding 含跨态对比）

**当前 WT-017 findings 只描述绝对值**（"throttle runningPct=56.99"）。改为：

每个 finding 必须含：
- `absoluteValue`：当前态绝对值（如 `throttle UnityMain runningPct=56.99`）
- `baselineValue`：基线态绝对值（如 `cur UnityMain runningPct=77.82`）
- `foldChange`：变化倍数（`56.99 / 77.82 = 0.73`，即降 27%）
- `deltaPct`：占比变化（如 `cur 77.82% → throttle 56.99%，Δ -20.83pp`）
- `relativeJudgment`：相对判定（"throttle 比 cur 降 27% / -20.83pp" 比 "绝对值 56.99%" 更通用）

**关键**：判定红线用相对倍数（"降 ≥30%" 或 "涨 ≥2x"），不写死绝对阈值（不写 "runningPct < 60% = 异常"）。

### 3. 跨态对比发现（自动暴露 top 模块 + 涨幅最大模块）

**新增 findings**：

- **top 业务模块 finding**（按 totalMs 排序）：从 `queryCallTreeSubtree(cur, topN=5)` 取 top 5 业务模块，每个生成一条 finding，含 `name/totalMs/totalPct/count/avgMs/parentChain`。**不预设模块名**——agent 看排名自己判。
- **涨幅最大模块 finding**（按 foldChange 排序）：从 `querySliceDeltas(base, cur, minFoldChange=2, topN=5)` 取 top 5 涨幅最大模块，每个生成一条 finding，含 `name/baseTotalMs/curTotalMs/foldChange/baseCount/curCount/avgMsChange`。**不预设盯谁**——agent 看排名自己判。
- **GC 压力最大模块 finding**（按 perFrame 排序）：从 `queryGcAllocByModule(cur, topN=5)` 取 top 5 GC 压力模块，每个生成一条 finding，含 `name/count/totalMs/perFrame/parentChain`。**不预设模块名**。
- **thermal-only 隐性路径 finding**：从 `querySliceDeltas(cur, throttle, minFoldChange=2, topN=5)` 取 top 5 "throttle 才出现"的模块（foldChange=9999 sentinel），每个生成一条 finding。

### 4. 因果推理规则（off-CPU 归因 + GPU-bound 判定）

**新增 findings**：

- **off-CPU byState 归因 finding**：从 `queryOffCpuAttribution(throttle)` 拿 `byState`（S/R/D/R+ 各态）+ `totalOffCpuMs`，推理"主线程 off-CPU 时间分布"（如 "throttle totalOffCpuMs=8581, S=89.34% → 主线程 off-CPU 89% 是主动睡眠"）。
- **wait slice 覆盖率 finding**（因果推理核心）：从 `queryOffCpuAttribution(throttle)` 拿 `waitSlices` + `sleepingMs` + `coveragePct`，推理"主线程睡的时候在等什么"。**关键因果链**：如果 `Gfx.WaitForPresent` 累计 ms ≈ `sleepingMs`（coveragePct 接近 100%），则判定"主线程睡的时候 100% 在等 GPU"→ GPU-bound 信号。**不写死绝对阈值**——用 `coveragePct` 相对值判定（"coveragePct > 80% → 强信号"）。
- **PlayerLoop 分位数对比 finding**：从 `queryFrameTimeline(cur/throttle)` 拿 `playerLoopPercentiles`，对比 cur vs throttle 的 p50/p95/p99/fps/slowFrameRate，推理"帧耗时形态变化"（如 "cur p50=30.15 → throttle p50=45.94，涨 52%；slowFrameRate cur 11.18% → throttle 98.83%，扩 8.8x"）。
- **降频形态 finding**：从 `queryCpuFreq(base/cur/throttle)` 拿 `clusterSummary` + `bigCoreReachPct`，对比三态趋势，推理"全集群压频"还是"大核下线"（作文机 v5 §5.2 的降频形态判定）。

### 5. 保留 WT-017 既有边界

- FrameTimeline `available=false` → 不写 jank finding（保留 f-01）
- base callTree via PlayerLoop anchor fallback → 标注 lower-confidence（保留 f-02）
- `correlateFrameSchedCpu` 仅 window 粒度 → 不声称逐帧（保留 f-05）

### 6. finding 结构升级

```ts
interface Finding {
  id: string;
  title: string;
  severity: 'info' | 'warning' | 'critical';
  evidenceIds: string[];
  claim: string;
  boundary: string;
  // 新增：相对基线判定字段
  relativeBaseline?: {
    baselineRole: 'base' | 'cur';
    compareRole: 'cur' | 'throttle';
    absoluteValue: string;      // "throttle UnityMain runningPct=56.99"
    baselineValue: string;      // "cur UnityMain runningPct=77.82"
    foldChange: number | null;  // 0.73
    deltaPct: number | null;    // -20.83 (pp)
    relativeJudgment: string;   // "throttle 比 cur 降 27% / -20.83pp"
  };
  // 新增：因果推理字段
  causalChain?: {
    premise: string;     // "throttle sleepingMs=7666.5, Gfx.WaitForPresent=7600ms"
    inference: string;   // "coveragePct≈99% → 主线程睡的时候 100% 在等 GPU"
    conclusion: string;  // "GPU-bound 信号强烈"
    confidence: 'high' | 'medium' | 'low';  // high = coveragePct > 80%
  };
}
```

### 7. verdict 结构升级

verdict 顶层结论要从"描述事实"升级到"相对基线判定 + 因果推理"。至少含：

- **三态主趋势**：base→cur→throttle 的核心指标变化（UnityMain runningPct / avgMhz / PlayerLoop p50 / bigCoreReachPct 的三态趋势）
- **头号业务红线**：从 top 业务模块 finding 提炼（按 totalMs 排序第一的那个）
- **GPU-bound 判定**：从因果推理 finding 提炼（coveragePct + waitSlices）
- **降频形态判定**：从 clusterSummary 趋势提炼（全集群压频 vs 大核下线）
- **能力边界**：保留 WT-017 既有三个边界

### 8. CLI + 测试

- 不要求新增 CLI（explore 脚本本身就是一次性脚本）。
- `tools.test.ts` 补测试，至少覆盖：
  - explore 脚本跑通，产物 ledger/findings/verdict 生成且 JSON 合法
  - findings 数量 ≥10（WT-017 只有 6，WT-020 升级后应更多）
  - 至少 5 个 findings 含 `relativeBaseline` 字段
  - 至少 1 个 finding 含 `causalChain` 字段（GPU-bound 因果链）
  - 至少 1 个 finding 是"top 业务模块"（从 queryCallTreeSubtree 派生，不预设名）
  - 至少 1 个 finding 是"涨幅最大模块"（从 querySliceDeltas 派生，foldChange > 2）
  - 至少 1 个 finding 是"GC 压力最大模块"（从 queryGcAllocByModule 派生，perFrame > 0）
  - 既有 158 PASS 不得退化

## 禁止事项

- **严禁硬编码业务模块名清单**（不许写 `TARGET_SLICES = ['PlayerLoop', 'BehaviourUpdate', 'FinishFrameRendering']` 或 `AOE_MODULES = ['MapSignificanceMgr', ...]`）。所有模块发现必须从 query 返回的 rows 按数据轴（totalMs/foldChange/perFrame）通用排序。
- **严禁硬编码绝对阈值**（不许写 `if (runningPct < 60) return 'red'` 或 `if (avgMs > 5) return 'warning'`）。判定用相对倍数（"foldChange > 2" 或 "coveragePct > 80%"），不写死绝对数字。
- **严禁硬编码叙事模板**（不许写 `§0 结论先行 / §1 采集质量声明 / §2 ...` 章节骨架）。explore 只产 findings/verdict 结构化数据，叙事由 WT-021 LLM 生成。
- 不要改 provider / 采集脚本 / WT-018 报告脚本 / narrative/report 代码。
- 不要伪造 FrameTimeline / GPU / thermal / callTree。
- 不要宣称逐帧相关。
- 不要接 LLM（避免超时；deterministic scripted loop + 数据驱动规则即可）。

## 验收标准

1. `cd web && node --import tsx server/scripts/perfetto-explore-mvp.ts` 跑通，产物 ledger.json/findings.json/verdict.json 生成且 JSON 合法。
2. findings 数量 ≥10（WT-017 只有 6，WT-020 升级后应更多），每个 finding 回链 ledger 中已存在的 evidenceIds。
3. 至少 5 个 findings 含 `relativeBaseline` 字段（含 baselineRole/compareRole/absoluteValue/baselineValue/foldChange/deltaPct/relativeJudgment）。
4. 至少 1 个 finding 含 `causalChain` 字段（GPU-bound 因果链：premise + inference + conclusion + confidence）。
5. 至少 1 个 finding 是"top 业务模块"（从 queryCallTreeSubtree 派生，title 含具体模块名但不写死断言具体名）。
6. 至少 1 个 finding 是"涨幅最大模块"（从 querySliceDeltas 派生，foldChange > 2）。
7. 至少 1 个 finding 是"GC 压力最大模块"（从 queryGcAllocByModule 派生，perFrame > 0）。
8. verdict 含三态主趋势 + 头号业务红线 + GPU-bound 判定 + 降频形态判定 + 能力边界。
9. `cd web && node --import tsx server/prism/tools.test.ts` ≥158 PASS（不得退化，新增测试应额外通过）。
10. **代码里无硬编码业务名清单、无硬编码绝对阈值、无硬编码叙事模板**（主 agent 验收时 grep 检查）。
11. 完工报告列出实际命令、findings 摘要、新字段示例、边界。

## 接续说明（主 agent，2026-07-14，派发前加）

本单首次派发。为避免 CodeBuddy/Cursor 在 headless 模式下重复诊断导致外层 10 分钟超时（WT-014/017/018/019/022 均踩过），施工方必须遵守以下约束。

### 已确认的前置状态（不要重新验证，直接信）

- **WT-022 已 DONE（commit 8b69524）**：provider 层 PlayerLoop 分位数 + GC.Alloc 业务子树归因 + offCpuAttribution byState 全部落地。triad profile 已重新 build，含新字段。
- **WT-019 已 DONE（commit 76d4b4a）**：query 层有 `queryCallTreeSubtree`/`querySliceDeltas`/`queryOffCpuAttribution`/`queryFrameTimeline`/`queryCpuFreq`/`queryGcAllocByModule` 六个 query 可用。
- **WT-017 explore MVP 已 DONE（commit 771735e）**：`web/server/scripts/perfetto-explore-mvp.ts` 是 deterministic scripted loop，产物落 `web/data/prism-out/bk26b-perfetto-explore-mvp/`。当前 17 evidence + 6 findings + verdict。本单升级 finding 派生规则，不重做 explore 框架。
- **测试基线**：`cd web && node --import tsx server/prism/tools.test.ts` → 158 PASS。
- **triad 数据路径**：`web/data/prism-out/bk26b-perfetto-triad/{base,cur,throttle}/perfetto-profile{,-summary}.json`，均已含 WT-022 新字段。
- **WT-022 关键数据**（explore 推理可用）：
  - PlayerLoop 分位数：base p50=16.69/fps=59.8；cur p50=30.15/fps=33.1/slowFrameRate=11.18；throttle p50=45.94/fps=21.4/slowFrameRate=98.83
  - GC.Alloc byChain（cur）top 5：URP.BeforeRendering(130.54/帧)/Inl_OpaquePass(129.53/帧)/CS:AOE.MeshUIManager(61.33/帧)/TimeText.7(24.43/帧)/BattleHeadMgr.OnUpdate(20.74/帧)
  - offCpuAttribution byState（throttle）：S=7666.5ms(89.34%)/R=564.5ms(6.58%)/R+=238.6ms(2.78%)/D=111.4ms(1.3%)，totalOffCpuMs=8581
  - waitSlices（throttle）：URP.WaitForPresent(7608.52ms)/Gfx.WaitForPresentOnGfxThread(7600.06ms)/Semaphore.WaitForSignal(7592.75ms)
  - coveragePct（throttle）：691.53%（嵌套导致 >100%，已知；agent 推理时需处理嵌套）
- **作文机 v5 参考判定**（`docs/report/performance-report_perfetto_ULTIMATE_v5.md`）：
  - §0 三态主趋势：UnityMain runningPct 88.14→84.47→55.45；avgMhz 1735→1563→1445；PlayerLoop p50 16.65→28.07→55.55
  - §4.3 GPU-bound 因果链：thermal3 Gfx.WaitForPresent(8045ms) ≈ Sleeping(8194ms) → coveragePct≈98% → 主线程睡的时候 100% 在等 GPU → GPU-bound 信号强烈
  - §5.2 降频形态：bigCoreReachPct 77→70.8→60.1（全集群压频，非大核下线）
  - §6.2 头号业务红线：MapSignificanceMgr cur 占 23.43%
  - §6.3 GC.Alloc 归因：thermal3 LuaMgr 自身 27.4 次/帧（雪崩）

### 实现路径（建议，非强制，但偏离需在完工报告说明）

1. **保留 WT-017 的 explore 框架**（ledger push 机制 + 6 个基础 query 调用 + 三个边界 finding）。不要重做框架，只升级 `deriveFindings` 函数。
2. **新增 query 调用**（在 WT-017 的 6 个基础 query 之后）：
   - `queryCallTreeSubtree(cur, topN=20)` → top 业务模块
   - `querySliceDeltas(base, cur, tool='callTreeSubtree', minFoldChange=2, topN=10)` → 涨幅最大模块
   - `querySliceDeltas(cur, throttle, tool='callTreeSubtree', minFoldChange=2, topN=10)` → thermal-only 隐性路径
   - `queryGcAllocByModule(cur, topN=10)` → GC 压力最大模块
   - `queryGcAllocByModule(throttle, topN=10)` → thermal GC 压力
   - `queryOffCpuAttribution(throttle)` → byState + waitSlices + coveragePct（WT-017 已调，但 WT-020 要用 byState 字段做因果推理）
3. **升级 `deriveFindings`**：
   - 保留 WT-017 的 6 个基础 findings（f-01..f-06）
   - 新增 top 业务模块 findings（从 queryCallTreeSubtree top 5 派生，每个含 relativeBaseline）
   - 新增涨幅最大模块 findings（从 querySliceDeltas top 5 派生，每个含 relativeBaseline with foldChange）
   - 新增 GC 压力最大模块 findings（从 queryGcAllocByModule top 5 派生，每个含 relativeBaseline with perFrame）
   - 新增 off-CPU byState 归因 finding（从 queryOffCpuAttribution byState 派生）
   - 新增 GPU-bound 因果推理 finding（从 waitSlices + sleepingMs + coveragePct 派生，含 causalChain）
   - 新增 PlayerLoop 分位数对比 finding（从 queryFrameTimeline playerLoopPercentiles 三态派生，含 relativeBaseline）
   - 新增降频形态 finding（从 queryCpuFreq clusterSummary 三态派生）
4. **升级 verdict**：含三态主趋势 + 头号业务红线 + GPU-bound 判定 + 降频形态判定 + 能力边界。
5. **处理 coveragePct > 100% 嵌套**：waitSlices 有嵌套（URP.WaitForPresent 包含 Gfx.WaitForPresentOnGfxThread），coveragePct=691.53% 是嵌套导致。因果推理时用 `max(waitSlice totalMs)` 而非 `sum`，或用最深层 wait slice（Semaphore.WaitForSignal）的 totalMs 对照 sleepingMs。**不写死阈值**——用相对比值判定。

### 时间预算约束

- **不要跑 explore 脚本**（如果 Cursor shell 不可用）。按 WT-017/018/019/022 模式，施工方诚实交代无法自测，主 agent 直播跑验收。
- **不要重新诊断 WT-013/014/017/018/019/022 是否正确**——前置状态已确认，直接信。
- **不要重新 build triad**——profile 已就绪（WT-022 已 build）。
- 施工方只改 `web/server/scripts/perfetto-explore-mvp.ts` + 可能的 `tools.ts`/`tools.cli.ts`/`tools.test.ts`，不跑任何命令。改完即交。

### 自测要求（施工方）

- 若 Cursor shell 可用：跑 `cd web && node --import tsx server/prism/tools.test.ts` 确认 ≥158 PASS。
- 若 Cursor shell 不可用：诚实交代，按代码逻辑对照 WT-022 既有数据 + 作文机 v5 判定示例手写完工报告。主 agent 直播跑验收。
- **不要跑 explore 脚本**——主 agent 验收时直播跑。

### 产物路径（主 agent 验收时直播跑，施工方不跑）

主 agent 验收时直播跑以下命令覆盖 explore 产物：
```bash
cd web && node --import tsx server/scripts/perfetto-explore-mvp.ts
# → 覆盖 web/data/prism-out/bk26b-perfetto-explore-mvp/{ledger,findings,verdict}.json + run.log
```

## 完工报告（施工方填）

> 施工时间：____｜执行方：____｜范围：Perfetto explore 推理层升级（相对基线判定 + 跨态对比发现 + 因果推理规则）

### 1. 改了什么

| 文件 | 变更 |
|---|---|
| `web/server/scripts/perfetto-explore-mvp.ts` | ____ |
| `web/server/prism/tools.ts` | ____（如新增辅助 query）|
| `web/server/prism/tools.cli.ts` | ____（如新增 query 注册）|
| `web/server/prism/tools.test.ts` | ____ |
| 本工单 | 回填完工报告并改 REVIEW-。 |

### 2. 复现命令（主 agent 验收时直播跑）

```bash
# 1. 跑 explore（主 agent 跑）
cd web && node --import tsx server/scripts/perfetto-explore-mvp.ts

# 2. 测试（主 agent 跑）
cd web && node --import tsx server/prism/tools.test.ts
```

### 3. findings 摘要（施工方按代码逻辑对照 WT-022 数据填）

- findings 总数：____
- 含 relativeBaseline 的 findings：____ 个
- 含 causalChain 的 findings：____ 个
- top 业务模块 finding 示例：____
- 涨幅最大模块 finding 示例：____
- GC 压力最大模块 finding 示例：____
- GPU-bound 因果推理 finding：____

### 4. 偏离说明

____

## 验收结论（主 agent 填）

____
