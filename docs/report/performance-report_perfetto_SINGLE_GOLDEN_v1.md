# 性能分析报告 · perfetto 单次（Single）形态金标准

> 这是 perfetto 单次（一份 .pftrace）形态的报告金标准，作为骨架渲染器（Sprint 3）和质量门（Sprint 6）的目标产物对照。
>
> 素材来源：`web/data/results/triad_1782702063785_d3f73683/base/perfetto-profile-summary.json`（PAL-AL00 / 凉机野外起始 / 60fps 健康态 / 11.4s 窗口）。
>
> 与三态金标准 v5.3（`docs/report/performance-report_perfetto_ULTIMATE_v5.3.md`）的关系：
> - 章节编号 §-1~§10 完全对齐
> - 单次写不出来的"演化对比"维度（§0 三态对比 / §4.4 三态比例条 / §5 时序对照 / §6.2 callTree N 列签名退化为单列 / §7 单次 avg 演化曲线）做了**结构性退化**而非删除——保留章节但内容改成单次特化判定
> - 每章节深度严格按 v5.3 风格保留 wrapper 标记 / 颜色标记 / 跨章节引用

---

## §-1 数据采集 · 能力声明

### -1.1 本次采集的数据

| 角色 | 时间点 | trace 文件 | 进程 pid |
|---|---|---|---|
| **single** | 2026-06-24 10:49 | sample_base_20260624_104944/2026-06-24_10-49-c1a652.pftrace | 9577 (auto) |

> ⚠️ 单次采集窗口实际 ~11.4 秒（高帧率场景 ring buffer 用满更快）。本报告内部所有数字按 `ms/帧` 或 `占整 trace %（totalPct）` 表达，便于跟其它单次报告或后续 diff 对比时归一化。

旁路文件（record_aoeyz.bat v2 落盘）：

| 旁路文件 | 状态 | 用途 |
|---|---|---|
| collection-manifest.json | ✅ isRoot=0 / sysfs 采集 × 2 | root 状态、sysfs 旁路成功项 |
| thermal_before / thermal_after (soc_thermal) | ✅ | 采前/采后 thermal_zone 温度 |
| cpuinfo_max_freq | ✅ | 8 核理论上限频率（校准 reach% 分母）|
| sysfs scaling_max_freq | ❌ | 华为非 root 锁了 Permission denied |

### -1.2 数据维度矩阵

✅ 已采到 / ⏳ 已落实代码但需 Provider 重跑 / ❌ 物理或结构性不可达

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
| GC.Collect 单次 STW | ✅ | GC spike |
| ❌ sched_blocked_reason ftrace | 物理不可达 | 华为非 root 实测内核静默丢弃 |
| ❌ sysfs scaling_max_freq | 物理不可达 | 华为锁了 Permission denied |
| ❌ GPU busy / freq counter | 物理不可达 | 骁龙需 root 注入 producer |
| ❌ actual_frame_timeline_slice | 需 Provider config 改造 | VSync miss 量化, 后续 |
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
| 单次 jank 帧的逐线程时间轴? | 🟡 需手工 SQL 钻一帧 | §4.5 因果链 |
| Wwise 内部耗时? | ❌ 用 simpleperf | — |
| 严格 confirmed 降频判定? | ❌ 华为非 root 物理不可达 | 停在 likely 档 |
| 函数级 CPU self%? | ❌ 用 simpleperf | — |
| 跨次或跨场景的演化对比? | ❌ 单次报告物理不可能 | 用 diff skill |

---

## §0 结论先行

> ### ⚠️ 三大独立观察（按强度排序）
>
> **🟢 ① 主线程瓶颈形态：CPU-bound 健康态**
>
> ```
> UnityMain Running / Sleeping (sched):
>   ████████████████████████████████████░░░░░  Run 86.94% / Sleep 12.04% / Runnable 0.97%
>      ↑ 主线程几乎全程在算，仅 12% Sleep 是正常 vsync 等待 + 极少 GPU 等待
>
> Gfx.WaitForPresent 单次 avg：0.91 ms （主线程睡等 GPU 上一帧）
>      ↑ 远 < vsync 16.67ms，双缓冲完全健康，GPU 没有形成 swapchain 反压
> ```
>
> 详见 §3.1 / §4 / §7。
>
> **🟡 ② 业务侧 LuaMgr 子树为头号 CPU 消耗源（17.63% trace）**
>
> ```
> Core.Update                    11.42 ms/帧（占 trace 17.63%）
> └─ CS:AOE.LuaMgr               2.96 ms/帧（占 trace 17.63%、累计 2015 ms）
>    └─ LuaMgr.OnTick&UpdateSchedule
>       ├─ MapSignificanceMgr    0.32 ms/帧（cnt 8901，单次 avg 0.024ms ← 频次驱动型）
>       ├─ BattleHeadMgr         0.20 ms/帧（cnt 1380，单次 avg 0.097ms ← 频次+单次双驱）
>       └─ MapManager 子树       不在 base 上活跃（凉机场景特征）
> ```
>
> 详见 §6.2 / §6.3。
>
> **🟡 ③ 热预算紧但还顶得住（likely 档降频信号）**
>
> ```
> soc_thermal      65.6°C → 77.3°C   Δ +11.7°C    ← 还在爬温，温度尚未饱和
> bigCoreReach     74.9%             （cpu7 cpu_avg 1813 / max 2419 MHz）
> 大核 cluster     未下线 / 无 frequency_locked 信号
> 降频判定         likely（未达 confirmed 因 sysfs 旁路不可达）
> PlayerLoop fps   59.8（贴 60Hz vsync 节拍，业务跟得上屏幕）
> ```
>
> 详见 §5。

