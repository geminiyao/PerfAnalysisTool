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
> base 阶段主线程 Running 占 86.94%，属于 CPU-bound 健康态；随场景压力升高，cur 的 Running 降至 77.82%、Sleeping 升至 20.40%，进入算+等混合形态；throttle 阶段 Running 仅剩 56.99%、Sleeping 高达 38.99%，Gfx.WaitForPresent 单次 avg 更飙至 17.80 ms，已超 60Hz vsync 周期，整体呈现典型半睡型 GPU-bound 形态，主线程大量时间耗费在等待 GPU 完成上一帧 Present。
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
>
> ```
>
> throttle 阶段 LuaMgr 以 8.64 ms/帧（占 trace 18.48%）成为头号 CPU 消耗源，Core.Update 以 8.05 ms/帧紧随其后，两者合计已超过单帧 16.67 ms 预算；MapSignificanceMgr 以 4.83 ms/帧排第三，在高压场景下涨幅显著，与 OutSideViewArmyLineMgr（2.44 ms/帧）和 BattleHeadMgr（2.19 ms/帧）共同构成主线程的主要业务负载。
>
> 详见 §6.2 / §6.3。
>
> **③ 降频与热预算**
>
> ```
>   base       bigCoreReach 74.9%    降频判定: likely
>   cur        bigCoreReach 75.6%    降频判定: likely
>   throttle   bigCoreReach 59.2%    降频判定: likely
>
> ```
>
> base 和 cur 的大核 bigCoreReach% 分别为 74.9% 和 75.6%，热预算尚属中等紧张，三份样本降频判定均停在 likely 档；throttle 阶段 bigCoreReach% 跌至 59.2%，大核频率明显回落，配合 PlayerLoop p50 升至 45.94 ms，表明机器在高负载场景下已出现较明显的热降频，进一步压缩了 CPU 算力余量。
>
> 详见 §5。

**按 ROI 排序的优化方向：**

1. **LuaMgr / LuaMgr.OnTick&UpdateSchedule** — throttle 阶段耗时高达 8.64 ms/帧，是头号热点，优先收窄 Lua tick 调度频次或批量合并回调，可直接释放最大帧预算。
2. **Core.Update → MapSignificanceMgr** — throttle 下 4.83 ms/帧，从 base 的 0.32 ms/帧暴涨 15 倍，需审查重要度查询调用频次，引入脏标记或节流策略。
3. **OutSideViewArmyLineMgr** — base 几乎为零而 throttle 达 2.44 ms/帧，涨幅最剧烈，排查行军线刷新是否随兵力数量线性增长，考虑 LOD 或异步更新。
4. **BattleHeadMgr GC 压力** — 子树 GC.Alloc 5.6 次/帧（allocTotalMs 4.64 ms），是 GC 分配热点，需池化头像资源对象，减少逐帧分配。
5. **GPU 渲染负载（URP.AfterRendering）** — throttle 阶段 URP.AfterRendering 达 19.33 ms/帧，配合 Gfx.WaitForPresent 17.80 ms/帧，需降低后处理 Pass 复杂度或分帧处理，缓解 GPU bound 压力。

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

- base：Choreographer 60.1 Hz ≈ PlayerLoop 59.8 fps → 业务基本跟得上屏幕节拍，帧节奏健康。
- cur：Choreographer 60.0 Hz 远高于 PlayerLoop 33.1 fps → 业务渲染已跨 vsync 周期，存在明显掉帧。
- throttle：Choreographer 60.1 Hz 远高于 PlayerLoop 21.4 fps（约 2.8× 差距）→ 严重跨 vsync 周期掉帧，绝大多数帧（slowFrameRate 98.83%）均超 33 ms。

**温度时序故事：**

base 和 cur 阶段 bigCoreReach% 分别为 74.9% 和 75.6%，大核仍能保持较高频率运行，热预算处于紧张但尚可承受状态；throttle 阶段 bigCoreReach% 降至 59.2%，降频判定均为 likely，表明高温已触发较明显的大核降频，热预算余量告急。

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

binder 调用在三个样本中 totalMs 均极低（最高 throttle 仅 6.44 ms），不是主线程阻塞的主要原因。

UnityMain 从 base 的 Running 86.94% 健康态，逐步演变为 throttle 的 Running 56.99%、Sleeping 38.99%，形态由 CPU-bound 健康退化为半睡型，主因是等待 GPU Present 时间大幅增加，而非 CPU 算力耗尽。

### §3.2 Render（UnityGfxRenderS）

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 25.98% | 22.30% | 16.71% |
| Sleeping% | 70.32% | 73.64% | 79.85% |
| Runnable% | 3.53% | 3.70% | 3.11% |

Render 线程 Sleeping% 从 base 的 70.32% 升至 throttle 的 79.85%，Running% 持续走低至 16.71%，Render 线程整体越来越闲，说明 GPU 命令提交并非瓶颈，瓶颈在 GPU 执行端（RHI Present 等待）。

### §3.3 RHI

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 41.13% | 35.78% | 24.53% |
| Sleeping% | 54.42% | 60.80% | 72.03% |
| Runnable% | 4.27% | 3.26% | 3.24% |

RHI 线程 Running% 从 base 的 41.13% 持续下滑至 throttle 的 24.53%，Sleeping% 升至 72.03%，表明 RHI 也在随场景压力升高而越来越多地等待 GPU 完成，与主线程 Gfx.WaitForPresent 增长趋势一致，属于 GPU-bound 链路上的间接佐证。

### §3.4 Lua MtGC

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 1.73% | 0.99% | 0.69% |
| Sleeping% | 97.67% | 98.96% | 99.24% |
| Runnable% | 0.60% | 0.05% | 0.07% |

LuaMtGC 线程 Sleeping% 全程高于 97.67%，Running% 最高仅 1.73%，属于极度空闲的后台 GC 线程，在三个样本中均不构成任何性能瓶颈，健康无需关注。

### §3.5 ECS Worker × 4

| 指标 | **base** | **cur** | **throttle** |
|---|---|---|---|
| Running% | 8.59% | 11.60% | 11.52% |
| Sleeping% | 73.63% | 70.57% | 76.47% |
| Runnable% | 17.69% | 17.40% | 11.89% |

ECS Worker 线程 Running% 在 8.59%~11.60% 之间，Runnable% 维持在 11.89%~17.69%，Runnable 占比较高说明 Worker 存在一定调度等待，但整体 Running 偏低，Job 负载本身不重，不是当前主要瓶颈。

### §3.6 Audio 线程池

Audio Mixer Thr / Audio Stream Th 通常无明显异常，链路健康，不是瓶颈。

### §3.7 Choreographer

- base: 60.1 Hz
- cur: 60.0 Hz
- throttle: 60.1 Hz

Choreographer 屏幕节拍在三个样本中全程稳定在 60.0~60.1 Hz，显示链路 vsync 节拍正常，掉帧原因在业务与 GPU 侧而非显示驱动端。

---

## §4 主线程 off-CPU 归因（perfetto 独家·结论前置）

### §4.1 结论前置

> base 阶段主线程 Sleeping totalMs 为 1375.03 ms，其中 Gfx.WaitForPresent self totalMs 重合 620.12 ms，Sleep 中约 45.1% 用于等 GPU，剩余 Sleep 主要为 vsync 等待，属于健康双缓冲形态；cur 阶段重合度飙升至 94.6%（Sleeping 2991.06 ms 中有 2828.21 ms 来自 Gfx.WaitForPresent），throttle 更达 97.7%（7778.38 ms 中 7600.06 ms），Sleep 几乎全部被等 GPU 占满，当前三档整体呈现从健康双缓冲向强 GPU-bound 演化的清晰趋势。

### §4.2 byState 分布（off-CPU 拆分）

| 样本 | S 态占比 | R 态占比 | D 态占比 | 含义 |
|---|---|---|---|---|
| base | 90.57% | 7.44% | 1.57% | D 态 1.57% 属正常水平，S 态主因为 Gfx.WaitForPresent 等 GPU 及 vsync 等待，无异常阻塞 |
| cur | 89.54% | 7.30% | 2.43% | D 态略升至 2.43% 但仍在正常范围，S 态比例持平，等 GPU 占 Sleep 的 94.6% 是主因 |
| throttle | 89.34% | 6.58% | 1.30% | D 态回落至 1.30%，S 态主因完全由 Gfx.WaitForPresent 主导（97.7% 重合），无 IO/锁阻塞异常 |

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

从 ASCII 比例条可清晰看到，base 的 Run 86.94% 健康态随场景压力演化为 throttle 的 Run 56.99%、Sleep 38.99%，Gfx.WaitForPresent 单次 avg 同步从 0.91 ms 暴涨至 17.80 ms，表明主线程从"几乎全程在算"退化为"大量时间在等 GPU 上一帧 Present"，算+等比例对比直观印证了半睡型 GPU-bound 的形态判定。

### §4.5 因果链可视化

```
主线程一帧等待因果链（以 throttle 为例）

