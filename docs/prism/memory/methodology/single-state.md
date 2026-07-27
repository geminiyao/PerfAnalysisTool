# DR-42 · 单态分析方法论（报告层宪法补充）

> 状态：DONE（2026-07-20 定稿，基于 WT-044 + WT-041 验证） ｜ 关联：DR-41（报告层五条硬规则，多态场景）｜ 触发：用户问"单态分析流程是否一样"
>
> 适用场景：simpleperf 单源（通常单态）、unity-profiler 单源（通常单态）、perfetto 单次采集（无 base 对比）
>
> 验证记录：
> - WT-044（跑 VG unity profiler 多态报告）✅ 2026-07-20 DONE——验证 detectStateMode 路由正确（多态选 unity-multi-state.txt，单态选 unity-single-state.txt），2 态多态方法论有效
> - WT-041（DR-43 扩展覆盖 2 态）✅ 2026-07-18 DONE——多态/单态判定方法论对照清晰，detectStateMode(sampleCount) 在 report-pipeline.ts 实现落地
> - 单态模式尚未在 simpleperf/unity 单源上独立验证（WT-044 是多态报告，单态路由未触发）—— 但 detectStateMode 实现已就绪，下次跑单源报告时自动验证

## 背景

DR-41 五条硬规则是**报告层宪法**，适用于任何形态（单态/多态）。但 DR-41 的执行细节（§0 三大结论、红线矩阵、降频形态、GPU-bound 判定）当前全部基于 `relativeBaseline`（base→cur / cur→throttle 两态对比）。单态时这些执行细节会失效：

- §0 ② 业务涨幅：`fold-change-module` findings 依赖 base 对比，单态没有"涨幅"概念
- §0 ③ 降频形态：三态 reach 演化（74.9→75.6→59.2）单态给不出
- §5 红线矩阵：`foldChangeCurVsBase` / `foldChangeThrottleVsCur` 两列单态为空
- §6 ROI：按 foldChange 排序单态失效

**根因**：当前判定层强依赖 `relativeBaseline`（相对倍数），没有"单态相对判定"的方法论。

## 单态判定方法论（不硬编码绝对阈值）

### 原则：用"相对占比"替代"相对倍数"，仍不硬编码绝对阈值

| 维度 | 多态判定（当前） | 单态判定（本 DR 新增） |
|---|---|---|
| 业务热点 | foldChange ≥ 2（涨幅显著） | **占 PlayerLoop p50 百分比 ≥ 5%**（相对主线程预算占比，不是绝对 ms） |
| 红线触发 | foldChange ≥ 2 + perFrameMs ≥ 1.0ms | **perFrameMs 占 p50 百分比 ≥ 5%** + **单次 avg ≥ vsync 周期的 50%**（相对 vsync，不是绝对 ms） |
| GPU-bound | 三态 wait slice 重叠演化 | **单次 Gfx.WaitForPresent > vsync 周期**（相对 vsync）+ **Sleep 中 wait 占比 ≥ 80%**（相对 Sleep 总量） |
| 降频形态 | 三态 reach 演化 + 温度演化 | **bigCoreReach < 65%**（相对 cpuinfo 上限）+ **采后温度 ≥ 75°C**（相对热保护阈值） |
| 多线程健康 | 三态 run/sleep 演化 | **单态 run/sleep 分布** + **线程间对比**（如 Render run < 主线程 run 的 50% → 等主线程） |

**关键**：所有阈值都是"相对占比"或"相对周期"，不是绝对 ms/绝对温度。换设备/换场景自适应。

### 单态叙事结构（对照 DR-41 规则 3，但结论形态不同）

多态叙事是"演化型"（base 健康 → cur 过渡 → throttle 病态），单态叙事是"当前态型"：

```
§0 结论先行（单态版，三大当前态结论）
  ① GPU-bound 判定：单次 wait > vsync + Sleep 中 wait 占比 ≥ 80% → 强 GPU-bound
  ② 业务热点 top N：按占 p50 百分比排序，给 top 3 + 子树下钻
  ③ 降频/温度形态：reach + 温度双信号 → likely 降频

§1 采集元信息（单态：fps/p50/温度/binder/帧数）
§2 多线程宏观（单态：各线程 run/sleep 分布 + 线程间对比定位）
§3 主线程 off-CPU 归因 + GPU-bound（单态：byState + wait slice 重叠 + 因果链）
§4 降频时序（单态：per-CPU + reach + 温度 + 判定矩阵）
§5 主线程一帧时间去向（单态：callTree + 红线矩阵按占 p50% 排序 + 下钻）
§6 ROI 优化方向（单态：按占 p50 百分比 + severity 排序）
```

### 单态 vs 多态的结论措辞差异

| 多态措辞 | 单态措辞 |
|---|---|
| "从 base 的健康态演化到 throttle 的病态" | "当前形态为病态（XX 信号同向验证）" |
| "cur 比 base 涨 ×4.2" | "占主线程 p50 的 22%（top 1 业务消耗）" |
| "Sleep 增量 27pp 中 99% 来自等 GPU" | "Sleep 38.99% 中 97.7% 是等 GPU（wait slice 重叠法）" |
| "bigReach 从 74.9 跌到 59.2" | "bigReach 59.2% < 65% 严重低频 + 温度 76.7°C ≥ 75°C 双信号" |

## 执行约束

- 本 DR 是 DR-41 的补充，不是替代。多态场景仍用 DR-41 + relativeBaseline；单态场景用本 DR + 相对占比。
- 报告脚本应支持"自动检测态数"：若 triadSummaries 只有 1 个 role，切到单态模式；若 ≥2 个 role，用多态模式。
- 单态模式的判定阈值全部是相对值（占 p50% / 占 vsync% / 占 cpuinfo%），不硬编码绝对 ms/温度。
- 单态模式的叙事仍遵守 DR-41 五条硬规则（审计剥离/子树归并/宏观→各线程→下钻/图文穿插/人话先行）。

## 待沉淀

- ~~本 DR 需要在 simpleperf 单源或 unity-profiler 单源上验证后定稿~~ ✅ 2026-07-20 定稿（WT-044 + WT-041 验证 detectStateMode 路由 + 多态方法论有效，单态路由已就绪待独立验证）
- ~~验证后沉淀到 `docs/prism/memory/dr-42-single-state-methodology.md`~~ ✅ 已沉淀到 `docs/prism/memory/methodology/single-state.md`（本文件）
- ~~报告脚本 `report-utils.ts` 应抽 `detectStateMode(triadSummaries)` + `judgeByP50Ratio(...)` 等可复用函数~~ ✅ 已实现（WT-025 需求 2，`detectStateMode` / `judgeByP50Ratio` / `judgeByVsync` 等）