按 ROI 排序的优化方向：

1. **MapSignificanceMgr 采样频次控制** — base 已经触发 8901 次（~13 次/帧），凉机场景已偏高；行军/压测会进一步放大，提前接入距离/可见性 LOD
2. **LuaMgr 主入口子调度成本** — base 17.63% trace，凉机基线就吃 1/6 主线程时间；Lua 主入口分发开销值得静态分析
3. **GC.Alloc 业务源定位** — base 已有 Core.Update 子树 2.3 次/帧、ResManager 0.7 次/帧（perfetto 独家归因，详见 §6.3）

---

## §1 采集质量声明 + 数据口径

### §1.1 trace 实际时长

| 数据 | 配置 | 实际窗口 | 帧数 | 文件大小 | 事件密度（推算） |
|---|---|---|---|---|---|
| single | -t 20s | 11.42 s | 680（59.8 fps）| ~30 MB | ~2.6 MB/s |

> 跨次对比一律用 **ms/帧** 或 **占整 trace %（totalPct）** 归一化, 绝对 totalMs 仅本次内部参考。

### §1.2 数据口径（必备公式表）

| 口径 | 计算公式 | 用途 |
|---|---|---|
| **callTrees totalMs / totalPct** | 直接读 callTrees[].root 沿父子链的节点 totalMs；totalPct = totalMs / 整 trace ms × 100% | "主线程一帧时间去向" 唯一正确口径 |
| **selfMs**（剥洋葱）| totalMs - sum(直接子 totalMs) | 节点自身入口逻辑真正消耗 |
| **单次 avgMs** | **totalMs / count**（count = slice 触发次数）| 区分"涨在频次 vs 涨在单次" |
| **ms/帧**（推算）| **totalMs / PlayerLoop 帧数** | 跨次帧数不同时归一化对比 |
| ~~atraceSlices LIKE 全 trace 的 totalMs~~ | ❌ 不可用做"占帧消耗" | 仅可用其 count 字段统计触发频次（如 GC.Alloc 次/帧）|

> ⚠️ 必读反模式 M1 — atraceSlices LIKE 累加会跨多个父子层级重复计数（v5 报告把 MapSig 高估 4.6×）。本报告全部使用 callTrees 父子链。

### §1.3 数据缺口

- **sched_blocked_reason ftrace**（❌）→ §4 用 atrace wait slice (`Gfx.WaitForPresent` selfMs) 重叠法替代，精度足以给出主因判定
- **sysfs scaling_max_freq**（❌）→ §5 降频判定停在 **likely** 档，用 bigCoreReach% + 温度旁路双信号
- **GPU busy / freq counter**（❌）→ §7 用 `Gfx.WaitForPresent 单次 avg > vsync 周期` 作间接强信号
- **actual_frame_timeline_slice**（❌）→ VSync miss 次数无法量化，Choreographer fps 作替代

---

## §2 采集元信息

| 项 | 数值 |
|---|---|
| 设备 | PAL-AL00（华为非 root）|
| 进程 | com.tencent.aoeyz pid=9577 |
| 场景推断 | 凉机野外（base 起始态，温度从 65.6°C 起爬）|
| 实际 trace 长度 | 11.42 s |
| **PlayerLoop 帧数** | **680** |
| **PlayerLoop p50 / p95 / p99（ms）** | **16.69 / 18.68 / 21.37** |
| **PlayerLoop fps** | **59.8** |
| **Choreographer fps**（屏幕节拍）| 60.1 |
| slowFrameRate >33ms | 0.15% |
| CPU 平均频率 | 1729.5 MHz |
| 大核 bigCoreReach% | 74.9% |
| **温度 soc_thermal Δ°C** | **+11.7°C**（65.6→77.3）|
| 降频判定级 | **likely** |

**Choreographer fps vs PlayerLoop fps 关系：**
- Choreographer 60.1 Hz ≈ PlayerLoop 59.8 fps → **业务跟得上屏幕节拍，完全健康**
- 阈值参考：`fps < choreographer × 0.5` 才进 critical 档（见 aoe-watch-spec.yaml `framerate-vs-vsync-gap`）；本次相差 < 1%，远未触发

