# perfetto 单源 性能分析报告 · 终极形态 v4

> 配套：[AOE CPU 知识库](../aoe-cpu-analysis-knowledge.md) · [perfetto 系统知识库](../../.claude/skills/perfetto-trace-analysis/references/perfetto-knowledge.md) · [降频观测指南](../../.claude/skills/perfetto-trace-analysis/降频观测指南.md) · [simpleperf v4 终极报告（趋势参考，非同次采集）](./performance-report_simpleperf_ULTIMATE_v4.md) · [perfetto skill 工程化路线图](./perfetto-skill-engineering-roadmap.md)
>
> **本源主线**：「主线程一帧到底是在算还是在等？等的是什么？机器拖后腿了吗？」
> perfetto 在 simpleperf 的 CPU 函数级采样之外独有：**线程调度状态、off-CPU 归因、atrace slice 树（不依赖符号化）、CPU 频率/降频时序、显示链路**。
>
> v4 相对 v3 的改动：
> - **特色章节前置**：§4 off-CPU 归因 / §5 降频时序 提到主线程业务热点之前，体现 perfetto 与 simpleperf 不同的判定优势
> - **所有 Δ% 改用 ms/帧 算**（v1-v3 部分位置用了累计 ms 算 Δ%，跨次 trace 时长不同导致不可比；本版统一）
> - **§6 业务热点章节并入 §6 主线程章节**（v3 §6 整章删除），§6 末尾加重点热点子树下钻 + 红线触发清单
> - **稀疏触发模块新增"活跃率 + 活跃均"列**（GC.Collect / Hud_Top. 等"平均 ms/帧 看着轻、触发时实际重"的卡顿源）
> - **线程列只写正式名**（UnityMain / RHI / Render / Lua MtGC），不再加括号备注
> - **补 RHI / Render cur sleep% 数据**（v3 §5.1 写 n/a 是错的，sched 表里数据全在）
> - **工程化路线图另起文档**[perfetto-skill-engineering-roadmap.md](./perfetto-skill-engineering-roadmap.md)

---

## §0 结论先行

本次分析采用 4 份 perfetto trace，跨 38 分钟单机连续采集：

| 时间点 | trace | 场景 | 实际时长 |
|---|---|---|---|
| 06-22 21:56 | base | 野外空场景（凉机基线）| 1.35 s |
| 06-23 10:10 | cur | 行军压测 stressmove（约 300 队）| 1.80 s |
| 06-23 10:24 | thermal_1 | 行军压测（开机后第 14 分钟）| 2.14 s |
| 06-23 10:34 | thermal_2 | 行军压测（开机后第 24 分钟）| 3.94 s |

> 4 份采集长度均远短于配置的 10s，根因 buffer 容量不足 → 见 §1。

**三个独立结论**：

1. **cur 主线程瓶颈是"在等 GPU"，不是"在算"**（perfetto 独家）：UnityMain Sleeping 23.55%，**其中 97.2% 被 `URP.WaitForPresent` 覆盖**。每帧 30ms 里平均 ~7ms 主线程在等 GPU。三条相关线程（Main / RHI / Render）的 sleep% 全部上升、活跃度全部下降——唯一在变重的是 GPU 自身。见 §4 / §7。

2. **业务侧 cur 真涨，红线触发清单**（按 ms/帧 实测）：
   - **BattleHeadMgr** avg 1.49 ms/帧（max 3.58）— 平均超 "1-2ms 不合理" 红线，子函数 `TimeText.7` 每帧刷新 1423 次
   - **MapSignificanceMgr** avg 0.89 ms/帧（**max 5.69 ms 单帧破 3ms 顶格红线**）— 子函数 `ProcessTask_MapEntityAdd` 单次最大 3.42ms
   - **OutSideViewArmyLineMgr** 0.03 → 1.48 ms/帧（**×52 倍**）
   - **LuaMgr.OnTick&UpdateSchedule** 1.06 → 3.24 ms/帧（×3）
   见 §6。

3. **thermal_2 上确认级降频**（perfetto 独家时序证据）：cpu7（超大核）完全下线无 sched 活动、cpu4-6 cpufreq 事件归零（governor 锁频）、cpu0-3 max 从 1805 → 1094 MHz（−39%）。帧时单调上升 17.5 → 29.4 → 39.8 → 70.4 ms。**低频环境下 GC.Collect 触发 2 帧，活跃均 44.4ms/帧（单次 max 81ms）**。见 §5。

按 ROI 排序的优化方向：

1. **削 GPU 工作量**（perfetto 独家结论）— 主线程 ~7ms/帧 等 GPU；具体优化方向：降分辨率 / 简化阴影 / 合批
2. **BattleHeadMgr 削峰** — 平均超红线，TimeText 1423 次/帧 重新评估必要性
3. **MapSignificanceMgr 单帧峰值削峰** — max 5.69ms 破红线，`MapEntityAdd` 任务激增需分帧
4. **OutSideViewArmyLineMgr 增量化** — ×52 倍涨幅
5. **降温/降频对策** — 24 分钟后大核完全下线，热保护严重影响体验

---

## §1 采集质量异常 + 数据口径声明

### 1.1 trace 实际时长远短于配置

| 数据 | `-t` 配置 | 实际 `trace_bounds` | 偏差 |
|---|---|---|---|
| base | 10s | **1.35 s** | −86.5% |
| cur | 10s | 1.80 s | −82.0% |
| thermal_1 | 10s | 2.14 s | −78.6% |
| thermal_2 | 10s | 3.94 s | −60.6% |

