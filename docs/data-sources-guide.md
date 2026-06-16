# Android 通用性能分析 — 多源数据指南

> 版本: v1.1 · 日期: 2026-06-16  
> 本文档说明 Unity Profiler (.pdata)、simpleperf、perfetto 等数据源各自的能力、局限性及互补关系，作为多源性能分析的前置参考。
>
> **定位**：通用 Android 性能分析。具体优化（如某次 IL 去虚化）只是其中**一个用例**，分析框架对用例透明。文中标注"（示例）"的内容仅为举例说明，不代表框架内置任何特定优化的假设。框架层面的单点/对比分析关系与分层设计见 [`analysis-framework-design.md`](./analysis-framework-design.md)。

---

## 目录

1. [整体定位](#1-整体定位)
2. [simpleperf — CPU 采样视角](#2-simpleperf--cpu-采样视角)
3. [Unity Profiler (.pdata) — 游戏逻辑视角](#3-unity-profiler-pdata--游戏逻辑视角)
4. [perfetto — 系统调度视角](#4-perfetto--系统调度视角)
5. [三源互补关系](#5-三源互补关系)
6. [三源数据的局限性与噪音](#6-三源数据的局限性与噪音)
7. [交叉验证规则](#7-交叉验证规则)
8. [时间窗口对齐机制](#8-时间窗口对齐机制)
9. [可扩展数据源（路线图）](#9-可扩展数据源路线图)

---

## 1. 整体定位

三种工具从**不同视角**观察同一次游戏运行，任何单一工具都无法给出完整结论：

| 工具 | 比喻 | 回答的核心问题 |
|------|------|--------------|
| **simpleperf** | 体检仪器 · 显微镜 | **CPU 时间花在哪个函数/库上？** 精确到函数级 CPU cycles |
| **Unity Profiler** | 秒表 · 工程日志 | **每帧各模块花了多少时间？** 精确到 Unity 生命周期阶段 |
| **perfetto** | 监控摄像头 · 调度日志 | **线程被调度了多久？GPU 繁忙吗？系统有没有干扰？** |

**核心原则**：三源方向一致 → 高置信度结论；方向矛盾 → 必须找原因，不能单独下结论。

---

## 2. simpleperf — CPU 采样视角

### 2.1 工作原理

基于 Linux `perf_event_open`，以固定频率（4000Hz）对 CPU 采样，记录当前正在执行的函数调用栈。配合 `binary_cache`（含符号表的未裁剪 `.so`）将地址还原为函数名。

> **采样统计的本质**：每次采样是一次"快照"，采样数越多的函数，说明它被 CPU 执行的概率越高（即 CPU 时间越长）。这是统计估算，不是精确计时。

### 2.2 可提供的数据维度

#### Level 1 — So 库级 CPU 占比（最核心）

| 指标 | 对 Maple 的意义 |
|------|----------------|
| `libil2cpp.so` 在 UnityMain 的占比 % | **Maple 核心收益**，预期下降 4–6pp |
| `libxlua.so` 占比 | 验证 Maple 不影响 Lua 层 |
| `libunity.so` 占比 | 验证 Maple 不影响引擎层 |
| `[kernel.kallsyms]` 占比 | 内核时间，异常增高需关注 |
| 各线程 CPU 总量对比 | 验证优化集中在主线程，还是波及其他线程 |

#### Level 2 — Anchor 子树时间

以某锚点函数为根，统计其**整个调用子树**消耗的 CPU 总时间。

| 关键 Anchor | 预期变化 | 说明 |
|-------------|----------|------|
| `il2cpp::vm::Runtime::Invoke` | ↓ 显著 | 虚函数调用总入口，Maple 去虚化核心路径 |
| `il2cpp::vm::Object::VirtualInvoke` | ↓ 显著 | 虚表查找开销 |
| `luaV_execute` | ≈ 不变 | Lua 执行，验证无副作用 |

#### Level 3 — 函数级 A/M/D Diff

| 标记 | 含义 | 说明 |
|------|------|------|
| `[D]` + delta_ms 大 | 函数消失/被内联消除 | Maple 将虚函数路径内联，原函数"消失"，这是最直接的优化证据 |
| `[M]` + delta_ms < 0 | 函数耗时减少 | 被优化但未完全消除 |
| `[A]` | 新增函数 | 内联展开后产生的新热点路径 |
| `[maybe_inlined]` | self_time ≈ 0，subtree_time 变化大 | 强烈内联信号，本身开销消失，但调用链变化 |

#### 热点函数自耗时（Self Time）

每个函数**自身**消耗的 CPU 时间，不含子函数调用。这是找"当前最贵函数"的直接手段。

**注意过滤层次**：
- **业务层**（`libil2cpp.so` / `libxlua.so` / `lib_burst_generated.so` 中带业务命名的函数）→ **有优化意义**
- **引擎层**（`libunity.so` 中的渲染/物理函数）→ 次要参考
- **底层噪音**（`libc.so` 的 `__vfprintf`/`__memcpy`，`[kernel.kallsyms]` 地址，`[vdso]`）→ **过滤掉，对业务无直接优化意义**

### 2.3 simpleperf 的局限性

| 局限 | 说明 |
|------|------|
| **无帧概念** | 不知道一帧花了多少时间，只知道函数占总 CPU 的比例 |
| **无线程状态** | 只知道线程"在执行什么"，不知道线程"在等什么"（等 vsync/等 GPU fence/等锁） |
| **无 GPU 信息** | GPU 时间、GPU 利用率完全看不到 |
| **统计误差** | 采样统计，短时间热点或低频调用可能被漏采 |
| **Job.Worker 采样少** | Unity Job 线程每帧执行时间极短，simpleperf 样本量不足，可靠性低 |
| **符号依赖** | 必须有正确的 `binary_cache`，否则函数名全部显示为十六进制地址 |

### 2.4 simpleperf 与 Unity Profiler 的精确边界（重要）

容易误解的一点：**"找哪个 C# 方法慢" 不是 simpleperf 的独占优势** —— Unity Profiler 本身就能定位到 C# 方法级（开 Deep Profile 给完整托管调用树，或靠 ProfilerMarker 埋点）。所以不要用"看哪个 C# 方法慢"来论证 simpleperf 的必要性。把界限划清：

**Unity Profiler 更强 / 独占的：**
- 精确帧边界 + 每帧每阶段计时（instrumentation，非采样，无统计误差）。
- 引擎语义归属：天然知道这是 Physics / Render / Animation / GC，并给出 Main / Render / Submit / Job.Worker 线程的每帧负载。
- C# 方法级耗时（但需 Deep Profile，开销 2~10x、会扭曲真机帧时，通常不敢在设备上常开）。

**simpleperf 真正独占的（精确表述）：**
1. **托管运行时本身的调用机制开销** —— 虚表派发、icall 跨界、GC write barrier、装箱、元数据/类型初始化。这些发生在 C# 方法"之间"，不归属任何 Marker，**Unity Profiler 看不见也量不出**。（示例：去虚化类优化的收益正落在这一层，因此 simpleperf 是衡量这类优化的金标准——不是因为它能看 C# 方法，而是因为它能看到方法调用机制的开销。）
2. **native / 引擎内部黑盒**：`libunity.so` 渲染/物理/裁剪内部、`libc`、`[kernel.kallsyms]`、脚本 VM 解释器内部。Unity 把 `Camera.Render` 显示成一根条，看不进它内部为什么慢；simpleperf 能下钻到具体 native 函数。
3. **低开销全覆盖采样**：4000Hz 统计采样几乎不扭曲帧时，能看到所有未埋点代码；Deep Profile 要全覆盖就得付出严重计时失真的代价。simpleperf 用"不失真"换 Unity 需要"失真"才能拿到的全景。
4. **全进程统一归因**：把所有 `.so` / 不同语言层放在同一 CPU 占比视图里横向比；Unity Profiler 只看得见 Unity 自己的世界。

> 反直觉补充：IL2CPP 把每个 C# 方法编译成一个带名字的 native 函数（如 `XXX_Update_mNNNN`），所以 **simpleperf 也能给到"C# 方法级"归属，且无需 Deep Profile 的开销**。但它给的是"该方法及其运行时开销的 CPU 周期"，Unity 给的是"该方法的墙钟耗时"——维度不同，互为补充。

> **互补示例（修正版）**：pdata（甚至 Deep Profile）能告诉你 "`MyScript.Update` 这帧很慢"；但要回答 "慢在真实业务逻辑，还是虚函数派发 / GC / 运行时开销" → 只能靠 simpleperf，因为这部分开销对 Unity 的埋点是隐形的。

---

## 3. Unity Profiler (.pdata) — 游戏逻辑视角

### 3.1 工作原理

Unity 引擎在每帧的各生命周期阶段插入计时器（instrumentation），记录 C# Scripting / Physics / Rendering / Animation 等各阶段的**实际耗时**，以帧为单位输出到 `.raw` 文件（离线转换为 `.pdata`）。

> **Instrumentation 的本质**：是精确计时，不是采样。每帧每个 Marker 的起止时间都有精确记录。但只覆盖 Unity 已埋点的阶段。

### 3.2 可提供的数据维度

#### 帧级数据

| 指标 | 说明 |
|------|------|
| `帧时长 P50/P95/P99 (ms)` | 帧时间分布。**P95 是关键**，代表"每 20 帧出现一次的慢帧"体验 |
| `帧率均值 (fps)` | 整体帧率 |
| `慢帧占比（>33ms/>50ms）` | 用户可感知的卡顿比例 |

> **P50/P95/P99 解释**：将所有帧时长从小到大排列，P50 是中位帧（典型体验），P95 是第 95% 位置的帧（偶发慢帧），P99 是极端慢帧。P95 是性能测试的标准指标。

#### Marker 帧均耗时

| 关键 Marker | 对 Maple 的意义 |
|-------------|----------------|
| `BehaviourUpdate` | C# Update 总时间，Maple 优化的直接体现 |
| `WaitForTargetFPS` | CPU 空闲等待时间，**变长说明 CPU 更宽松**（间接指标） |
| `GC.Collect` | GC 时间，Maple 应该不影响，若异常增加需关注 |
| `PlayerLoop` | 一帧总逻辑时间 |
| `Camera.Render` | 渲染提交时间（验证渲染无副作用） |
| `Physics.Processing` | 物理时间（验证物理无副作用） |

#### 线程负载数据

| 线程名 | 说明 |
|--------|------|
| `1:Main Thread` | Unity 主线程总帧时长 |
| `1:Render Thread` | 渲染线程帧时长 |
| `1:Submit Thread` | GPU 提交线程帧时长 |
| `1:Job.Worker` ~ `4:Job.Worker` | Unity Job System 线程帧均负载，**这是 Job 线程分析的最可靠来源** |

### 3.3 pdata 的局限性

| 局限 | 说明 |
|------|------|
| **只覆盖 Unity 埋点** | 看不到 native 代码（C++ 底层）的内部细节 |
| **无 CPU 频率信息** | 不知道 CPU 是否降频干扰了结果 |
| **无 GPU 信息** | 渲染时间包含 CPU 等待 GPU 的时间，无法区分 |
| **帧数越多越可靠** | 帧数少时 P95/P99 不稳定，建议至少 300 帧以上 |

---

## 4. perfetto — 系统调度视角

### 4.1 工作原理

通过 Linux `ftrace`（内核追踪框架）+ `atrace`（Android 应用层 marker）+ GPU 计数器，记录系统中**所有线程的调度切换事件**和**硬件计数器**，生成完整时间轴。

> **系统调度的本质**：记录每次"线程上/下 CPU"的精确时刻。能区分"线程在运行"、"线程想运行但没有 CPU 资源（被抢占）"、"线程主动等待（vsync/锁/GPU fence）"。

### 4.2 可提供的数据维度

#### 线程调度状态（Running / Runnable / Sleeping）

| 状态 | 含义 | 对 Maple 的意义 |
|------|------|----------------|
| `Running` | 线程正在 CPU 上执行 | Maple 后主线程应下降（执行时间变少） |
| `Runnable` | 线程想运行但被其他线程抢占 | 反映 CPU 竞争强度 |
| `Sleeping` | 线程主动等待（vsync/GPU fence/锁） | Maple 后应增加（更快完成，提前等 vsync） |

> **UnityGfxRenderS 的 Running 时间增加** 不一定是回归。主线程压力降低后，渲染线程有了更多工作可做，是瓶颈从主线程向渲染线程正常转移。

#### Unity atrace Slice 帧均时长

通过 `android.os.Trace.beginSection()` 写入的命名区间：

| Slice 名 | 含义 |
|----------|------|
| `PlayerLoop` | Unity 主循环一帧总时长 |
| `BehaviourUpdate` | C# Update 阶段（与 pdata 交叉验证） |
| `WaitForTargetFPS` | CPU 等待 vsync（越长 = CPU 越宽松） |
| `GC.Collect` | GC 时间 |
| `Camera.Render` | 渲染提交 |

#### Choreographer 帧时长

Android 系统图形合成器（SurfaceFlinger）发出的 vsync 信号间隔，代表**系统侧帧时长**（不含 CPU 等待 vsync 的时间）。

> **Choreographer 与 pdata 帧时长的差异**：Choreographer 测的是"GPU 提交到下一帧 GPU 提交"的间隔（≈16.7ms @ 60fps），而 pdata 的 `PlayerLoop` 时长包含 `WaitForTargetFPS`（等 vsync 的时间）。两者不是同一个东西，**不可直接比较大小**。

#### CPU/GPU 频率与利用率

| 数据 | 用途 |
|------|------|
| CPU 频率均值 | 验证测试期间无温控降频干扰 |
| GPU 忙碌占比 | 若 > 85%，说明 GPU 是瓶颈，CPU 优化收益会被稀释 |
| GPU 频率 | 验证 GPU 负载无变化 |

#### Binder 调用

UnityMain 发起的 Binder IPC 次数和均值延迟，若 Maple 优化后 Binder 调用增加，可能是意外副作用（如更多日志写入 logcat）。

### 4.3 perfetto 的局限性

| 局限 | 说明 |
|------|------|
| **无函数级信息** | 只有 atrace 埋点的粗粒度 Slice，看不到函数级细节 |
| **Choreographer 帧时长 ≠ pdata 帧时长** | 两者计算基准不同，不可直接比较 |
| **GPU 数据依赖驱动** | 部分 Android ROM/GPU 驱动不上报 GPU 利用率 |
| **文件体积大** | 60s trace 通常 100MB~1GB，解析耗时 |

---

## 5. 三源互补关系

### 5.1 互补矩阵

| 能力维度 | simpleperf | pdata | perfetto | 谁独占 |
|----------|-----------|-------|----------|--------|
| **函数级 CPU 归因** | ✓ 精确 | ✗ | ✗ | **simpleperf** |
| **虚函数优化证据** | ✓ D/A/M 标记 | ✗ | ✗ | **simpleperf** |
| **帧率/帧时长 P95** | ✗ | ✓ 精确 | ✓ Choreographer | **pdata 更可靠** |
| **Scripting 阶段耗时** | 间接（il2cpp 占比） | ✓ BehaviourUpdate | ✓ atrace slice | pdata + perfetto 双确认 |
| **Job.Worker 线程负载** | ✗ 采样不足 | ✓ 精确 | 部分（调度状态） | **pdata** |
| **Render Thread 状态** | so 分布 | ✓ 帧均时长 | ✓ Running/Sleeping | 互补 |
| **GPU 利用率** | ✗ | ✗ | ✓ | **perfetto** |
| **CPU 频率/温控** | ✗ | ✗ | ✓ | **perfetto** |
| **线程调度状态** | ✗ | ✗ | ✓ | **perfetto** |
| **系统 Binder 延迟** | ✗ | ✗ | ✓ | **perfetto** |
| **GC 行为** | 函数级（GC_mark_from） | 帧均时长 | atrace GC.Collect | 三源互补 |

### 5.2 典型互补用法

#### 场景 A：验证 Maple 优化真实性

```
simpleperf 说：il2cpp CPU 占比 ↓5.37pp（CPU cycles 减少）
pdata 说：    BehaviourUpdate 帧均 ↓58.8%（每帧脚本时间缩短）
perfetto 说： BehaviourUpdate atrace slice ↓59.7%（系统侧计时一致）

三源方向一致 → 高置信度，优化真实有效
```

#### 场景 B：解释"simpleperf 显示优化，但帧率没提升"

```
simpleperf 说：il2cpp CPU ↓5pp ✓
perfetto 说：  GPU 利用率 = 92% ！

结论：CPU 瓶颈释放，但 GPU 已经是新瓶颈，CPU 收益被稀释无法体现在帧率上
```

#### 场景 C：解释"pdata P50 改善 34%，但 perfetto Choreographer P95 持平"

```
pdata 说：    帧时长 P50: 26.08ms → 17.07ms（↓34%）
perfetto 说： Choreographer P50: 16.66ms → 16.65ms（持平）

原因：
  - pdata 的 PlayerLoop 时长包含 WaitForTargetFPS（等 vsync）
  - Choreographer 只测 GPU 提交间隔（≈16.7ms = 60fps 固定节拍）
  - 两者计量基准不同，不矛盾
  - pdata 的改善说明：opt 版本 CPU 更早完成，WaitForTargetFPS 增多（+217%），
    帧率从 37fps 提升到 54fps，与 Choreographer 始终锁在 60fps 并行不悖
```

#### 场景 D：发现副作用

```
simpleperf 说：write (libc.so) ↑28%，__vfprintf ↑7.3%
perfetto 说：  Binder 调用次数从 312 → xxx（如果增加）

联合结论：opt 版本可能有额外日志写入，需检查是否在热路径上有 log 调用
```

---

## 6. 三源数据的局限性与噪音

### 6.1 simpleperf 噪音分类

| 噪音类型 | 示例 | 处理方式 |
|----------|------|----------|
| **内核符号** | `[kernel.kallsyms][+ffffffea...]` | 完全过滤，对业务无意义 |
| **libc 底层** | `__vfprintf`、`__memcpy`、`__strlen_aarch64` | 过滤（除非异常高，作为警示项） |
| **vdso** | `__kernel_clock_gettime` | 过滤 |
| **未符号化地址** | `libXXX.so[+0x1234]` | 说明 binary_cache 不完整 |
| **低样本线程** | Job.Worker（样本 < 1000） | 结论不可靠，用 pdata 替代 |

### 6.2 pdata 注意事项

- **帧数越多越可靠**：建议至少 300 帧以上，P99 才有统计意义
- **WaitForTargetFPS 变化**：增加是正常的好现象（CPU 更宽松），不是回归
- **GC.Collect 变化**：Maple 不直接优化 GC，若增加需检查是否有 il2cpp 内存分配变化
- **线程名格式**：`1:Main Thread` 中的 `1:` 是线程组 ID，不是 CPU 核号

### 6.3 perfetto 注意事项

- **Choreographer 帧时长 ≠ 用户感知帧率**（见 5.2 场景 C）
- **GPU 数据不稳定**：驱动不上报时 `gpu_busy_pct` 为空，不等于 GPU 无问题
- **UnityGfxRenderS Running ↑**：可能是正常的瓶颈转移，不必然是回归
- **线程名对齐**：perfetto 中线程名可能与 simpleperf 中不完全一致（OS 截断 15 字符）

---

## 7. 交叉验证规则

### 7.1 方向一致性规则

| simpleperf il2cpp | pdata BehaviourUpdate | 结论 |
|-------------------|-----------------------|------|
| ↓（下降） | ↓（下降） | ✓ 高置信度，优化有效 |
| ↓（下降） | 持平 | 需排查：GPU 瓶颈？温控降频？场景不一致？ |
| ↓（下降） | ↑（上升） | 低置信度，重采，可能有外部干扰 |
| 持平/↑ | — | Maple 优化未生效，检查 opt 包是否正确 |

### 7.2 置信度判断

| 条件 | 置信度 |
|------|--------|
| 三源方向全部一致 | **高置信度** |
| 两源一致，一源持平 | **中置信度** |
| 两源一致，一源数据不可用 | **中置信度（有限）** |
| 方向不一致 | **低置信度，需排查** |

### 7.3 异常排查流程

```
simpleperf 优化 but pdata 无改善？
  ├── 检查 perfetto GPU 利用率 > 85%？→ GPU 瓶颈稀释收益
  ├── 检查两次 frameCount 差异 > 5%？→ 场景不一致
  ├── 检查 perfetto CPU 频率？→ 温控降频
  └── 检查 base/opt 包是否对调？

simpleperf 无改善 but pdata 改善？
  ├── 检查 simpleperf 窗口是否正确对齐（mono_ns）
  └── 检查是否存在多个 libil2cpp（不同路径的 so）
```

---

## 8. 时间窗口对齐机制

三个工具通过 `clock_monotonic` 对齐，误差 < 1ms：

```
clock_monotonic 时间轴：

t1  Unity Profiler 开始录制（pdata 起点）
t2  写入 logcat mono_ns_start（simpleperf 裁剪起点）
t3  atrace CombinedProfile 色块开始（perfetto 起点）

          ... 游戏运行约 60s ...

t4  Unity Profiler 停止录制（pdata 终点）
t5  写入 logcat mono_ns_end（simpleperf 裁剪终点）
t6  atrace 色块结束（perfetto 终点）

三个窗口误差：
  pdata:      t1 ~ t4
  simpleperf: t2 ~ t5（晚约 <1ms，影响 < 0.002%）
  perfetto:   t3 ~ t6（晚约 <0.1ms，影响 < 0.0002%）
```

三个窗口在物理上有微小偏移，但**对 60s 采样的分析结论无实质影响**。

---

## 9. 可扩展数据源（路线图）

现有三源仍有盲区，按"补哪个盲区 / 性价比"排序如下。新增源遵循"可插拔"原则：只新增一个提取 Provider，产出 `PerfProfile` 片段，不改上层分析逻辑（见 [`analysis-framework-design.md`](./analysis-framework-design.md) §6）。

### 9.1 强烈建议补（补当前明显盲区）

| 数据源 | 采集方式 | 补的盲区 | 备注 |
|--------|----------|----------|------|
| **SurfaceFlinger / FrameTimeline** | perfetto 加 `android.surfaceflinger` + Frame Timeline 事件 | **用户真实感知掉帧**：区分"应用卡"还是"合成/显示链路卡"（VSync miss、SF 掉帧）；expected vs actual frame | perfetto 直接支持，几乎零成本，补一个大盲区 |
| **Thermal / 温度** | `dumpsys thermalservice` 或 perfetto thermal ftrace | **真正判断降频**：频率掉了是没负载还是过热？需温度 + throttling 状态 | 当前只采 cpufreq 均值，无法判断热降频，这是"机器是否降频"需求的核心缺口 |
| **simpleperf 硬件 PMU 计数器** | `simpleperf stat -e cache-misses,instructions,cpu-cycles,branch-misses` | **优化深层效果**：IPC、cache miss 率——区分"减少了指令数"还是"改善了 cache 局部性" | 已有 simpleperf 工具链，边际成本低 |

### 9.2 值得补（看精力）

| 数据源 | 采集方式 | 补的盲区 |
|--------|----------|----------|
| **GPU 深度数据** | Mali Streamline / Adreno Profiler / Android GPU Inspector (AGI)，或引擎侧 FrameTimingManager | perfetto 的 GPU counter 多数设备拿不全；当三源都指向"等 GPU"时需要 |
| **内存全景** | `dumpsys meminfo`（PSS/Java heap/Native heap/Graphics）、Unity Memory Profiler | GC 卡顿与 OOM 根因 |
| **ANR / 主线程长卡顿** | `dumpsys` ANR trace，或运行时 watchdog | 捕捉采样可能错过的偶发长卡顿 |
| **功耗 / power rail** | perfetto power rails / `batterystats` | "省了 CPU 但帧没变快"时证明优化省了功耗（移动端正收益） |

### 9.3 可选（锦上添花）

- **Unity FrameTimingManager / Recorder API**：引擎内主动上报 CPU/GPU 帧时间，作为 pdata 与 perfetto 帧口径的"第三方裁判"。
- **logcat 结构化埋点**：扩展业务关键事件打点（进战斗/加载完成），让分析能按"运行阶段"切片。

> **优先级建议**：前两个（SurfaceFlinger/FrameTimeline、Thermal）几乎只是给 perfetto 多开几个 trace 事件，投入产出比最高，应优先接入。
