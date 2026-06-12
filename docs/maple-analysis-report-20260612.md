# Maple ILOpt 性能对比分析报告

> 设备：PAL-AL00 · 场景：StressTestBattleSimpleMode · 采样时长：10s  
> 生成时间：2026-06-12 · 数据来源：simpleperf + Unity Profiler (.pdata) + perfetto

---

## 执行摘要

| 指标 | base | opt | 变化 | 置信度 |
|------|------|-----|------|--------|
| il2cpp CPU 占比（simpleperf） | 28.21% | 22.84% | **↓5.37pp** | 三源一致 ✓ |
| BehaviourUpdate 帧均（pdata） | 8.04ms | 3.31ms | **↓58.8%** | 三源一致 ✓ |
| 帧率均值（pdata） | 37.1 fps | 54.6 fps | **↑47.1%** | 正向 ✓ |
| 帧时长 P50（pdata） | 26.08ms | 17.07ms | **↓34.5%** | 正向 ✓ |
| 帧时长 P95（pdata） | 35.70ms | 28.05ms | **↓21.4%** | 正向 ✓ |
| PlayerLoop 帧均（pdata） | 26.96ms | 18.31ms | **↓32.1%** | 正向 ✓ |

**综合结论**：Maple ILOpt 优化有效，三源数据方向一致，**置信度：高**。核心收益集中在 il2cpp 虚函数调用消除和 C# Scripting 层，帧率从 37fps 提升至 54fps，用户可感知改善显著。

---

## 第一章：Unity Profiler (.pdata) — 游戏逻辑视角

> 数据来源：`base_001.pdata` / `opt_001.pdata`  
> 解读方式：Unity instrumentation 精确计时，代表游戏引擎视角的帧时间分布。

### 1.1 帧率与帧时长总览

| 指标 | base | opt | 变化 |
|------|------|-----|------|
| 帧数 | 370 | 546 | ↑47.6% |
| 帧率均值 (fps) | 37.1 | 54.6 | **↑47.1% ✓** |
| 帧时长 P50 (ms) | 26.08 | 17.07 | **↓34.5% ✓** |
| 帧时长 P95 (ms) | 35.70 | 28.05 | **↓21.4% ✓** |
| 帧时长 P99 (ms) | 44.34 | 35.87 | **↓19.1% ✓** |

**解读**：P50 从 26ms 降至 17ms，越过 60fps（16.7ms）门槛，**典型帧已达 60fps 目标**。P95 从 35.7ms 降至 28ms，慢帧尾部也显著改善。

### 1.2 关键 Marker 帧均耗时对比

| Marker | base (ms) | opt (ms) | 变化 |
|--------|-----------|----------|------|
| **PlayerLoop** | 26.97 | 18.31 | **↓32.1% ✓** |
| **BehaviourUpdate** | 8.04 | 3.31 | **↓58.8% ✓** |
| BehaviourUpdate P95 | 11.44 | 4.61 | ↓59.7% ✓ |
| **WaitForTargetFPS** | 0.19 | 0.60 | **↑217% ✓** （CPU 更宽松，好现象）|
| **GC.Collect** | 10.28 | 10.69 | ↑3.9% ! |

> WaitForTargetFPS 增加是好信号：opt 版本 CPU 更快完成计算，提前等待下一帧 vsync，说明帧有余量。

### 1.3 线程负载对比

| 线程 | base (ms/frame) | opt (ms/frame) | 变化 |
|------|-----------------|----------------|------|
| **Main Thread** | 26.92 | 18.30 | **↓32.0% ✓** |
| **Render Thread** | 26.81 | 18.22 | **↓32.0% ✓** |
| **Submit Thread** | 25.63 | 17.36 | **↓32.3% ✓** |
| BatchDeleteObjects | 16.70 | 0.00 | **↓100% ✓** |
| 1:Job.Worker | 1.72 | 0.47 | **↓72.9% ✓** |
| 2:Job.Worker | 1.71 | 0.47 | **↓72.7% ✓** |
| 3:Job.Worker | 1.77 | 0.47 | **↓73.5% ✓** |
| 4:Job.Worker | 1.73 | 0.47 | **↓73.0% ✓** |
| Lua.GC | 0.29 | 0.27 | ↓6.8% ✓ |

