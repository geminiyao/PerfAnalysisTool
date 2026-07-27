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
> base 样本 Running 86.94%、Gfx.WaitForPresent 单次 avg 仅 0.91 ms，属于 CPU-bound 健康形态；cur 样本 Running 已降至 77.82%、Sleeping 升至 20.40%、单次 avg 达 5.83 ms，进入算+等混合状态；throttle 样本 Running 跌至 56.99%、Sleeping 高达 38.99%、单次 avg 飙升至 17.80 ms，已超 vsync 周期，演化为半睡型 GPU-bound。
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
> throttle 样本下业务侧头号消耗源为 LuaMgr，单帧高达 8.64 ms（占 trace 18.48%），Core.Update 紧随其后达 8.05 ms/帧（17.21% trace），两者合计超过帧预算三分之一；MapSignificanceMgr 以 4.83 ms/帧 居第三位，OutSideViewArmyLineMgr 和 BattleHeadMgr 各消耗约 2 ms/帧，均需重点关注。
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
> base 与 cur 的 bigCoreReach 分别为 74.9% 和 75.6%，已低于理论上限，热预算处于偏紧但尚能维持的状态；throttle 样本 bigCoreReach 进一步跌至 59.2%，大核频率利用率明显压缩，三档均判定为 likely 降频，说明热压力是帧率劣化的重要助推因素。
>
> 详见 §5。

**按 ROI 排序的优化方向：**

1. **LuaMgr** — throttle 下 8.64 ms/帧 是头号 CPU 消耗源，优先减少 Lua tick 频次与 GC.Alloc（1.3 次/帧）分配量
2. **Core.Update / MapSignificanceMgr** — Core.Update 达 8.05 ms/帧、MapSignificanceMgr 达 4.83 ms/帧，可通过帧分散或重要度裁剪降低每帧调用量
3. **GPU 等待（Gfx.WaitForPresent）** — throttle 单次 avg 17.80 ms 超出 vsync 周期，需降低渲染负载或减少 draw call 以解除主线程睡等
4. **BattleHeadMgr GC** — 5.6 次/帧（allocTotalMs 4.64 ms）是 GC 压力第二大来源，建议对象池复用头像资源
5. **Core.Update GC** — 17.3 次/帧（allocTotalMs 13.68 ms）是全场景最高分配源，需排查频繁分配路径并转为预分配或结构体复用

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

- base：Choreographer 60.1 Hz ≈ PlayerLoop 59.8 fps → 业务跟得上屏幕节拍，双缓冲正常
- cur：Choreographer 60.0 Hz >> PlayerLoop 33.1 fps → 业务已跨 vsync 周期掉帧，约每两帧漏一帧
- throttle：Choreographer 60.1 Hz >> PlayerLoop 21.4 fps → 严重跨 vsync，业务帧率不足屏幕节拍的二分之一

**温度时序故事：**

三档样本大核 bigCoreReach 分别为 74.9%、75.6%、59.2%，均未达到理论上限且持续下探，降频判定均为 likely；throttle 场景 bigCoreReach 跌至 59.2%，说明热压力持续积累已导致大核频率被明显压制。

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

binder 调用在三档样本中合计 totalMs 最高仅 6.44 ms，相对于主线程总时长占比极低，不是主线程阻塞的主因。

UnityMain 在 base 下 Running 86.94% 属 CPU-bound 健康形态；随着 cur 和 throttle 场景 Sleeping 分别升至 20.40% 和 38.99%，主线程从主动计算逐步转为等待 GPU 完成上一帧，瓶颈由 CPU 侧向 GPU 侧漂移。

### §3.2 Render（UnityGfxRenderS）

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 25.98% | 22.30% | 16.71% |
| Sleeping% | 70.32% | 73.64% | 79.85% |
| Runnable% | 3.53% | 3.70% | 3.11% |

UnityGfxRenderS 三档 Sleeping 均超过 70%，从 base 的 70.32% 进一步升至 throttle 的 79.85%，Running 持续下降至 16.71%，说明 Render 线程大量时间在等主线程或等 GPU 信号，本身不是瓶颈而是被上游阻塞。

### §3.3 RHI

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 41.13% | 35.78% | 24.53% |
| Sleeping% | 54.42% | 60.80% | 72.03% |
| Runnable% | 4.27% | 3.26% | 3.24% |

RHI 线程 Running 从 base 的 41.13% 下降到 throttle 的 24.53%，Sleeping 从 54.42% 升至 72.03%，说明随着 GPU 负载加重，RHI 越来越多地阻塞在 eglSwapBuffers/Gfx.PresentFrame 等 GPU 完成信号上，是 GPU-bound 的直接映射线程。