根因 buffer 不足触发 ring buffer 覆盖（事件密度 ~17-18 MB/s，10s 需要 ~180MB buffer，`-b 32mb` 只能容纳末尾 ~2 秒）。`record_aoeyz.bat` 已改 `-b 32mb → -b 512mb` + 补 `--sideload`，下次重采可获完整 10s 窗口。

### 1.2 数据口径声明（关键）

本报告业务模块耗时**统一按 PlayerLoop 帧聚合**：

```
ms/帧（全帧均）   = 该模块在每一帧 PlayerLoop 时间窗内 所有相关 atrace slice 的 dur 累加，对全部帧求平均
max ms/帧         = 上述按帧值的最大者
活跃帧 / 活跃率   = 该模块在某帧"有出现"（按帧聚合 dur > 0.001ms）的帧数 / 总帧数
活跃均（条件均）  = 仅在"活跃帧"上求的平均 ms/帧
Δ%（跨次对比）    = 必须基于 ms/帧 算，不能用累计 ms 算（不同次 trace 时长 / 帧数不同）
PL%（占比）       = 节点累计 ÷ PlayerLoop 累计，仅作为单次内的"占帧多少"参考，跨次不可比
```

**为什么要区分"全帧均"和"活跃均"**：

| 模块类型 | 活跃率 | 全帧均 vs 活跃均 | 看谁 |
|---|---|---|---|
| 每帧必跑的 Update | ≈ 98%（基本每帧都触发）| 几乎相等（×1.02）| 看全帧均即可 |
| **稀疏触发**（GC、UI 弹板、场景切换）| < 80% | 差异巨大（可达 ×26 ~ ×37）| **必看活跃均**才知"触发时单帧真实代价" |

**实例**：thermal_2 上 `GC.Collect` 全帧均 1.68ms（看上去轻），但活跃率仅 3.8%，**活跃均 44.4ms / 帧**（真实 STW 代价）。本报告对稀疏模块额外列两列（活跃率 + 活跃均）。

### 1.3 数据缺失声明（影响判定置信度）

| 项 | 影响 |
|---|---|
| FrameTimeline | VSync miss / expected vs actual frame 无法量化 |
| GPU counter (busy/freq) | GPU 实际工作量无法直接量化（设备未上报）|
| sysfs 旁路 | 严格"sysfs 确认级"降频判定缺，但本次有"硬件下线 + 跨次时序"等价硬证据（§5）|
| sched_blocked_reason | 主线程 sleep 时内核记录的等待对象不可读，用 atrace wait slice 重叠法替代（§4）|

---

## §2 采集元信息

| 项 | base | cur | thermal_1 | thermal_2 |
|---|---|---|---|---|
| 场景 | 野外空场景 | 行军压测 | 同（持续 14min）| 同（持续 24min）|
| 游戏 pid | 29348 | 29348 | 29348 | 29348 |
| 实际 trace 长度 | 1.35 s | 1.80 s | 2.14 s | 3.94 s |
| PlayerLoop 帧数 | 75 | 60 | 52 | 53 |
| **PlayerLoop p50 / p95 / p99 (ms)** | 16.7 / 23.9 / 25.7 | 29.8 / 35.6 / 35.8 | 40.1 / 64.0 / 94.8 | **69.7 / 76.7 / 77.5** |
| **PlayerLoop fps** | 56.3 | 33.4 | 24.2 | **13.9** |
| slowFrameRate >33ms | 0% | 13.6% | 70.0% | **100%** |

**分位数通俗解释**（备注，仅在本表第一次出现处给一次）：

> 把所有帧从快到慢排队，**p50** = 队伍中间那一帧 = "典型一帧"（一半时间帧耗时都≤此值）；**p95** = 倒数 5% 位置那一帧 ≈ "次坏帧"（只有 5% 的帧比它还慢）；**p99** = 倒数 1% ≈ 样本少时几乎等价于"最坏帧"。
> 用游戏感受说：p50 慢 = 平时玩着就卡（一半时间这样）；p95 慢 = 偶尔抖一下（5% 的帧）；p99 慢 = 概率性卡顿尖峰（百帧才一次）。
> `slowFrameRate >33ms` = 超过 30fps 阈值的帧占比。
>
> **帧口径硬规则**：`choreographer`（vsync 节拍恒定 16.66ms）≠ `playerloop`（应用一帧实际耗时）。本报告所有 fps 结论一律用 PlayerLoop 口径。

---

## §3 线程身份地图（仅在此处定义，全文沿用）

按 game pid=29348 所有 run_ms > 0.5 的活跃线程：

| 行业通用名 | comm | tid | 关键 atrace 证据 | 一句话定位 |
|---|---|---|---|---|
| **UnityMain** | UnityMain | 29457 | `PlayerLoop` × 60、所有 `Update.*` / `LateUpdate.*` | 业务/Lua/ECS 调度主入口 |
| **RHI** | Thread-103 | 29949 | `eglSwapBuffers` × 61 / 944ms、`queueBuffer` × 122 / 1843ms、`Gfx.PresentFrame` × 61、各 RenderPass 实际执行 | 直调 GLES driver + 提交 SurfaceFlinger queueBuffer |
| **Render** | UnityGfxRenderS | 29950 | `Gfx.RenderSlaver.ThreadRun` 主循环、`Semaphore.WaitForSignal` 73.9% | GfxDeviceWorker 命令缓冲构建层（不直调 driver）|
| **Lua MtGC** | UnityMain（同名陷阱）| 30214 | `LuaMtGc.ExecuteMtGc` × 61 / avg 0.2ms | xLua 起的 C# 线程未设 comm 名 |
| **ECS Worker × 4** | Thread-130/131/137/138 | 29935-29940 | 无 atrace slice，纯 Burst Job | 并行 ECS 计算 |
| Choreographer | UnityChoreograp | 29975 | `Choreographer#doFrame` | VSync 回调 |

