# Perfetto 单源性能分析报告 · 模板

> **本模板基于 v5.2 终极形态沉淀**。AI 写报告时**直接套这个模板填数据**,不要自创结构。
>
> 配套：[SKILL.md 4 条核心方法论](../SKILL.md) · [aoe-watch-spec.yaml 阈值表](aoe-watch-spec.yaml) · [aoe-cpu-analysis-knowledge.md 业务热点知识库](aoe-cpu-analysis-knowledge.md) · [lessons-learned.md 历史教训](lessons-learned.md)

## 报告骨架(必备章节)

```
§-1 数据采集 · 能力声明  ← 让读者先看清这次能/不能回答什么
§0  结论先行             ← 三大独立结论, 用引用块 + 加粗 + 缩进树, 不用对比表格
§1  采集质量声明 + 数据口径
§2  采集元信息表
§3  线程身份地图(每条线程独立小节)
§4  主线程 off-CPU 归因(perfetto 独家·结论前置)
§5  降频时序证据链(perfetto 独家)
§6  主线程一帧时间去向(callTrees 缩进树)
§7  渲染链路 + GPU bound 判定
§8  与历史版本趋势对照(可选)
§9  本源能力边界 + 工程化建议(分四档)
```

---

## §-1 数据采集 · 能力声明(模板)

### -1.1 本次采集的数据(列表)

```markdown
| 角色 | 时间点 | 时长 | PlayerLoop 帧数 | 文件 |
|---|---|---|---|---|
| **base** | YYYY-MM-DD HH:MM | X.XX s | NNN | sample_<stamp>/...pftrace |
| **cur**  | ... | ... | ... | ... |
| **throttle** | ... | ... | ... | ... |

> ⚠️ 三份 trace 实际窗口可能不一致, 原因是 ring buffer 在不同负载下被覆盖到不同程度。
> **跨次对比一律用 ms/帧 或 占整 trace %(totalPct)归一化**, 绝对 totalMs 仅本次内部参考。
```

每份数据除 `.pftrace` 外含旁路文件(record_aoeyz.bat v2 落盘):

| 旁路文件 | 用途 |
|---|---|
| collection-manifest.json | 记录 root 状态、sysfs 旁路成功项 |
| thermal_before.txt / thermal_after.txt | 采前/采后 thermal_zone 温度 |
| cpuinfo_max_freq.txt | 8 核理论上限频率 |

### -1.2 数据维度矩阵(必须写)

按下表三档列出:✅ 已采到 / ⏳ 已落实代码但需 Provider 重跑 / ❌ 物理或结构性不可达

```markdown
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
```

### -1.3 本报告能 / 不能回答的问题(必须写)

```markdown
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
```

---

## §0 结论先行(模板)

### 形式硬规则

- **必须用引用块 + 加粗 + 缩进树** 三大独立结论, **禁止用对比表格**(表格读起来扁平,缩进树带层级感)
- 三大结论按强度排序, 红色标记 🔴 / 黄色标记 🟡
- 每条结论附"详见 §X / §Y"指向证据章节, 禁止结论里堆数字证据(那是后续章节的事)
- 末尾给"按 ROI 排序的优化方向"列表, 跟结论挂钩

### 标准格式(直接复用)

