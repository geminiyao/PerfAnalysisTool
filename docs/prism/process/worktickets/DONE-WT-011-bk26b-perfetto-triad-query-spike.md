# 工单 WT-011 · BK-26b Perfetto/ptrace 新版 triad 验证 + query 最小集设计

> 状态：REVIEW（待验收）｜里程碑：M5 多源扩展前置 / BK-26b｜执行方：Cursor/agent
> 依据：WT-010 PASS 后，用户确认新版数据来自 `record_aoeyz.bat`，要求优先验证 `sample_{base,cur,throttle}_20260624_*` triad，并设计 Perfetto query 最小集。
> 前置：`DONE-WT-010-bk26-perfetto-isomorphism-spike.md`

## 背景（为什么做）

WT-010 用旧单文件 `base_2026-06-22_21-56-7c2693.pftrace`（~32MB，窗口仅 ~1.3s）验证了 provider 能进 `PerfProfile` / `detail.perfetto.callTrees`，但 `parseStatus=partial`，且无 base/cur/throttle 三态对照。agent 层仍缺 query/ledger/explore/narrative/memory。

本单只做两件事：
1. **验证** 新版 triad（`record_aoeyz.bat` 产出）是否比旧单 trace 更适合作为 Perfetto agent 同构样本；
2. **设计** Perfetto query 工具最小集（不实现、不改产品代码）。

## 目标（可观测）

1. 盘点三个 triad 目录文件结构。
2. 总结 `record_aoeyz.bat` 采集机制与已知限制。
3. 三组各跑通 `build_perfetto_profile.py`，产物落盘。
4. 对比三组 + WT-010 旧样本的关键字段。
5. 给出「是否更适合同构样本」判断。
6. 设计 6 个 query 工具的契约（args / data / provenance / 降级）。
7. 不实现 explore/report；不把 skeleton.md 当成 Prism `narrative.html`。

## 禁止事项

- 不改 `web/server/prism/*`、不改 `scripts/perfetto_provider.py`（发现 bug 只记录）。
- 不跑完整 Prism explore / narrative。
- 不伪造 trace / 不伪造数字。

---

## 完工报告（施工方填）

> 施工时间：2026-07-13｜未改产品代码

### 1. Triad 目录盘点

三个目录结构**同构**（均无 `meta.json` / 无单独 config 文件）：

| 目录 | pftrace | 旁路文件 |
|---|---|---|
| `G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_base_20260624_104944` | `2026-06-24_10-49-c1a652.pftrace`（268,259,827 B ≈ 255.8 MB） | `collection-manifest.json`、`cpuinfo_max_freq.txt`、`thermal_before.txt`、`thermal_after.txt` |
| `.../sample_cur_20260624_105041` | `2026-06-24_10-50-efb338.pftrace`（268,286,600 B ≈ 255.9 MB） | 同上 |
| `.../sample_throttle_20260624_105539` | `2026-06-24_10-55-2f0696.pftrace`（230,032,530 B ≈ 219.4 MB） | 同上 |

**缺失（相对 provider 期望）：**
- 无 `meta.json`（无显式 `pid` / scene / device）
- 无 Perfetto 文本 config 落盘（采集参数写在 `collection-manifest.json`）

**三组 manifest 共性（以 base 为例）：**
- `duration=20s`，`bufferMb=256`，`targetApp=com.tencent.aoeyz`，`isRoot=0`
- categories: `sched freq idle am wm gfx view binder_driver dalvik memory`
- sysfs: `cpuinfoMaxFreq/thermalBefore/thermalAfter=1`，`scalingMaxFreq=false`
- knownLimitations 已自报：无 `sched_blocked_reason`、无 GPU counters、无 FrameTimeline、Wwise 不可见

**旁路温度（soc_thermal zone0，毫度）：**

| 角色 | before | after | Δ |
|---|---|---|---|
| base | 65564 (65.6°C) | 77309 (77.3°C) | +11.7°C |
| cur | 79821 (79.8°C) | 79020 (79.0°C) | −0.8°C |
| throttle | 75569 (75.6°C) | 76668 (76.7°C) | +1.1°C |

`cpuinfo_max_freq.txt`（8 核，Hz）：`1804800×4 / 2419200×3 / 2841600×1`。