**命名细节**：RHI 一词来自 UE/D3D 术语，指"直调图形 API 的线程"。在 Unity Android 对应 `Thread-10X`（数字 100/101/102/103 每次采集会变，必须靠 atrace slice 内容判定）。`UnityGfxRenderS` 是 Unity 的命令录制层（Render），处于 main 和 RHI 之间——**带 "Render" 的 comm 名容易让人误读，实际不直调 driver**。

**ECS Worker 健康度**：4 条 Job Worker max-min 偏差 cur 1.41pp，base 1.10pp，均 < 5pp 远低于 30% 红线，并行化健康。

---

## §4 主线程 off-CPU 归因（perfetto 独家·主线问题先回答）

### 4.1 三条相关线程调度对比（含 RHI sleep 数据，v3 写漏的）

| 线程 | base run% | cur run% | base sleep% | cur sleep% | Δ run | Δ sleep |
|---|---|---|---|---|---|---|
| UnityMain | **83.07%** | **74.59%** | 11.67% | **23.55%** | **−8.5pp** | **+11.9pp** |
| RHI | 38.55% | 36.47% | 50.65% | **60.05%** | −2.1pp | **+9.4pp** |
| Render | 24.47% | 21.34% | 67.09% | 73.48% | −3.1pp | **+6.4pp** |

**关键观察**：**三条线程的 sleep 全部上升、run 全部下降**——没有任何 CPU 侧线程在变重。压力源不在 CPU 上。

### 4.2 主线程 Sleeping 归因（cur 全 60 帧 SQL 实测）

UnityMain 在 cur 上总时长 1786.9 ms，state 分布：

| 状态 | 总 ms | 占比 | 含义 |
|---|---|---|---|
| Running | 1332.9 | 74.59% | 在 CPU 上跑代码 |
| Sleeping (S) | **420.8** | **23.55%** | **主动睡眠 / 等事件**（这是"在等"） |
| Disk wait (D) | 6.1 | 0.34% | I/O 等待 |
| Runnable (R/R+) | ~26.6 | 1.49% | 已就绪等 CPU |

把主线程每个 Sleeping 段（state='S'）的时间区间，与同时段主线程上活跃的 atrace wait slice 求重叠（SQL 实测）：

| Sleep 归因来源 | 覆盖 ms | 占主线程 Sleep | 说明 |
|---|---|---|---|
| **URP/Gfx.WaitForPresent** | **411.7** | **97.2%** | **等 GPU 完成上一帧 swapchain Present** |
| WaitForJob*（主线程显式等 Job）| ~2 | ~0.5% | 等 Burst Job 完成（远低于 2% 红线）|
| LuaMultiThreadGC（主线程同步段）| ~0 | ~0% | 本次 GC 主线程同步段无 spike |
| Coroutines / WaitForTargetFPS | ~0 | ~0% | base 上有，cur 上无 |
| 其他（短中断 / vsync 边界 / 内核调度）| ~7 | ~2.3% | 残余 |

**结论**：cur 上主线程 sleep **97% 在等 GPU**——不是等锁、Job、GC、binder。

### 4.3 因果链可视化

```
主线程：发起 URP.Submit → URP.WaitForPresent → 状态切换为 Sleep (S)
   └─ 等 semaphore (Gfx.WaitForPresentOnGfxThread → Semaphore.WaitForSignal)
        └─ 信号源 = GPU 完成上一帧 swapchain Present
              └─ RHI 上 Gfx.PresentFrame 每帧 15.48ms（接近 vsync 全周期 16.66ms）
                    └─ 真因：GPU 处理一帧大概需要 ~15ms
```

### 4.4 worst frame #23 (36.09ms) 三线程时间轴

```
时间轴:  0ms ──────────────────────── 16ms ─────────────────── 36ms
                                      ↑ vsync 边界

UnityMain: ▓▓▓▓▓▓▓▓▓▓▓ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ▓▓▓▓
           业务跑 11ms     ← URP.WaitForPresent 15.7ms →    收尾

RHI:       ▓▓ ▓▓▓▓ ░░ ░░ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ▓▓▓
           命令录制/Pass  ← 等 main（waitForever 19.98ms） →

Render:    ▓ ▓ ▓ ▓ ▓ ▓ ▓ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ░ ▓
           约 7 段 (3ms run + 3ms sleep) ← 等 main 命令       (GPU 双缓冲节拍)

主线程 atrace slice (depth 排序):
  0.00 ─ 36.09ms  PlayerLoop                              [整帧]
  0.88 ─  5.85ms  Update.ScriptRunBehaviourUpdate         [业务 跑]
                  └─ MapManager → OutSideViewArmyLineMgr 1.51ms
  11.69 ─ 33.99ms PostLateUpdate.FinishFrameRendering     [渲染收尾 22.30ms]
                  └─ URP.AfterRendering (15.78 ─ 32.90ms) 17.12ms
                     └─ URP.Submit → URP.WaitForPresent (15.83 ─ 31.53ms) 15.70ms 🔵 wait
```

**worst frame 一行解读**：业务 11ms + 等 GPU 16ms + 收尾 9ms = 36ms。**业务不是元凶，GPU 没跟上**。

### 4.5 base vs cur 主线程状态可视化