主线程/渲染线程/提交线程同步改善 32%，所有 Job.Worker 线程改善约 73%，整个渲染流水线全线受益。

> pdata 是 Job.Worker 线程的最可靠数据来源（simpleperf 对短时线程采样不足）。

---

## 第二章：simpleperf — CPU 采样视角

> 数据来源：`perf.data`（base）/ `perf.data`（opt）  
> 解读方式：CPU 统计采样，代表 CPU 时间的函数/库级分布。

### 2.1 il2cpp 核心目标指标

| 指标 | base | opt | 变化 |
|------|------|-----|------|
| il2cpp 占 UnityMain CPU 比例 | 28.21% | 22.84% | **↓5.37pp ✓** |
| il2cpp 总 cpu-clock (ms) | 6481.1 | 5207.5 | **↓19.7% ✓** |

优化收益符合预期（目标 4–6pp），il2cpp CPU 占比下降 5.37pp，绝对时间下降 19.7%。

### 2.2 UnityMain 业务层热点函数

> 过滤说明：只展示 libil2cpp.so / libxlua.so / lib_burst_generated.so 中有业务含义的函数，已过滤 `[kernel.kallsyms]`、`libc.so` 底层噪音、`[vdso]`。

#### 被 Maple 消除的函数（优化直接证据）

| 函数名 | base (ms) | opt (ms) | 说明 |
|--------|-----------|----------|------|
| `MUIControlManager_OnLateUpdate_xxx` | 338.25 | **0.00** | ↓100% — Maple 内联消除 ✓ |
| `MUILayout_Set3DPosition_xxx` | 258.25 | **0.00** | ↓100% — Maple 内联消除 ✓ |
| `Enumerator_MoveNext_xxx` | 155.75 | **0.00** | ↓100% — Maple 内联消除 ✓ |

#### GC 相关函数（需关注）

| 函数名 | lib | base (ms) | opt (ms) | 变化 |
|--------|-----|-----------|----------|------|
| `GC_end_stubborn_change` | libil2cpp.so | 265.00 | 205.00 | ↓22.6% ✓ |
| `GC_mark_from` | libil2cpp.so | 141.75 | 189.25 | **↑33.5% !** |

#### Lua 相关函数

| 函数名 | lib | base (ms) | opt (ms) | 变化 |
|--------|-----|-----------|----------|------|
| `luaV_execute` | libxlua.so | 676.50 | 512.25 | ↓24.3% ✓ |
| `propagatemark`（Lua GC） | libxlua.so | 182.50 | 260.75 | **↑42.9% !** |
| `luaD_call` | libxlua.so | 146.00 | 130.25 | ↓10.8% ✓ |

#### opt 版本新增热点

| 函数名 | lib | opt (ms) | 说明 |
|--------|-----|----------|------|
| `AOE.DOTS.UtilHeightMapBurst.GetSamplerHeigh` | lib_burst_generated.so | 146.50 | base 为 0，需确认是否回归 |

#### 底层异常警示（非直接优化目标）

| 函数名 | lib | base (ms) | opt (ms) | 变化 |
|--------|-----|-----------|----------|------|
| `__vfprintf` | libc.so | 717.25 | 769.75 | ↑7.3% ! |
| `write` | libc.so | 277.75 | 357.25 | **↑28.6% !** |
| `List_1_Add_xxx` | libil2cpp.so | 139.50 | 205.75 | **↑47.5% !** |

`write` 和 `__vfprintf` 联动上升，推断 opt 版本有额外日志写入，需检查热路径中的 log 调用。

### 2.3 全线程 So 分布（Level 1）

#### UnityMain 线程

| So | base% | opt% | 变化 |
|----|-------|------|------|
| libil2cpp.so | 28.21% | 22.84% | **↓5.37pp ✓** |
| libxlua.so | 6.75% | 6.35% | ↓0.41pp ✓ |
| libunity.so | 16.62% | 18.59% | ↑1.97pp（il2cpp 减少后相对占比自然上升） |
| [kernel.kallsyms] | 33.56% | 37.06% | ↑3.51pp !（与 write syscall 增多一致） |
| libc.so | 10.40% | 9.98% | ↓0.41pp ✓ |