### 2. `record_aoeyz.bat` 采集机制摘要

| 项 | 内容 |
|---|---|
| 入口 | `record_aoeyz.bat [duration]` → 默认 `10s`；本 triad 实际为 `20s` |
| 输出目录 | `sample_<yyyyMMdd_HHmmss>/` |
| 主采集 | `python record_android_trace.py -t <dur> -b 256mb <categories> -a com.tencent.aoeyz -n -o <outdir> --sideload` |
| 采前旁路 | `cpuinfo_max_freq.txt`（8 核理论峰值）、`thermal_before.txt` |
| 采后旁路 | `thermal_after.txt` + `collection-manifest.json` |
| CombinedProfile | **不应期望由脚本产生**。脚本未注入游戏 atrace 色块；`CombinedProfile` 依赖游戏侧埋点。无色块 → provider 走全 trace 窗 → `parseStatus=partial`（设计预期） |
| FrameTimeline | **本版明确不采集**。manifest `knownLimitations.frameTimeline`：`needs perfetto config-mode data source (not enabled in this version)` |
| GPU counter | **本版明确不采集**（需 root 注入 qcom GPU producer） |
| meta.json | **不产生**；仅有 `collection-manifest.json` |
| sched_blocked_reason | 非 root 华为机预期 0 行 |

结论：新版采集相对旧裸 `.pftrace`，**多了可复现的旁路与显式能力声明**；但 CombinedProfile / FrameTimeline / GPU / meta.pid **按脚本设计就不会有**，不应把 `parseStatus=partial` 当成「采集失败」。

### 3. 真实命令与产物

```powershell
# cwd: K:\AI\PerfAnalysisTool_Codebuddy
python scripts/build_perfetto_profile.py `
  --trace "G:\AOEYZ_Trunk\Tools\AndroidPerfettoScripts\sample_base_20260624_104944\2026-06-24_10-49-c1a652.pftrace" `
  --out "K:\AI\PerfAnalysisTool_Codebuddy\web\data\prism-out\bk26b-perfetto-triad\base"
# exit 0；~28s；metrics=16；parseStatus=partial；throttling=suspected；UnityMain runningPct=86.94

python scripts/build_perfetto_profile.py `
  --trace "G:\AOEYZ_Trunk\Tools\AndroidPerfettoScripts\sample_cur_20260624_105041\2026-06-24_10-50-efb338.pftrace" `
  --out "K:\AI\PerfAnalysisTool_Codebuddy\web\data\prism-out\bk26b-perfetto-triad\cur"
# exit 0；~27s；metrics=16；parseStatus=partial；throttling=none；UnityMain runningPct=77.82

python scripts/build_perfetto_profile.py `
  --trace "G:\AOEYZ_Trunk\Tools\AndroidPerfettoScripts\sample_throttle_20260624_105539\2026-06-24_10-55-2f0696.pftrace" `
  --out "K:\AI\PerfAnalysisTool_Codebuddy\web\data\prism-out\bk26b-perfetto-triad\throttle"
# exit 0；~21s；metrics=28；parseStatus=partial；throttling=suspected；UnityMain runningPct=56.99
```

产物根：`web/data/prism-out/bk26b-perfetto-triad/{base,cur,throttle}/`

每组均有：
- `perfetto-profile.json`
- `perfetto-profile-summary.json`
- `run.log`

未跑 skeleton / LLM（本单验证 + 设计即可）。未改产品代码。

### 4. 三组 profile 对照（+ WT-010 旧单）

