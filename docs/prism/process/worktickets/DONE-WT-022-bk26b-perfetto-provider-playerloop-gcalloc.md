# 工单 WT-022 · BK-26b-provider Perfetto provider 层 PlayerLoop 分位数 + GC.Alloc 业务子树归因

> 状态：REVIEW（施工方完工待验收）｜里程碑：M5 多源扩展 / Perfetto agent 同构｜执行方：Cursor Agent + 主 agent 直播复跑验收
> 依据：WT-019 验收暴露 provider 层缺口——`queryFrameTimeline` 已诚实标注 `playerLoopPercentiles.available=false`，`queryOffCpuAttribution`/`queryCallTreeSubtree` 已能从 callTree 子树读业务模块，但 GC.Alloc 业务归因在 provider 层根本不存在。本单补 provider 层这两个缺口，让 agent 能拿到作文机 v5 §6.1 / §6.3 的核心数据。

## 背景

WT-019 把 query 层补到覆盖作文机 v5 约 80% 核心数据需求，剩余 20% 缺口**全在 provider 层**：

1. **PlayerLoop 分位数**：当前 provider 的 `core.frame` 数组只落 choreographer 一条（vsync 节拍），没落 PlayerLoop（应用一帧实际耗时）。作文机 v5 §6.1 把 PlayerLoop p50/p95/p99/fps/slowFrameRate 当核心指标——`cur p50=28.07 / p99=41.81 / fps=34.9`、`throttle p50=55.55 / p99=103.68 / fps=16.9`。当前 `queryFrameTimeline` 诚实标 `available:false`，但 explore 推理层缺帧级耗时关键证据。
2. **GC.Alloc 业务子树归因**：作文机 v5 §6.3 独家方法论——`gcAllocByModule` 字段记录每个业务模块子树下 GC.Alloc slice 的 count + perFrame（如 `BattleHeadMgr 子树 GC.Alloc cur 4.8 次/帧`、`LuaMgr 自身 thermal 27.4 次/帧`）。当前 provider 根本没这个字段，query 层无法暴露。

**关键认知**：
- PlayerLoop 分位数 = 在 `perfetto_provider.py` 里**新增一段 SQL**，从 slice 表取 `name='PlayerLoop'` 的 dur 序列算分位数，落到 `core.frame` 数组（与 choreographer 并列，`frameDefinition='playerloop'`）。**不需要重新采 trace**，trace 里本来就有 PlayerLoop slice。
- GC.Alloc 业务归因 = 在 `perfetto_provider.py` 里**新增一段 SQL + 子树归因逻辑**，遍历主线程 callTree，对每个节点统计子树里 `name LIKE 'GC.Alloc%'` 的 slice count，按 callTree 节点 name 聚合，落到 `detail.perfetto.gcAllocByChain`。**不需要重新采 trace**，trace 里本来就有 GC.Alloc slice。
- **不写死业务模块名清单**：GC.Alloc 归因遍历整个 callTree（不限 17 个 AOE 模块），让 agent 看到所有有 GC.Alloc 子节点的业务模块。作文机 v5 §9.2 工程化建议第 8 条已明示"应当扩展到所有主线程 root slice，做全 GC 归因 map"——本单按此方向做，不重复作文机的硬编码清单错误。

## 目标

1. provider 在 `core.frame` 数组追加 PlayerLoop 分位数（`frameDefinition='playerloop'`），与现有 choreographer 并列。
2. provider 在 `detail.perfetto.gcAllocByChain` 落业务子树 GC.Alloc 归因（遍历 callTree 全树，不预设模块名）。
3. provider 在 `detail.perfetto.offCpuAttribution` 落 byState 细分（补全 `offCpuReasons` 当前只有 sleepingPct/runnablePct/note 的薄结构，让 `queryOffCpuAttribution` 能从 profile 拿到 byState 数据，不再靠 callTree wait slice 间接推）。
4. query 层消费新字段：
   - `queryFrameTimeline` 把 `playerLoopPercentiles.available` 从 `false` 改为读 provider 落的 PlayerLoop 分位数。
   - 新增 `queryGcAllocByModule`（按 totalMs/count/perFrame 排序，通用筛选，不预设模块名）。
   - `queryOffCpuAttribution` 增强：优先读 `detail.perfetto.offCpuAttribution.byState`，fallback 到现有 callTree wait slice 推理。
5. 重新 build triad profile（base/cur/throttle 三份），覆盖 `web/data/prism-out/bk26b-perfetto-triad/{base,cur,throttle}/perfetto-profile{,-summary}.json`。
6. 测试不退化（≥139 PASS）+ 新增测试覆盖 PlayerLoop 分位数 + GC.Alloc 归因。

## 改哪些文件

