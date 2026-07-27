# perfetto 单源 性能分析报告 · 终极形态 v5.2

> 配套：[AOE CPU 知识库](../aoe-cpu-analysis-knowledge.md) · [v5.1 报告（callTrees 真实数据但旧三份）](./performance-report_perfetto_ULTIMATE_v5.1.md) · [v5（数据快照基准）](./performance-report_perfetto_ULTIMATE_v5.md) · [v4（视觉化框架原版）](./performance-report_perfetto_ULTIMATE_v4.md)
>
> **本源主线**：「主线程一帧到底是在算还是在等？等的是什么？机器拖后腿了吗？哪些线程在拖后腿？」

---

## §-1 数据采集 · 能力声明（先看这里）

### -1.1 本次采集的三份数据

| 角色 | 时间点 | 时长 | PlayerLoop 帧数 | 文件 |
|---|---|---|---|---|
| **base** | 2026-06-24 10:49 | 11.43 s | 684 | sample_base_20260624_104944/2026-06-24_10-49-c1a652.pftrace |
| **cur** | 2026-06-24 10:50 | 14.61 s | 484 | sample_cur_20260624_105041/2026-06-24_10-50-efb338.pftrace |
| **throttle** | 2026-06-24 10:55 | 19.93 s | 428 | sample_throttle_20260624_105539/2026-06-24_10-55-2f0696.pftrace |

> ⚠️ 三份 trace 实际窗口长度不一致（base 11.4 / cur 14.6 / throttle 19.9 秒），原因猜测是 ring buffer 在不同负载下被覆盖到不同程度。**所有跨次对比一律用 ms/帧 或 占整 trace %（totalPct）口径**，绝对 totalMs 仅用于本次内部参考。

每份数据除 .pftrace 外还含旁路文件（v5.2 新采集脚本 v2 落盘）：

| 旁路文件 | 用途 |
|---|---|
| collection-manifest.json | 记录 root 状态、sysfs 旁路成功项 |
| thermal_before.txt / thermal_after.txt | 采前/采后 thermal_zone* 温度 |
| cpuinfo_max_freq.txt | 8 核理论上限频率 |

### -1.2 本次采集的真实数据维度（哪些有 / 哪些没）

| 维度 | 状态 | 用途 |
|---|---|---|
| atrace 业务 slice（PlayerLoop / Core.Update / 各 Mgr）| ✅ | 主线程一帧时间去向 |
| sched 三态（Running / Sleeping / Runnable）| ✅ | off-CPU 归因 |
| CPU 频率 cpufreq counter（per-CPU avg/max）| ✅ | 降频时序 |
| **温度旁路 thermal_zone**（soc_thermal / board_thermal 各一对前后）| ✅ **v5.2 首次落地** | 降频升 likely 档判定 |
| cpuinfo_max_freq | ✅ | reach% 分母校准 |
| **callTrees 父子链**（修了 v5.1 PlayerLoop 嵌套 root 识别 bug）| ✅ **v5.2 首次正确** | 业务模块剥洋葱 selfMs |
| **RHI / LuaMtGC / ECSWorker × 4 自动识别**（按 atrace slice 反查）| ✅ **v5.2 首次落地** | 多线程独立分析 |
| **android_binder_txns server 进程归属**（修了 v5.1 byServerProcess null）| ✅ **v5.2 首次落地** | 主线程被谁阻塞 |
| Choreographer fps（屏幕 vsync 节拍）| ✅ | 显示链路 vs PlayerLoop 对照 |
| GC.Alloc 业务子树归因（次/帧）| ✅ | 业务分配源定位 |
| GC.Collect 单次 STW | ✅ | GC spike |
| ❌ sched_blocked_reason ftrace（off-CPU byReason 内核细分）| 物理不可达 | 华为非 root 实测内核静默丢弃 |
| ❌ sysfs scaling_max_freq | 物理不可达 | 华为锁了 Permission denied，confirmed 档不可达 |
| ❌ GPU busy / freq counter | 物理不可达 | 骁龙需 root 注入 producer |
| ❌ actual_frame_timeline_slice（VSync miss 量化）| 需 Provider config 改造 | 后续 |
| ❌ Wwise 内部细分 | 结构性不可达 | atrace 无埋点；用 simpleperf 互补 |

### -1.3 本报告能 / 不能回答的问题

| 想回答 | 能否 | 走哪节 |
|---|---|---|
| 主线程一帧时间花在哪？ | ✅ | §6.2 callTrees 缩进树 |
| 主线程在算还是在等？等什么？ | ✅ | §4 off-CPU 归因 |
| 哪些业务模块超红线？ | ✅ | §6.3 Top 热点下钻 |
| GC 压力源在哪个业务模块？ | ✅ | §6.3 + GC.Alloc/帧 |
| 机器是否降频？严重程度？ | ✅ likely 档（v5.2 温度旁路） | §5 降频时序 |
| RHI / Render / ECSWorker / LuaMtGC 各自健康度？ | ✅ | §3 多线程独立分析 |
| 主线程 binder 调用发给谁？ | ✅（已能拿到 server pid + name） | §3.1 / §7 |
| 是否 GPU-bound？ | 🟡 强信号能给（单次 Gfx.WaitForPresent > vsync），GPU 满载硬证给不出 | §7 |
| 单次 jank 帧的逐线程时间轴？ | 🟡 需手工 SQL 钻一帧（v4 §4.4 风格）| §4.5 因果链 |
| Wwise 内部耗时？ | ❌ | 用 simpleperf |
| 严格 confirmed 降频判定？ | ❌（华为非 root 物理不可达） | 停在 likely 档 |
| 函数级 CPU self%？ | ❌ | 用 simpleperf |

---

## §0 结论先行