| 字段 | base (新) | cur (新) | throttle (新) | WT-010 旧单 |
|---|---|---|---|---|
| parseStatus | partial | partial | partial | partial |
| profileWindow.durMs | **11430** | **14668** | **19958** | 1347 |
| choreographer fps / p50 / p95 | 60.1 / 16.69 / 16.97 | 60.0 / 16.69 / 17.09 | 60.1 / 16.66 / 17.09 | 68.3 / 16.6 / 17.12 |
| FrameTimeline | null | null | null | null |
| threadsSched 线程数 | 4 | 4 | **8** | 4 |
| UnityMain run/runnable/sleep % | 86.94 / 0.97 / 12.04 | 77.82 / 1.62 / 20.4 | **56.99 / 2.83 / 38.99** | 83.07 / 4.18 / 12.35 |
| cpuFreqAvgMhz | 1729.5 | 1576.3 | **1324.6** | 1669.0 |
| throttling.level | suspected | none | suspected | suspected |
| bigCoreReachPct | 74.9 | 75.6 | **59.2** | 79.0 |
| confirmedAvailable (sysfs) | false | false | false | false |
| thermal / collectionManifest 入 profile | **null**（旁路文件存在但未 ingest） | 同左 | 同左 | 无旁路 |
| atraceSlices | PL/BU/Cam/Wait/Coro | + **GC.Collect** | + GC.Collect | PL/BU/Cam/Wait/Coro |
| PlayerLoop avgMs | 16.621 | **30.183** | **46.567** | 17.516 |
| BehaviourUpdate avgMs | 2.133 | 7.905 | 8.804 | 2.255 |
| callTrees | **0（空）** | 1 棵 depth=13 / 97 nodes | 1 棵 depth=13 / 84 nodes | 1 棵 depth=11 / 101 nodes |
| cur L2 热点 | — | FinishFrameRendering 43%、ScriptRunBehaviourUpdate 26% | FinishFrameRendering **56%**、ScriptRunBehaviourUpdate 19% | FinishFrameRendering 39%、ScriptRunBehaviourUpdate 12% |

**共同 parseNotes（四份一致模式）：**
1. 未找到 `CombinedProfile` 色块 → 全 trace 窗
2. meta 无 pid → 自动选 UnityMain 最大进程（新 triad pid=9577；旧单 pid=29348）
3. 无 GPU 频率计数器
4. 无 `actual_frame_timeline_slice`

### 5. 新版 triad 是否更适合 Perfetto agent 同构样本？

**是。优先用新版 triad（尤其 cur + throttle；base 作对照基线）。**

理由（可观察）：
1. **三态差分存在**：UnityMain running% 87→78→57；PlayerLoop avgMs 16.6→30.2→46.6；cpuFreqAvg 1729→1576→1325；throttle 大核 reach 59.2% —— agent 可练「对照/归因」而非单点描述。
2. **窗口足够长**（11–20s vs 旧单 1.3s），atrace 计数与树深度更稳。
3. **旁路齐全**（thermal / cpuinfo / manifest），给确认级降频与能力声明留了数据面——即使当前 provider 尚未 ingest。
4. **与采集脚本能力声明一致**：partial 原因已在 bat 里写死，不是「坏数据」。

保留缺口（不影响「选作样本」，但影响 query 完整度）：
- 三组仍无 CombinedProfile / FrameTimeline / GPU（脚本设计如此）。
- **base 的 `callTrees=[]`**，尽管 `atraceSlices.PlayerLoop` 有 684 条——query 设计需允许空树降级；实现阶段应排查 `_slice_tree`（疑似 parent 图 / 剪枝边界，本单不修）。
- provider **硬编码** `sysfs_available=False`，并在 evidence 写「本样本无 thermal_before/after.txt」，与磁盘事实矛盾（见 §7 bug 记录）。

### 6. Perfetto query 工具最小集设计

对齐 Unity Prism `tools.ts` 形态：纯函数 `(store, args) → { data, provenance }`；`provenance = { runId, tool, args }`。首版可直接读已 ingest 的 `perfetto-profile.json` / summary（不必先建 sqlite）；后续再落表。

#### 6.1 能力矩阵（相对本 triad 真实产物）

| 工具 | 数据源 | base | cur | throttle | 无数据时 |
|---|---|---|---|---|---|
| `querySchedState` | `detail.perfetto.threadsSched` (+ core.threads) | ✅ | ✅ | ✅（更全） | 返回 `[]` + note |
| `queryAtraceSlices` | `detail.perfetto.atraceSlices` | ✅ | ✅ | ✅ | 返回 `[]` |
| `queryFrameTimeline` | `core.frame[choreographer]` 优先；`frameTimeline` 若有则附加 | ✅ choreo | ✅ | ✅ | FrameTimeline 字段 `available:false` |
| `queryCpuFreq` | `core.system.cpuFreqAvgMhz` + `throttling.perCpu`；将来 + sidecar | ✅ 推测级 | ✅ | ✅ | 标明 `confidence:suspected` |
| `getPerfettoCallTree` | `detail.perfetto.callTrees` | ❌ 空 | ✅ | ✅ | `{ available:false, reason }` |
| `correlateFrameSchedCpu` | 组合上述摘要字段（首版无 per-frame 时间序列） | ⚠️ 粗粒度 | ⚠️ | ⚠️ | 明确「仅窗口级相关，非逐帧」 |

