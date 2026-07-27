# Perfetto 3 份对比性能分析报告

> 项目包：**aoeyz** (auto-detected)

> 3 份样本：base, cur, throttle

## §-1 数据采集 · 能力声明

### -1.1 本次采集的数据（列表）

| 角色 | 时间点 | 时长 | PlayerLoop 帧数 | 文件 |
|---|---|---|---|---|
| **base** | — | 11.42 s | 680 | base |
| **cur** | — | 14.66 s | 483 | cur |
| **throttle** | — | 19.95 s | 427 | throttle |

> ⚠️ 跨次对比一律用 **ms/帧** 或 **占整 trace %（totalPct）** 归一化, 绝对 totalMs 仅本次内部参考。

旁路文件：

| 旁路文件 | 用途 |
|---|---|
| collection-manifest.json | 记录 root 状态、sysfs 旁路成功项 |
| thermal_before / thermal_after | 采前/采后 thermal_zone 温度 |
| cpuinfo_max_freq | 8 核理论上限频率（reach% 分母校准）|

### -1.2 数据维度矩阵

| 维度 | 状态 | 用途 |
|---|---|---|
| atrace 业务 slice (PlayerLoop / Core.Update / 各 Mgr) | ✅ | 主线程一帧时间去向 |
| sched 三态 (Running / Sleeping / Runnable) | ✅ | off-CPU 归因 |
| CPU 频率 cpufreq counter (per-CPU avg/max) | ✅ | 降频时序 |
| 温度旁路 thermal_zone | ✅ | 降频升 likely 档判定 |
| cpuinfo_max_freq | ✅ | reach% 分母校准 |
| callTrees 父子链 | ✅ | 业务模块剥洋葱 selfMs |
| RHI / LuaMtGC / ECSWorker × 4 自动识别 | ✅ | 多线程独立分析 |
| android_binder_txns server 进程归属 | ✅ | 主线程被谁阻塞 |
| Choreographer fps (屏幕 vsync 节拍) | ✅ | 显示链路 vs PlayerLoop 对照 |
| GC.Alloc 业务子树归因 (次/帧) | ✅ | 业务分配源定位 |
| ❌ sched_blocked_reason ftrace | 物理不可达 | 华为非 root 实测内核静默丢弃 |
| ❌ sysfs scaling_max_freq | 物理不可达 | 华为锁了 Permission denied |
| ❌ GPU busy / freq counter | 物理不可达 | 骁龙需 root 注入 producer |
| ❌ actual_frame_timeline_slice | 需 Provider config 改造 | VSync miss 量化 |
| ❌ Wwise 内部细分 | 结构性不可达 | atrace 无埋点, 用 simpleperf 互补 |

### -1.3 本报告能 / 不能回答的问题

| 想回答 | 能否 | 走哪节 |
|---|---|---|
| 主线程一帧时间花在哪? | ✅ | §6.2 callTrees 缩进树 |
| 主线程在算还是在等? 等什么? | ✅ | §4 off-CPU 归因 |
| 哪些业务模块超红线? | ✅ | §6.3 Top 热点下钻 |
| GC 压力源在哪个业务模块? | ✅ | §6.3 + GC.Alloc/帧 |
| 机器是否降频? 严重程度? | ✅ likely 档 | §5 降频时序 |
| RHI / Render / ECSWorker / LuaMtGC 各自健康度? | ✅ | §3 多线程独立分析 |
| 主线程 binder 调用发给谁? | ✅ | §3.1 / §7 |
| 是否 GPU-bound? | 🟡 强信号能给, GPU 满载硬证给不出 | §7 |
| 跨样本演化对比? | ✅ | §0 / §4.4 / §6.2 多列对照 |
| Wwise 内部耗时? | ❌ 用 simpleperf | — |
| 严格 confirmed 降频判定? | ❌ 华为非 root 物理不可达 | 停在 likely 档 |
| 函数级 CPU self%? | ❌ 用 simpleperf | — |

---

## §0 结论先行