```
状态分布对比 (主线程总时长归一化为 100%)

base:  ████████████████████████████████████ ░░░░░░ ▒▒
        Running 83.07%                       Sleep   Runnable 4.18%
                                             11.67%
                                             (其中等 GPU < 0.5%)

cur:   ████████████████████████████████   ░░░░░░░░░░░ ▒
        Running 74.59%                     Sleep        Runnable 1.32%
                                           23.55%
                                           (其中等 GPU 97.2%)

→ base CPU-bound：主线程几乎一直在 CPU 上跑代码。
→ cur 等待型：主线程 1/4 时间在等 GPU；CPU 利用率反而降低；瓶颈位置已移出 CPU。
```

---

## §5 降频时序证据链（perfetto 独家·机器是否拖后腿）

### 5.1 4 份 trace 一行一份样本（按你的紧凑表格式）

| 时间点 | cpu7 sched | cpu7 cpufreq max | cpu4-6 cpufreq max | cpu0-3 cpufreq max | UnityMain run% | PlayerLoop avg / max ms | 解读 |
|---|---|---|---|---|---|---|---|
| **base 21:56** | 活跃 | **2842 MHz** | **2419 MHz** | 1805 MHz | 83.07% | **17.5 / 26 ms** | 凉机基线 |
| **cur 10:10** | 活跃 | 2765 MHz | 2112 MHz | 1805 MHz | 74.59% | 29.4 / 36 ms | 中核 max −12.7%；GPU 等待主导 |
| **thermal_1 10:24** | 活跃 | 2842 MHz | 2227 MHz | 1805 MHz | 79.78% | 39.8 / **119 ms** | 大核暂时恢复；出现 119ms 卡顿尖峰 |
| **thermal_2 10:34** | **完全下线** | **N/A** | **无 cpufreq 事件，频率被锁** | **1094 MHz（−39%）** | **94.53%** | **70.4 / 175 ms** | **cpu7 下线 + cpu0-3 压频；fps 跌到 14** |

### 5.2 thermal_2 上主线程跑到哪些 CPU 上

| CPU | base 上主线程 run_ms | thermal_2 上主线程 run_ms | 含义 |
|---|---|---|---|
| cpu7（超大核）| 584.6 | **0** | 大核完全下线 |
| cpu4 | 230.6 | 1288.1 | 主力 |
| cpu5 | 173.6 | 1224.6 | 主力 |
| cpu6 | 127.2 | 1190.8 | 主力 |

主线程被压到 3 个中核上跑，原本最快的 cpu7 完全不可用。

### 5.3 降频判定

按降频观测指南两级判定：

| 维度 | 严格"sysfs 确认级"要求 | 本数据 |
|---|---|---|
| `scaling_max_freq < cpuinfo_max_freq` | 需 sysfs 旁路 | ❌ 缺 |
| **cpu7 sched 活动归零** | = cluster offline，等价 scaling_max=0 | ✅ thermal_2 |
| **cpu4-6 cpufreq 事件归零** | = governor 锁频，等价 scaling_max=cpuinfo_max=低值 | ✅ thermal_2 |
| **cpu0-3 max 1805→1094** | 持续低频锁定 | ✅ thermal_2 |
| **多份 trace 跨 38 分钟单方向变化** | 时间序列证据 | ✅ |

**判定**：thermal_2 上达到**等价确认级**——不是严格 sysfs 意义，但"cpu7 sched 归零 + cpu4-6 cpufreq 归零"是比 sysfs 更硬的硬件级证据。cur 和 thermal_1 仅推测级。

### 5.4 thermal_2 上业务模块同步劣化（含稀疏模块活跃均）

降频不只是 frame 变慢，业务每个模块都同步变慢（同样代码、慢核执行）：

| 模块 | base avg | cur avg | thermal_2 avg | thermal_2 max | thermal_2 活跃率 | thermal_2 活跃均 |
|---|---|---|---|---|---|---|
| LuaMgr.OnTick&UpdateSchedule | 1.06 | 3.24 | **7.64** | 15.59 | 98.1% | 7.79 |
| MapManager | 0.89 | 3.09 | **9.58** | 11.10 | 98.1% | 9.76 |
| OutSideViewArmyLineMgr | 0.03 | 1.48 | **4.66** | 6.10 | 98.1% | 4.75 |
| BattleHeadMgr | 0.11 | 1.49 | **2.22** | 9.16 | 98.1% | 2.26 |
| MapSignificanceMgr | 0.10 | 0.89 | **2.66** | 11.58 | 98.1% | 2.71 |
| PlayerUpdateCanvases | 1.00 | 0.80 | **3.01** | 4.20 | 98.1% | 3.07 |
| **GC.Collect** | 0 | 0 | **1.68** | **81.27** | **3.8%** | **44.4** ← 触发 2 帧每帧实际 44.4ms |

**重要观察**：thermal_2 上 GC.Collect 触发 2 帧，**单帧活跃均 44.4ms（max 81.27ms）**——降频环境下 GC 周期被显著拉长。如果只看"全帧均 1.68ms"会严重低估实际卡顿。

### 5.5 provider 自动判定 bug

`preprocess.py` 在 thermal_2 上报 `level=none / bigCoreReachPct=86.8%`——**判错**。根因：provider 只查现存 cpufreq 事件做 reach%，cpu4-7 没有 cpufreq 事件 → 被忽略；把仅剩的 cpu0-3 当成"大核"算 950/1094 = 86.8%。已登记 → [工程化路线图](./perfetto-skill-engineering-roadmap.md)。

---

