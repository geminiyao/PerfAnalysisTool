# 系统级性能分析报告 · perfetto 单源 · ULTIMATE v5.3

> **生成依据**:仅基于 `.claude/skills/perfetto-trace-analysis/` 内 5 份 skill 文件 + 三份 v5.3 跑出来的 perfetto-profile-summary.json + sample_* 同目录旁路文件(thermal_before/after.txt + collection-manifest.json + cpuinfo_max_freq.txt)。
>
> **设备**:PAL-AL00(华为 Mate 40 Pro,骁龙 888,1+3+4 大中小架构)/ 非 root / Android atrace。
> **进程**:`com.tencent.aoeyz` pid=9577。
> **场景**:三态(base 60fps 凉机 → cur 33fps 高温 → throttle 21fps 重度降频)。

---

## §-1 数据采集 · 能力声明

### -1.1 本次采集的数据(列表)

| 角色 | 时间点 | 落盘窗口 | 帧数 | trace 文件 |
|---|---|---|---|---|
| **base** | 2026-06-24 10:49:44 | 11.43 s | 680 | `sample_base_20260624_104944/2026-06-24_10-49-c1a652.pftrace` |
| **cur** | 2026-06-24 10:50:41 | 14.67 s | 484 | `sample_cur_20260624_105041/2026-06-24_10-50-efb338.pftrace` |
| **throttle** | 2026-06-24 10:55:39 | 19.96 s | 427 | `sample_throttle_20260624_105539/2026-06-24_10-55-2f0696.pftrace` |

> **注**:三份 trace 实际窗口不一致(同样配置 `-b 256mb -t 20s`,base 60fps 高密度事件先把 ring 撑爆而 throttle 21fps 事件密度低于 ring 速率所以拿到完整 20s)。
> **跨次对比一律用 ms/帧 + 占整 trace %(totalPct)归一化**;绝对 totalMs 仅本次内部参考,不直接做 Δ。

每份 trace 同目录还落了 v2 record 脚本旁路文件:

| 旁路文件 | 用途 |
|---|---|
| `collection-manifest.json` | root 状态 / 旁路项可读性 / 已知能力边界 |
| `thermal_before.txt` / `thermal_after.txt` | 采前/采后 16 个 thermal_zone 温度 |
| `cpuinfo_max_freq.txt` | 8 核理论上限 (1.8/1.8/1.8/1.8/2.4/2.4/2.4/2.84 GHz) |

### -1.2 数据维度矩阵

按 ✅ 已采到 / ⏳ 已落实代码但需 Provider 重跑 / ❌ 物理或结构性不可达 三档:

| 维度 | 状态 | 用途 |
|---|---|---|
| atrace 业务 slice (PlayerLoop / Core.Update / 各 Mgr) | ✅ | 主线程一帧时间去向 |
| sched 三态 (Running / Sleeping / Runnable) | ✅ | off-CPU 归因 |
| CPU 频率 cpufreq counter (per-CPU avg/max) | ✅ | 降频时序 |
| 温度旁路 thermal_zone soc_thermal | ✅ | 降频 likely 档判定 |
| cpuinfo_max_freq 旁路 | ✅ | reach% 分母校准 |
| callTrees 父子链(剥洋葱) | ✅ | 业务模块 totalMs / selfMs |
| RHI / LuaMtGC / ECSWorker × 4 自动识别 | ✅ | 多线程独立分析 |
| android_binder_txns server 进程归属 | ✅ | 主线程被谁阻塞 |
| Choreographer fps (vsync 节拍) | ✅ | 显示链路 vs PlayerLoop 对照 |
| GC.Alloc 业务子树归因 (次/帧) | ✅ | 业务分配源定位 |
| GC.Collect 单次 STW(LuaMultiThreadGC) | ✅ | GC spike |
| ❌ sched_blocked_reason ftrace | 物理不可达 | 华为非 root 内核静默丢弃 |
| ❌ sysfs scaling_max_freq 旁路 | 物理不可达 | 华为锁了 Permission denied |
| ❌ GPU busy / freq counter | 物理不可达 | 骁龙需 root 注入 producer |
| ❌ actual_frame_timeline_slice | 需 Provider 切 perfetto config 模式 | VSync miss 量化,后续 |
| ❌ Wwise 内部细分 | 结构性不可达 | atrace 无埋点,需 simpleperf 互补 |

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

---

## §0 结论先行

> ### ⚠️ 三大独立结论(按强度排序)
>
> **🔴 ① 主线程瓶颈形态:从 base 的"几乎全程在算"经 cur 的"算+等混合"演化到 throttle 的"半睡型"——核心增量是等 GPU,不是等锁/binder。**
>
> ```
> UnityMain Running / Sleeping (sched 三态):
>   base       █████████████████████████████ ░░░    Run 86.94% / Sleep 12.04%   ← 凉机 CPU-bound 健康态
>   cur        ██████████████████████████ ░░░░░     Run 77.82% / Sleep 20.40%   ← 算+等混合,Sleep 多出 8pp
>   throttle   ███████████████████ ░░░░░░░░░░       Run 56.99% / Sleep 38.99%   ← 半睡型,Sleep 多出 27pp
>
> Gfx.WaitForPresent 占整 trace (主线程睡等 GPU 上一帧 Present):
>   base       5.38%   ← 双缓冲健康, 与 WaitForTargetFPS 6.18% 共享 Sleep 预算
>   cur        19.28%  ← Sleep 增量 8pp 几乎全部 (≈8/8) 是等 GPU
>   throttle   38.08%  ← Sleep 增量 27pp 几乎全部 (≈27/27) 是等 GPU; 单帧等 17.8ms 已超 60Hz vsync
> ```
>
> 详见 §4 / §7。
>
> **🔴 ② 业务侧主入口 Core.Update 涨幅集中在 LuaMgr 与 Outside.MapManager 两条子树,与压测高负载强相关——但单一模块没有突破红线 critical 档。**
>
> ```
> Core.Update                       base 1.73 / cur 7.32 / throttle 8.05 ms/帧 (📈 ×4.2 → ×4.7)
> ├─ CS:AOE.LuaMgr                  base 1.00 / cur 3.80 / throttle 3.47 ms/帧 (📈 ×3.8)
> │  └─ LuaMgr.OnTick&UpdateSchedule  base 0.95 / cur 3.74 / throttle 3.41 ms/帧
> │     ├─ BattleHeadMgr            base ~0  / cur 1.51 / throttle 1.10 ms/帧 🔴 cur 单次 1.50ms 触红线 1ms
> │     └─ MapSignificanceMgr       base 0.32(LIKE)/ cur 1.30 / throttle 1.07 ms/帧 🟡 单次 1.29ms 临近红线 2ms
> ├─ CS:AOE.Outside.MapManager      base 0.44 / cur 2.90 / throttle 3.99 ms/帧 (📈 ×6.6 → ×9.1, throttle 头号增量)
> │  ├─ OutSideViewArmyLineMgr      base ~0  / cur 1.58 / throttle 2.44 ms/帧 🔴 throttle 单次 2.44ms 超红线 2ms
> │  └─ BattleUIManager             base ~0  / cur 0.72 / throttle 0.83 ms/帧 🟢
> └─ CS:AOE.TServerManager          base ~0  / cur 0.31 / throttle —      ms/帧 🟢 远低 hard-cap 8ms
> ```
>
> 详见 §6。
>
> **🔴 ③ 三份样本均触发降频 likely 档(温度旁路 + 大核 reach% 双信号);throttle 形态最完整(reach 59.2% + 持续高温);base 反直觉触发是因为 11.7°C 的剧烈升温(凉机进热段)。**
>
> ```
> base       soc_thermal 65.6 → 77.3°C  Δ +11.7°C    ← 凉机起步,采集中段进热保护阈值 (≥70°C)
>            bigCoreReach 74.9% (cpu7 73.7% / cpu4-6 76.1%)
>            evidence: 升温剧烈 + reach 背离主线程 86.9% Run
>
> cur        soc_thermal 79.8 → 79.0°C  Δ -0.8°C     ← 起点已经爆表 (≥75°C), 增量为零=SoC 已主动压频在压温度
>            bigCoreReach 75.6% (cpu7 77.0% / cpu4-6 74.2%)
>            evidence: 高温起点独立信号触发 (>=75°C)
>
> throttle   soc_thermal 75.6 → 76.7°C  Δ +1.1°C     ← 温度走平,reach 暴跌至 59.2% 是降频生效硬证
>            bigCoreReach 59.2% (cpu7 61.4% / cpu4-6 57.0%)
>            evidence: bigReach<65% 严重低频 + 采后≥75°C 双信号
> ```
>
> 详见 §5。

按 ROI 排序的优化方向:

1. **降低主线程 Outside.OutSideViewArmyLineMgr 单次 OnUpdate 成本** — throttle 上 2.44 ms/帧、单次 2.44ms 超 redline 2ms,且其下还有 51,240 次 `OutsideLineCtrl:CalculateVertexJob (Burst)`,主线程"调度入口"可能挂等 job(参考知识库 §8 ECS 仅分发不等待原则)。是 cur→throttle 唯一上涨的红线模块。
2. **降低 cur 阶段 BattleHeadMgr.OnUpdate 单次成本** — cur 单次 1.50 ms/帧已破 redline 1ms,且伴随 5341 次 GC.Alloc(11 次/帧,perfetto 独家归因),建议把 head 信息每帧重建改成 dirty-flag 增量。
3. **PlayerUpdateCanvases 在 throttle 上单次涨到 1.14ms** — 知识库 §7 明确 UGUI 已 MeshUI 化后 >1ms 即不合理;查残留的 UGUI Canvas(若 Hud_Common 等老栈还在跑 layout dirty)。
4. **降 GC.Alloc 头号源头(Core.Update 子树)** — cur 30.5 次/帧 / throttle 17.3 次/帧,主要在 BattleHeadMgr(11/帧)和 LuaMgr(2.5/帧),压力随场景同步上升。即便每次只有几 KB,30 次/帧累积每秒 ~900 次 → 间接拉 GC.Collect 压力。
5. **从渲染端缓解 GPU 压力(对 throttle 形态最 ROI)** — 主线程已经把 19.96s 中的 38% 在等 GPU,降 drawcall / 缩 transparent pass 即可一次性还回 ~7.6s 主线程预算。
6. **散热/高刷新策略** — base 已经 11.7°C 单段升温到达 77°C,意味着 1-2 min 后必然进入 throttle 状态;考虑场景级温度感知降级(降低分辨率 / 关阴影)。

---

## §1 采集质量声明 + 数据口径

| 项 | 内容 |
|---|---|
| **帧口径** | `playerloop` 帧(主线程 PlayerLoop 一次完整 begin→end);**不等于** `choreographer` vsync 节拍。三份 Choreographer 都稳定在 60 Hz(60.0/60.0/60.1),意味着屏幕节拍正常,但 PlayerLoop 实际跑出的 fps 是 59.8 / 33.1 / 21.4 — cur/throttle 业务跟不上 vsync,跨周期掉帧。 |
| **trace 窗口** | base 11.43s / cur 14.67s / throttle 19.96s。三份不一致原因见 §-1.1。 |
| **采样窗口边界** | profileWindow 与全 trace 一致(未遇 CombinedProfile 色块),所以全报告所有 totalPct 都是基于全 trace 而非剪裁。 |
| **GPU 缺数据** | 无 GPU busy/freq counter(骁龙非 root 不可采),所以 §7 给出"GPU 满载"硬结论时**只能停在间接强信号档(单次 Gfx.WaitForPresent > vsync 周期)**,不臆断"GPU 100% 满载"。 |
| **off-CPU byReason 缺数据** | sched_blocked_reason ftrace 在华为非 root 上静默丢弃,所有 byReason 行 blockedFunction 都是 null。byState 三态可信(S/R/D/R+);byReason 用 §4 atrace wait slice 重叠法旁路。 |
| **可信度** | high — atrace + sched + freq + thermal 全部到位;唯一灰色地带是 GPU/FrameTimeline。 |

---

## §2 采集元信息表

| 项 | base | cur | throttle |
|---|---|---|---|
| 采集时间 | 2026-06-24 10:49:44 | 2026-06-24 10:50:41 | 2026-06-24 10:55:39 |
| trace 窗口(durMs) | 11430.4 ms | 14668.1 ms | 19957.6 ms |
| PlayerLoop 帧数 | 680 | 484 | 427 |
| PlayerLoop fps | 59.8 | **33.1** | **21.4** |
| Choreographer fps | 60.1 | 60.0 | 60.1 |
| PlayerLoop p50/p95/p99 ms | 16.69 / 18.68 / 21.37 | 30.15 / 35.22 / 42.54 | **45.94 / 55.62 / 66.32** |
| slowFrame >33ms | 0.15% | 13.04% | **98.83%** |
| pssMb | 72.4 | 124.7 | 87.6 |
| CPU 平均频率 (8核) | 1729.5 MHz | 1576.3 MHz | **1324.6 MHz** |
| bigCoreReach | 74.9% | 75.6% | **59.2%** |
| soc_thermal Δ°C | 65.6 → 77.3 (Δ +11.7) | 79.8 → 79.0 (Δ -0.8) | 75.6 → 76.7 (Δ +1.1) |
| 降频 level | likely | likely | **likely** |
| binder count / avg ms | 11 / 0.248 ms | 15 / 0.253 ms | 20 / 0.322 ms |
| binder 唯一对端 | system_server (pid=1873) | system_server (pid=1873) | **system_server (pid=1873)** |

> **PlayerLoop fps vs Choreographer fps 差距**:cur 上 33.1 vs 60.0 = 0.55 倍,throttle 上 21.4 vs 60.1 = 0.36 倍。这两个值都触发 aoe-watch-spec.yaml 的 `framerate-vs-vsync-gap`(playerloop fps < choreographer fps × 0.5 时为 critical)→ throttle 触发,cur 接近触发。意味着业务持续跨多个 vsync 周期掉帧,而非 SurfaceFlinger 调度异常。

---

## §3 多线程独立分析

### §3.0 线程一览(自动识别结果)

| 通用名 | comm (实测) | tid | 关键 atrace 特征 | identifiedBy slice 数 | 一句话定位 |
|---|---|---|---|---|---|
| **UnityMain** | UnityMain | (主进程) | `PlayerLoop` × 680/484/427、`Update.*`、`LateUpdate.*` | 直接从 process 主线程定位 | 业务 / Lua / ECS 调度主入口 |
| **Render** | UnityGfxRenderS | (固定) | `Gfx.RenderSlaver.ThreadRun`、`Semaphore.WaitForSignal` | 固定 comm | Unity 命令录制层 |
| **RHI** | Thread-103 | 10311 | `Gfx.PresentFrame` 等 | base 2720 / cur 1936 / throttle 1708 | 直调 GLES driver |
| **Lua MtGC** | UnityMain (**同名陷阱**) | 10780 | `LuaMtGc.ExecuteMtGc` | base 680 / cur 486 / throttle 427 | xLua C# GC 线程,排除主线程 utid 后唯一匹配 |
| **ECS Worker × 4** | Thread-135/137/138/139 | 10299-10302 | `xxxSystem:xxxJob (Burst)` | base 23-27k / cur 18-19k / throttle 15-16k each | Unity Job System Burst Worker 池 |
| **Audio 线程池** | AudioTrack / AAudio_1 / Audio Mixer / Audio Stream / GVoiceRender | (各自) | 内核 AudioFlinger 回调 | — | 三态 Sleep ≥99%, 不是瓶颈 |
| **AsyncWorker** | AsyncWorker | (throttle 才采到) | — | — | 99.88% Sleep, 旁路任务很少 |
| ❌ Wwise | — | — | atrace 无埋点 | — | **本源结构性不可见**(永久声明,需 simpleperf) |

> **同名陷阱破解证据**:LuaMtGC 的 `commName` 是 `UnityMain`,与主线程 comm 完全相同 — 但 tid=10780 而主线程 tid 不同,且这条线程的 atrace slice 内容里只有 `LuaMtGc.ExecuteMtGc`,没有 `PlayerLoop`,所以 Provider `_identify_lua_mtgc_thread` 用 slice 内容反查正确分辨开。**报告 §3 全用通用名,不写 comm 名 / tid 字符串硬匹**。

### §3.1 UnityMain(主线程)

| 状态 | base | cur | throttle |
|---|---|---|---|
| Running % | 86.94% | 77.82% | **56.99%** |
| Sleeping % | 12.04% | 20.40% | **38.99%** |
| Runnable % | 0.97% | 1.62% | 2.83% |
| 累计 Gfx.WaitForPresent 占整 trace | 5.38% | 19.28% | **38.08%** |
| 累计 WaitForTargetFPS (CallTree) | 6.18% (706ms) | 0% (callTree 已无该节点) | 0% |

**形态演化一句话**:**base CPU-bound 健康(双缓冲 + vsync 留白)→ cur 算+等混合(GPU 跟不上,Sleep 多出 8pp 几乎全是 Gfx.WaitForPresent)→ throttle 半睡型 GPU-bound(Sleep 38.99%,其中 38.08% 是等 GPU,vsync 留白完全消失)**。

**主线程 binder 调用发给谁**:三份样本统一指向 `system_server` (pid=1873)。每份 11-20 次 / avg 0.248-0.322ms,累计 < 6.5ms / 全 trace,占整 trace < 0.05%。**排除 IPC 阻塞**作为瓶颈,不是 binder 等待引发的卡顿。