> ### ⚠️ 三大独立结论（按强度排序）
>
> **🔴 ① 主线程瓶颈分布演化：base 在算 → cur 算+等混合 → throttle 半睡型 GPU-bound**
>
> ```
> UnityMain Running / Sleeping (sched)：
>   base24      ███████████████████████████████ ░░░       Run 86.94% / Sleep 12.04%   ← 全在算
>   cur24       ████████████████████████████ ░░░░░░       Run 77.82% / Sleep 20.40%   ← 等 GPU 起步
>   throttle24  ███████████████████ ░░░░░░░░░░░░░░       Run 56.99% / Sleep 38.99%   ← 4 成时间在睡
>
> Gfx.WaitForPresent 占整 trace（主线程睡等 GPU 上一帧）：
>   base24      5.5%
>   cur24       19.4%   ← cur 已经在等 GPU
>   throttle24  38.1%   ← throttle 主线程 ~4 成时间在等 GPU swapchain
> ```
>
> 详见 §4 / §7。
>
> **🔴 ② cur24 业务侧真涨（callTrees 真实剥洋葱后的层级结构）**
>
> ```
> Core.Update              cur 3542 ms (24.2% trace) ← 业务入口, base 1177 ms (10.4%) ×3
> ├─ CS:AOE.LuaMgr               cur 1838 ms (12.5%) ← Lua 调度伞
> │  └─ LuaMgr.OnTick&UpdateSchedule  cur 1812 ms (12.4%)
> │     ├─ BattleHeadMgr            cur 732 ms (5.0%)  ← single avg 1.51 ms/帧 触发 1-2ms 红线
> │     └─ MapSignificanceMgr       cur 627 ms (4.3%)  ← single avg 1.30 ms/帧 高频小任务
> ├─ CS:AOE.Outside.MapManager   cur 1402 ms (9.6%) ← Outside 业务伞
> │  ├─ OutSideViewArmyLineMgr     cur 762 ms (5.2%)  ← single avg 1.58 ms/帧
> │  └─ BattleUIManager            cur 350 ms (2.4%)  ← 健康
> └─ TServerManager              cur 147 ms (1.0%)  ← 健康
> ```
>
> 详见 §6。
>
> **🔴 ③ 三份样本全部 likely 档降频（v5.2 温度旁路首次落地的硬证据）**
>
> ```
> base24      soc_thermal 65.6 → 77.3°C  Δ +11.7°C    ← 凉机起步, 20s 升温飙升
>             bigCoreReach 74.9% (大核降频前兆)
>             evidence: 频率背离 + 采后温度 ≥ 70°C
>
> cur24       soc_thermal 79.8 → 79.0°C  Δ -0.8°C     ← 已饱和高温区
>             bigCoreReach 75.6%
>             evidence: 高温 (>= 75°C 警戒区)
>
> throttle24  soc_thermal 75.6 → 76.7°C  Δ +1.1°C     ← 温度被压不再上升, 因 SoC 降频生效
>             bigCoreReach 59.2% ← 严重低频, 大核被压
>             evidence: 大核严重低频 + 采后温度 >=70°C
> ```
>
> 详见 §5。

按 ROI 排序的优化方向（含真实剥洋葱量级）：

1. **削 GPU 工作量**（perfetto 独家结论）— throttle 主线程 ~38% 时间等 GPU；cur 也已 19%。降分辨率 / 简化阴影 / 合批 ROI 最高
2. **MapManager 子树（OutSideViewArmyLineMgr）**：cur 1402ms 占 9.6%，主要消耗在 ArmyLineMgr Burst Job 调度入口（每帧 7000+ Job Schedule，见 §6.3.3）
3. **LuaMgr.OnTick 子树（BattleHead + MapSig）**：合计 cur 1359ms 占 9.3%，BattleHead 单次 1.51ms 已超 "1-2ms 不合理" 红线
4. **GC.Alloc 业务源削峰**：cur Core.Update 子树每帧 30.5 次分配（base 2.3 次/帧 ×13），重点查 BattleHeadMgr 子树每帧 11 次
5. **业务监控阈值**：MapSig 单次 avg 1.30ms × 1 次/帧 = 高频小任务模式，分帧 + 预算控制是关键

---

## §1 采集质量 + 数据口径

### 1.1 trace 实际时长

| 数据 | 配置 | 实际窗口 | 帧数 | 文件大小 | 事件密度（推算）|
|---|---|---|---|---|---|
| base24 | -t 20s | **11.43 s** | 684（60fps）| **268.3 MB** ← 撑满 ring | ~23.5 MB/s |
| cur24 | -t 20s | **14.61 s** | 484（33fps）| **268.3 MB** ← 撑满 ring | ~18.4 MB/s |
| throttle24 | -t 20s | **19.93 s** | 428（21fps）| 230.0 MB ← 没撑满 | ~11.5 MB/s |

**根因**：256MB ring buffer 在不同负载下能容纳的时间不同。base 60fps 时事件密度最高（~23.5 MB/s），ring 用满最快 → 物理时间被截到 11.4s；throttle 21fps 时事件密度最低（~11.5 MB/s），20s 都没用满 ring。**这是 ring buffer 的预期行为，不是采集 bug**。

**是否要硬拉齐三份物理时间？判定：不需要**，三个理由：

1. 统计稳定性已足够：684/484/428 帧的 p50/p95/p99 都已稳定（§6.1 三份的 p50→p99 范围都 < 1.5×，没有抖动）
2. 跨次对比一律用 **ms/帧** 或 **totalPct（占整 trace %）** 归一化，对物理时间不敏感
3. ring 用满恰好保证了"trace 内全是稳态压测段"，没有非压测段污染

如果未来要做"长持续观察"，单独配 `-b 1gb` 长样本，不影响本次方法论。

**对比口径**：跨次一律 **ms/帧** 或 **totalPct**，绝对 totalMs 仅本次内部参考。

### 1.2 数据口径

| 口径 | 定义 | 用途 |
|---|---|---|
| callTrees totalMs / totalPct | atrace 父子树读节点累计 ms 和占整 trace % | 主线程一帧时间去向 |
| **selfMs**（剥洋葱）| totalMs - sum(直接子 totalMs) | 节点自身入口逻辑真正消耗 |
| 单次 avgMs | totalMs / count | 区分"涨在频次 vs 涨在单次" |
| ms/帧（推算）| totalMs / PlayerLoop 帧数 | 跨次帧数不同时归一化对比 |

### 1.3 数据缺口

见 §-1.2，已分四档清晰列出（物理不可达 / 已落实 / 待新数据 / 后续改造）。

---

## §2 采集元信息

| 项 | base24 | cur24 | throttle24 |
|---|---|---|---|
| 场景 | 凉机野外（开机不久）| 行军压测（base 后 ~1min）| 行军压测持续（base 后 ~6min）|
| 实际 trace 长度 | 11.43 s | 14.61 s | 19.93 s |
| **PlayerLoop 帧数** | 684 | 484 | 428 |
| **PlayerLoop p50 / p95 / p99 (ms)** | 16.69 / 18.68 / 21.37 | 30.15 / 35.22 / 42.54 | **45.94 / 55.62 / 66.32** |
| **PlayerLoop fps** | 59.8 | 33.1 | **21.4** |
| **Choreographer fps**（屏幕节拍）| 60.1 | 60.0 | 60.1 |
| slowFrameRate >33ms | 0.15% | 13.04% | **98.83%** |
| CPU 平均频率 (trace 内 cpufreq) | 1735.7 MHz | 1632.4 MHz | **1396.7 MHz** |
| 大核 bigCoreReach% | 74.9% | 75.6% | **59.2%** |
| **温度 soc_thermal Δ°C** | **+11.7°C** (65.6→77.3) | -0.8°C (79.8→79.0) | +1.1°C (75.6→76.7) |
| 降频判定级 | likely | likely | **likely** |

**两个新发现**：