> ### ⚠️ 三大独立结论（按强度排序）
>
> **① 主线程瓶颈形态**
>
> ```
> UnityMain Running / Sleeping (sched):
>   base       ██████████████████████████████████░░░░░░ Run 86.94% / Sleep 12.04% / Runnable 0.97%
>   cur        ███████████████████████████████░░░░░░░░░ Run 77.82% / Sleep 20.40% / Runnable 1.62%
>   throttle   ██████████████████████░░░░░░░░░░░░░░░░░░ Run 56.99% / Sleep 38.99% / Runnable 2.83%
>
> Gfx.WaitForPresent 单次 avg（主线程睡等 GPU 上一帧）:
>   base       0.91 ms
>   cur        5.83 ms
>   throttle   17.80 ms
> ```
>
> <!-- LLM_FILL: 1-3 句话总结上面 Running/Sleeping ASCII 比例条和 Gfx.WaitForPresent 单次 avg 揭示的主线程瓶颈形态。必须引用上面给出的 Running%、Sleeping%、Gfx.WaitForPresent 单次 avg 数字。判定瓶颈形态属于：CPU-bound 健康 / 算+等混合 / 半睡型 GPU-bound 三档之一。严禁新加任何不在上面 ASCII 块的数字。50-150 字 Chinese。 -->
>
> 详见 §3.1 / §4 / §7。
>
> **② 业务侧主消耗源**
>
> ```
>   LuaMgr                       throttle   8.64 ms/帧 (18.48% trace)
>   Core.Update                  throttle   8.05 ms/帧 (17.21% trace)
>   MapSignificanceMgr           throttle   4.83 ms/帧 (10.33% trace)
>   OutSideViewArmyLineMgr       throttle   2.44 ms/帧 (5.23% trace)
>   BattleHeadMgr                throttle   2.19 ms/帧 (4.68% trace)
> ```
>
> <!-- LLM_FILL: 1-3 句话总结上面 Top 业务模块清单的负载特征，必须引用上面 ms/帧 数字。判断哪个模块是头号 CPU 消耗源。热点名称必须来自上面清单，不要编造或固定套用业务模块名。50-150 字 Chinese。 -->
>
> 详见 §6.2 / §6.3。
>
> **③ 降频与热预算**
>
> ```
>   base       bigCoreReach 74.9%    降频判定: likely
>   cur        bigCoreReach 75.6%    降频判定: likely
>   throttle   bigCoreReach 59.2%    降频判定: likely
> ```
>
> <!-- LLM_FILL: 1-3 句话解读上面 bigCoreReach% 和降频判定级，判断热预算是否紧张。必须引用上面给出的数字。50-150 字 Chinese。 -->
>
> 详见 §5。

**按 ROI 排序的优化方向：**

<!-- LLM_FILL: 列出 3-5 条具体优化方向，每条一行，格式 `1. **<模块/方向>** — <一句话理由>`。必须引用上面 §0 提到的模块名和数字。优先级按预估 ROI 排序。 -->

---

## §1 采集质量声明 + 数据口径

### §1.1 trace 实际时长

| 数据 | 实际窗口 | 帧数 | fps |
|---|---|---|---|
| base | ~11.42 s | 680 | 59.8 |
| cur | ~14.66 s | 483 | 33.1 |
| throttle | ~19.95 s | 427 | 21.4 |

> ⚠️ 跨次对比一律用 **ms/帧** 或 **占整 trace %（totalPct）** 归一化。

### §1.2 数据口径

| 口径 | 计算公式 | 用途 |
|---|---|---|
| **callTrees totalMs / totalPct** | 直接读 callTrees[].root 沿父子链节点 totalMs；totalPct = totalMs / 整 trace ms × 100% | 主线程一帧时间去向 唯一正确口径 |
| **selfMs**（剥洋葱）| totalMs - sum(直接子 totalMs) | 节点自身入口逻辑真正消耗 |
| **单次 avgMs** | totalMs / count | 区分'涨在频次 vs 涨在单次' |
| **ms/帧**（推算）| totalMs / PlayerLoop 帧数 | 跨次帧数不同时归一化对比 |
| ~~atraceSlices LIKE 全 trace 的 totalMs~~ | ❌ 不可用做'占帧消耗' | 仅可用 count 字段 |

> ⚠️ 反模式 M1：atraceSlices LIKE 累加会跨多个父子层级重复计数。本报告全部使用 callTrees 父子链。

### §1.3 数据缺口

- **sched_blocked_reason ftrace**（❌）→ §4 用 atrace wait slice 重叠法替代
- **sysfs scaling_max_freq**（❌）→ §5 降频判定停在 likely 档
- **GPU busy / freq counter**（❌）→ §7 用 Gfx.WaitForPresent 单次 avg 间接信号
- **actual_frame_timeline_slice**（❌）→ Choreographer fps 替代

---

## §2 采集元信息