## §6 主线程一帧时间去向（含热点下钻）

### 6.1 PlayerLoop 帧分位数对比

| 分位 | base (ms) | cur (ms) | Δ (ms) | Δ%（基于 ms/帧 ✅）|
|---|---|---|---|---|
| p50（中位帧）| 16.72 | 29.79 | +13.07 | +78.2% |
| p95（次坏帧）| 23.93 | 35.60 | +11.67 | +48.8% |
| p99（最坏帧）| 25.67 | 35.76 | +10.09 | +39.3% |
| slowFrame >33ms | 0% | 13.6% | +13.6pp | NEW |
| fps（PlayerLoop）| 56.3 | 33.4 | −22.9 | −41% |

### 6.2 主线程缩进树（base vs cur, ms/帧 + Δ%）

> 每节点：`[avg ms/帧 · max · Δ%]`，Δ% 一律基于 ms/帧 算（避免累计 ms 跨 trace 长度差异）
> 标记：📈 增量 >50%；🔴 平均超红线；🟡 max 超红线 / 临近；🟢 健康；🔵 wait 型 slice

```
UnityMain (base 75 帧 / cur 60 帧)
│
├─ PostLateUpdate.FinishFrameRendering    base 7.00 / cur 13.72 ms/帧 (max 22.3)   📈 +96%
│   └─ URP.Render → URP.RenderCameraStack → URP.RenderSingleCamera
│      │
│      ├─ URP.AfterRendering             base 0.85 / cur 8.05 ms/帧 (max 17.1)    📈 +847%
│      │  │
│      │  └─ URP.Submit → URP.WaitForPresent  🔵 wait
│      │                                  base ≈0 / cur 6.86 ms/帧 (max 15.7)     📈 (主线程等 GPU)
│      │                                  ↑ 见 §4.2 off-CPU 归因
│      │
│      ├─ URP.MainRenderingTransparent   base 2.02 / cur 1.74 ms/帧               🟢 −14%
│      ├─ URP.BeforeRendering            base 2.06 / cur 1.61 ms/帧               🟢 −22%
│      └─ URP.RendererSetup              base 0.65 / cur 0.62 ms/帧               🟢
│
├─ Update.ScriptRunBehaviourUpdate       base 2.22 / cur 7.00 ms/帧               📈 +215%
│  └─ BehaviourUpdate → Core.Update
│     │
│     ├─ LuaMgr.OnTick&UpdateSchedule    base 1.06 / cur 3.24 ms/帧 (max 8.02)    📈 +207%
│     │  │
│     │  ├─ BattleHeadMgr                base 0.11 / cur 1.49 ms/帧 (max 3.58)    📈🔴 ×14
│     │  │                               ↑ 知识库§4：每帧 1-2ms 已不合理，平均超红线
│     │  │
│     │  ├─ MapSignificanceMgr           base 0.10 / cur 0.89 ms/帧 (max 5.69)    📈🟡 ×8.7
│     │  │                               ↑ 知识库§3：顶格 3ms/帧；max 5.69 已破红线
│     │  │
│     │  └─ TimeWheel / UIMgr / SkillMgr / OrientationMgr 等 → 各 < 0.1 ms/帧      🟢
│     │
│     └─ MapManager                      base 0.89 / cur 3.09 ms/帧 (max 4.21)    📈 +247%
│        │
│        ├─ OutSideViewArmyLineMgr       base 0.03 / cur 1.48 ms/帧 (max 2.14)    📈🔴 ×52
│        │   └─ OutsideLineCtrl:CalculateVertexJob (Burst) avg 0.41 ms/帧
│        │      (Burst Job 调度入口，实际计算在 Job Worker 上)
│        │
│        ├─ BattleUIManager              base 0.05 / cur 0.56 ms/帧 (max 0.80)    🟢
│        │   └─ BattleUIUpdate → MUI_UpdateUIPos  cur 0.48 ms/帧                  🟢 健康
│        │      └─ MUI_GetArmyPos  cur 0.05 ms/帧
│        │
│        └─ MapEntityEffectMgr / OutsideViewTreeMgr / WorldEnvironmentMeshItemMgr / 等
│           各 < 0.1 ms/帧                                                         🟢
│
├─ PreLateUpdate.ScriptRunBehaviourLateUpdate  base 1.43 / cur 2.48 ms/帧         📈 +73%
│  └─ LateBehaviourUpdate → Core.LateUpdate
│     ├─ MeshUIManager                   base 0.08 / cur 0.95 ms/帧 (max 1.86)    📈🟡 ×12
│     └─ LuaMgr.OnLateUpdateSchedule     base 0.33 / cur 0.37 ms/帧               🟢
│
├─ Initialization.PlayerUpdateTime → WaitForTargetFPS  🔵 wait
│                                        base 1.80 / cur 0.014 ms/帧              🟢 → 0
│                                        ↑ base 主线程跑完业务还有 ~2ms 空闲等 vsync；
│                                          cur 上这块归零——所有预算被 wait+业务吃光
│
├─ SimulationSystemGroup                 base 0.86 / cur 0.98 ms/帧               🟢 <1ms
│                                        ↑ 知识库§8：主线程 >1ms 或有 Complete.Job 不合理，本次未触发
│
├─ InitializationSystemGroup             base 0.50 / cur 0.60 ms/帧               🟢
├─ PostLateUpdate.PlayerUpdateCanvases   base 1.00 / cur 0.80 ms/帧               🟢 −20%
│                                        ↑ 知识库§7：>1ms/帧 不合理；cur 反而下降
├─ PostLateUpdate.PlayerSendFrameComplete  base 0.57 / cur 0.66 ms/帧             🟢
└─ TServerManager                        base 0.07 / cur 0.28 ms/帧               🟢 远低于 15% 主线程红线
```

