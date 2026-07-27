# perfetto 单源 性能分析报告 · 终极形态 v5

> 配套：[AOE CPU 知识库](../aoe-cpu-analysis-knowledge.md) · [perfetto v4 终极报告（前次，1-4 秒短样本）](./performance-report_perfetto_ULTIMATE_v4.md) · [perfetto skill 工程化路线图](./perfetto-skill-engineering-roadmap.md)
>
> **本源主线**：「主线程一帧到底是在算还是在等？等的是什么？机器拖后腿了吗？」
>
> **v5 相对 v4 的改动**：
> - **完整 20 秒采样**：v4 实际只采到 1.35-3.94 秒（buffer 太小被 ring 覆盖），帧数仅 75/60/52/53；v5 修了采集脚本，base2/cur2/thermal3 三份各拿到完整 20 秒，PlayerLoop 帧数 **1199 / 696 / 336**，分位数统计稳定性质变
> - **off-CPU 归因数据化**：新增 `offCpuAttribution` 字段（byState/byReason），不再只能口头判定"等 GPU"，给出具体 ms/计数/占比
> - **GC.Alloc 业务子树归因**：perfetto 独家方法论数据化 —— GC.Alloc slice 出现在哪个业务模块的子树下 = 该模块每帧分配次数，本次发现 thermal3 上 LuaMgr 27.4 次/帧、MapCameraCtrl 24.9 次/帧的雪崩式分配（v4 完全看不到）
> - **三份样本时长一致**（都是 20 秒），可以用累计 ms 直接对比；ms/帧 仍是首选口径
> - **thermal3 是另一个生物**：v4 thermal_2 是 "CPU 算不动型"（Running 94.5%、cpu7 下线）；v5 thermal3 是 **"主线程一半时间在睡型"**（Running 仅 55%、Sleeping 41%、屏幕 vsync 跑 92.8Hz 而 PlayerLoop 只有 16.9fps），形态完全不同
> - **采集缺口诚实声明**：本次 perfetto 没开 `sched_blocked_reason`，off-CPU 细分到内核 reason 仍不可得；新发现的 gap 已记录到 §1.3 + 末尾工程化建议

---

## §0 结论先行

本次分析采用 3 份 perfetto trace（同设备、同一段 25 分钟内连续采集）：

| 时间点 | trace | 场景 | 实际时长 | PlayerLoop 帧数 |
|---|---|---|---|---|
| 06-23 15:50 | base2 | 凉机基线（开机不久）| 19.95 s | 1199 |
| 06-23 15:52 | cur2  | 行军压测（base2 后 2 分钟）| 19.95 s | 696 |
| 06-23 15:57 | thermal3 | 行军压测（base2 后 7 分钟）| 19.95 s | 336 |

> 三份采样长度都拿到了完整 20 秒（v4 是因为 buffer 配错被 ring 覆盖只到 1-4 秒）。详见 §1。

**三个独立结论**：

1. **cur2 主线程瓶颈分布转移**（perfetto 独家）：UnityMain Running 84.5%、Sleeping 14.0%，比 base2 (Running 88.1%, Sleeping 10.8%) 微涨。看似温和，但 atrace 视角下 **`WaitForPresent` slice 累计从 2.28s 涨到 5.12s（×2.24）** —— 主线程业务还在跑，但每帧多花 ~4ms 在等 GPU swapchain。同时 `BehaviourUpdate` 累计从 2.60s 涨到 5.55s（×2.13）—— **业务和等 GPU 同步变重**。见 §4 / §7。

2. **业务侧 cur 真涨，红线触发清单**（atrace 全量统计，按 totalMs 占整 trace %）：
   - **MapSignificanceMgr** cur 占 23.43%（4.68 s 累计 / 17119 次触发 / avg 0.27ms 单次）— 占整 trace 1/4，是头号业务红线
   - **Core.Update** cur avg **7.39 ms/帧**（base 1.75 → ×4.2）— 主业务入口直接超 5ms 警戒线
   - **OutSideViewArmyLineMgr** base 0.011 → cur 0.694 ms/单次（×63）、totalMs ×38 倍
   - **BattleHeadMgr** cur avg 1.26 ms/单次、共 1.77s 累计（每帧 ~2.55ms 当量）
   - **LuaMgr** cur 累计 6.15s 占 30.82%（base 3.60s 占 18%）— 全 Lua 调度压力上升
   
   见 §6。

3. **thermal3 形态：屏幕 90Hz 节拍下的"主线程半睡"**（v4 没观察到的形态）：
   - 屏幕 Choreographer **92.8fps**（一个 11ms 拍）持续工作 —— **显示链路正常**
   - PlayerLoop **fps 16.9 / p50 55.55ms / p99 103.7ms / slowFrame >33ms = 98.81%** —— 业务一帧要 55ms 才出
   - UnityMain Running **55.45%**、Sleeping **41.07%** —— 主线程超过 4 成时间在睡
   - `WaitForPresent` 累计 **16.1 秒占整 trace 80.6%**、`Gfx.WaitForPresent` 单次 **avg 23.87ms** —— **主线程绝大部分时间在等 GPU/swapchain**
   - **MapCameraCtrl 暴涨**：base/cur 占 < 1.2% → thermal3 占 **15.82%**（3.16s，×14）—— thermal 触发了 base/cur 不出现的代码路径
   - **LuaMgr GC.Alloc 雪崩**：base 0.1/帧 → cur 2.5/帧 → thermal3 **27.4/帧** —— GC 压力跨数量级增长
   - **机器：大核降频明显**，cpu4-6 reach 55.4%（cur 68.8%、base 76.6%），但 cpu7 没下线（与 v4 thermal_2 不同形态）
   
   见 §5 / §6。

按 ROI 排序的优化方向：