| 项 | **base** | **cur** | **throttle** |
|---|---|---|---|
| 场景推断 | — | — | — |
| 实际 trace 长度 | ~11.42 s | ~14.66 s | ~19.95 s |
| **PlayerLoop 帧数** | 680 | 483 | 427 |
| **PlayerLoop p50 / p95 / p99 (ms)** | 16.69 / 18.68 / 21.37 | 30.15 / 35.22 / 42.54 | 45.94 / 55.62 / 66.32 |
| **PlayerLoop fps** | **59.8** | **33.1** | **21.4** |
| **Choreographer fps**（屏幕节拍） | 60.1 | 60.0 | 60.1 |
| slowFrameRate >33ms | 0.15% | 13.04% | 98.83% |
| CPU 平均频率 | 1729.5 MHz | 1576.3 MHz | 1324.6 MHz |
| 大核 bigCoreReach% | 74.9% | 75.6% | 59.2% |
| 降频判定级 | **likely** | **likely** | **likely** |

**Choreographer fps vs PlayerLoop fps 关系：**

<!-- LLM_FILL: 对每个样本，比较 Choreographer fps 和 PlayerLoop fps：若两者接近 → 业务跟得上屏幕节拍；若 Choreographer >> PlayerLoop fps × 2 → 跨 vsync 周期掉帧。引用上面表格中的具体数字。每个样本一行 `- <角色>：<对比> → <判定>`。 -->

**温度时序故事：**

<!-- LLM_FILL: 1-2 句话从 bigCoreReach% 和降频判定级解读热预算和降频形态。必须引用上面表格中的 bigCoreReach 数字。30-100 字。 -->

---

## §3 多线程独立分析

### §3.0 线程一览

| 通用名 | comm（实测）| 关键 atrace 特征 | 一句话定位 |
|---|---|---|---|
| **UnityMain** | UnityMain | `PlayerLoop` × N、`Core.Update`、`LuaMgr.*` | 业务/Lua/ECS 调度主入口 |
| **Render** | UnityGfxRenderS | `Gfx.RenderSlaver.ThreadRun`、`Semaphore.WaitForSignal` | Unity 命令录制层 |
| **RHI** | Thread-XXX | `eglSwapBuffers` / `Gfx.PresentFrame` | 直调 GLES driver |
| **Lua MtGC** | LuaMtGC | `LuaMtGc.ExecuteMtGc` / `LuaMultiThreadGC` | xLua C# GC 线程 |
| **ECS Worker × 4** | ECSWorker_0/1/2/3 | `xxxJob (Burst)` × 数万 | Unity Job System Burst Worker |
| **Audio** | Audio Mixer Thr / Audio Stream Th | 内核 AudioFlinger 回调 | 音频回放 |
| **Choreographer** | UnityChoreograp | `Choreographer#doFrame` | VSync 回调 |
| ❌ Wwise | — | atrace 无埋点 | **本源结构性不可见**（永久声明）|

### §3.1 UnityMain（主线程）

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 86.94% | 77.82% | 56.99% |
| Sleeping% | 12.04% | 20.40% | 38.99% |
| Runnable% | 0.97% | 1.62% | 2.83% |

**主线程 binder 调用 server 进程：**

- base：pid=1873 × 11 次, totalMs=2.73 ms
- cur：pid=1873 × 11 次, totalMs=2.78 ms
- throttle：system_server × 20 次, totalMs=6.44 ms

<!-- LLM_FILL: 一句话给出 binder 是不是主线程阻塞主因的判定，引用上面 binder 数字。15-30 字 Chinese。 -->

<!-- LLM_FILL: 1-2 句话判断 UnityMain 形态（瓶颈/健康/等什么）。必须引用本节表格中的 Running%/Sleeping% 数字。30-80 字 Chinese。 -->

### §3.2 Render（UnityGfxRenderS）

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 25.98% | 22.30% | 16.71% |
| Sleeping% | 70.32% | 73.64% | 79.85% |
| Runnable% | 3.53% | 3.70% | 3.11% |

<!-- LLM_FILL: 1-2 句话判断 UnityGfxRenderS 形态（瓶颈/健康/等什么）。必须引用本节表格中的 Running%/Sleeping% 数字。30-80 字 Chinese。 -->

### §3.3 RHI

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 41.13% | 35.78% | 24.53% |
| Sleeping% | 54.42% | 60.80% | 72.03% |
| Runnable% | 4.27% | 3.26% | 3.24% |

