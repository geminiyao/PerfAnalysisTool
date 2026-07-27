# perfetto skill 工程化路线图 v1

> 目标：把 v4 报告（[performance-report_perfetto_ULTIMATE_v4.md](./performance-report_perfetto_ULTIMATE_v4.md)）那一档质量的报告，自动化产出。
>
> 现状：v4 报告中 ~40% 的数据是 SQL 手算（按帧聚合、off-CPU 归因、降频时序、热点下钻），不在现有 provider 自动产出范围内。本路线图把这些手算环节工程化。
>
> 思路：先沉淀"出数据"（provider 改造），再沉淀"出报告"（skill.md 模板升级），最后做"多 trace 流水线"（多份关联分析）。

---

## §0 当前能力地图

### 0.1 已沉淀

| 文件 | 沉淀内容 | 完成度 |
|---|---|---|
| `scripts/perfetto_provider.py` | trace → PerfProfile 提取层（threadsSched / callTrees / aoeHotSlices / throttling / frameAnalysis）| **~70%**（数据齐但部分口径有 bug）|
| `scripts/build_perfetto_profile.py` | CLI 包装 + 剪枝参数 + 落盘 | **~95%**（缺采集质量自检）|
| `.claude/skills/perfetto-trace-analysis/skill.md` | AI 解读流程（Step 1 跑 build → Step 2 读 summary → Step 3 解读 → Step 4 出报告）| **~50%**（流程对但产出还到不了 v4 质量）|
| `.claude/skills/.../references/aoe-cpu-analysis-knowledge.md` | 业务红线知识库 | **~90%**（知识齐，v4 实战又印证一遍）|
| `.claude/skills/.../references/perfetto-knowledge.md` | 系统知识 | **~95%** |
| `.claude/skills/.../references/thermal-throttling-reference.md` | 降频理论 | **~95%** |
| `.claude/skills/.../降频观测指南.md` | 采集端方法论 | **~95%** |

### 0.2 v4 报告独有但**未沉淀**的能力

| 能力 | v4 报告章节 | 现状 | 应沉淀到 |
|---|---|---|---|
| 业务模块按 PlayerLoop 帧聚合（ms/帧 + max ms/帧）| §6 / §5.4 | SQL 手算 | provider (`aoeHotSlices` 重做)|
| 稀疏模块活跃率 + 活跃均 | §1.2 / §5.4 / §6 | SQL 手算 | provider (`aoeHotSlices` 新增列)|
| 主线程 off-CPU 归因（atrace wait × sched 重叠）| §4.2 | SQL 手算 | provider (`offCpuAttribution` 新增字段)|
| worst/median/p95 三线程时间轴 | §4.4 | SQL 手算 + 手画 | provider (`frameTimelines[]`) + skill 模板 |
| 重点热点子树下钻（BattleHeadMgr → TimeText 等）| §6.3 | SQL 手算 | provider (`hotSpotDrilldown[]` 新增字段)|
| cpu cluster offline 检测 | §5.1 | SQL 手算 | provider (throttling 算法重写)|
| cpufreq 事件密度 → 频率锁定 | §5.1 | SQL 手算 | provider (throttling 算法重写)|
| 多份 trace 时序对比 | §5.1 | 完全人工 | 新流水线 `compare_throttling_timeseries.py`|
| Δ% 基于 ms/帧（非累计 ms）| §6.2 | SQL 手算 | provider + skill 模板硬规则 |
| 线程命名身份地图（同名陷阱处理）| §3 | 手动核实 | provider (`threadIdentityMap` 新增字段) |

---

## §1 P0 阶段：provider 数据层修补（首要）

**目标**：把 v4 报告里 SQL 手算的数据 100% 落到 provider 自动产出，AI 只读 summary 就能直接写报告。

### P0-1：`aoeHotSlices` 统计口径重做 ⭐⭐⭐ 高优先级

**现状**：用 `LIKE 'MapSignificanceMgr%'` 模式匹配，统计子 slice 累计/平均，得 `avgMs=0.201ms`（错口径）。

**目标**：

```json
{
  "label": "MapSignificanceMgr",
  "parentSliceName": "MapSignificanceMgr",
  "perFrame": {
    "avgMs": 0.890,            // 全帧均 ms/帧
    "maxMs": 5.692,            // max ms/帧
    "activeFrames": 59,        // 触发帧数
    "activeRate": 0.983,       // 活跃率
    "activeAvgMs": 0.905       // 活跃均（条件均）
  },
  "subSlicesTopN": [           // 子树下钻 Top 5
    { "name": "ProcessTask_MapEntityAdd", "perFrameAvg": 0.099, "perFrameMax": 3.419, "callsPerFrame": 0.6 }
  ]
}
```