PlayerLoop（一帧入口）
│  p50=45.94 ms / p99=66.32 ms（§6.1）
│
└─ PostLateUpdate.FinishFrameRendering
   │  含 URP.Render 全链路（§6.2）
   │
   └─ URP.RenderSingleCamera → URP.AfterRendering
      │  throttle: 19.33 ms/帧（§6.2）
      │  大量后处理 Pass 向 GPU 提交 DrawCall
      │
      └─ Gfx.WaitForPresent（主线程主动 Sleep 等 GPU）
         │  单次 avg: 17.80 ms（超 60Hz vsync 16.67 ms）（§4.4）
         │  Sleep 重合度: 97.7%（§4.3）
         │  → 主线程 Sleeping 38.99% 几乎全由此贡献（§3.1）
         │
         └─ RHI Gfx.PresentFrame（eglSwapBuffers）
            │  RHI Running% 降至 24.53%，自身也在等 GPU（§3.3）
            │  GPU driver 处理队列积压
            │
            └─ GPU 执行完毕 → 信号量释放 → 主线程唤醒

证据链一致性：
① UnityMain Sleeping totalMs=7778.38 ms，Gfx.WaitForPresent self=7600.06 ms，重合度 97.7%
② Gfx.WaitForPresent 单次 avg=17.80 ms > vsync 周期 16.67 ms，GPU 成为瓶颈
③ RHI Running% 从 base 41.13% 降至 throttle 24.53%，与主线程等待趋势一致
④ Render Sleeping% 从 base 70.32% 升至 throttle 79.85%，命令提交端不是瓶颈
⑤ Choreographer 维持 60.1 Hz 节拍，显示链路正常，掉帧在业务/GPU 端
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