<!-- LLM_FILL: 1-2 句话判断 RHI 形态（瓶颈/健康/等什么）。必须引用本节表格中的 Running%/Sleeping% 数字。30-80 字 Chinese。 -->

### §3.4 Lua MtGC

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 1.73% | 0.99% | 0.69% |
| Sleeping% | 97.67% | 98.96% | 99.24% |
| Runnable% | 0.60% | 0.05% | 0.07% |

<!-- LLM_FILL: 1-2 句话判断 LuaMtGC 形态（瓶颈/健康/等什么）。必须引用本节表格中的 Running%/Sleeping% 数字。30-80 字 Chinese。 -->

### §3.5 ECS Worker × 4

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 8.59% | 11.60% | 11.52% |
| Sleeping% | 73.63% | 70.57% | 76.47% |
| Runnable% | 17.69% | 17.40% | 11.89% |

<!-- LLM_FILL: 1-2 句话判断 ECSWorker_0 形态（瓶颈/健康/等什么）。必须引用本节表格中的 Running%/Sleeping% 数字。30-80 字 Chinese。 -->

### §3.6 Audio 线程池

Audio Mixer Thr / Audio Stream Th 通常无明显异常，链路健康，不是瓶颈。

### §3.7 Choreographer

- base: 60.1 Hz
- cur: 60.0 Hz
- throttle: 60.1 Hz

<!-- LLM_FILL: 一句话总结 Choreographer 屏幕节拍。15-50 字。 -->

---

## §4 主线程 off-CPU 归因（perfetto 独家·结论前置）

### §4.1 结论前置

> <!-- LLM_FILL: 2-4 句话给出主线程 Sleeping 时间归因结论：即'多大比例是等 GPU、多大比例是 vsync 等待'。必须从下面 §4.3 重叠法表格取数字。判断当前样本是健康双缓冲 / 算+等混合 / 强 GPU-bound 之一。50-150 字。 -->

### §4.2 byState 分布（off-CPU 拆分）

| 样本 | S 态占比 | R 态占比 | D 态占比 | 含义 |
|---|---|---|---|---|
| base | 90.57% | 7.44% | 1.57% | <!-- LLM_FILL: 一句话解读 D 态是否异常 / S 态主因 --> |
| cur | 89.54% | 7.30% | 2.43% | <!-- LLM_FILL: 一句话解读 D 态是否异常 / S 态主因 --> |
| throttle | 89.34% | 6.58% | 1.30% | <!-- LLM_FILL: 一句话解读 D 态是否异常 / S 态主因 --> |

### §4.3 atrace wait slice 重叠法（核心证据）

| 样本 | UnityMain Sleeping totalMs | Gfx.WaitForPresent self totalMs | 重合度（Sleep 中等 GPU 比例） |
|---|---|---|---|
| base | 1375.03 ms | 620.12 ms | **45.1%** |
| cur | 2991.06 ms | 2828.21 ms | **94.6%** |
| throttle | 7778.38 ms | 7600.06 ms | **97.7%** |

### §4.4 主线程状态分布可视化（ASCII）

```
状态分布（主线程总时长归一化为整 trace 窗口）

base:  ██████████████████████████████████░░░░░░  Run 86.94% / Sleep 12.04% / Runnable 0.97%
            ↑ Gfx.WaitForPresent 单次 avg 0.91 ms

cur:  ███████████████████████████████░░░░░░░░░  Run 77.82% / Sleep 20.40% / Runnable 1.62%
            ↑ Gfx.WaitForPresent 单次 avg 5.83 ms

throttle:  ██████████████████████░░░░░░░░░░░░░░░░░░  Run 56.99% / Sleep 38.99% / Runnable 2.83%
            ↑ Gfx.WaitForPresent 单次 avg 17.80 ms

```

<!-- LLM_FILL: 1-2 句话总结上面 ASCII 比例条揭示的'算 vs 等'分布特征。必须引用上面 Run/Sleep% 和 Gfx.WaitForPresent 单次 avg。50-100 字。 -->

### §4.5 因果链可视化

<!-- LLM_FILL: 用 ASCII 树状图绘制主线程一帧的等待因果链（PlayerLoop → URP.WaitForPresent → Sleep → 等 GPU semaphore → RHI Gfx.PresentFrame）。深度 3-5 层。引用本节 §4.3 重合度 + §4.4 单次 avg 数字作为每条因果链的证据。末尾加'证据链一致性'清单，列 3-5 条数字证据。结构参考金标准 v5.3 §4.5。 -->