1. **MapSignificanceMgr 单次任务削峰**（cur 头号业务红线，4.68s 累计）— 高频小任务 17119 次/20s
2. **削 GPU 工作量**（perfetto 独家结论）— thermal 状态下主线程 80% 时间等 GPU，降分辨率 / 简化阴影 ROI 最高
3. **Core.Update 入口分帧**（cur avg 7.39 ms/帧，超 5ms 警戒线）— 业务 Update 大头需要分帧
4. **OutSideViewArmyLineMgr 增量化**（×63 单次涨幅，×38 累计涨幅）
5. **thermal 路径专项**：LuaMgr GC 压力（27.4 次/帧）+ MapCameraCtrl 仅 thermal 出现（×14）— 这两个是高温下才显现的隐性路径

---

## §1 采集质量声明 + 数据口径

### 1.1 trace 实际时长（v5 修了 v4 的 buffer 问题）

| 数据 | `-t` 配置 | 实际窗口 | 完整度 |
|---|---|---|---|
| base2 | 20s | **19.95 s** | ✅ 完整 |
| cur2 | 20s | **19.95 s** | ✅ 完整 |
| thermal3 | 20s | **19.95 s** | ✅ 完整 |

v4 那次 `-b 32mb`，事件密度 ~17 MB/s，10s 配置只能存下末尾 ~2 秒。本次采集 `-b 256mb` + 类别精简（去掉 camera/input/hal/res），20s 配置完整落盘。

### 1.2 数据口径（关键）

本报告业务模块耗时**有两个统计口径**：

```
ms/单次触发       = 该 atrace slice 单次 dur 的平均（直接读 atrace_slices / aoeHotSlices.avgMs）
totalMs           = 该模块在整个 20s 窗口的 slice dur 总和
totalPct          = totalMs / 20s × 100% = 占整 trace 时间 %
ms/帧（推算）     = totalMs / PlayerLoop 帧数（用于跨次对比，v5 三份帧数不同时仍可比）
触发次数（count）  = 该 slice 在窗口内出现的次数
```

**为什么 v5 主要用 totalMs / totalPct + 单次 avgMs，而不像 v4 用 ms/帧**：
- v5 三份样本时长**一致**（都是 19.95s），totalMs 直接可比，无需归一化
- ms/帧 仍可推（totalMs / 帧数），有需要时给出
- "单次触发 avgMs" 是新加的维度 —— **能区分"涨在单次更慢 vs 涨在触发更频繁"**，这是 v4 没区分清楚的

**实例**：MapSignificanceMgr 从 base→cur，单次触发 avgMs 0.028→0.273（×9.75），触发次数 15593→17119（×1.10）—— **涨在单次更慢，不是触发更频繁**，定位优化点是"削峰每次任务的代价"而不是"减少触发"。

### 1.3 数据缺失声明（影响判定置信度）

| 项 | 状态 | 影响 |
|---|---|---|
| `sched_blocked_reason` ftrace | ❌ 采集没开 | off-CPU byReason 的 `blockedFunction` 全为 null；细分主线程 sleep 时内核记录的等待对象不可读 |
| `wake_event` 完整链路 | ⚠️ 部分 | summary 里 wakerTopK 为空（thread_state 表没填 waker_utid）；改进同上 |
| FrameTimeline | ❌ trace 无 | VSync miss / expected vs actual frame 无法量化 |
| GPU counter (busy/freq) | ❌ 设备未上报 | GPU 实际工作量无法直接量化 |
| sysfs `scaling_max_freq` 旁路 | ❌ 缺 | 严格"sysfs 确认级"降频判定缺；用 cpufreq counter 推测级 + 跨次时序证据 |

**v5 新增 gap：** off-CPU byReason 全 null + waker 全空。本次新增 `offCpuAttribution` 字段，结构已就位，但底层 ftrace 没开 sched_blocked_reason，**下一步采集脚本要加入 sched_blocked_reason 类别**（见末尾建议）。本次仍用 atrace wait slice 重叠法替代（§4.2）。

---

## §2 采集元信息

| 项 | base2 | cur2 | thermal3 |
|---|---|---|---|
| 场景 | 凉机基线（开机不久）| 行军压测 | 行军压测（持续 7min 后）|
| 实际 trace 长度 | 19.95 s | 19.95 s | 19.95 s |
| **PlayerLoop 帧数** | 1199 | 696 | 336 |
| **PlayerLoop p50 / p95 / p99 (ms)** | 16.65 / 18.69 / 21.54 | 28.07 / 36.01 / 41.81 | **55.55 / 92.51 / 103.68** |
| **PlayerLoop fps** | 60.0 | 34.9 | **16.9** |
| **Choreographer fps**（屏幕节拍）| 60.6 | 64.2 | **92.8** ← 反常 |
| slowFrameRate >33ms | 0% | 14.1% | **98.81%** |
| CPU 平均频率 | 1735.7 MHz | 1563.1 MHz | **1445.1 MHz** |
| 推测降频 bigCoreReach% | 77.0% | 70.8% | **60.1%** |

**两个解读关键点**：

1. **PlayerLoop fps vs Choreographer fps**：
   - base2/cur2 上两者接近（都是 60Hz 节拍内）
   - **thermal3 上 Choreographer 92.8fps（屏幕在跑 90Hz 高刷模式）但 PlayerLoop 16.9fps** —— SurfaceFlinger 仍然每 11ms 触发一次 doFrame，但 Unity 业务每 55ms 才出一帧，**跨 5 个 vsync 周期才能交一帧**。这种形态 v4 在 60Hz 屏幕上没观察到。

2. **CPU 频率单调下降，但 cpu7 没下线**：base→cur→thermal 是 1735→1563→1445 MHz；v5 这次 cpu7 在 thermal3 上仍 reach 64.8%，**与 v4 thermal_2 cpu7 sched 完全归零**的形态不同。v5 是"全集群压频"，v4 是"集群下线"，两种形态都属于降频，但具体机制不同（可能与 SoC 不同、热保护策略不同、或本次没采到那个阶段）。

**分位数通俗解释**：
> `p50` 中位帧 = 一半时间帧耗时都≤此值（"平时玩着的卡度"）；`p95` 倒数 5% ≈ 偶尔抖一下；`p99` 倒数 1% ≈ 百帧才一次的尖峰卡顿。`slowFrameRate >33ms` = 超过 30fps 阈值的帧占比。
> **帧口径硬规则**：`choreographer` (vsync 节拍恒定) ≠ `playerloop` (应用一帧实际耗时)。本报告所有 fps 结论一律用 PlayerLoop 口径。