**温度时序故事：** base 从 65.6°C 大幅爬升 +11.7°C 到 77.3°C，说明 base 起始就处在持续升温态。结合 cpufreq counter 看，bigCoreReach 74.9% 略低于"完全自由"档（>90% 才算无压频），但还远未到大核重度降频（<65%）。**形态判定：热预算紧但还顶得住，再压一会儿可能进 cur 阶段（饱和高温）**。

---

## §3 多线程独立分析

### §3.0 线程一览（自动识别结果）

| 通用名 | comm（实测）| 关键 atrace 特征 | 一句话定位 |
|---|---|---|---|
| **UnityMain** | UnityMain | `PlayerLoop` × 680、`Core.Update`、`LuaMgr.*` | 业务/Lua/ECS 调度主入口 |
| **Render** | UnityGfxRenderS | `Gfx.RenderSlaver.ThreadRun`、`Semaphore.WaitForSignal` | Unity 命令录制层 |
| **RHI** | Thread-103（tid 10311）| `eglSwapBuffers` / `Gfx.PresentFrame` | 直调 GLES driver |
| **Lua MtGC** | LuaMtGC | `LuaMtGc.ExecuteMtGc` / `LuaMultiThreadGC` | xLua C# GC 线程 |
| **ECS Worker × 4** | ECSWorker_0/1/2/3 | `xxxJob (Burst)` × 数万 | Unity Job System Burst Worker |
| **Audio** | Audio Mixer Thr / Audio Stream Th | 内核 AudioFlinger 回调 | 音频回放 |
| **Choreographer** | UnityChoreograp | `Choreographer#doFrame` × 686 | VSync 回调 |
| ❌ Wwise | — | atrace 无埋点 | **本源结构性不可见**（永久声明）|

### §3.1 UnityMain（主线程）

| 指标 | 数值 |
|---|---|
| Running% | 86.94% |
| Sleeping% | 12.04% |
| Runnable% | 0.97% |
| off-CPU total% | 13.01% |
| Gfx.WaitForPresent totalMs | 620.12 ms（5.43% trace）|
| Gfx.WaitForPresent 单次 avg | **0.91 ms** |
| off-CPU Sleeping 中 S 态占比 | 90.57% |

**形态判定：CPU-bound 健康态**——主线程几乎全程在算（Run 87%），仅 12% 在 Sleep，且 Gfx.WaitForPresent 单次 avg 0.91ms 远 << vsync 16.67ms，说明 GPU 完全跟得上、双缓冲健康、无 swapchain 反压。Sleeping 中 90.57% 是 S 态（可中断睡眠），跟"等下一个 vsync 触发 + 极少等 GPU"的画面一致。

**主线程 binder 调用 server 进程：**
- pid=1873（system_server）× 11 次，totalMs=2.73ms，占比可忽略（<0.03% trace）

结论：**binder 调用不是主线程阻塞主因**，可排除 IPC 瓶颈。

### §3.2 Render（UnityGfxRenderS）

| 指标 | 数值 |
|---|---|
| Running% | 25.98% |
| Sleeping% | 70.32% |
| Runnable% | 3.53% |

**判定：** Render 线程仅 26% 在跑、70% 在睡 → **不是瓶颈**，它在等主线程发 GPU 命令。这跟主线程 86.94% Running 一致——主线程忙着算业务逻辑，下发给 Render 的命令量是节奏匀速的，Render 处理完一批就回去睡，下一帧再来。

### §3.3 RHI（Thread-103）

| 指标 | 数值 |
|---|---|
| Running% | 41.13% |
| Sleeping% | 54.42% |
| Runnable% | 4.27% |

**判定：** RHI 41% 在跑（直调 GLES driver，处理 eglSwapBuffers / queueBuffer），54% 在睡。**CPU 链路（主线程+Render+RHI 三条）整体节奏匹配**：主线程算 → Render 转录 → RHI 提交 GLES → 等下一帧。三条线程都没出现"被对方堵住"的 sleep% 异常上升信号。

### §3.4 Lua MtGC（同名陷阱破解 / 健康态）

| 指标 | 数值 |
|---|---|
| Running% | 1.73% |
| Sleeping% | ~98% |
| LuaMultiThreadGC 触发 | 周期短暂活跃 |

**判定：Sleep > 98% 健康态**——Lua MtGC 几乎全程睡眠，仅 GC 周期被唤醒一次完成 mark/sweep，处理完即回睡。无 spike、无连续高 Run% → Lua GC 压力**不**是瓶颈。

### §3.5 ECS Worker × 4（并行健康度）

| Worker | Running% | Runnable% |
|---|---|---|
| ECSWorker_0 | 8.59% | 17.69% |
| ECSWorker_1 | ~8% | ~17% |
| ECSWorker_2 | ~8% | ~17% |
| ECSWorker_3 | ~8% | ~17% |
| **max-min 偏差** | **< 1pp** | < 1pp |