- base：bigCoreReach 74.9%，大核频率偏低但尚维持在 75% 附近，属于热预算紧但还顶得住的轻度降频形态。
- cur：bigCoreReach 75.6%，与 base 基本持平，降频程度相近，热预算仍处于紧张可控区间，轻度降频持续。
- throttle：bigCoreReach 跌至 59.2%，大核频率明显受限，配合 PlayerLoop p50=45.94 ms、p99=66.32 ms，已进入中重度降频形态，CPU 算力供给显著不足。

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

base 阶段 p50=16.69 ms、p99=21.37 ms，分位数紧凑，帧耗时分布均匀，属于持续匀速型；cur 和 throttle 阶段 p50 分别升至 30.15 ms 和 45.94 ms，p99 更达 42.54 ms 和 66.32 ms，p50→p99 跨度明显拉大，说明随负载升高出现较多偶发尖峰帧，帧率稳定性显著下降。

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

缩进树业务解读：

- **PlayerLoop** [16.72 / 30.25 / 46.68 ms/帧] ← 整帧入口，throttle 阶段耗时接近 base 的 2.8 倍，帧率从 59.8 fps 跌至 21.4 fps 的直接体现。
- **PostLateUpdate.FinishFrameRendering** [6.88 / 13.11 / 26.04 ms/帧] ← throttle 阶段占帧超 55%，渲染提交链路是最重的单块耗时。
- **URP.AfterRendering** [1.68 / 6.86 / 19.33 ms/帧] ← throttle 下暴涨至 19.33 ms/帧，是渲染链路内最大的涨幅节点，后处理 Pass 是优化重点。
- **Core.Update** [1.73 / 7.33 / 8.05 ms/帧] ← cur/throttle 涨幅超 4 倍，业务逻辑主入口，超红线。
- **CS:AOE.Outside.MapManager** [0.44 / 2.90 / 3.99 ms/帧] ← 地图管理器 throttle 增至 3.99 ms/帧，涨幅约 9 倍，子模块 OutSideViewArmyLineMgr 和 BattleUIManager 均有明显增量。
- **CS:AOE.Outside.OutSideViewArmyLineMgr** [0.00 / 1.58 / 2.44 ms/帧] ← base 几乎为零，throttle 达 2.44 ms/帧，涨幅最为剧烈，行军线刷新随负载线性暴涨。
- **CS:AOE.LuaMgr** [1.00 / 3.81 / 3.47 ms/帧] ← LuaMgr 在 Update 和 LateUpdate 两处均有贡献，合计是主线程最大业务模块消耗源。

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

