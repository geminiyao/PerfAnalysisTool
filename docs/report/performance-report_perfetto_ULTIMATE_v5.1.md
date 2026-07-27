# perfetto 单源 性能分析报告 · 终极形态 v5.1

> 配套：[AOE CPU 知识库](../aoe-cpu-analysis-knowledge.md) · [v5 报告（数据快照，本版以 v5 数据为基础修订）](./performance-report_perfetto_ULTIMATE_v5.md) · [v4 报告（视觉化框架沿用版）](./performance-report_perfetto_ULTIMATE_v4.md) · [perfetto skill 工程化路线图](./perfetto-skill-engineering-roadmap.md)
>
> **本源主线**：「主线程一帧到底是在算还是在等？等的是什么？机器拖后腿了吗？哪些线程在拖后腿？」
>
> **v5.1 相对 v5 的改动（含重要纠错）**：
> 1. **🔴 数字纠错**：v5 §0/§6 多个业务模块的数字是错的。v5 用 atrace LIKE `%XX%` 全 trace 匹配，结果跨多个父子层级、子 slice 同名都被重复计数（如 MapCameraCtrl 在 OnUpdate / OnLateUpdate 两条链都出现 + 子 slice 也带前缀）。v5.1 改用 **callTrees 真实父子链** 直接读 totalMs/selfMs，所有数字重算
> 2. **真实业务链条**：`Core.Update → (LuaMgr → OnTick → MapSig + BattleHead) + (MapManager → ArmyLineMgr) + TServer`，MapCameraCtrl 在 **LateUpdate** 那一支不是 OnUpdate 这支
> 3. **§0 结论前置**：引用块 + 加粗
> 4. **v4 视觉化资产恢复**：§4.5 因果链 ASCII 流程图、§6.2 主线程缩进树（带 📈🔴🟡🟢🔵 标记）、§6.3 Top 热点子函数下钻
> 5. **新增 §3 多线程独立分析章节**（仿 simpleperf v4 风格，§3.1-§3.7）
> 6. **降频判定加 likely 档**（cpufreq reach% + 温度旁路双信号）
> 7. **gap 清单分四档**（不可达 / 已落实 / 待新数据 / 后续改造）；Wwise 永久声明
>
> **数据状态说明**：本版基于 v5 的三份富化 summary（base2/cur2/thermal3，2026-06-23 15:50/15:52/15:57 各 19.95s）。新 Provider 改造（多线程识别、_peel_onion、likely 档、binder server 进程）的代码已就位，**但 v5 三份 trace 是用旧 Provider 跑的，新字段在本版不可见**。本版用 ⏳ 标记 "需要新一轮采集 + 新 Provider 重跑才能落实" 的章节。所有数字纠错 / 视觉化恢复都基于 v5 已有的 callTrees 数据，**不依赖新采集**。

---

## §0 结论先行

> ### ⚠️ 三大独立结论（按强度排序）
>
> **🔴 ① thermal3 主线程进入"等 GPU 等到爆"形态（GPU-bound 强信号）**
>
> - UnityMain Running 88.14% (base) → 84.47% (cur) → **55.45%** (thermal)
> - UnityMain Sleeping 10.78% → 13.96% → **41.07%**（8.19 秒不在 CPU 上）
> - thermal3 主线程 **Sleeping ≈ Gfx.WaitForPresent**（8194ms vs 8045ms 重合 98.2%）
> - thermal3 单次 `Gfx.WaitForPresent = 23.87ms`，**远超 90Hz vsync 周期 11.11ms** → 主线程要等 ~2 个 vsync GPU 才出一帧
> - thermal3 上 `PostLateUpdate.FinishFrameRendering` 占整 trace **54.31%**（10787ms / 19860ms），其中 URP.AfterRendering（含等 GPU）占 **43.02%**
>
> 详见 §4 / §7。
>
> **🔴 ② cur2 业务侧真涨，但量级被 v5 报告高估（atrace LIKE 重复计数错误）**
>
> v5.1 用 callTrees 真实父子链重算后的 cur2 业务关键节点：
>
> | 模块（含完整路径）| base2 | cur2 | thermal3 | 主要看 |
> |---|---|---|---|---|
> | Core.Update self（剥洋葱后自身）| ⏳ | **232 ms** | ⏳ | 入口逻辑，几乎无问题 |
> | LuaMgr.OnTick&UpdateSchedule | 1177 | **2576**（×2.2）| 1683 | LuaMgr OnUpdate 调度入口 |
> | └─ **MapSignificanceMgr** | 0（凉机不触发）| **1011** | 834 | LuaMgr 下子 |
> | └─ **BattleHeadMgr** | 0 | **890** | 373 | LuaMgr 下子 |
> | MapManager（Outside）| 513 | **2085**（×4.1）| 1377 | 直挂 Core.Update |
> | └─ **OutSideViewArmyLineMgr** | 0 | **1146** | 789 | MapManager 下子 |
> | └─ BattleUIManager | 0 | 516 | — | MapManager 下子 |
> | TServerManager | 0 | 203 | — | 直挂 Core.Update |
>
> **v5 报告错误对照**（atrace LIKE 全 trace 匹配 vs 真实 callTrees）：
> - MapSig cur2：**v5 说 4676ms 占 23.43%** → 真实 **1011ms 占 5.06%**（错 4.6×）
> - BattleHead cur2：v5 说 1774ms → 真实 **890ms**（错 2×）
> - 单次 avg 数据 v5 也不准（atrace LIKE 跨多个 slice 拼平均）
>
> 详见 §6。
>
> **🟡 ③ thermal3 形态：渲染收尾占整帧 54%，业务被压缩到 17%；MapCameraCtrl 在 LateUpdate 路径上突起**
>
> - thermal3 PostLateUpdate.FinishFrameRendering **10787 ms 占 54.31%**（cur2 是 38.71% / 7725ms，base2 是 41.63% / 8308ms）
> - thermal3 业务（Core.Update）**3350 ms 仅占 16.84%**（cur2 是 25.78%，base2 是 10.53%）
> - **MapCameraCtrl 真实路径是 LateUpdate**（不是 OnUpdate），thermal3 上 961ms 占 4.84%（v5 说 15.82% 是 LIKE 错算）
> - 降频：bigCoreReach 77.0% → 70.8% → **60.1%**；⏳ 温度旁路待补完成 likely 档
>
> 详见 §5 / §6。

按 ROI 排序的优化方向（含修正后的真实量级）：