#### 6.2 工具契约

**共用类型**

```ts
interface Provenance {
  runId: string;
  tool: string;
  args: Record<string, unknown>;
  source?: 'perfetto';
  role?: 'base' | 'cur' | 'throttle' | 'single';
}

// 所有工具返回
interface ToolResult<T> {
  data: T;
  provenance: Provenance;
  capabilityNotes?: string[]; // 如 FrameTimeline 未采集、sysfs 未 ingest
}
```

---

##### ① `querySchedState`

**用途**：回答「关键线程 Running / Runnable / Sleeping 占比」。

```ts
interface QuerySchedStateArgs {
  runId: string;
  threads?: string[];      // 默认 KEY 线程全集
  minRunningPct?: number;  // 可选过滤
}
interface SchedStateRow {
  thread: string;
  runningPct: number;
  runnablePct: number;
  sleepingPct: number;
  count?: number;          // 同名实例合并数
}
// data: SchedStateRow[]
```

**对标 Unity**：接近 `getThreadTimeline` 的聚合视图（无 per-frame 轴）。

---

##### ② `queryAtraceSlices`

**用途**：回答「主线程关键 atrace marker 累计/帧均」。

```ts
interface QueryAtraceSlicesArgs {
  runId: string;
  names?: string[];        // 默认 PlayerLoop/BehaviourUpdate/Camera.Render/GC.Collect/WaitForTargetFPS/Coroutines
  sortBy?: 'totalMs' | 'avgMs' | 'count';
  topN?: number;
}
interface AtraceSliceRow {
  name: string;
  count: number;
  totalMs: number;
  avgMs: number;
}
// data: AtraceSliceRow[]
```

**对标 Unity**：`queryMarkers` 的 perfetto 弱化版（无 presentInFrames / maxSelfFrameIndex，除非后续切 raw TP）。

---

##### ③ `queryFrameTimeline`

**用途**：回答「显示链路帧耗时 / 是否有 Android FrameTimeline jank」。

```ts
interface QueryFrameTimelineArgs {
  runId: string;
}
interface QueryFrameTimelineData {
  choreographer: {
    available: boolean;
    p50Ms?: number; p95Ms?: number; p99Ms?: number;
    fps?: number; slowFrameRate?: number;
  };
  androidFrameTimeline: {
    available: boolean;          // 本 triad = false
    totalFrames?: number;
    jankyFrames?: number;
    jankRate?: number;
    byType?: Record<string, number>;
  };
}
```

**降级铁律**：无 `actual_frame_timeline_slice` 时不得编造 jank；只返回 `available:false` + `capabilityNotes` 引用 manifest `knownLimitations.frameTimeline`。

---

##### ④ `queryCpuFreq`

**用途**：回答「CPU 频率 / 降频推测 /（未来）确认级旁路」。

```ts
interface QueryCpuFreqArgs {
  runId: string;
  includePerCpu?: boolean; // 默认 true
}
interface QueryCpuFreqData {
  avgMhz?: number;
  cpuThrottled?: boolean | null;
  throttlingLevel: 'none' | 'suspected' | 'confirmed' | 'unknown';
  confirmedAvailable: boolean;
  bigCoreReachPct?: number;
  perCpu?: Array<{ cpu: number; avgMhz: number; maxMhz: number; reachPct: number }>;
  thermal?: { beforeC?: number; afterC?: number; deltaC?: number } | null;
  evidence: string[];
}
```

**实现前置建议（下单修，本单不改）：** provider 应从 pftrace 同目录读取 `thermal_*.txt` / `cpuinfo_max_freq.txt` / `collection-manifest.json`，填入 `throttling.thermal` 与 `collectionManifest`（类型已在 `perf-model.ts` 预留）。

---

##### ⑤ `getPerfettoCallTree`

**用途**：回答「UnityMain atrace 调用树剥洋葱」。