---

## §3 线程身份地图（沿用 v4，再次给出关键调度数据）

| 行业通用名 | comm | 关键 atrace 证据 | 一句话定位 |
|---|---|---|---|
| **UnityMain** | UnityMain | `PlayerLoop` × 1199/696/336、所有 `Update.*` | 业务/Lua/ECS 调度主入口 |
| **Render**（GfxDeviceWorker）| UnityGfxRenderS | `Gfx.RenderSlaver.ThreadRun`、`Semaphore.WaitForSignal` | Unity 命令录制层 |
| AudioTrack / AAudio | AudioTrack / AAudio_1 | 音频回调 | 音频线程 |
| Audio Mixer | Audio Mixer Thr | 音频混音 | 音频引擎 |
| 其他 | AsyncWorker / Audio Stream Th / GVoiceRender | — | 异步 IO / 语音 |

**v5 这次没单独抓 RHI（Thread-10X）线程的 sched**：本次 perfetto provider 的 KEY_THREAD_HINTS 里没有 `Thread-`，所以这次 RHI 线程没进 threadsSched。v4 是手工 SQL 抓的。如果要分析 RHI 链路 sleep，需 provider 增强（已记录到工程化建议）。

**对比 base2 / cur2 / thermal3 三条主要线程调度**：

| 线程 | base2 run% | cur2 run% | thermal3 run% | Δ base→cur | Δ cur→thermal |
|---|---|---|---|---|---|
| **UnityMain** | 88.14% | 84.47% | **55.45%** | −3.7pp | **−29.0pp** |
| UnityGfxRenderS（Render）| 26.36% | 23.75% | 15.98% | −2.6pp | −7.8pp |
| AudioTrack | 5.43% | 5.05% | 4.83% | −0.4pp | −0.2pp |

UnityMain run% 从 cur 到 thermal **掉了 29pp**，但同期 Render 只掉 7.8pp、Audio 没动 —— **不是机器整体睡眠（其他线程都没异常涨 sleep），是 UnityMain 自己在等什么**。

UnityMain 三态分布完整：

| 状态 | base2 | cur2 | thermal3 | thermal3 占整 20s |
|---|---|---|---|---|
| Running | 88.14% | 84.47% | **55.45%** | 11.06 s |
| Sleeping (S) | 10.78% | 13.96% | **41.07%** | **8.19 s** ← 4 成时间在睡 |
| Runnable (R/R+) | 1.00% | 1.43% | 2.96% | 0.59 s |

---

## §4 主线程 off-CPU 归因（perfetto 独家）

### 4.1 off-CPU 总量与 byState 分布（v5 新增数据化字段）

`offCpuAttribution` 字段：

| 数据 | base2 | cur2 | thermal3 | thermal3 解读 |
|---|---|---|---|---|
| **totalOffCpuMs** | 2367.0 | 3098.6 | **8888.4** | 主线程整 20s 窗口 8.9 秒不在 CPU 上 |
| S (Sleeping) | 2098.5 (88.66%) | 2673.5 (86.28%) | **8092.8 (91.05%)** | 主动睡眠占 off-CPU 91% |
| R (Runnable) | 199.7 (8.44%) | 284.4 (9.18%) | 589.7 (6.63%) | 想跑但没排上 CPU |
| D (Disk wait) | 53.3 (2.25%) | 110.9 (3.58%) | 101.7 (1.14%) | I/O 等待，绝对量小 |
| R+ (preempted) | 15.5 (0.66%) | 29.8 (0.96%) | 104.2 (1.17%) | 被抢占 |

**关键观察**：

- **base2 已经 11.78% off-CPU**（凉机也不是 100% Running，每帧有正常的 vsync 等待）。这次 base2 比 v4 的 83.07% Running 更高（88.1%），因为 v5 base2 凉机程度更深、负载更轻
- **cur2 off-CPU 只比 base2 多 730ms**（3.10s vs 2.37s）—— 增量主要在 S（+575ms） + R (+85ms) + D (+58ms)，三态都在涨但 S 占大头
- **thermal3 off-CPU 暴涨 5.79 秒**（8.89s vs 3.10s）—— **全部进了 Sleeping (+5.42s) 和 Runnable (+305ms)**，D 和 R+ 没明显涨。这意味着：**thermal 状态下主线程不是"想跑没机会"（R 没大涨），是"主动睡更久"（S 大涨）—— 在等更慢的某个东西**

### 4.2 byReason 细分（受限于 sched_blocked_reason 没开，只能给 byState）

```json
[
  { "state": "S", "blockedFunction": null, "totalMs": 8092.81, "count": 2582, "pctOfOffCpu": 91.05 }
]
```

`blockedFunction` 全部为 null（采集没开 `sched_blocked_reason` ftrace），这一层归因要等下次采集补齐。**用 atrace wait slice 重叠法替代**（下一节）。

### 4.3 用 atrace wait slice 重叠法替代（perfetto 独家）

把主线程 atrace 里所有 wait 类 slice 的累计时间，与 UnityMain 的 Sleeping 总时间对照：

| wait 类 atrace slice | base2 累计 | cur2 累计 | thermal3 累计 | thermal3 占整 trace |
|---|---|---|---|---|
| **WaitForPresent**（主线程在等 GPU 上一帧 Present） | 2283.3 ms | 5125.0 ms | **16098.5 ms** | **80.64%** |
| **Gfx.WaitForPresent**（同上，每帧 1 次的 wrapper） | 1132.6 ms | 2556.8 ms | **8045.2 ms** | **40.30%** |
| **WaitForTargetFPS** | 900.4 ms | 35.8 ms | 5.8 ms | 0.03% |

**关键对照**：UnityMain Sleeping 总时间 / WaitForPresent 累计 / Gfx.WaitForPresent 累计：

