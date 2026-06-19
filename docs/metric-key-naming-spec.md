# 指标袋 Key 命名规范 (草案 v1)

> 日期: 2026-06-17 · 阶段: P0 (定稿后供 P1 Provider 落地)
>
> 定稿需求 §14 列为"待定"的 core 指标袋 key 命名规范。落地于 `core.metrics[]` 的 `Metric.key`
> 与 `run_metrics.key`。**所有 Provider 必须按本规范写 key**, 否则趋势/列表/跨源对比会对不上号。
>
> 依据: [`analysis-framework-design.md`](./analysis-framework-design.md) §5.1、[`performance-platform-requirements-v2.md`](./performance-platform-requirements-v2.md) §11/§14。

---

## 1. 总原则

1. **key 唯一标识一个"绝对值指标"**, 与来源 (`Metric.source`) 一起构成一条指标袋记录。
2. **只存绝对值, 不存 diff**。`delta` / `deltaPct` / `pp` 是对比层 (Layer 3) 现算的, 不进 core。
3. **用例透明**: key 里**禁止**出现用例/优化名 (无 `maple`、无 `il2cppDelta`、无"预期下降")。只描述"测到了什么", 不描述"希望它变成什么"。
4. **`unit` 字段是单位的唯一真相**; key 里的单位后缀只是给人看的提示, 必须与 `unit` 一致。
5. 同一物理量, 三个源各写各的记录 (靠 `source` 区分), **key 可以相同** (如 `frame.p95Ms` 既有 unity_profiler 也有 perfetto 的), 由 `source` + 帧口径区分。

---

## 2. 语法

```
key := segment ( "." segment )*
```

- **分隔符**: `.`(点)。
- **类目段** (固定词表): 全小写, 如 `cpu` / `frame` / `marker` / `thread` / `system` / `gc` / `jank` / `spike` / `pmu`。
- **实体段** (动态名, 如 .so 名 / 函数名 / 线程名 / marker 名): **原样保留大小写** (便于与原始数据双向对应), 如 `libil2cpp` / `UnityMain` / `BehaviourUpdate`。实体名中若含 `.`,用下划线 `_` 替换避免歧义。
- **度量叶子段**: lowerCamelCase, 末尾带单位提示, 见 §3。

---

## 3. 单位与叶子后缀约定

| `unit` 值 | 含义 | 叶子后缀示例 |
|---|---|---|
| `ms` | 毫秒 | `p95Ms` / `avgMs` / `msPerFrame` |
| `%` | 百分比 (占比) | `pct` / `runningPct` / `busyPct` / `rate` |
| `mhz` | 频率 | `cpuFreqAvgMhz` |
| `count` | 次数/个数 | `count` / `allocCount` |
| `bytes` | 字节 | `allocBytes` |
| `mb` | 兆字节 | `pssMb` |
| `fps` | 帧率 | `fps` |
| `pp` | 百分点 | (仅对比层产物, **不入 core**) |

> 比率类既可用 `pct`(单位 `%`) 也可用裸 `rate`(单位 `%`); 约定: **占某总量的份额**用 `Pct`/`pct`,**事件发生比例**(如慢帧率、jank 率)用 `rate`。

---

## 4. 命名空间词表 (类目段)

| 命名空间 | 含义 | 主要来源 | 示例 key |
|---|---|---|---|
| `frame.*` | 帧时长/帧率 (口径由 source + FrameStat 标注) | unity_profiler / perfetto | `frame.p50Ms` `frame.p95Ms` `frame.p99Ms` `frame.avgMs` `frame.maxMs` `frame.fps` `frame.slowRate33Ms` `frame.slowRate50Ms` |
| `marker.<name>.*` | Unity marker 帧均耗时 (marker 名含 `.` 时改 `_`) | unity_profiler / perfetto(atrace) | `marker.BehaviourUpdate.msPerFrame` `marker.WaitForTargetFPS.msPerFrame` `marker.Camera_Render.msPerFrame` |
| `cpu.lib.<so>.*` | so 库级 CPU 占比 | simpleperf | `cpu.lib.libil2cpp.pct` `cpu.lib.libunity.pct` `cpu.lib.libxlua.pct` |
| `cpu.func.<func>.*` | 函数级 self CPU 占比 | simpleperf | `cpu.func.<func>.selfPct` |
| `cpu.anchor.<name>.*` | anchor 子树 CPU 占比 | simpleperf | `cpu.anchor.<name>.subtreePct` |
| `cpu.thread.<thread>.*` | 线程 CPU 总量占比 | simpleperf | `cpu.thread.UnityMain.pct` |
| `thread.<name>.*` | 线程调度状态 | perfetto | `thread.UnityMain.runningPct` `thread.UnityMain.runnablePct` `thread.UnityMain.sleepingPct` |
| `system.*` | 系统级状态 | perfetto | `system.cpuFreqAvgMhz` `system.gpuFreqAvgMhz` `system.gpuBusyPct` `system.thermalC` `system.binder.count` `system.binder.avgMs` `system.pssMb` |
| `gc.*` | GC 行为 | unity_profiler | `gc.allocCount` `gc.allocBytes` `gc.collectMsPerFrame` |
| `jank.*` | 卡顿统计 | unity_profiler | `jank.count` `jank.rate` `jank.bigCount` |
| `spike.*` | marker 尖刺统计 | unity_profiler | `spike.count` |
| `pmu.*` | 硬件计数器 (P2 新增) | simpleperf | `pmu.ipc` `pmu.cacheMissRate` |