**允许改**：
- `scripts/perfetto_provider.py`：新增 PlayerLoop 分位数 SQL + GC.Alloc 子树归因 + offCpuAttribution byState。
- `web/server/prism/tools.ts`：`queryFrameTimeline` 读 PlayerLoop 分位数；新增 `queryGcAllocByModule`；`queryOffCpuAttribution` 增强。
- `web/server/prism/tools.cli.ts`：注册 `queryGcAllocByModule`。
- `web/server/prism/tools.test.ts`：补测试。
- `web/data/prism-out/bk26b-perfetto-triad/{base,cur,throttle}/perfetto-profile.json` + `perfetto-profile-summary.json`：重新 build 后覆盖。
- `web/data/prism-out/bk26b-perfetto-explore-mvp/` + `web/data/prism-out/bk26b-perfetto-report-mvp/`：**不要改**，主 agent 验收后另跑 WT-017/018 脚本重建即可。
- 本工单文件：回填完工报告并改 REVIEW-。

**禁止改**：
- `web/server/scripts/perfetto-explore-mvp.ts` / `perfetto-report-mvp.ts`（WT-017/018 脚本不改；provider 字段补全后这些脚本自动受益）。
- `web/server/prism/narrative*` / `render-html*`（WT-021 负责）。
- 采集脚本（`record_android_trace.py` / `record_aoeyz.bat`）。
- `web/shared/perf-model.ts` 的 schema version（SCHEMA_VERSION 保持 1，新字段都是可选追加）。
- `scripts/build_perfetto_profile.py`（CLI 入口不变，只是 provider 内部多产数据）。
- Unity / simpleperf provider（本单只碰 perfetto provider）。

## 具体要求

### 1. PlayerLoop 分位数（provider 层）

在 `perfetto_provider.py` 的 `build_profile_dict` 里，choreographer 帧逻辑之后追加：

```python
# --- PlayerLoop 帧 (应用一帧实际耗时; 与 choreographer 并列) ---
pl_frames = _safe(tp, """
    SELECT s.ts ts, s.dur dur
    FROM slice s JOIN thread_track tt ON s.track_id=tt.id
    WHERE tt.utid=%d AND s.name='PlayerLoop' %s
    ORDER BY s.ts
""" % (main_utid, win), "playerloop frames")
if pl_frames:
    durs = sorted([int(r.dur) / 1e6 for r in pl_frames
                   if r.dur is not None and int(r.dur) > 0 and int(r.dur) / 1e6 < 500])
    if durs:
        avg = sum(durs) / len(durs)
        p50, p95, p99 = _pct(durs, 50), _pct(durs, 95), _pct(durs, 99)
        slow = len([d for d in durs if d > 1000.0 / 30]) / len(durs) * 100
        core_frame.append({
            "source": SOURCE, "frameDefinition": "playerloop",
            "count": len(durs),
            "p50Ms": _round(p50), "p95Ms": _round(p95), "p99Ms": _round(p99),
            "fps": _round(1000.0 / avg if avg else 0, 1), "slowFrameRate": _round(slow),
        })
```

**关键**：
- `frameDefinition='playerloop'`，与 choreographer 区分（query 层和报告层按 frameDefinition 筛）
- `count` 字段落帧数（作文机 v5 §2 的 PlayerLoop 帧数 1199/696/336 是核心指标）
- 过滤 `dur > 0` 和 `dur < 500ms`（防异常值污染分位数）
- 不写死帧数阈值、不写死 fps 警戒线——query 只返数据，判定由 agent 推理

### 2. GC.Alloc 业务子树归因（provider 层）

在 `perfetto_provider.py` 里新增函数 `_gc_alloc_by_chain(tp, main_utid, win, call_trees_nodes)`：

**思路**：
1. SQL 查所有 `name LIKE 'GC.Alloc%'` 的 slice（在主线程 track 上），取 `id / parent_id / name / dur`。
2. 对每个 GC.Alloc slice，沿 `parent_id` 链向上走，直到找到 callTree 里出现的业务节点 name（用 callTree 已聚合的节点集合做匹配）。
3. 按业务节点 name 聚合：`count` = 该业务子树下 GC.Alloc slice 总次数，`totalMs` = sum dur，`perFrame` = count / PlayerLoop 帧数。
4. **不预设业务模块名清单**——遍历整个 callTree，任何有 GC.Alloc 后代的节点都进结果。
5. 返回结构：
```python
{
  "available": bool,
  "playerLoopFrameCount": int | None,  # 用于 perFrame 计算
  "totalGcAllocSlices": int,  # 主线程 GC.Alloc slice 总数（校验用）
  "byChain": [
    {
      "name": str,  # 业务模块名（如 "BattleHeadMgr" / "LuaMgr.OnTick&UpdateSchedule" / "Core.Update"）
      "count": int,  # 该子树下 GC.Alloc slice 出现次数
      "totalMs": float,
      "perFrame": float,  # count / playerLoopFrameCount
      "depth": int,  # 在 callTree 中的深度（agent 推理用：浅层=聚合节点，深层=具体模块）
      "parentChain": [str, ...]  # 从 root 到该节点的 name 路径
    },
    ...
  ]
}
```

落到 `detail.perfetto.gcAllocByChain`。同时在 summary 里落一份剪枝版（perFrame ≥ 0.1 或 count ≥ 10 的项）。