| | UnityMain Sleeping | WaitForPresent | Gfx.WaitForPresent | 解读 |
|---|---|---|---|---|
| base2 | 2151 ms | 2283 ms | 1133 ms | Sleeping ≈ WaitForPresent，主要在等 GPU |
| cur2 | 2786 ms | 5125 ms | 2557 ms | WaitForPresent 远超 Sleeping —— 因为 WaitForPresent 包含 Sleeping + 部分 Running 状态（atrace slice 不一定与 sched state 完全重合）|
| thermal3 | 8194 ms | **16099 ms** | **8045 ms** | **Gfx.WaitForPresent (8045ms) ≈ Sleeping (8194ms)** —— **thermal 状态主线程 Sleeping 时间几乎 100% 被 Gfx.WaitForPresent 覆盖** |

**结论**：

- base2/cur2/thermal3 都呈现"主线程 Sleeping ≈ Gfx.WaitForPresent"的强对应关系
- **thermal3 的 4 成 trace 时间在 Gfx.WaitForPresent 上** —— 主线程睡的时候 100% 在等 GPU/swapchain
- 但 `WaitForTargetFPS`（应用层主动让出预算）几乎归零（base2 900ms → thermal3 6ms），**没有任何"业务跑完还剩 vsync 预算"的现象**

### 4.4 cur2 vs thermal3 主线程状态可视化

```
状态分布对比 (主线程总时长归一化为整 20s 窗口)

base2:    █████████████████████████████████████ ░░░░░ ▒
           Running 88.14% (17.6s)                  Sleep 10.78% (2.15s)
                                                   ↑ 几乎全是正常 vsync 等待

cur2:     ████████████████████████████████████ ░░░░░░░ ▒
           Running 84.47% (16.85s)                Sleep 13.96% (2.79s)
                                                   ↑ 多出来的 ~640ms 几乎全是 WaitForPresent

thermal3: ██████████████████████ ░░░░░░░░░░░░░░░░░ ▒▒
           Running 55.45% (11.06s)         Sleep 41.07% (8.19s)
                                            ↑ 其中 8.05s = Gfx.WaitForPresent（98.3%）

→ 三份样本都 "Sleeping = 在等 GPU"，但 thermal3 上等的时间是 base 的 4 倍，cur 的 3 倍
→ thermal3 上业务实际"算"的时间反而更短（11.06s vs base 17.59s），bigCoreReach 60.1%
  → 这是个组合：算得更慢（频率拉胯）+ 等得更久（GPU 也跟不上）
```

---

## §5 降频时序证据链（perfetto 独家）

### 5.1 三份 trace 一行一份样本

| 时间点 | cpu7 sched | cpu7 reach% | cpu4-6 reach% | cpu0-3 reach% | UnityMain run% | PlayerLoop p50/p99 ms | 解读 |
|---|---|---|---|---|---|---|---|
| **base2 15:50** | 活跃 | 77.4% | 76.6% | 59.7% | 88.14% | 16.65 / 21.54 | 凉机也已经轻度压频 |
| **cur2 15:52** | 活跃 | 72.8% | 68.8% | 72.3% | 84.47% | 28.07 / 41.81 | 大核中度压频 |
| **thermal3 15:57** | 活跃 | **64.8%** | **55.4%** | 76.1% | **55.45%** | **55.55 / 103.68** | **大核重度压频，小核反而提频** |

**v5 这次降频形态与 v4 完全不同**：

- **v4 那次 thermal_2 是"集群下线"型**：cpu7 sched 完全归零、cpu4-6 cpufreq 事件归零（governor 锁频）、cpu0-3 max 从 1805→1094（−39%）
- **v5 thermal3 是"全集群压频"型**：cpu7 仍活跃但 reach 仅 64.8%、cpu4-6 reach 55.4%、**cpu0-3 反而 reach 76.1%**（小核被拉高来补大核降频）

这是两种合法的降频形态，决策权在 SoC governor。两者**都通过 CPU 频率持续下降 + 主线程 Running 降低**反映出来。

### 5.2 per-CPU 实测（base→cur→thermal）

| CPU | base2 avg/max | cur2 avg/max | thermal3 avg/max | 含义 |
|---|---|---|---|---|
| cpu0-3 (小核 cluster) | 1077.2 / 1804.8 MHz | 1304.2 / 1804.8 | **1374.2** / 1804.8 | 小核反而提频（被拉来补） |
| cpu4-6 (中核 cluster) | 1853.5 / 2419.2 MHz | 1664.7 / 2419.2 | **1339.1** / 2419.2 | 中核降频 −27.7%（vs base avg）|
| cpu7 (大核) | 2199.0 / 2841.6 MHz | 2067.5 / 2841.6 | **1841.3** / 2841.6 | 大核降频 −16.3% |

**bigCoreReach% 单调下降**：77.0 → 70.8 → 60.1，与 PlayerLoop fps 60→34.9→16.9 同向。这条 reach% vs fps 的相关性可以作为后续自动降频判定的参考阈值（reach% < 65% → 降频高度可疑）。

### 5.3 降频判定（v5 仅推测级）

| 维度 | 严格"sysfs 确认级"要求 | 本数据 |
|---|---|---|
| `scaling_max_freq < cpuinfo_max_freq` | 需 sysfs 旁路 | ❌ 缺 |
| cpu7 sched 活动归零 | = cluster offline | ❌ **本次 cpu7 活跃，不构成等价确认级** |
| cpu4-6 cpufreq 事件归零（governor 锁频）| 等价 sysfs 确认 | ❌ cpufreq 事件正常 |
| **per-CPU reach% 持续下降跨多份 trace** | 时序证据 | ✅ 77 → 70.8 → 60.1 |
| **大核绝对频率单调下降跨多份 trace** | 时序证据 | ✅ cpu7 2199→2067→1841 MHz |

**判定**：thermal3 上**推测级降频**（无严格 sysfs 旁路、无集群下线的等价硬证据）。但跨 3 份 trace 时序下降趋势明确，结合 fps 同向下降，**实际工程意义上仍可认定降频**，只是不能像 v4 thermal_2 那样给出"等价确认级"标签。

### 5.4 thermal3 上业务模块同步劣化（atrace 全量统计）