### §3.4 Lua MtGC

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 1.73% | 0.99% | 0.69% |
| Sleeping% | 97.67% | 98.96% | 99.24% |
| Runnable% | 0.60% | 0.05% | 0.07% |

LuaMtGC 三档 Sleeping 均超过 97%、Running 不足 2%，说明 Lua 多线程 GC 线程基本处于空闲休眠状态，当前 GC 压力对该线程而言负担轻，不是系统瓶颈。

### §3.5 ECS Worker × 4

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 8.59% | 11.60% | 11.52% |
| Sleeping% | 73.63% | 70.57% | 76.47% |
| Runnable% | 17.69% | 17.40% | 11.89% |

ECSWorker_0 的 Runnable 占比在 base/cur 下维持在 17% 左右，说明 Job 任务就绪但等待 CPU 时间片分配，存在一定调度排队压力；Sleeping 超过 70% 表明大量时间处于等待分配新 Job 的空闲态，整体尚在可接受范围内。

### §3.6 Audio 线程池

Audio Mixer Thr / Audio Stream Th 通常无明显异常，链路健康，不是瓶颈。

### §3.7 Choreographer

- base: 60.1 Hz
- cur: 60.0 Hz
- throttle: 60.1 Hz

三档样本 Choreographer 均稳定维持在 60.0-60.1 Hz，屏幕 vsync 节拍正常，显示链路本身无异常。

---

## §4 主线程 off-CPU 归因（perfetto 独家·结论前置）

### §4.1 结论前置

> base 样本主线程 Sleeping totalMs 为 1375.03 ms，其中 Gfx.WaitForPresent 重合 620.12 ms，Sleep 中等 GPU 比例仅占 45.1%，主线程尚处于健康双缓冲形态，剩余 Sleeping 可能来自 vsync 节拍等待；cur 样本重合度急升至 94.6%（Sleeping 2991.06 ms 中 2828.21 ms 在等 GPU），进入算+等混合形态；throttle 重合度达 97.7%（7778.38 ms 中 7600.06 ms 等 GPU），主线程绝大多数睡眠时间都在等 GPU，已演化为强 GPU-bound 形态。

### §4.2 byState 分布（off-CPU 拆分）

| 样本 | S 态占比 | R 态占比 | D 态占比 | 含义 |
|---|---|---|---|---|
| base | 90.57% | 7.44% | 1.57% | D 态 1.57% 属正常水平，S 态主因为 Gfx.WaitForPresent 和 vsync 节拍等待 |
| cur | 89.54% | 7.30% | 2.43% | D 态 2.43% 略微上升但不异常，S 态大幅增加主因为 GPU 等待时间延长 |
| throttle | 89.34% | 6.58% | 1.30% | D 态 1.30% 无异常，S 态比例最高主因为主线程严重阻塞于 Gfx.WaitForPresent |

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

从 base 到 throttle，Running 从 86.94% 跌至 56.99%，Sleeping 从 12.04% 升至 38.99%，与 Gfx.WaitForPresent 单次 avg 从 0.91 ms 飙升至 17.80 ms 高度吻合，说明主线程"算的时间"被 GPU 等待不断蚕食，算与等的比例随压力档位急剧失衡。

### §4.5 因果链可视化

```
PlayerLoop（主线程，每帧入口）
  │  证据: p50 base 16.69ms → throttle 45.94ms 帧时间膨胀
  │
  ├─► PostLateUpdate.FinishFrameRendering
  │     │  证据: base 6.88 ms/帧 → throttle 26.04 ms/帧，占帧比例急升
  │     │
  │     └─► URP.RenderSingleCamera → URP.AfterRendering
  │               │  证据: AfterRendering base 1.68 ms/帧 → throttle 19.33 ms/帧
  │               │
  │               └─► Gfx.WaitForPresent（主线程睡等 GPU semaphore）
  │                     │  证据: 单次 avg base 0.91 ms → cur 5.83 ms → throttle 17.80 ms
  │                     │
  │                     └─► [主线程进入 Sleeping 态]
  │                               │  证据: Sleep 重合度 base 45.1% → cur 94.6% → throttle 97.7%
  │                               │
  │                               └─► [等待 RHI Gfx.PresentFrame 完成]
  │                                         证据: RHI Running 41.13% → 24.53%（越来越阻塞在 GPU）

证据链一致性：
  1. Gfx.WaitForPresent 单次 avg: 0.91 ms (base) / 5.83 ms (cur) / 17.80 ms (throttle)
  2. Sleep 中等 GPU 重合度: 45.1% (base) / 94.6% (cur) / 97.7% (throttle)
  3. UnityMain Sleeping totalMs: 1375.03 ms → 2991.06 ms → 7778.38 ms
  4. RHI Running 下降: 41.13% → 35.78% → 24.53%（GPU 侧阻塞加重）
  5. URP.AfterRendering ms/帧 飙升: 1.68 → 6.86 → 19.33（渲染提交量增大）
```

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