### 6.3 Top 4 红线热点下钻

#### 6.3.1 BattleHeadMgr（avg 1.49 ms/帧，max 3.58，平均超 1-2ms 红线）

```
BattleHeadMgr  (cur 1.49 ms/帧 · 60 帧 / 共 89.3ms 累计)
└─ BattleHeadMgr.OnUpdate  cur avg 1.488 / max 3.562 ms/帧
   ├─ TimeText.7              c=1423/帧 (!!!)  avg 0.011 / 累计 16.06 ms
   │                          ↑ 每帧 1423 个 TimeText 在刷新 → 数量是热点根因
   ├─ BattleHead.OnRefresh    c=57 帧 avg 0.256 / max 1.011 ms（部分帧多次）
   ├─ TimeText.6              c=1423/帧 avg 0.006 / 累计 8.74 ms
   ├─ BattleHead.Init         c=34（部分帧）avg 0.227 / max 1.514 ms
   ├─ GC.Alloc                c=913/帧（!!!）累计 1.35 ms ← 每帧 913 次小分配
   ├─ NameNoWar.OnRefresh     c=13 帧 avg 0.066 ms
   └─ MultipleTroops/NameRetreat 等  各 < 0.2ms 累计
```

**优化方向**：
- `TimeText.7`/`.6` 每帧 1423 次刷新——本次场景 300 队 × 多个时间字段，需评估"是不是每个 head 都需要每帧刷一次时间"
- `GC.Alloc` 每帧 913 次——`BattleHead.OnRefresh` 内部有分配，需做对象池
- `BattleHead.Init` max 1.514ms——34 帧上触发，部分帧爆量

#### 6.3.2 MapSignificanceMgr（avg 0.89 ms/帧，max 5.69 单帧破 3ms 顶格红线）

```
MapSignificanceMgr  (cur 0.89 ms/帧 · 60 帧 / 共 57.1ms 累计)
└─ MapSignificanceMgr.sampler_OnUpdate  cur 0.945 / max 5.681 ms/帧
   ├─ MapSignificanceMgr.ProcessTasks       cur 0.870 / max 5.537 ms/帧
   │  └─ MapSignificanceMgr.EntityTask      cur 0.805 / max 5.447 ms/帧
   │     ├─ ProcessTask_MapObjRefresh   c=201/帧（每帧 ~3 次）avg 0.129 / max 0.479 ms
   │     ├─ ProcessTask_MapEntityAdd    c=36（部分帧）avg 0.164 / max 3.419 ms !!!
   │     │                              ↑ max 那一帧的 5.69ms 主要由此推上去
   │     ├─ ProcessTask_MapObjCleanUp   c=35（部分帧）avg 0.163 / max 0.767 ms
   │     ├─ ProcessTask_MapObjInit      c=36（部分帧）avg 0.135 / max 0.285 ms
   │     ├─ ProcessTask_ZoomEntityAdd   c=213/帧 avg 0.004 ms 累计 0.79 ms
   │     └─ ...
   └─ MapSignificanceMgr.UpdatePrepareTask  cur 0.042 / max 0.318 ms/帧
```

**优化方向**：
- 知识库§3 原话："如果任务太多，会造成这个管理器一直处于 3ms 的顶格消耗" —— **本次 max 5.69ms 已超顶格**
- 真凶 `ProcessTask_MapEntityAdd` 单次最大 3.42ms —— 新实体加入时一次性处理过多
- 建议：**分帧处理**（一帧最多处理 N 个 EntityAdd 任务，剩下排队下一帧）或**预算控制**（顶格 3ms 触底立即返回）

#### 6.3.3 OutSideViewArmyLineMgr（avg 1.48 ms/帧，×52 倍增长）

```
OutSideViewArmyLineMgr  (cur 1.48 ms/帧 / 共 90.0ms 累计)
└─ 子节点
   ├─ OutsideLineCtrl:CalculateVertexJob (Burst)  c=7192/帧 avg 0.003 / max 0.447 ms
   │                                              ↑ 每帧 7192 次 Burst Job 调度入口
   │                                              ↑ 实际顶点计算已下沉 Job Worker 并行
   ├─ *** ViewLineMgr_OnUpdateChaserLine ***      c=60 avg 0.002 ms
   └─ JobAlloc.Grow                                c=7 avg 0.002 ms
```

**优化方向**：
- 主要消耗在 Burst Job 调度入口（7192 次/帧 = 大约 300 队 × 20+ 路径点），即使 Burst 内部计算很快，**调度开销也叠加起来 1.5ms/帧**
- 知识库§4：行军线刷新在压测下高负载是预期内的，但 ×52 倍涨幅说明可以做**视距分级**（远处队伍降频更新）或**几何缓存**（轨迹未变复用上帧结果）

#### 6.3.4 LuaMgr.OnTick&UpdateSchedule（avg 3.24 ms/帧，×3 倍增长）