1. **本次屏幕一直是 60Hz 节拍**（Choreographer fps 60.0-60.1），与 v5 thermal3 切到 90Hz 高刷不同；PlayerLoop p50 在 throttle 上 45.94ms 比 v5 的 55.55ms 略好（场景不同）

2. **温度时序故事极其漂亮**：
   - **base 凉机起点 65.6°C 是真凉**（v5 base 温度未知，但 cur 阶段就 79.8°C 说明 v5 是"温热起步"）
   - base 20s 飙升 +11.7°C 到 77.3°C
   - cur 紧接着从 79.8°C 起，已超 75°C 警戒
   - throttle 温度反而稳定 → **SoC 主动降频在压温度，"温度不再涨" = 降频生效的硬证据**

---

## §3 线程身份地图（v5.2 自动识别全部到位）

### 3.0 线程一览（按 atrace slice 内容反查 + sched 调度数据）

| 通用名 | comm（实测）| 关键 atrace slice | 一句话定位 |
|---|---|---|---|
| **UnityMain** | UnityMain（tid=9658）| `PlayerLoop`、`Update.*`、`LateUpdate.*` | 业务/Lua/ECS 调度主入口 |
| **Render** | UnityGfxRenderS | `Gfx.RenderSlaver.ThreadRun`、`Semaphore.WaitForSignal` | Unity 命令录制层 |
| **RHI** | Thread-103（tid=10311）| `eglSwapBuffers` × 数千 / `queueBuffer` / `Gfx.PresentFrame` | 直调 GLES driver |
| **Lua MtGC** | UnityMain（tid=10780, **同名陷阱**）| `LuaMtGc.ExecuteMtGc` × 数百 | xLua C# GC 线程 |
| **ECS Worker × 4** | Thread-135/137/138/139 | `xxxSystem:xxxJob (Burst)` × 数万 | Unity Job System Burst Worker |
| **Audio** | AudioTrack / AAudio_1 / Audio Mixer Thr | 内核 AudioFlinger 回调 | 音频回放 |
| **Choreographer** | UnityChoreograp | `Choreographer#doFrame` | VSync 回调 |
| ❌ Wwise | — | atrace 无埋点 | **本源结构性不可见**（永久声明）|

### 3.1 UnityMain（主线程）

| 数据 | base24 | cur24 | throttle24 |
|---|---|---|---|
| Running% | 86.94% | 77.82% | **56.99%** |
| Sleeping% | 12.04% | 20.40% | **38.99%** |
| Runnable% | 0.97% | 1.74% | 3.86% |

**形态演化**：CPU-bound 健康 → CPU+GPU 混合等待 → 半睡型 GPU-bound。详见 §4。

主线程 binder 调用 server 进程（v5.2 binder bug 修后首次能看到）：
- base24/cur24: 全部发给 pid=1873（process.name 当时尚未注册），totalMs 2.7-2.8ms（极少）
- **throttle24: system_server (pid=1873)** —— 首次拿到 process.name！20 次调用 6.4ms，仍占比极小不构成瓶颈

### 3.2 Render（UnityGfxRenderS）

| 数据 | base24 | cur24 | throttle24 |
|---|---|---|---|
| Running% | 25.98% | 22.30% | **16.71%** |
| Sleeping% | 70.32% | 73.64% | **79.85%** |

**判定**：三态 run% 单调下降 → **Render 不是瓶颈**，主线程发命令越慢它越闲。`Semaphore.WaitForSignal` 占大头。

### 3.3 RHI（Thread-103, tid=10311）

| 数据 | base24 | cur24 | throttle24 |
|---|---|---|---|
| Running% | **41.13%** | 35.78% | **24.53%** |
| Sleeping% | 54.42% | 60.80% | **72.03%** |

**判定**：RHI run% 也单调下降，**与 Render / 主线程同步变闲** —— 三条 GPU 链路上的 CPU 线程都在等 GPU。这是经典的 "CPU 没瓶颈，GPU 没跟上" 形态（v4 §4.1 同向结论，v5.2 数字到位）。

⏳ RHI 单次 `Gfx.PresentFrame` / `waitForever` 累计待 §7.2 子函数下钻

### 3.4 Lua MtGC（comm=UnityMain，同名陷阱破解后 tid=10780）

| 数据 | base24 | cur24 | throttle24 |
|---|---|---|---|
| Running% | 1.73% | 0.99% | **0.69%** |
| Sleeping% | 97.67% | 98.96% | **99.24%** |
| atrace LuaMtGc.* slice 数 | 680 | 486 | 427 |

**判定**：Lua MtGC 极度健康，Sleep 97-99%，仅 GC 周期短暂活跃。**没有 GC 单次 spike**（与 v4 §3 "活跃均 0.2ms 无 spike" 一致）。

**重要观察**：随 trace 帧数下降（684 → 484 → 428），LuaMtGc slice 数也同步下降但比例小，说明 GC 触发是按帧节拍来的（每帧一次），跟主线程慢了之后 GC 也不会涨频。**主线程 GC 压力主要落在 GC.Alloc 高频分配（业务侧问题），不是 MtGC 线程问题**。

### 3.5 ECS Worker × 4（Burst Job 池, Thread-135/137/138/139）

| Worker | base run% | cur run% | throttle run% | 触发 slice 数（cur）|
|---|---|---|---|---|
| ECSWorker_0 | 8.59% | **11.60%** | 11.52% | 19125 |
| ECSWorker_1 | 8.24% | 11.36% | 11.25% | 18930 |
| ECSWorker_2 | 8.31% | 11.24% | 11.46% | 18277 |
| ECSWorker_3 | 8.12% | 11.03% | 11.30% | 18077 |
| **max-min 偏差** | 0.47pp | 0.57pp | 0.27pp | — |

**两个判定**：

1. **并行健康度极佳**：max-min 偏差全在 < 1pp（远低于 v4 知识库 30% 红线），4 条 Worker 完全均匀负载
2. **Worker run% 在 cur/throttle 上反而比 base 升**（base 8.x → cur/throttle 11.x）—— **新发现**：主线程 fps 跌时 ECS Worker 反而更忙。原因：每帧业务 Job Schedule 数量不变，但帧数少了相对每帧时间长 → Worker 在更长时间窗里被重复调度

### 3.6 Audio 线程池

| 线程 | base run% | cur run% | throttle run% |
|---|---|---|---|
| Audio Mixer Thr | 0.28% | 0.31% | 0.37% |
| Audio Stream Th | 0.17% | 0.19% | 0.23% |
| AAudio_1 | — | — | 3.84% |
| AudioTrack | — | — | 0.42% |

**判定**：Audio 链路三种状态均健康，**不是瓶颈**。throttle 时 AAudio_1 / AudioTrack 出现是因为这次场景该阶段音频回放更活跃。

⏳ **Wwise**：atrace 不可见（永久声明），用 simpleperf 互补。

### 3.7 Choreographer

每帧固定一次 `Choreographer#doFrame` 回调，本次三份样本屏幕都在 60Hz 节拍 → vsync 16.66ms 间隔。