---

## §5 降频时序证据链（perfetto 独家）

### §5.1 三态对照表

| 样本 | bigReach% | UnityMain run% | PlayerLoop p50/p99 | level |
|---|---|---|---|---|
| **base** | 74.9% | 86.94% | 16.69 / 21.37 | **likely** |
| **cur** | 75.6% | 77.82% | 30.15 / 42.54 | **likely** |
| **throttle** | 59.2% | 56.99% | 45.94 / 66.32 | **likely** |

### §5.2 降频形态识别

```
base:
  bigReach: 74.9%
  level:    likely

cur:
  bigReach: 75.6%
  level:    likely

throttle:
  bigReach: 59.2%
  level:    likely

```

<!-- LLM_FILL: 1-3 句话识别每个样本的降频形态：'热预算紧但还顶得住' / '饱和高温' / '重度降频'。引用上面 bigReach% 数字。每个样本一行。 -->

### §5.3 per-CPU 实测表

| CPU | base avg/max | cur avg/max | throttle avg/max | cpuinfo_max |
|---|---|---|---|---|
| cpu0 | 1138.3 / 1804.8 | 1260.0 / 1804.8 | 1225.0 / 1804.8 | 1804.8 |
| cpu1 | 1138.3 / 1804.8 | 1260.0 / 1804.8 | 1225.0 / 1804.8 | 1804.8 |
| cpu2 | 1138.3 / 1804.8 | 1260.0 / 1804.8 | 1225.0 / 1804.8 | 1804.8 |
| cpu3 | 1138.3 / 1804.8 | 1260.0 / 1804.8 | 1225.0 / 1804.8 | 1804.8 |
| cpu4 | 1841.6 / 2419.2 | 1737.6 / 2342.4 | 1268.6 / 2227.2 | 2419.2 |
| cpu5 | 1841.6 / 2419.2 | 1737.6 / 2342.4 | 1268.6 / 2227.2 | 2419.2 |
| cpu6 | 1841.6 / 2419.2 | 1737.6 / 2342.4 | 1268.6 / 2227.2 | 2419.2 |
| cpu7 | 2093.2 / 2841.6 | 2187.6 / 2841.6 | 1744.0 / 2841.6 | 2841.6 |

### §5.4 降频判定矩阵

| 维度 | 要求 | 本次 |
|---|---|---|
| **confirmed**: sysfs `scaling_max_freq < cpuinfo_max_freq` | sysfs root | ❌ 物理不可达 |
| **confirmed**: cpu7 sched 归零（集群下线）| 跨次时序 | ❌/✅ |
| **likely**: bigReach% 持续下降 + 温度 Δ°C ≥ 5°C | cpufreq + 温度旁路 | ✅/❌ |
| **likely**: 大核 reach% < 65% 严重低频 | cpufreq counter | ✅/❌ |
| **suspected**: bigReach% < 80% 且 Run ≥ 80% | cpufreq counter | ✅/❌ |

**当前判定**：base / cur / throttle 三档分别为 likely / likely / likely

---

## §6 主线程一帧时间去向

### §6.1 PlayerLoop 帧分位数

| 分位 | **base** | **cur** | **throttle** |
|---|---|---|---|
| p50 ms | 16.69 | 30.15 | 45.94 |
| p95 ms | 18.68 | 35.22 | 55.62 |
| p99 ms | 21.37 | 42.54 | 66.32 |
| slowFrame >33ms | 0.15 | 13.04 | 98.83 |
| fps | 59.8 | 33.1 | 21.4 |
| 帧数 | 680 | 483 | 427 |

<!-- LLM_FILL: 1-2 句话解读 p50→p99 分布的形态（持续匀速/偶发尖峰）。必须引用上面分位数数字。30-80 字。 -->

### §6.2 主线程 callTrees 缩进树

**形式硬规则**：

- 必须缩进树展示，不用表格
- 每节点格式：`[base / cur / throttle ms/帧]`
- 标记体系：📈 增量 >50% / 🔴 单次平均超红线 / 🟡 临近红线 / 🟢 健康 / 🔵 wait 型
- 树深度至少展开到业务模块叶子