```
LuaMgr.OnTick&UpdateSchedule  (cur 3.24 ms/帧 / 共 199.7ms 累计)
└─ Lua 管理器调度（每帧执行 12+ 个管理器的 OnUpdate）
   ├─ BattleHeadMgr         cur 1.500 ms/帧  ← 见 §6.3.1（独立分析）
   ├─ MapSignificanceMgr    cur 0.952 ms/帧  ← 见 §6.3.2（独立分析）
   ├─ TimeWheel             cur 0.097 ms/帧 max 1.408 ms
   ├─ UIMgr                 cur 0.068 ms/帧
   ├─ SkillMgr              cur 0.068 ms/帧
   ├─ OrientationMgr        cur 0.066 ms/帧 max 0.197 ms
   ├─ TimeMgr               cur 0.033 ms/帧
   ├─ FrameTimeWheel        cur 0.039 ms/帧 max 0.193 ms
   ├─ CoMgr                 cur 0.028 ms/帧 max 0.266 ms
   ├─ Hud_Msg               cur 0.033 ms/帧
   ├─ InfiniteZoomMgr       cur 0.031 ms/帧
   └─ Hud_Common            cur 0.019 ms/帧 + 其他 (各 < 0.05ms)
```

**优化方向**：
- LuaMgr 增量 +2.18 ms/帧 中，**BattleHeadMgr 占 1.39ms（64%）+ MapSignificanceMgr 占 0.85ms（39%）**——两个主要管理器已独立分析
- 其他子管理器单个均 <0.1ms，**Lua 调度本身没增量**，纯靠两个主力管理器变重

### 6.4 红线触发清单（按优先级）

| 优先级 | 模块 | 实测 | 红线 | 子函数热点 |
|---|---|---|---|---|
| 1 | BattleHeadMgr | avg **1.49** ms/帧 | 1-2ms 不合理 | TimeText.7 × 1423/帧 + GC.Alloc × 913/帧 |
| 2 | MapSignificanceMgr | max **5.69** ms/帧 | 顶格 3ms/帧 | ProcessTask_MapEntityAdd 单次 max 3.42ms |
| 3 | OutSideViewArmyLineMgr | avg **1.48** ms/帧 ×52 | 压测下偏高合理 | Burst Job 调度 7192 次/帧 |
| 4 | MeshUIManager (Late) | max **1.86** ms/帧 | 临近红线 | （未细查）|

### 6.5 worst frame vs median frame 结构差异

| 阶段（占该帧 f%）| median frame#5 (16.43ms) | p95 frame#27 (35.60ms) | worst frame#23 (36.09ms) |
|---|---|---|---|
| FinishFrameRendering | ~16% | ~50% | **61.8%**（其中 URP.AfterRendering 47.5%）|
| ScriptRunBehaviourUpdate | ~50% | ~14% | 13.8% |
| ScriptRunBehaviourLateUpdate | ~10% | ~7% | 7.2% |

**慢帧的根因和均匀帧不一样**——慢帧主导是 wait（50-62%），均匀帧主导是业务（50%）。

---

## §7 渲染链路 + GPU bound 判定

### 7.1 RHI 顶层 slice（cur）

| slice | count | total ms | avg ms/触发 | 含义 |
|---|---|---|---|---|
| `queueBuffer` | 122 | **1843.7** | 15.11 | 提交 buffer 到 SurfaceFlinger（双缓冲每帧 2 次）|
| `Gfx.PresentFrame` | 61 | **944.3** | 15.48 | 每帧 Present，与 vsync 16.66 节拍对齐 |
| `eglSwapBuffers` | 61 | 944.3 | 15.48 | GLES 提交完整一帧 |
| `waitForever` | 61 | 876.6 | 14.37 | Present 后等下一帧信号 |
| `RenderLoop.Draw` | 729 | 228.5 | 0.31 | 实际绘制循环 |
| `ForwardRenderPass` | 363 | 172.8 | 0.48 | 前向渲染 |
| `OpaquePass` | 427 | 135.0 | 0.32 | 不透明 pass |

`Gfx.PresentFrame` 每帧 15.48ms，**几乎用满 vsync 间隔** — GPU 处理一帧需要 ~15ms，主线程在 URP.WaitForPresent 上阻塞着等这个完成。

### 7.2 Render 顶层 slice（cur）

| slice | total ms | base/cur PL% | 说明 |
|---|---|---|---|
| `Gfx.RenderSlaver.ThreadRun` | 1796.2 | 98.56% / 99.61% | RHI 主循环 |
| `Semaphore.WaitForSignal` | **1359.3** | **69.55% / 73.93%** | **等主线程发信号——比 base 更闲** |
| `OpaquePass` | 91.8 | 5.96% / 5.05% | |
| `ForwardRenderPass` | 74.0 | 1.84% / 1.20% | |

Render 线程**没有任何 wait GPU 节点**——等 GPU 是主线程做的（swapchain Present 是 main 发起的）。**GPU-bound 信号只会出现在主线程上**，不在 RHI/Render 上。

### 7.3 GPU bound 判定（perfetto 单源边界）

| 信号 | 直接证据 | 间接证据 | 判定 |
|---|---|---|---|
| GPU busy/freq counter | — | 设备未上报 | ❌ 直接证据缺 |
| 主线程等 GPU（perfetto-knowledge F2 高置信信号）| **URP.WaitForPresent cur 411.7ms / 主线程 sleep 总 420.8ms 中 97.2% 被它覆盖** | ✅ atrace + sched 双重验证 | 🔴 **强烈倾向 GPU-bound** |
| RHI `Gfx.PresentFrame` 撑满 vsync | cur 每帧 15.48ms / vsync 16.66ms | ✅ | 🔴 强化 |
| Render 非瓶颈 | Sleep 67% → 74%、Semaphore.Wait 70% → 74% | ✅ | 🔴 强化 |
| RHI 也更闲 | Sleep 50.6% → 60.1% | ✅ | 🔴 强化（v3 写漏的）|

**判定**：