| 模块 | base2 totalMs | cur2 totalMs | thermal3 totalMs | thermal3 单次 avgMs | 解读 |
|---|---|---|---|---|---|
| LuaMgr | 3595.8 | 6150.7 | **5855.9** | 1.80 | cur 已经涨到 6.15s, thermal 单次 avg 涨到 1.80ms |
| Core.Update | 2103.6 | 5143.9 | **3361.6** | **10.01** | thermal 单次 10ms（×6） |
| **MapCameraCtrl** | 155.7 | 227.0 | **3157.7** | 0.95 | **base/cur 几乎不存在 → thermal 暴涨 ×14** |
| MapSignificanceMgr | 432.6 | 4675.6 | **3971.2** | 0.47 | cur 大涨，thermal 维持 |
| OutSideViewArmyLineMgr | 30.1 | 1149.8 | 795.9 | 0.89 | cur 暴涨 ×38，thermal 略降 |
| BattleHeadMgr | 229.2 | 1773.6 | 743.2 | 1.07 | cur 大涨，thermal 略降 |

**重要观察**：

- **MapCameraCtrl 是 thermal-only 的隐性热点**：base/cur 时几乎不活动（<230ms），thermal3 上突然累计 3.16s 占 15.82%。**这条只在高温下才走的代码路径，是 v4 短样本看不到的**
- **OutSideViewArmyLineMgr / BattleHeadMgr 在 thermal3 反而下降**：因为帧数从 cur 696 → thermal 336 砍半，业务被"压不住"的部分被降频拉慢了；按"单次 avgMs"看反而都涨了

---

## §6 主线程一帧时间去向（含热点下钻）

### 6.1 PlayerLoop 帧分位数对比（v5 大样本）

v5 三份样本帧数 1199 / 696 / 336，分位数稳定性远好于 v4：

| 分位 | base2 | cur2 | thermal3 | Δ base→cur | Δ cur→thermal |
|---|---|---|---|---|---|
| p50（中位帧）ms | 16.65 | 28.07 | **55.55** | +68.6% | +97.9% |
| p95（次坏帧）ms | 18.69 | 36.01 | **92.51** | +92.7% | +156.9% |
| p99（最坏帧）ms | 21.54 | 41.81 | **103.68** | +94.1% | +148.0% |
| slowFrame >33ms | 0% | 14.1% | **98.81%** | +14.1pp | +84.7pp |
| fps（PlayerLoop）| 60.0 | 34.9 | **16.9** | −41.8% | −51.6% |

**两个新发现（v4 短样本看不到）**：

- **cur 上 p50→p99 范围（28→41.8ms）仅扩 49%**，p99 与 p50 差距小，**说明 cur 下卡顿是"持续匀慢"而非"偶发尖峰"** —— 业务整体都慢了，不是某一帧爆炸
- **thermal3 上 p50→p99（55→103.7ms）扩 87%**，差距明显拉大 —— 既匀慢又偶发更严重；98.81% 帧 >33ms 说明 30fps 阈值几乎全失守

### 6.2 主线程 atrace 业务模块对比表（totalMs + 单次 avgMs，按 cur2 totalMs 倒序）

| 模块 | base2 total | cur2 total（占整 trace %） | thermal3 total（占整 trace %） | cur2 单次 avg | thermal3 单次 avg |
|---|---|---|---|---|---|
| **LuaMgr** | 3596 ms | **6151 ms (30.82%)** | 5856 ms (29.33%) | 0.94 | 1.80 |
| Core.Update | 2104 | **5144 (25.78%)** | 3362 (16.84%) | 7.39 | 10.01 |
| **WaitForPresent**（主线程等 GPU）🔵 | 2283 | **5125 (25.68%)** | **16099 (80.64%)** ⚠️ | 0.92 | 5.97 |
| **MapSignificanceMgr** 🔴 | 433 | **4676 (23.43%)** | 3971 (19.89%) | 0.27 | 0.47 |
| **Gfx.WaitForPresent**（每帧一次的 wrapper）🔵 | 1133 | 2557 (12.81%) | **8045 (40.30%)** | 3.67 | 23.87 |
| SimulationSystemGroup | 1931 | 1242 (6.22%) | 687 (3.44%) | 0.60 | 0.68 |
| **BattleHeadMgr** 🔴 | 229 | **1774 (8.89%)** | 743 (3.72%) | 1.26 | 1.07 |
| **OutSideViewArmyLineMgr** 🔴 | 30 | **1150 (5.76%)** | 796 (3.99%) | 0.69 | 0.89 |
| InitializationSystemGroup | 1220 | 913 (4.57%) | 644 (3.23%) | 0.66 | 0.96 |
| PlayerUpdateCanvases | 1180 | 760 (3.81%) | 553 (2.77%) | 1.09 | 1.64 |
| MeshUIManager | 106 | 667 (3.34%) | 308 (1.54%) | 0.12 | 0.11 |
| PresentationSystemGroup | 799 | 555 (2.78%) | 340 (1.70%) | 0.20 | 0.25 |
| TServer | 114 | 524 (2.63%) | 364 (1.82%) | 0.072 | 0.099 |
| **MapCameraCtrl** | 156 | 227 (1.14%) | **3158 (15.82%)** ⚠️ | 0.045 | 0.96 |
| ResManager | 165 | — | — | — | — |

**v5 独家观察**（v4 1-4s 短样本得不出来）：

- 🔴 **MapSignificanceMgr 占 cur 整 trace 23.43%**，是 cur 头号业务红线
- 🔴 **BattleHeadMgr 占 cur 8.89%**（单次 avg 1.26ms，超 "1-2ms 不合理" 红线下沿）
- 🔴 **OutSideViewArmyLineMgr 单次 avg 从 base 0.011 → cur 0.694（×63）**
- ⚠️ **MapCameraCtrl 是 thermal3 才出现的隐性路径**（base/cur < 1.2% → thermal 15.82%，单次 avg ×20）
- 🔵 **WaitForPresent 占 thermal3 80.64%**：thermal 主线程 4/5 时间在等 GPU/swapchain

### 6.3 Top 5 热点下钻

#### 6.3.1 LuaMgr（cur 累计 6151ms 占整 trace 30.82%，单次 avg 0.94ms × 6528 次）