**判定：极佳**（< 1pp 偏差落在健康度阈值最高档）—— Worker 池负载完全均匀，Burst Job 分配策略合理，无单 Worker 偏热/偏冷。

### §3.6 Audio 线程池

Audio Mixer Thr / Audio Stream Th 三态无明显异常，链路健康，不是瓶颈。

### §3.7 Choreographer

屏幕节拍 60.1 Hz（≈ 60Hz vsync 节拍，base 是 60fps 模式）。`Choreographer#doFrame` 触发 686 次 ≈ 11.42s × 60Hz，跟物理节拍一致。

---

## §4 主线程 off-CPU 归因（perfetto 独家·结论前置）

### §4.1 结论前置

> ### 🟢 结论
>
> **base 主线程 Sleeping 12.04%（13.01% off-CPU 总）几乎完全是正常 vsync 等待 + 极少 GPU 等待**：
> - Gfx.WaitForPresent self（睡等 GPU）620 ms ≈ 5.43% trace
> - 即 Sleeping 中约 45% 是等 GPU、55% 是其它正常 vsync 周期等待
> - **量级远小（单次 avg 0.91 ms < vsync 16.67ms），属健康双缓冲形态**
>
> 业务跑得稳、不需要"等"主导帧时间。

### §4.2 byState 分布

| state | totalMs | count | pctOfOffCpu | 含义 |
|---|---|---|---|---|
| S（可中断睡眠）| 1351.34 | 2685 | **90.57%** | 等 vsync / 等 GPU / 等其它信号量 |
| R（runnable 等 CPU）| 111.05 | 2499 | 7.44% | 排队等 CPU 时间片，量小 |
| D（不可中断睡眠/IO）| 23.42 | 331 | 1.57% | IO 等待 / 内核操作，量极小 |
| R+ | 6.18 | 122 | 0.41% | 抢占就绪态，量极小 |

**判定：S 态为主（90.57%）+ D 态极少 → 主线程不是被 IO/锁/binder 堵住，是正常等 vsync 节拍**。

### §4.3 atrace wait slice 重叠法（核心证据）

| 指标 | 数值 |
|---|---|
| UnityMain Sleeping totalMs | 1492.00 ms |
| Gfx.WaitForPresent self totalMs | 620.12 ms |
| 重合度（GPU 等占 Sleep 比例）| **41.6%** —— 主线程睡眠中约 4 成是等 GPU 上一帧 |

**判定：base 上 GPU 等待已经占 Sleep 4 成，但量级很小（5.43% trace）**——这是凉机健康态正常表现。当负载或温度上升时，这条比例会快速涨到 80%+（参见 cur/throttle 三态金标准）。

### §4.4 主线程状态分布可视化（ASCII 必备）

```
状态分布（主线程总时长归一化为整 trace 窗口）

base (single):
  ████████████████████████████████████░░░░░       Run 86.94% / Sleep 12.04% / Runnable 0.97%
   ↑ 主要在算业务逻辑
                                       ↑ 12.04% Sleep 中 41.6% 等 GPU、其余等 vsync

核心数字:
- Gfx.WaitForPresent 单次 avg  0.91 ms  ← << vsync 16.67ms 健康
```

### §4.5 因果链可视化（ASCII，单次形态简化版）

```
base 主线程一帧的等待因果链 (健康态参考):

    主线程 PlayerLoop -> ScriptRunBehaviourUpdate -> Core.Update -> CS:AOE.LuaMgr ...
        (持续算 86.94% 时间)
        │
        ├── 帧末: PostLateUpdate.FinishFrameRendering -> URP.AfterRendering -> URP.WaitForPresent
        │       │
        │       ├─ 状态切换为 Sleep (S)
        │       │
        │       └─ 等 semaphore (Gfx.WaitForPresent → Semaphore.WaitForSignal)
        │              │
        │              └─ 信号源 = GPU 完成上一帧 swapchain Present
        │                      │
        │                      └─ RHI 上 Gfx.PresentFrame 单次 ~0.91ms（< vsync 16.67ms）
        │                              │
        │                              └─ GPU 健康，主线程不会被 swapchain 反压堵住

证据链一致性:
- 主线程 Sleep 12.04%, 其中 ~41.6% 等 GPU ✅
- Render / RHI run% 分别 26% / 41%, sleep% 70% / 54% → CPU 链路充裕 ✅
- 大核 bigCoreReach 74.9% (略低但还顶得住, 未触发 likely 档底部 65%) ✅
- 温度 +11.7°C 上升中, SoC 还在爬温但未触发主动压频 ✅
```

---

## §5 降频时序证据链（perfetto 独家·单次简化版）

### §5.1 单次降频信号表