```markdown
## §0 结论先行

> ### ⚠️ 三大独立结论(按强度排序)
>
> **🔴 ① <主线程瓶颈形态结论, 三种状态对比, 必含 Running/Sleeping% + 关键指标>**
>
> ```
> UnityMain Running / Sleeping (sched):
>   base       <绘出条形比例图> Run XX.XX% / Sleep YY.YY%   ← <一句解读>
>   cur        <同上>             ...                       ← <一句解读>
>   throttle   <同上>             ...                       ← <一句解读>
>
> Gfx.WaitForPresent 占整 trace (主线程睡等 GPU 上一帧):
>   base       X.X%
>   cur        Y.Y%   ← <解读>
>   throttle   Z.Z%   ← <解读>
> ```
>
> 详见 §4 / §7。
>
> **🔴 ② <业务侧涨幅, 用 callTrees 缩进树, 不用对比表格>**
>
> ```
> Core.Update              cur XXXX ms (NN.N% trace) ← <注解>
> ├─ CS:AOE.LuaMgr               cur XXX ms (NN.N%)
> │  └─ LuaMgr.OnTick&UpdateSchedule  cur XXX ms (NN.N%)
> │     ├─ BattleHeadMgr            cur XXX ms (N.N%)  ← single avg X.XX ms/帧 触发红线
> │     └─ MapSignificanceMgr       cur XXX ms (N.N%)  ← single avg X.XX ms/帧 ...
> ├─ CS:AOE.Outside.MapManager   cur XXXX ms (N.N%) ← Outside 容器
> │  └─ OutSideViewArmyLineMgr     cur XXX ms (N.N%)
> └─ TServerManager              cur XXX ms (N.N%)
> ```
>
> 详见 §6。
>
> **🔴/🟡 ③ <降频或第三主题, 同样用缩进数据块或表格>**
>
> ```
> base       soc_thermal X.X → Y.Y°C  Δ +Z.Z°C    ← <解读>
>            bigCoreReach NN.N%
>            evidence: <列要点>
>
> cur        ...
>
> throttle   ...
> ```
>
> 详见 §5。

按 ROI 排序的优化方向:

1. **<最高 ROI 项>** — <一句话理由>
2. **<次>** — ...
3. ...
```

---

## §1 采集质量声明 + 数据口径(模板)

### §1.1 trace 实际时长

三份样本受 ring buffer 容量影响,物理时长可能不一致(高帧率场景 ring 用满更快)。固定写法:

```markdown
| 数据 | 配置 | 实际窗口 | 帧数 | 文件大小 | 事件密度(推算) |
|---|---|---|---|---|---|
| base | -t 20s | X.XX s | NNN(NN fps) | NN MB | ~NN MB/s |
| cur | -t 20s | X.XX s | NNN | NN MB | ~NN MB/s |
| throttle | -t 20s | X.XX s | NNN | NN MB | ~NN MB/s |
```

跨次对比一律用 **ms/帧** 或 **占整 trace %(totalPct)** 归一化, 绝对 totalMs 仅本次内部参考。

### §1.2 数据口径(必备公式表)

```markdown
| 口径 | 计算公式 | 用途 |
|---|---|---|
| **callTrees totalMs / totalPct** | 直接读 callTrees[].root 沿父子链的节点 totalMs;totalPct = totalMs / 整 trace ms × 100% | "主线程一帧时间去向" 唯一正确口径 |
| **selfMs**(剥洋葱) | totalMs - sum(直接子 totalMs);Provider 已落 aoeHotSlices.selfMs | 节点自身入口逻辑真正消耗 |
| **单次 avgMs** | **totalMs / count**(count = slice 触发次数) | 区分"涨在频次 vs 涨在单次" |
| **ms/帧**(推算) | **totalMs / PlayerLoop 帧数** | 跨次帧数不同时归一化对比 |
| ~~atraceSlices LIKE 全 trace 的 totalMs~~ | ❌ 不可用做"占帧消耗" | 仅可用其 count 字段统计触发频次(如 GC.Alloc 次/帧) |
```

> ⚠️ 必读 SKILL.md M1 反模式 — atraceSlices LIKE 累加会跨多个父子层级重复计数(v5 报告把 MapSig 高估 4.6×)。

### §1.3 数据缺口

引用 §-1.2 数据维度矩阵中标 ❌ 的几项, 一句话说明本报告对应章节用什么替代(如 sched_blocked_reason 不可用 → §4 用 atrace wait slice 重叠法替代)。

---

## §2 采集元信息(模板)

```markdown
| 项 | base | cur | throttle |
|---|---|---|---|
| 场景 | 凉机野外 | 行军压测 | 行军压测持续 N min |
| 实际 trace 长度 | X.XX s | X.XX s | XX.XX s |
| **PlayerLoop 帧数** | NNN | NNN | NNN |
| **PlayerLoop p50 / p95 / p99 (ms)** | XX / XX / XX | ... | ... |
| **PlayerLoop fps** | NN.N | NN.N | **NN.N** |
| **Choreographer fps**(屏幕节拍) | NN.N | NN.N | NN.N |
| slowFrameRate >33ms | N.NN% | NN.NN% | **NN.NN%** |
| CPU 平均频率 | NNNN MHz | ... | ... |
| 大核 bigCoreReach% | NN.N% | NN.N% | **NN.N%** |
| **温度 soc_thermal Δ°C** | **+N.N**(N.N→N.N) | ±N.N | ±N.N |
| 降频判定级 | likely / suspected / none | ... | ... |
```