```
UnityMain                                [0.00 / 0.00 / 0.00 ms/帧]
├─ PlayerLoop                               [16.72 / 30.25 / 46.68 ms/帧]
├─ PostLateUpdate.FinishFrameRendering      [6.88 / 13.11 / 26.04 ms/帧]
│  ├─ URP.Render                               [6.13 / 12.20 / 24.94 ms/帧]
│  │  ├─ URP.RenderCameraStack                    [5.99 / 12.06 / 24.72 ms/帧]
│  │  │  ├─ URP.RenderSingleCamera                   [5.78 / 11.84 / 24.42 ms/帧]
│  │  │  │  ├─ URP.AfterRendering                       [1.68 / 6.86 / 19.33 ms/帧]
│  │  │  │  ├─ URP.BeforeRendering                      [1.09 / 1.85 / 1.74 ms/帧]
│  │  │  │  ├─ URP.MainRenderingTransparent             [1.71 / 1.81 / 1.70 ms/帧]
│  │  │  │  ├─ URP.RendererSetup                        [0.75 / 0.74 / 0.93 ms/帧]
├─ Update.ScriptRunBehaviourUpdate          [2.15 / 7.93 / 8.83 ms/帧]
│  ├─ BehaviourUpdate                          [2.15 / 7.92 / 8.82 ms/帧]
│  │  ├─ Core.Update                              [1.73 / 7.33 / 8.05 ms/帧]
│  │  │  ├─ CS:AOE.Outside.MapManager                [0.44 / 2.90 / 3.99 ms/帧]
│  │  │  │  ├─ CS:AOE.Outside.OutSideViewArmyLineMgr    [0.00 / 1.58 / 2.44 ms/帧]
│  │  │  │  ├─ CS:AOE.Battle.BattleUIManager            [0.00 / 0.72 / 0.83 ms/帧]
│  │  │  ├─ CS:AOE.LuaMgr                            [1.00 / 3.81 / 3.47 ms/帧]
│  │  │  │  ├─ LuaMgr.OnTick&UpdateSchedule             [0.95 / 3.75 / 3.41 ms/帧]
├─ PreLateUpdate.ScriptRunBehaviourLateUpdate [1.62 / 2.88 / 2.99 ms/帧]
│  ├─ LateBehaviourUpdate                      [1.62 / 2.88 / 2.98 ms/帧]
│  │  ├─ Core.LateUpdate                          [1.02 / 2.13 / 2.33 ms/帧]
│  │  │  ├─ CS:AOE.MeshUIManager                     [0.00 / 1.02 / 0.79 ms/帧]
│  │  │  ├─ CS:AOE.Outside.MapManager                [0.44 / 2.90 / 3.99 ms/帧]
│  │  │  ├─ CS:AOE.LuaMgr                            [1.00 / 3.81 / 3.47 ms/帧]
│  │  │  │  ├─ LuaMgr.OnLateUpdateSchedule              [0.33 / 0.39 / 0.53 ms/帧]
├─ PostLateUpdate.PlayerUpdateCanvases      [0.94 / 0.94 / 1.14 ms/帧]
│  ├─ UIEvents.WillRenderCanvases              [0.93 / 0.94 / 1.13 ms/帧]
│  │  ├─ UGUI.Rendering.UpdateBatches             [0.93 / 0.93 / 1.13 ms/帧]
├─ SimulationSystemGroup                    [0.79 / 0.84 / 1.07 ms/帧]
│  ├─ Default World Unity.Entities.SimulationSystemGroup [0.78 / 0.83 / 1.06 ms/帧]
├─ PostLateUpdate.PlayerSendFrameComplete   [0.50 / 0.70 / 0.98 ms/帧]
│  ├─ PlayerEndOfFrame                         [0.49 / 0.70 / 0.98 ms/帧]
│  │  ├─ CoroutinesDelayedCalls                   [0.49 / 0.69 / 0.97 ms/帧]
│  │  │  ├─ Core.EndOfFrame                          [0.29 / 0.44 / 0.56 ms/帧]
├─ InitializationSystemGroup                [0.51 / 0.65 / 0.98 ms/帧]
│  ├─ Default World Unity.Entities.InitializationSystemGroup [0.51 / 0.64 / 0.97 ms/帧]
```

<!-- LLM_FILL: 给上面缩进树添加业务解读：每个主要节点（占帧 >5% 或单次超红线）后面加 `← <一句注解>`。必须引用本树中的 ms/帧 数字。注释只能加在 `← ...` 形式，不要修改树结构本身。 -->

### §6.3 Top 红线热点子函数下钻

#### 6.3.1 LuaMgr