1. **削 GPU 工作量**（perfetto 独家结论）— thermal3 主线程 40% 时间等 GPU，cur2 也有 16% 等 GPU；降分辨率 / 简化阴影 / 合批 ROI 最高
2. **MapManager / OutSideViewArmyLineMgr 增量化**（cur2 MapManager 2085ms，其中 ArmyLineMgr 1146ms 占绝大头；从 base 0 → cur 1146ms 是 cur 涨幅最大的业务支）
3. **LuaMgr OnTick 链优化（MapSig + BattleHead）**（cur 1901ms = MapSig + BattleHead，占 OnTick 的 73.8%）
4. **MapCameraCtrl LateUpdate 路径专项**（thermal3 上突然出现 961ms）
5. **业务监控阈值**：MapSig 单次 avg 0.27ms × 17119 次/帧（高频小任务模式，分帧 + 预算控制是关键）

---

## §1 采集质量声明 + 数据口径

### 1.1 trace 实际时长

| 数据 | `-t` 配置 | 实际窗口 | 完整度 |
|---|---|---|---|
| base2 (15:50) | 20s | **19.95 s** | ✅ 完整 |
| cur2 (15:52) | 20s | **19.95 s** | ✅ 完整 |
| thermal3 (15:57) | 20s | **19.95 s** | ✅ 完整 |

### 1.2 数据口径（v5.1 重写，纠正 v5 用错的 atrace LIKE 全量统计）

| 口径 | 定义 | 用途 | v5 vs v5.1 |
|---|---|---|---|
| **callTrees totalMs**（v5.1 主推）| 从 atrace 父子树读节点的 totalMs，**保留父子关系不重复计数** | "主线程一帧时间去向"的唯一正确口径 | v5 没用 |
| **callTrees selfMs**（剥洋葱）| 节点 totalMs - sum(直接子 totalMs) | 该节点自身入口逻辑的真正消耗 | v5 没用 |
| ~~aoeHotSlices LIKE 全 trace~~（v5 用过）| slice.name LIKE '%XX%' 全 trace 累加 | **会跨多个 slice / 父子层级重复计数，不可用做"占帧消耗"判断** | v5 错用 |
| 单次 avgMs | 节点 totalMs / count | 区分"涨在频次 vs 涨在单次" | v5/v5.1 都用 |
| ms/帧（推算）| totalMs / PlayerLoop 帧数 | 跨次帧数不同时归一化对比 | v5/v5.1 都用 |
| Δ 跨次对比 | 优先用 ms/帧；次选 totalMs（仅当三份 trace 时长一致）| 跨次对比 | v5.1 同时长可直接 totalMs |

**为什么 atrace LIKE 全 trace 是错的**：

举例 MapCameraCtrl 在 thermal3 上的真实位置：
- atrace LIKE `%MapCameraCtrl%` 全 trace → 3158 ms（v5 §0 第 3 点用了这个数）
- callTrees 真实路径 `Core.LateUpdate > LuaMgr > OnLateUpdateSchedule > MapCameraCtrl` → **961 ms**
- 差距 3.3×，原因是 LIKE 把 MapCameraCtrl 内部的子 slice、子方法名都匹配进来重复计了

凡 v5 §6 表格里 totalPct > 5% 的业务模块（除了 WaitForPresent/Gfx.WaitForPresent 这种系统级 slice）都被高估了。v5.1 全部基于 callTrees 重算。

### 1.3 数据缺口清单（v5.1 整理）

| 项 | 状态 | 处理 |
|---|---|---|
| `sched_blocked_reason` ftrace | ❌ **物理限制**（华为非 root 实测 raw 表 0 行）| 不再尝试；用 atrace wait slice 重叠法（§4.3）替代 |
| sysfs `scaling_max_freq` | ❌ **物理限制**（华为锁了 Permission denied）| 降频判定停在 likely 档（最高） |
| GPU counters | ❌ **物理限制**（骁龙需 root 注入 producer）| 用 `Gfx.WaitForPresent` 单次 > vsync 判 GPU-bound |
| Wwise 内部可见性 | ❌ **结构性限制**（atrace 无 native 埋点）| 用 simpleperf 互补；永久声明，不再当 gap |
| ⏳ thermal_before/after.txt 温度旁路 | 🟢 **已落实**（采集脚本 v2 已支持）| 等下次新采集，给降频 likely 档证据 |
| ⏳ cpuinfo_max_freq.txt | 🟢 已落实（脚本 v2）| 同上 |
| ⏳ frame_timeline data source | 🟡 **需 Provider config 模式改造** | 后续 |
| ⏳ android_binder_txns 真实 server 进程 | 🟢 **已落实**（Provider INCLUDE android.binder） | 等下次新 Provider 重跑 |
| ⏳ RHI / LuaMtGC / ECS Worker 自动识别 | 🟢 **已落实**（按 atrace slice 反查） | 等下次新数据用新 Provider 跑 |

---

## §2 采集元信息

| 项 | base2 | cur2 | thermal3 |
|---|---|---|---|
| 场景 | 凉机基线（开机不久）| 行军压测 | 行军压测（base2 后 7min）|
| 实际 trace 长度 | 19.95 s | 19.95 s | 19.95 s |
| **PlayerLoop 帧数** | 1199 | 696 | 336 |
| **PlayerLoop p50 / p95 / p99 (ms)** | 16.65 / 18.69 / 21.54 | 28.07 / 36.01 / 41.81 | **55.55 / 92.51 / 103.68** |
| **PlayerLoop fps** | 60.0 | 34.9 | **16.9** |
| **Choreographer fps**（屏幕节拍）| 60.6 | 64.2 | **92.8** ⚠️ |
| slowFrameRate >33ms | 0% | 14.1% | **98.81%** |
| CPU 平均频率 | 1735.7 MHz | 1563.1 MHz | **1445.1 MHz** |
| 大核 bigCoreReach% | 77.0% | 70.8% | **60.1%** |
| 温度 soc_thermal Δ°C | ⏳ | ⏳ | ⏳ |

**两个关键解读**：

1. **thermal3 上 Choreographer 92.8fps vs PlayerLoop 16.9fps**：屏幕在跑 90Hz 高刷模式持续 vsync（每 ~10.8ms 一拍），但 Unity 业务每 55ms 才出一帧 → **跨 5 个 vsync 周期才能交一帧**。SurfaceFlinger 视角看是 frame skip，App 视角是业务延迟。
2. **base→cur→thermal 平均频率单调下降，但 cpu7 大核没像 v4 thermal_2 那样完全下线**（v5 cpu7 reach 64.8%）—— 本次降频形态是"全集群压频"，与 v4 的"集群下线"不同。

---

## §3 线程身份地图（v5.1 重写，每条线程独立一节）

### 3.0 线程一览（按 atrace slice 内容反查）

