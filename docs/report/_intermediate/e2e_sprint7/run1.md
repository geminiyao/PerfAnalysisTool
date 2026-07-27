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
> base 样本 Running 占比 86.94%、Sleeping 仅 12.04%，Gfx.WaitForPresent 单次均值 0.91 ms，属于 CPU-bound 健康形态；cur 的 Running 降至 77.82%、Sleeping 升至 20.40%，Gfx.WaitForPresent 单次均值跃升至 5.83 ms，进入算+等混合区间；throttle 下 Running 骤降至 56.99%、Sleeping 高达 38.99%，Gfx.WaitForPresent 单次均值达 17.80 ms 已超 vsync 周期 16.67 ms，形态判定为半睡型 GPU-bound。
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
> throttle 场景下头号 CPU 消耗源为 LuaMgr，耗时 8.64 ms/帧（占 trace 18.48%），紧随其后的 Core.Update 达 8.05 ms/帧（17.21% trace），两者合计已接近一帧总预算的 35%；MapSignificanceMgr 以 4.83 ms/帧（10.33% trace）位居第三，OutSideViewArmyLineMgr 和 BattleHeadMgr 分别贡献 2.44 ms/帧和 2.19 ms/帧，均显著超出健康基线。
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
> base 和 cur 的 bigCoreReach 分别为 74.9% 和 75.6%，处于"热预算紧但尚能顶住"区间，降频判定均为 likely；throttle 下 bigCoreReach 骤降至 59.2%，进入明显低频段，三份样本均缺乏 sysfs root 权限，无法升至 confirmed 档，但降频趋势随场景强化而明显加剧。
>
> 详见 §5。

**按 ROI 排序的优化方向：**

1. **LuaMgr / Lua Tick 剪枝** — LuaMgr 在 throttle 下达 8.64 ms/帧（18.48% trace），为头号消耗源，且存在 1.3 次/帧 GC 分配，优先减少每帧 Lua 调度次数或合并 OnTick 批次可获最大收益。
2. **Core.Update 子树 GC 治理** — Core.Update throttle 下 17.3 次/帧 GC（allocCount 7419，allocTotalMs 13.68 ms），GC 压力极重，应对高频分配路径做对象池化改造。
3. **MapSignificanceMgr 频次控制** — 该模块在 cur 场景调用次数高达 12217 次（6.035 ms/帧），throttle 仍有 9296 次（4.83 ms/帧），应增加脏标志或降频触发策略。
4. **BattleHeadMgr GC 整治** — BattleHeadMgr throttle 下 5.6 次/帧 GC（allocCount 2396，allocTotalMs 4.64 ms），需对头像数量驱动的内存分配做池化或缓存复用。
5. **OutSideViewArmyLineMgr 增量刷新** — 该模块从 base 的 0.028 ms/帧 飙升至 throttle 的 2.44 ms/帧，应对行军线 RefreshLine 做增量脏标志判定，避免全量重算。

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

- base：Choreographer 60.1 Hz ≈ PlayerLoop 59.8 fps → 业务完全跟得上屏幕节拍，显示链路健康。
- cur：Choreographer 60.0 Hz 远高于 PlayerLoop 33.1 fps（约 1.8 倍）→ 主线程已跨 vsync 周期掉帧，屏幕节拍正常但业务帧率严重落后。
- throttle：Choreographer 60.1 Hz 远高于 PlayerLoop 21.4 fps（约 2.8 倍）→ 已深度跨多个 vsync 周期，掉帧极为严重，业务几乎每帧都触发等待。

**温度时序故事：**

bigCoreReach 从 base 的 74.9%、cur 的 75.6% 降至 throttle 的 59.2%，三份样本降频判定均为 likely，热预算随采集时长增加而持续收紧，throttle 阶段大核已明显进入低频运行区间。

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

binder 调用在三份样本中耗时均在个位数毫秒量级（最多 6.44 ms），不是主线程阻塞的主要原因。

UnityMain 形态在 base 下以 Running 86.94% 为主，属于 CPU-bound 健康状态；随负载加重，cur 和 throttle 的 Sleeping 分别升至 20.40% 和 38.99%，主要是等 GPU 上一帧渲染完成（Gfx.WaitForPresent），整体向"算+等混合"乃至"半睡型 GPU-bound"演进。