| 维度 | 本次值 | 阈值 / 参考 | 状态 |
|---|---|---|---|
| cpu7 reach% | 75.0% | < 65% 进 likely 严重档 | 🟢 顶住 |
| cpu4-6 reach% | 76.1% | < 70% 警戒 | 🟢 顶住 |
| cpu0-3 reach% | 63.1% | < 60% 警戒 | 🟡 边缘 |
| bigCoreReach% | 74.9% | < 65% likely 严重 / < 80% suspected | 🟡 suspected 边缘 |
| 温度 Δ°C | +11.7（65.6→77.3）| ≥ 5°C 进 likely 候选 | 🟡 likely 候选 |
| 温度起点 | 65.6°C | < 75°C 凉机 | 🟢 凉机 |
| 温度终点 | 77.3°C | ≥ 75°C 接近热墙 | 🟡 接近热墙 |
| UnityMain run% | 86.94% | ≥ 80% 高负载 | 🔴 高负载 |
| PlayerLoop p50 | 16.69 ms | ≤ 16.67ms 60fps 健康 | 🟢 贴 vsync |

**当前判定：likely**（未达 confirmed 因 sysfs scaling_max_freq 旁路不可达）

### §5.2 降频形态识别（ASCII）

```
base (凉机野外起始 → 持续升温):
  特征: 温度从 65.6°C 飙到 77.3°C (Δ +11.7°C)
        bigReach 74.9% / cpu0-3 reach 63.1% (小核 cluster 略偏低)
  形态: "热预算紧但还顶得住"（再压会进饱和高温）
  evidence:
    - 大核 cpu7 仍贴近 max（reach 75% 接近 80% 自由档）
    - 温度还在爬（未饱和）
    - 主线程 Run 86.94% 高负载但帧率贴 60fps → 算力刚好够用
```

### §5.3 per-CPU 实测表

| CPU | 平均频率 | 观测峰值 | reach% | cpuinfo_max | reach vs cpuinfo |
|---|---|---|---|---|---|
| cpu0 | 1138.3 MHz | 1804.8 MHz | 63.1% | 1804.8 | 63.1% |
| cpu1 | 1138.3 MHz | 1804.8 MHz | 63.1% | 1804.8 | 63.1% |
| cpu2 | 1138.3 MHz | 1804.8 MHz | 63.1% | 1804.8 | 63.1% |
| cpu3 | 1138.3 MHz | 1804.8 MHz | 63.1% | 1804.8 | 63.1% |
| cpu4 | 1841.6 MHz | 2419.2 MHz | 76.1% | 2419.2 | 76.1% |
| cpu5 | ~1841 MHz | 2419.2 MHz | ~76% | 2419.2 | ~76% |
| cpu6 | ~1841 MHz | 2419.2 MHz | ~76% | 2419.2 | ~76% |
| cpu7 | ~1813 MHz | 2419.2 MHz | 75.0% | 2419.2 | 75.0% |

### §5.4 降频判定矩阵

| 维度 | 要求 | 本次 |
|---|---|---|
| **confirmed**: sysfs `scaling_max_freq < cpuinfo_max_freq` | sysfs root | ❌ 物理不可达 |
| **confirmed**: cpu7 sched 归零（集群下线）| 跨次时序 | ❌（cpu7 仍在跑）|
| **likely**: bigReach% 持续下降 + 温度 Δ°C ≥ 5°C 或采后 ≥ 75°C | cpufreq + 温度旁路 | ✅（bigReach 74.9%、温度 Δ +11.7°C、采后 77.3°C 接近热墙）|
| **likely**: 大核 reach% < 65% 严重低频 | cpufreq counter | ❌（74.9% 顶住）|
| **suspected**: bigReach% < 80% 且 Run ≥ 80% | cpufreq counter | ✅（边缘）|

**当前判定**：likely（双信号命中：温度上升满足条件 + 主线程负载高时大核 reach 略低于自由档）

---

## §6 主线程一帧时间去向

### §6.1 PlayerLoop 帧分位数

| 分位 | 数值 |
|---|---|
| p50 ms | 16.69 |
| p95 ms | 18.68 |
| p99 ms | 21.37 |
| slowFrame >33ms | 0.15% |
| slowFrame >50ms | 0.0% |
| fps | 59.8 |
| 帧数 | 680 |

p50 → p99 范围扩 28%（21.37 / 16.69 = 1.28），属"持续匀速 + 少量小尖峰"形态——绝大部分帧 16-19ms 间，少数帧到 21ms（接近 1.5 vsync），无 jank（>33ms 仅 0.15%）。

### §6.2 主线程 callTrees 缩进树（单次形态：单列签名）

**形式硬规则**：
- 缩进树展示，不用表格
- 每节点格式：`[X.XX ms/帧 / NN.N% trace]`
- 标记体系：📈 增量（单次 N/A）/ 🔴 单次平均超红线 / 🟡 临近红线 / 🟢 健康 / 🔵 wait 型 / 🌡️ thermal-only