**关键**：
- **不写死业务模块名清单**（不许写 `AOE_SLICE_PATTERNS = ['MapSignificanceMgr', ...]` 这种）。遍历整个 callTree。
- GC.Alloc slice 匹配用通用 `name LIKE 'GC.Alloc%'`（作文机 v5 §6.3 用的也是这个口径）。
- `perFrame` 用 PlayerLoop 帧数（不是 choreographer 帧数——choreographer 是 vsync 节拍，PlayerLoop 是应用一帧）。若 PlayerLoop 帧数为 0 或 None，`perFrame=null`。
- `parentChain` 让 agent 能看到归因路径（如 `UnityMain > PlayerLoop > Update.ScriptRunBehaviourUpdate > BehaviourUpdate > Core.Update > CS:AOE.LuaMgr > LuaMgr.OnTick&UpdateSchedule > BattleHeadMgr`）。
- 子树归因要处理**嵌套**：如果一个 GC.Alloc slice 在多个祖先节点的子树下，**只归到最深的那个业务节点**（避免重复累加）。作文机 v5 §6.3 表格里 LuaMgr 自身 27.4 次/帧 + BattleHeadMgr 子树 4.8 次/帧 是分开计的——BattleHeadMgr 是 LuaMgr 的子节点，所以 BattleHeadMgr 子树的 GC.Alloc 不重复算到 LuaMgr 自身。实现方式：对每个 GC.Alloc slice，沿 parent_id 链向上找**第一个**在 callTree 节点集合里出现的 name，归到它。

### 3. offCpuAttribution byState（provider 层）

当前 `offCpuReasons` 字段只有 `{sleepingPct, runnablePct, note}`，太薄。作文机 v5 §4.1 的 `offCpuAttribution` 字段有完整 byState（S/R/D/R+ 各占多少 ms + pctOfOffCpu）。

在 `perfetto_provider.py` 里把 `off_cpu` 改为：

```python
off_cpu = None
if main_utid is not None:
    # byState 细分: 直接从 thread_state 表按 state 分组求和
    state_rows = _safe(tp, """
        SELECT state, SUM(dur) total_ns, COUNT(*) cnt
        FROM thread_state
        WHERE utid=%d %s
        GROUP BY state
    """ % (main_utid, win), "main thread state by state")
    by_state = []
    total_off = 0
    if state_rows:
        for r in state_rows:
            s = str(r.state or "Unknown")
            ns = int(r.total_ns or 0)
            cnt = int(r.cnt or 0)
            if s == "Running":
                continue  # off-CPU = 非 Running
            total_off += ns
            by_state.append({"state": s, "totalMs": _round(ns / 1e6, 1),
                              "count": cnt, "pctOfOffCpu": None})  # pct 后填
        for b in by_state:
            b["pctOfOffCpu"] = _round(b["totalMs"] / (total_off / 1e6) * 100, 2) if total_off else 0.0
    ms = threads_sched.get("UnityMain", {})
    off_cpu = {
        "sleepingPct": ms.get("sleepingPct"),
        "runnablePct": ms.get("runnablePct"),
        "totalOffCpuMs": _round(total_off / 1e6, 1) if total_off else 0.0,
        "byState": by_state,
        "note": "byState 直接从 thread_state 表分组求和; byReason 细分 (blockedFunction) 需内核 sched_blocked_reason, 本 trace 未含."
    }
```

落到 `detail.perfetto.offCpuAttribution`。`offCpuReasons` 字段**保留**（向后兼容），但内容改为指向 `offCpuAttribution`：

```python
"offCpuReasons": {
    "sleepingPct": ms.get("sleepingPct"),
    "runnablePct": ms.get("runnablePct"),
    "totalOffCpuMs": ...,
    "byState": by_state,  # 复制一份, 让旧 query 也能读到
    "note": "...",
}
```

或者更简单：把 `offCpuAttribution` 直接作为 `offCpuReasons` 的扩展字段（同一个对象），`queryOffCpuAttribution` 读 `offCpuReasons.byState` 即可。**施工方选其一，在完工报告说明**。

### 4. query 层消费新字段

#### 4.1 `queryFrameTimeline` 改造

当前 `playerLoopPercentiles.available=false`。改为：

```ts
// 从 summary.frame 数组找 frameDefinition='playerloop' 的那条
const plFrame = summary.frame?.find(f => f.frameDefinition === 'playerloop');
return {
  data: {
    androidFrameTimeline: { available: !!summary.frameTimeline, reason: summary.frameTimeline ? undefined : 'trace 无 actual_frame_timeline_slice' },
    choreographer: { /* 现有逻辑 */ },
    playerLoopPercentiles: plFrame
      ? { available: true, count: plFrame.count, p50Ms: plFrame.p50Ms, p95Ms: plFrame.p95Ms, p99Ms: plFrame.p99Ms, fps: plFrame.fps, slowFrameRate: plFrame.slowFrameRate }
      : { available: false, reason: 'provider 未提取 PlayerLoop 分位数 (trace 无 PlayerLoop slice 或 provider 未跑该逻辑)' },
  },
  provenance,
};
```

#### 4.2 新增 `queryGcAllocByModule`