- ✅ "**cur 上观察到强 CPU 侧 GPU-bound 信号**"
- ❌ 不能说"GPU 满载"——无 GPU busy counter；可能 GPU 满载，也可能 GPU 中等忙但 vsync 排队 + driver round-trip 拉长 wait
- 进一步判定需 Snapdragon Profiler / RenderDoc / 重采带 `gpu_counter` 的 perfetto

GPU 侧优化方向：降分辨率（移动端 900P 替代 2K，知识库 E3 经验值 GPU 负载降 60%）、简化阴影（PlanarShadow）、MeshUI 顶点数评估。

---

## §8 与 simpleperf v4（非同次采集）的趋势对照

**前提**：v4 与本次**不是同一次采集**，所有数值不可直比，仅作趋势级参考。

| 现象 | v4 那次 | perfetto v4 本次 | 一致性 |
|---|---|---|---|
| OutSideViewArmyLineMgr 暴涨 | §4.5 +2759% | §6 ×52 | ✅ 趋势同 |
| BattleHeadMgr 高负载 | §4.4 子树 | §6 1.49 ms/帧 超红线 | ✅ |
| MeshUI 位置刷新 | §4.4 +3390% | §6 cur 0.48 ms/帧 | ✅ 趋势同 |
| ECS Worker 并行健康 | §7.1 偏差 4.2% | §3 偏差 1.4pp | ✅ |
| RHI 命令吞吐持平 | §6.2 DrawBuffers +5% | §7 Sleeping +6.7pp | ✅ |
| TServer/网络远低红线 | §5.3 0.73% | §6 cur 0.28 ms/帧 | ✅ |
| GPU 是否瓶颈 | §6.3 "未观察到" | §4 "观察到强 GPU-bound 信号" | ⚠️ 两次状态可能不同 |

**两源能力互补**：
- v4 独家：函数级 CPU self%、运行时函数反查（__memcpy / GC_* / __memalign）、native 中间件细分（Wwise / driver 内部）
- perfetto 独家：线程 Running/Sleeping、off-CPU 归因、不依赖符号化的 atrace slice、降频时序、稀疏模块条件均

---

## §9 本源能力边界

| 想回答 | 本源能/否 | 替代源 |
|---|---|---|
| 帧级耗时（哪帧卡）| ✅ frameAnalysis | — |
| 主线程在算 vs 在等 | ✅ Running / Sleeping (§4) | — |
| 等什么细分（GPU/锁/Job/binder/vsync）| ✅ atrace wait slice 重叠法（§4.2）；细分到内核 reason 需 sched_blocked_reason | — |
| 主循环各阶段子树 | ✅ atrace slice 树（不依赖符号化）| — |
| 函数级 CPU self% | ❌ | simpleperf |
| AOE 业务模块顶层（MapSig / BattleHead 等）| ✅ atrace marker | — |
| 业务模块**深层子函数**（TimeText / BattleHead.OnRefresh 等）| ✅ 本次 §6.3 实测，atrace 标记够细 | — |
| GC.Collect 单次 STW（含稀疏模块条件均）| ✅（thermal_2 上 max 81ms / 活跃均 44.4ms）| — |
| LuaMtGc 单次 spike | ✅（本次 avg 0.018ms 无 spike）| — |
| 降频 / 热限频 | 🟡 时序证据可达"硬件等价确认"程度；严格 sysfs 旁路仍需 record_tmaoe_thermal.bat | sysfs |
| GPU 实际工作量 | ❌ 本设备未上报 GPU counter | Snapdragon Profiler / RenderDoc |
| 显示链路 VSync miss | ❌ trace 无 actual_frame_timeline | 重采开 data source |
| native 中间件细分（Wwise / driver 内部）| ❌ atrace 没有 native 内部埋点 | simpleperf / Wwise Profiler |

### 9.1 本报告独家产出（v1/v2/v3/v4 报告各自的进化）

| 能力 | v1 | v2 | v3 | v4 |
|---|---|---|---|---|
| 主线程 off-CPU 归因 | — | — | ✅ §7 | ✅ §4（前置）|
| worst frame 三线程时间轴 | — | — | ✅ | ✅ §4.4 |
| 降频四点时序证据链 | — | — | ✅ § 8 紧凑表 | ✅ §5（前置）|
| 业务模块 ms/帧 + max 按帧聚合 | 误用子 slice 平均 | 误用子 slice 平均 | ✅ §4/§6 实测 | ✅ §6 |
| 稀疏模块活跃率 + 活跃均 | — | — | — | ✅ §1/§5/§6 |
| 业务模块深层子函数下钻 | — | — | — | ✅ §6.3 |
| 线程身份纠正（RHI vs Render）| 错 | 错 | ✅ | ✅ |
| Δ% 基于 ms/帧（不用累计 ms）| 错 | 错 | 部分错 | ✅ |

### 9.2 工程化路线图

详见 [perfetto-skill-engineering-roadmap.md](./perfetto-skill-engineering-roadmap.md)。

---

> 终极报告 perfetto v4 结束。
> 配套：[simpleperf v4（趋势参考，非同次采集）](./performance-report_simpleperf_ULTIMATE_v4.md) · [AOE CPU 知识库](../aoe-cpu-analysis-knowledge.md) · [perfetto 系统知识库](../../.claude/skills/perfetto-trace-analysis/references/perfetto-knowledge.md) · [降频观测指南](../../.claude/skills/perfetto-trace-analysis/降频观测指南.md) · [perfetto skill 工程化路线图](./perfetto-skill-engineering-roadmap.md)