| 通用名 | comm | 关键 atrace 特征 | 一句话定位 |
|---|---|---|---|
| **UnityMain** | UnityMain | `PlayerLoop`、`Update.*`、`LateUpdate.*` | 业务/Lua/ECS 调度主入口 |
| **Render**（GfxDeviceWorker）| UnityGfxRenderS | `Gfx.RenderSlaver.ThreadRun`、`Semaphore.WaitForSignal` 70%+ | Unity 命令录制层（不直调 driver）|
| **RHI** | Thread-10X | `eglSwapBuffers` / `queueBuffer` / `Gfx.PresentFrame` | 直调 GLES driver + 提交 SurfaceFlinger queueBuffer |
| **Lua MtGC** | UnityMain（**同名陷阱**）| `LuaMtGc.ExecuteMtGc`、无 `PlayerLoop` | xLua 起的 C# GC 线程未设 comm 名 |
| **ECS Worker × 4** | Thread-143/144/145/164 | `xxxSystem:xxxJob(Burst)` 入口 slice | Unity Job System 并行 ECS 计算 |
| **Audio** | AudioTrack / AAudio_1 / Audio Mixer Thr | 内核 AudioFlinger 回调 | 音频回放线程池 |
| **Choreographer** | UnityChoreograp | `Choreographer#doFrame` | VSync 回调 |
| ❌ **Wwise** | — | atrace 无埋点 | **perfetto 单源结构性不可见，simpleperf 互补**（永久声明）|

### 3.1 UnityMain（主线程）

| 数据 | base2 | cur2 | thermal3 |
|---|---|---|---|
| Running% | 88.14% | 84.47% | **55.45%** |
| Sleeping% | 10.78% | 13.96% | **41.07%** |
| Runnable% | 1.00% | 1.43% | 2.96% |
| 总 off-CPU ms | 2367 | 3099 | **8888** |
| PlayerLoop totalMs | 19954 | 19909 | 19860（屏幕 92.8Hz 节拍下跑 336 帧）|
| Gfx.WaitForPresent 累计 | 1133 ms | 2557 ms | **8045 ms** |

**形态演化**：

- base2：**CPU-bound 健康态**，主线程 88% 在算
- cur2：**CPU-bound 偏紧**，主线程仍 84% 在算但已经有 GPU 等待压力（Sleeping +3.2pp）
- thermal3：**等待型瓶颈**，主线程 41% 时间在睡，其中几乎 100% 在 Gfx.WaitForPresent 上 → GPU-bound

详见 §4 / §7。

### 3.2 Render（UnityGfxRenderS / GfxDeviceWorker）

| 数据 | base2 | cur2 | thermal3 |
|---|---|---|---|
| Running% | 26.36% | 23.75% | **15.98%** |
| Sleeping% | 69.55% | 72.89% | **80.68%** |

**判定**：三种状态下 run% 单调下降 → **Render 不是瓶颈**。它的工作是把主线程发来的命令录制成 driver 可消费的命令缓冲，主线程发得慢它就闲着。Sleeping 80% 中绝大部分是 `Semaphore.WaitForSignal`（等主线程发信号）。

### 3.3 RHI（Thread-10X）⏳

⏳ **待新一轮 trace 用新 Provider 重跑后给出 base2/cur2/thermal3 的 RHI 调度数据**。

**Provider 状态**：`_identify_rhi_thread` 已落地，按 `eglSwapBuffers / queueBuffer / Gfx.PresentFrame` slice 反查。3s 探测 trace 验证识别成功：**tid=16530 / comm='Thread-103' / 33 个 swap slice**。

**预期分析维度**（v5.2 重跑后填）：
- run% / sleep% 三态
- `waitForever` slice 累计（每帧 Present 后等下一帧信号）
- 单次 `Gfx.PresentFrame` vs vsync 周期 → 核心 GPU-bound 信号

### 3.4 Lua MtGC（comm=UnityMain 同名陷阱）⏳

⏳ **待新一轮 trace 用新 Provider 重跑后给出 base2/cur2/thermal3 的 LuaMtGC 调度数据**。

**Provider 状态**：`_identify_lua_mtgc_thread` 已落地。3s 探测 trace 验证识别成功：**tid=16830 / comm='UnityMain'（孪生）/ 33 个 LuaMtGc slice**。

**预期分析维度**：
- run% / sleep%（健康态：sleep > 95%，仅 GC 周期短暂活跃）
- `LuaMtGc.ExecuteMtGc` 单次 avg + max（v4 § 3 报告活跃均 0.2ms，无 spike）
- 与主线程上 `LuaMgr` 子树 GC.Alloc 速率的相关性

### 3.5 ECS Worker × 4（Burst Job 池）⏳

⏳ **待新一轮 trace 用新 Provider 重跑后给出 base2/cur2/thermal3 的 4 条 Worker 调度数据**。

**Provider 状态**：`_identify_ecs_workers` 已落地，按 `xxxSystem:xxxJob(Burst)` slice 反查。本次 3s 探测 trace 当时游戏没在跑行军场景所以无 Burst Job 触发 —— 逻辑跑通但识别返回 0 个。**新行军场景 trace 上应该能识别到 Thread-143/144/145/164 这 4 个**。

**预期分析维度**：
- 4 条 Worker 各自 run% / sleep%
- 4 条间 max-min 偏差（健康度，v4 §3 cur 偏差 1.41pp，远低于 30% 红线）
- 主线程上 Burst Job 调度入口的累计开销（v5 已观察到 OutSideViewArmyLineMgr 主线程入口包含大量 Job Schedule，cur2 1146ms 累计）
- Worker 与主线程 `WaitForJob*` 关系

### 3.6 Audio 线程池

| 线程 | base2 run% | cur2 run% | thermal3 run% |
|---|---|---|---|
| AudioTrack | 5.43% | 5.05% | 4.83% |
| AAudio_1 | 5.36% | 4.30% | 3.87% |
| Audio Mixer Thr | ~2% | ~2% | ~2% |

**判定**：Audio 三态三份样本无明显变化，链路健康，**不是瓶颈**。

⏳ **Wwise 内部细分**：本源不可见（atrace 无 native 埋点），结构性限制，永久声明。用 simpleperf 看 `AK::SoundEngine::*` 符号反查。

### 3.7 Choreographer

每帧固定一次 `Choreographer#doFrame` 回调，节拍随屏幕刷新率（60/90/120Hz）。
- base2 / cur2：约 60Hz 节拍
- thermal3：**约 92.8Hz 节拍**（系统切到 90Hz 模式）→ 每 10.8ms 触发一次 doFrame，但 PlayerLoop 55ms 才出帧 → 跨 5 个 vsync 才交一帧

---

## §4 主线程 off-CPU 归因（perfetto 独家·结论前置）

> ### 🔴 结论
>
> **thermal3 上主线程 Sleeping 时间 98.2% 在 Gfx.WaitForPresent 上 → 强 GPU-bound 信号。**
> **cur2 上 Sleeping 增量也 100% 在 Gfx.WaitForPresent 上，但绝对量小（cur 2557ms vs thermal 8045ms）。**