```
LuaMgr (throttle: 8.64 ms/帧 / 18.48% trace / 单次 avg 0.91 ms)
  count: 4068
  跨样本 ms/帧 对比:
    base       2.964 ms/帧 (cnt 6321)
    cur        8.859 ms/帧 (cnt 4562)
    throttle   8.636 ms/帧 (cnt 4068)
```

**GC.Alloc 业务归因（throttle）：**

- LuaMgr 子树：1.3 次/帧 (allocCount 560, allocTotalMs 1.17 ms)

<!-- LLM_FILL: 给 LuaMgr 写优化方向 3-5 条 bullets，格式 `- <具体可行优化>`。必须引用本节数字。不要预设业务模块名，只能用本次数据中已出现的名字。 -->

#### 6.3.2 Core.Update

```
Core.Update (throttle: 8.05 ms/帧 / 17.21% trace / 单次 avg 8.03 ms)
  count: 428
  跨样本 ms/帧 对比:
    base       1.731 ms/帧 (cnt 684)
    cur        7.334 ms/帧 (cnt 484)
    throttle   8.046 ms/帧 (cnt 428)
```

**GC.Alloc 业务归因（throttle）：**

- Core.Update 子树：17.3 次/帧 (allocCount 7419, allocTotalMs 13.68 ms)

<!-- LLM_FILL: 给 Core.Update 写优化方向 3-5 条 bullets，格式 `- <具体可行优化>`。必须引用本节数字。不要预设业务模块名，只能用本次数据中已出现的名字。 -->

#### 6.3.3 MapSignificanceMgr

```
MapSignificanceMgr (throttle: 4.83 ms/帧 / 10.33% trace / 单次 avg 0.22 ms)
  count: 9296
  跨样本 ms/帧 对比:
    base       0.317 ms/帧 (cnt 8901)
    cur        6.035 ms/帧 (cnt 12217)
    throttle   4.826 ms/帧 (cnt 9296)
```

**GC.Alloc 业务归因（throttle）：**

- MapSignificanceMgr 子树：0.0 次/帧 (allocCount 1, allocTotalMs 0.00 ms)

<!-- LLM_FILL: 给 MapSignificanceMgr 写优化方向 3-5 条 bullets，格式 `- <具体可行优化>`。必须引用本节数字。不要预设业务模块名，只能用本次数据中已出现的名字。 -->

#### 6.3.4 OutSideViewArmyLineMgr

> 项目包知识：**行军线刷新（OutSideViewArmyLineMgr）** (线程: 主线程（Update） · 红线参考: OutsideLineCtrl.RefreshLine / GetArmyLineID 等)

```
OutSideViewArmyLineMgr (throttle: 2.44 ms/帧 / 5.23% trace / 单次 avg 0.97 ms)
  count: 1074
  跨样本 ms/帧 对比:
    base       0.028 ms/帧 (cnt 1539)
    cur        1.583 ms/帧 (cnt 1166)
    throttle   2.442 ms/帧 (cnt 1074)
```

<!-- LLM_FILL: 给 OutSideViewArmyLineMgr 写优化方向 3-5 条 bullets，格式 `- <具体可行优化>`。必须引用本节数字。不要预设业务模块名，只能用本次数据中已出现的名字。 -->

#### 6.3.5 BattleHeadMgr

```
BattleHeadMgr (throttle: 2.19 ms/帧 / 4.68% trace / 单次 avg 1.07 ms)
  count: 876
  跨样本 ms/帧 对比:
    base       0.196 ms/帧 (cnt 1380)
    cur        3.015 ms/帧 (cnt 982)
    throttle   2.186 ms/帧 (cnt 876)
```

**GC.Alloc 业务归因（throttle）：**

- BattleHeadMgr 子树：5.6 次/帧 (allocCount 2396, allocTotalMs 4.64 ms)

<!-- LLM_FILL: 给 BattleHeadMgr 写优化方向 3-5 条 bullets，格式 `- <具体可行优化>`。必须引用本节数字。不要预设业务模块名，只能用本次数据中已出现的名字。 -->

### §6.4 红线触发清单

| 优先级 | 模块 | base ms/帧 | cur ms/帧 | throttle ms/帧 | 红线类型 |
|---|---|---|---|---|---|
| 1 | LuaMgr | 2.96 | 8.86 | 8.64 | <!-- LLM_FILL: 一句红线类型 --> |
| 2 | Core.Update | 1.73 | 7.33 | 8.05 | <!-- LLM_FILL: 一句红线类型 --> |
| 3 | MapSignificanceMgr | 0.32 | 6.03 | 4.83 | <!-- LLM_FILL: 一句红线类型 --> |
| 4 | OutSideViewArmyLineMgr | 0.03 | 1.58 | 2.44 | <!-- LLM_FILL: 一句红线类型 --> |
| 5 | BattleHeadMgr | 0.20 | 3.01 | 2.19 | <!-- LLM_FILL: 一句红线类型 --> |