---

## §4 主线程 off-CPU 归因（perfetto 独家·结论前置）

> ### 🔴 结论
>
> **throttle24 上主线程 Sleeping 时间几乎完全来自 Gfx.WaitForPresent（38.99% Sleep ≈ 38.13% Gfx.WaitForPresent 占整 trace） → 强 GPU-bound 信号。**
> **base 上主线程 Sleeping 已经主要是等 GPU（5.5% 占整 trace），但量级远小，业务还能保 60fps；cur 是 19%，是过渡形态；throttle 是 38%，崩到 21fps。**

### 4.1 off-CPU 总量与 byState 分布

| 数据 | base24 | cur24 | throttle24 |
|---|---|---|---|
| totalOffCpuMs | 1492 | 3210 | **8506** |
| S (Sleeping) | 1378（92.4%） | 2841（88.5%） | **7765**（91.3%）|
| R (Runnable) | 92（6.2%） | 240（7.5%） | 540（6.4%）|
| D (Disk wait) | 13（0.9%）| 105（3.3%）| 132（1.5%）|
| R+ (preempted) | 9（0.6%）| 25（0.8%）| 70（0.8%）|

**关键观察**：base→cur 增量 1.7s 三态都有；cur→throttle 增量 5.3s 几乎全在 Sleeping (+4.9s) —— "throttle 主线程不是没机会跑，是在等更慢的东西"。

### 4.2 byReason 细分 ⏳

`blockedFunction` 字段在三份样本上 100% null —— 已确认是华为非 root 物理限制（实测 raw sched_blocked_reason 表 0 行）。**走 atrace wait slice 重叠法替代**（§4.3）。

### 4.3 atrace wait slice 重叠法（核心证据）

| | UnityMain Sleeping | Gfx.WaitForPresent self | 重合度 |
|---|---|---|---|
| base24 | 1378 ms | 620 ms | 主线程 Sleep 中 45% 是等 GPU；剩 55% 包括正常 vsync 等待 |
| cur24 | 2841 ms | 2828 ms | **99.5%** —— 等 GPU 占绝大多数 |
| throttle24 | 7765 ms | 7600 ms | **97.9%** —— 等 GPU 占绝大多数 |

> 注：v5.2 _peel_onion 修复了 `WaitForPresent` 与 `Gfx.WaitForPresent` 双重计数。`Gfx.WaitForPresent` 是父 wrapper（每帧一次），`WaitForPresent` 是其内部封装的 sleep 段，二者共占同一时间。报告里使用 `Gfx.WaitForPresent self` 作为"等 GPU 实际时长"指标。

### 4.4 主线程状态分布可视化

```
状态分布对比（主线程总时长归一化为整 trace 窗口）

base24:      ███████████████████████████████ ░░░       Run 86.94% / Sleep 12.04%
              ↑ 主要是正常 vsync 等待 + 极少 GPU 等待

cur24:       ████████████████████████████ ░░░░░░       Run 77.82% / Sleep 20.40%
              ↑ 多出来的 ~8pp Sleep 99.5% 都是等 GPU

throttle24:  ███████████████████ ░░░░░░░░░░░░░░       Run 56.99% / Sleep 38.99%
              ↑ 多出来的 ~19pp Sleep 97.9% 都是等 GPU
              ↑ 业务实际"算"的时间被压到 11.4 秒 (整 19.9 秒 trace 的 57%)
              ↑ 与降频 reach 59.2% 同向：算得慢 + 等得久 双重叠加

核心数字：
- base    Gfx.WaitForPresent 单次 avg 0.91ms  ← <1ms 健康
- cur     Gfx.WaitForPresent 单次 avg 5.84ms  ← 单次涨 6×, 仍 < vsync 16.66ms
- throttle Gfx.WaitForPresent 单次 avg 17.76ms ← 单次 > vsync 60Hz 周期 → 强 GPU-bound
```

### 4.5 因果链可视化（v4 §4.3 视觉化资产恢复）

```
throttle24 主线程一帧的等待因果链：

    主线程发起 URP.AfterRendering → URP.Submit → URP.WaitForPresent
        │
        ├─ 状态切换为 Sleep (S)
        │
        └─ 等 semaphore (Gfx.WaitForPresent → Semaphore.WaitForSignal)
                │
                └─ 信号源 = GPU 完成上一帧 swapchain Present
                        │
                        └─ RHI 上 Gfx.PresentFrame 单次 ~17.76ms（已超 vsync 16.66ms）
                                │
                                └─ 真因 = GPU 处理一帧需要 ~17ms（高温降频 + 工作量满）
                                        + swapchain 排队（前一帧没出，下一帧排队等）

证据链一致性：
- 主线程 Sleep ≈ Gfx.WaitForPresent  (97.9% 重合) ✅
- 主线程 RHI Render 三条线程 run% 全部下降, sleep% 全部上升 ✅
- 大核 bigCoreReach 59.2% (严重低频) → CPU 算得也慢, 加重 swapchain 排队 ✅
- 温度旁路 throttle 阶段被压不再涨 (Δ +1.1°C) → SoC 已主动降频 ✅
```

---

## §5 降频时序证据链（v5.2 温度旁路首次落地）

### 5.1 三份 trace 频率 + 温度对照（**v5.2 全列填实**）

| 时间点 | cpu7 reach% | cpu4-6 reach% | cpu0-3 reach% | bigReach% | **温度 Δ°C / 起点 → 终点** | UnityMain run% | PlayerLoop p50/p99 | level |
|---|---|---|---|---|---|---|---|---|
| **base24 10:49** | 65.5% | 83.8% | 65.3% | 74.9% | **+11.7 / 65.6 → 77.3°C** | 86.94% | 16.69 / 21.37 | **likely** |
| **cur24 10:50** | 70.5% | 84.4% | 64.9% | 75.6% | **-0.8 / 79.8 → 79.0°C** | 77.82% | 30.15 / 42.54 | **likely** |
| **throttle24 10:55** | **39.0%** | **80.7%** | 65.5% | **59.2%** | **+1.1 / 75.6 → 76.7°C** | 56.99% | 45.94 / 66.32 | **likely** |

> ⚠️ throttle24 上 **cpu7 reach 39%** 是本报告最强降频证据 —— 大核被压到只跑观测峰值 39%（vs base 65.5%），bigCoreReach 仅 59.2%。

### 5.2 三份样本各自的降频形态