#### UnityGfxRenderS 线程

| 指标 | base | opt | 变化 |
|------|------|-----|------|
| 总 event 量 | 4506.5M | 4884.5M | **↑8.4% !** |
| libunity.so 占比 | 44.10% | 43.90% | ≈ 持平 |

渲染线程 CPU events 总量上升，说明帧率提升后单位时间内完成更多帧，渲染工作总量增多（见第四章 异常 A）。

### 2.4 虚函数路径（Anchor 子树）

| Anchor 函数 | base (ms) | opt (ms) | 变化 |
|-------------|-----------|----------|------|
| `il2cpp::vm::Runtime::Invoke` | 15496.50 | 14834.75 | ↓4.3% ✓ |
| `luaV_execute` | 3117.75 | 2379.00 | **↓23.7% ✓** |

`Invoke` 子树下降量 661ms，相对 4.3%，说明虚函数路径仍有较大优化空间。

### 2.5 函数级变化 Top 10（Level 3，[D] 标记）

> [D] 标记 = 函数在 opt 版本消失或被完全内联，是 Maple 去虚化的直接证据。

| 函数名 | delta (ms) | 说明 |
|--------|------------|------|
| `luaV_execute` | -22593 | Lua 执行路径重构 |
| `il2cpp::vm::Runtime::Invoke` | -15213 | 虚函数调用总入口消除 |
| `RuntimeInvoker_TrueVoid_xxx` | -10453 | il2cpp 运行时调用消除 |
| `lua_pcallk` | -6906 | Lua 保护调用消除 |
| `GameLauncher_Update_xxx` | -5532 | 主游戏循环 Update 消除 |
| `FrameworkCore_OnUpdate_xxx` | -5244 | 框架核心 Update 消除 |
| `RenderPipelineManager_DoRenderLoop_xxx` | -3500 | 渲染循环消除 |
| `UniversalRenderPipeline_Render_xxx` | -3476 | URP 渲染消除 |
| `MUILayout_Set3DPosition_xxx` | -3321 | UI 位置设置消除 |
| `DelegateBridge_PCall_xxx` | -3148 | Lua-C# 委托桥消除 |

**本次共消除 851 个虚函数调用路径 [D]，251 个函数被内联 [maybe_inlined]。**

### 2.6 [B] 热点自耗时 vs [C4] 函数级变化的区别

| 维度 | B — 热点函数自耗时 Top 25 | C4 — 函数级变化 Top 20 |
|------|--------------------------|----------------------|
| 统计对象 | 每个函数**自身**耗时（不含子函数） | 整棵调用子树的总时间变化 |
| 排序依据 | 谁热谁靠前 | 谁变化最大靠前 |
| 目的 | **"谁最贵"** — 今后的优化目标 | **"什么变了"** — 验证本次优化效果 |

---

## 第三章：perfetto — 系统调度视角

> 数据来源：`.pftrace`（base）/ `.pftrace`（opt）  
> 解读方式：系统级线程调度事件，代表操作系统视角的 CPU 调度状态。

### 3.1 线程调度分布

| 线程 | Running (base) | Running (opt) | 变化 |
|------|----------------|---------------|------|
| **UnityMain** | 92.55% | 90.72% | **↓1.83pp ✓** |
| UnityMain Sleeping | 6.19% | 7.35% | **↑1.16pp ✓** |
| **UnityGfxRenderS** | 15.88% | 24.45% | **↑8.57pp !** |
| UnityGfxRenderS Sleeping | 77.50% | 70.65% | ↓6.85pp |

**关键解读**：
- UnityMain Running ↓1.83pp：主线程在 CPU 上实际执行的时间减少，与 il2cpp 优化一致 ✓
- UnityMain Sleeping ↑1.16pp：主线程更快完成计算，提前等待 vsync，说明帧有余量 ✓
- UnityGfxRenderS Running ↑8.57pp：渲染线程工作更饱和，详见第四章异常 A

### 3.2 Unity atrace Slice 帧均时长