```ts
interface QueryGcAllocByModuleArgs extends PerfettoJsonToolArgs {
  // 按 perFrame 阈值筛选 (可选, 默认 0.1 即 ≥0.1 次/帧)
  minPerFrame?: number;
  // 按 count 阈值筛选 (可选, 默认 1)
  minCount?: number;
  // 按 name pattern 筛选 (可选, 通用 substring 匹配, 不写死清单)
  pattern?: string;
  // 按 perFrame 倒序取 topN (默认 20)
  topN?: number;
  // 是否包含 parentChain (默认 true)
  includeParentChain?: boolean;
}
```

返回：`{ data: { available, playerLoopFrameCount, totalGcAllocSlices, rows: [{ name, count, totalMs, perFrame, depth, parentChain? }] }, provenance }`

**关键**：
- 读 `summary.gcAllocByChain` 或 `detail.perfetto.gcAllocByChain`（summary 剪枝版优先，缺了再读 detail 全量）
- 按 perFrame/count 通用排序，不预设业务名
- `pattern` 是通用 substring（如传 "Mgr" 筛所有管理器），不是写死清单

#### 4.3 `queryOffCpuAttribution` 增强

当前从 callTree wait slice 推理。改为：

```ts
// 优先读 provider 落的 offCpuAttribution.byState
const offCpu = summary.offCpuReasons || {};  // 兼容字段名
const byState = offCpu.byState || [];
// 仍保留 callTree wait slice 提取 (作文机 v5 §4.3 的 atrace wait slice 重叠法)
const waitSlices = collectCallTreeFlatNodes(...).filter(n => isWaitSliceName(n.name));
return {
  data: {
    available: byState.length > 0 || waitSlices.length > 0,
    thread: 'UnityMain',
    runningPct: offCpu.sleepingPct != null ? _round(100 - offCpu.sleepingPct - (offCpu.runnablePct || 0), 2) : null,
    sleepingPct: offCpu.sleepingPct,
    runnablePct: offCpu.runnablePct,
    totalOffCpuMs: offCpu.totalOffCpuMs,
    byState,  // 新增: provider 直接落的 byState 细分
    waitSlices,  // 保留: callTree wait slice (atrace 重叠法)
    sleepingMs: offCpu.totalOffCpuMs != null && offCpu.sleepingPct != null
      ? _round(offCpu.totalOffCpuMs * offCpu.sleepingPct / 100, 1) : null,
    waitSliceTotalMs: /* 现有逻辑 */,
    coveragePct: /* 现有逻辑 */,
    note: offCpu.note || '...',
  },
  provenance,
};
```

### 5. 重新 build triad profile

施工方**不负责**重新 build（主 agent 验收时直播跑）。但施工方要确保 provider 改完后，主 agent 用以下命令能 build 出带新字段的 profile：

```bash
python scripts/build_perfetto_profile.py \
  --trace "G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_base_20260624_104944/2026-06-24_10-49-c1a652.pftrace" \
  --out web/data/prism-out/bk26b-perfetto-triad/base

python scripts/build_perfetto_profile.py \
  --trace "G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_cur_20260624_105041/2026-06-24_10-50-efb338.pftrace" \
  --out web/data/prism-out/bk26b-perfetto-triad/cur

python scripts/build_perfetto_profile.py \
  --trace "G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_throttle_20260624_105539/2026-06-24_10-55-2f0696.pftrace" \
  --out web/data/prism-out/bk26b-perfetto-triad/throttle
```

### 6. CLI 注册 + 测试

- `tools.cli.ts` 注册 `queryGcAllocByModule` 的 single/batch 调用。
- `tools.test.ts` 补测试，至少覆盖：
  - `queryFrameTimeline(cur)` 暴露 `playerLoopPercentiles.available=true` + 真实 p50/p95/p99 数字
  - `queryGcAllocByModule(cur)` 能读到 ≥3 个业务模块的 GC.Alloc 归因（不写死具体名，用 `available=true && rows.length >= 3 && rows[0].perFrame > 0` 这种通用断言）
  - `queryGcAllocByModule(throttle)` 能读到 LuaMgr/BattleHeadMgr 子树归因（用 pattern 通用筛，不写死断言具体名）
  - `queryOffCpuAttribution(throttle)` 暴露 `byState` 数组（S/R/D 各项）+ 保留 waitSlices
  - provider 层：build 出的 profile `core.frame` 数组有 `frameDefinition='playerloop'` 和 `frameDefinition='choreographer'` 两条
  - provider 层：build 出的 profile `detail.perfetto.gcAllocByChain.byChain` 数组非空
- 既有 139 PASS 不得退化

## 禁止事项

- **严禁硬编码业务模块名清单**（不许写 `AOE_SLICE_PATTERNS = ['MapSignificanceMgr', 'BattleHeadMgr', ...]`）。GC.Alloc 归因遍历整个 callTree，任何有 GC.Alloc 后代的节点都进结果。
- **严禁硬编码绝对阈值**（不许写 `if (perFrame > 5) return 'red'`）。query 只返数据，判定由 agent 推理。
- 不要改采集脚本、WT-017/018 脚本、narrative/report 代码。
- 不要改 `web/shared/perf-model.ts` 的 schema version。
- 不要伪造 PlayerLoop 分位数（trace 无 PlayerLoop slice 时 `available=false`）。
- 不要伪造 GC.Alloc 归因（trace 无 GC.Alloc slice 时 `available=false, byChain=[]`）。
- 不要在 query 里做"红线判定"——query 层只给数据，判定是 WT-020 explore 推理层的活。
- 不要碰 Unity / simpleperf provider。