```ts
interface GetPerfettoCallTreeArgs {
  runId: string;
  thread?: string;         // 默认 UnityMain
  maxDepth?: number;       // 默认 8（给 LLM 控上下文）
  minTotalPct?: number;    // 默认 1.0
}
interface GetPerfettoCallTreeData {
  available: boolean;
  thread?: string;
  label?: string;
  root?: CallTreeNode;     // 与 perf-model CallTreeNode 同构
  reason?: string;         // available=false 时必填，如 'callTrees empty (base sample)'
}
```

**对标 Unity**：`getFrameCallTree` / `drillDownMarker` 的树读出口。base 样本必须能诚实返回 `available:false`。

---

##### ⑥ `correlateFrameSchedCpu`

**用途**：回答「帧慢 / 主线程忙 / 降频」是否同向（窗口级，非逐帧）。

```ts
interface CorrelateFrameSchedCpuArgs {
  runId: string;
  // 可选：与另一 role 对比
  compareRunId?: string;
}
interface CorrelateFrameSchedCpuData {
  granularity: 'window';   // 首版诚实声明；有 FrameTimeline+per-frame sched 后再升 'frame'
  frame: { fps?: number; p95Ms?: number; playerLoopAvgMs?: number };
  sched: { unityMainRunningPct?: number; unityMainSleepingPct?: number };
  cpu: { avgMhz?: number; throttlingLevel: string; bigCoreReachPct?: number };
  signals: Array<{
    id: string;            // e.g. 'high-main-run-low-freq' | 'long-playerloop' | 'high-sleep-low-freq'
    fired: boolean;
    evidence: string[];    // 只引用本工具读到的数字
  }>;
  vsCompare?: { /* 同上结构的 delta 摘要 */ };
}
```

**铁律**：不得声称逐帧相关；本 triad 无 FrameTimeline → `granularity:'window'` 固定。信号规则用阈值常量写死在工具内（确定性），LLM 只解释不编阈值。

#### 6.3 与 Unity 工具同构映射（接 explore 时用）

| Perfetto | Unity 近似 | 差异 |
|---|---|---|
| queryAtraceSlices | queryMarkers | 无帧轴 / presentInFrames |
| getPerfettoCallTree | getFrameCallTree | 树是窗口聚合 atrace，非单帧 |
| querySchedState | getThreadTimeline（聚合） | 无 timeline 序列 |
| queryFrameTimeline | queryFrameCounters / 帧统计 | Android FT 常缺省 |
| queryCpuFreq | （Unity 弱）系统态 | Perfetto 独有强项 |
| correlateFrameSchedCpu | correlateFrameSets | 首版仅窗口级 |

#### 6.4 明确不在本最小集

- 原始 TraceProcessor SQL 任意查询（太宽，难 provenance）
- Wwise / GPU busy（采集侧声明不可达）
- ledger / explore / narrative.html（后续工单）

### 7. Provider 明显问题（只记录，不修）

| ID | 现象 | 证据 | 建议归属 |
|---|---|---|---|
| BUG-P1 | `sysfs_available=False` 硬编码；evidence 谎称「无 thermal_before/after.txt」 | `perfetto_provider.py` L421 / L197；磁盘上 triad 三组均有 sidecar | 下单：按 trace 同目录自动发现旁路并填 `throttling.thermal` / `collectionManifest` |
| BUG-P2 | base 新样本 `callTrees=[]`，但同 utid 的 `atraceSlices.PlayerLoop` 有 684 条 | `bk26b-perfetto-triad/base/perfetto-profile.json` | 下单：复现 `_slice_tree` parent 图 / min_pct 剪枝；必要时对孤儿 slice 挂虚拟根 |
| GAP-C1 | 无 `meta.json` → 每次自动猜 pid | bat 不写 meta；provider 只认 `meta.pid` | 采集侧补 meta，或 provider 读 manifest.targetApp 解析 pid |
| GAP-C2 | FrameTimeline / CombinedProfile / GPU 按 bat 设计缺失 | manifest.knownLimitations | 不修 provider；若要消 partial，需升采集脚本（config-mode FT + 游戏色块） |

### 8. 总判定

**PASS：新版 triad 可作为 Perfetto agent 同构主样本；query 最小集已设计；agent/ledger/narrative 仍未实现（本单范围外）。**