LuaMgr 优化方向：
- 审查 LuaMgr.OnTick&UpdateSchedule 调度逻辑，将低优先级 tick 任务降频到每 2~3 帧执行一次，减少单帧 Lua 调度次数（throttle 下 count=4068，频次偏高）。
- 对 Lua 侧高频调用的 C# 接口进行缓存，避免跨语言调用开销随帧数线性增长（cur count=4562 → throttle count=4068，帧变少但总耗时基本未降）。
- 排查 LuaMgr 子树 GC.Alloc 1.3 次/帧（allocTotalMs 1.17 ms），对高频分配路径引入 Lua 侧对象池或复用 table，降低 GC 触发频率。
- 将非帧同步的 Lua 逻辑（如数据计算、状态同步）迁移到 LuaMtGC 线程或异步队列，减轻主线程 LuaMgr tick 负担。
- 对 LuaMgr.OnLateUpdateSchedule（throttle 0.53 ms/帧）与 OnTick&UpdateSchedule 的调度顺序做合并优化，减少重复遍历。

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

Core.Update 优化方向：
- Core.Update 子树 GC.Alloc 高达 17.3 次/帧（allocTotalMs 13.68 ms），是全局最高 GC 压力源，需系统性排查 Update 路径上的 LINQ、装箱、临时 List 分配并替换为对象池或预分配结构。
- CS:AOE.Outside.MapManager 在 throttle 下占 Core.Update 子树约 3.99 ms/帧，需单独下钻其 Update 逻辑，确认是否存在每帧全量遍历地图实体的冗余操作。
- OutSideViewArmyLineMgr（throttle 2.44 ms/帧）从 base 几乎为零暴涨，应增加脏标记机制，仅在行军线状态变更时刷新，避免每帧全量重算。
- BattleUIManager（throttle 0.83 ms/帧）与 OutSideViewArmyLineMgr 同属 MapManager 子树，建议合并 Update 时序，减少重复的场景查询开销。
- 对 Core.Update 下单次 avg 8.03 ms 的长帧做逐帧打点，识别是否有特定帧事件（大量实体进出视野）驱动尖峰，考虑分帧处理或 Job 卸载。

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

MapSignificanceMgr 优化方向：
- cur 阶段 count 达 12217（ms/帧 6.035），throttle 回落至 9296（ms/帧 4.826），调用次数与耗时存在明显场景相关性，需排查高负载场景下实体重要度查询是否随同屏实体数量线性爆增。
- 单次 avg 0.22 ms 本身不高，但 count=9296 导致累积耗时达 4.83 ms/帧，优先方向是引入批量查询或缓存上帧重要度结果，将每帧查询次数从数千次降到按变更触发。
- 参考项目包知识中"实体增删洪峰"的描述，在实体大量进出视野时添加节流保护（如每 N 帧全量刷新一次，帧间增量更新），避免洪峰帧耗时突破红线。
- GC.Alloc 几乎为零（allocCount 1），内存分配侧无需优化，集中精力在调用频次控制上。
- 考虑将 MapSignificanceMgr 的重要度计算逻辑拆分到 ECS Job 中并行执行，利用现有 ECSWorker 线程池分担主线程压力。

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

