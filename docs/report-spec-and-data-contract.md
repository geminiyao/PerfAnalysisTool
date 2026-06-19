# 分析报告规格 + 数据契约 (草案 v1)

> 日期: 2026-06-17 · 阶段: P0.5 (P0 与 P1 之间的"报告驱动数据契约")
>
> **目的**: 反向锁定"报告需要什么数据", 作为 P1 Provider 的**验收契约**——Provider 抽完的
> `PerfProfile` 必须能喂饱本文每份报告的字段清单。避免按"旧代码碰巧吐什么"来抽, 导致后期 AI 报告缺数据返工。
>
> 依据: 需求 §5/§6/§8, framework §2/§6, data-sources-guide §5/§7;
> key 写法遵循 [`metric-key-naming-spec.md`](./metric-key-naming-spec.md)。
>
> **现状基线**:
> - unity 单源报告 (`unity-profiler-analysis` skill): 7 段结构, **基本满足, 待优化**。
> - simpleperf 报告 (`simpleperf-native-analysis` skill): 单源结构尚可; **对比报告完全不可读, 本轮重构 (§6.3)**。
> - perfetto: 旧 `maple_perfetto_results` 仅有零散指标, **无独立报告, 本文新建结构**。

---

## 0. 北极星 (所有报告必须遵守, 高于一切格式)

> **报告不是数据罗列, 是"问题 → 根因 → 建议"的论证链。** 数据只作为**证据**出现, 不单独成章堆砌。

每份报告必须回答三件事, 缺一不算合格:

1. **主要性能问题是什么** (按严重度排序, 不是把所有指标列一遍)。
2. **根因** (为什么慢/为什么变化; 证据来自哪个源、哪条数据)。
3. **可执行建议** (具体到能落地的动作, 不是"建议优化 XX")。

配套硬规则 (从 unity skill 的 6 条推广到三源, 见 §6):
- **结论先行**: 顶部先给普通话结论, 术语/明细在后、可展开 (§6.3)。
- **证据可溯源**: 每个结论挂出处 (`Metric.key` 或 `detail.<source>.<path>`)。
- **判定依据透明**: "判定为热点/有效/回归" 必须引具体数值。
- **不确定标 `[推断]`**; 数据缺失标 "数据缺失", 禁止编造。

---

## 1. 数据落点约定 (报告 → PerfProfile 三类来源)

报告每个字段的来源只可能是这三类之一, 写清楚便于 Provider 知道该产什么:

| 落点 | 用途 | 形态 |
|---|---|---|
| `core.metrics[]` (指标袋) | 可跨源比 / 列表 / 趋势的标量 | `{key,value,unit,source}`,key 见命名规范 |
| `core.frame[]` / `core.threads[]` / `core.system` | 结构化归一字段 (帧口径/线程/系统) | 固定结构 |
| `detail.<source>` (schemaless) | 富数据/产物: 调用树、folded、火焰图、函数表、SQL、源码映射 | 原样 + 文件指针 |

**降级规则**: 任一字段缺失 → 报告对应小节标 "数据缺失" 并写入 `core.confidence.notes`, 不阻断其余分析 (framework §7.5)。

**存储分工 (本平台落地)**: `raw` 原始采集大文件**不入 DB, 存 CDN/对象存储**——`RawAssetRef` 只存指针 (`assetId` → `assets` 行的 `remoteKey`/`storageBackend=cdn`)。**入库的只有提取后的字段**: `core` 物化进 `runs`/`run_metrics`;`detail` 小结构可入 DB JSON, 大产物 (火焰图/folded/SQL dump) 也走 CDN 存指针。对比深层联合时按指针回读 CDN raw。

---

## 1.5 统一调用树 CallTree (三源共同子结构, 本轮新增地基)

> **关键洞察 (来自需求方)**: 三源本质上都能产出"**以已知根节点为起点的每线程调用树**", 这是比散点指标更丰富的分析底座。报告很多区块 (热点、anchor、差分) 其实都是对这棵树的不同查询/视图。