末尾必备解读两条:

1. **Choreographer fps vs PlayerLoop fps 关系**(v5.2 沉淀的独立判定):
   - 若 `Choreographer fps ≈ PlayerLoop fps` → 业务跟得上屏幕节拍, 健康
   - 若 `Choreographer fps > PlayerLoop fps × 2` → **跨 vsync 周期掉帧**, 屏幕每 N ms 触发一次 vsync 但 Unity 业务每 M ms 才出一帧, 业务 N/M 个 vsync 才交一帧。这是"显示链路正常但业务跟不上"的硬证据, 比单纯看 PlayerLoop fps 信息量更大
   - 阈值参考 aoe-watch-spec.yaml `framerate-vs-vsync-gap`(`fps < choreographer × 0.5` → critical)
2. **温度时序故事**:base→cur→throttle 的温度起点 + Δ 单调变化或饱和趋势, 配合 cpufreq 降频形态(全集群压频 / 集群下线 / 大核锁低)给出"机器是否真在降频"的整体判断。

---

## §3 多线程独立分析(模板)

每条线程一节, 仿 simpleperf v4 §3 风格。

### §3.0 线程一览(必备表格)

```markdown
| 通用名 | comm (实测) | 关键 atrace 特征 | 一句话定位 |
|---|---|---|---|
| **UnityMain** | UnityMain | `PlayerLoop` × N、`Update.*`、`LateUpdate.*` | 业务/Lua/ECS 调度主入口 |
| **Render** | UnityGfxRenderS | `Gfx.RenderSlaver.ThreadRun`、`Semaphore.WaitForSignal` | Unity 命令录制层 |
| **RHI** | Thread-XXX (tid=NNNNN) | `eglSwapBuffers` × 数千 / `queueBuffer` / `Gfx.PresentFrame` | 直调 GLES driver |
| **Lua MtGC** | UnityMain (tid=NNNNN, **同名陷阱**) | `LuaMtGc.ExecuteMtGc` × 数百 | xLua C# GC 线程 |
| **ECS Worker × 4** | Thread-NNN/NNN/NNN/NNN | `xxxSystem:xxxJob (Burst)` × 数万 | Unity Job System Burst Worker |
| **Audio** | AudioTrack / AAudio_1 / Audio Mixer Thr | 内核 AudioFlinger 回调 | 音频回放 |
| **Choreographer** | UnityChoreograp | `Choreographer#doFrame` | VSync 回调 |
| ❌ Wwise | — | atrace 无埋点 | **本源结构性不可见**(永久声明) |
```

### §3.1 UnityMain(主线程)

至少这两块内容:

1. **三态对照表**(base/cur/throttle Running/Sleeping/Runnable + Gfx.WaitForPresent 累计)
2. **形态演化一句话**:`base CPU-bound 健康 → cur 算+等混合 → throttle 半睡型 GPU-bound`
3. **主线程 binder 调用 server 进程**(从 binderPeers.byServerProcess 取)

### §3.2 Render(UnityGfxRenderS)

判定锚点:**run% 单调下降 + sleep% 单调上升 → Render 不是瓶颈**(等主线程发命令)

### §3.3 RHI

判定锚点:**run% 与 Render / 主线程同步变闲 → CPU 链路不是瓶颈, GPU 没跟上**(经典 GPU-bound 形态)

### §3.4 Lua MtGC(同名陷阱破解)

判定锚点:**Sleep > 95% 健康态, 仅 GC 周期短暂活跃, 无 spike**

### §3.5 ECS Worker × 4(并行健康度)

必备指标:**4 条 Worker max-min 偏差**

健康度阈值(实测分级):

| 偏差 | 状态 | 含义 |
|---|---|---|
| < 1pp | **极佳**(v5.2 实测均落此区间) | Worker 池负载完全均匀 |
| 1-5pp | 健康 | 轻微不均, 不影响整体 |
| 5-30pp | 警示 | 某些 Worker 长期闲置 / 重负, 需查 Burst Job 分配策略 |
| ≥ 30pp | 异常 | 触发 aoe-watch-spec.yaml `ecs-worker-imbalance` critical |

### §3.6 Audio 线程池

通常一句话:三态无明显变化, 链路健康, 不是瓶颈。

### §3.7 Choreographer

记录屏幕节拍:60Hz / 90Hz / 120Hz, 后续 GPU-bound 判定阈值与此挂钩。

---

## §4 主线程 off-CPU 归因(模板)

### §4.1 结论前置(必须放节首)

```markdown
> ### 🔴 结论
>
> **<状态> 上主线程 Sleeping 时间几乎完全来自 Gfx.WaitForPresent
> (NN.N% Sleep ≈ NN.N% Gfx.WaitForPresent 占整 trace) → 强 GPU-bound 信号。**
> **base 上主线程 Sleeping 已经主要是等 GPU(N.N% 占整 trace),但量级远小,业务还能保 60fps;
> cur 是过渡形态;throttle 崩到 NN fps。**
```

### §4.2 byState 分布(三份对照)

### §4.3 atrace wait slice 重叠法(核心证据)

```markdown
| | UnityMain Sleeping | Gfx.WaitForPresent self | 重合度 |
|---|---|---|---|
| base | XXX ms | XXX ms | 主线程 Sleep 中 NN% 是等 GPU |
| cur | XXX ms | XXX ms | **NN.N%** —— 等 GPU 占绝大多数 |
| throttle | XXXX ms | **XXXX ms** | **NN.N%** —— 等 GPU 占绝大多数 |
```

### §4.4 主线程状态分布可视化(ASCII 必备)

```
状态分布对比(主线程总时长归一化为整 trace 窗口)