**实现**：
1. 在 `perfetto_provider.py` 加新函数 `_aggregate_module_per_frame(tp, parent_slice_name)`，按 PlayerLoop 帧聚合
2. 新增"稀疏判定"：`activeRate < 0.8` 标 `sparse=true`，AI 提示展示活跃均
3. 子 slice Top N 用 `slice.parent_id` 关联，按累计 ms 降序

**影响范围**：`summary.aoeHotSlices` schema 变更，老下游需要兼容（短期内可以保留旧字段作为 fallback）。

**预估工时**：2-3 小时

---

### P0-2：主线程 off-CPU 归因 ⭐⭐⭐ 高优先级

**现状**：v4 §4.2 用 SQL 手算"主线程 sleep 时段 × atrace wait slice 时段"的时间重叠。

**目标**：summary 里新增 `offCpuAttribution` 字段：

```json
{
  "totalSleepMs": 420.8,
  "byReason": [
    {
      "reason": "wait_gpu",
      "slicePattern": "URP.WaitForPresent | Gfx.WaitForPresent",
      "overlapMs": 411.7,
      "overlapPct": 0.972
    },
    {
      "reason": "wait_job",
      "slicePattern": "WaitForJob*",
      "overlapMs": 2.1,
      "overlapPct": 0.005
    },
    { "reason": "lua_mtgc", ... },
    { "reason": "other", "overlapMs": 7.0, "overlapPct": 0.017 }
  ],
  "humanSummary": "主线程 sleep 420.8ms 中 97.2% 等 GPU"
}
```

**实现**：
1. SQL 模板：`WITH sleep_segs ... LEFT JOIN wait_slices ON 时间重叠 ...`
2. 内置 5 个 reason 关键字模板（GPU / Job / LuaGC / Coroutines / WaitForTargetFPS）
3. 兜底 `other`

**预估工时**：2 小时

---

### P0-3：worst/median/p95 三线程时间轴 ⭐⭐ 中优先级

**现状**：v4 §4.4 手画 ASCII 时间轴。

**目标**：summary 里 `frameTimelines[]`（已有，但只采主线程；扩展到三线程）：

```json
{
  "frameIndex": 23,
  "label": "worst",
  "durMs": 36.09,
  "threads": {
    "UnityMain": [
      { "state": "Running", "startMs": 0.0, "durMs": 11.43 },
      { "state": "Sleeping", "startMs": 11.43, "durMs": 15.70 },
      { "state": "Running", "startMs": 31.43, "durMs": 4.66 }
    ],
    "RHI": [ ... ],
    "Render": [ ... ]
  },
  "mainAtraceSlices": [ ... ]
}
```

**实现**：扩展 `_extract_frame_timeline()` 加 RHI/Render 两线程 sched 段。AI skill 模板里加"如何画 ASCII 时间轴"的指引。

**预估工时**：3 小时

---

### P0-4：降频算法重写（cluster offline + cpufreq lock 检测）⭐⭐⭐ 高优先级

**现状**：provider 在 thermal_2 上判错 `level=none`（应为 confirmed）。

**目标**：throttling 算法加 3 项新检查：

```python
def _detect_throttling_v2(tp):
    evidence = []
    # 1. CPU 在线检测：高 cpu 号 cluster 无 sched 活动
    sql = "SELECT cpu, COUNT(*) c FROM sched_slice GROUP BY cpu"
    cpu_sched_counts = {r.cpu: r.c for r in tp.query(sql)}
    max_cpu = max(cpu_sched_counts.keys())
    for cpu in range(max_cpu+1):
        if cpu_sched_counts.get(cpu, 0) == 0:
            evidence.append(f"cpu{cpu} 完全无 sched 活动 → cluster_offline")
    # 2. cpufreq 事件密度：某 cpu cpufreq 事件 < 2
    sql2 = "SELECT cpu, COUNT(*) c FROM counter JOIN cpu_counter_track ON ... GROUP BY cpu"
    for r in tp.query(sql2):
        if r.c < 2 and cpu_sched_counts.get(r.cpu, 0) > 0:
            evidence.append(f"cpu{r.cpu} 有 sched 但 cpufreq 事件 < 2 → frequency_locked")
    # 3. 原有 reach% 推测逻辑保留
    ...
    return level, evidence
```

**预估工时**：2 小时

---

### P0-5：`threadsSched` 默认线程清单扩展 ⭐⭐ 中优先级

**现状**：默认只采 UnityMain / UnityGfxRenderS / 2 条 Audio 共 4 条，Thread-103 (RHI)、Job Worker、Lua MtGC 全漏掉。导致 v3 §5.1 写 n/a。

**目标**：