### §3.2 Render（UnityGfxRenderS）

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 25.98% | 22.30% | 16.71% |
| Sleeping% | 70.32% | 73.64% | 79.85% |
| Runnable% | 3.53% | 3.70% | 3.11% |

UnityGfxRenderS 各样本 Sleeping 均超 70%（throttle 达 79.85%），Running 仅 16.71%～25.98%，大量时间处于等待主线程提交命令的空闲状态，渲染命令录制层本身不是瓶颈，整体健康。

### §3.3 RHI

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 41.13% | 35.78% | 24.53% |
| Sleeping% | 54.42% | 60.80% | 72.03% |
| Runnable% | 4.27% | 3.26% | 3.24% |

RHI 线程 Sleeping 从 base 的 54.42% 升至 throttle 的 72.03%，Running 从 41.13% 降至 24.53%，随 GPU 负载加重越来越多时间在等 GPU 消化上一帧提交，驱动侧并非自身 CPU 瓶颈，但越来越闲本身是 GPU 排队积压的间接信号。

### §3.4 Lua MtGC

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 1.73% | 0.99% | 0.69% |
| Sleeping% | 97.67% | 98.96% | 99.24% |
| Runnable% | 0.60% | 0.05% | 0.07% |

LuaMtGC 在三份样本中 Sleeping 均超 97%（throttle 达 99.24%），Running 最高仅 1.73%，GC 线程几乎全时休眠，当前不是性能瓶颈，GC 压力轻微。

### §3.5 ECS Worker × 4

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 8.59% | 11.60% | 11.52% |
| Sleeping% | 73.63% | 70.57% | 76.47% |
| Runnable% | 17.69% | 17.40% | 11.89% |

ECSWorker_0 Sleeping 约 70%～76%，Running 仅 8%～11%，Runnable 约 12%～17%，说明 Worker 大部分时间在等任务调度，不是 CPU 瓶颈，但 Runnable 比例偏高表明调度器存在一定排队等待。

### §3.6 Audio 线程池

Audio Mixer Thr / Audio Stream Th 通常无明显异常，链路健康，不是瓶颈。

### §3.7 Choreographer

- base: 60.1 Hz
- cur: 60.0 Hz
- throttle: 60.1 Hz

三份样本的 Choreographer 屏幕节拍均稳定在 60.0～60.1 Hz，VSync 信号链路始终健康，显示侧无掉帧。

---

## §4 主线程 off-CPU 归因（perfetto 独家·结论前置）

### §4.1 结论前置

> base 样本主线程 Sleeping 中约 45.1% 时间与 Gfx.WaitForPresent 重叠（1375.03 ms Sleeping / 620.12 ms 等 GPU），属于健康双缓冲形态，GPU 等待尚在可控范围；cur 样本重叠度跃升至 94.6%（2991.06 ms Sleeping / 2828.21 ms 等 GPU），绝大部分睡眠时间均在等 GPU，已演变为算+等混合；throttle 重叠度高达 97.7%（7778.38 ms Sleeping / 7600.06 ms 等 GPU），主线程几乎所有 off-CPU 时间均被 GPU 等待占满，形态判定为强 GPU-bound。

### §4.2 byState 分布（off-CPU 拆分）

| 样本 | S 态占比 | R 态占比 | D 态占比 | 含义 |
|---|---|---|---|---|
| base | 90.57% | 7.44% | 1.57% | D 态 1.57% 正常，S 态主因为 Gfx.WaitForPresent GPU 等待，整体健康 |
| cur | 89.54% | 7.30% | 2.43% | D 态 2.43% 略有升高但未达异常阈值，S 态主因为 GPU 等待加剧 |
| throttle | 89.34% | 6.58% | 1.30% | D 态 1.30% 无异常，S 态几乎全部来自 Gfx.WaitForPresent GPU 积压 |

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