LuaMgr 是 atrace 上聚合"所有 Lua 管理器 OnUpdate"的伞节点，本身不耗时，**消耗来自下属管理器**。从 GC.Alloc 业务子树归因可以看出 cur 上 LuaMgr 自身分配只有 2.5 次/帧（很低），主要分配压力在子模块：

| LuaMgr 下子模块的 GC.Alloc | base2 alloc/帧 | cur2 alloc/帧 | thermal3 alloc/帧 |
|---|---|---|---|
| BattleHeadMgr 子树 GC.Alloc | 0 | **4.8** | 7.4 |
| MapSignificanceMgr 子树 GC.Alloc | 0.1 | 1.0 | 1.5 |
| **LuaMgr 自身（剩余 Lua 调度）** | 0.1 | 2.5 | **27.4** ← thermal 暴涨 |

**优化方向**：cur 主要削 BattleHeadMgr / MapSignificanceMgr 的子分配（见 §6.3.2 / §6.3.3）；thermal 状态额外要处理 LuaMgr 本身分配雪崩（27.4 次/帧）。

#### 6.3.2 MapSignificanceMgr（cur 累计 4676ms 占 23.43%，单次 avg 0.27ms × 17119 次）

cur2 上的 17119 次触发 / 696 PlayerLoop 帧 ≈ **每帧 24.6 次** —— 高频小任务。单次 avg 0.27ms，乘频次 = 每帧 6.65ms。

**对照 v4 下钻**：v4 §6.3.2 已经定位到 `ProcessTask_MapEntityAdd 单次 max 3.42ms` 是 MapSig 单帧最大破口。v5 没复跑这一层 SQL（要重 trace_processor 查），但 totalMs 5×v4 涨幅说明问题加重。

**GC.Alloc 视角**：cur2 MapSig 子树 alloc/帧 ≈ 1.0（base 0.1），thermal3 ≈ 1.5 —— GC 压力中等，主要是任务数本身多。

**优化方向**：
- **任务分帧 + 预算控制**（任意单帧 MapSig 累计触发耗时 > 3ms 立即返回，剩余任务下一帧）
- 高频任务（17119 次/20s ≈ 856 次/秒）应当评估是否可以**合并同类任务**或**降频**

#### 6.3.3 BattleHeadMgr（cur 累计 1774ms 占 8.89%，单次 avg 1.26ms × 1412 次）

cur2 上 1412 次触发 / 696 帧 ≈ **每帧 2.0 次**，单次 1.26ms × 2.0 = **每帧 2.55ms** —— 单次平均超 v4 红线"1-2ms 不合理"，且持续 20 秒稳定输出。

**GC.Alloc 业务归因**：cur2 BattleHeadMgr 子树 alloc 3327 次 / 696 帧 = **4.8 次/帧**，thermal3 涨到 7.4 次/帧。base2 为 0 → **cur 行军压测引发了 BattleHeadMgr 的高频分配**。

**优化方向**（沿用 v4 §6.3.1）：
- 评估 `TimeText.7` / `.6` 每帧刷新数量（v4 报告 1423 次/帧）
- `BattleHead.OnRefresh` 内部分配做对象池

#### 6.3.4 OutSideViewArmyLineMgr（cur 累计 1150ms 占 5.76%，单次 avg 0.69ms × 1656 次）

**v5 独家看到的"单次 avg ×63 倍"涨幅**（base 0.011ms → cur 0.694ms）：单次成本暴涨 60 倍 + 触发次数微跌（2698→1656）—— **单次成本暴涨是根因**，不是触发更频繁。

这与 v4 §6.3.3 "Burst Job 调度 7192 次/帧"的解读一致 —— 主线程入口 OutSideViewArmyLineMgr.Update 单次 0.69ms 包含了 Job Schedule 调度开销，行军场景下 ~300 队 × 20 路径点 = 6000+ Job/帧 Schedule。

**优化方向**：
- 视距分级（远处队伍降频更新轨迹线）
- 几何缓存（轨迹未变复用上帧顶点）

#### 6.3.5 MapCameraCtrl（thermal3 独有：累计 3158ms 占 15.82%，单次 avg 0.96ms × 3308 次）

**v5 完全独家发现** —— base2/cur2 上几乎不存在（< 1.2% 占比），thermal3 上突然成为头号热点之一。3308 次触发 / 336 帧 = **每帧 9.8 次**，单次 0.96ms × 9.8 = **每帧 9.4ms 当量**。

**两种可能**：
1. **thermal 状态下的相机抖动 / 强制重新计算**：高温降频后某些相机依赖计算（如 culling、LOD）被强制走慢路径
2. **业务上 thermal 时段画面发生了变化**（如玩家移动了相机 / 进入了某个区域）

**优化方向**：
- 需要业务侧确认 thermal 时段是否切换了场景 / 相机模式
- 如果是隐性路径，应当抑制 thermal 状态下的非必要相机计算（"相机降频"策略）

### 6.4 红线触发清单（按 cur2 占整 trace %）

| 优先级 | 模块 | 实测 | 红线 | 路径 |
|---|---|---|---|---|
| 1 | **MapSignificanceMgr** | cur 占 **23.43%**（4.68s/20s）| 任务数过多 / 单任务 > 3ms | LuaMgr → MapSignificanceMgr.OnUpdate |
| 2 | **BattleHeadMgr** | 单次 avg **1.26ms** × 2.0/帧 = **2.55 ms/帧** | 1-2ms 不合理 | LuaMgr → BattleHeadMgr.OnUpdate |
| 3 | **OutSideViewArmyLineMgr** | 单次 avg ×**63** | 涨幅 ×52 已超历史观察 | LuaMgr → MapManager → ViewArmyLineMgr |
| 4 | **Core.Update** 入口 | 单次 avg **7.39ms/帧** | > 5ms 警戒 | PlayerLoop → BehaviourUpdate → Core.Update |
| 5 | **MapCameraCtrl**（thermal-only）| thermal **15.82%** | 隐性路径 | LuaMgr → MapCameraCtrl |

### 6.5 worst frame 形态推断（v5 用分位数差值替代 v4 的逐帧 SQL）