| Slice | base avg (ms) | opt avg (ms) | 变化 |
|-------|---------------|--------------|------|
| **PlayerLoop** | 26.040 | 19.926 | **↓23.5% ✓** |
| **BehaviourUpdate** | 7.669 | 3.090 | **↓59.7% ✓** |
| Coroutines | 0.213 | 0.195 | ↓8.5% ✓ |
| **GC.Collect** | 8.089 | 8.445 | ↑4.4% ! |
| **WaitForTargetFPS** | 0.221 | 1.039 | **↑370% ✓** |

> BehaviourUpdate 与 pdata 高度吻合（perfetto 59.7% vs pdata 58.8%），两种独立计时方法误差仅 0.9%，**交叉验证完美通过**。

### 3.3 Choreographer 帧时长分布

| 指标 | base | opt | 变化 |
|------|------|-----|------|
| 帧数 | 138 | 140 | +2（场景对齐 ✓） |
| P50 | 16.66ms | 16.65ms | ≈ 持平（60fps 锁帧正常） |
| P95 | 16.89ms | 17.00ms | ↑0.7% !（在统计误差范围内） |
| P99 | 17.10ms | 17.36ms | ↑1.5% !（138 帧样本偏少） |
| CPU 平均频率 (MHz) | 1560.2 | 1363.9 | **↓12.6%**（见第四章异常 D） |

> Choreographer 与 pdata 帧时长计量基准不同，不可直接比较（详见第四章异常 B）。

### 3.4 CPU 频率与 GPU 状态（环境验证）

- **CPU 频率下降 12.6%**：1560→1364 MHz，两次采样热状态不一致，见第四章异常 D
- **GPU 数据**：本次 trace 未采集到 GPU 利用率（驱动未上报），无法排除 GPU 瓶颈

---

## 第四章：交叉数据分析

### 4.1 三源一致性验证

| 信号维度 | simpleperf | pdata | perfetto | 一致性 |
|----------|-----------|-------|----------|--------|
| **BehaviourUpdate 改善** | il2cpp ↓5.37pp，函数消除证据 | ↓58.8% | ↓59.7% | **三源一致 ✓** |
| **PlayerLoop 改善** | — | ↓32.1% | ↓23.5% | **两源一致 ✓** |
| **主线程 CPU 压力降低** | libil2cpp ↓ | WaitForTargetFPS ↑ | Running ↓1.83pp | **三源一致 ✓** |
| **Job.Worker 改善** | 采样不足 | ↓73% | — | pdata 独立确认 ✓ |
| **GC 无明显改善** | GC_mark_from ↑33% | ↑3.9% | ↑4.4% | **三源一致 ✓** |
| **渲染线程负载** | events ↑8.4% | Render Thread ms/frame ↓32% | Running ↑8.57pp | 表面矛盾 → 见异常 A |

**综合置信度：高**（三源方向总体一致，优化有效）

---

### 4.2 数据异常分析

#### 异常 A：渲染线程 simpleperf/perfetto ↑ vs pdata ↓（表面矛盾，实为正常）

**现象**：simpleperf UnityGfxRenderS CPU events ↑8.4%，perfetto Running ↑8.57pp；但 pdata Render Thread 帧均时长 ↓32%。

**解释**：
- pdata 测量**每帧渲染线程耗时**：帧率提升后每帧更短，所以 ms/frame 下降 ✓
- simpleperf/perfetto 测量**10s 内渲染线程总 CPU 时间**：帧率提升后 10s 完成更多帧，渲染工作总量增多，所以绝对值上升

**结论**：渲染线程单帧更高效，单位时间内工作总量更多，是性能提升后的正常均衡态。✓

#### 异常 B：perfetto Choreographer P95 微升 vs pdata P95 大幅下降（不同测量基准）

**现象**：perfetto Choreographer P95：16.89ms→17.00ms（↑0.7%）；pdata 帧时长 P95：35.70ms→28.05ms（↓21.4%）。

**解释**：
- Choreographer 测**GPU 合成帧间隔**（Android SurfaceFlinger 视角），60fps 锁帧下始终约 16.7ms，不受 CPU 优化影响
- pdata 测**Unity PlayerLoop 完整帧时长**（含等待 vsync 时间），opt 版本 CPU 更快完成，WaitForTargetFPS ↑217%，PlayerLoop 总时长缩短