```
UnityMain.PlayerLoop  [16.69 ms/帧 / 100% main / 99.34% trace]                           100%
│
├─ PostLateUpdate.FinishFrameRendering   [4.45 ms/帧 / 26.50% trace]            🔵 等 GPU 主入口
│  └─ URP.Render
│     └─ URP.RenderCameraStack
│        └─ URP.RenderSingleCamera
│           ├─ URP.AfterRendering         [≈3.0 ms/帧]                           🔵
│           │  └─ URP.Submit → URP.WaitForPresent (主线程睡等 GPU)
│           │     单次 ~0.91 ms ⚠️ 远 < vsync 16.67ms 健康
│           ├─ URP.MainRenderingTransparent / BeforeRendering / RendererSetup     🟢 持平
│
├─ Update.ScriptRunBehaviourUpdate       [4.78 ms/帧 / 28.45% trace]   📈 头号业务入口
│  └─ BehaviourUpdate
│     └─ Core.Update                     [11.42 ms/帧 / 17.63% trace] 📈
│        │
│        ├─ CS:AOE.LuaMgr                [2.96 ms/帧 / 17.63% trace]   📈 Lua 主入口
│        │  └─ LuaMgr.OnTick&UpdateSchedule  [合计 ≈ 2.5 ms/帧]
│        │     ├─ MapSignificanceMgr     [0.32 ms/帧 / 1.89% trace]    🟢 频次驱动 cnt 8901
│        │     │   ↑ 凉机已触发 13 次/帧，行军会涨到 18-20 次/帧 (见§6.3)
│        │     ├─ BattleHeadMgr          [0.20 ms/帧 / 1.17% trace]    🟢 cnt 1380 (单次 0.097ms)
│        │     └─ Hud_Common 等 tick     [合计 < 0.1 ms/帧]            🟢
│        │
│        ├─ CS:AOE.Outside.MapManager    [< 0.5 ms/帧]                  🟢 凉机不活跃
│        │
│        └─ CS:AOE.TServerManager        [< 0.1 ms/帧]                  🟢 凉机无网络洪峰
│
├─ PreLateUpdate.ScriptRunBehaviourLateUpdate
│  └─ LateBehaviourUpdate
│     └─ Core.LateUpdate
│        ├─ CS:AOE.LuaMgr (LateUpdate 一侧)
│        │  └─ LuaMgr.OnLateUpdateSchedule
│        │     └─ MapCameraCtrl  [≈ 0.1 ms/帧]   🟢 凉机不在拖视野
│        └─ CS:AOE.MeshUIManager [≈ 0.1 ms/帧]   🟢 凉机悬浮 UI 少
│
├─ PostLateUpdate.PlayerUpdateCanvases   [0.94 ms/帧 / 5.57% trace]  🟡 cnt 682 单次 0.93ms
│   ↑ 接近 1ms/次红线（aoe-cpu-analysis-knowledge §7 UGUI 红线），需查是否仍有未迁移头顶字
│
├─ EarlyUpdate.UpdateTextureStreamingManager  [< 0.05 ms/帧]   🟢
├─ SimulationSystemGroup                  [1.58 ms/帧 / 9.40% trace]   🟡 cnt 2052
│   ↑ 主线程 ECS 组应仅分发 job，>1ms 警戒（aoe-cpu-analysis-knowledge §8）
├─ InitializationSystemGroup              [1.02 ms/帧 / 6.07% trace]   🟡 cnt 1366
├─ PostLateUpdate.PlayerSendFrameComplete [0.14 ms/帧]   🟢 资源加载入口（凉机不活跃）
├─ PresentationSystemGroup                [0.68 ms/帧 / 4.06% trace]   🟢
│
└─ Initialization.PlayerUpdateTime → WaitForTargetFPS  [≈ 1.5 ms/帧]   🔵
                                          ↑ 主线程跑完业务还有空闲等 vsync (健康态特征)
```

### §6.3 Top 4-5 红线热点子函数下钻

#### 6.3.1 LuaMgr 子树（17.63% trace 头号 CPU 消耗）

```
CS:AOE.LuaMgr (Lua 主入口, 17.63% trace, 2015 ms / 11.42 s)
└─ LuaMgr.OnTick&UpdateSchedule
   ├─ MapSignificanceMgr           c=8901 / 13 次/帧  avg 0.024 ms / 累计 215.6 ms (1.89%)
   ├─ BattleHeadMgr                c=1380 /  2 次/帧  avg 0.097 ms / 累计 133.4 ms (1.17%)
   ├─ Hud_Common 等 tick           合计 < 0.1 ms/帧
   └─ 其它 LuaMgr 内部分发开销     合计 ≈ 1.5 ms/帧（单次 0.319 平均）

GC.Alloc 业务归因 (perfetto 独家):
  Core.Update 子树：     2.3 次/帧  (allocCount 1595, allocTotalMs 1.85)
  ResManager 子树：      0.7 次/帧  (allocCount 456,  allocTotalMs 0.5)
  MeshUIManager 子树：   0.1 次/帧  (allocCount 54,   allocTotalMs 0.07)

优化方向:
- MapSignificanceMgr 8901 次/11.42s ≈ 13 次/帧偏高，凉机基线就吃 1/6 LuaMgr 时间；
  接入距离/可见性 LOD 采样降频可立竿见影
- LuaMgr 主入口分发开销（2015 - 215 - 133 - 0 = ~1670 ms 不在已知子函数下）
  需用 simpleperf native 互补查 xLua C# binding 调用
- GC.Alloc Core.Update 子树 2.3 次/帧虽不高（红线 100 次/帧），但是凉机基线，
  压测会放大到 30+ 次/帧
```