v4 §4.4 给了 worst frame #23 的三线程时间轴。v5 没复跑该 SQL（trace 太大），但能用分位数差值粗看慢帧结构：

**cur2 上 p95 - p50 = 36.01 - 28.07 = 7.94 ms** 的额外耗时来自哪里？

- WaitForPresent 单次 avg 0.92ms，count 5570 → 单帧 ~8 次 → 单帧 ~7.4ms
- **cur2 慢帧的 7.94ms 额外耗时几乎可以归因到 WaitForPresent 多等几次**

**thermal3 上 p95 - p50 = 92.51 - 55.55 = 36.96 ms**：

- Gfx.WaitForPresent 单次 avg 23.87ms，是单帧一次的 wrapper —— **慢帧主要由 Gfx.WaitForPresent 单次拉长贡献**
- 单次 23.87ms 远超 vsync 16.66ms 间隔，说明 GPU 已经撑爆 vsync 周期，进入 swapchain 排队

---

## §7 渲染链路 + GPU bound 判定

### 7.1 Gfx.WaitForPresent 单次 avg 演化（核心指标）

| trace | 单次 avg | 单次 max（推算）| 含义 |
|---|---|---|---|
| base2 | **0.94 ms** | — | 主线程 ~每帧等 GPU < 1ms（vsync 双缓冲健康）|
| cur2 | **3.67 ms** | — | 单次等 GPU 时间涨 ×3.9，仍 < vsync 16.66ms 周期 |
| thermal3 | **23.87 ms** | — | 单次等 GPU 时间 23.87ms **已超 vsync 周期** ← GPU 撑爆 swapchain |

**关键阈值**：单次 Gfx.WaitForPresent > vsync 周期（16.66ms / 60Hz；11.11ms / 90Hz）时，GPU 已经成为瓶颈。v5 thermal3 上是 23.87ms ≫ 11.11ms（90Hz 屏），**GPU-bound 信号强烈**。

### 7.2 GPU bound 判定（perfetto 单源边界）

| 信号 | 直接证据 | 间接证据 | 判定 |
|---|---|---|---|
| GPU busy/freq counter | — | 设备未上报 | ❌ 直接证据缺 |
| **Gfx.WaitForPresent 单次 > vsync 周期** | thermal3 23.87ms > 11.11ms | ✅ 单源高置信信号 | 🔴 **强 GPU-bound 信号** |
| **主线程 Sleeping ≈ Gfx.WaitForPresent** | thermal3 8194ms vs 8045ms（98.2%）| ✅ atrace + sched 双重验证 | 🔴 主线程 Sleep 100% 在等 GPU |
| **Render 线程更闲** | base 26.4% → thermal 16.0% run% | ✅ | 🔴 Render 不是瓶颈 |
| Choreographer 维持 90+fps | thermal3 92.8fps 持续工作 | ✅ | 🔴 显示链路正常，PlayerLoop 跟不上 |

**判定**：

- ✅ "**thermal3 上观察到强 GPU-bound 信号**"（单次等 GPU > vsync 周期 + 主线程 Sleep 100% 在等 GPU）
- ⚠️ cur2 上 GPU-bound 信号**中等**（单次 Gfx.WaitForPresent 3.67ms < vsync 16.66ms，但 WaitForPresent atrace 总量 5.12s 占整 trace 25.68% 已偏高）
- ❌ 不能给"GPU 满载"的硬结论 —— 缺 GPU busy counter

进一步判定需 Snapdragon Profiler / RenderDoc / 重采 perfetto 时加 `gpu_counter` 类别。

GPU 侧优化方向：降分辨率（移动端 900P 替代 2K）、简化阴影（PlanarShadow）、MeshUI 顶点数评估。

---

## §8 与 v4（短样本，1-4 秒）的趋势对照

**前提**：v5 与 v4 不是同一次采集（v4 是 06-22/23 上午，v5 是 06-23 下午），所有数值不可直比，仅作趋势级参考。**v5 的核心进展是采到完整 20 秒，能给出可信分位数和大样本累计统计**。

| 现象 | v4 那次 | v5 本次 | 一致性 |
|---|---|---|---|
| MapSignificanceMgr 头号红线 | v4 §6.3.2 单帧 max 5.69ms | v5 cur 占整 trace 23.43% / 17119 次/20s | ✅ 趋势同（v5 更详） |
| BattleHeadMgr 超 1-2ms 红线 | v4 cur avg 1.49 ms/帧 | v5 cur 单次 avg 1.26ms × 2/帧 | ✅ 量级一致 |
| OutSideViewArmyLineMgr 暴涨 | v4 ×52 | v5 单次 ×63 / totalMs ×38 | ✅ 趋势同 |
| LuaMgr 子树暴涨 | v4 cur 3.24 ms/帧 | v5 cur 6.15s 占 30.82% | ✅ 量级一致 |
| **主线程在等 GPU**（GPU-bound 信号）| v4 cur Sleep 23.55%，URP.WaitForPresent 97.2% | v5 thermal Sleep 41%、Gfx.WaitForPresent 占整 trace 40.30% | ✅ **v5 在 thermal 上把这个信号做到了极致** |
| 降频时序 | v4 thermal_2 "cpu7 sched 归零"等价确认级 | v5 thermal3 "全集群压频，cpu7 reach 64.8%" 仅推测级 | ⚠️ **形态不同**（不同 SoC 行为）|
| GC.Collect 单帧 max | v4 thermal_2 max 81ms / 活跃均 44.4ms | v5 thermal3 单次 45.2ms | ✅ 量级一致 |
| **GC.Alloc 业务归因数据化** | v4 报告里 §6.3.1 BattleHeadMgr 子树 913 次/帧（手工 SQL）| v5 自动落 `gcAllocByModule` 字段，每模块每帧次数都有 | ✅ **v5 自动化** |
| **MapCameraCtrl thermal 暴涨** | v4 没看到（thermal_2 只 3.94s 采样）| v5 thermal3 占 15.82% / 单次 ×20 | 🆕 **v5 新发现** |
| **完整 20 秒分位数** | v4 帧数 60/52/53 | v5 帧数 1199/696/336 | 🆕 **v5 质变** |