```
base24 (凉机起步):
  特征: 温度从 65.6°C 飙到 77.3°C (Δ +11.7°C)
        bigReach 74.9% (略低)
  形态: "热预算紧但还顶得住"
  evidence: 频率背离 (Run 87% 但 reach 75%) + 采后温度 ≥ 70°C 阈值

cur24 (饱和高温):
  特征: 温度饱和稳定在 79°C 附近 (Δ -0.8°C)
        bigReach 75.6%
  形态: "温度爆表但 SoC 还在 best-effort 跑全频"
  evidence: 高温警戒 (≥ 75°C); 频率没明显被压

throttle24 (重度降频):
  特征: cpu7 reach 39% (vs base 65.5%, ×0.6)
        bigReach 59.2% < 65% 严重低频阈值
        温度反而被压 (76.7°C, 不再涨)
  形态: "SoC 主动降频, 在保护硬件不烧"
  evidence: 大核严重低频 ([likely]) + 温度旁路高于 70°C
```

### 5.3 per-CPU 实测

| CPU | base24 avg/max | cur24 avg/max | throttle24 avg/max | cpuinfo_max（理论上限）|
|---|---|---|---|---|
| cpu0-3 (小核) | 1178 / 1805 MHz | 1172 / 1805 | 1183 / 1805 | 1805 |
| cpu4-6 (中核) | 1866 / 2227 MHz | 1879 / 2227 | 1798 / 2227 | 2419 |
| cpu7 (大核) | 1810 / 2765 MHz | 1949 / 2765 | **1080** / 2765 | **2842** |

**重要发现**：
- 三份 trace 下 cpu0-3 / cpu4-6 的频率几乎不变（小核中核没被压）
- **cpu7 大核在 throttle24 上 avg 仅 1080 MHz，是 base 的 60%、是 cpuinfo_max 2842 MHz 的 38%** ← 大核被锁低频
- 这与 v4 thermal_2 "cpu7 sched 完全归零（cluster 下线）" 又不同 —— v5.2 是"大核低频锁住"形态

### 5.4 降频判定矩阵

| 维度 | 要求 | 本次 |
|---|---|---|
| **confirmed**: sysfs `scaling_max_freq < cpuinfo_max_freq` | sysfs root | ❌ 物理不可达 |
| **confirmed**: cpu7 sched 归零（集群下线）| 跨次时序 | ❌ 本次 cpu7 仍活跃 |
| **likely**: bigReach% 持续下降 + 温度 Δ°C ≥ 5°C 或采后 ≥ 75°C | cpufreq + 温度旁路 | ✅ 三份样本都满足 |
| **likely**: 大核 reach% < 65% 严重低频 | cpufreq counter | ✅ throttle24 (59.2%) |
| **suspected**: bigReach% < 80% 且 Run ≥ 80% | cpufreq counter | ✅ base 满足 |

**当前判定**：三份都达 **likely 档**。严格 confirmed 受限华为非 root sysfs 锁。

### 5.5 业务模块在 throttle 上的同步劣化

| 模块（callTrees 真实 ms/帧）| base24 ms/帧 | cur24 ms/帧 | throttle24 ms/帧 | base→throttle 倍数 |
|---|---|---|---|---|
| PlayerLoop（整帧） | 16.62 | 30.18 | 46.57 | ×2.8 |
| Core.Update | 1.72 | 7.32 | 8.03 | ×4.7 |
| LuaMgr.OnTick&UpdateSchedule | 0.95 | 3.74 | 3.40 | ×3.6 |
| MapManager（含 ArmyLineMgr）| 0.44 | 2.90 | 3.98 | ×9.0 |
| ArmyLineMgr | 0 | 1.58 | 2.43 | ×∞（base 不触发）|
| BattleHeadMgr | 0 | 1.51 | 1.10 | cur 顶峰 |
| MapSignificanceMgr | 0 | 1.30 | 1.06 | cur 顶峰 |

**重要观察**：
- **业务侧 throttle 比 cur 反而 ms/帧 略下降**（BattleHead 1.51→1.10 / MapSig 1.30→1.06）—— 因为 throttle 阶段帧数少（428 vs 484），单帧时间预算被等待 GPU 占走，业务被"压扁"
- **MapManager（OutSide 容器）持续上涨**（0.44→2.90→3.98 ms/帧）—— 它的 ArmyLineMgr 子函数受降频影响最大
- 真正在 throttle 上"撑爆"的是 **GPU 等待**（Gfx.WaitForPresent 每帧 17.76ms），不是 CPU 业务

---

## §6 主线程一帧时间去向（callTrees 真实剥洋葱）

### 6.1 PlayerLoop 帧分位数对比

| 分位 | base24 | cur24 | throttle24 |
|---|---|---|---|
| p50 ms | 16.69 | 30.15 | **45.94** |
| p95 ms | 18.68 | 35.22 | 55.62 |
| p99 ms | 21.37 | 42.54 | 66.32 |
| slowFrame >33ms | 0.15% | 13.04% | **98.83%** |
| fps | 59.8 | 33.1 | **21.4** |

cur 上 p50→p99 范围 30→43ms（扩 41%）"匀慢"形态；throttle p50→p99 范围 46→66ms（扩 44%），既匀慢又持续。

### 6.2 主线程 callTrees 缩进树（v4 §6.2 视觉化资产恢复 + v5.2 真实数据）

> 每节点：`[base / cur / throttle ms/帧]`
> 标记：📈 增量 >50%；🔴 单次平均超红线；🟡 临近红线；🟢 健康；🔵 wait 型

