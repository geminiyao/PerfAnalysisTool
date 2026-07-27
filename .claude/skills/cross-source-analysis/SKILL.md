---
name: cross-source-analysis
description: 单次三源（Unity Profiler + Perfetto + Simpleperf）综合性能分析报告。输入同次同设备同场景的 .pdata/.pftrace/.data，输出对标 ULTIMATE 密度的单源融合报告（不是跨次 diff）。
---

# 三源综合性能分析（单次）

## When to Use

- 用户提供**同次三源采集**：`.pdata`（Unity Profiler）+ `.pftrace`（Perfetto）+ `.data`（Simpleperf perf.data，配 binary_cache）
- 同一设备、同一场景、采集时刻接近（容差 < 5 分钟）
- 想得到「这一次跑得怎么样」的**单点融合**报告，不是「这次 vs 上次」的 diff

不要用于：
- 跨次/跨版本对比 → 用 `simpleperf-diff-analysis`
- 单源解读 → 用对应单源 skill（unity-profiler-analysis / perfetto-trace-analysis / simpleperf-diff-analysis 各自）

## 与三个单源 skill 的关系

| Skill | 输入 | 角色 |
|------|------|------|
| unity-profiler-analysis | .pdata | 单源诊断（marker/帧分布） |
| perfetto-trace-analysis | .pftrace | 单源诊断（系统侧/调度/降频） |
| simpleperf-diff-analysis | base.data + cur.data | 跨次 diff |
| **cross-source-analysis** | **三源同次** | **同次融合**（本 skill）|

Cross-source 不重新分析数据，只做三件事：**抽取关键证据 → 跨源印证/冲突 → 渲染高密度报告**。三源原报告依然是单一事实源。

## 交付契约（用户角度）

**输入（用户提供）**：
- `xxx.pdata`
- `xxx.pftrace`（建议同目录附带 `thermal_before.txt` / `thermal_after.txt` / `cpuinfo_max_freq.txt` 旁路文件）
- `xxx.data` + `binary_cache/`

**输入（系统约束）**：
- 三源同次、同设备、同场景；采集时刻偏差 < 5 分钟（自动校验，触发警告但不阻塞）

**输出**：
- 综合报告 `performance-report_<runId>_<ts>.md`
- 中间证据 `cross-source-evidence.json`（digest）
- analyses + analysis_reports 入库（web 可查）

**质量目标**（自评门槛，不依赖人工判定）：
- 章节覆盖率 ≥ 80%（对照 ULTIMATE v5.3/v4.1 必备章节清单）
- 数据完备性：每章必引证据 grep 检查全过
- 跨场景稳定性：换数据不崩、章节数稳定

## Execution Flow

### 入口（同一条路径，CLI 与 Web 共用）

```bash
# CLI：
tsx web/server/scripts/analyze-single.ts \
  --pdata <x.pdata> --pftrace <x.pftrace> --simpleperf <x.data> --binary-cache <dir> \
  --device <name> --scene <name> [--out <dir>]

# Web：上传三源文件 → 后端调用同一 generateCrossSourceAnalysisForRun()
```

内部流程：

```
三源原始文件
  │
  ├─ runSourceProfileBuild() × 3        (services/source-profile-runner.ts)
  │   → unity-profile.json / perfetto-profile.json / simpleperf-profile.json
  │
  ├─ ingestProfile() × 3                  (合并入同一个 runId, sources=[unity, perfetto, simpleperf])
  │
  ├─ buildCrossSourceDigest()             (services/cross-source-digest.ts)
  │   → cross-source-evidence.json        ← Phase 1+2+3 加厚
  │
  ├─ generateCrossSourceInsights()        (services/cross-source-insights.ts)
  │
  └─ buildCrossSourceMarkdown()           (services/cross-source-report-builder.ts)
      ├─ AI-authored 路径 (默认)         ← Phase 0 新增
      └─ 程序拼装 fallback (兜底)
```

### Step 1：三源 ingest（自动）

每个源走对应 provider 出 `*-profile.json`，再 ingest 入库（同一 runId，sources=[unity_profiler, perfetto, simpleperf]）。

### Step 2：digest 关联（自动，本 skill 核心）

`buildCrossSourceDigest(runId)` 产出 evidence JSON，至少包含：

**主轴（共通：堆栈洋葱剥离）**
- `unityCallTreeComposite` — unity worstFrame ∪ medianFrame 的合成缩进树（每节点带 selfMs/totalMs/percentOfFrame + sourceFrame 标注）。**后续 aggregatedCallTree 替代不影响报告框架**
- `perfettoCallTreeIndented` — UnityMain atrace slice 完整缩进树（带 totalMs/totalPct/count/layer/gc.allocCount）
- `simpleperfCallTreeIndented` — UnityMain native 完整缩进树（带 selfPct/totalPct/layer）
- `alignedHotNodes[]` — 三源同名业务节点对位表（`{name, unity:{...}, perfetto:{...}, simpleperf:{...}, conflict?: reason}`）

**Simpleperf 独家（功耗观感 / so 视角）**
- `simpleperfSoBreakdown` — so 维度按分层（business/engine/runtime/middleware/noise）汇总
- `threadCategory[]` — 线程身份分类（business/engine/middleware/system）
- `nativeReverseCallStack[]` — Top selfPct 函数的反向调用栈

**Perfetto 独家（硬件侧 / 调度）**
- `throttlingEvidence` — 降频证据链（thermal {before,after,delta} + cpuinfoMaxFreq[8] + reachPctPerCpu + verdict: confirmed/likely/none）
- `offCpuAttribution` — Sleep 拆分 `{gpu_wait, vsync_wait, lock_wait, other_sleep}`
- `interThreadWait` — binder 对端进程归属 + Render `Semaphore.WaitForSignal` proxy

