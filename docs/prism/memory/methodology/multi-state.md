# DR-43 · 多态分析方法论（报告层宪法补充，与 DR-42 单态配套）

> 状态：DONE（2026-07-20 定稿，基于 WT-044 + WT-041 验证） ｜ 关联：DR-41（五条硬规则）+ DR-42（单态）
>
> 适用场景：perfetto 三态（base/cur/throttle）、simpleperf 多态、unity-profiler 多态、任何 ≥2 个样本对比的场景
>
> 验证记录：
> - WT-041（DR-43 扩展覆盖 2 态）✅ 2026-07-18 DONE——2 态判定/叙事/措辞在 multi-state.md §"2 态多态"节落地，工单 4 条断言全 PASS
> - WT-044（跑 VG unity profiler 多态报告）✅ 2026-07-20 DONE——用 VG baseline vs current 2 态数据跑通完整三段管线，82 PASS / 0 FAIL / 0 WARN，验证 2 态判定方法论（foldChange + 绝对增量）有效，红线归并规则（分布形态 + 语义独立性）正确拆出 BattleHeadMgr + MapSignificanceMgr

## 背景

DR-41 是报告层"宪法"（五条硬规则），适用于任何形态。DR-42 补了单态分析方法论。但多态分析的"执行细则"（判定/叙事/渲染）当前散落在 `perfetto-report-mvp.ts` 代码里，没有系统化沉淀。每次写报告脚本都要重新推导"多态怎么判定/怎么叙事"。

本 DR 把多态分析方法论系统化，与 DR-42 单态配套，形成完整的报告层方法论体系。

## 多态判定方法论（相对倍数 + 演化趋势）

### 原则：用"相对倍数"（foldChange）+ "演化趋势"（单调性）判定，不硬编码绝对阈值

| 维度 | 多态判定（本 DR） | 实现位置 |
|---|---|---|
| 业务涨幅显著 | foldChange ≥ 2（相对基线涨 2 倍以上） | `buildRedlineMatrix` redlineType |
| 红线触发 | foldChange ≥ 2 + perFrameMs ≥ 1.0ms（相对倍数 + 经验下限） | `buildRedlineMatrix` redlineType |
| GPU-bound 强信号 | 单次 Gfx.WaitForPresent > vsync 周期（相对 vsync）+ 三态 wait slice 重叠演化（Sleep 增量 ≈ wait 增量） | `buildGpuBoundMatrix` + `buildTopConclusionBlocks` ① |
| 降频 likely 档 | bigCoreReach 三态演化（单调下降）+ 温度 Δ ≥ 5°C 或采后 ≥ 75°C | `buildFreqMatrix` |
| 多线程健康 | 三态 run/sleep 演化（单调下降/上升）+ 线程间对比 | `buildMultiThreadMacro`（**当前缺三态，WT-024 需求 2 修复**） |
| off-CPU 归因 | 三态 byState 对照 + wait slice 重叠三态（Sleep 增量归因到 wait 增量） | `buildOffCpuAttribution` |

### 多态叙事结构（演化型，对照 DR-41 规则 3）

多态叙事是"演化型"——从健康到病态的演化趋势：

```
§0 结论先行（多态版，三大演化结论）
  ① GPU-bound 演化：从 base 的"几乎全程在算"到 throttle 的"半睡型"——核心增量是等 GPU
     （三态 Run/Sleep 演化 + 三态 wait slice 重叠）
  ② 业务涨幅全貌：Core.Update 涨 ×4.2，集中在 LuaMgr（含 BattleHead/MapSig 红线）+ MapManager（含 ArmyLine 红线）两条子树
     （主入口→子树→红线模块三层下钻，**WT-024 需求 1 修复**）
  ③ 降频演化：三态 bigReach 演化（74.9→75.6→59.2）+ 温度演化
     （三态 reach + 三态温度）

§1 采集元信息（多态：三态 fps/p50/温度/binder/帧数对照表）
§2 多线程宏观（多态：三态 run/sleep 对照 + 演化趋势定位，**WT-024 需求 2 修复**）
§3 主线程 off-CPU 归因 + GPU-bound（多态：三态 byState + 三态 wait slice 重叠 + 因果链）
§4 降频时序（多态：三态对照 + 形态识别 ASCII + 判定矩阵）
§5 主线程一帧时间去向（多态：callTree 三态对照 + 红线矩阵 foldChange 两列 + 下钻）
§6 ROI 优化方向（多态：按 foldChange + severity 排序）
```