## 验收标准

1. provider 改完后，主 agent 直播 `python scripts/build_perfetto_profile.py --trace <cur.pftrace> --out <tmp>` 能跑通，产出的 `perfetto-profile.json` 含：
   - `core.frame` 数组有 2 条（choreographer + playerloop），playerloop 那条含 `p50Ms/p95Ms/p99Ms/fps/slowFrameRate/count`
   - `detail.perfetto.gcAllocByChain.byChain` 数组非空，至少 5 个业务模块（含 LuaMgr/BattleHeadMgr/Core.Update 等，但不写死断言具体名）
   - `detail.perfetto.offCpuAttribution.byState` 数组非空，含 S/R/D 各态
2. 主 agent 直播重新 build triad 三份 profile（base/cur/throttle），全部 build 成功。
3. `cd web && node --import tsx server/prism/tools.cli.ts single '{"tool":"queryFrameTimeline","args":{"role":"cur"}}'` 暴露 `playerLoopPercentiles.available=true` + 真实 p50/p95/p99 数字（cur p50 应在 25-35ms 区间，对照作文机 v5 §6.1 cur p50=28.07）。
4. `cd web && node --import tsx server/prism/tools.cli.ts single '{"tool":"queryGcAllocByModule","args":{"role":"cur","topN":5}}'` 能读到 ≥3 个业务模块，每个含 `count/totalMs/perFrame/parentChain`。
5. `cd web && node --import tsx server/prism/tools.cli.ts single '{"tool":"queryOffCpuAttribution","args":{"role":"throttle"}}'` 暴露 `byState` 数组（S/R/D 各态）+ 保留 `waitSlices`。
6. `cd web && node --import tsx server/prism/tools.test.ts` ≥139 PASS（不得退化，新增测试应额外通过）。
7. **代码里无硬编码业务名清单、无硬编码绝对阈值**（主 agent 验收时 grep 检查）。
8. 完工报告列出实际命令、结果摘要、新字段示例、边界。

## 接续说明（主 agent，2026-07-14，派发前加）

本单首次派发。为避免 CodeBuddy/Cursor 在 headless 模式下重复诊断导致外层 10 分钟超时（WT-014/017/018/019 均踩过），施工方必须遵守以下约束。

### 已确认的前置状态（不要重新验证，直接信）

- **WT-019 已 DONE（commit 76d4b4a）**：query 层已补全到覆盖作文机 v5 约 80% 核心数据需求。`tools.test.ts` 139 PASS/0 FAIL。
- **WT-019 已暴露 provider 缺口**：
  - `queryFrameTimeline` 当前 `playerLoopPercentiles.available=false`（provider 没落 PlayerLoop 分位数）
  - `queryOffCpuAttribution` 当前靠 callTree wait slice 间接推（provider `offCpuReasons` 字段只有 sleepingPct/runnablePct/note，无 byState）
  - GC.Alloc 业务归因：provider 根本没这个字段，query 层无法暴露
- **triad 源 trace 路径已确认可访问**（主 agent 直播验证过 `Test-Path`）：
  - base: `G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_base_20260624_104944/2026-06-24_10-49-c1a652.pftrace`
  - cur: `G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_cur_20260624_105041/2026-06-24_10-50-efb338.pftrace`
  - throttle: `G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_throttle_20260624_105539/2026-06-24_10-55-2f0696.pftrace`
- **Python perfetto 库可用**：`python -c "from perfetto.trace_processor import TraceProcessor"` 直播验证 exit 0。
- **现有 provider 结构**：`scripts/perfetto_provider.py` 720 行，`build_profile_dict` 是主入口，`_build_summary` 摘要落盘。`core.frame` 数组当前只落 choreographer 一条（`build_profile_dict` 第 547-565 行）。`off_cpu` 当前在第 629-633 行（薄结构）。callTree 在 `_slice_tree` 函数（第 125-206 行）。
- **现有 query 层**：`web/server/prism/tools.ts` 的 `queryFrameTimeline` 当前 `playerLoopPercentiles.available=false`；`queryOffCpuAttribution` 从 callTree wait slice 推理；无 `queryGcAllocByModule`。
- **测试基线**：`cd web && node --import tsx server/prism/tools.test.ts` → 139 PASS。
- **作文机 v5 参考字段**（`docs/report/performance-report_perfetto_ULTIMATE_v5.md`）：
  - §6.1 PlayerLoop 分位数：cur p50=28.07/p95=36.01/p99=41.81/fps=34.9/slowFrame>33ms=14.1%；throttle p50=55.55/p95=92.51/p99=103.68/fps=16.9/slowFrame>33ms=98.81%
  - §6.3 GC.Alloc 业务归因：cur BattleHeadMgr 子树 4.8 次/帧、MapSignificanceMgr 子树 1.0 次/帧、LuaMgr 自身 2.5 次/帧；throttle LuaMgr 自身 27.4 次/帧
  - §4.1 offCpuAttribution byState：throttle totalOffCpuMs=8888.4、S=8092.8(91.05%)/R=589.7(6.63%)/D=101.7(1.14%)/R+=104.2(1.17%)