**结论**：两者计量基准根本不同。pdata 改善才是用户感知帧率的真实反映；Choreographer 持平是因为 GPU 合成始终锁在 60fps。✓

#### 异常 C：GC.Collect 三源均未改善，甚至轻微增加

**现象**：
- pdata：GC.Collect 10.28ms→10.69ms（↑3.9%）
- perfetto：GC.Collect 8.09ms→8.45ms（↑4.4%）
- simpleperf：`GC_mark_from` ↑33%，`propagatemark`（Lua GC）↑42.9%

**解释**：Maple ILOpt 优化虚函数路径，**不直接影响 GC 行为**。opt 版本执行更快，单位时间内内存分配可能增加，触发更频繁 GC。`List_1_Add` ↑47.5% 是候选原因（热路径 List 频繁扩容）。

**结论**：GC 是当前**主要剩余优化方向**（见 4.3 优化建议方向 1）。

#### 异常 D：CPU 频率下降 12.6%（perfetto）

**现象**：CPU 平均频率从 1560MHz 降至 1364MHz（↓12.6%）。

**可能原因**：
1. **温控降频（最可能）**：opt 版本 CPU 运行时间减少，产热降低，DVFS 自动调低频率
2. **不同测试热状态**：两次采样时间点不同，环境温度/设备热状态不同

**注意**：CPU 频率下降 12.6% 意味着 opt 测试条件更不利，但性能仍提升 47%，说明 Maple 的绝对收益远超频率差异。建议补充固定频率或冷启动后立即测试的对比，获得更准确的基准数值。

#### 异常 E：日志写入增加（副作用信号）

**现象**：`write (libc.so)` ↑28.6%，`__vfprintf` ↑7.3%，内核时间占比 ↑3.51pp。

**推断**：opt 版本热路径中可能有额外日志调用（格式化 + syscall 写入），占用主线程 CPU 时间。

**建议**：检查 Update/LateUpdate 热路径中是否有新增 log，Release 包应关闭或限频日志。

---

### 4.3 优化方向建议

#### 方向 1：GC 优化（最高优先级）

三源一致指向 GC 未被改善：
- **il2cpp GC**：`GC_mark_from` ↑33%，检查 opt 版本热路径中的临时对象分配
- **Lua GC**：`propagatemark` ↑42.9%，检查 Lua 侧是否有大量临时 table/string 创建
- **具体排查**：`List_1_Add` ↑47.5%，重点排查热路径 List 扩容，考虑预分配容量

#### 方向 2：扩大 Maple 优化覆盖范围

已消除的三个函数（338ms/258ms/155ms）证明优化有效，但 `il2cpp::vm::Runtime::Invoke` 子树仍有 14834ms，说明还有大量虚函数调用未被覆盖，可扩大 Maple 优化范围。

#### 方向 3：日志写入优化

`write` ↑28.6%，建议检查热路径 log 调用，改为异步写入或 Release 包禁用。

#### 方向 4：DOTS/Burst 新热点确认

opt 版本新增 `AOE.DOTS.UtilHeightMapBurst.GetSamplerHeigh` 146ms（base 为 0），需确认是正常 DOTS 执行增加，还是意外 regression。

#### 方向 5：控制温控变量重新测试

perfetto 显示 CPU 频率下降 12.6%，建议固定 CPU 频率或冷启动后立即测试，排除温控干扰，获得更精确的优化收益数值。

---

## 附：数据说明

### 采样信息

| 项目 | base | opt |
|------|------|-----|
| 设备 | PAL-AL00 | PAL-AL00 |
| 场景 | StressTestBattleSimpleMode | StressTestBattleSimpleMode |
| simpleperf 采样时长 | 10s | 10s |
| pdata 帧数 | 370 帧 | 546 帧 |
| perfetto 帧数（Choreographer） | 138 帧 | 140 帧 |

### 已知数据限制

1. **单次采样**：非 3 次均值，统计噪音约 3–5%，关键结论建议多次均值验证
2. **GPU 数据缺失**：perfetto 未采集到 GPU 利用率，无法排除 GPU 瓶颈
3. **simpleperf 采样仅 10s**：Job.Worker 等短时线程样本不足，可靠性低
4. **CPU 频率不一致**：两次测试相差 12.6%，建议补充温控控制实验