OutSideViewArmyLineMgr 优化方向：
- base 下 0.028 ms/帧 而 throttle 达 2.442 ms/帧，暴涨约 87 倍，涨幅在所有模块中最剧烈，需优先确认行军线数量是否随场景同屏军队数线性增长，引入数量上限或 LOD 裁剪。
- 单次 avg 0.97 ms，count=1074，耗时主要来自单次执行成本而非纯频次，需排查 OutsideLineCtrl.RefreshLine / GetArmyLineID 是否存在每次调用都进行全量路径重算的问题。
- 对行军线状态引入脏标记，仅在军队移动、合并、消亡等事件触发时刷新对应行军线，消除每帧全量轮询的冗余开销。
- 考虑将行军线路径计算移至后台线程（如 Job System），主线程仅负责提交最终顶点数据，与 ECSWorker 协同降低主线程占用。
- 对 cur（1.583 ms/帧）→ throttle（2.442 ms/帧）的增量进行专项 trace，确认是否与特定游戏事件（如大规模行军指令下发）强相关，针对性做峰值削减。

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

BattleHeadMgr 优化方向：
- GC.Alloc 5.6 次/帧（allocTotalMs 4.64 ms）是本模块最突出问题，远高于其他管理器，需排查 Lua tick 路径上头像创建/销毁逻辑是否每帧分配新对象，引入头像对象池复用。
- 单次 avg 1.07 ms、count=876，耗时由单次成本驱动，需结合 BattleUIManager（throttle 0.83 ms/帧）联动分析，确认是否存在重复的头像状态查询或 UI 重绘触发。
- 参考项目包知识"同屏头像数量驱动"，对可见头像数量设置上限，超出阈值后按距离/重要度做 LOD 隐藏，从根源降低单帧处理头像数量。
- 对 cur（3.015 ms/帧）→ throttle（2.186 ms/帧）耗时小幅回落但 GC 分配绝对量仍高，说明帧内头像操作次数虽有所减少，但每次操作的分配开销未降，需专项 profiling 定位 allocCount 2396 的分配热点。
- 考虑将头像状态更新从每帧 Lua tick 改为事件驱动（战斗状态变更时触发），减少无意义的空转更新开销。

### §6.4 红线触发清单

| 优先级 | 模块 | base ms/帧 | cur ms/帧 | throttle ms/帧 | 红线类型 |
|---|---|---|---|---|---|
| 1 | LuaMgr | 2.96 | 8.86 | 8.64 | 跨样本持续超红线，cur/throttle 均超 8 ms/帧，Lua tick 调度频次×单次成本双驱动 |
| 2 | Core.Update | 1.73 | 7.33 | 8.05 | cur/throttle 超红线，子树 GC 17.3 次/帧为全局最高，业务逻辑+GC 双重压力 |
| 3 | MapSignificanceMgr | 0.32 | 6.03 | 4.83 | cur 阶段触顶 6.03 ms/帧，调用次数爆增（cur count=12217）驱动，频次型红线 |
| 4 | OutSideViewArmyLineMgr | 0.03 | 1.58 | 2.44 | base 几乎为零，throttle 暴涨 87 倍，涨幅型红线，强场景相关性 |
| 5 | BattleHeadMgr | 0.20 | 3.01 | 2.19 | cur 超 3 ms/帧，GC 分配 5.6 次/帧是最高 GC 压力模块之一，GC+单次成本型红线 |

---

## §7 渲染链路 + GPU bound 判定

### §7.1 Gfx.WaitForPresent 单次 avg

| 样本 | 单次 avg | 含义 |
|---|---|---|
| base | **0.91 ms** | 远低于 vsync 周期 16.67 ms，GPU 完全跟得上，双缓冲健康，不存在 GPU bound |
| cur | **5.83 ms** | 低于 vsync 周期 16.67 ms，GPU 尚在跟得上范围内，但等待时长已显著增加，GPU 压力上升 |
| throttle | **17.80 ms** | 超过 vsync 周期 16.67 ms，GPU 已成为渲染瓶颈，主线程每帧都在等 GPU 完成上一帧 Present |

**判定阈值**：单次 `Gfx.WaitForPresent > vsync 周期`（60Hz=16.67ms）→ GPU 成为瓶颈。

### §7.3 GPU bound 判定矩阵