base:      ███████████████████████████████ ░░░       Run 86.94% / Sleep 12.04%
            ↑ 主要是正常 vsync 等待 + 极少 GPU 等待

cur:       ████████████████████████████ ░░░░░░       Run 77.82% / Sleep 20.40%
            ↑ 多出来的 ~8pp Sleep 99.5% 都是等 GPU

throttle:  ███████████████████ ░░░░░░░░░░░░░░       Run 56.99% / Sleep 38.99%
            ↑ 多出来的 ~19pp Sleep 97.9% 都是等 GPU
            ↑ 与降频 reach 59.2% 同向:算得慢 + 等得久 双重叠加

核心数字:
- base    Gfx.WaitForPresent 单次 avg X.XXms  ← <1ms 健康
- cur     Gfx.WaitForPresent 单次 avg X.XXms  ← 单次涨 N×, 仍 < vsync NN.NNms
- throttle Gfx.WaitForPresent 单次 avg XX.XXms ← 单次 > vsync NN.NN周期 → 强 GPU-bound
```

### §4.5 因果链可视化(ASCII 必备, v4 §4.3 风格沿用)

```
<状态> 主线程一帧的等待因果链:

    主线程发起 URP.AfterRendering → URP.Submit → URP.WaitForPresent
        │
        ├─ 状态切换为 Sleep (S)
        │
        └─ 等 semaphore (Gfx.WaitForPresent → Semaphore.WaitForSignal)
                │
                └─ 信号源 = GPU 完成上一帧 swapchain Present
                        │
                        └─ RHI 上 Gfx.PresentFrame 单次 ~N.NNms (已超 vsync NN.NNms)
                                │
                                └─ 真因 = GPU 处理一帧需要 ~Nms (高温降频 + 工作量满)
                                        + swapchain 排队 (前一帧没出, 下一帧排队等)

证据链一致性:
- 主线程 Sleep ≈ Gfx.WaitForPresent  (NN.N% 重合) ✅
- 主线程 RHI Render 三条线程 run% 全部下降, sleep% 全部上升 ✅
- 大核 bigCoreReach NN.N% (严重低频) → CPU 算得也慢, 加重 swapchain 排队 ✅
- 温度旁路 throttle 阶段被压不再涨 (Δ +N.N°C) → SoC 已主动降频 ✅
```

---

## §5 降频时序证据链(模板)

### §5.1 三份对照表(必备)

```markdown
| 时间点 | cpu7 reach% | cpu4-6 reach% | cpu0-3 reach% | bigReach% | 温度 Δ°C / 起点→终点 | UnityMain run% | PlayerLoop p50/p99 | level |
|---|---|---|---|---|---|---|---|---|
| **base** | ... | ... | ... | NN.N% | **Δ +N.N / N.N°C → N.N°C** | NN.NN% | N.NN / N.NN | **likely / suspected / none** |
| **cur** | ... | ... | ... | ... | ... | ... | ... | ... |
| **throttle** | ... | ... | ... | NN.N% | ... | NN.NN% | NN.NN / NN.NN | **likely** |
```

### §5.2 降频形态识别(ASCII 必备, 区分形态)

```
<base/cur/throttle> (<场景描述>):
  特征: 温度从 X.X°C 飙到 Y.Y°C (Δ +Z.Z°C)
        bigReach NN.N%
  形态: "<热预算紧但还顶得住 / 饱和高温 / 重度降频>"
  evidence: <列要点>