```python
def _gather_threads_sched(tp):
    # 策略：采 game pid 下所有 run_ms > 1ms 的线程
    sql = """
    SELECT thread.name, thread.tid, ...
    FROM thread_state JOIN thread JOIN process
    WHERE process.pid = (SELECT pid FROM ...game pid logic...)
    GROUP BY thread.utid HAVING run_ms > 1
    """
    # 另维护一个"已知身份"映射（按 atrace slice 内容判定）
    identity_map = _infer_thread_identity(tp)  # 见 P0-6
    ...
```

**预估工时**：1.5 小时

---

### P0-6：线程身份地图自动推断 ⭐⭐ 中优先级

**现状**：每次 trace 都要手动核实 Thread-10X 是 RHI 还是普通 Worker（comm 数字会变）。

**目标**：summary 里 `threadIdentityMap`：

```json
{
  "29457": { "role": "UnityMain", "comm": "UnityMain", "evidence": "has PlayerLoop slice" },
  "29949": { "role": "RHI", "comm": "Thread-103", "evidence": "has eglSwapBuffers + queueBuffer" },
  "29950": { "role": "Render", "comm": "UnityGfxRenderS", "evidence": "has Gfx.RenderSlaver.ThreadRun" },
  "30214": { "role": "LuaMtGc", "comm": "UnityMain", "evidence": "has LuaMtGc.ExecuteMtGc (same-name trap)" },
  "29935": { "role": "ECSWorker", "comm": "Thread-130", "evidence": "no atrace slices + name=Thread-NNN + child of game pid" },
  ...
}
```

**判定规则**（写进 provider）：

| 角色 | 判定逻辑 |
|---|---|
| UnityMain | `comm=UnityMain AND has PlayerLoop slice` |
| RHI | `has eglSwapBuffers OR queueBuffer OR Gfx.PresentFrame` |
| Render | `has Gfx.RenderSlaver.ThreadRun` |
| LuaMtGc | `has LuaMtGc.ExecuteMtGc` |
| ECSWorker | `comm LIKE 'Thread-%' AND no atrace slices AND child of game pid` |

**预估工时**：2 小时

---

## §2 P1 阶段：skill.md 报告模板升级

**目标**：把 v4 报告骨架固化进 skill.md，让 AI 看到 summary 直接产出 v4 质量的报告。

### P1-1：章节顺序固化"特色前置"

`skill.md` "Output Format" 章节按 v4 骨架重写：

```
§0 结论先行（三段式：瓶颈类型 / 业务红线 / 降频）
§1 采集质量异常 + 数据口径声明（含 p50/p95 / ms/帧 / 活跃率 通俗解释，第一次出现处必备）
§2 元信息
§3 线程身份地图（从 summary.threadIdentityMap 直接渲染）
§4 [特色] 主线程 off-CPU 归因（从 summary.offCpuAttribution 渲染，含因果链 + worst frame 时间轴）
§5 [特色] 降频时序证据链（多 trace 时来自 §3 多 trace 流水线，单 trace 时只渲染当次）
§6 主线程一帧时间去向（缩进树 + 重点热点子树下钻）
§7 渲染链路 + GPU bound 判定
§8 与 simpleperf v4 趋势对照（如有同次采集）
§9 本源能力边界
```

**预估工时**：1 小时

---

### P1-2：硬规则约束（防止 AI 再用错口径）

在 skill.md 的 "Output Quality Rules" 加：

```
- 所有跨次对比的 Δ% 必须基于 ms/帧 算，禁止用累计 ms 算（因为不同次 trace 时长/帧数不同）
- 业务模块 ms 必须按 PlayerLoop 帧聚合（avgMs/帧 + maxMs/帧），不能直接用 aoeHotSlices.avgMs
- 稀疏模块（activeRate < 0.8）必须额外给活跃率 + 活跃均
- 线程列只写正式名（UnityMain / RHI / Render / Lua MtGC / ECS Worker），不加括号备注
- p50/p95/p99 第一次出现时必须给通俗解释（"队伍排队"模型 + 游戏感受映射）
```

**预估工时**：0.5 小时

---

### P1-3：报告骨架样例（一份 mock v4，把每节示例固化）

把 v4 报告本身作为 skill.md 的"OUTPUT EXAMPLE"段，AI 模仿这个出报告。

**预估工时**：0.5 小时（链接即可）

---

## §3 P2 阶段：多 trace 流水线

**目标**：处理 v4 报告 §5 那种"base + cur + thermal_1 + thermal_2 四份 trace 时序对比"自动化。

### P2-1：新工具 `compare_throttling_timeseries.py`

```bash
python compare_throttling_timeseries.py \
  --trace base.pftrace=cur.pftrace=thermal_1.pftrace=thermal_2.pftrace \
  --labels base=cur=thermal_1=thermal_2 \
  --out output/throttling-timeseries.json
```

产出：