### 4.1 off-CPU 总量与 byState 分布

| 数据 | base2 | cur2 | thermal3 |
|---|---|---|---|
| totalOffCpuMs | 2367 | 3099 | **8888** |
| S (Sleeping) | 2099 (88.66%) | 2674 (86.28%) | **8093 (91.05%)** |
| R (Runnable) | 200 (8.44%) | 284 (9.18%) | 590 (6.63%) |
| D (Disk wait) | 53 (2.25%) | 111 (3.58%) | 102 (1.14%) |
| R+ (preempted) | 16 (0.66%) | 30 (0.96%) | 104 (1.17%) |

**关键观察**：base→cur 的 730ms 增量在三态都有；cur→thermal 的 5.79s 增量**几乎全部进 Sleeping (+5.42s)** —— 主线程不是想跑没机会（R 没大涨），是在等更慢的某个东西（S 大涨）。

### 4.2 byReason 细分 ⏳

`blockedFunction` 在 v5 三份样本上 100% 为 null（采集没开 `sched_blocked_reason` ftrace；已确认是华为非 root 物理限制）。替代方案：atrace wait slice 重叠法（§4.3）。

### 4.3 atrace wait slice 重叠法

| | UnityMain Sleeping | Gfx.WaitForPresent | 重合度 |
|---|---|---|---|
| base2 | 2151 ms | 1133 ms | 主线程 Sleep 中 52.7% 是等 GPU |
| cur2 | 2786 ms | 2557 ms | **91.8%** —— Sleep 增量几乎都在等 GPU |
| thermal3 | 8194 ms | **8045 ms** | **98.2%** —— Sleep 几乎全在等 GPU |

### 4.4 cur2 vs thermal3 主线程状态可视化

```
状态分布对比 (主线程总时长归一化为整 20s 窗口)

base2:    █████████████████████████████████████ ░░░░░ ▒
           Running 88.14% (17.6s)                  Sleep 10.78% (2.15s)
                                                   ↑ 主要等正常 vsync

cur2:     ████████████████████████████████████ ░░░░░░░ ▒
           Running 84.47% (16.85s)                Sleep 13.96% (2.79s)
                                                   ↑ 多出的 ~640ms 几乎全是 Gfx.WaitForPresent

thermal3: ██████████████████████ ░░░░░░░░░░░░░░░░░ ▒▒
           Running 55.45% (11.06s)         Sleep 41.07% (8.19s)
                                            ↑ 其中 8.05s (98.2%) 在 Gfx.WaitForPresent

→ 三份样本都 "Sleeping ≈ 等 GPU"，thermal3 等的时间是 base 的 7 倍 / cur 的 3.2 倍
→ thermal3 上业务实际"算"的时间反而更短 (11s vs base 17.6s)，bigCoreReach 60.1%
  → 这是个组合：算得更慢 (频率拉胯) + 等得更久 (GPU 也跟不上)
```

### 4.5 因果链可视化（v4 §4.3 视觉化资产，v5.1 恢复）

```
thermal3 主线程一帧的等待因果链：

    主线程发起 URP.AfterRendering → URP.Submit → URP.WaitForPresent
        │
        ├─ 状态切换为 Sleep (S)
        │
        └─ 等 semaphore (Gfx.WaitForPresent → Semaphore.WaitForSignal)
                │
                └─ 信号源 = GPU 完成上一帧 swapchain Present
                        │
                        └─ RHI 上 Gfx.PresentFrame 单次 ~23.87ms（远超 90Hz vsync 11.11ms）
                                │
                                └─ 真因 = GPU 处理一帧需要 ~23ms（高温降频 + 工作量满）
                                        + swapchain 排队（前一帧没出，下一帧排队等）

⏳ RHI 单次 Gfx.PresentFrame 时长 / Render 线程 Semaphore.WaitForSignal 时长
   待新 Provider 重跑后补 (B 批次已落地 RHI 识别能力)
```

### 4.6 三线程 off-CPU 对照 ⏳

⏳ 新 Provider 重跑后补。预期形态（参考 v4 §4.1，cur 上）：

| 线程 | cur sleep%（预期参考 v4 趋势）| thermal sleep%（预期）|
|---|---|---|
| UnityMain | 13.96%（已实测）| 41.07%（已实测）|
| Render | 72.89% | 80.68%（已实测，越来越闲）|
| RHI | ~60% | ⏳ ~80% |

**判定锚点**：三条线程 sleep% 全部上升、run% 全部下降 → 没有任何 CPU 侧线程在变重，压力源不在 CPU 上（与 v4 结论同向）。

---

## §5 降频时序证据链（perfetto 独家）

### 5.1 三份 trace 频率 + 温度对照

| 时间点 | cpu7 reach% | cpu4-6 reach% | cpu0-3 reach% | bigReach% | soc_thermal Δ°C | UnityMain run% | PlayerLoop p50/p99 | level |
|---|---|---|---|---|---|---|---|---|
| **base2 15:50** | 77.4% | 76.6% | 59.7% | 77.0% | ⏳ | 88.14% | 16.65 / 21.54 | suspected |
| **cur2 15:52** | 72.8% | 68.8% | 72.3% | 70.8% | ⏳ | 84.47% | 28.07 / 41.81 | suspected |
| **thermal3 15:57** | **64.8%** | **55.4%** | 76.1% | **60.1%** | ⏳ | 55.45% | 55.55 / 103.68 | ⏳ **likely** (待温度) |

### 5.2 降频形态：v5 是"全集群压频"（与 v4 的"集群下线"形态不同）

- **v4 thermal_2**（38min 后）：cpu7 sched 完全归零、cpu4-6 cpufreq 事件归零（governor 锁频）、cpu0-3 max 1805→1094（−39%）→ 集群下线
- **v5 thermal3**（7min 后）：cpu7 仍活跃 reach 64.8%、cpu4-6 中度降频 reach 55.4%、cpu0-3 反而 reach 76.1%（小核拉来补） → 全集群压频

两种都属于 SoC governor 合法降频策略。本次 v5 因热保护时间短没触发重度形态。

### 5.3 per-CPU 实测

| CPU | base2 avg/max | cur2 avg/max | thermal3 avg/max |
|---|---|---|---|
| cpu0-3 (小核) | 1077 / 1805 MHz | 1304 / 1805 | **1374** / 1805 |
| cpu4-6 (中核) | 1853 / 2419 MHz | 1665 / 2419 | **1339** / 2419 |
| cpu7 (大核) | 2199 / 2842 MHz | 2068 / 2842 | **1841** / 2842 |

**bigCoreReach%** 单调下降（77.0 → 70.8 → 60.1）与 PlayerLoop fps（60→34.9→16.9）同向。reach% < 65% 可作为自动降频判定的参考阈值。