### 2 态多态（diff，N=2 的特例）

**2 态多态是 N=2 的多态**（即传统叫法的"diff"：基线 vs 当前两态对比），判定方法论与 ≥3 态本质相同，只是"演化趋势单调性"退化为"涨/跌"。

**核心洞察**：2 态和 ≥3 态的判定逻辑本质相同（都用 foldChange + 绝对增量），只是 ≥3 态多了"演化趋势单调性"这个增强信号（base→cur→throttle 是否单调下降）。所以 DR-43 扩展一下就能覆盖 2 态，**不需要单独的 DR-46 diff 方法论**。

| 维度 | ≥3 态（已有） | 2 态（本节新增） |
|---|---|---|
| 业务涨幅 | foldChange ≥ 2 + 演化趋势（单调性） | foldChange ≥ 2 + **绝对增量 ≥ p50 的 1%**（防"从 0.01 涨到 0.05 涨 5 倍但无意义"） |
| 红线触发 | foldChange ≥ 2 + perFrameMs 显著 | foldChange ≥ 2 + perFrameMs 占 p50 ≥ 5% |
| GPU-bound | 三态 wait slice 重叠演化 | 基线→当前 wait slice 增量归因 |
| 降频 | 三态 reach 演化（单调下降） | 基线→当前 reach 变化（涨/跌） |
| 叙事 | 演化型（健康→病态） | 演化型（基线→当前） |

**绝对增量阈值防误判**（2 态专属，≥3 态有单调性增强信号不需要）：
- foldChange ≥ 2 但**绝对增量 < p50 的 1%** 不算回归——防"从 0.01ms 涨到 0.05ms 涨 5 倍但无实际意义"的噪声
- 例：某 marker base 0.01ms/帧 → cur 0.05ms/帧，foldChange=5（看起来涨 5 倍），但绝对增量 0.04ms 占 p50（如 30ms）的 0.13% << 1% → **不算回归**，归入"统计噪声"
- 例：某 marker base 1.0ms/帧 → cur 3.0ms/帧，foldChange=3，绝对增量 2.0ms 占 p50（30ms）的 6.7% ≥ 1% → **算回归**

### 2 态叙事结构（基线→当前）

2 态叙事是"演化型"的特例——从基线到当前的演化（没有中间态）：

```
§0 结论先行（2 态版，三大对比结论）
  ① 最大涨幅模块: foldChange top 1 + 绝对增量 + 占当前 p50%
     （基线→当前单态对比 + 绝对增量阈值校验）
  ② 新出现瓶颈: 基线无 + 当前触红线
     （基线未触发 → 当前触发红线的"新出现"问题）
  ③ 退化形态: 基线健康态 → 当前病态的形态变化
     （Run/Sleep 占比变化 + wait slice 增量归因）

§1 采集元信息（2 态: 基线/当前 fps/p50/帧数对照表）
§2 多线程宏观（2 态: 基线/当前 run/sleep 对照 + 涨幅）
§3 主线程一帧时间去向（2 态: callTree 对照 + 红线矩阵 foldChange 列 + 下钻）
§4 ROI 优化方向（2 态: 按 foldChange × 占 p50% 排序，优先治涨幅最大的回归）
```