```

### §5.3 per-CPU 实测表(必备)

```markdown
| CPU | base avg/max | cur avg/max | throttle avg/max | cpuinfo_max(理论上限) |
```

### §5.4 降频判定矩阵(必备四档表)

```markdown
| 维度 | 要求 | 本次 |
|---|---|---|
| **confirmed**: sysfs `scaling_max_freq < cpuinfo_max_freq` | sysfs root | ❌ 物理不可达 |
| **confirmed**: cpu7 sched 归零(集群下线) | 跨次时序 | ❌/✅ |
| **likely**: bigReach% 持续下降 + 温度 Δ°C ≥ 5°C 或采后 ≥ 75°C | cpufreq + 温度旁路 | ✅/❌ |
| **likely**: 大核 reach% < 65% 严重低频 | cpufreq counter | ✅/❌ |
| **suspected**: bigReach% < 80% 且 Run ≥ 80% | cpufreq counter | ✅/❌ |

**当前判定**:base/cur/throttle 三份分别是 likely/likely/likely
```

### §5.5 业务模块在 throttle 上的同步劣化(可选, 看场景)

---

## §6 主线程一帧时间去向(模板·核心章节)

### §6.1 PlayerLoop 帧分位数对比(必备)

```markdown
| 分位 | base | cur | throttle |
|---|---|---|---|
| p50 ms | X.XX | XX.XX | **NN.NN** |
| p95 ms | ... | ... | NN.NN |
| p99 ms | ... | ... | NN.NN |
| slowFrame >33ms | N.NN% | NN.NN% | **NN.NN%** |
| fps | NN.N | NN.N | **NN.N** |
```

附一句解读:cur 上 p50→p99 范围扩 NN%, "持续匀慢"或"偶发尖峰"。

### §6.2 主线程 callTrees 缩进树(本节最重要)

**形式硬规则**:

- 必须缩进树展示, 不用表格
- 每节点格式:`[base / cur / throttle ms/帧]`(ms/帧 = totalMs / 帧数)
- 标记体系:📈 增量 >50% / 🔴 单次平均超红线 / 🟡 临近红线 / 🟢 健康 / 🔵 wait 型 / 🌡️ thermal-only
- 树深度至少展开到业务模块叶子(MapSig/BattleHead/ArmyLineMgr 等)
- 每节点旁可加一句解读 `← <注解>`

参考完整模板见下方"§6.2 缩进树骨架"。

### §6.3 Top 4-5 红线热点子函数下钻(必备)

每个红线模块一段, 仿 v4 §6.3.x 风格:

```
<模块名> (<阶段> 真实 totalMs XXXms / X.XX ms/帧 / 单次 avg X.XX ms 超/临近红线)
└─ <模块>.<入口方法>
   ├─ <子函数 1>  c=N/帧 avg X.XXX / 累计 XX.XX ms (是否 GC.Alloc 异常等注解)
   ├─ <子函数 2>  ...
   ├─ GC.Alloc    c=N/帧 (perfetto 独家归因, 来自 gcAllocByModule)
   └─ ...

GC.Alloc 业务归因 (perfetto 独家):
  base:       <模块> 子树 N 次/帧
  cur:        <模块> 子树 N 次/帧
  throttle:   <模块> 子树 N 次/帧