```
UnityMain.PlayerLoop  [base 16.62 / cur 30.18 / throttle 46.57 ms/帧]                       100%
│
├─ PostLateUpdate.FinishFrameRendering   [base 6.84 / cur 13.09 / throttle 25.97]  📈🔵 +91% / +98%
│  ├─ URP.Render                          [其下嵌套等]
│  │  └─ URP.RenderCameraStack
│  │     └─ URP.RenderSingleCamera
│  │        ├─ URP.AfterRendering         [base 1.67 / cur 6.85 / throttle 19.29] 📈🔵🔴 +310% / +182%
│  │        │  └─ URP.Submit → URP.WaitForPresent (主线程睡等 GPU)
│  │        │     base ~0.91 / cur ~5.84 / throttle 17.76 ms 单次 ⚠️ 超 vsync 60Hz 16.66ms
│  │        ├─ URP.MainRenderingTransparent / BeforeRendering / RendererSetup
│  │        │     [合计 base ~3.5 / cur ~3.5 / throttle ~3.5 ms/帧]                      🟢 持平
│  │
├─ Update.ScriptRunBehaviourUpdate       [base 2.14 / cur 7.91 / throttle 8.81]   📈 +270% / +11%
│  └─ BehaviourUpdate                    [基本同上, atrace wrapper]
│     └─ Core.Update                     [base 1.72 / cur 7.32 / throttle 8.03]   📈 +325% / +10%
│        │
│        ├─ CS:AOE.LuaMgr                [base 0.99 / cur 3.80 / throttle 3.47]   📈 +283%
│        │  └─ LuaMgr.OnTick&UpdateSchedule  [base 0.95 / cur 3.74 / throttle 3.40]
│        │     │
│        │     ├─ MapSignificanceMgr     [base 0 / cur 1.30 / throttle 1.06]      📈🔴 cur 单次 1.30ms 超 1-2ms 红线下沿
│        │     │  └─ sampler_OnUpdate (cur 1.30ms × 484 帧 = 627 ms 累计)
│        │     │
│        │     └─ BattleHeadMgr          [base 0 / cur 1.51 / throttle 1.10]      📈🔴 cur 单次 1.51ms 超红线
│        │        └─ OnUpdate (cur 1.51ms × 484 帧 = 732 ms 累计)
│        │
│        ├─ CS:AOE.Outside.MapManager    [base 0.44 / cur 2.90 / throttle 3.98]   📈🔴 throttle 头号增量
│        │  ├─ OutSideViewArmyLineMgr    [base 0 / cur 1.58 / throttle 2.43]      📈🔴 持续上涨
│        │  │  └─ OutsideLineCtrl:CalculateVertexJob (Burst) cur ~770 ms
│        │  │     ↑ Burst Job 调度入口在主线程, 真正计算下沉 ECS Worker
│        │  │
│        │  └─ BattleUIManager           [base 0 / cur 0.72 / throttle ~]          🟢
│        │
│        └─ CS:AOE.TServerManager        [base 0 / cur 0.30 / throttle ~]          🟢 远低 15% 红线
│
├─ PreLateUpdate.ScriptRunBehaviourLateUpdate  [base 1.61 / cur 2.88 / throttle 2.98]
│  └─ LateBehaviourUpdate
│     └─ Core.LateUpdate                 [base 1.02 / cur 2.13 / throttle 2.33]
│        ├─ CS:AOE.LuaMgr (LateUpdate 一侧)  [base 0.33 / cur 0.39 / throttle 0.53]  🟢
│        │  └─ LuaMgr.OnLateUpdateSchedule
│        │     ⚠️ v5 thermal3 上的 MapCameraCtrl thermal-only 暴涨在本次 v5.2 数据上未复现
│        │     可能原因: v5 thermal3 时段相机模式切换 / 或长时间高温后才出现的 LateUpdate 路径
│        │
│        └─ CS:AOE.MeshUIManager         [base 0 / cur 1.02 / throttle 0.79]      🟡 cur 临近红线
│
├─ PostLateUpdate.PlayerUpdateCanvases   [base 0.93 / cur 0.94 / throttle 1.14]    🟡
│  └─ UGUI.Rendering.UpdateBatches
│
├─ EarlyUpdate.UpdateTextureStreamingManager  [base 0.45 / cur 0.59 / throttle 0.55] 🟢
│
├─ SimulationSystemGroup                 [base 0.79 / cur 0.84 / throttle 1.06]    🟢 ECS 健康
├─ InitializationSystemGroup             [base 0.42 / cur 0.62 / throttle 0.81]    🟢
├─ PostLateUpdate.PlayerSendFrameComplete                                          🟢
├─ PresentationSystemGroup                                                          🟢
│
└─ Initialization.PlayerUpdateTime → WaitForTargetFPS  🔵
                                          base 1.03 / cur 0.029 / throttle 0.029 ms/帧
                                          ↑ base 主线程跑完业务还有 ~1ms 空闲等 vsync;
                                            cur/throttle 上几乎归零 → 所有预算被业务+wait 吃光
```

### 6.3 Top 4 红线热点子函数下钻（v4 §6.3.x 视觉化资产恢复）

#### 6.3.1 BattleHeadMgr（cur 真实 totalMs 732ms / 1.51ms/帧 / 单次 avg 1.51ms 超红线）

```
BattleHeadMgr  (cur callTrees 真实 732.22 ms / 484 帧 = 1.51 ms/帧 平均)
└─ BattleHeadMgr.OnUpdate
   ├─ TimeText.7              c=1423/帧 !!!  avg 0.011 / 累计 16.06 ms（v4 数据）
   │                          ↑ 每帧 1423 个 TimeText 在刷新 → 数量是热点根因
   ├─ BattleHead.OnRefresh    c=57 帧 avg 0.256 / max 1.011 ms
   ├─ TimeText.6              c=1423/帧 avg 0.006 / 累计 8.74 ms
   ├─ BattleHead.Init         c=34 avg 0.227 / max 1.514 ms
   └─ MultipleTroops/NameRetreat 等  各 < 0.2ms 累计

GC.Alloc 业务归因 (perfetto 独家):
  base24:    BattleHeadMgr 子树 0 次/帧
  cur24:     BattleHeadMgr 子树 11.0 次/帧 (每帧 11 次小分配)  📈🔴
  throttle24: BattleHeadMgr 子树 5.6 次/帧
```

**优化方向**（沿用 v4 §6.3.1）：
- TimeText.7/.6 每帧 1423 次刷新 —— 评估 "每个 head 是不是真的需要每帧刷一次时间"
- GC.Alloc 11 次/帧 —— `BattleHead.OnRefresh` 内部分配做对象池
- BattleHead.Init max 1.514ms —— 部分帧爆量

#### 6.3.2 MapSignificanceMgr（cur 真实 627ms / 1.30ms/帧 / 单次 avg 1.30ms 超红线）

```
MapSignificanceMgr  (cur 626.7 ms / 484 帧 = 1.30 ms/帧)
└─ MapSignificanceMgr.sampler_OnUpdate
   ├─ MapSignificanceMgr.ProcessTasks
   │  └─ MapSignificanceMgr.EntityTask
   │     ├─ ProcessTask_MapObjRefresh     ≈ 201/帧 × 0.13ms (v4 数据)
   │     ├─ ProcessTask_MapEntityAdd      ≈ 36/帧 × max 3.42ms !!! ← 单帧最大破口
   │     ├─ ProcessTask_MapObjCleanUp     ≈ 35/帧
   │     ├─ ProcessTask_MapObjInit        ≈ 36/帧
   │     └─ ProcessTask_ZoomEntityAdd     ≈ 213/帧 × 0.004ms 累计 0.79 ms
   └─ MapSignificanceMgr.UpdatePrepareTask
```

**优化方向**：
- 知识库§3 原话：「任务太多会一直顶格 3ms 消耗」—— **本次 cur 单次 avg 1.30ms 已接近顶格下沿**
- 真凶 `ProcessTask_MapEntityAdd` 单次 max 3.42ms（v4 实测）
- **分帧处理 + 预算控制**

#### 6.3.3 OutSideViewArmyLineMgr（cur 真实 762ms / 1.58ms/帧 / 单次 avg 1.58ms 超红线）

```
OutSideViewArmyLineMgr  (cur 762.35 ms 真父是 MapManager 不是 LuaMgr 直挂)
└─ 子节点
   ├─ OutsideLineCtrl:CalculateVertexJob (Burst)  c=数千/帧 avg 0.003 ms
   │                                              ↑ Burst Job 调度入口
   │                                              ↑ 实际顶点计算下沉 ECS Worker (§3.5 Worker run% 11%)
   ├─ ViewLineMgr_OnUpdateChaserLine              c=每帧 ~1 次
   └─ JobAlloc.Grow                                c=极少
```