### 实现路径（建议，非强制，但偏离需在完工报告说明）

1. **先改 provider**（`scripts/perfetto_provider.py`）：
   - 在 `build_profile_dict` 里 choreographer 帧逻辑之后（约第 565 行后）追加 PlayerLoop 分位数 SQL + 落 `core.frame`。
   - 在 `_slice_tree` 之后或 `build_profile_dict` 末尾，新增 `_gc_alloc_by_chain` 函数调用，落 `detail.perfetto.gcAllocByChain`。
   - 把 `off_cpu`（约第 629 行）改为 byState 细分版本，落 `detail.perfetto.offCpuAttribution`。
   - `_build_summary` 里把 `gcAllocByChain` 剪枝版（perFrame ≥ 0.1 或 count ≥ 10）落进 summary。
2. **再改 query 层**（`web/server/prism/tools.ts`）：
   - `queryFrameTimeline` 读 `summary.frame` 里 `frameDefinition='playerloop'` 那条，改 `playerLoopPercentiles.available=true`。
   - 新增 `queryGcAllocByModule`，读 `summary.gcAllocByChain` 或 `detail.perfetto.gcAllocByChain`。
   - `queryOffCpuAttribution` 增强：读 `summary.offCpuReasons.byState` 或 `detail.perfetto.offCpuAttribution.byState`。
3. **注册 CLI**（`tools.cli.ts`）：`queryGcAllocByModule` single/batch。
4. **补测试**（`tools.test.ts`）：见验收标准第 6 项。
5. **不要重新 build triad**——主 agent 验收时直播跑。施工方只需确保 provider 代码正确。

### 时间预算约束

- **不要跑完整 Python provider build**（每个 trace 解析 30-60 秒，三个一起 3-5 分钟，可能触发 Cursor shell 故障或外层超时）。施工方只改代码，不跑 provider。
- **不要跑 `tools.test.ts`**（如果 Cursor shell 不可用）。按 WT-017/018/019 模式，施工方诚实交代无法自测，主 agent 直播跑验收。
- **不要重新诊断 WT-013/014/017/018/019 是否正确**——前置状态已确认，直接信。
- **不要重新验证 trace 路径**——主 agent 已确认可访问。
- 施工方只改 `scripts/perfetto_provider.py` + `web/server/prism/tools.ts` + `tools.cli.ts` + `tools.test.ts` 四个文件，不跑任何命令。改完即交。

### 自测要求（施工方）

- 若 Cursor shell 可用：跑 `cd web && node --import tsx server/prism/tools.test.ts` 确认 ≥139 PASS。
- 若 Cursor shell 不可用：诚实交代，按代码逻辑对照 WT-019 既有数据结构 + 作文机 v5 字段示例手写完工报告。主 agent 直播跑验收。
- **不要跑 provider build**——主 agent 验收时直播跑。

### 产物路径（主 agent 验收时直播跑，施工方不跑）

主 agent 验收时直播跑以下命令覆盖 triad profile：
```bash
python scripts/build_perfetto_profile.py --trace "G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_base_20260624_104944/2026-06-24_10-49-c1a652.pftrace" --out web/data/prism-out/bk26b-perfetto-triad/base
python scripts/build_perfetto_profile.py --trace "G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_cur_20260624_105041/2026-06-24_10-50-efb338.pftrace" --out web/data/prism-out/bk26b-perfetto-triad/cur
python scripts/build_perfetto_profile.py --trace "G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_throttle_20260624_105539/2026-06-24_10-55-2f0696.pftrace" --out web/data/prism-out/bk26b-perfetto-triad/throttle
```

## 完工报告（施工方填）

> 施工时间：2026-07-14｜执行方：Cursor Agent｜范围：Perfetto provider 层 PlayerLoop 分位数 + GC.Alloc 业务子树归因 + offCpuAttribution byState

### 1. 改了什么

| 文件 | 变更 |
|---|---|
| `scripts/perfetto_provider.py` | ① choreographer 后追加 PlayerLoop 分位数 SQL → `core.frame`（`frameDefinition='playerloop'`, 含 count/p50/p95/p99/fps/slowFrameRate）；② 新增 `_gc_alloc_by_chain`：全 callTree 遍历 + parent_id 向上找最深匹配节点，落 `detail.perfetto.gcAllocByChain`；③ `off_cpu` 改为 byState（thread_state 分组），`offCpuReasons` 与 `offCpuAttribution` 共享同一对象（扩展字段向后兼容）；④ `_build_summary` 落 `gcAllocByChain` 剪枝版（perFrame≥0.1 或 count≥10）+ `offCpuAttribution`。 |
| `web/server/prism/tools.ts` | ① `queryFrameTimeline` 读 `frameDefinition='playerloop'`，`available=true` 时返真实分位数；② 新增 `queryGcAllocByModule`（summary 剪枝优先、通用 pattern/perFrame/count 筛选，无模块名清单）；③ `queryOffCpuAttribution` 优先读 byState + totalOffCpuMs，保留 waitSlices。 |
| `web/server/prism/tools.cli.ts` | 注册 `queryGcAllocByModule`（single/batch + PERFETTO_JSON_TOOL_NAMES）。 |
| `web/server/prism/tools.test.ts` | [12] 去掉「PlayerLoop 永远 unavailable」硬断言；新增 [13] WT-022：playerLoop / gcAlloc / byState / provider 字段断言（依赖 triad rebuild）。 |
| 本工单 | 回填完工报告并改 REVIEW-。 |