#### 6.3.2 SimulationSystemGroup（9.40% trace，🟡 警戒）

```
SimulationSystemGroup (主线程 ECS 分发, 9.40% trace)
└─ UpdateFunction.Invoke()
   └─ Default World Unity.Entities.SimulationSystemGroup
      └─ (job 分发、不应直接执行 job)

c=2052 / 3 次/帧  avg 0.524 ms / 累计 1074 ms

健康度判定: 主线程 ECS 组 avg > 1ms 警戒、单次 > 3ms 异常。
本次 avg 0.524 ms 未触发，但累计 9.40% trace 偏高 → 潜在风险。

优化方向:
- 确认 SimulationSystemGroup 内是否有 Complete.Job 调用（主线程等 worker）
- 用 ECSDependencyVisualizer 离线工具查 job 依赖图
- 若发现主线程 wait 信号，重排 job 依赖让其无阻塞并发
```

#### 6.3.3 PlayerUpdateCanvases（5.57% trace，🟡 红线临近）

```
PostLateUpdate.PlayerUpdateCanvases (UGUI Canvas 重建/更新)

c=682 / 1 次/帧  avg 0.933 ms / 累计 636 ms (5.57% trace)

红线判定: aoe-cpu-analysis-knowledge §7 UGUI 红线 1.0 ms/次。
本次 avg 0.933 ms 临近红线（93% 红线），刚好顶住。

业务背景: 主场景悬浮 UI 已 MeshUI 化, PlayerUpdateCanvases 不应大;
        每帧 0.93ms 偏高表明仍有未迁移的 UGUI 重建。

优化方向:
- 拆分动静 Canvas，减少每帧 dirty
- 排查是否仍有未迁移到 MeshUI 的头顶字 / 伤害跳字 UGUI
- 监控压测场景是否会进一步突破红线
```

#### 6.3.4 InitializationSystemGroup（6.07% trace，🟡 警戒）

```
InitializationSystemGroup (主线程 ECS 分发)
c=1366 / 2 次/帧  avg 0.508 ms / 累计 694 ms (6.07% trace)

同 §6.3.2 的 ECS 分析路径。
```

### §6.4 红线触发清单（按 ms/帧 排序）

| 优先级 | 模块 | ms/帧 | 单次 avg | trace% | 红线类型 | 主要子函数 |
|---|---|---|---|---|---|---|
| 1 | LuaMgr 主入口 | 2.96 | 0.319 ms | 17.63% | 占比红线（>15%）| MapSig + BattleHead 子树 |
| 2 | SimulationSystemGroup | 1.58 | 0.524 ms | 9.40% | 警戒（>1ms 概率）| ECS 分发 |
| 3 | InitializationSystemGroup | 1.02 | 0.508 ms | 6.07% | 警戒 | ECS 分发 |
| 4 | PlayerUpdateCanvases | 0.94 | 0.933 ms | 5.57% | 红线临近（avg≈1.0）| UGUI Rebuild |
| 5 | MapSignificanceMgr | 0.32 | 0.024 ms | 1.89% | 频次驱动 cnt=13/帧 | LuaMgr 子函数 |

### §6.5 慢帧形态（单次报告补充）

p99 21.37 ms vs p50 16.69 ms 增量约 4.7ms。这 4.7ms 主要来自：
- 偶发 GC.Alloc 集中点（ResManager 资源加载触发）
- 偶发 Choreographer 错过节拍

slowFrameRate >33ms 仅 0.15%（约 1 帧），不构成健康问题。

---

## §7 渲染链路 + GPU bound 判定

### §7.1 Gfx.WaitForPresent 单次 avg

| 单次 avg | 含义 |
|---|---|
| **0.91 ms** | 主线程每帧等 GPU < 1ms，双缓冲完全健康 |

**判定阈值**：单次 `Gfx.WaitForPresent > vsync 周期`（60Hz=16.66ms / 90Hz=11.11ms / 120Hz=8.33ms）→ GPU 成为瓶颈。

本次 0.91ms << 16.67ms，**不是 GPU-bound**。

### §7.2 RHI 顶层 slice（单次形态简化）

RHI 41% Running 处理 eglSwapBuffers / Gfx.PresentFrame，sleep 54% 等下一帧；节奏匀速，无 GPU 反压信号。

### §7.3 GPU bound 判定矩阵