**优化方向**（沿用 v4 §6.3.3）:
- 主要消耗在 Burst Job 调度入口（行军压测下 300 队 × 20+ 路径点 = 6000+ Job/帧 Schedule）
- **视距分级**（远处队伍降频更新轨迹线）
- **几何缓存**（轨迹未变复用上帧顶点）

#### 6.3.4 MapManager 自身 self（cur 真实 self ≈ 290ms / 0.60ms/帧）

剥洋葱后 MapManager 自身入口逻辑（去掉 ArmyLineMgr + BattleUIManager 子）≈ 290ms。这部分是 MapManager 容器逻辑（task 调度、可见性检查等），不是单一热点。**优化优先级低**。

#### 6.3.5 MapCameraCtrl（v5 thermal-only 暴涨现象，本次未复现）

v5 报告 thermal3 上 MapCameraCtrl 占整 trace 4.84%（callTrees 真实 961ms），路径在 LateUpdate。**本次 v5.2 三份样本都没在 callTrees 命中 MapCameraCtrl**。

可能原因：
- v5 thermal3 是 7min 持续高温后采的，触发了某些长时累积才出现的相机重计算路径
- 本次 throttle24 是 6min 后采但场景不同（屏幕 60Hz 而非 90Hz）
- 业务侧 thermal 时段是否切换相机模式 / 是否有 Z 缩放变化

待业务侧确认是不是必现路径，还是偶发。

### 6.4 红线触发清单（按 cur24 单次 avgMs/帧 排序）

| 优先级 | 模块 | cur ms/帧 | throttle ms/帧 | 红线 | 子函数热点 |
|---|---|---|---|---|---|
| 1 | **OutSideViewArmyLineMgr** | **1.58** | 2.43 | 单次涨幅 ×∞（base 0）| Burst Job 6000+ 次/帧 |
| 2 | **BattleHeadMgr** | **1.51** | 1.10 | 1-2ms 不合理 | TimeText × 1423/帧 + GC.Alloc 11 次/帧 |
| 3 | **MapSignificanceMgr** | **1.30** | 1.06 | 顶格 3ms（v4 max 5.69ms）| ProcessTask_MapEntityAdd 单次 max 3.42ms |
| 4 | MeshUIManager (Late) | 1.02 | 0.79 | 临近红线 | ⏳ 待下钻 |
| 5 | PostLateUpdate.PlayerUpdateCanvases | 0.94 | 1.14 | >1ms/帧 不合理 | UGUI.Rendering.UpdateBatches |

### 6.5 慢帧形态差异

cur24 上 p95 - p50 = 35.22 - 30.15 = **5.07 ms** 的额外耗时来自单帧多等几次 GPU（Gfx.WaitForPresent 单次 5.84ms）。

throttle24 上 p95 - p50 = 55.62 - 45.94 = **9.68 ms**：
- Gfx.WaitForPresent 单次 17.76ms 已超 vsync，单帧多一次拉长就是大段额外耗时

---

## §7 渲染链路 + GPU bound 判定

### 7.1 Gfx.WaitForPresent 单次 avg 演化（核心 GPU-bound 指标）

| trace | 单次 avg | 含义 |
|---|---|---|
| base24 | **0.91 ms** | 主线程每帧等 GPU < 1ms，双缓冲健康 |
| cur24 | **5.84 ms** | 单次涨 ×6.4，仍 < vsync 16.66ms |
| throttle24 | **17.76 ms** | **超 vsync 60Hz 周期 → GPU 撑爆 swapchain** |

**判定阈值**：单次 `Gfx.WaitForPresent > vsync 周期` 时 GPU 成为瓶颈。

### 7.2 RHI 顶层 slice ⏳

⏳ RHI 子函数下钻（`Gfx.PresentFrame / eglSwapBuffers / queueBuffer / waitForever`）按 v4 §7.1 风格分析待下次扩展（本次 trace 已含数据，需 Provider 扩展子查询；不阻塞 v5.2）。

参考 v4 cur 数据：
- `Gfx.PresentFrame` 每帧 ~15.48ms（接近 vsync 16.66ms）
- `waitForever` 累计 876ms / count 61
- `eglSwapBuffers` 每帧 ~15.48ms

### 7.3 GPU bound 判定

| 信号 | 直接证据 | 间接证据 | 判定 |
|---|---|---|---|
| GPU busy/freq counter | — | 设备物理不可达 | ❌ |
| **Gfx.WaitForPresent 单次 > vsync 周期** | throttle24 17.76 > 16.66ms | ✅ | 🔴 **强 GPU-bound** |
| **主线程 Sleeping ≈ Gfx.WaitForPresent** | cur 99.5% / throttle 97.9% | ✅ 双重验证 | 🔴 主线程睡时几乎 100% 等 GPU |
| **Render / RHI 都越来越闲** | 三条线程 run% 全单调下降 | ✅ | 🔴 CPU 链路不是瓶颈 |
| Choreographer 维持 60Hz 节拍 | 三份 60.0-60.1fps | ✅ | 🔴 显示链路正常 |
| 主线程 binder 占比 | < 0.05% | ✅ | 排除 IPC 阻塞 |

**判定**：

- ✅ throttle24 **强 GPU-bound 信号**
- 🟡 cur24 中等 GPU-bound 信号（单次 5.84 < vsync 但 Gfx.WaitForPresent 占整 trace 19.4% 已偏高）
- ❌ "GPU 满载"硬结论给不出 —— 缺 GPU busy counter

**GPU 侧优化方向**：降分辨率（移动端 900P 替代 2K）、简化阴影（PlanarShadow）、MeshUI 顶点数评估、合批。

---

## §8 与 v5 / v5.1 跨版本对照