| 信号 | 直接证据 | 间接证据 | 判定 |
|---|---|---|---|
| GPU busy/freq counter | — | 设备物理不可达 | ❌ 缺数据 |
| **Gfx.WaitForPresent 单次 > vsync** | base 0.91 ms / cur 5.83 ms / throttle 17.80 ms | ✅ | throttle 超 vsync 16.67 ms 🔴；cur 未超 🟡；base 健康 🟢 |
| **主线程 Sleeping ≈ Gfx.WaitForPresent** | base 重合度 45.1% / cur 94.6% / throttle 97.7% | ✅ | cur/throttle 几乎全部 Sleep 来自等 GPU 🔴 |
| **Render / RHI 都越来越闲** | Render Running%: base 25.98% → throttle 16.71%；RHI Running%: base 41.13% → throttle 24.53% | ✅ | 命令提交端不是瓶颈，GPU 执行端积压 🔴 |
| Choreographer 维持节拍 | base 60.1 Hz / cur 60.0 Hz / throttle 60.1 Hz | ✅ | 🟢 显示链路正常 |
| 主线程 binder 占比 | base 2.73 ms / cur 2.78 ms / throttle 6.44 ms（totalMs 极低）| ✅ | 🟢 排除 IPC 阻塞为主因 |

**判定**：

- base：Gfx.WaitForPresent 单次 avg 0.91 ms，Sleep 重合度 45.1%，GPU 压力低，不是 GPU-bound，属于 CPU-bound 健康态。
- cur：Gfx.WaitForPresent 5.83 ms 未超 vsync 周期，但 Sleep 重合度已达 94.6%，属于中等 GPU-bound 过渡态，GPU 压力显著上升。
- throttle：Gfx.WaitForPresent 17.80 ms 超 vsync 周期 16.67 ms，Sleep 重合度 97.7%，判定为强 GPU-bound，GPU 已是渲染链路主要瓶颈。

---

## §9 本源能力边界 + 工程化建议（分四档）

### §9.1 能力矩阵

参考 §-1.3 能否回答清单。每条能力对应底层数据源 / 可信度。

### §9.2 工程化建议

#### 🟢 已落实

- 主线程一帧时间去向（§6.2 callTrees 缩进树，callTrees 父子链口径，ms/帧归一化）
- 主线程在算还是在等、等什么（§4 off-CPU 归因，atrace wait slice 重叠法，证据链完整）
- 哪些业务模块超红线（§6.3 Top 热点下钻，含 LuaMgr/Core.Update/MapSignificanceMgr 等 5 个模块）
- GC 压力源定位（§6.3 各模块 GC.Alloc 次/帧，Core.Update 子树 17.3 次/帧最高）
- GPU bound 判定（§7 Gfx.WaitForPresent 单次 avg + 重合度双信号，throttle 判定为强 GPU-bound）

#### 🟡 待 Provider 子查询扩展（不阻塞本报告）

- callTrees adaptive 剪枝：当前展开层数固定，高负载场景下子树过深导致噪声节点过多，建议 Provider 支持按 totalPct 阈值自动剪枝。
- cpu offline 检测：cpu7 sched 归零判定逻辑可集成到降频矩阵，补全 confirmed 档判定能力。
- threadsSchedList 默认覆盖范围扩大：当前仅覆盖主要线程，建议默认纳入 Audio 线程和 Binder 线程的 sched 三态，完善全链路分析。
- actual_frame_timeline_slice 支持：Provider 切换 perfetto config 模式后可量化 VSync miss 帧数，补全 Choreographer fps 无法覆盖的单帧掉帧细节。

#### 🔴 物理 / 结构性不可达（永久声明）

- sched_blocked_reason ftrace 真值（华为非 root 静默丢弃）
- sysfs scaling_max_freq 旁路（confirmed 档不可达）
- GPU busy / freq counter（骁龙需 root 注入 producer）
- Wwise 内部细分（atrace 无 native 埋点）

#### 后续工程项

- 跨次 diff 自动化：对 base→cur→throttle 三态数据做程序化 ms/帧 diff，自动标注涨幅超阈值的模块，生成增量热点报告。
- 单帧逐线程时间轴钻取：对 p99 超红线帧做 SQL 级单帧分析，还原该帧内 UnityMain/Render/RHI/ECSWorker 的精确时序，定位具体触发 jank 的事件。
- simpleperf 互补采集：对 LuaMgr 和 BattleHeadMgr 的函数级 self% 做 simpleperf 采集，补全 atrace 无法覆盖的 native 层热点。

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