**2 态和 ≥3 态叙事的唯一区别**：
- ≥3 态能讲"单调性"（base→cur→throttle 是否单调下降，如"Run 26→22→17 单调下降"）
- 2 态只能讲"涨/跌"（baseline→current 涨了多少，如"Run 从 26% 跌到 22%"）
- 判定逻辑本质相同，只是 ≥3 态多了单调性增强信号

### 多态措辞模板

#### ≥3 态措辞（base/cur/throttle 三态演化）

| 场景 | ≥3 态措辞 |
|---|---|
| 形态演化 | "从 base 的 XX 到 throttle 的 YY——核心增量是 ZZ" |
| 涨幅 | "cur 比 base 涨 ×N.N" |
| 增量归因 | "Sleep 增量 NNpp 中约 XX% 来自等 GPU" |
| 降频演化 | "bigReach 从 XX 跌到 YY" |
| 趋势定位 | "Run 单调下降（26→22→17）+ Sleep 单调上升（70→74→80）→ 不是瓶颈" |

#### 2 态措辞（基线/当前两态对比）

| 场景 | 2 态措辞 |
|---|---|
| 形态变化 | "从基线的 X 到当前的 Y——核心增量是 Z" |
| 涨幅 | "当前比基线涨 ×N.N" |
| 增量归因 | "Sleep 增量 NNpp 中约 XX% 来自等 GPU" |
| 回归 | "基线在健康档（p50 < 预算），当前超预算——这是回归" |

**2 态措辞和 ≥3 态措辞的差异**：
- ≥3 态用"base/cur/throttle"三档对照，2 态用"基线/当前"两档对照
- ≥3 态能讲"单调性"（如"Run 单调下降 26→22→17"），2 态只能讲"涨/跌"（如"Run 从 26% 跌到 22%"）
- 2 态专属"回归"措辞：基线健康 + 当前超预算 = 明确的退化回归（≥3 态有中间态 cur，"回归"判定不如 2 态直接）

## 多态 vs 单态对照（DR-42 + DR-43 配套）

| 维度 | 多态（DR-43） | 单态（DR-42） |
|---|---|---|
| 判定依据 | foldChange（相对倍数）+ 演化趋势（单调性） | 占 p50 百分比 + 单次 vs vsync 周期 |
| 叙事类型 | 演化型（健康→病态） | 当前态型（多信号同向验证） |
| §0 结论 | 三大演化结论 | 三大当前态结论 |
| 红线矩阵 | foldChange 两列 | 占 p50% 一列 |
| GPU-bound | 三态 wait 演化 | 单次 wait > vsync + Sleep 中 wait ≥ 80% |
| 降频 | 三态 reach 演化 | reach < 65% + 温度 ≥ 75°C 双信号 |

## 执行约束

- 本 DR 是 DR-41 的多态执行细则，不是替代。DR-41 五条硬规则仍适用。
- 多态判定阈值用相对倍数（foldChange ≥ 2）+ 相对周期（vsync），不硬编码绝对 ms。
- 多态叙事仍遵守 DR-41 五条硬规则（审计剥离/子树归并/宏观→各线程→下钻/图文穿插/人话先行）。
- 报告脚本应支持"自动检测态数"：若 triadSummaries ≥2 个 role，用多态模式（本 DR）；若 1 个 role，用单态模式（DR-42）。

## 待沉淀

- ~~本 DR 需要在 WT-024（三态质量二期）完成后验证定稿~~ ✅ 已通过 WT-041 + WT-044 验证定稿（2026-07-20）
- ~~验证后与 DR-42 合并成 `docs/prism/memory/report-methodology-index.md` 统一索引（WT-025 需求 1）~~ ✅ 已合并到 `docs/prism/memory/methodology/README.md` 统一索引（WT-025 已 DONE）
- report-utils.ts（WT-025 需求 2）的多态判定函数参照本 DR ✅ 已实现（`detectStateMode` / `judgeByFoldChange` 等）