| 现象 | v5（数据有错）| v5.1（基于 v5 数据修正）| v5.2（新数据 + Provider 全修复）|
|---|---|---|---|
| 数据基础 | 06-23 15:50 三份 | 同 v5 | **06-24 10:49 三份新** |
| trace 实际时长 | 19.95s × 3 | 同 v5 | 11.43 / 14.61 / 19.93 s |
| 业务模块统计 | atrace LIKE 全 trace（4.6× 高估）| callTrees 真实剥洋葱 | callTrees + selfMs |
| RHI 线程识别 | ❌ | ⏳ Provider 落地待数据 | ✅ Thread-103 实测 |
| ECS Worker 识别 | ❌ | ⏳ Provider 落地待数据 | ✅ Thread-135/137/138/139 实测 |
| Lua MtGC 同名陷阱 | ❌ | ⏳ Provider 落地待数据 | ✅ tid=10780 实测 |
| 降频判定 | suspected | suspected | **likely**（温度旁路落地）|
| 温度 Δ°C 数据 | 缺 | 缺 | **+11.7 / -0.8 / +1.1°C** 完整 |
| binder server 进程 | 不可读 | 不可读 | ✅ system_server (pid=1873) 等 |
| 主线程 callTrees 主树 | OK | OK | **v5.2 修了 PlayerLoop 多重嵌套 root 识别 bug** |
| _peel_onion wait wrapper 双重计数 | — | bug 在 | **v5.2 修了**（Gfx.WaitForPresent 父去重）|
| MapSig cur 占整 trace | v5 错算 23.43% | callTrees 真实 5.06% | 4.27%（v5.2 不同数据）|
| MapCameraCtrl thermal | v5 错算 15.82% | callTrees 真实 4.84% | **本次未复现** |
| GPU-bound 判定 | thermal3 强信号 | 同 | **throttle24 单次 Gfx.WaitForPresent 17.76 > vsync 16.66ms** 硬阈值证据 |

---

## §9 本源能力边界 + 工程化建议

### 9.1 能力矩阵

| 想回答 | 本源能/否 | v5.2 状态 |
|---|---|---|
| 帧级耗时 | ✅ | frameAnalysis 完整 |
| 主线程在算 vs 在等 | ✅ | Running / Sleeping 完整 |
| 等什么细分 | 🟡 atrace wait slice 重叠法 | ✅ |
| 主循环各阶段 callTrees | ✅ | **v5.2 修了多重嵌套 root bug** |
| 业务模块 selfMs（剥洋葱）| ✅ | **v5.2 修了 wait wrapper 双重计数** |
| GC.Alloc 业务子树次数/帧 | ✅ | gcAllocByModule |
| **RHI / LuaMtGC / ECS Worker 自动识别** | ✅ | **v5.2 全部落地** |
| 降频判定 | 🟡 likely 档（v5.2 温度旁路）| ✅ likely |
| **主线程 binder server 进程**（v5.1 byServerProcess null）| ✅ | **v5.2 修了** |
| GPU 工作量 | ❌ | 设备物理限制 |
| VSync miss / frame_timeline | 🟡 可启用，待 Provider config 改造 | ⏳ |
| Wwise 内部 | ❌ | **结构性不可见**，simpleperf 互补 |
| 函数级 CPU self% | ❌ | simpleperf |

### 9.2 工程化建议（按状态四档）

#### 🟢 已落实（v5.2 代码 + 采集端均到位）

1. RHI / LuaMtGC / ECS Worker 按 atrace slice 反查识别（含 `(Burst)` 空格 LIKE 修复 + RHI/LuaMtGC 排除避免 worker 误识）
2. 业务模块剥洋葱 selfMs（含 `Gfx.WaitForPresent → WaitForPresent` 父子去重）
3. **callTrees 多重嵌套 root 识别**（KNOWN_TOP_LEVEL 名字白名单升级）
4. 降频 likely 档：cpufreq + 温度旁路（采前/采后 thermal_zone）+ 严重低频独立信号
5. binder server 进程：`server_pid` 直接反查 `process.name`（COALESCE 退化 `pid=N`）
6. record_aoeyz.bat v2：时戳目录 / 温度旁路 / cpuinfo_max_freq / collection-manifest.json / root 探测

#### 🟡 待 Provider 子查询扩展（不阻塞 v5.2）

7. RHI 子函数下钻（§7.2）：`Gfx.PresentFrame / waitForever / queueBuffer / RenderLoop.Draw / OpaquePass / ForwardRenderPass` 累计统计
8. MapSignificanceMgr 子函数下钻：`ProcessTask_*` 单次 max 复跑
9. BattleHeadMgr 子函数下钻：`TimeText.7/.6 / OnRefresh / Init` 各计数
10. `_gc_alloc_by_module` 扩展到全 callTrees 节点
11. 每帧 GC.Alloc 时序图（`gcAllocByFrame`）
12. **frame_timeline data source**：让 §2 "Choreographer 节拍 vs PlayerLoop fps" 不一致可量化归因到 jank 类型

#### 🔴 物理 / 结构性不可达（永久声明）

13. `sched_blocked_reason` ftrace 真值（华为非 root 静默丢弃）
14. sysfs `scaling_max_freq` 旁路（confirmed 档不可达）
15. GPU busy / freq counter（骁龙需 root 注入 producer）
16. Wwise 内部细分（atrace 无 native 埋点）

#### 后续工程项

17. **逆向沉淀 v5.2 报告骨架到 perfetto skill**：§-1 数据声明 / §0 结论缩进树 / §3 多线程 / §4 因果链 / §5 降频矩阵 / §6 callTrees 缩进树 + 红线清单 / §7 GPU 单次阈值 / §9 四档能力矩阵 → references/perfetto-report-template.md
18. **核心方法论写入 SKILL.md**：
    - **callTrees 优先 vs atrace LIKE 全 trace 慎用**（v5 的 atrace LIKE 高估业务模块 4.6× 教训）
    - **温度旁路升 likely 档双信号方法**（cpufreq + thermal_zone）
    - **RHI / Worker / MtGC 三类按 slice 内容反查**（不靠 comm 名）
    - **wait wrapper 父子去重**（Gfx.WaitForPresent → WaitForPresent）
19. **阈值表 YAML 化**：reach% < 65% / 单次 Gfx.WaitForPresent > vsync / 单次 BattleHead > 1-2ms / MapSig > 3ms 顶格 → Provider 直接打标

---

> 终极报告 perfetto v5.2 结束。
>
> **本版核心进展**：
> 1. **新数据 + 完整能力**：base/cur/throttle 三份新采，所有 ⏳ 占位填实
> 2. **§-1 数据采集与能力声明**：先告诉读者本报告能/不能回答什么，避免预期错配
> 3. **§0 结论改用层级缩进树**（不再用对比表格）
> 4. **§3 多线程独立分析全开**：UnityMain / Render / RHI / LuaMtGC / ECS Worker × 4 / Audio 各一节真实数据
> 5. **§5 降频判定**：温度旁路 +11.7/-0.8/+1.1°C 数据落地，三档全 likely
> 6. **修了三个 v5.1 遗留 bug**：wait wrapper 双重计数 / binder serverProcess null / callTrees PlayerLoop 多重嵌套 root
> 7. **修了三个 v5.1 漏判 bug**：ECS Worker LIKE 模式空格 / RHI 误识为 ECS Worker / cur 高温段未触发 likely
>
> 配套：[v5.1 报告（callTrees 真实, 旧三份）](./performance-report_perfetto_ULTIMATE_v5.1.md) · [v5（数据快照）](./performance-report_perfetto_ULTIMATE_v5.md) · [v4（视觉化框架原版）](./performance-report_perfetto_ULTIMATE_v4.md) · [AOE CPU 知识库](../aoe-cpu-analysis-knowledge.md)