| 源 | 树的根 | 树怎么来 / 精度 | 节点是什么 | 语义粒度 | 局限 |
|---|---|---|---|---|---|
| unity_profiler | `PlayerLoop` (每帧) | 埋点 instrumentation, **精确计时** | Unity marker / 托管方法 | **业务语义最全** (含 lua 具体方法名、C# 方法名) | 只覆盖埋点, 看不进 native 内部 |
| simpleperf | `UnityMain` 上的 `ExecutePlayerLoop` 等 (每线程) | **栈采样**(4000Hz), **统计、非精确计时** | native 函数 (含 IL2CPP 生成的 `XXX_Update_mNNNN`) | native 最深, **但业务信息塌缩** (lua 方法 → 统一 `luaV_execute`、虚表派发等) | 采样统计, 低频/短任务漏采, Job.Worker 样本常不足 |
| perfetto | `PlayerLoop` atrace slice (每线程) | atrace 嵌套 slice, **精确计时** | atrace slice + 该段调度状态 | OS 调度视角, **粗 (仅埋点区间)** | **无函数级** (函数级需另开 callstack 采样, 常规 .pftrace 不启) |

**统一结构** (各源 detail 都放一份, 字段名一致):
```ts
interface CallTreeNode {
  name: string;
  selfMs?: number; selfPct?: number;     // 自身耗时
  totalMs?: number; totalPct?: number;   // 子树总耗时
  layer?: 'business' | 'engine' | 'runtime' | 'noise';  // 层次标签 (simpleperf 用)
  children: CallTreeNode[];
}
// detail.<source>.callTrees: { thread: string; root: CallTreeNode }[]
```

**这棵树支撑的报告视图** (都是对树的查询, 不必各做一套):
- **热点** = 树里 self 最高的节点。
- **anchor 子树** = 选定某个节点, 报它的 `totalPct` (见 §3 anchor 解释)。
- **差分图** = 两个 Run 的同名树按节点配对做减法 (见 §5)。

**互补铁律 (报告必须利用)**: 同一现象在三棵树上对照——unity 树说"哪个业务方法/子系统", simpleperf 树说"这块到底花在哪个 native 函数/调用机制", perfetto 树说"这段时间线程在跑还是在等"。业务名缺失 (lua→luaV_execute) 时, 用 unity 树补语义、simpleperf 树补 native 深度。

---

## 2. 单源报告 · UnityProfilerData (现状: 基本满足, 待优化)

**职责 (What)**: 每帧各子系统耗时、Jank、热点 marker、调用树。沿用现有 7 段骨架。

**待优化点 (本轮要改进的)**:
- 概览/热点区目前偏"列指标"; 需强化 §0 的"问题→根因→建议"论证链与结论先行。
- 与跨源结论卡打通 (单次详情页顶部那张卡由跨源 skill 给, 见 §5 单次部分)。

### 区块 → 数据契约

| 报告区块 | 消费字段 | 落点 |
|---|---|---|
| 一、概览 | 总帧数 / 帧率 / 帧均 / 中位 / P95 / 最差帧 | `frame.fps` `frame.avgMs` `frame.p50Ms` `frame.p95Ms` `frame.maxMs` (core.metrics, source=unity_profiler) + `core.frame[unity_profiler]` |
| 二、核心结论 (问题先行) | Jank/BigJank 次数与率、慢帧率 | `jank.count` `jank.bigCount` `jank.rate` `frame.slowRate33Ms` |
| 三、热点分析 | 每帧 marker self/total、调用次数、调用链、瓶颈节点 | core.metrics: `marker.<name>.msPerFrame`; 调用链/self-total/源码 → `detail.unity_profiler.markers[]` + `.frameTrees` + `.markerSourceMap` |
| 四、Jank 卡顿分析 | 每个 jank 帧的 callTreeSummary / hotPath / category / 瓶颈节点 | `detail.unity_profiler.jankFrames[]` |
| 五、Marker 波动分析 | spike ratio / 受影响帧数 | `spike.count` (core) + `detail.unity_profiler.markerSpikes[]` |
| 六、优化建议 | 源码位置 / 预期收益 | `detail.unity_profiler.markerSourceMap` + §0 建议规则 |
| 七、补充 | GC、特殊 marker (WaitForTargetFPS/Gfx.WaitForPresent) | `gc.allocCount` `gc.allocBytes` `marker.WaitForTargetFPS.msPerFrame`; 特殊 marker 解读规则内置于 skill |
| 线程负载 | Main/Render/Submit/Job.Worker 每帧负载 | `detail.unity_profiler.threadSummary` (Job.Worker 此处最可靠) |

> **Provider 必产**: `core.frame[unity_profiler]` + 上述 `marker.*`/`frame.*`/`gc.*`/`jank.*`/`spike.*` 指标 + `detail.unity_profiler = { frameSummary, markers[], markerSpikes[], jankFrames[], frameTrees, threadSummary, markerSourceMap? }`。

---

## 3. 单源报告 · simpleperf (现状: 单源尚可, 标准化结构)

**职责 (Where)**: CPU 周期花在哪个 so/函数;**独占**运行时调用机制开销 (虚表/icall/GC barrier)、native 黑盒内部。

**根因导向 (关键, 别只列函数)**:
- 必须区分层次: 业务层 (libil2cpp/libxlua 带业务名函数) = 有优化意义; 引擎层 (libunity) = 次要; 底层噪音 (libc/kernel/vdso) = **过滤**。
- 热点要给"瓶颈类型"判断: self/total 比、是否运行时开销 (虚表/GC barrier)。
- 强依赖符号正确性 → 报告须先报符号校验结果, FAIL 时不给强函数级结论与火焰图 (需求 §10)。

### 3.0 三个概念说明 (回应需求方疑问)

**(a) Anchor 子树 (Level 2) 是干嘛的?**
Anchor = 在调用树上选一个"地标"节点 (如 `ExecutePlayerLoop`、`il2cpp::vm::Runtime::Invoke`), 报告它**整个子树**的 CPU 总占比。为什么要它:
- 函数级 self diff (Level 3) **怕内联**——编译器一内联, 函数就"消失", 开销挪到调用者, 单看某个函数的增减会被误导。
- so 占比 (Level 1) 和 anchor 子树 (Level 2) **抗内联**: 不管内部怎么内联重排, "这一整块区域花了多少 CPU" 是稳定的。
- 所以 anchor 给的是一个**稳定的聚合边界**: 单次看"某子系统占整机 CPU 多少"; 对比看"这一整块有没有变便宜"而不被内联噪音骗。本质就是 §1.5 调用树上"选节点 → 看子树 total"。

**(b) 运行时调用机制开销 (虚表/icall/GC barrier) 为什么单拎出来?**
这是 simpleperf **唯一能看、别的源完全看不见**的东西, 也常是某类优化 (去虚化/IL 优化) 的真正发力点。Unity Profiler 能说 "`MyScript.Update` 花了 5ms", 但说不出这 5ms 里多少是真业务逻辑、多少是**虚表派发 / icall 跨界 / GC write barrier**——这些开销发生在 C# 方法**之间**, 不归属任何 marker。所以"这类优化到底有没有效"只有 simpleperf 能回答。
> 注意: 它**重要但与用例相关**——纯游戏逻辑改动时它不是重点。平台用例透明, 报告把它作为"一种可下钻的归因能力"呈现, 不预设每个 run 都关心。

**(c) 硬件 PMU 计数器在报告里的作用 (P2, 可选区块)**
PMU (`cache-misses` / `instructions` / `cpu-cycles` / `branch-misses`, 需 `simpleperf stat -e` 采) 给 **IPC 和 cache-miss 率**, 回答 CPU 时间变化的微架构原因: "是**少执行了指令**, 还是**改善了 cache 局部性**"。报告里作为**"深层效果"可选区块**, 仅当采了 PMU 才出现 (默认报告无此段)。对比时尤其有用: 区分优化是降指令数还是降 cache miss。落 `pmu.ipc` / `pmu.cacheMissRate` (core.metrics, P2)。

### 3.1 区块 → 数据契约

| 报告区块 | 消费字段 | 落点 |
|---|---|---|
| 符号校验 | PASS / PASS_WITH_WARNING / FAIL + 依据 | `detail.simpleperf.symbolCheck` |
| 概览 / so 占比 (Level 1) | 各 so 在各线程 CPU 占比 | `cpu.lib.<so>.pct` (core.metrics, source=simpleperf) |
| 线程 CPU 总量 | 各线程占比 | `cpu.thread.<thread>.pct` |
| 热点函数 (self-time) | 函数 self% + 调用链 (从 §1.5 树取) | `cpu.func.<func>.selfPct` (core, top N) + `detail.simpleperf.callTrees` |
| Anchor 子树 (Level 2) | 锚点节点整子树占比 | `cpu.anchor.<name>.subtreePct` + `detail.simpleperf.callTrees` (取该节点 totalPct) |
| **Job.Worker 逐 job 负载** (见 3.2) | 各 Job.Worker 线程上具体 job 的 CPU 占比 | `cpu.thread.<JobWorker>.pct` + `detail.simpleperf.callTrees[JobWorker]` (子节点=各 job) |
| 运行时开销归因 | 虚表/icall/GC barrier 聚合占比 | `detail.simpleperf.callTrees` 节点 `layer='runtime'` 聚合 |
| 火焰图入口 | folded / svg 路径 | `detail.simpleperf.foldedPath` `.flamegraphPath` |
| (可选) PMU 深层效果 | IPC / cache-miss 率 | `pmu.ipc` `pmu.cacheMissRate` (P2) |
| 根因 / 建议 | 层次定位 + 运行时开销 | `detail.simpleperf.callTrees` (带 layer 标签) + §0 |

### 3.2 Job.Worker 逐 job 负载分析 (Unity 专项, 需求方要求)

Unity Job System 的 `1:Job.Worker`~`N:Job.Worker` 线程上跑的是一个个具体 job。报告要拆出"每个 worker 线程上各 job 的负载分布", 定位是哪个 job 吃满 worker。
> **可靠性铁律 (必须遵守, 不能假装)**: simpleperf 对 Job.Worker **采样量常不足** (data-sources-guide §2.3/6.1, 样本 <1000 不可靠)。因此:
> - **逐帧/逐 job 的可靠负载以 unity_profiler 的 `threadSummary` 为准** (instrumentation, 无统计误差)。
> - simpleperf 在此**作补充**: 当某 worker 样本量足够 (报告需显示样本数), 给该 worker 上的 native 层 job 分布; 样本不足时标 "样本不足, 以 Unity Profiler 为准"。
> - 报告该区块**交叉两源**: Unity 给"哪个 job 重", simpleperf 给"该 job 重在哪段 native 代码"。

### 3.3 Provider 必产

> `cpu.lib.<so>.pct` + `cpu.thread.<t>.pct` (含各 Job.Worker) + top-N `cpu.func.<f>.selfPct` / `cpu.anchor.<a>.subtreePct` 指标 + `detail.simpleperf = { symbolCheck, callTrees[](每线程一棵, 节点含 self/total/layer), anchors[], foldedPath, flamegraphPath, event, scaledMsNote, threadSampleCounts, pmu? }`。
> 注: `cpu-cycles:u` 的 ms 是缩放周期数, 标 `relative`; 需真实 ms 用 `task-clock:u`。

---

## 4. 单源报告 · perfetto (现状: 无独立报告, 新建 + 加厚)

**职责 (Why)**: 线程为什么没在跑、机器什么状态。独占 off-CPU 原因、CPU/GPU 频率与降频、调度、binder、热状态、真实显示链路掉帧。

**报告主线 (问题导向, 别堆指标)**: perfetto 回答的是"**帧慢是因为在算, 还是在等? 等什么? 机器拖后腿了吗?**"——报告应围绕这条主线组织, 而不是把调度/频率/binder 平铺。

### 4.1 加厚后的区块 (回应"显得薄弱")

1. **瓶颈类型定性 (核心结论)**: 综合主线程 Running vs Sleeping + GPU 忙占比 → 判 **CPU-bound / 等待型 (等 GPU / 等锁 / 等 binder / 等 vsync)**。这是 perfetto 对单次分析最大的贡献。
2. **off-CPU 归因**: 主线程 Sleeping 高时, 拆"在等什么"——等 GPU fence / futex 锁 / binder 返回 / vsync。这是 perfetto **独占**, 别的源给不了。
3. **调度树 (§1.5)**: 关键线程的 atrace slice 树 (PlayerLoop→BehaviourUpdate→…) + 每段的 Running/Runnable/Sleeping 拆分 → 看一帧时间线上"算 vs 等"的分布。
4. **降频判定** (吸收降频观测脚本, 需求 §5.4): `scaling_max_freq vs cpuinfo_max_freq` + cooling state + 温度 → "确认降频 / 推测降频 / 无降频" 分级, 据此给全报告可信度打折。
5. **显示链路掉帧 (FrameTimeline/SurfaceFlinger, P1 级新增)**: expected vs actual frame、VSync miss → 区分"应用卡"还是"合成/显示链路卡"(需求 §7.2)。
6. **系统级副作用**: binder 次数/延迟、GPU 频率、内存 PSS。

### 4.2 区块 → 数据契约

| 报告区块 | 消费字段 | 落点 |
|---|---|---|
| 瓶颈类型定性 | 主线程 Running/Sleeping + GPU 忙占比 | `thread.UnityMain.*Pct` + `system.gpuBusyPct` → skill 判定 |
| off-CPU 归因 | Sleeping 拆分 (GPU/锁/binder/vsync) | `detail.perfetto.offCpuReasons` |
| 线程调度状态 | 关键线程 Running/Runnable/Sleeping | `thread.<name>.runningPct` `.runnablePct` `.sleepingPct` (core.threads + metrics) |
| 调度树 | 每线程 atrace slice 树 + 状态拆分 | `detail.perfetto.callTrees` |
| CPU/GPU 频率 | 频率均值、GPU 忙占比 | `system.cpuFreqAvgMhz` `system.gpuFreqAvgMhz` `system.gpuBusyPct` |
| 降频判定 | scaling_max / cpuinfo_max / cooling / 温度 | `system.cpuThrottled` `system.thermalC` + `detail.perfetto.throttling{level,evidence}` |
| 显示链路掉帧 (P1) | expected vs actual frame、VSync miss | `detail.perfetto.frameTimeline` + `core.frame[perfetto]` |
| 帧时长 (Choreographer) | 系统侧帧间隔 P50/P95 | `core.frame[perfetto] (frameDefinition=choreographer)` — **注: ≠ playerloop, 禁直比** |
| Binder / 内存 | 次数 / 均值延迟 / PSS | `system.binder.count` `system.binder.avgMs` `system.pssMb` |

> **Provider 必产**: `core.threads[perfetto]` + `core.system` (freq/throttle/gpu/binder/pss) + `core.frame[perfetto]` + 对应 metrics + `detail.perfetto = { profileWindow, callTrees[], offCpuReasons, throttling{level,evidence}, frameTimeline?, sqlResults?, parseStatus, parseNotes }`。

---

## 5. 对比报告 (现状: **完全不可读 → 重构**, §6.3 重点)

> **本轮最高优先级的可读性重构。** 旧三源对比报告直接抛 "Level1 so / Level2 anchor / Level3 函数 diff、libil2cpp -5.37pp、maybe_inlined" 等术语, 非专家看不懂。新报告**结论先行 + 渐进披露**。

> **现状痛点 (需求方明确)**: 当前对比"太碎、区块太多、理解成本高、看不懂"。新版砍成**一条主线 + 三张差分树 + 一个综合结论**, 不再按 Level1/2/3 术语堆砌。

### 5.1 强制结构 (自上而下, 砍碎为 5 步)

1. **一句普通话结论** (最顶部): "优化有效 / 无效 / 有回归" + 置信度 + 一句原因。术语一律在此之后。
2. **可比性校验** (前置门槛): 场景/设备/帧窗/热状态对齐 → "可比 / 偏差可接受 / 不可比"。不可比时显著告警, **不给结论**。
3. **三张差分树 (本版核心, 见 5.2)**: unity / simpleperf / perfetto 各一张, 每张只呈现两样东西——**① 宏观对比** (该源几个总体指标的变化) + **② 变化最大的树节点** (top 增/减节点)。其余折叠。
4. **各源独有对比** (可展开): unity 的 Jank 对比、simpleperf 的 so 占比对比、perfetto 的线程调度/CPU 频率对比。
5. **综合结论 (5.4)**: 三源**共性问题** (多源同向印证) + **各源独有问题** (只有某源看得到的)。

> 视觉: 改善(绿)/恶化(红)/新增/删除 用色彩与标签表达方向, 不堆数字; 术语必配人话注解 (§5.3)。

### 5.2 三张差分树 (统一算法 = §1.5 CallTree 两两配对做减法)

差分图本质都一样: **取两个 Run 的同源 callTree, 按节点名配对, 算每个节点的 delta, 标 增/减/新增/删除**。再从中提炼"宏观对比"和"大 delta 节点"。

| 源 | 差分树现状 | 可行性 | 宏观对比取什么 | 大 delta 节点取什么 |
|---|---|---|---|---|
| simpleperf | **已有** (compare.py: Level1/2/3 + 差分火焰图) | ✅ 成熟 | so 占比变化 (`cpu.lib.*`)、anchor 子树变化 | 函数级 A/M/D + `maybe_inlined` (回读 raw 重解析) |
| unity_profiler | **缺, 待建** | ✅ **好实现** (它本就有带业务名的每帧调用树) | 帧 P95/慢帧率、各子系统 marker 帧均变化 | marker 调用树节点的帧均增减 (增/减/新增/删除) |
| perfetto | **缺, 待建** | ⚠️ **粒度受限** (只有 atrace slice 树 + 调度状态, 无函数级) | Running%/Sleeping%、CPU/GPU 频率、降频状态变化 | atrace slice 节点耗时变化 + 调度状态迁移 (如 Running↓ Sleeping↑) |

> perfetto 差分可行但**粒度到 slice/调度**, 不到函数级——报告需注明"perfetto 差分回答'线程在算还是在等变了', 不回答'哪个函数变了'(那是 simpleperf)"。

### 5.2.1 区块 → 数据契约

| 报告区块 | 消费 | 落点 / 算法 |
|---|---|---|
| 普通话结论 + 置信度 | 跨源同向性 → 高/中/低置信 | 跨源 skill 据 §5.3 交叉校验产出 |
| 可比性校验 | 两 Run 的场景/帧数/设备/热状态 | 两个 `Run.meta` + `core.frame` + `system.cpuThrottled` |
| 三张差分树·宏观 | 各源几个总体指标的浅层差 | 两 Run `core.metrics` 相减 (副产品, 不入 core) |
| 三张差分树·大节点 | 同源 callTree 配对 delta | **回读 raw/detail 重解析** `detail.<source>.callTrees` 现算 |
| unity 独有: Jank 对比 | 两 Run jank/bigJank/慢帧率 | `jank.*` + `detail.unity_profiler.jankFrames[]` |
| simpleperf 独有: so 占比对比 | 各 so 占比 delta | `cpu.lib.<so>.pct` 两 Run 差 |
| perfetto 独有: 调度/频率对比 | Running%/频率/降频 delta | `thread.*.runningPct` `system.cpuFreqAvgMhz` `system.cpuThrottled` 两 Run 差 |
| 综合: 共性/独有问题 | 上述全部 | 跨源 skill 归纳 (5.4) |

### 5.3 术语必配人话注解 (硬要求)

| 术语 | 人话注解 (示例) |
|---|---|
| so 占比 | "某个代码库占了 CPU 多少时间, 占比下降=这块更省" |
| anchor 子树 | "从某个入口函数往下整条调用链的总耗时" |
| `[D]` + 大 delta | "函数消失/被内联消除——最直接的优化证据" |
| `[A]` | "内联展开后新出现的热点" |
| `[M]` delta<0 | "函数还在但更快了" |
| `maybe_inlined` | "自身开销几乎没了, 但调用链变了——强内联信号" |

> **数据来源原则** (framework §5.3): 对比统一走深层联合, 明细**回读 raw/detail 重解析**; 浅层标量差读 `core.metrics` 仅作交叉校验副产品。

### 5.4 综合结论 = 共性问题 + 独有问题 (报告落脚点)

三张差分树 + 独有对比之后, 跨源 skill 必须收敛成两类结论 (这才是用户要的"看得懂的结论"):

- **共性问题 (多源同向印证 → 高置信)**: 同一现象被 ≥2 源差分同时指向。例: simpleperf 说 libil2cpp 占比↓ + unity 说 BehaviourUpdate 帧均↓ + perfetto 说该 slice 耗时↓ → "脚本计算量确实下降"。同向即高置信, 反向即信号 (需排查, framework §3.4)。
- **各源独有问题 (只有某源看得到 → 不可替代)**: 例 simpleperf 看到某 native 函数新增热点 (内联展开), unity/perfetto 都看不见; 或 perfetto 看到降频/GPU 变瓶颈, 解释"为什么 CPU 省了帧率没涨"。

> 输出形态: 每条结论标 `[共性/独有]` + 涉及哪些源 + 一句人话 + 证据出处。这张"共性/独有"表就是对比报告的最终落脚, 替代旧版一堆 Level 表。

---

## 6. 通用质量门 (所有报告复用, 验收勾选)

把 unity skill 的 6 条硬规则推广到三源 + 对比:

- [ ] **问题导向**: 报告主线是"问题→根因→建议", 不是数据清单。
- [ ] **结论先行**: 顶部普通话结论, 术语在后可展开。
- [ ] **完整证据链**: 每个问题挂完整调用链/数据出处 (`key` 或 `detail` 路径)。
- [ ] **判定依据透明**: 每个"是/不是热点、有效/回归"引具体数值。
- [ ] **可执行建议**: 具体到动作, 拒绝"建议优化 XX"。
- [ ] **`[推断]` 标注** 无直接数据支撑的推理; 缺数据标"数据缺失"。
- [ ] **不编造**: 所有数值/函数名/百分比来自输入。
- [ ] **(对比) 术语配人话注解** + 可比性不过关时不给结论。
- [ ] **降频/可信度**: 降频或帧口径偏差时, 对结论可信度打折并说明。

---

## 7. Provider 验收契约汇总 (反向: P1 每个 Provider 必产)

| Provider | 必产 core.metrics (key) | 必产 core 结构 | 必产 detail.<source> (含统一 callTrees) |
|---|---|---|---|
| `unity_profiler` | `frame.*` `marker.<name>.msPerFrame` `gc.*` `jank.*` `spike.*` | `frame[unity_profiler]` | `{ frameSummary, callTrees[](每帧/线程,业务名全), markers[], markerSpikes[], jankFrames[], threadSummary(含 Job.Worker), markerSourceMap? }` |
| `simpleperf` | `cpu.lib.<so>.pct` `cpu.thread.<t>.pct`(含 Job.Worker) `cpu.func.<f>.selfPct` `cpu.anchor.<a>.subtreePct` (PMU: `pmu.*` P2) | — | `{ symbolCheck, callTrees[](每线程,节点带 layer), anchors[], foldedPath, flamegraphPath, event, threadSampleCounts, pmu? }` |
| `perfetto` | `thread.<name>.{running,runnable,sleeping}Pct` `system.cpuFreqAvgMhz` `system.gpuFreqAvgMhz` `system.gpuBusyPct` `system.binder.{count,avgMs}` `system.pssMb` | `threads[perfetto]` `system` `frame[perfetto]` | `{ profileWindow, callTrees[](atrace slice), offCpuReasons, throttling{level,evidence}, frameTimeline?, sqlResults?, parseStatus, parseNotes }` |

> 这张表就是 P1 的验收标准: Provider 跑完, 对照本表逐项核对"报告要的它都产了"。**三源 detail 都含统一 `callTrees` (§1.5)**, 它同时支撑单源热点/anchor 和对比差分树。

---

## 8. 待 P1 落地时确认的点 (均为可后调参数, 不卡 P0)

> **重要: 下面这些都是"软参数", 后期可随时调, 不影响地基。** 因为 core 是指标袋 (加/减指标 = 加/减行, 不改表)、detail 是 schemaless。所以 top-N、线程白名单这类**先给个默认值开跑, 看报告效果再调**即可, 不用现在拍死。

| 待定项 | 默认值 (先用) | 可调性 |
|---|---|---|
| simpleperf `cpu.func`/`cpu.anchor` 入 core 的 top-N | top 30 (其余留 detail.callTrees) | ✅ 改个数字即可, 全量树永远在 detail |
| perfetto 关键线程白名单 | UnityMain/Render/Submit/Job.Worker 1~N | ✅ Provider 默认 + 配置可覆盖 |
| Job.Worker 逐 job 拆分粒度 | 以 unity threadSummary 为准, simpleperf 补 | ✅ 取决于样本量, 报告自适应 |
| 对比深层联合: 回读 raw 重解析 vs 读缓存 detail | 首期回读 raw 重解析 (需求 §14 倾向) | ✅ P3 按性能再评估 |
| callTree 入 detail 的深度/剪枝阈值 | 不剪 (全量), 报告侧按 self/total 过滤展示 | ✅ |

**确认的存储模型 (按需求方)**: 原始采集大文件 → CDN (不入 DB), `RawAssetRef.assetId` → `assets.remoteKey`;入 DB 的只有提取后的 `core` (runs/run_metrics) + 小 `detail` JSON;大 `detail` 产物 (火焰图/folded) 也走 CDN 存指针。`assets` 表已支持 `storageBackend`/`remoteKey`, 无需改表。

**确认的流程**: 单源报告由 skill 生成 (读 PerfProfile, 不读原始大文件); 单次详情页顶部"交叉结论卡"由跨源 skill 给。

**反向驱动原则 (本文存在的理由)**: §7 字段清单**不需要现在拍死**——先按本文默认值让 P1 Provider 跑通三份单源 + 一份对比报告, 用真实报告效果反向补/调数据, 指标袋 + schemaless detail 让这种增补几乎零成本。