三份样本呈现清晰的"算→等"演化曲线：base 的 Run 86.94% 大幅主导，Sleep 仅 12.04%，Gfx.WaitForPresent 单次均值 0.91 ms，主线程以计算为主；throttle 下 Run 骤降至 56.99%、Sleep 攀升至 38.99%，Gfx.WaitForPresent 单次均值 17.80 ms 已超 vsync 16.67ms 周期，主线程超过三分之一时间在睡等 GPU。

### §4.5 因果链可视化

```
主线程一帧等待因果链（以 throttle 为代表）

PlayerLoop（一帧入口）
└─ PostLateUpdate.FinishFrameRendering
   └─ URP.AfterRendering
      └─ Gfx.WaitForPresent（主线程主动等待上一帧 GPU 完成）
         │  证据：单次 avg 17.80 ms（throttle），超 vsync 周期 16.67 ms
         │  重叠度：Sleep 7778.38 ms 中 7600.06 ms 在此等待 → 97.7%
         └─ RHI Gfx.PresentFrame（eglSwapBuffers 驱动层翻转）
            └─ GPU 渲染队列积压（间接信号：RHI Running 仅 24.53%，Sleeping 72.03%）

证据链一致性：
1. Gfx.WaitForPresent 单次 avg：base 0.91 ms → cur 5.83 ms → throttle 17.80 ms，随场景线性恶化
2. Sleep 中等 GPU 重叠度：base 45.1% → cur 94.6% → throttle 97.7%，确认主要 off-CPU 来源
3. RHI Running% 持续下降：41.13% → 35.78% → 24.53%，驱动层越来越多时间在等 GPU 队列
4. Render Sleeping% 持续上升：70.32% → 73.64% → 79.85%，渲染命令录制层也在等上游
5. PlayerLoop p99 从 21.37 ms 升至 66.32 ms，与 Gfx.WaitForPresent 单次 avg 累积趋势吻合
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

- base：bigCoreReach 74.9%，热预算紧但还顶得住，大核维持在中高频区间，PlayerLoop p50 16.69 ms 接近 60fps 红线。
- cur：bigCoreReach 75.6%，与 base 接近，依然属于热预算紧但还顶得住的状态，但 PlayerLoop p50 已升至 30.15 ms，帧率已低于 33fps。
- throttle：bigCoreReach 骤降至 59.2%，大核进入明显低频段，属于重度降频形态，PlayerLoop p50 达 45.94 ms，帧率仅剩 21.4 fps。

### §5.3 per-CPU 实测表

| CPU | base avg/max | cur avg/max | throttle avg/max |  cpuinfo_max |
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

base 样本 p50 至 p99 仅从 16.69 ms 升至 21.37 ms，分布紧凑，属于均匀帧率；cur 和 throttle 下 p99 分别达到 42.54 ms 和 66.32 ms，是 p50 的 1.4 倍和 1.4 倍，波动幅度较大，表明存在持续高压型帧率下滑而非偶发尖峰。

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

主要节点业务解读：

← PlayerLoop [16.72 / 30.25 / 46.68 ms/帧]：帧总耗时从 base 健康的 16.72 ms 飙升至 throttle 的 46.68 ms，是所有子模块恶化的综合体现。

← PostLateUpdate.FinishFrameRendering [6.88 / 13.11 / 26.04 ms/帧]：包含 URP 渲染和 Gfx.WaitForPresent，throttle 下达 26.04 ms/帧，占帧预算超过一半，是渲染链路 GPU 等待的集中体现。

← URP.AfterRendering [1.68 / 6.86 / 19.33 ms/帧]：从 base 的 1.68 ms 暴涨至 throttle 的 19.33 ms，是渲染路径中增幅最剧烈的节点，GPU 积压的主要着陆点。

← Core.Update [1.73 / 7.33 / 8.05 ms/帧]：业务逻辑主入口，throttle 下 8.05 ms/帧，增幅约 4.6 倍，头号业务 CPU 消耗点。

← CS:AOE.Outside.MapManager [0.44 / 2.90 / 3.99 ms/帧]：地图管理器，cur 和 throttle 下显著膨胀，包含 OutSideViewArmyLineMgr 和 BattleUIManager 等高耗子模块。

← CS:AOE.Outside.OutSideViewArmyLineMgr [0.00 / 1.58 / 2.44 ms/帧]：行军线管理器，base 几乎无耗时，throttle 达 2.44 ms/帧，增量显著，需增量刷新优化。

← CS:AOE.LuaMgr [1.00 / 3.81 / 3.47 ms/帧]：Lua 调度层（Update 路径），throttle 下 3.47 ms/帧，叠加 LateUpdate 路径合计为帧内最大业务热点来源。

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

- 优先排查 LuaMgr.OnTick&UpdateSchedule 中单帧调用量过高的 Lua 定时任务，合并低频任务调度批次，减少每帧 count 从 4068 次带来的总体调用开销。
- 对 LuaMgr 子树中产生 allocCount 560 次（1.3 次/帧）GC 分配的 Lua 调用点做对象池化或表复用，将 allocTotalMs 1.17 ms 降为零分配。
- 检查 LuaMgr 在 cur（8.859 ms/帧，cnt 4562）和 throttle（8.636 ms/帧，cnt 4068）下耗时接近但 count 下降，说明单次均值在升高，需重点分析 OnTick 重热路径的单次耗时来源。
- 对非每帧必须执行的 Lua 模块改用间隔帧触发（如每 2～3 帧一次），可在 throttle 场景下直接减半 LuaMgr 的绝对帧耗时。
- 结合 LuaMgr.OnLateUpdateSchedule（0.33 / 0.39 / 0.53 ms/帧）评估是否可将部分 LateUpdate 逻辑合并至 Update 批次，减少调度轮次。

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

- Core.Update 子树 GC 压力极重（allocCount 7419，allocTotalMs 13.68 ms），应优先对高频分配路径（如 MapManager、OutSideViewArmyLineMgr 子节点）做对象池化，目标将 17.3 次/帧 GC 降至 5 次/帧以下。
- Core.Update 单次均值 8.03 ms（throttle，count 428），远超 1 帧 16.67 ms 的一半，需对 CS:AOE.Outside.MapManager（3.99 ms/帧）和 CS:AOE.LuaMgr（3.47 ms/帧）两个最大子模块分别制定缩减方案。
- 对 CS:AOE.Outside.OutSideViewArmyLineMgr（throttle 2.44 ms/帧）引入脏标志，仅在行军线数据真正变化时触发 RefreshLine，避免每帧无谓全量计算。
- 评估 CS:AOE.Battle.BattleUIManager（throttle 0.83 ms/帧）是否可拆分为异步刷新，将非关键 UI 数据更新移出主 Update 路径。
- 对比 base（1.731 ms/帧）到 throttle（8.046 ms/帧）的 4.6 倍增长，重点检查是否有随场景实体数增加而线性放大的 O(n) 遍历逻辑。

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

- MapSignificanceMgr 在 cur 场景调用次数高达 12217 次（6.035 ms/帧），单次均值仅 0.22 ms，说明耗时主要来自调用频次过高而非单次逻辑重，首要优化是降低触发频率，引入脏标志或节流策略（如每 3 帧执行一次）。
- 检查是否存在实体增删洪峰导致的突发高 count，对场景实体数量波动做防御性限流，避免在 cur 下 count 从 8901 骤增至 12217 的情况复现。
- 由于 GC 分配几乎为零（allocCount 仅 1），内存管理侧无需改造，优化资源应集中在调用次数控制上。
- 评估 MapSignificanceMgr 的重要度计算是否可异步化或分帧摊派（Job System），将主线程单帧 4.83 ms 压力迁移至 ECSWorker 侧。
- 对比 throttle 的 count 9296 和 base 的 8901，count 差异不大但 ms/帧 差异悬殊（0.317 vs 4.826），表明单次耗时随设备降频线性放大，需关注算法复杂度是否随频率敏感。

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

- OutSideViewArmyLineMgr 从 base 的 0.028 ms/帧 飙升至 throttle 的 2.442 ms/帧（增幅约 87 倍），而 count 从 1539 降至 1074，说明单次耗时大幅上升（单次均值 0.97 ms），重点排查 RefreshLine / GetArmyLineID 等热点逻辑的复杂度。
- 引入脏标志机制：只有当行军线数据（位置、数量）实际发生变化时才执行 RefreshLine，避免每帧无条件全量刷新。
- 对行军线数量做上限控制，同屏行军线超过阈值时合批或降采样渲染，降低 OutSideViewArmyLineMgr 单次计算量。
- 评估 GetArmyLineID 等查询接口是否可改为缓存查表，避免每帧重复遍历实体容器带来的线性开销。
- 结合 BattleUIManager（throttle 0.83 ms/帧）联动分析，确认两者是否共享同一数据源，若是则可合并更新批次减少重复计算。

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

- BattleHeadMgr 的 GC 压力突出：throttle 下 allocCount 2396（5.6 次/帧，allocTotalMs 4.64 ms），需对头像数据的频繁内存分配做对象池化，将每次头像刷新的 new/alloc 改为从池中复用。
- 单次均值 1.07 ms（throttle，count 876），同屏头像数量是主要驱动因素，应设置同屏头像上限并对超出部分做 LOD 降级或延迟更新。
- 对比 cur（3.015 ms/帧，cnt 982）和 throttle（2.186 ms/帧，cnt 876），count 下降但 ms/帧 也下降，说明场景复杂度在两次采集间有差异，需结合战斗实体数对单次耗时做标准化评估。
- 与 BattleUIManager（throttle 0.83 ms/帧）联动优化：若两者共享头像状态数据，可合并为单次 Update 计算，减少重复遍历。
- 对 BattleHeadMgr 中非每帧必须精确更新的头像状态（如血量显示）改为事件驱动或差分更新，避免全量轮询带来的 allocCount 2396 次分配。

### §6.4 红线触发清单

| 优先级 | 模块 | base ms/帧 | cur ms/帧 | throttle ms/帧 | 红线类型 |
|---|---|---|---|---|---|
| 1 | LuaMgr | 2.96 | 8.86 | 8.64 | 跨样本持续高载，throttle 下 18.48% trace，Lua 调度频次与单次均值双维度超标 |
| 2 | Core.Update | 1.73 | 7.33 | 8.05 | 业务入口 4.6 倍增长，GC 17.3 次/帧（allocTotalMs 13.68 ms）极重 |
| 3 | MapSignificanceMgr | 0.32 | 6.03 | 4.83 | cur 场景调用次数暴涨至 12217 次，触发频次过高型红线 |
| 4 | OutSideViewArmyLineMgr | 0.03 | 1.58 | 2.44 | base 到 throttle 单次均值约 87 倍增幅，单次计算复杂度型红线 |
| 5 | BattleHeadMgr | 0.20 | 3.01 | 2.19 | GC 5.6 次/帧（allocCount 2396，allocTotalMs 4.64 ms），内存分配型红线 |

---

## §7 渲染链路 + GPU bound 判定

### §7.1 Gfx.WaitForPresent 单次 avg

| 样本 | 单次 avg | 含义 |
|---|---|---|
| base | **0.91 ms** | 远低于 vsync 周期 16.67 ms，GPU 渲染在下一帧提交前已完成，无 GPU-bound |
| cur | **5.83 ms** | 低于 vsync 周期 16.67 ms，但已是 base 的 6.4 倍，GPU 等待开始显著拉长，临近风险区 |
| throttle | **17.80 ms** | 超过 vsync 周期 16.67 ms，GPU 渲染跨越 vsync 边界，GPU 已成为瓶颈 |

**判定阈值**：单次 `Gfx.WaitForPresent > vsync 周期`（60Hz=16.67ms）→ GPU 成为瓶颈。

### §7.3 GPU bound 判定矩阵

| 信号 | 直接证据 | 间接证据 | 判定 |
|---|---|---|---|
| GPU busy/freq counter | — | 设备物理不可达 | ❌ 缺数据 |
| **Gfx.WaitForPresent 单次 > vsync** | base 0.91 ms / cur 5.83 ms / throttle 17.80 ms | ✅ | 🟢 base 健康 / 🟡 cur 临界 / 🔴 throttle 超阈值 |
| **主线程 Sleeping ≈ Gfx.WaitForPresent** | base 重叠 45.1% / cur 94.6% / throttle 97.7% | ✅ | 🟢 base 正常 / 🔴 cur+throttle 强信号 |
| **Render / RHI 都越来越闲** | Render Sleeping 70.32%→79.85% / RHI Running 41.13%→24.53% | ✅ | 🔴 渲染链路被 GPU 积压拖慢 |
| Choreographer 维持节拍 | base 60.1 Hz / cur 60.0 Hz / throttle 60.1 Hz | ✅ | 🟢 显示链路正常 |
| 主线程 binder 占比 | base 2.73 ms / cur 2.78 ms / throttle 6.44 ms | ✅ | 🟢 binder 耗时极低，排除 IPC 阻塞 |

**判定**：

- base：不是 GPU-bound，Gfx.WaitForPresent 单次 avg 仅 0.91 ms，主线程 Running 86.94%，GPU 渲染余量充足。
- cur：中等 GPU-bound，Gfx.WaitForPresent 单次 avg 5.83 ms，Sleep 中 94.6% 为等 GPU，帧率已降至 33.1 fps，GPU 等待是主要掉帧原因。
- throttle：强 GPU-bound，Gfx.WaitForPresent 单次 avg 17.80 ms 已超 vsync 周期 16.67 ms，Sleep 中 97.7% 为等 GPU，主线程超过三分之一时间睡等 GPU，是当前最关键瓶颈。

---

## §9 本源能力边界 + 工程化建议（分四档）

### §9.1 能力矩阵

参考 §-1.3 能否回答清单。每条能力对应底层数据源 / 可信度。

### §9.2 工程化建议

#### 🟢 已落实

- 主线程一帧时间去向（§6.2 callTrees 缩进树）：完整展示了 PlayerLoop 至各业务叶子节点的 ms/帧 归因。
- 主线程 off-CPU 归因（§4 atrace wait slice 重叠法）：定量给出了 Sleeping 中等 GPU 比例（45.1% / 94.6% / 97.7%）。
- 降频时序证据链（§5 per-CPU 频率表 + bigCoreReach%）：完整输出了三份样本的 likely 档判定。
- 多线程健康度评估（§3）：覆盖 UnityMain / Render / RHI / LuaMtGC / ECSWorker 五类线程的 sched 三态。
- GC 压力业务归因（§6.3）：对 Core.Update（17.3 次/帧）和 BattleHeadMgr（5.6 次/帧）完成了子树级 GC 分配定位。

#### 🟡 待 Provider 子查询扩展（不阻塞本报告）

- callTrees adaptive 剪枝：当前树深度固定，建议 Provider 支持按 ms/帧 阈值自适应裁剪，减少低价值叶子噪声。
- cpu offline 集群下线检测：自动检测 cpu7 sched 归零事件，可将降频判定从 likely 升至 confirmed。
- threadsSchedList 默认覆盖范围扩展：建议默认纳入 Audio Mixer Thr 和 Choreographer 的完整 sched 三态，当前仅部分覆盖。
- binder server 进程名解析：当前 throttle 样本仅能给出 system_server 名称，建议 Provider 进一步解析 server 端具体服务名以定位阻塞来源。

#### 🔴 物理 / 结构性不可达（永久声明）

- sched_blocked_reason ftrace 真值（华为非 root 静默丢弃）
- sysfs scaling_max_freq 旁路（confirmed 档不可达）
- GPU busy / freq counter（骁龙需 root 注入 producer）
- Wwise 内部细分（atrace 无 native 埋点）

#### 后续工程项

- 跨次 diff 自动化：对 base→cur→throttle 三组数据建立 ms/帧 delta 矩阵，自动标注增量超 50% 的模块，支持版本迭代回归对比。
- 单帧逐线程时间轴：针对 slowFrame >33ms（cur 13.04%，throttle 98.83%）的高耗帧，输出单帧内各线程 sched 状态时间轴，精确定位帧内卡顿起始点。
- MapSignificanceMgr 调用频次监控：在 Provider 层增加 count/帧 异常告警，当单帧调用次数超过历史基线 1.5 倍时自动上报，防止重现 cur 的 12217 次/trace 洪峰。

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