优化方向:
- <第 1 条具体可行优化>
- <第 2 条>
- ...
```

### §6.4 红线触发清单(必备表格, 按 cur ms/帧 排序)

```markdown
| 优先级 | 模块 | cur ms/帧 | throttle ms/帧 | 红线 | 子函数热点 |
|---|---|---|---|---|---|
| 1 | ... | **N.NN** | N.NN | <红线类型> | <子函数> |
```

### §6.5 慢帧形态差异(可选)

p95-p50 差值归因到具体增量来源(等 GPU 多几次 / 单次拉长等)。

---

## §6.2 主线程 callTrees 缩进树骨架(完整可复用)

```
UnityMain.PlayerLoop  [base X.XX / cur Y.YY / throttle Z.ZZ ms/帧]                       100%
│
├─ PostLateUpdate.FinishFrameRendering   [base X.XX / cur Y.YY / throttle Z.ZZ]  📈🔵 +NN% / +NN%
│  ├─ URP.Render
│  │  └─ URP.RenderCameraStack
│  │     └─ URP.RenderSingleCamera
│  │        ├─ URP.AfterRendering         [base X.XX / cur Y.YY / throttle Z.ZZ] 📈🔵🔴 +NNN% / +NNN%
│  │        │  └─ URP.Submit → URP.WaitForPresent (主线程睡等 GPU)
│  │        │     base ~X.XX / cur ~X.XX / throttle XX.XX ms 单次 ⚠️ 超 vsync NN.NNms
│  │        ├─ URP.MainRenderingTransparent / BeforeRendering / RendererSetup
│  │        │     [合计 ms/帧]                                                   🟢 持平
│
├─ Update.ScriptRunBehaviourUpdate       [base X.XX / cur Y.YY / throttle Z.ZZ]   📈
│  └─ BehaviourUpdate
│     └─ Core.Update                     [base X.XX / cur Y.YY / throttle Z.ZZ]   📈
│        │
│        ├─ CS:AOE.LuaMgr                [...]   📈
│        │  └─ LuaMgr.OnTick&UpdateSchedule  [...]
│        │     ├─ MapSignificanceMgr     [base 0 / cur X.XX / throttle X.XX]      📈🔴 cur 单次 X.XX ms 超 1-2ms 红线
│        │     └─ BattleHeadMgr          [base 0 / cur X.XX / throttle X.XX]      📈🔴
│        │
│        ├─ CS:AOE.Outside.MapManager    [...]   📈🔴 throttle 头号增量
│        │  ├─ OutSideViewArmyLineMgr    [...]   📈🔴 持续上涨, Burst Job 调度入口
│        │  └─ BattleUIManager           [...]   🟢
│        │
│        └─ CS:AOE.TServerManager        [...]   🟢 远低 15% 红线
│
├─ PreLateUpdate.ScriptRunBehaviourLateUpdate
│  └─ LateBehaviourUpdate
│     └─ Core.LateUpdate
│        ├─ CS:AOE.LuaMgr (LateUpdate 一侧)
│        │  └─ LuaMgr.OnLateUpdateSchedule
│        │     └─ MapCameraCtrl  (若出现 thermal-only 暴涨标 🌡️)
│        └─ CS:AOE.MeshUIManager
│
├─ PostLateUpdate.PlayerUpdateCanvases
├─ EarlyUpdate.UpdateTextureStreamingManager
├─ SimulationSystemGroup
├─ InitializationSystemGroup
├─ PostLateUpdate.PlayerSendFrameComplete
├─ PresentationSystemGroup
│
└─ Initialization.PlayerUpdateTime → WaitForTargetFPS  🔵
                                          base / cur / throttle ms/帧
                                          ↑ base 主线程跑完业务还有空闲等 vsync;
                                            cur/throttle 上几乎归零 → 所有预算被业务+wait 吃光
```

---

## §7 渲染链路 + GPU bound 判定(模板)

### §7.1 Gfx.WaitForPresent 单次 avg 演化(核心 GPU-bound 指标)

```markdown
| trace | 单次 avg | 含义 |
|---|---|---|
| base | **X.XX ms** | 主线程每帧等 GPU < 1ms, 双缓冲健康 |
| cur | **X.XX ms** | 单次涨 ×N, 仍 < vsync NN.NNms |
| throttle | **NN.NN ms** | **超 vsync 周期 → GPU 撑爆 swapchain** |
```

**判定阈值**:单次 `Gfx.WaitForPresent > vsync 周期`(60Hz=16.66ms / 90Hz=11.11ms / 120Hz=8.33ms)→ GPU 成为瓶颈。

### §7.2 RHI 顶层 slice(可选, 待 Provider 子函数下钻)

### §7.3 GPU bound 判定矩阵(必备)

```markdown
| 信号 | 直接证据 | 间接证据 | 判定 |
|---|---|---|---|
| GPU busy/freq counter | — | 设备物理不可达 | ❌ |
| **Gfx.WaitForPresent 单次 > vsync 周期** | <数据> | ✅ | 🔴 **强 GPU-bound** |
| **主线程 Sleeping ≈ Gfx.WaitForPresent** | <重合 NN.N%> | ✅ 双重验证 | 🔴 |
| **Render / RHI 都越来越闲** | 三条线程 run% 全单调下降 | ✅ | 🔴 CPU 链路不是瓶颈 |
| Choreographer 维持 NN Hz 节拍 | 三份 NN.N-NN.NHz | ✅ | 🔴 显示链路正常 |
| 主线程 binder 占比 | < 0.05% | ✅ | 排除 IPC 阻塞 |