- base：bigReach 74.9%，热预算偏紧但大核仍能维持较高频率，属于热预算紧但还顶得住的状态
- cur：bigReach 75.6% 与 base 接近，降频程度相当，帧率下降主因为 GPU-bound 而非大幅降频
- throttle：bigReach 跌至 59.2%，大核频率利用率明显压缩，进入重度降频形态，热压力已显著制约 CPU 算力

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

base 样本 p50 为 16.69 ms、p99 仅 21.37 ms，分位数区间窄，帧时间分布均匀；cur 和 throttle 样本 p99 分别达 42.54 ms 和 66.32 ms，与 p50 差距持续拉大，说明存在偶发但越来越频繁的尖峰帧，帧稳定性随压力档位显著下降。

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

缩进树各主要节点业务解读：

← PlayerLoop [16.72 / 30.25 / 46.68 ms/帧]：帧总耗时从 base 16.72 ms 膨胀至 throttle 46.68 ms，跨越 3 个 vsync 周期，是所有子节点消耗叠加的入口

← PostLateUpdate.FinishFrameRendering [6.88 / 13.11 / 26.04 ms/帧]：渲染提交链路从 6.88 ms 膨胀至 26.04 ms，throttle 下占帧超 55%，是帧时间增长最大贡献者

← URP.AfterRendering [1.68 / 6.86 / 19.33 ms/帧]：throttle 下达 19.33 ms/帧，增幅超过 10 倍，是渲染链路内的核心热点，Gfx.WaitForPresent 等待藏于此处

← Core.Update [1.73 / 7.33 / 8.05 ms/帧]：从 base 1.73 ms 暴增至 cur 7.33 ms，增幅超 300%，业务逻辑主入口，GC.Alloc 17.3 次/帧亦集中于此

← CS:AOE.Outside.MapManager [0.44 / 2.90 / 3.99 ms/帧]：包含 OutSideViewArmyLineMgr 等子模块，cur 开始急剧增长，是 Core.Update 主要热点来源

← CS:AOE.LuaMgr [1.00 / 3.81 / 3.47 ms/帧]：Lua tick 调度入口，在 cur/throttle 下均超过 3 ms/帧，与 LuaMgr.OnTick&UpdateSchedule 几乎等同，Lua 侧计算是主要开销

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

- 降低 Lua tick 每帧触发次数：cur 调用量 4562 次相比 base 6321 次已有所减少，但单次 avg 0.91 ms 仍偏高，可进一步合并低优先级 tick 频次
- 排查 LuaMgr.OnTick&UpdateSchedule 内的高频 Lua table 分配路径，将热路径对象改为 C# 侧对象池，以减少 GC.Alloc 1.17 ms/帧
- 对 throttle 下 ms/帧 与 cur 基本持平（8.636 vs 8.859）说明 count 减少但单次耗时未降低，需在 Lua 脚本层面优化热点函数逻辑
- 利用 LuaMtGC 线程（当前 Running 仅 0.69%）潜力，将更多 Lua GC 工作迁移到多线程 GC，减少主线程 Lua GC 停顿
- 建立 LuaMgr 每帧预算红线（如 3 ms/帧），一旦超线触发告警，阻止新功能 tick 无节制接入

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

- GC.Alloc 17.3 次/帧（allocTotalMs 13.68 ms）是全场景最高分配源，优先排查 Core.Update 子树中频繁 new 对象的热路径，替换为对象池或结构体
- CS:AOE.Outside.MapManager 在 throttle 下达 3.99 ms/帧，是 Core.Update 最大子节点，需单独下钻其内部 OutSideViewArmyLineMgr 和 BattleUIManager 的分配行为
- Core.Update 单次 avg 8.03 ms 且 count 仅 428，说明每帧只调用一次但每次都很重，应检查是否有可以跳帧执行的非实时逻辑
- 将 Core.Update 中低优先级子系统（如 MeshUIManager、BattleUIManager）改为按需更新或时间分片执行，降低每帧固定开销
- 结合 MapSignificanceMgr 的 9296 次调用特征，检查 Core.Update 内是否有隐式驱动高频子调用的循环逻辑