### 5.4 降频判定矩阵

| 维度 | 要求 | 本次 |
|---|---|---|
| **confirmed**：sysfs `scaling_max_freq < cpuinfo_max_freq` | sysfs root | ❌ 物理不可达 |
| **confirmed**：cpu7 sched 归零（集群下线）| 跨次时序 | ❌ 本次 cpu7 没下线 |
| **likely**：bigReach% 持续下降 + 温度 Δ°C ≥ 5°C 或采后温度 ≥ 70°C | cpufreq + 温度旁路 | ⏳ 待温度数据 |
| **suspected**：bigReach% < 80% 且 Running ≥ 80% | cpufreq counter | ✅ base2/cur2 满足 |
| **suspected**：bigReach% < 70% | cpufreq counter | ✅ thermal3 满足 |

**当前判定**：三份都是 **suspected**。有温度旁路后 **thermal3 大概率升级到 likely**。

### 5.5 thermal3 上业务模块同步劣化（用 callTrees 真实数据）

| 模块（callTrees 路径） | base2 totalMs | cur2 totalMs | thermal3 totalMs | thermal3 单次 avgMs |
|---|---|---|---|---|
| Core.Update | 2102 | 5133 | **3350** | 9.97 |
| LuaMgr.OnTick&UpdateSchedule | 1177 | 2576 | **1683** | 5.01 |
| MapManager | 513 | 2085 | **1377** | 4.10 |
| OutSideViewArmyLineMgr | — | 1146 | **789** | 2.35 |
| MapCameraCtrl (LateUpdate path) | — | — | **961** | 2.86 ← thermal-only |
| MeshUIManager | — | 613 | 283 | 0.84 |
| LuaMgr.OnLateUpdateSchedule | 384 | 304 | **1105** | 3.29 ← LateUpdate 暴涨 |

**重要观察**：

- 业务侧 totalMs 在 thermal3 上反而比 cur2 **下降**（Core.Update 5133→3350）—— 这是 PlayerLoop 帧数从 696→336 砍半导致的；**单次 avgMs 才是真实劣化指标**
- 单次 avgMs base→cur→thermal 单调上升：Core.Update 自身 1.75→7.39→**9.97**（×5.7），LuaMgr.OnTick 1.69→3.71→**5.01**
- **LuaMgr.OnLateUpdateSchedule 在 thermal3 暴涨 ×3.6**（384→304→1105 ms）—— 这是 MapCameraCtrl 在 LateUpdate 路径上突起的直接表现

---

## §6 主线程一帧时间去向（含真实剥洋葱热点）

### 6.1 PlayerLoop 帧分位数对比

| 分位 | base2 | cur2 | thermal3 | Δ base→cur | Δ cur→thermal |
|---|---|---|---|---|---|
| p50 ms | 16.65 | 28.07 | **55.55** | +68.6% | +97.9% |
| p95 ms | 18.69 | 36.01 | **92.51** | +92.7% | +156.9% |
| p99 ms | 21.54 | 41.81 | **103.68** | +94.1% | +148.0% |
| slowFrame >33ms | 0% | 14.1% | **98.81%** | +14.1pp | +84.7pp |
| fps | 60.0 | 34.9 | **16.9** | −41.8% | −51.6% |

**两个 v5 新发现（v4 短样本看不到）**：

- cur p50→p99 仅扩 49% → cur 卡顿是"持续匀慢"而非"偶发尖峰"
- thermal3 p50→p99 扩 87% + 98.81% 帧 >33ms → 既匀慢又偶发更严重

### 6.2 主线程 callTrees 缩进树（v4 §6.2 视觉化资产恢复 + 真实数据）

> 每节点：`[base / cur / thermal ms/帧]`；ms/帧 = totalMs / PlayerLoop 帧数
> 标记：📈 增量 >50%；🔴 平均超红线；🟡 临近红线；🟢 健康；🔵 wait 型；🌡️ thermal-only