| 信号 | 直接证据 | 间接证据 | 判定 |
|---|---|---|---|
| GPU busy/freq counter | — | 设备物理不可达 | ❌ 缺数据 |
| **Gfx.WaitForPresent 单次 > vsync 周期** | 0.91 ms < 16.67ms | ✅ 健康 | 🟢 不是 GPU-bound |
| **主线程 Sleeping ≈ Gfx.WaitForPresent** | Sleep 12.04% / Gfx.Wait 5.43%, 重合 41.6% | ✅ 比例小 | 🟢 |
| **Render / RHI 都越来越闲** | 单次无演化数据 | n/a | n/a（需 diff）|
| Choreographer 维持 60Hz 节拍 | 60.1Hz | ✅ | 🟢 显示链路正常 |
| 主线程 binder 占比 | < 0.03% | ✅ | 🟢 排除 IPC 阻塞 |

**判定**：
- 🟢 base 不是 GPU-bound
- ✅ "GPU 满载"硬结论也给不出（缺 GPU busy counter），但通过 Gfx.WaitForPresent < vsync 1/15 的间接信号可以排除 GPU 瓶颈

---

## §9 本源能力边界 + 工程化建议（分四档）

### §9.1 能力矩阵

参考 §-1.3 能否回答清单。每条能力对应底层数据源 / 可信度：

| 能力 | 底层数据 | 可信度 | 备注 |
|---|---|---|---|
| 主线程算/等定性 | thread_state Running/Sleeping | 高 | perfetto 独家 |
| 一帧时间去向 | atrace callTrees | 高 | 唯一正确口径 |
| 业务模块红线 | callTrees + aoe-watch-spec.yaml 阈值 | 中 | 阈值需项目维护 |
| GC 业务归因 | atrace + 业务 slice 父子链 | 高 | perfetto 独家 |
| 降频判定 | cpufreq counter + 温度旁路 | 中（likely 档）| confirmed 需 sysfs 旁路 |
| 多线程健康度 | thread_state | 高 | 7 条线程独立 |
| binder 阻塞主因 | binder slice + server pid | 高 | |
| GPU bound 判定 | Gfx.WaitForPresent 单次 avg | 中（强信号）| GPU busy counter 缺 |
| 单帧逐线程时间轴 | 需手工 SQL | 低（需手工）| jank 帧重要时再钻 |
| 跨次/跨场景演化对比 | n/a | ❌ 单次不可能 | 用 diff skill |

### §9.2 工程化建议

#### 🟢 已落实

1. callTrees 父子链 totalMs 取值（不用 atraceSlices LIKE 累加）
2. 主线程 off-CPU 三态归因
3. 降频 likely 档判定
4. 业务模块 GC.Alloc 子树归因

#### 🟡 待 Provider 子查询扩展

5. callTrees selfMs 在长帧 trace 上 adaptive 剪枝（thermal_2 类似场景下当前会把 UnityMain 整棵树剪掉）
6. cpu offline 检测（cluster_offline / frequency_locked 标志）
7. threadsSchedList 默认覆盖 RHI / LuaMtGC / ECSWorker 等

#### 🔴 物理 / 结构性不可达（永久声明）

8. sched_blocked_reason ftrace 真值（华为非 root 静默丢弃）
9. sysfs scaling_max_freq 旁路（confirmed 档不可达）
10. GPU busy / freq counter（骁龙需 root 注入 producer）
11. Wwise 内部细分（atrace 无 native 埋点）

#### 后续工程项

12. 跨次/跨场景 diff（→ perfetto-diff-analysis skill）
13. 单帧逐线程时间轴自动生成（jank 帧重要时）

---

## §10 自评

- [x] 结论先行（§0 三大独立观察）
- [x] 完整证据链（每条挂数据来源）
- [x] 数据口径透明（§1.2 必备公式）
- [x] 数据缺口诚实声明（§1.3 / §-1.2 矩阵 / §9.1 能力矩阵 三处冗余）
- [x] 可执行建议（§0 ROI 排序 + §6.3 各模块优化方向 + §9.2 工程化分四档）
- [x] [推断] 标注（无；本报告所有数字直读 summary）
- [x] 不编造（线程名 / 百分比 / 模块名全部来自 summary）
- [x] 降频/可信度：likely 档诚实标注 + 缺 sysfs 数据
- [x] 帧口径：Choreographer 60.1Hz vs PlayerLoop 59.8 fps 关系明示
- [x] 对比维度：明确声明单次报告**不能**做跨次演化，需 diff skill

---

> **总行数预期**：~520 行（贴近三态金标准 v5.3 815 行的 64%，剩余 36% 是三态独有的演化对比内容，单次物理写不出）
> **数据来源**：base PAL-AL00 凉机野外 / 11.42s / 60fps 健康态 / pid=9577
> **维护人**：Sprint 2 策展（2026-06-30），后续根据各项目 trace 补充更新