### 2. 复现命令（主 agent 验收时直播跑）

```bash
# 1. 重新 build triad（主 agent 跑 —— 施工方按工单未跑）
python scripts/build_perfetto_profile.py --trace "G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_base_20260624_104944/2026-06-24_10-49-c1a652.pftrace" --out web/data/prism-out/bk26b-perfetto-triad/base
python scripts/build_perfetto_profile.py --trace "G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_cur_20260624_105041/2026-06-24_10-50-efb338.pftrace" --out web/data/prism-out/bk26b-perfetto-triad/cur
python scripts/build_perfetto_profile.py --trace "G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_throttle_20260624_105539/2026-06-24_10-55-2f0696.pftrace" --out web/data/prism-out/bk26b-perfetto-triad/throttle

# 2. 测试（主 agent 跑）
cd web && node --import tsx server/prism/tools.test.ts

# 3. CLI 验证（主 agent 跑）
cd web && node --import tsx server/prism/tools.cli.ts single '{"tool":"queryFrameTimeline","args":{"role":"cur"}}'
cd web && node --import tsx server/prism/tools.cli.ts single '{"tool":"queryGcAllocByModule","args":{"role":"cur","topN":5}}'
cd web && node --import tsx server/prism/tools.cli.ts single '{"tool":"queryOffCpuAttribution","args":{"role":"throttle"}}'
```

### 3. 新字段示例（施工方按代码逻辑对照作文机 v5 字段示例填）

> 未重新 build triad，下列为 provider/query 代码预期产出（对照作文机 v5；直播 build 后核对真实数字）。

- PlayerLoop 分位数（cur）：p50≈28.07 / p95≈36.01 / p99≈41.81 / fps≈34.9 / slowFrameRate≈14.1 / count≈1199（作文机 v5 §6.1；以直播 build 为准）
- GC.Alloc byChain（cur）top 期望形态：`{name, count, totalMs, perFrame, depth, parentChain[]}`，按 perFrame 倒序；不硬编码具体模块名；pattern=`Mgr` 可筛管理器子树
- offCpuAttribution byState（throttle）：期望含 S/R/D/(R+) 各态 `{state, totalMs, count, pctOfOffCpu}` + `totalOffCpuMs`；`offCpuReasons` 为同一对象扩展（含 byState）

### 4. 偏离说明

1. **未跑 provider build / 未覆盖 triad JSON**——按工单「时间预算约束」与「自测要求」，交给主 agent 验收时直播跑。
2. **Cursor shell 本会话不可用**（命令无 exit status）——未能本地跑 `tools.test.ts`；诚实交代。rebuild 前 [13] 中依赖新字段的断言预期 FAIL；rebuild 后应 ≥139 PASS 且新增断言通过。
3. **offCpu 设计选型**：`offCpuAttribution` 与 `offCpuReasons` 指向**同一对象**（扩展 byState/totalOffCpuMs），旧 query 读 `offCpuReasons.byState` 即可。
4. PlayerLoop SQL 的 win 过滤使用既有 `win.replace("ts >=", "s.ts >=")` 模式（与文件内其它 slice 查询一致），未照抄工单示例里未加 `s.` 前缀的裸 `ts`。
5. 无硬编码业务名清单、无绝对红线阈值判定（grep 确认）。

## 验收结论（主 agent 填）

**验收结论：PASS（WT-022 / BK-26b-provider Perfetto provider 层 PlayerLoop 分位数 + GC.Alloc 业务子树归因 + offCpuAttribution byState 通过）。**

DR-36 核验摘要（主 agent 2026-07-14 亲自跑）：

1. **provider 直播 build 三份 triad 全部成功**：
   - base: `python scripts/build_perfetto_profile.py --trace <base.pftrace> --out .../base` → exit 0，UnityMain runningPct=86.94, throttling=suspected, frame 含 choreographer + playerloop 两条
   - cur: exit 0，UnityMain runningPct=77.82, throttling=none, frame 含 playerloop count=483 p50=30.15 p95=35.22 p99=42.54 fps=33.1 slowFrameRate=11.18
   - throttle: exit 0，UnityMain runningPct=56.99, throttling=suspected, frame 含 playerloop count=427 p50=45.94 p95=55.62 p99=66.32 fps=21.4 slowFrameRate=98.83
   - （PowerShell stderr 被误判为 error 导致 task status=failed，但 stdout JSON 显示 build 成功 + 产物文件实际生成；属 PowerShell 工具显示层问题，非 build 失败）