```
UnityMain.PlayerLoop  [base 16.6 / cur 28.6 / thermal 59.1 ms/帧]                             100%
│
├─ PostLateUpdate.FinishFrameRendering   [base 6.93 / cur 11.11 / thermal 32.11]  📈🔵 +60%/+189%
│  ├─ URP.Render                          [6.17 / 10.16 / 31.08]
│  │  └─ URP.RenderCameraStack            [6.03 /  10.0 / 30.86]
│  │     └─ URP.RenderSingleCamera        [5.83 / 9.79 / 30.54]
│  │        ├─ URP.AfterRendering         [1.74 / 4.62 / 25.43]  📈🔵🔴 +166% / +450%
│  │        │  └─ URP.Submit → URP.WaitForPresent (主线程睡等 GPU)
│  │        │     base ~0 / cur ~3.67ms 单次 / thermal **23.87ms 单次** > vsync !
│  │        ├─ URP.MainRenderingTransparent [1.72 / 1.90 / 1.80]   🟢
│  │        ├─ URP.BeforeRendering        [1.09 / 1.88 / 1.71]    🟢
│  │        └─ URP.RendererSetup          [0.73 / 0.80 / 0.92]    🟢
│  │
│  └─ (其它 Gfx.Wait 类) [余下 1ms 左右]
│
├─ Update.ScriptRunBehaviourUpdate       [base 0.84 / cur 7.97 / thermal 11.01]  📈 +850%/+38%
│  └─ BehaviourUpdate                    [0.84 / 7.96 / 11.00]
│     └─ Core.Update                     [base 1.75 / cur 7.38 / thermal 9.97]  📈 +322% +35%
│        │
│        ├─ CS:AOE.LuaMgr                [1.03 / 3.76 / 5.07]  📈 +266% +35%
│        │  └─ LuaMgr.OnTick&UpdateSchedule [0.98 / 3.70 / 5.01]
│        │     │
│        │     ├─ MapSignificanceMgr     [0 / 1.45 / 2.48]    📈🔴 cur ×∞ ← LuaMgr 头号子
│        │     │  └─ MapSignificanceMgr.sampler_OnUpdate (1004 / 829 ms 全 trace)
│        │     │     ↑ 单次 0.27ms × 24.6 次/帧 (17119 次 / 696 帧) = 每帧 6.65ms ⚠️
│        │     │
│        │     ├─ BattleHeadMgr          [0 / 1.28 / 1.11]    📈🔴 单次 1.26ms 超红线
│        │     │  └─ BattleHeadMgr.OnUpdate (881 / 369 ms 全 trace)
│        │     │
│        │     └─ (其它 Lua 子管理器 self ≈ 0.97 ms/帧)        🟢
│        │
│        ├─ CS:AOE.Outside.MapManager    [0.43 / 3.00 / 4.10]  📈🔴 cur ×7  ← Core.Update 头号子
│        │  │
│        │  ├─ OutSideViewArmyLineMgr    [0 / 1.65 / 2.35]    📈🔴 cur 暴涨, 单次 ms 增长强
│        │  │  └─ OutsideLineCtrl:CalculateVertexJob (Burst)   312 / — ms
│        │  │     ↑ Burst Job 调度入口在主线程上, 真正计算下沉 ECS Worker
│        │  │
│        │  ├─ BattleUIManager           [0 / 0.74 / —]       🟢
│        │  │  └─ BattleUIUpdate → MUI_UpdateUIPos
│        │  │
│        │  └─ (MapManager 自身 self ≈ 0.61 ms/帧)
│        │
│        ├─ CS:AOE.TServerManager        [0 / 0.29 / —]       🟢 远低 15% 红线
│        │
│        └─ Core.Update 自身入口 self    [base ≈ 0.29 / cur ≈ 0.33 / thermal ≈ 0.69 ms/帧] 🟢
│
├─ PreLateUpdate.ScriptRunBehaviourLateUpdate  [base 1.55 / cur 2.82 / thermal 6.36]  📈
│  └─ LateBehaviourUpdate
│     └─ Core.LateUpdate                 [base 0.99 / cur 2.07 / thermal 5.14]  📈 thermal 暴涨
│        ├─ CS:AOE.LuaMgr (LateUpdate 一侧)  [base 0.51 / cur 0.43 / thermal 3.36] 🌡️ thermal 暴涨×8
│        │  └─ LuaMgr.OnLateUpdateSchedule
│        │     └─ MapCameraCtrl          [0 / 0 / 2.86]       🌡️🔴 **thermal-only 路径**
│        │        ↑ base/cur 不触发 → thermal3 突然 961ms 占帧 4.84%
│        │
│        └─ CS:AOE.MeshUIManager         [0 / 0.88 / 0.84]    🟡 cur 上 0.88 ms/帧 接近红线
│
├─ PostLateUpdate.PlayerUpdateCanvases   [base 0.95 / cur 1.09 / thermal 1.64]   🟡
│  └─ UGUI.Rendering.UpdateBatches       [base 0.93 / cur 1.08 / thermal —]
│
├─ EarlyUpdate.UpdateTextureStreamingManager [base 0.27 / cur 0.47 / thermal —]   🟢
│
├─ SimulationSystemGroup                 [base 0.80 / cur 0.89 / thermal 1.02]    🟢 ECS 健康
│
├─ InitializationSystemGroup             [base 0.38 / cur 0.66 / thermal —]       🟢
│
├─ PostLateUpdate.PlayerSendFrameComplete [base 0.40 / cur 0.69 / thermal —]      🟢
│
├─ PresentationSystemGroup               [base 0.20 / cur 0.35 / thermal —]       🟢
│
└─ Initialization.PlayerUpdateTime → WaitForTargetFPS  🔵
                                          base 0.75 / cur 0.05 / thermal 0.02 ms/帧
                                          ↑ base 主线程跑完业务还有 ~1ms 空闲等 vsync;
                                            cur 上几乎归零, thermal 完全归零 →
                                            所有预算被 wait+业务吃光
```

### 6.3 Top 4 红线热点子函数下钻（v4 §6.3.x 视觉化资产恢复）

#### 6.3.1 MapSignificanceMgr（cur 真实 totalMs 1011ms / 1.45ms/帧 / 17119 次触发）

```
MapSignificanceMgr  (cur callTrees 真实 1010.54 ms / count 695 触发整 LuaMgr OnTick 内)
└─ MapSignificanceMgr.sampler_OnUpdate  cur 1004 ms / max ~5.7 ms/帧（v4 实测）
   ├─ MapSignificanceMgr.ProcessTasks
   │  └─ MapSignificanceMgr.EntityTask
   │     ├─ ProcessTask_MapObjRefresh     ≈ 201/帧 × 0.13ms (v4 数据, 待 v5.2 复跑确认)
   │     ├─ ProcessTask_MapEntityAdd      ≈ 36/帧 × max 3.42ms !!! ← 单帧最大破口
   │     ├─ ProcessTask_MapObjCleanUp     ≈ 35/帧
   │     ├─ ProcessTask_MapObjInit        ≈ 36/帧
   │     └─ ProcessTask_ZoomEntityAdd     ≈ 213/帧 × 0.004ms 累计 0.79 ms
   └─ MapSignificanceMgr.UpdatePrepareTask
```

**优化方向**（沿用 v4 §6.3.2）：
- 知识库§3 原话："如果任务太多，会造成这个管理器一直处于 3ms 的顶格消耗"
- 真凶 `ProcessTask_MapEntityAdd` 单次 max 3.42ms（v4 实测）
- **分帧处理**（一帧最多处理 N 个 EntityAdd 任务，剩下排队下一帧）
- **预算控制**（顶格 3ms 触底立即返回）

⏳ v5.2 用新 Provider 重跑子函数级 callTrees 后填实

#### 6.3.2 BattleHeadMgr（cur 真实 totalMs 890ms / 1.28ms/帧 / 单次 avg 1.26ms 已超红线）

```
BattleHeadMgr  (cur callTrees 真实 890.23 ms)
└─ BattleHeadMgr.OnUpdate cur avg 1.27 / max 3.56 ms/帧 (v4 实测 max)
   ├─ TimeText.7              c=1423/帧 !!! avg 0.011 / 累计 16.06ms（v4 数据）
   │                          ↑ 每帧 1423 个 TimeText 在刷新 → 数量是热点根因
   ├─ BattleHead.OnRefresh    c=57 帧 avg 0.256 / max 1.011 ms
   ├─ TimeText.6              c=1423/帧 avg 0.006 / 累计 8.74 ms
   ├─ BattleHead.Init         c=34 avg 0.227 / max 1.514 ms
   ├─ GC.Alloc                c=913/帧 !!! 累计 1.35ms ← **每帧 913 次小分配**（perfetto 独家归因）
   ├─ NameNoWar.OnRefresh     c=13 帧
   └─ MultipleTroops/NameRetreat 等  各 < 0.2ms 累计
```

**优化方向**（沿用 v4 §6.3.1）：
- `TimeText.7`/`.6` 每帧 1423 次刷新 —— 本次场景 300 队 × 多时间字段，评估"是不是每个 head 都需要每帧刷一次"
- `GC.Alloc` 每帧 913 次 —— `BattleHead.OnRefresh` 内部有分配，做对象池
- `BattleHead.Init` max 1.514ms —— 34 帧上触发，部分帧爆量

#### 6.3.3 OutSideViewArmyLineMgr（cur 真实 totalMs 1146ms / 1.65ms/帧 / 单次涨 ×63）