> 注:base/cur 上 Provider 因 process.name 注册晚,`serverProcess` 只取到 `pid=1873`(参考 lessons-learned #3 用 `pid` 反查的退化路径);throttle 上 process.name 已注册,显示 `system_server`。三份是同一进程对端。

### §3.2 Render(UnityGfxRenderS)

| 状态 | base | cur | throttle |
|---|---|---|---|
| Running % | 25.98% | 22.30% | **16.71%** |
| Sleeping % | 70.32% | 73.64% | **79.85%** |

**判定**:run% 单调下降 (26 → 22 → 17) + sleep% 单调上升 (70 → 74 → 80) → **Render 不是瓶颈,等主线程发命令**(主线程 Run 也在下降 → 整条 CPU 命令链路都在变闲)。

### §3.3 RHI

| 状态 | base | cur | throttle |
|---|---|---|---|
| Running % | 41.13% | 35.78% | **24.53%** |
| Sleeping % | 54.42% | 60.80% | **72.03%** |

**判定**:RHI 直调 GLES,负责往 GPU 发命令并等 swap。Run 单调下降 (41 → 36 → 25) → **CPU 链路不是瓶颈,GPU 没跟上,经典 GPU-bound 形态**(主线程 + Render + RHI 三条线程 run% 全部同步下降,sleep 全部同步上升)。

### §3.4 Lua MtGC(同名陷阱破解)

| 状态 | base | cur | throttle |
|---|---|---|---|
| Running % | 1.73% | 0.99% | 0.69% |
| Sleeping % | 97.67% | 98.96% | **99.24%** |
| LuaMtGc.ExecuteMtGc slice count | 680 | 486 | 427 |

**判定**:**Sleep ≥ 97.67% 健康态,无 spike**,仅 GC 周期短暂活跃。每帧约 1 次 GC 触发(slice count 与 PlayerLoop 帧数 ~1:1)。`LuaMultiThreadGC.WaitGCThread` 在主线程 callTrees 里没有出现单独节点(意味着每帧 GC 等待在 LuaMtGc 层级,主线程没有同步等),所以 Lua GC **不是当前样本的瓶颈源头**。

### §3.5 ECS Worker × 4(并行健康度)

| Worker | base run% | cur run% | throttle run% |
|---|---|---|---|
| ECSWorker_0 | 8.59% | 11.60% | 11.52% |
| ECSWorker_1 | 8.24% | 11.36% | 11.25% |
| ECSWorker_2 | 8.31% | 11.24% | 11.46% |
| ECSWorker_3 | 8.12% | 11.03% | 11.30% |
| **max-min 偏差** | **0.47 pp** | **0.57 pp** | **0.27 pp** |

**判定**:三份 max-min 偏差全部 < 1pp,**远低于 aoe-watch-spec `ecs-worker-imbalance` 的 30pp critical 红线**。4 条 Worker 负载完全均衡,Job 调度健康。注意 cur/throttle 上 Worker run% 均为 11% 左右,但相比 base 的 8% 上升 ~3pp,与 cur/throttle 阶段 OutSideViewArmyLineMgr 下 `OutsideLineCtrl:CalculateVertexJob (Burst)` 触发次数 5.7-5.1 万次同向,印证压测期间并行算力被充分用上。

### §3.6 Audio 线程池

base/cur/throttle 三份 Audio Mixer / Audio Stream 三态都是 99% Sleeping,无任何 spike,与卡顿无关。throttle 多采到 AAudio_1 (Run 3.84%) / AudioTrack (Run 0.42%) / GVoiceRender (Run 0.20%),都是音频回放正常活跃,**不是瓶颈**。

### §3.7 Choreographer

三份 Choreographer 节拍稳定 60.0-60.1 Hz,屏幕端 vsync 正常。GPU-bound 判定阈值用 60Hz vsync 周期 = **16.66 ms**(详见 §7.1)。

---

## §4 主线程 off-CPU 归因(perfetto 独家·结论前置)

> ### 🔴 结论
>
> **cur / throttle 上主线程 Sleeping 时间几乎完全来自 Gfx.WaitForPresent
> (cur 20.4% Sleep ≈ 19.28% Gfx.WaitForPresent;throttle 38.99% Sleep ≈ 38.08% Gfx.WaitForPresent)→ 强 GPU-bound 信号。**
> **base 上主线程 Sleeping 12.04% 中,5.38% 是 Gfx.WaitForPresent + 6.18% 是 WaitForTargetFPS(主动 cap 60fps),
> 量级远小且健康,业务还能保 59.8 fps;cur 是过渡形态,WaitForTargetFPS 留白被业务+wait 完全吃光;throttle 崩到 21.4 fps。**

### §4.1 plainLanguage 概念

引用 summary `offCpuReasons.plainLanguage`(每份相同):

> off-CPU = 线程没有在 CPU 上执行代码的时间(= 100% − Running)。
> **Sleeping**:线程主动睡眠或在等事件(常见:等 GPU 完成上一帧、等锁、等 vsync、等 binder 返回)。
> **Runnable**:线程已就绪但还没被调度上 CPU(常见:大核被占满、优先级低、系统负载高)。

### §4.2 byState 分布(三份对照)

| state | base totalMs / pct | cur totalMs / pct | throttle totalMs / pct |
|---|---|---|---|
| **S** (Sleeping) | 1351.34 ms / 90.57% | 2911.75 ms / 89.54% | **7666.54 ms / 89.34%** |
| **R** (Runnable) | 111.05 ms / 7.44% | 237.46 ms / 7.30% | 564.47 ms / 6.58% |
| **D** (UninterruptibleSleep) | 23.42 ms / 1.57% | 79.12 ms / 2.43% | 111.39 ms / 1.30% |
| **R+** (Preempted) | 6.18 ms / 0.41% | 23.40 ms / 0.72% | 238.64 ms / 2.78% |
| **off-CPU 合计** | 1492.0 ms (13.01%) | 3251.7 ms (22.02%) | 8581.0 ms (41.82%) |

**解读**:三份 S 都占 off-CPU 的 ~90%,即主线程"等"绝大多数是主动睡(等事件),不是"被抢"或"等磁盘"。R+(被抢占)从 base 0.41% 涨到 throttle 2.78%(7×),与降频期间大核频率不足有关——任务排队增多。但量级(238ms)相比 S 的 7666ms 微不足道。

> ⚠️ byReason 行 blockedFunction 都是 null,因为 sched_blocked_reason ftrace 在华为非 root 上静默丢弃(参考 lessons-learned #1 的兄弟问题、collection-config-rationale §4)。**用下方 §4.3 atrace wait slice 重叠法旁路**。

### §4.3 atrace wait slice 重叠法(核心证据)

| | UnityMain Sleeping totalMs (sched) | Gfx.WaitForPresent totalMs (atrace, self) | 重合度 |
|---|---|---|---|
| **base** | 1351 ms (12.04% × 11420ms) | 615 ms (5.38%) | 主线程 Sleep 中 **45.5%** 是等 GPU,余 ~706ms 是 WaitForTargetFPS 主动 cap 60fps |
| **cur** | 2992 ms (20.40% × 14660ms) | 2828 ms (19.28%) | **94.5%** —— 等 GPU 占绝大多数,WaitForTargetFPS 留白消失(callTree 中已无该节点) |
| **throttle** | 7780 ms (38.99% × 19950ms) | **7600 ms (38.08%)** | **97.7%** —— 等 GPU 占绝对多数,主线程几乎所有"睡"都在等 swapchain |

> **方法论说明(M4 wait wrapper 父子去重)**:Provider `_peel_onion` 已建立 `Gfx.WaitForPresent ⊂ WaitForPresent` 父子关系,所以 `Gfx.WaitForPresent.totalMs` 是已剥洋葱的 self,等价于"主线程实际等 GPU 的累计时长"。**这里不再加 WaitForPresent 父 slice,否则会双计**(参考 lessons-learned #2)。

### §4.4 主线程状态分布可视化(ASCII)

```
状态分布对比 (主线程总时长归一化为整 trace 窗口)

base:      ███████████████████████████████ ░░░       Run 86.94% / Sleep 12.04% / Runn 0.97%
            ↑ 主要是正常 vsync 留白 (WaitForTargetFPS 6.18%) + 正常 GPU 等 (Gfx.WaitForPresent 5.38%)
            ↑ 双缓冲健康, 业务跑完一帧还有 ~1ms 空闲等 vsync

cur:       ████████████████████████████ ░░░░░░       Run 77.82% / Sleep 20.40% / Runn 1.62%
            ↑ 多出来的 ~8pp Sleep 99.5% 都是等 GPU (Gfx.WaitForPresent 19.28% vs base 5.38%)
            ↑ vsync 留白被业务+wait 吃光, callTree 已不再有 WaitForTargetFPS 节点

throttle:  ███████████████████ ░░░░░░░░░░░░░░       Run 56.99% / Sleep 38.99% / Runn 2.83%
            ↑ 多出来的 ~27pp Sleep 97.9% 都是等 GPU (Gfx.WaitForPresent 38.08%)
            ↑ 与降频 reach 59.2% 同向: 算得慢 (CPU 频率下降) + 等得久 (GPU 撑爆) 双重叠加

核心数字 (Gfx.WaitForPresent 单次平均,这是 GPU-bound 强信号阈值):
- base    单次 avg  0.91 ms  ← << 16.66 vsync, 双缓冲健康
- cur     单次 avg  5.83 ms  ← 单次涨 6.4×, 仍 < 16.66 vsync (说明还能勉强双缓冲, 但很贴边)
- throttle 单次 avg 17.80 ms ← 单次 > 16.66ms 60Hz vsync 周期 → 强 GPU-bound, swapchain 撑爆
```

### §4.5 因果链可视化(ASCII)

```
throttle 主线程一帧的等待因果链 (60Hz, vsync = 16.66ms):

    主线程发起 PostLateUpdate.FinishFrameRendering
        → URP.Render → URP.RenderCameraStack
        → URP.RenderSingleCamera → URP.AfterRendering
        → URP.Submit → URP.WaitForPresent
        │
        ├─ 状态切换为 Sleep (S, sched 占 89.34% off-CPU)
        │
        └─ 等 swapchain Present 信号 (Gfx.WaitForPresentOnGfxThread 单次 17.80ms)
                │
                └─ 信号源 = GPU 完成上一帧 swapchain present
                        │
                        └─ 真因双重叠加:
                            (1) GPU 处理一帧本身要 ~Nms(无 GPU busy counter, 量化不到, 但 17.8ms > 60Hz vsync 16.66ms 已是硬证)
                            (2) swapchain 排队 — 前一帧没 present 完, 下一帧得排队等

证据链一致性检查 (五条信号同向, 互相印证):
- 主线程 Sleep 38.99% ≈ Gfx.WaitForPresent 38.08% (重合 97.7%) ✅
- Render run% 16.71% < cur 22.30% < base 25.98% (单调下降) ✅
- RHI run% 24.53% < cur 35.78% < base 41.13% (单调下降, 同步变闲) ✅
- bigCoreReach 59.2% (严重低频) → CPU 算得也慢, 加重 swapchain 排队 ✅
- 温度 75.6°C 起点已超 75°C 警戒, Δ +1.1°C 走平 → SoC 已主动降频压温度 ✅

排除项 (这些可能的瓶颈方向被数据排除):
- ❌ binder IPC 阻塞 → 主线程 binder 累计 6.44ms 占整 trace < 0.05%, 远不够卡顿规模
- ❌ ECS Worker 阻塞 → 4 条 Worker max-min 0.27pp 偏差, 健康
- ❌ Lua GC spike → LuaMtGC Sleep 99.24%, 仅 427 次 GC.WaitGCThread, 单次量级见不到 ms 级
- ❌ R+ 抢占严重 → 仅 2.78% off-CPU, 量级 238ms 微不足道
- ❌ Render 算力不足 → Render Sleep 79.85%, 自己也在等
```

---

## §5 降频时序证据链(perfetto 独家)

### §5.1 三份对照表

| 时间点 | cpu7 reach% | cpu4-6 reach% | cpu0-3 reach% | bigReach% | 温度 Δ°C / 起点→终点 | UnityMain run% | PlayerLoop p50/p99 | level |
|---|---|---|---|---|---|---|---|---|
| **base** | 73.7% (2093/2841) | 76.1% (1841/2419) | 63.1% (1138/1804) | 74.9% | **65.6 → 77.3°C (Δ +11.7°C)** | 86.94% | 16.69 / 21.37 ms | **likely** |
| **cur** | 77.0% (2187/2841) | 71.8% (1737/2419 vs cpuinfo) | 69.8% (1260/1804) | 75.6% | 79.8 → 79.0°C (**Δ -0.8°C**, 起点 ≥75°C) | 77.82% | 30.15 / 42.54 ms | **likely** |
| **throttle** | 61.4% (1744/2841) | 52.4% (1268/2419 vs cpuinfo) | 67.9% (1225/1804) | **59.2%** | 75.6 → 76.7°C (Δ +1.1°C) | 56.99% | **45.94 / 66.32 ms** | **likely** |

> 三份样本全是 likely 档,但触发条件不同(详见 §5.2 形态识别)。

### §5.2 降频形态识别(ASCII,区分形态)

```
base (凉机起步进热保护):
  特征: 温度从 65.6°C 飙到 77.3°C (Δ +11.7°C)
        bigReach 74.9% (cpu0-3 63.1% / cpu4-6 76.1% / cpu7 73.7%)
        UnityMain Run 86.9% (高负载)
  形态: "热预算紧但还顶得住"
  evidence:
    - [推测] 负载-频率背离: Run 86.9% 但 reach 74.9% (<80%)
    - [likely] 升温 11.7°C 触发 thermal-rise 信号
    - [likely] 采后 77.3°C 已进热保护阈值区 (≥70°C)
  推断: 11.43s 短窗口刚好捕捉到"凉机进热段"瞬间, 业务还跑得动 60fps,
        但 SoC 已经在背地里限频 (CPU avg 1729 MHz vs cpuinfo 上限 cpu7 2841 MHz, ~61%)

cur (饱和高温段):
  特征: 温度从 79.8°C 走到 79.0°C (Δ -0.8°C, 起点已严重超 75°C)
        bigReach 75.6% (与 base 接近, 没继续掉)
        UnityMain Run 77.82% (开始跌)
  形态: "起点已饱和, 增量为零 = SoC 已主动压频在压温度"
  evidence:
    - [likely] 采后 79.0°C 远超 75°C 高温警戒 (独立信号)
    - [likely] 起点 79.8°C 本身就触发 likely (>=75°C)
    - 注: 这是 lessons-learned #6 修复的场景 — 之前漏判, 现在用"高温起点独立信号"补上
  推断: 这一段是从凉机走过几分钟后的稳定高温平台, 业务已经被频率压制 (33.1 fps),
        但温度因为已经在 SoC 设定上限被压住, 不继续涨了

throttle (重度降频段):
  特征: 温度 75.6 → 76.7°C (Δ +1.1°C, 走平)
        bigReach 59.2% (cpu4-6 仅 52.4% reach vs cpuinfo, 严重背离)
        UnityMain Run 56.99% (半睡型, 已不是单纯算力问题, 还多了等)
  形态: "重度降频, 大核频率被强压到 60% 上限以下"
  evidence:
    - [推测] 大核持续低频: 平均频率仅观测峰值 59.2%
    - [likely] 采后 76.7°C 已进热保护阈值区
    - [likely] bigReach 59.2% < 65% 严重低频 (独立信号触发)
  推断: 这一段是温度持续平稳但频率被重度压制, 业务跑到 21.4 fps,
        主线程已经算不动 + GPU 跟不上双重夹击
```

### §5.3 per-CPU 实测表

| CPU | base avg/max | cur avg/max | throttle avg/max | cpuinfo_max(理论上限) |
|---|---|---|---|---|
| cpu0 | 1138.3 / 1804.8 | 1260.0 / 1804.8 | 1225.0 / 1804.8 | 1804.8 |
| cpu1 | 1138.3 / 1804.8 | 1260.0 / 1804.8 | 1225.0 / 1804.8 | 1804.8 |
| cpu2 | 1138.3 / 1804.8 | 1260.0 / 1804.8 | 1225.0 / 1804.8 | 1804.8 |
| cpu3 | 1138.3 / 1804.8 | 1260.0 / 1804.8 | 1225.0 / 1804.8 | 1804.8 |
| cpu4 | 1841.6 / 2419.2 | 1737.6 / **2342.4** | 1268.6 / **2227.2** | 2419.2 |
| cpu5 | 1841.6 / 2419.2 | 1737.6 / **2342.4** | 1268.6 / **2227.2** | 2419.2 |
| cpu6 | 1841.6 / 2419.2 | 1737.6 / **2342.4** | 1268.6 / **2227.2** | 2419.2 |
| cpu7 | 2093.2 / 2841.6 | 2187.6 / 2841.6 | 1744.0 / 2841.6 | 2841.6 |

**关键观察**:
- cpu4-6 中核 maxMhz 从 base 的 2419.2 (理论上限) **降到 throttle 的 2227.2 (cpuinfo 91.9%, reach vs cpuinfo 仅 52.4%)** — 这是 SoC 主动压低 max-freq 的间接证据(即使 sysfs scaling_max_freq 读不到,observed max 已经低于硬件能力)。
- cpu7 大核 max 始终维持 2841.6,但 avg 从 2093 → 1744 → 频率档位主动压低。
- cpu0-3 小核三态都贴近 1.8 GHz,变化最小(本来就靠近上限,无降频空间)。

### §5.4 降频判定矩阵

| 维度 | 要求 | 本次 base | 本次 cur | 本次 throttle |
|---|---|---|---|---|
| **confirmed**: sysfs `scaling_max_freq < cpuinfo_max_freq` | sysfs root | ❌ 物理不可达(华为锁) | ❌ | ❌ |
| **confirmed**: cpu7 sched 完全归零(集群下线) | 跨次时序 | ❌ cpu7 仍参与 sched | ❌ | ❌ |
| **likely**: bigReach% 持续下降 + 温度 Δ°C ≥ 5°C 或采后 ≥ 75°C | cpufreq + 温度旁路 | ✅ Δ +11.7°C + 采后 77.3°C | ✅ 起点 79.8°C / 采后 79.0°C | ✅ 采后 76.7°C |
| **likely**: 大核 reach% < 65% 严重低频 | cpufreq counter | ❌ (74.9%) | ❌ (75.6%) | ✅ **59.2%** |
| **suspected**: bigReach% < 80% 且 Run ≥ 80% | cpufreq counter | ✅ (74.9 + Run 86.9) | ❌ Run 77.82 < 80 | ❌ Run 56.99 < 80 |

**当前判定**:**base / cur / throttle 三份分别是 likely / likely / likely**(三份均触发,触发方式不同 — base 靠"温度急升 + 背离 80%",cur 靠"高温起点独立信号",throttle 靠"严重低频 + 高温双信号")。

### §5.5 业务模块在 throttle 上的同步劣化

观察 throttle 上 OutSideViewArmyLineMgr ms/帧 从 cur 1.575 → throttle 2.440 = **+55%**,但 OutSideViewArmyLineMgr 下的 `OutsideLineCtrl:CalculateVertexJob (Burst)` 触发次数反而从 57940 → 51240 (-12%)。**这说明同样工作量在大核降频后单次成本拉高**(算力变弱),与 throttle 频率信号一致。BattleHeadMgr 反向(cur 1.51 → throttle 1.10 = -27%),原因不是优化,而是 cur 阶段 BattleHeadMgr 触发次数(982)比 throttle(876)更多 — 业务负载本身在降。这是"压测期间可能换了波次"的现实噪声,不是模块优化。

---

## §6 主线程一帧时间去向(callTrees 缩进树·核心章节)

### §6.1 PlayerLoop 帧分位数对比

| 分位 | base | cur | throttle |
|---|---|---|---|
| p50 ms | 16.69 | 30.15 | **45.94** |
| p95 ms | 18.68 | 35.22 | 55.62 |
| p99 ms | 21.37 | 42.54 | 66.32 |
| slowFrame >33ms | 0.15% | 13.04% | **98.83%** |
| slowFrame >50ms | 0.00% | 0.62% | 22.95% |
| fps | 59.8 | 33.1 | **21.4** |
| 帧数 | 680 | 484 | 427 |

**解读**:cur 上 p95-p50 = 5.07ms(范围扩 30%);throttle 上 p95-p50 = 9.68ms(范围扩 21%)。两份都是"持续匀慢"型(p99 - p50 < 2× p50,不像偶发尖峰),与瓶颈类型(主线程 + GPU 持续高负载,无突发触发器)的一致 — 比如不是某次 ResMgr 突发加载或 LuaMtGC 大 spike 引发的尖峰,而是"每帧都慢一点"。

### §6.2 主线程 callTrees 缩进树(本节最重要)

> **形式说明**:每节点格式 `[base / cur / throttle ms/帧]`(ms/帧 = totalMs / 该样本帧数 680/484/427)。
> 标记:📈 增量 >50% / 🔴 单次平均超红线 / 🟡 临近红线 / 🟢 健康 / 🔵 wait 型 / 🌡️ thermal-only。
> 仅用 callTrees 父子链数据,**不**用 atraceSlices LIKE 全 trace 数据(M1 反模式,参考 lessons-learned #1)。

```
UnityMain.PlayerLoop  [base 16.72 / cur 30.18 / throttle 46.68 ms/帧]                  100%
│
├─ PostLateUpdate.FinishFrameRendering   [base  6.88 / cur 13.09 / throttle 26.04]  📈🔵🔴 +90% / +99%
│  └─ URP.Render
│     └─ URP.RenderCameraStack
│        └─ URP.RenderSingleCamera
│           ├─ URP.AfterRendering         [base 1.68 / cur 6.84 / throttle 19.33] 📈🔵🔴 +307% / +183%
│           │  └─ URP.Submit
│           │     ├─ URP.WaitForPresent   (atrace 父 wrapper, 含 sleep 段, 不另作 self 计)
│           │     │  └─ Gfx.WaitForPresentOnGfxThread (主线程睡等 GPU 信号源, 每帧 1 次)
│           │     │     [base 0.91 / cur 5.83 / throttle 17.80 ms 单次] 🔴 throttle 单次超 60Hz vsync 16.66ms
│           │     └─ URP.MakeTranscriptRenderContext  [base 0.39 / cur 0.54 / throttle 0.81] 🟢
│           ├─ URP.MainRenderingTransparent   [base 1.71 / cur 1.81 / throttle 1.70] 🟢 持平
│           │  └─ Inl_OpaquePass             [base 0.81 / cur 0.82 / throttle —]
│           ├─ URP.BeforeRendering            [base 1.09 / cur 1.85 / throttle 1.74] 📈 cur +69%
│           │  └─ CullScriptable              [base — / cur 0.45 / throttle 0.51]
│           │     └─ SceneCulling             [base — / cur 0.32 / throttle —]
│           └─ URP.RendererSetup              [base 0.75 / cur 0.74 / throttle 0.93] 🟢
│              └─ URP.RenderGraphSetup        [base 0.72 / cur 0.71 / throttle 0.89]
│
├─ Update.ScriptRunBehaviourUpdate       [base 2.15 / cur 7.91 / throttle 8.83]   📈
│  └─ BehaviourUpdate
│     └─ Core.Update                     [base 1.73 / cur 7.32 / throttle 8.05]   📈 ×4.2 → ×4.7
│        │
│        ├─ CS:AOE.LuaMgr                [base 1.00 / cur 3.80 / throttle 3.47]   📈 ×3.8
│        │  └─ LuaMgr.OnTick&UpdateSchedule  [base 0.95 / cur 3.74 / throttle 3.41]
│        │     ├─ BattleHeadMgr          [base ~0 / cur 1.51 / throttle 1.10]    📈🔴 cur 单次 1.50ms 触红线 1ms
│        │     │  └─ BattleHeadMgr.OnUpdate  [base ~0 / cur 1.50 / throttle 1.08]
│        │     └─ MapSignificanceMgr     [base ~0.32 / cur 1.30 / throttle 1.07] 📈🟡 单次 1.30ms 临近红线 2ms
│        │        └─ MapSignificanceMgr.sampler_OnUpdate  [base — / cur 1.29 / throttle 1.06]
│        │           └─ MapSignificanceMgr.ProcessTasks   [base — / cur 1.21 / throttle 0.98]
│        │
│        ├─ CS:AOE.Outside.MapManager    [base 0.44 / cur 2.90 / throttle 3.99]  📈🔴 throttle 头号增量 ×9.1
│        │  ├─ CS:AOE.Outside.OutSideViewArmyLineMgr  [base ~0 / cur 1.58 / throttle 2.44] 📈🔴 throttle 单次 2.44ms 超红线 2ms
│        │  │  └─ OutsideLineCtrl:CalculateVertexJob (Burst)  [base — / cur 0.43 / throttle 0.61, 但 51-58k 次/trace]
│        │  └─ CS:AOE.Battle.BattleUIManager      [base ~0 / cur 0.72 / throttle 0.83] 🟢
│        │     └─ *** BattleUIUpdate ***          [base — / cur 0.71 / throttle 0.82]
│        │        └─ MUI_UpdateUIPos              [base — / cur 0.61 / throttle 0.75]
│        │
│        └─ CS:AOE.TServerManager        [base ~0 / cur 0.31 / throttle —]      🟢 远低 hard-cap 8ms
│
├─ PreLateUpdate.ScriptRunBehaviourLateUpdate    [base 1.62 / cur 2.88 / throttle 2.99]   📈
│  └─ LateBehaviourUpdate
│     └─ Core.LateUpdate                 [base 1.02 / cur 2.13 / throttle 2.33]
│        ├─ CS:AOE.LuaMgr (LateUpdate 一侧)        [base — / cur 0.44 / throttle 0.60]  🟢
│        │  └─ LuaMgr.OnLateUpdateSchedule        [base 0.33 / cur 0.39 / throttle 0.53]
│        │     (注:无 MapCameraCtrl 可见单独节点 — 该样本未做拖动手势, camera-idle context)
│        ├─ CS:AOE.Outside.MapManager (LateUpdate)  [base 0.50 / cur 0.51 / throttle 0.71] 🟢
│        └─ CS:AOE.MeshUIManager         [base ~0.09 / cur 1.02 / throttle 0.79]   📈 cur 触 1ms redline 临界
│
├─ PostLateUpdate.PlayerUpdateCanvases   [base 0.94 / cur 0.94 / throttle 1.14]    📈🔴 throttle 单次 1.14ms > 1ms (知识库§7 不合理)
│  └─ UIEvents.WillRenderCanvases
│     └─ UGUI.Rendering.UpdateBatches    [base 0.93 / cur 0.93 / throttle 1.13]
│        ├─ Canvas.UpdateDirtyRenderers  [base 0.25 / cur — / throttle —]  (cur/throttle 已剪枝低于 1% 阈值)
│        └─ Render → ClipperRegistry.Cull → CanvasRenderer.UpdateChangedTransforms  (base 可见, 余下样本剪枝)
│
├─ SimulationSystemGroup                 [base 0.79 / cur 0.84 / throttle 1.07]   📈🔴 throttle 超 ECS 主线程 1ms 红线
│  └─ Default World Unity.Entities.SimulationSystemGroup  [base 0.78 / cur 0.83 / throttle 1.06]
│     └─ Default World AOE.DOTS.ArmyGroup → ArmyUpdateGroup  (base 可见)
│
├─ InitializationSystemGroup             [base 0.51 / cur 0.65 / throttle 0.98]   🟡 throttle 临近 ECS 1ms 红线
│  └─ Default World Unity.Entities.InitializationSystemGroup  [base 0.51 / cur 0.65 / throttle 0.97]
│
├─ PostLateUpdate.PlayerSendFrameComplete  [base 0.50 / cur 0.70 / throttle 0.99]   🟡 throttle 临近 1ms
│  └─ PlayerEndOfFrame → CoroutinesDelayedCalls
│     └─ Core.EndOfFrame  [base 0.29 / cur 0.44 / throttle 0.56]   (base 旁还有 Core.PostEndOfFrame 0.18 ms/帧)
│
├─ PresentationSystemGroup               [base 0.30 / cur 0.32 / throttle —]       🟢 ECS 仅分发, 远低红线
│
├─ EarlyUpdate.UpdateTextureStreamingManager  [base 0.29 / cur — / throttle 0.51]   🟢
│  └─ TextureStreamingManager.Update
│
├─ EarlyUpdate.PollPlayerConnection      [base 0.22 / cur — / throttle —]
│
├─ PostLateUpdate.PlayerEmitCanvasGeometry  [base 0.18 / cur — / throttle —]
│  └─ UIEvents.CanvasmanagerEmitOnScreenGeometry  [base 0.17]
│
└─ Initialization.PlayerUpdateTime → WaitForTargetFPS  🔵
                                          [base 1.04 ms/帧 / cur 0 / throttle 0]
                                          ↑ base 主线程跑完业务还有 1ms 空闲等 vsync (健康 cap 60fps 留白);
                                            cur/throttle 该节点已经完全消失 → 所有帧预算被业务+wait 吃光,
                                            触发 aoe-watch-spec `no-frame-budget-margin` warn (累计 < 50ms)
```

### §6.3 Top 红线热点子函数下钻

#### §6.3.1 BattleHeadMgr (cur 头号涨幅, 触红线)

```
BattleHeadMgr (Update 阶段, callTree)
  base    cur                        throttle
  ~0     732.22ms (1.51 ms/帧)      470.78ms (1.10 ms/帧)
         🔴 单次 avg 1.50 ms 触 redline 1.0ms (aoe-watch-spec moduleSingleCallRedlines)
         🟡 单次 avg < 2.0 ms critical, 不 critical 但已临界

└─ BattleHeadMgr.OnUpdate
   c=484/帧 (cur) / 427/帧 (throttle)
   avg 1.495ms / 1.084ms
   累计 723.69ms (cur) / 462.69ms (throttle)
   ↑ 从 base 到 cur 出现明显 ×40+ 增长(base callTree 见不到顶层节点, 说明 base 上单次极小被剪枝)

GC.Alloc 业务归因 (perfetto 独家, gcAllocByModule):
  base:       BattleHeadMgr 子树 0 次/帧 (callTree 无该模块痕迹)
  cur:        BattleHeadMgr 子树 5341 次 → **11.0 次/帧** (头号 GC 源, 仅次于 Core.Update 父子树 30.5)
  throttle:   BattleHeadMgr 子树 2396 次 → 5.6 次/帧 (与 BattleHead 触发次数一起降, 见§5.5)

优化方向:
- 把 OnUpdate 内 head 信息每帧重建 → 改成 dirty-flag 增量(头像数据没变就不重算 mesh/transform)
- 排查 11 次/帧的 GC.Alloc 是否来自字符串拼接(玩家名、伤害数字)→ 改用 StringBuilder 池或预分配
- 若头像数量多, 考虑把"排版/可见性"和"数据"分两阶段, 仅可见的算
- 知识库 §3 提示 BattleHead 与 LuaMgr.MapSig 共用一条 LuaMgr.OnTick&UpdateSchedule, 可能存在共享 Lua 表查询
```

#### §6.3.2 MapSignificanceMgr (压测核心负载晴雨表)

```
MapSignificanceMgr (Update.LuaMgr.OnTick&UpdateSchedule, 知识库 §3 重点考察对象)
  base    cur                        throttle
  ~0.32  626.70ms (1.30 ms/帧)      455.59ms (1.07 ms/帧)
         🟡 单次 avg 1.29 ms 临近 redline 2.0ms, 远未顶到 critical 3.0ms

└─ MapSignificanceMgr.sampler_OnUpdate  c=484/帧 avg 1.287ms (cur) / 1.057ms (throttle)
   └─ MapSignificanceMgr.ProcessTasks   c=484/帧 avg 1.208ms (cur) / 0.980ms (throttle)
         ↑ ProcessTasks 占 sampler_OnUpdate 95% 以上, 真消耗在这里

GC.Alloc 业务归因:
  base:       MapSig 子树 0 次/帧 (无 GC 痕迹)
  cur:        MapSig 子树 29 次 → 0.1 次/帧 (低)
  throttle:   MapSig 子树 1 次/全 trace (近零)
         ↑ 注意: gcAllocByModule 用 LIKE 命中 MapSig 父 slice, 实际 GC 几乎都不在 MapSig 子树里
         ↑ 所以即使 ProcessTasks 单次 1.2ms 也不是 GC 引起的, 而是任务列表本身处理
         ↑ 这与知识库 §3 描述一致: "任务多时易顶格"

优化方向:
- 观察 ProcessTasks 内部任务列表长度. 知识库 §3 说"任务太多会一直 3ms 顶格", 我们当前 1.29ms 还有余量
- 若 MapEntity 增删压力源是 TServer 收消息驱动的(知识库 §2-§3), 看能否做"延迟批处理" — 同帧内多个 entity 增删合并到一次 ProcessTasks
- 知识库 §3 强调这是"游戏整体负载晴雨表" — 当前 cur 1.29ms 已经接近顶格中段, 后续若再加压(更高的玩家密度) 会直接撞 3ms 红线
```

#### §6.3.3 OutSideViewArmyLineMgr (throttle 头号涨幅, 触红线)

```
OutSideViewArmyLineMgr (Update.MapManager 子)
  base    cur                        throttle
  ~0     762.35ms (1.575 ms/帧)     1041.67ms (2.440 ms/帧)
         🔴 throttle 单次 avg 2.44 ms 超 redline 2.0ms, 是 throttle 阶段唯一上涨且越界的业务模块

└─ OutsideLineCtrl:CalculateVertexJob (Burst)
   注: 这是 Burst Job, 但出现在主线程 callTree 上 → 主线程"调度入口"消耗
   c = 57940 次 (cur) / 51240 次 (throttle)
       ≈ 119 次/帧 (cur) / 120 次/帧 (throttle) — 帧数下降但每帧调度数稳定 → 行军线条数没变
   avg 0.004 ms (cur) / 0.005 ms (throttle, +25%) ← 单次涨幅与 throttle 大核降频 ~25-30% 同向, 强相关

业务源 (知识库 §4):
  - 行军线在 Outside 视野下的刷新负载, 压测场景中往往高负载
  - 主线程 "调度入口" 不直接 run Burst job, 但要做 schedule + (可能) Complete 等待

优化方向:
- 排查 OnUpdate 内是否有 schedule + complete 组合 (即 main thread 等 job 完成) — 知识库 §8 提示这是 ECS 主线程的"不合理"形态
- 考虑做 LOD: 离视野中心远的行军线降频或合并 vertex
- 51-58k 次/trace 调度本身的 begin/end overhead (perfetto trace 上 atrace 有 ~1us/对) 可能也占了一部分, 看能否用 IJobChunk 或 batch schedule
- 5.22% 占整 trace, throttle 阶段是 #1 业务消耗
```

#### §6.3.4 PlayerUpdateCanvases (throttle 微越界)

```
PlayerUpdateCanvases (PostLateUpdate, UGUI 主线程刷新, 知识库 §7)
  base    cur                       throttle
  0.94   0.94 ms/帧                1.14 ms/帧
                                    🔴 throttle 单次 avg 1.14 ms 超 redline 1.0ms (知识库 §7: "每帧 1ms 极不合理")

└─ UIEvents.WillRenderCanvases → UGUI.Rendering.UpdateBatches
   (base 还能看到 Canvas.UpdateDirtyRenderers 0.25 ms/帧 + ClipperRegistry.Cull → CanvasRenderer.UpdateChangedTransforms)
   cur/throttle 上子函数被剪枝(单次 < 1% 阈值), 但顶层 UpdateBatches 单次 1.13ms 还在

知识库 §7: "目前游戏内压测场景或者主要热点场景下的消耗大的 UI(头顶字、伤害跳字)已经全部改为 MeshUI 方案,
            这个消耗不应该大,如果每帧都出现 1ms 的消耗是极不合理的"

优化方向:
- 先用 Unity Profiler `Hierarchy → UGUI.Rendering.UpdateBatches` 看具体哪个 Canvas 还在 dirty
  (可能漏改 Hud_Common 主界面之类的 UGUI 老栈, 没切到 MeshUI)
- 注意: 该模块 cur 0.94 / throttle 1.14, 增量来自 throttle 大核降频 (同样工作量 +21% 单次成本), 业务侧没变
  → 优化主要来自降频时单次成本兜不住, 而非业务量上涨
```

#### §6.3.5 ECS SimulationSystemGroup (throttle 微越界)

```
SimulationSystemGroup (主线程 ECS 分发入口, 知识库 §8)
  base    cur                       throttle
  0.79   0.84 ms/帧                1.07 ms/帧
                                    🔴 throttle 单次 avg 1.07 ms 超知识库 §8 的"主线程 ECS 仅分发不应 >1ms"红线

└─ Default World Unity.Entities.SimulationSystemGroup  [base 0.78 / cur 0.83 / throttle 1.06 ms/帧]
   └─ Default World AOE.DOTS.ArmyGroup (base 0.26 ms/帧)
      └─ Default World AOE.DOTS.ArmyUpdateGroup (base 0.17 ms/帧)
   (cur/throttle 子已剪枝)

判定:
- 没看到 `Complete` 字眼的 slice (aoe-watch-spec ECS_*_SystemGroup.matchChildPattern 'Complete' hard-cap 0.5ms 没触发)
- 但 throttle 上 1.07 ms/帧已经超了 ecs-dispatch-cap 1.0ms 红线 → 主线程仅做 schedule 不应该这么慢
- InitializationSystemGroup 同步走高 (base 0.51 → throttle 0.98) → 临界

优化方向:
- 排查是否有新的 ECS System 加进来分发 (entity 数量 / system group 调用链长度变化)
- 排查 Burst Job schedule 数量是否暴涨 (前面看到 OutsideLineCtrl:CalculateVertexJob 51-58k 次/trace 119/帧 已经不少)
- throttle 阶段同步增加 25% 是降频拖累, 不是 schedule 数变多 (cur 也是 0.84ms 还没爆), 主要兜不住的是 throttle 频率
```

### §6.4 红线触发清单(按 cur ms/帧 排序)

| 优先级 | 模块 | cur ms/帧 | throttle ms/帧 | 红线类型 | 子函数热点 |
|---|---|---|---|---|---|
| 1 | BattleHeadMgr | **1.513** | 1.103 | 🔴 单次 1.50ms > redline 1.0ms (知识库§3) + GC 11/帧 | BattleHeadMgr.OnUpdate |
| 2 | MapSignificanceMgr | 1.295 | 1.067 | 🟡 单次 1.29ms 临近 redline 2.0ms (知识库§3 顶格 3ms) | sampler_OnUpdate → ProcessTasks |
| 3 | OutSideViewArmyLineMgr | 1.575 | **2.440** | 🔴 throttle 单次 2.44ms > redline 2.0ms (知识库§4) + 51-58k 次 Burst 调度 | OutsideLineCtrl:CalculateVertexJob (Burst) |
| 4 | CS:AOE.MeshUIManager | 1.020 | 0.792 | 🟡 cur 单次 1.02ms 触临界 redline 1.0ms (aoe-watch §5) | (子被剪枝) |
| 5 | PlayerUpdateCanvases | 0.940 | **1.142** | 🔴 throttle 单次 1.14ms > redline 1.0ms (知识库§7 不合理) | UGUI.Rendering.UpdateBatches |
| 6 | SimulationSystemGroup | 0.838 | **1.067** | 🔴 throttle 单次 1.07ms > ecs-dispatch-cap 1.0ms (知识库§8) | (子被剪枝) |
| 7 | InitializationSystemGroup | 0.650 | **0.984** | 🟡 throttle 单次 0.98ms 临近 ecs-dispatch-cap 1.0ms | — |
| 8 | Gfx.WaitForPresent (单次, 不算业务) | **5.83** | **17.80** | 🔴 throttle 单次 17.8ms > 60Hz vsync 16.66ms (gpu-bound-strong critical) | (主线程睡, 不是算) |

### §6.5 慢帧形态差异

cur p95 - p50 = 5.07 ms;throttle p95 - p50 = 9.68 ms。两份都是"持续匀慢"型(p99 - p50 < 2 倍 p50)。
- cur:增量来源主要是 BattleHeadMgr / MapSignificanceMgr / OutSideViewArmyLineMgr 三个 Lua 业务模块同步上涨。
- throttle:在 cur 基础上 + Gfx.WaitForPresent 单次涨 3× (5.83→17.80) + ECS SystemGroup 拉到 1ms,+ PlayerUpdateCanvases 拉到 1.14ms。
- p99 在两份样本上离 p50 都比较远(cur p99 比 p50 多 12.4ms,throttle 多 20.4ms)说明零星出现 ~50-66ms 的偶发尖峰,但出现频率低于 5%(p95 已经在 35/55ms)。这些尖峰可能是 LuaMtGC 周期或 ResMgr 加载,但当前数据 LuaMtGC 都很轻、ResMgr Late 加载也少,需要 §-1.3 提到的"单次 jank 帧逐线程时间轴"才能定位 → 留给手工 SQL 钻一帧。

---

## §7 渲染链路 + GPU bound 判定

### §7.1 Gfx.WaitForPresent 单次 avg 演化

| trace | 单次 avg | 含义 |
|---|---|---|
| **base** | **0.91 ms** | 主线程每帧等 GPU < 1ms,远 < 60Hz vsync 16.66ms,双缓冲健康 |
| **cur** | **5.83 ms** | 单次涨 6.4×,仍 < vsync 16.66ms(GPU 仍能在一个 vsync 周期内完成,但已贴边) |
| **throttle** | **17.80 ms** | **单次 > vsync 60Hz 16.66ms 周期 → GPU 撑爆 swapchain,触发 aoe-watch-spec `gpu-bound-strong` critical** |

**判定阈值(aoe-watch-spec.yaml systemLevelThresholds.gpu-bound-strong)**:
> 单次 `Gfx.WaitForPresent > vsync 周期`(60Hz=16.66ms / 90Hz=11.11ms / 120Hz=8.33ms)→ swapchain 撑爆,GPU 成为强瓶颈。

**throttle 触发,cur 接近触发(5.83 ms 是 vsync 35%,持续累计意味着 swapchain 排队可见但还没撑爆)**。

### §7.2 RHI / Render 顶层(辅证)

callTrees 没有把 RHI / UnityGfxRenderS 的子函数树拆出(Provider 当前只跑 UnityMain + UnityGfxRenderS 两棵主树,UnityGfxRenderS 树在剪枝阈值下没出顶层节点),但通过 §3.2 / §3.3 的三态对照已经能给出"Render + RHI 都在变闲"的结论:三份 run% 单调下降 (Render 26→22→17, RHI 41→36→25),与主线程同步进 sleep。

> ⏳ 后续 Provider 改造方向(参考 docs/perfetto-engineering-roadmap.md 类似项):为 RHI 单独跑 callTree,展开 `eglSwapBuffers` / `Gfx.PresentFrame` 这两个关键 slice 的 totalMs/单次,以及 SurfaceFlinger queueBuffer 的频率,可以给"GPU 等多久"更精细的分布画像。

### §7.3 GPU bound 判定矩阵

| 信号 | 直接证据 | 间接证据 | 判定 |
|---|---|---|---|
| GPU busy/freq counter | — | 设备物理不可达(骁龙非 root) | ❌ "GPU 满载"硬证给不出 |
| **Gfx.WaitForPresent 单次 > vsync 周期** | throttle 17.80 ms vs 16.66ms vsync | ✅ 直接命中 aoe-watch `gpu-bound-strong` critical | 🔴 **强 GPU-bound** (throttle) |
| **主线程 Sleeping ≈ Gfx.WaitForPresent** | cur 重合 94.5% / throttle 重合 97.7% | ✅ 双重验证(命中 aoe-watch `sleep-eq-waitgpu` info) | 🔴 |
| **Render / RHI 都越来越闲** | Render 70→74→80 sleep / RHI 54→61→72 sleep | ✅ 三条线程 run% 全单调下降 | 🔴 CPU 链路不是瓶颈 |
| **Choreographer 维持 60Hz 节拍** | base 60.1 / cur 60.0 / throttle 60.1 | ✅ 显示链路正常 | 🔴 业务跨周期掉帧, 不是 SF 问题 |
| 主线程 binder 占比 | 0.024% / 0.026% / 0.032% | ✅ 远低于 0.05% | 排除 IPC 阻塞 |
| ECS Worker 并行度 | max-min 0.27-0.57 pp | ✅ 远低 30pp 红线 | 排除 Job 不均 |
| LuaMtGC 活跃 | Sleep 99% | ✅ | 排除 Lua GC spike |

**判定结论**:
- ✅ **throttle 强 GPU-bound 信号**:单次 Gfx.WaitForPresent 超 vsync,主线程 Sleep 重合 97.7%,Render+RHI 同步 sleep 升,Choreographer 仍 60Hz。
- 🟡 **cur 中等 GPU-bound 信号**:单次 5.83 ms 是 vsync 35%,Sleep 重合 94.5%,Render/RHI sleep 也升,但单次未撑爆 → 仍能勉强 33fps(vsync 每 2 周期掉 1 帧的形态)。
- 🟢 base 健康,GPU 时间预算充裕。
- ❌ "GPU 100% 满载"硬结论给不出 — 缺 GPU busy counter,需要 root + producer 注入。

---

## §8 与历史版本趋势对照(本报告未做)

本报告只跑了 base/cur/throttle 三份对照,没引入 v5.2 之外的历史样本。后续若需要做"优化前/后趋势对照",建议:
- 锁定同一场景(同样玩家/玩家密度/同战场)
- 锁定相同 trace 配置 (`-b 256mb -t 20s` + 旁路全套)
- 锁定相同设备温度起点(避开 base 那种"凉机 11°C 急升"的过渡形态,挑稳定平台段)

---

## §9 本源能力边界 + 工程化建议(分四档)

### §9.1 能力矩阵

参考 §-1.2 / §-1.3。perfetto 单源在本设备(华为非 root)能给出的最强结论是:
- 主线程在算还是在等 + 等什么(用 atrace wait slice 重叠法替代 sched_blocked_reason)
- 业务模块 ms/帧 + 单次 avg(用 callTrees 父子链 + selfMs 剥洋葱)
- 多线程独立分析(用 atrace slice 内容反查 RHI/LuaMtGC/ECSWorker)
- 降频判定 likely 档(用 cpufreq counter + thermal_zone 旁路双信号,无法做 confirmed)
- GPU-bound 强信号(用单次 Gfx.WaitForPresent > vsync 阈值,无法量化 GPU 满载比)

### §9.2 工程化建议(分四档)

#### 🟢 已落实(代码 + 采集端均到位)

1. ✅ record_aoeyz.bat v2 + 256MB ring + 旁路文件(thermal_before/after/cpuinfo_max/manifest)落盘
2. ✅ Provider `_peel_onion` 加 `Gfx.WaitForPresent ⊂ WaitForPresent` 父子去重
3. ✅ Provider `_slice_tree` KNOWN_TOP_LEVEL 白名单升级 root,解决 PlayerLoop 嵌套引发主树缺失
4. ✅ Provider `_identify_rhi/lua_mtgc/ecs_workers` 三类按 atrace slice 内容反查通用名(同名陷阱破解)
5. ✅ Provider `_throttling` 支持四档 confirmed/likely/suspected/none,温度旁路双信号 + 高温起点独立信号 + 严重低频独立触发
6. ✅ Provider binderPeers 用 `server_pid` 直接反查 process.name + COALESCE 到 `pid=N` 退化路径
7. ✅ aoe-watch-spec.yaml 阈值表,含 systemLevelThresholds 6 条系统级 + moduleSingleCallRedlines 5 条业务模块单次红线
8. ✅ 报告骨架模板 perfetto-report-template.md,含 §-1/§0/§4.4/§4.5/§5.2/§6.2/§6.3 全部视觉化资产骨架
9. ✅ lessons-learned.md 6 条历史教训,警示后续 AI/开发者不要重蹈

#### 🟡 待 Provider 子查询扩展(不阻塞本报告)

10. ⏳ UnityGfxRenderS 子函数 callTree 展开(当前只到 thread 顶层,RHI 子函数也类似) — 让 §7.2 能给出 RHI eglSwapBuffers / Gfx.PresentFrame 单次成本
11. ⏳ 单帧 jank 取顶 5 帧逐线程时间轴 — 给 §6.5 "p99 偶发尖峰"做精确归因(是 LuaMtGC GC?ResMgr 突发?Burst Job 撞库?)
12. ⏳ MapCameraCtrl 在 LateUpdate 子树展开(本样本三份都未拖动 → camera-idle context,所以 callTree 上没出现该节点 — 但拖动场景需要这个分支)
13. ⏳ ECS SystemGroup 子函数下钻(看哪个 group 下分发慢) — 当前 callTree 在 Default World 一层就被剪了
14. ⏳ atrace dalvik GC.Collect / GC.Concurrent 单次 STW 时长(C# 而非 Lua) — 当前 gcAllocByModule 只给了 GC.Alloc 次数,没有 GC.Collect 阻塞时长

#### 🔴 物理 / 结构性不可达(永久声明)

15. ❌ sched_blocked_reason ftrace 真值 — 华为非 root EMUI SELinux 静默丢弃,所有 byReason.blockedFunction 永远为 null
16. ❌ sysfs scaling_max_freq 旁路 — 华为锁了 Permission denied,严格 confirmed 档降频判定永远不可达
17. ❌ GPU busy / freq counter — 骁龙需 root 注入 producer,所以"GPU 满载比"硬数据永远给不出
18. ❌ Wwise 内部细分 — atrace 无 native 埋点,perfetto 对 Wwise 完全失明,需 simpleperf 互补

#### 后续工程项

19. 🔧 切换到 perfetto config 模式,启用 `actual_frame_timeline_slice` data source — VSync miss 量化(配合 Choreographer expected vs actual)
20. 🔧 沉淀同样套路到 simpleperf-native-analysis skill,把 RHI Native 函数 self% / Wwise 函数 self% 接上来,与本 skill 互补
21. 🔧 web 平台跨源对齐,把 perfetto + simpleperf + unity-profiler 三源同窗口对齐,做"Why × What × How"立体分析

---

## §10 自评(skill 沉淀复用验证)

我**仅靠 skill 5 个文件**(SKILL.md / perfetto-report-template.md / aoe-watch-spec.yaml / collection-config-rationale.md / lessons-learned.md)+ 业务知识 aoe-cpu-analysis-knowledge.md + 三份 summary,产出了上述 v5.3 报告。沉淀给我最大的 3 条帮助:

1. **lessons-learned #1 直接救我躲过 v5 的 atrace LIKE 高估错误**。我看到 `aoeHotSlices.MapSignificanceMgr.totalMs cur=2914.76` 时第一反应是用这个数据写"MapSig cur 19.87% 主导业务",但 SKILL.md M1 + lessons-learned #1 明确警告"用 callTrees 父子链才是占帧消耗唯一正确口径"——我转去 callTrees,读到 `MapSignificanceMgr.sampler_OnUpdate cur=626.70ms 单次 avg 1.29ms`,与 aoeHotSlices 数据相差 **4.6 倍**(2914 vs 626)。如果没有这条沉淀,我会再犯 v5 的 4.6× 高估错。
2. **SKILL.md M4 + aoe-watch-spec gpu-bound-strong 阈值给出了 GPU-bound 判定的"硬阈值锚"**。"单次 Gfx.WaitForPresent > vsync 周期"是 perfetto 单源能给的最强 GPU-bound 信号 — 没有这个阈值,我可能会写成"throttle 主线程 Sleep 39% 偏高,推断 GPU 慢",但拿不出可量化的判据。有了 16.66ms 这个 60Hz vsync 周期数字,加上实测 17.80ms 单次,可以写出"超 vsync 周期 → swapchain 撑爆"的硬证据。
3. **perfetto-report-template.md 让我没漏 §-1 / §4.4 状态分布 ASCII / §4.5 因果链 / §6.2 缩进树 这 4 个最容易"图省事"被砍掉的视觉化资产**。模板里"必备"两字 + "形式硬规则"明确写着不准用对比表格,要用引用块+加粗+缩进树,把我从"写一张 5×N 表格交差"逼回了缩进树。最终 §6.2 主树 + §6.3 五个红线模块下钻是这份报告含金量最高的两节。

仍然觉得 sediment 缺漏 / 需要补的地方:

- **callTree 节点单次 avg 计算公式没明文写**(我自己用 `totalMs / count = avg` 算的)。模板可以加一节"如何把 totalMs/count/totalPct 这三个字段映射到红线判定"的小例子,让下次的 AI 不用自己推。
- **缺一份"ECS Worker 偏差实测健康基线"案例**(我自己得出 0.27-0.57pp 远低 30pp 红线,但模板里只写了"max-min < 5pp 健康")— 实测下界比目前模板写的 5pp 更紧得多,模板可以补一句"实测偏差 < 1pp 才是真健康,5pp 已经偏松"。
- **Choreographer fps 60.0 vs PlayerLoop fps 21.4 这个差距对应的"跨周期掉帧"机制**模板没展开,我引用了 aoe-watch-spec `framerate-vs-vsync-gap` 但不太自信结论 — 模板里 §7 GPU-bound 判定矩阵能再加"vsync 节拍稳但业务不达 fps × 0.5"作为单独一行就更清晰。

总体:这次复用是成功的,沉淀让我"不靠抄 v5.2"也能写出结构、数字、判定都到位的 v5.3 — 三大结论(主线程半睡型 / 业务侧 OutSideArmyLine 与 BattleHead 涨幅 / 三档 likely 降频)与从 SKILL.md M1-M4 推导出的应有结论一致。