> 命名空间词表是**封闭可扩展**的: 新增源/新维度时, 优先复用已有命名空间; 确需新类目, 在本表登记后再用 (避免各 Provider 自造)。

---

## 5. 旧硬编码列 → 新 key 对照 (适配器依据)

| 旧列 (表) | 新 key | unit | source |
|---|---|---|---|
| `il2cpp_base_pct` / `il2cpp_opt_pct` (maple_compare_reports) | `cpu.lib.libil2cpp.pct` | `%` | simpleperf |
| `il2cpp_delta_pp` | (对比层现算, **不入 core**) | `pp` | — |
| `avg_frame_ms` (maple_pdata_results) | `frame.avgMs` | `ms` | unity_profiler |
| `p50/p95/p99/max_frame_ms` | `frame.p50Ms` / `p95Ms` / `p99Ms` / `maxMs` | `ms` | unity_profiler |
| `scripting_ms` | `marker.BehaviourUpdate.msPerFrame` | `ms` | unity_profiler |
| `wait_for_target_fps_ms` | `marker.WaitForTargetFPS.msPerFrame` | `ms` | unity_profiler |
| `rendering_ms` | `marker.Camera_Render.msPerFrame` | `ms` | unity_profiler |
| `physics_ms` | `marker.Physics_Processing.msPerFrame` | `ms` | unity_profiler |
| `gc_alloc_count` / `gc_alloc_bytes` | `gc.allocCount` / `gc.allocBytes` | `count` / `bytes` | unity_profiler |
| `slow_frames_33_rate` / `slow_frames_50_*` | `frame.slowRate33Ms` / `frame.slowRate50Ms` | `%` | unity_profiler |
| `main_thread_running/runnable/sleeping_pct` (maple_perfetto_results) | `thread.UnityMain.runningPct` / `runnablePct` / `sleepingPct` | `%` | perfetto |
| `cpu_freq_avg_mhz` / `gpu_freq_avg_mhz` | `system.cpuFreqAvgMhz` / `system.gpuFreqAvgMhz` | `mhz` | perfetto |
| `gpu_utilization_pct` | `system.gpuBusyPct` | `%` | perfetto |
| `binder_call_count` / `binder_avg_dur_ms` | `system.binder.count` / `system.binder.avgMs` | `count` / `ms` | perfetto |
| `pss_mb` | `system.pssMb` | `mb` | perfetto |
| `metrics.jank_count/jank_rate/big_jank_count` (旧 sessions metrics) | `jank.count` / `jank.rate` / `jank.bigCount` | `count` / `%` / `count` | unity_profiler |
| `metrics.spike_count` | `spike.count` | `count` | unity_profiler |
| `metrics.fps` | `frame.fps` | `fps` | unity_profiler |

> 适配器 `run-adapter.ts` 已按本表映射 (本次将 `frame.slowRate33` → `frame.slowRate33Ms`、`frame.fps` 单位 `count` → `fps` 对齐)。

---

## 6. 反例 (禁止)

| 反例 | 问题 | 正确写法 |
|---|---|---|
| `il2cppBasePct` | 用例耦合 + 含 base/opt 角色 + 大小写不分段 | `cpu.lib.libil2cpp.pct` |
| `frame.p95.delta` | 在 core 存 diff | core 只存 `frame.p95Ms`,delta 由对比层算 |
| `cpu.lib.libil2cpp.percent` | 单位后缀不统一 | `.pct` (配 unit `%`) |
| `MainThread.running` | 缺命名空间 + 缺单位 | `thread.UnityMain.runningPct` |
| `maple.scripting` | 含 Maple 关键字 | `marker.BehaviourUpdate.msPerFrame` |