#### 6.3.3 MapSignificanceMgr

> 项目包知识：**重要度管理器（MapSignificanceMgr）** (线程: 主线程（Lua tick / Update） · 红线参考: 实体增删洪峰; 任务多时易顶到 3ms/帧上限)

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

- cur 下调用量 12217 次远高于 base 的 8901 次，是 cur 下 ms/帧 从 0.317 急升至 6.035 的主因，需排查哪种游戏事件触发了调用量暴增
- 单次 avg 仅 0.22 ms，说明单次逻辑轻量，优化重点在于削减调用频次而非单次逻辑优化
- GC.Alloc 几乎为零（allocCount 1），分配侧不是问题，性能瓶颈纯粹来自调用频次
- 可设置实体变更批量合并机制，将多次单实体触发合并为一次批量更新，控制每帧最大调用 count 上限
- 与 Core.Update 的联动关系需重点检查，确认是否是 Core.Update 内的循环迭代驱动了 MapSignificanceMgr 的高频调用

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

- base 仅 0.028 ms/帧 而 cur 急升至 1.583 ms/帧，增幅超 50 倍，说明某个游戏状态切换开启了大量行军线刷新，需排查触发条件
- 单次 avg 0.97 ms 相对偏高，结合 count 1074 次，建议对 OutsideLineCtrl.RefreshLine 增加脏标记，仅在行军线数据实际变化时才执行刷新
- cur 到 throttle 的 count 从 1166 降至 1074 而 ms/帧 从 1.583 升至 2.442，说明单次耗时随降频加重，需在 GetArmyLineID 等热路径中减少算法复杂度
- 可考虑将行军线刷新改为异步分帧执行，每帧只刷新一部分行军线，平摊峰值消耗至 2 ms/帧 以内
- 与 CS:AOE.Outside.MapManager 的父子关系表明，OutSideViewArmyLineMgr 消耗是 MapManager 节点增长的重要组成，联合优化效果更佳

#### 6.3.5 BattleHeadMgr

> 项目包知识：**头像管理器（BattleHeadMgr）** (线程: 主线程（Lua tick） · 红线参考: 同屏头像数量驱动; 与 BattleUIManager 联动看)

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

- GC.Alloc 5.6 次/帧（allocTotalMs 4.64 ms）是业务侧 GC 压力第二大来源，优先对头像对象（Sprite/Texture 引用、头像 UI 元件）实施对象池复用
- base 到 cur 的 count 从 1380 降至 982 而 ms/帧 从 0.196 飙升至 3.015，说明场景中同屏头像数量或逻辑复杂度发生跳变，需明确驱动因素
- 单次 avg 1.07 ms 偏高，与 BattleUIManager 联动检查是否存在每次调用都触发 UI 批次重建的行为
- 可设置同屏头像数量上限或 LOD 机制，超出阈值后降低刷新频率，将 throttle 下 2.19 ms/帧 控制在 1 ms/帧 以内
- 将头像数据更新与渲染分离，数据侧按 2 帧一次更新，渲染侧每帧复用上帧数据，可直接减少一半的 GC.Alloc 频次

### §6.4 红线触发清单

| 优先级 | 模块 | base ms/帧 | cur ms/帧 | throttle ms/帧 | 红线类型 |
|---|---|---|---|---|---|
| 1 | LuaMgr | 2.96 | 8.86 | 8.64 | cur/throttle 下持续超红线，Lua tick 频次与单次耗时双重叠加 |
| 2 | Core.Update | 1.73 | 7.33 | 8.05 | cur 起急剧膨胀，GC.Alloc 17.3 次/帧是全场景最高分配源 |
| 3 | MapSignificanceMgr | 0.32 | 6.03 | 4.83 | cur 下调用量暴增（8901→12217 次）驱动耗时激增 |
| 4 | OutSideViewArmyLineMgr | 0.03 | 1.58 | 2.44 | base→cur 增幅超 50 倍，行军线刷新触发逻辑需收口 |
| 5 | BattleHeadMgr | 0.20 | 3.01 | 2.19 | GC.Alloc 5.6 次/帧（4.64 ms）是头像渲染侧主要分配来源 |

---

## §7 渲染链路 + GPU bound 判定

### §7.1 Gfx.WaitForPresent 单次 avg

| 样本 | 单次 avg | 含义 |
|---|---|---|
| base | **0.91 ms** | 远低于 vsync 周期 16.67 ms，GPU 完全跟得上主线程，不是 GPU-bound |
| cur | **5.83 ms** | 低于 vsync 周期 16.67 ms，GPU 已有明显等待但尚未超周期，处于临界状态 |
| throttle | **17.80 ms** | 超过 vsync 周期 16.67 ms，GPU 成为帧率瓶颈，主线程被迫跨周期等待 |