```json
{
  "timeline": [
    { "label": "base", "ts": "21:56", "freq": {...}, "main_run_pct": 83.07, "playerloop_avg": 17.5, ... },
    { "label": "cur", "ts": "10:10", ... },
    { "label": "thermal_1", "ts": "10:24", ... },
    { "label": "thermal_2", "ts": "10:34", ... }
  ],
  "verdict": "confirmed_by_inference",
  "evidence": ["thermal_2 cpu7 完全下线", "thermal_2 cpu4-6 cpufreq 锁频", ...]
}
```

AI 读这个直接生成 v4 §5 那张紧凑表。

**预估工时**：3 小时

---

### P2-2：业务模块跨 trace 横向对比

同样多 trace 输入，输出每个模块在多次采集上的 ms/帧 时序。AI 自动判定"业务真涨 vs 降频导致"。

**预估工时**：2 小时

---

## §4 P3 阶段：质量自检 + 边界

### P3-1：采集质量自检

`build_perfetto_profile.py` 检测：

- 如果 `trace_bounds.duration_s < 配置 -t * 0.9`，发警告（"buffer 不足，可能 ring overwrite，建议 -b 512mb"）
- 如果 `actual_frame_timeline_slice` 表为空，警告（"缺 FrameTimeline，VSync miss 无法量化"）
- 如果 `gpu_counter` 计数器为空，警告（"无 GPU counter，GPU bound 只能间接判定"）

**预估工时**：0.5 小时

---

### P3-2：callTree 自适应剪枝

**现状**：thermal_2 上 UnityMain callTree 被剪枝丢失（PlayerLoop 极慢导致 slice 数异常）。

**目标**：剪枝阈值改为相对帧时长（如 `min_pct_of_frame_avg = 0.1`），而非绝对 PlayerLoop 占比。

**预估工时**：1 小时

---

## §5 优先级与执行顺序

按"先有数据再有报告"原则：

```
P0 阶段（数据层）  ←  必须先做完，AI 才能直接出 v4 质量报告
├─ P0-1 aoeHotSlices 重做 ⭐⭐⭐  (2-3h)
├─ P0-2 off-CPU 归因 ⭐⭐⭐         (2h)
├─ P0-4 降频算法重写 ⭐⭐⭐        (2h)
├─ P0-5 threadsSched 扩展 ⭐⭐    (1.5h)
├─ P0-6 线程身份推断 ⭐⭐         (2h)
└─ P0-3 三线程时间轴 ⭐⭐          (3h)
                                  ≈ 13h 工时

P1 阶段（报告层）  ←  P0 完成后做
├─ P1-1 章节顺序固化              (1h)
├─ P1-2 硬规则约束                (0.5h)
└─ P1-3 报告样例                  (0.5h)
                                  ≈ 2h 工时

P2 阶段（多 trace 流水线）  ←  独立模块，可与 P0/P1 并行
├─ P2-1 throttling 时序工具       (3h)
└─ P2-2 业务模块跨 trace 对比     (2h)
                                  ≈ 5h 工时

P3 阶段（质量边界）  ←  低优先级
├─ P3-1 采集质量自检              (0.5h)
└─ P3-2 callTree 自适应剪枝       (1h)
                                  ≈ 1.5h 工时
─────────────────────────────────────
                          总计 ≈ 21.5h
```

按现有迭代节奏（每周 1-2 个 P0 项），3-4 周可完成。完成后效果：

- **下次拿到新 .pftrace**，跑一遍 skill 直接产出 v4 质量的报告
- **下次多份 trace 时序对比**，跑 P2-1 工具一秒出表
- **下次降频场景**，provider 自动判 confirmed_by_inference，无需 AI 手动绕开 bug

---

## §6 维护与演进

### 6.1 v4 报告本身作为 ground truth

`docs/report/performance-report_perfetto_ULTIMATE_v4.md` 是这套流水线的目标产物——每次 P0 做完一项，跑一次新数据，对比 v4 看是否能复现。

### 6.2 新增能力的沉淀流程

```
新场景 / 新能力出现
   ↓
人工 SQL 手算（探索能力边界）
   ↓
固化到本路线图（如本文档结构）
   ↓
按优先级 P0/P1/P2/P3 排期
   ↓
provider 改造（出数据） → skill 改造（出报告）
   ↓
v4+1 报告作为新 ground truth
```

### 6.3 反向不要做的事

- 不要把"v4 报告里 AI 临场发挥的解读"硬编码进 provider（保留 AI 的解读弹性）
- 不要把多 trace 流水线塞进 single trace skill（保持流水线和 skill 解耦）
- 不要为了兼容旧 summary schema 强行不破坏（直接 schemaVersion 升级，老报告作为历史归档）

---

> v4 报告 + 本工程化路线图 = perfetto 单源性能分析方法论的完整闭环（数据+报告+流水线）。