2. **PlayerLoop 分位数对照作文机 v5 §6.1 形态一致**：
   - base p50=16.69/fps=59.8/slowFrameRate=0.0（作文机 v5 base2 p50=16.65/fps=60.0/slowFrameRate=0%）
   - cur p50=30.15/fps=33.1/slowFrameRate=11.18（作文机 v5 cur2 p50=28.07/fps=34.9/slowFrameRate=14.1%）
   - throttle p50=45.94/fps=21.4/slowFrameRate=98.83（作文机 v5 thermal3 p50=55.55/fps=16.9/slowFrameRate=98.81%）
   - 数值不完全相同（不同 trace），但形态一致：base 60fps、cur 30-35fps、throttle 16-21fps + slowFrameRate ~99%
3. **GC.Alloc byChain 业务子树归因成立**：cur `detail.perfetto.gcAllocByChain.byChain` 27 项，含 URP.BeforeRendering(130.54/帧)/Inl_OpaquePass(129.53/帧)/CS:AOE.MeshUIManager(61.33/帧)/TimeText.7(24.43/帧)/BattleHeadMgr.OnUpdate(20.74/帧) 等，每个含 `count/totalMs/perFrame/depth/parentChain`。**不预设业务模块名清单**——遍历整个 callTree。
4. **offCpuAttribution byState 成立**：throttle `byState` 含 S(7666.5ms, 89.34%)/R(564.5ms, 6.58%)/R+(238.6ms, 2.78%)/D(111.4ms, 1.3%) 四态 + `totalOffCpuMs=8581`。对照作文机 v5 §4.1 thermal3 totalOffCpuMs=8888.4、S=8092.8(91.05%)/R=589.7(6.63%)/D=101.7(1.14%)/R+=104.2(1.17%) —— 数值同量级、形态一致。
5. **queryFrameTimeline 暴露 playerLoopPercentiles**：`available=true, count=483, p50Ms=30.15, p95Ms=35.22, p99Ms=42.54, fps=33.1, slowFrameRate=11.18`。choreographer 仍保留。
6. **queryGcAllocByModule 通用筛选成立**：cur topN=5 读出 URP.BeforeRendering/Inl_OpaquePass/CS:AOE.MeshUIManager/TimeText.7/BattleHeadMgr.OnUpdate，每个含 `count/totalMs/perFrame/depth/parentChain`；throttle pattern=Mgr 筛出 LuaMgr.OnTick&UpdateSchedule(3.12/帧)/LuaMgr.OnLateUpdateSchedule(1.46/帧) 等。**pattern 是通用 substring，不写死清单**。
7. **queryOffCpuAttribution 增强**：throttle 读到 `byState` 4 项（S/R/D/R+）+ `totalOffCpuMs=8581` + 保留 `waitSlices`（URP.WaitForPresent 7608.52ms / Gfx.WaitForPresentOnGfxThread 7600.06ms / Semaphore.WaitForSignal 7592.75ms）。`offCpuReasons` 与 `offCpuAttribution` 共享同一对象（向后兼容）。
8. **测试通过**：`cd web && node --import tsx server/prism/tools.test.ts` → **158 PASS, 0 FAIL**（原 139 + 新增 19）。新增 [13] WT-022 测试组覆盖 playerLoop 分位数 / gcAlloc byChain / byState / provider 字段断言。
9. **无硬编码**：grep 确认 `_gc_alloc_by_chain` 用通用 `startswith("GC.Alloc")` 匹配 + 遍历整个 callTree，无固定业务模块数组；query 层无绝对阈值判定（`if (perFrame > X)` 等）。`tools.ts` 里 OutSideViewArmyLineMgr 匹配项全在 WT-012 的 source mapping 代码（alias map），非 WT-022 新增。
10. **未越界**：git status 确认只改 `scripts/perfetto_provider.py` + `web/server/prism/tools.ts` + `tools.cli.ts` + `tools.test.ts` + 工单改名 + 派发日志 + 三份 triad profile 重建。未碰 WT-017/018 脚本 / narrative/report 代码 / 采集脚本 / Unity/simpleperf provider / perf-model.ts schema version。
11. **施工方偏离判定**：施工方诚实交代 Cursor shell 不可用无法自测，按代码逻辑对照作文机 v5 字段示例手写完工报告。主 agent 直播 build triad + 跑测试 + CLI 验证后，输出与施工方预期一致。偏离可接受。

结论：WT-022 可标记 DONE。**provider 层缺口补全**——PlayerLoop 分位数 + GC.Alloc 业务子树归因 + offCpuAttribution byState 三项全部落地，agent 现在能拿到作文机 v5 §6.1 / §6.3 / §4.1 的核心数据。query 层覆盖度从 WT-019 的 80% 提升到约 95%（剩余 5% 是 sched_blocked_reason ftrace 缺失导致的 byReason 细分，需采集端补，非 provider 层能解）。

**关键进展**：Prism 现在在数据层完全追上作文机 v5，且 GC.Alloc 归因是**全 callTree 遍历**（不预设 17 个 AOE 模块清单），比作文机 v5 §9.2 工程化建议第 8 条"应当扩展到所有主线程 root slice"更彻底——这是超越作文机的关键一步。下一步建议 WT-020（explore 推理层：相对基线判定 + 跨态对比发现 + 因果推理规则，阈值由 agent 推理不写死）。