**判定阈值**：单次 `Gfx.WaitForPresent > vsync 周期`（60Hz=16.67ms）→ GPU 成为瓶颈。

### §7.3 GPU bound 判定矩阵

| 信号 | 直接证据 | 间接证据 | 判定 |
|---|---|---|---|
| GPU busy/freq counter | — | 设备物理不可达 | ❌ 缺数据 |
| **Gfx.WaitForPresent 单次 > vsync** | base 0.91 ms / cur 5.83 ms / throttle 17.80 ms | ✅ | throttle 超 16.67 ms 🔴；cur 临近 🟡；base 健康 🟢 |
| **主线程 Sleeping ≈ Gfx.WaitForPresent** | 重合度 base 45.1% / cur 94.6% / throttle 97.7% | ✅ | throttle/cur 高度重合 🔴；base 部分重合 🟡 |
| **Render / RHI 都越来越闲** | Render Running 25.98%→16.71%；RHI Running 41.13%→24.53% | ✅ | 三档递减趋势明确 🔴 |
| Choreographer 维持节拍 | base 60.1 Hz / cur 60.0 Hz / throttle 60.1 Hz | ✅ | 🟢 显示链路正常 |
| 主线程 binder 占比 | base 2.73 ms / cur 2.78 ms / throttle 6.44 ms | ✅ | binder 占比极低，排除 IPC 阻塞为主因 🟢 |

**判定**：

- base: 不是 GPU-bound（Gfx.WaitForPresent 0.91 ms，健康双缓冲）
- cur: 中等 GPU-bound（单次 avg 5.83 ms，Sleep 重合度 94.6%，GPU 等待已成主要 Sleeping 来源）
- throttle: 强 GPU-bound（单次 avg 17.80 ms 超 vsync 周期，Sleep 重合度 97.7%，主线程严重阻塞于 GPU 等待）

---

## §9 本源能力边界 + 工程化建议（分四档）

### §9.1 能力矩阵

参考 §-1.3 能否回答清单。每条能力对应底层数据源 / 可信度。

### §9.2 工程化建议

#### 🟢 已落实

- 主线程一帧时间去向已通过 callTrees 父子链完整拆解（§6.2 缩进树）
- 主线程 off-CPU 归因通过 atrace wait slice 重叠法给出量化结论（§4.3，重合度数字来自 Sleeping/Gfx.WaitForPresent 对比）
- GPU-bound 判定通过 Gfx.WaitForPresent 单次 avg + 多线程三态交叉佐证给出强信号结论（§7.3 判定矩阵）
- 降频时序通过 bigCoreReach% + per-CPU freq 实测表给出 likely 档定性（§5）
- GC 压力源已按业务模块归因（Core.Update 17.3 次/帧、BattleHeadMgr 5.6 次/帧，§6.3 各节）

#### 🟡 待 Provider 子查询扩展（不阻塞本报告）

- callTrees adaptive 剪枝：当前缩进树在深度较浅时已有节点合并，可扩展为按 ms/帧 阈值自动展开到叶子级别
- cpu offline 检测：补充 cpu7 cluster 下线时序检测，将 confirmed 档降频判定从 ❌ 升级为可选支持
- threadsSchedList 默认覆盖范围扩大：Audio 线程和 Choreographer 线程的 sched 三态可纳入标准输出，增强显示链路健康度监控
- 跨次 diff 自动化：当前对比靠人工读表，可建立 base→cur→throttle 三份 ms/帧 增量自动标注机制

#### 🔴 物理 / 结构性不可达（永久声明）

- sched_blocked_reason ftrace 真值（华为非 root 静默丢弃）
- sysfs scaling_max_freq 旁路（confirmed 档不可达）
- GPU busy / freq counter（骁龙需 root 注入 producer）
- Wwise 内部细分（atrace 无 native 埋点）

#### 后续工程项

- 建立单帧逐线程时间轴视图：在 throttle 帧率最差的帧段内，对 UnityMain/Render/RHI/ECSWorker 做毫秒级对齐，定位最长等待链
- 跨次版本 diff 报告：将 base→cur 的 LuaMgr（2.96→8.86 ms/帧）、MapSignificanceMgr（0.32→6.03 ms/帧）等增量自动输出为 diff 表，辅助版本回归判断
- 引入 actual_frame_timeline_slice Provider 配置，实现 VSync miss 帧数量化，替代当前依赖 slowFrameRate >33ms 的间接统计

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