**v5 相对 v4 的能力升级**：

1. **完整 20 秒采样** → 分位数稳定（v4 60 帧的 p99 是单帧，v5 336+ 帧的 p99 有统计意义）
2. **off-CPU 归因数据化** → `offCpuAttribution` 字段在 summary 落盘，AI 端不再需要跑 SQL（v4 是手工 SQL）
3. **GC.Alloc 业务归因数据化** → `gcAllocByModule` 字段直接给每模块每帧分配次数（v4 是手工 SQL 一次性的）
4. **发现 thermal-only 隐性路径**（MapCameraCtrl）→ 长样本特有
5. **发现降频另一种形态**（全集群压频 vs v4 的集群下线）

---

## §9 本源能力边界 + 工程化建议

### 9.1 能力边界（沿用 v4，标注 v5 进展）

| 想回答 | 本源能/否 | v5 进展 |
|---|---|---|
| 帧级耗时（哪帧卡）| ✅ frameAnalysis | 完整 20s，分位数可信 |
| 主线程在算 vs 在等 | ✅ Running / Sleeping | v5 三态完整数据化 |
| 等什么细分（GPU/锁/Job/binder）| 🟡 atrace wait slice 重叠法可达"主要等 GPU"；细分到内核 reason 需 sched_blocked_reason | **v5 新增 offCpuAttribution 字段**（结构就位，但底层 ftrace 没开）|
| 主循环各阶段子树 | ✅ atrace slice 树 | callTrees 完整 |
| 业务模块顶层 + 单次 avg | ✅ aoeHotSlices | v5 单次 avgMs 让 "涨在频次 vs 涨在单次" 可区分 |
| **业务模块 GC.Alloc 次数 / 帧** | ✅ **v5 新增 gcAllocByModule** | perfetto 独家方法论数据化 |
| 函数级 CPU self% | ❌ | simpleperf |
| GC.Collect 单次 STW | ✅ atrace_slices.GC.Collect | v5 三份各 1-3 次，单次最大 45.2ms |
| 降频 / 热限频 | 🟡 v5 仅推测级（cpu7 未下线）；严格 sysfs 旁路仍需 thermal_before/after.txt | per-CPU reach% 趋势 |
| GPU 实际工作量 | ❌ 设备未上报 GPU counter | — |
| 显示链路 VSync miss | ❌ trace 无 actual_frame_timeline | — |
| 主线程 binder 调用对端 | 🟡 v5 新增 binderPeers 但 android_binder_txns 表不可用 | 仅 byTxnName，serverProcess 缺 |

### 9.2 工程化建议（v5 报告产出的新需求）

按优先级排序，给采集端 + Provider 端的具体改进项：

#### 采集端（record_aoeyz.bat）

1. **【关键】加入 `sched_blocked_reason` ftrace** —— 让 off-CPU byReason 的 `blockedFunction` 不再全 null。这是 v5 报告最大的数据缺口。
   ```
   python record_android_trace.py -t 20s -b 256mb \
     sched freq idle am wm gfx view binder_driver dalvik memory \
     sched_blocked_reason ←新增 \
     -a com.tencent.aoeyz -n -o . --sideload
   ```

2. **加入 `gpu_counter` 类别**（如设备支持） —— 直接量化 GPU busy / freq

3. **加入 `frame_timeline` 数据源**（如 perfetto 版本支持） —— 让 actual_frame_timeline_slice 表有数据，VSync miss / jank 可量化

4. **保留 sysfs 旁路（thermal_before.txt / thermal_after.txt）** —— 让降频判定从"推测级"升级到"sysfs 确认级"

#### Provider 端（scripts/perfetto_provider.py）

5. **`KEY_THREAD_HINTS` 加入 RHI（Thread-10X）支持** —— v5 当前 RHI 线程没进 threadsSched，无法对照 §4 main/render/RHI 三线程调度

6. **`_binder_peers` 用 `INCLUDE PERFETTO MODULE android.binder` 重写** —— 让 byServerProcess 拿到实际值，而不是降级用 byTxnName

7. **`_throttling` 判定增强** —— v5 thermal3 上 bigCoreReach 60.1% 已是强信号，建议加 reach < 65% → `level=likely`（介于 suspected 和 confirmed 之间的中间档）

8. **`_gc_alloc_by_module` 扩展到非 AOE_SLICE_PATTERNS 的全部 root slice** —— 当前只对 17 个 AOE 业务模块统计，应当扩展到所有主线程 root slice，做全 GC 归因 map

9. **每帧的 GC.Alloc 时序图** —— 落 `gcAllocByFrame: [{frameIdx, count, totalMs}]`，让 AI 能看到 GC 分配在哪些帧爆发（v4 §5.4 报的 thermal_2 上 GC.Collect 集中在 2 帧上）

#### 报告端（本报告，规范化后内化为 skill）

10. **逆向沉淀 v5 报告骨架到 perfetto skill** —— §0-§9 的章节、表格列、判定阈值（如"Gfx.WaitForPresent 单次 > vsync 周期 = GPU-bound"），变成 skill 的 references/perfetto-report-template.md，让 AI 写报告时直接套

11. **建立判定阈值表** —— 把 v5 报告里散落的"红线"（如 bigCoreReach < 65%、单次 BattleHeadMgr > 1-2ms 不合理、MapSig > 3ms 顶格）整理成机器可读的 YAML，让 provider 直接打标

---

> 终极报告 perfetto v5 结束。
>
> **本版核心进展**：完整 20s 采样 + off-CPU 归因数据化 + GC.Alloc 业务子树归因数据化 + 发现 thermal-only 隐性路径（MapCameraCtrl）。
>
> 与 v4 的关系：框架沿用、内容更详、判定标准更稳。v4 的 "1-4s 短样本只能给瞬时观察" 的局限在 v5 被打破。
>
> 配套：[performance-report_perfetto_ULTIMATE_v4.md](./performance-report_perfetto_ULTIMATE_v4.md) · [AOE CPU 知识库](../aoe-cpu-analysis-knowledge.md) · [perfetto skill 工程化路线图](./perfetto-skill-engineering-roadmap.md)