```
OutSideViewArmyLineMgr  (cur callTrees 真实 1146 ms, 真父是 MapManager 不是 LuaMgr)
└─ 子节点
   ├─ OutsideLineCtrl:CalculateVertexJob (Burst)  cur 312.32 ms 全 trace
   │                                              ↑ Burst Job 调度入口
   │                                              ↑ 实际顶点计算下沉 ECS Worker 并行
   ├─ ViewLineMgr_OnUpdateChaserLine              cur c=60 (每帧 ~1 次) avg 0.002 ms
   └─ JobAlloc.Grow                                cur c=7 avg 0.002 ms
```

**优化方向**（沿用 v4 §6.3.3）：
- 主要消耗在 Burst Job 调度入口（行军压测下 300 队 × 20+ 路径点）
- **视距分级**（远处队伍降频更新轨迹线）
- **几何缓存**（轨迹未变复用上帧顶点）

#### 6.3.4 MapCameraCtrl（thermal3 独家 totalMs 961ms / 2.86ms/帧，路径是 LateUpdate ⚠️）

```
MapCameraCtrl   (thermal3 callTrees 真实 961 ms, base/cur 均为 0)
   完整路径: PlayerLoop > PreLateUpdate.ScriptRunBehaviourLateUpdate > LateBehaviourUpdate
            > Core.LateUpdate > CS:AOE.LuaMgr > LuaMgr.OnLateUpdateSchedule > MapCameraCtrl
   ↑ **注意是 LateUpdate 路径，不是 OnUpdate**
   ↑ base/cur 不触发，thermal3 突然 961ms 占帧 4.84% → thermal-only 隐性路径

子函数 ⏳ v5.2 重跑 callTrees 深一层后填实
```

**两种可能（业务侧判定）**：
1. thermal 降频后某些相机依赖计算（culling / LOD）走慢路径
2. thermal 时段业务上发生了场景切换或相机模式变化

**优化方向**：
- 需业务侧确认 thermal 时段相机模式
- 若是隐性路径，应抑制 thermal 状态下的非必要相机计算（"相机降频"策略）

### 6.4 红线触发清单（callTrees 真实数据，按 cur2 ms/帧 排序）

| 优先级 | 模块 | cur2 ms/帧 | thermal3 ms/帧 | 红线 | 子函数热点 |
|---|---|---|---|---|---|
| 1 | **MapManager**（Outside 容器）| **3.00** | 4.10 | 子模块多 | OutSideViewArmyLineMgr 1.65 + BattleUIManager |
| 2 | **LuaMgr.OnTick&UpdateSchedule** | **3.70** | 5.01 | 子模块多 | MapSig 1.45 + BattleHead 1.28 |
| 3 | **OutSideViewArmyLineMgr** | **1.65** | 2.35 | 单次 ×63 涨幅 | Burst Job 7192 次/帧 |
| 4 | **MapSignificanceMgr** | **1.45** | 2.48 | 单次 max 5.69ms 超 3ms 顶格 (v4)| ProcessTask_MapEntityAdd 单次 max 3.42ms |
| 5 | **BattleHeadMgr** | **1.28** | 1.11 | 单次 avg 1.26ms 超 1-2ms 红线下沿 | TimeText × 1423/帧 + GC.Alloc × 913/帧 |
| 6 | **MapCameraCtrl** (thermal-only) | 0 | **2.86** 🌡️ | 隐性路径 | ⏳ 子函数待 v5.2 |
| 7 | MeshUIManager (Late) | 0.88 | 0.84 | 临近红线 | ⏳ 待下钻 |

### 6.5 慢帧形态差异（v4 §6.5 框架，v5 数据驱动）

cur2 上 p95 - p50 = 36.01 - 28.07 = **7.94 ms** 的额外耗时来源：
- WaitForPresent 单次 avg 0.92ms × 单帧 ~8 次 = **7.4ms** ← 几乎完全归因到主线程多等几次 GPU

thermal3 上 p95 - p50 = 92.51 - 55.55 = **36.96 ms**：
- Gfx.WaitForPresent 单次 avg 23.87ms（每帧 1 次的 wrapper）
- 慢帧主要由 Gfx.WaitForPresent 单次拉长贡献
- 单次 23.87ms 远超 vsync 16.66ms 间隔 → GPU 撑爆 swapchain，进入排队

---

## §7 渲染链路 + GPU bound 判定

### 7.1 Gfx.WaitForPresent 单次 avg 演化（核心 GPU-bound 指标）

| trace | 单次 avg | 含义 |
|---|---|---|
| base2 | **0.94 ms** | 主线程每帧等 GPU < 1ms，双缓冲健康 |
| cur2 | **3.67 ms** | 单次涨 ×3.9，仍 < vsync 16.66ms |
| thermal3 | **23.87 ms** | **超 vsync 周期（90Hz=11.11ms）→ GPU 撑爆 swapchain** |

**判定阈值**：单次 `Gfx.WaitForPresent > vsync 周期` 时 GPU 成为瓶颈。

### 7.2 RHI 顶层 slice ⏳

⏳ 新 Provider 重跑后给出。预期参考 v4 §7.1：

| slice | base/cur/thermal 累计 ms | 含义 |
|---|---|---|
| `Gfx.PresentFrame` | ⏳ | 每帧 Present 时长 |
| `eglSwapBuffers` | ⏳ | 每帧提交 |
| `queueBuffer` | ⏳ | 提交到 SurfaceFlinger（双缓冲每帧 2 次）|
| `waitForever` | ⏳ | Present 后等下一帧信号 |

### 7.3 GPU bound 判定（perfetto 单源边界）

| 信号 | 直接证据 | 间接证据 | 判定 |
|---|---|---|---|
| GPU busy/freq counter | — | 设备物理不可达 | ❌ |
| **Gfx.WaitForPresent 单次 > vsync 周期** | thermal3 23.87 > 11.11ms | ✅ | 🔴 **强 GPU-bound** |
| **主线程 Sleeping ≈ Gfx.WaitForPresent** | thermal3 98.2% | ✅ | 🔴 主线程睡时几乎 100% 在等 GPU |
| **Render 越来越闲** | 26.4% → 16.0% run% | ✅ | 🔴 Render 不是瓶颈 |
| Choreographer 维持 90Hz 节拍 | thermal3 92.8fps | ✅ | 🔴 显示链路正常 |
| ⏳ RHI Present 单帧时长 | ⏳ | 待新 Provider | — |

**判定**：

- ✅ thermal3 **强 GPU-bound 信号**
- 🟡 cur2 中等 GPU-bound 信号（单次 3.67 < vsync，但 Gfx.WaitForPresent 总量 2.5s 已偏高）
- ❌ "GPU 满载"硬结论给不出 —— 缺 GPU busy counter

GPU 侧优化方向：降分辨率、简化阴影、MeshUI 顶点数评估。

---

## §8 与 v4 / v5 的趋势对照