---

## §7 渲染链路 + GPU bound 判定

### §7.1 Gfx.WaitForPresent 单次 avg

| 样本 | 单次 avg | 含义 |
|---|---|---|
| base | **0.91 ms** | <!-- LLM_FILL: 一句话给出'是否超 vsync 周期 16.67ms'判定 --> |
| cur | **5.83 ms** | <!-- LLM_FILL: 一句话给出'是否超 vsync 周期 16.67ms'判定 --> |
| throttle | **17.80 ms** | <!-- LLM_FILL: 一句话给出'是否超 vsync 周期 16.67ms'判定 --> |

**判定阈值**：单次 `Gfx.WaitForPresent > vsync 周期`（60Hz=16.67ms）→ GPU 成为瓶颈。

### §7.3 GPU bound 判定矩阵

| 信号 | 直接证据 | 间接证据 | 判定 |
|---|---|---|---|
| GPU busy/freq counter | — | 设备物理不可达 | ❌ 缺数据 |
| **Gfx.WaitForPresent 单次 > vsync** | <!-- LLM_FILL: 引用 §7.1 数字 --> | ✅ | <!-- LLM_FILL: 给出 🔴/🟡/🟢 --> |
| **主线程 Sleeping ≈ Gfx.WaitForPresent** | <!-- LLM_FILL: 引用 §4.3 重合度 --> | ✅ | <!-- LLM_FILL: 🔴/🟡/🟢 --> |
| **Render / RHI 都越来越闲** | <!-- LLM_FILL: 引用 §3.2/§3.3 三态演化 --> | ✅ | <!-- LLM_FILL: 🔴/🟡/🟢 --> |
| Choreographer 维持节拍 | <!-- LLM_FILL: 引用 §3.7 数字 --> | ✅ | 🟢 显示链路正常 |
| 主线程 binder 占比 | <!-- LLM_FILL: 引用 §3.1 数字 --> | ✅ | <!-- LLM_FILL: 排除/不排除 IPC 阻塞 --> |

**判定**：

<!-- LLM_FILL: 对每个样本给出 GPU bound 判定结论（强 GPU-bound / 中等 / 不是）。格式 `- <角色>: <判定>` 每行一个。 -->

---

## §9 本源能力边界 + 工程化建议（分四档）

### §9.1 能力矩阵

参考 §-1.3 能否回答清单。每条能力对应底层数据源 / 可信度。

### §9.2 工程化建议

#### 🟢 已落实

<!-- LLM_FILL: 列出 3-5 条本报告已经回答了的能力（引用对应章节）。 -->

#### 🟡 待 Provider 子查询扩展（不阻塞本报告）

<!-- LLM_FILL: 列出 2-4 条 Provider 端可加强的查询（如 callTrees adaptive 剪枝、cpu offline 检测、threadsSchedList 默认覆盖更广）。 -->

#### 🔴 物理 / 结构性不可达（永久声明）

- sched_blocked_reason ftrace 真值（华为非 root 静默丢弃）
- sysfs scaling_max_freq 旁路（confirmed 档不可达）
- GPU busy / freq counter（骁龙需 root 注入 producer）
- Wwise 内部细分（atrace 无 native 埋点）

#### 后续工程项

<!-- LLM_FILL: 列出 1-3 条后续可做项（如跨次 diff、单帧逐线程时间轴等）。 -->

---

## §10 自评

- [x] 结论先行（§0）
- [x] 完整证据链（每条挂数据来源）
- [x] 数据口径透明（§1.2 公式表）
- [x] 数据缺口诚实声明（§1.3 / §-1.2 / §9.1 三处冗余）
- [x] 可执行建议（§0 ROI 排序 + §6.3 各模块优化方向 + §9.2 分四档）
- [x] 不编造（线程名 / 百分比 / 模块名全部来自 summary）
- [x] 降频/可信度：likely 档诚实标注 + 缺 sysfs 数据
- [x] 帧口径：Choreographer fps vs PlayerLoop fps 关系明示
- [x] 跨样本对比：所有数字按 ms/帧 或 totalPct 归一化