- 数据层：三组 provider 全绿，差分信号清晰，强于 WT-010 旧单。
- 工具层：6 工具契约可直接开实现工单。
- 不等于「高于作文机的完整 Prism 报告」——缺 query 实现、ledger、explore、narrative.html。

### 9. 后续工单建议（≤3）

1. **BK-26b-impl · 实现 Perfetto query 最小集（读 profile JSON）** — 按本单 §6 落地 6 个工具 + CLI 注册 + 单测（用 `bk26b-perfetto-triad/cur` 作金样；base 测 callTrees 空降级）。
2. **BK-26b-fix · Provider sidecar ingest + base callTrees 空树排查** — 修 BUG-P1/P2；让 `confirmedAvailable` / thermal 进入 profile。
3. **BK-26d · Perfetto explore 薄接入** — 工具就绪后挂 explore-prompt 子集 + ledger；仍输出 findings，**暂不**要求完整 narrative.html（可并行开 narrative 适配单）。

### 10. 产品代码改动

无。

## 验收结论（主 agent 填）

**验收结论：PASS（按 BK-26b 验证/设计范围通过；不等于 Perfetto agent 同构已实现）。**

DR-36 核验摘要：

1. **新版 triad 输入真实存在**：已核到三组目录均包含 `.pftrace`、`collection-manifest.json`、`cpuinfo_max_freq.txt`、`thermal_before.txt`、`thermal_after.txt`：
   - `sample_base_20260624_104944/2026-06-24_10-49-c1a652.pftrace`
   - `sample_cur_20260624_105041/2026-06-24_10-50-efb338.pftrace`
   - `sample_throttle_20260624_105539/2026-06-24_10-55-2f0696.pftrace`
2. **`record_aoeyz.bat` 采集机制核验成立**：脚本输出 `.pftrace + collection-manifest.json + thermal_before/after + cpuinfo_max_freq`；采集 categories 为 `sched freq idle am wm gfx view binder_driver dalvik memory`；manifest 明确 `FrameTimeline/GPU/schedBlockedReason/Wwise` 等限制，因此三组 `parseStatus=partial` 是能力边界，不是坏数据。
3. **三组 provider 产物互相印证**：`run.log` 与 `perfetto-profile-summary.json` 均证实 base/cur/throttle 生成成功，parseStatus 均为 partial；base metrics=16，cur metrics=16，throttle metrics=28。
4. **三态信号核验成立**：
   - UnityMain runningPct：base `86.94` → cur `77.82` → throttle `56.99`。
   - PlayerLoop avgMs：base `16.621` → cur `30.183` → throttle `46.567`。
   - cpuFreqAvgMhz：base `1729.5` → cur `1576.3` → throttle `1324.6`。
   - bigCoreReachPct：base `74.9`，cur `75.6`，throttle `59.2`。
   这些数字支持“新版 triad 比 WT-010 旧单更适合作 Perfetto agent 同构样本”。
5. **缺口记录准确**：base `callTrees=[]` 但 `atraceSlices.PlayerLoop.count=684`，确实需要后续排查 tree 构造/剪枝；provider 中 `sysfs_available=False` 硬编码与磁盘 sidecar 存在相矛盾，BUG-P1 记录成立。
6. **query 最小集设计达标**：`querySchedState`、`queryAtraceSlices`、`queryFrameTimeline`、`queryCpuFreq`、`getPerfettoCallTree`、`correlateFrameSchedCpu` 均给出了 args/data/provenance/降级边界；尤其明确当前只能窗口级相关，不能声称逐帧相关。
7. **产品代码边界**：本工单未修改 `web/server/prism/*` 或 provider 代码；当前工作区存在其它历史/并行改动，但 BK-26b 产物集中在 `web/data/prism-out/bk26b-perfetto-triad/` 与本工单报告，不将噪声归因于本单。

结论：BK-26b 验证与 query 设计通过。后续推荐顺序：先开 `BK-26b-impl` 实现 6 个 Perfetto query（读 profile JSON + CLI/测试），并单独开 `BK-26b-fix` 修 provider sidecar ingest 与 base callTrees 空树；query 可用后再进入 Perfetto explore/ledger/narrative 接入。