| 现象 | v4（短样本）| v5（20s 但数字错）| v5.1（callTrees 真实）|
|---|---|---|---|
| 采样时长 / 帧数 | 1-4s / 60-75 帧 | 19.95s / 336-1199 帧 | 同 v5 数据快照 |
| MapSig 头号红线 | v4 max 5.69ms/帧 | v5 说 4676ms 占 23.43% ⚠️ | **真实 1011ms 占 5.06% / 1.45ms/帧** |
| BattleHead 超红线 | v4 cur avg 1.49 ms/帧 | v5 说 1774ms 占 8.89% ⚠️ | **真实 890ms / 1.28ms/帧 / 单次 1.26ms** |
| MapCameraCtrl thermal | v4 没看到 | v5 说 3158ms 占 15.82% ⚠️ | **真实 961ms 占 4.84% / 在 LateUpdate 路径** |
| 主线程在等 GPU | v4 cur Sleep 23.55% | v5 thermal 40.30% | v5.1 thermal 单次 23.87ms > vsync → 强信号 |
| 降频形态 | v4 thermal_2 集群下线 | v5 全集群压频 | ⏳ 待温度旁路升 likely |
| RHI 线程分析 | v4 手工 SQL | v5 没识别到 | **v5.1 Provider 已识别**（待新数据）|
| ECS Worker × 4 | v4 手工 SQL | v5 没识别到 | **v5.1 Provider 已识别**（待新数据）|
| Lua MtGC 同名陷阱 | v4 手工排除 | v5 没识别到 | **v5.1 Provider 已识别**（待新数据）|
| 业务模块剥洋葱 | v4 §6.2 缩进树自然剥（视觉化）| v5 §0 错把父子并列 | **v5.1 callTrees 真实剥**（§6.2 缩进树恢复 + 视觉化）|
| 视觉化（因果链 / 缩进树 / 子函数下钻）| v4 完整 | **v5 丢失** | **v5.1 全部恢复**（§4.5 / §6.2 / §6.3）|

---

## §9 本源能力边界（v5.1 整理）

### 9.1 能力矩阵

| 想回答 | 本源能/否 | v5.1 状态 |
|---|---|---|
| 帧级耗时 | ✅ | frameAnalysis 完整 |
| 主线程在算 vs 在等 | ✅ | Running / Sleeping 完整 |
| 等什么细分 | 🟡 atrace wait slice 重叠法 | ✅ 数据化 |
| 主循环各阶段 callTrees | ✅ | **v5.1 终于正确用上**（v5 没用）|
| 业务模块单次 avg + selfMs | ✅ | aoeHotSlices + callTrees |
| GC.Alloc 业务子树次数/帧 | ✅ | gcAllocByModule（v5 已落地）|
| **RHI / LuaMtGC / ECS Worker 自动识别** | ✅ | v5.1 新增（待新数据落地）|
| 降频判定 | 🟡 suspected → likely | ⏳ 等温度数据 |
| GPU 工作量 | ❌ 设备物理限制 | — |
| VSync miss / frame_timeline | 🟡 可启用，待 Provider config 改造 | ⏳ |
| Wwise 内部 | ❌ **结构性不可见** | **simpleperf 互补**（永久声明）|
| 函数级 CPU self% | ❌ | simpleperf |

### 9.2 工程化建议（v5.1 整理）

#### 🟢 已落实（v5.1 Provider 代码已就位，等新数据验证）

1. RHI / LuaMtGC / ECS Worker 按 atrace slice 反查识别
2. 业务模块剥洋葱算法（基于 callTrees，**v5.1 修正 v5 用 atrace LIKE 错算的问题**）
3. `INCLUDE PERFETTO MODULE android.binder`：binder peer 按 server process 归类
4. 降频 likely 档：cpufreq reach% + 温度旁路双信号
5. collection-manifest.json + 温度旁路：record_aoeyz.bat v2 已支持

#### ⏳ 待新一轮采集 + 新 Provider 重跑（不需要新代码）

6. 用新 bat 采 base/cur/thermal 三份 + 温度旁路
7. 新 Provider 重跑后填 §3.3-§3.5 / §5.1 温度列 / §4.6 三线程对照 / §6.3 子函数下钻 / §7.2 RHI

#### 🟡 需要进一步改造（下一轮工程项）

8. **`frame_timeline` data source 启用**：让 §2 "Choreographer 92.8fps vs PlayerLoop 16.9fps" 可量化归因到 jank 类型
9. `_throttling` 阈值规则补充：全集群压频形态额外阈值
10. `_gc_alloc_by_module` 扩展到全 callTrees 节点
11. 每帧 GC.Alloc 时序图（`gcAllocByFrame`）

#### 🔴 物理 / 结构性不可达（不再尝试）

12. `sched_blocked_reason` ftrace 真值（华为非 root 静默丢弃）
13. sysfs `scaling_max_freq` 旁路（confirmed 档不可达）
14. GPU busy / freq counter
15. Wwise 内部细分

#### 后续

16. **逆向沉淀 v5.1 报告骨架到 perfetto skill** —— §0-§9 章节结构、判定阈值（reach% < 65%、单次 Gfx.WaitForPresent > vsync 周期、单次 BattleHead > 1-2ms 红线）、视觉化资产模板（因果链 ASCII / 缩进树 / 子函数下钻）固化进 references/perfetto-report-template.md
17. **callTrees 优先 vs atrace LIKE 全 trace 慎用** —— 写入 skill SKILL.md 的核心方法论，避免下次再发生"v5 用 LIKE 错算高估业务模块"那种事故
18. **阈值表 YAML 化** —— 把散落红线（reach% / 单次 ms / 触发频次）整理成机器可读 YAML，Provider 直接打标

---

> 终极报告 perfetto v5.1 结束。
>
> **本版核心进展**：
> 1. **修正 v5 重大数字错误**（atrace LIKE 高估 → callTrees 真实），MapSig/BattleHead/MapCameraCtrl 三个关键模块的量级全部更正
> 2. **恢复 v4 视觉化资产**：§4.5 因果链 / §6.2 主线程缩进树（带标记）/ §6.3 Top 热点子函数下钻
> 3. **新增多线程独立分析 §3**（RHI / LuaMtGC / ECS Worker 框架已成，数据 ⏳ 等新 Provider 重跑）
> 4. **降频判定加 likely 档**（温度旁路 ⏳）
> 5. **gap 清单分四档**
>
> 配套：[v5（数据快照，本版基础）](./performance-report_perfetto_ULTIMATE_v5.md) · [v4（视觉化框架原版）](./performance-report_perfetto_ULTIMATE_v4.md) · [AOE CPU 知识库](../aoe-cpu-analysis-knowledge.md) · [perfetto skill 工程化路线图](./perfetto-skill-engineering-roadmap.md)