**判定**:
- ✅ throttle **强 GPU-bound 信号**
- 🟡 cur 中等 GPU-bound 信号
- ❌ "GPU 满载"硬结论给不出 — 缺 GPU busy counter
```

---

## §9 本源能力边界 + 工程化建议(模板·分四档)

### §9.1 能力矩阵

参考 §-1.3, 但写得更系统(每个能力对应底层数据源 / 可信度)。

### §9.2 工程化建议(分四档)

```markdown
#### 🟢 已落实(代码 + 采集端均到位)

1. <第 1 条具体落地>
2. ...

#### 🟡 待 Provider 子查询扩展(不阻塞本报告)

7. <第 1 条扩展项>
8. ...

#### 🔴 物理 / 结构性不可达(永久声明)

13. sched_blocked_reason ftrace 真值(华为非 root 静默丢弃)
14. sysfs scaling_max_freq 旁路(confirmed 档不可达)
15. GPU busy / freq counter(骁龙需 root 注入 producer)
16. Wwise 内部细分(atrace 无 native 埋点)

#### 后续工程项

17. <例如沉淀 skill 模板>
18. <例如阈值表 YAML 化>
```

---

## 视觉化资产清单(必备的 ASCII 元素)

| 元素 | 出现位置 | 模板路径 |
|---|---|---|
| 三态状态分布对比图 | §0 + §4.4 | 上方 §4.4 ASCII |
| 业务模块缩进树 | §0 + §6.2 | 上方 §6.2 缩进树骨架 |
| 因果链流程图 | §4.5 | 上方 §4.5 ASCII |
| 降频形态区分块 | §5.2 | 上方 §5.2 ASCII |
| 子函数下钻树 | §6.3 每个红线模块 | 上方 §6.3 模板 |

---

## 反模式(MUST NOT)

下列写法是 v5 报告踩过的坑, **不要再犯**:

1. ❌ 不要用 `atraceSlices` 全 trace LIKE 统计的 totalMs 做"模块占帧消耗"(会跨多层重复计数, v5 高估了 4.6×) — 用 callTrees 父子链
2. ❌ 不要在 §0 第 2 条用对比表格列业务模块 — 必须用层级缩进树, 体现父子关系
3. ❌ 不要写"主线程超 5ms 警戒线"而不剥洋葱 — Core.Update self ≈ 0, 真凶在子节点(LuaMgr / MapManager / TServer)
4. ❌ 不要把 RHI 当成 ECS Worker — 它也跑少量 Burst Job, 但 sliceCount 远高, 必须排除
5. ❌ 不要把 LuaMtGC 当主线程 — comm 都是 UnityMain, 必须按 LuaMtGc.* slice 反查排除主 utid
6. ❌ 不要双重计数 WaitForPresent + Gfx.WaitForPresent — 它们是父子关系, 用 selfMs
7. ❌ 不要把 trace 实际窗口和配置时长当一致 — ring buffer 在不同负载下覆盖时间不同, 用 ms/帧 + totalPct 归一化
8. ❌ 不要在 GPU 没 busy counter 时硬给"GPU 满载"结论 — 用单次 Gfx.WaitForPresent > vsync 这个间接强信号
9. ❌ 不要在 sched_blocked_reason 没采到时假装能给 byReason 细分 — 用 atrace wait slice 重叠法替代
10. ❌ 不要在结论先行章节堆数字证据 — 数字归到 §4-§7, §0 只给判定 + 路径 + 详见 §X