**元信息**
- `capabilityMatrix` — 数据可达性矩阵（GPU busy / FrameTimeline / sched_blocked_reason 等是否采到）
- `sameCapture` — 同次性校验（三源 trace 时长/起止偏差）
- `confidence` — 各结论置信度

### Step 3：报告渲染（AI-authored 优先，程序拼装兜底）

**AI-authored 路径（默认）**：把 digest + 本 SKILL.md 章节骨架交给 AI 写 markdown。AI 必须遵守：

- 数字一律来自 digest 字段，禁止编造
- 缺数据标 "数据缺失" 或 "[推断]"，不臆断
- 章节顺序按 §0–§9 固定，不增减大节
- 跨源印证至少两源同向才能下高置信结论

**程序拼装 fallback**：AI 失败时用 `cross-source-report-builder.ts` 的确定性模板兜底（密度低但不崩）。

### Step 4：自评质量门

报告生成后自动跑：

1. **章节覆盖度**：对照下面"必备章节清单"，缺失 > 20% → 失败
2. **数据完备性**：每章"必引证据"按 grep 模式检查
3. 失败回退到程序拼装 fallback（不交付坏报告）

## Output Format（报告必备章节）

对标 ULTIMATE v5.3 / v4.1 浓缩版，9 大块。每章列「必引证据」，自评门用。

```markdown
# 跨源综合性能分析报告 — <label> (<device> / <scene>)

> Run / 设备 / 场景 / 三源采集时间 / generatedAt
> 数据源: unity_profiler (.pdata, X 帧) + simpleperf (Y 样本) + perfetto (Zs)

## §0 一句话结论
- 必引：瓶颈类型 + 头号热点 + 置信度
- 来源：alignedHotNodes + bottleneckInputs

## §1 同源性 / 可比性校验
- 必引：三源 device/scene/采集时刻、覆盖窗口、帧口径差异
- 来源：sameCapture + capabilityMatrix
- 关键：playerloop vs choreographer 帧口径**禁直比**

## §2 瓶颈类型定型
- 必引：UnityMain Running/Sleeping/Runnable + simpleperf cpuPct + 降频 verdict
- 来源：bottleneckInputs + scheduling + throttlingEvidence
- 输出：CPU-bound / 等待型（等 GPU/锁/binder/vsync）/ 降频型 三选一 + 排除项

## §3 主循环阶段分解（Unity 主轴 + Perfetto 佐证）
- 必引：unityCallTreeComposite 一帧时间分阶段 + perfettoCallTreeIndented 占比对账
- 来源：unityCallTreeComposite + perfettoCallTreeIndented
- 形态：缩进树，每节点 ms/帧 + 占帧%

## §4 Top 热点清单（三源对位 + 冲突标注）
- 必引：alignedHotNodes 表，每行三源数字 + 是否冲突
- 来源：alignedHotNodes
- 形态：unity 主、perfetto + simpleperf 佐证；冲突显式标 ⚠️

## §5 Top 波动 / 慢帧
- 必引：unitySpikes（spikeRatio / 帧窗口） + GC.Collect 命中帧
- 来源：unitySpikes + unityCallTreeComposite (gc.allocCount 子树)

## §6 Simpleperf 独家：功耗 / so 负载分布
- 必引：simpleperfSoBreakdown（business/engine/runtime/middleware/noise）+ libil2cpp vs libxlua + Wwise/Audio/RHI 线程占比
- 来源：simpleperfSoBreakdown + threadCategory
- 关键：这是综合报告独家可读出"功耗观感"的章节

## §7 Perfetto 独家：调度 / 互等 / 降频
- 必引：offCpuAttribution（Sleep 拆 GPU/vsync/lock/other） + interThreadWait（binder 对端 + Render proxy） + throttlingEvidence（thermal + reach + verdict）
- 来源：offCpuAttribution + interThreadWait + throttlingEvidence

## §8 可执行建议（按 ROI 排序）
- 必引：每条建议带 P0/P1/P2 + 预期收益（ms/帧 或 % 占比） + 证据回链 §X
- 来源：alignedHotNodes + simpleperfSoBreakdown + offCpuAttribution

## §9 局限与可信度
- 必引：capabilityMatrix（哪些维度采到/没采到）+ confidence 备注
- 来源：capabilityMatrix + confidence
```

## 自评模式（Phase 4 启用）

```bash
tsx web/server/scripts/cross-source-self-eval.ts --report <md> --digest <json>
```

自动检查：
1. **章节覆盖率**：grep `^## §[0-9]` 数量 ≥ 9 中的 8（80%）
2. **必引证据 grep**：每章模式逐条匹配（如 §3 要求出现 `ms/帧` + 缩进结构 `├─` 或 `└─`）
3. **密度比**：行数 / 章节数 ≥ ULTIMATE 的 1/1.5

输出：
- PASS → 报告交付
- FAIL → 列出失败项 → 自动迭代或回退 fallback

## 阻塞 / 旧账

- `[[project_perfetto_provider_bugs]]` 5 条 bug 在 Phase 1b/2 实际撞上时再处理，不预防性返工
- AI-authored 路径在 Phase 0 是简化版（占位 + 程序拼装），Phase 4 端到端时再决定是否切到真 AI

## 一键命令（Phase 0 落地后）

```bash
# 简版（依赖三源 profile.json 已存在）：
tsx web/server/scripts/analyze-single.ts --profile-dir <dir>

# 全程版（从原始文件起）：
tsx web/server/scripts/analyze-single.ts \
  --pdata <pdata> --pftrace <pftrace> --simpleperf <data> --binary-cache <dir> \
  --device <name> --scene <name>
```
