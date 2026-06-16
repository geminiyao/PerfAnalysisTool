# 通用 Android 性能分析平台 · 需求文档 v2

> 版本: v2.0（草案） · 日期: 2026-06-16
>
> 本文 **统筹并取代** 旧版 `performance-platform-requirements.md`（v1）。它把 v1 的平台规划与 [`analysis-framework-design.md`](./analysis-framework-design.md) 的分层内核、[`data-sources-guide.md`](./data-sources-guide.md) 的数据源认知合并，并落实两项约定：
>
> 1. **去用例化**：本平台是**通用 Android 性能分析**，任何具体优化（如某次去虚化/IL 优化）只是其上的一个用例，平台对用例透明。**全文不出现 `Maple` 关键字**（迁移映射见 §11）。
> 2. **命名统一**：`pdata / .pdata` → **UnityProfilerData**。
>
> 本文为草案，部分章节标注「待定」，供后续（可能在新对话中）继续细化为最终需求。

---

## 1. 背景与目标

平台从"单一 UnityProfilerData 分析工具"演进为"**多数据源性能分析平台**"，统一管理三类（可扩展）数据源：

- **UnityProfilerData**：帧耗时、Marker、Jank/Spike、子系统耗时、调用树。
- **simpleperf**（`perf.data` + `binary_cache`）：native `.so`/函数热点、调用栈、火焰图。
- **perfetto**（`.pftrace`）：线程调度、CPU/GPU 频率、降频/热状态、FrameTimeline、binder 等系统级信息。

目标：

1. **统一采集入口**：Web 手工上传、客户端/脚本/CI 自动上传共用一套 API。
2. **出数据与分析解耦**：解析（确定性代码）产出规范数据，分析（AI/skill）只做解读。
3. **统一分析模型**：`Run` 出数据 → 单次分析（1 个 Run）/ 对比分析（2 个 Run）。
4. **可插拔数据源**：新增源 = 新增一个 Provider + 一个单源 skill，上层不动。
5. **结论可读**：分析结论必须"普通话先行、明细可展开"，非专家也能看懂（重点见 §6.3）。
6. **分阶段可交付**：每阶段可自测、验证、回退。

---

## 2. 核心概念与领域模型

详见 [`analysis-framework-design.md`](./analysis-framework-design.md) §4–§6，此处给落地定义。

| 概念 | 说明 |
|---|---|
| **Run** | 一次采集 = 出数据的单元。打包 `raw + core + detail`（见下）。单次/对比分析都以 Run 为输入。 |
| **raw** | 原始文件指针（UnityProfilerData / perf.data / .pftrace）。真相源，可冷存/归档；深层差分时回读。 |
| **core** | 归一化后的统一指标（"统一词汇表"），物化入库。**只放需跨源对比/关联/趋势的指标**；服务于展示、列表、趋势。 |
| **detail** | 各源专属富数据/产物（火焰图、folded、完整函数表、SQL 结果），schemaless，存产物文件指针。新维度进这里。 |
| **Analysis** | 分析任务，两种模式：`single`（1 个 Run）/ `compare`（2 个 Run）。 |
| **Report** | 分析产出（Markdown + 结构化 insights），挂在 Analysis 上，不挂在源上。 |
| **Asset** | 所有原始文件与产物的统一存储抽象（本地→可换 CDN/对象存储）。 |
| **Provider** | 某个数据源的解析器（出数据，确定性代码），产出 PerfProfile 片段。 |

**关键取舍（v2 相对 v1 的最大变化）**：v1 用"每源一张 Session 表（`sessions`/`simpleperf_sessions`/`perfetto_sessions`）"的筒仓模型；v2 收敛为**统一的 `Run`（core + detail）**，各源数据归一化进同一结构。旧表通过**适配器过渡**，不一次性推倒。

---

## 3. 分析框架（出数据 vs 分析解耦）

三层职责（详见 framework §6）：

```
① 出数据(代码 / Provider)   解析 → PerfProfile(core+detail)。可缓存/复现/不耗 token。
② 算指标 / 算 diff(代码)     单次抽热点；对比做函数配对、算 delta、显著性。确定性。
③ 解读(skill / AI)          对算好的结构化结果下结论。读 PerfProfile，不读原始文件。
```

**skill 架构：N + 1，按"源 + 跨源"切，不按"源 × 模式"切**：

- 单源分析 skill（每源一个，管该源「单次 + 同源对比」解读）：`unity-profiler-analysis`（已存在，范例）、`simpleperf-analysis`、`perfetto-analysis`。
- 跨源 skill（1 个）：`cross-source-analysis` —— 单 run 交叉验证（瓶颈定型）+ 多 run 跨源对比归因。

加新数据源 = 加 1 个 Provider + 1 个单源 skill，跨源 skill 不动。

---

## 4. 信息架构（导航）

从"按 源×模式 堆页面"改为"按任务"，**源降为详情页内的分区，单次/对比是仅有的两种模式**。

| 导航项 | 职责 | 合并/取代了 |
|---|---|---|
| **Dashboard** | 总览：最近 Run、源状态、队列、风险卡片 | — |
| **采集 / 上传** | 写入新数据入口 + 自动上传指南；可建 Run | 旧"采集上传"，统一各源上传 |
| **Runs** | 运行列表（= 历史）。点进去 = 该 Run 的**单次分析详情** | 吞并旧「历史记录」「单次分析」「各源单独报告页」 |
| **对比分析** | 选 2 个 Run 做对比 | 合并旧「对比分析」「simpleperf 对比」「三源对比页」 |
| **趋势** | 跨多 Run 同一指标曲线（硬依赖 core） | 旧「趋势图表」 |
| **Assets** | 文件层资产中心：存储/大小/hash/角色/关联/清理（偏运维审计） | 旧「Assets」 |
| **设置** | 工具链路径、存储、AI provider 等 | 旧「系统设置」 |

**两条合并关系要点**：①「单次分析」不是独立导航，是 Runs 列表点进去的详情页；②「历史」就是 Runs 列表，不单列。

---

## 5. 单次分析需求

输入：1 个 Run。布局自上而下：

1. **顶部概览**：帧率、帧时长 P95、慢帧率、**瓶颈类型结论**（CPU-bound / 等待型 / 降频 …，由跨源 skill 给出）。
2. **交叉结论卡**（普通话）：一句话说清瓶颈在哪、依据是哪些源互相印证、是否降频。
3. **各源分区**（可展开下钻）：
   - UnityProfilerData：帧分布、子系统每帧耗时、Top Markers、调用树。
   - simpleperf：so 占比、Top 函数 self%、火焰图入口。
   - perfetto：线程 Running/Runnable/Sleeping、CPU/GPU 频率、降频判定、binder、内存。
4. **降频判定**（吸收自现有降频观测）：`scaling_max vs cpuinfo_max` + cooling state + 温度，给"确认/推测"分级。
5. 原始产物下载、重新分析入口。

验收：用户无需懂术语即可从概览+交叉结论判断"瓶颈在哪、是不是机器问题"。

---

## 6. 对比分析需求

输入：2 个 Run。**统一走"深层联合"**：联合配对两个 Run 的明细（函数匹配、差分火焰图、anchor 子树），浅层标量差为副产品。UX 保留"拖两份采集 → 自动建 2 个 Run + 发起对比"的快捷路径。

### 6.1 可比性校验（前置门槛）
场景 / 设备 / 帧数窗口 / 热状态对齐情况，给"可比 / 偏差可接受 / 不可比"判定。不可比时显著告警，不直接给结论。

### 6.2 对比内容
- 共享指标交叉校验（帧 P95、so 占比、Running% …）：多源同向 = 高置信；不一致即信号。
- 各源专属差分：simpleperf 函数级 diff（含内联消失 `[D]` 证据）、差分火焰图、anchor 子树；UnityProfilerData marker diff。
- 显著性判定 + 归因结论 + 置信度。

### 6.3 【重点优化】对比结论的可读性

> **现状痛点（必须解决）**：现有对比报告直接抛出 "Level 1 so 占比 / Level 2 anchor 子树 / Level 3 函数 diff、libil2cpp -5.37pp、`maybe_inlined`" 等术语切分，**非专家看不懂**。

要求：

1. **结论先行**：页面/报告最顶部是**一句普通话总结**——"优化有效 / 无效 / 有回归" + 置信度 + 一句原因。术语切分一律放在结论之后。
2. **渐进披露（三层）**：普通话结论 → 3–5 条「关键变化」（每条带人话解释，如"虚函数调用开销下降，这是本次优化的核心收益"）→ 各源术语级明细（可展开）。
3. **每个切分维度配解释**：so 占比 / anchor 子树 / 函数 diff 各配一句"这是什么、怎么读"（tooltip 或小字）。`maybe_inlined`、`[A]/[D]/[M]` 等必须有人话注解。
4. **视觉优先于术语**：用改善（绿）/ 恶化（红）/ 新增 / 删除 的色彩与标签表达方向，而非堆数字。
5. **AI 负责翻译**：跨源 skill 的职责之一就是把术语切分翻译成"对优化决策有用"的结论；规则版回退也要遵循"结论先行"。

验收：一个不了解 simpleperf 内部术语的人，也能在 10 秒内说出"这次改动有没有用、主要变化是什么"。

---

## 7. 数据源

### 7.1 现有三源
见 [`data-sources-guide.md`](./data-sources-guide.md)。一句话：UnityProfilerData 答 What、simpleperf 答 Where、perfetto 答 Why。

### 7.2 建议新增（按性价比）
| 数据源 | 补的盲区 | 优先级 |
|---|---|---|
| SurfaceFlinger / FrameTimeline | 用户真实掉帧（应用卡 vs 显示链路卡） | P1（perfetto 加事件，成本极低） |
| Thermal / 温度 + sysfs | 真正判断降频（吸收现有降频观测脚本） | P1（成本极低） |
| simpleperf PMU 计数器 | IPC / cache-miss（优化深层效果） | P2 |
| GPU 深度（AGI/Mali/Adreno） | GPU 瓶颈细节 | P3 |
| 内存全景（meminfo / Unity Memory） | GC 卡顿 / OOM 根因 | P3 |
| ANR / 长卡顿 watchdog | 偶发长卡顿 | P3 |
| 功耗 / power rail | 省 CPU 未省时也能证明省电 | P3 |

新增源数据按 §2 模型归位：可跨源比的进 `core`（指标袋），富数据进 `detail`。

---

## 8. AI 综合分析

- **输入**：各 Run 的 PerfProfile.core 摘要 + 必要 detail 摘要（**不直接喂原始大文件**），可审计可复现。
- **Prompt 模板**（去用例化版）：Run 元数据 + 各源摘要 + 分析要求（跨源印证、标注证据来源、区分确定/可能/需补采、按严重度排序、给可执行建议、输出 insights JSON + Markdown）。
- **insights 结构**：`{ id, severity, confidence, sources[], <source>Evidence[], conclusion, recommendation }`（字段去 Maple 化，证据按源通用命名）。

---

## 9. Asset 与存储

沿用 v1 设计（仍有效）：`Asset` 抽象统一管理原始文件与产物；`storageBackend=local` 起步，接口预留 CDN/对象存储；raw 长期保留（可冷存）、产物可重建可设保留期。本地目录建议：`web/data/assets/{raw,generated}/...`。

---

## 10. Native 符号校验（沿用 v1）

simpleperf 函数名/火焰图质量强依赖符号正确性，上传/分析前校验：APK 内 `.so` 与本地 stripped `.so` 的 SHA256、与 NoStrip `.so` 的 Build ID、`.symtab` 存在性等。结果分级 `PASS / PASS_WITH_WARNING / FAIL`，FAIL 不生成强函数级结论与火焰图。

---

## 11. 命名迁移映射（去 Maple + pdata 改名）

> 重构时统一替换；旧表/旧文件用适配器过渡，不破坏历史数据。

| 旧 | 新 |
|---|---|
| `pdata` / `.pdata`（概念/字段/文案） | **UnityProfilerData**（源 id：`unity_profiler`） |
| `Maple` / `Maple ILOpt`（概念） | 删除；用 `Run` / 单次分析 / 对比分析 / "优化用例" |
| `maple_sample.py` | `sync_capture.py`（同步采集） |
| `maple_compare.py` | `compare_runs.py`（对比） |
| 页面「Maple 对比」「Maple 三源对比分析」 | 「对比分析」 |
| 表 `maple_runs` / `maple_compare_sessions` | `runs` / `analyses` |
| 表 `maple_pdata_results` / `maple_perfetto_results` | 统一 `run_profiles`（core） |
| 硬编码列 `il2cppBasePct` 等 | `core.metrics` 指标袋（`cpu.lib.<name>.pct`） |

---

## 12. 分阶段路线（统筹 v1 P0–P6 + 分层内核）

| 阶段 | 内容 | 备注 |
|---|---|---|
| **P0** | 领域模型确认：PerfProfile（core/detail/raw）+ Run/Analysis schema；命名统一（去 Maple、pdata→UnityProfilerData） | 用户无感地基 |
| **P1** | Asset 抽象 + Provider 化：3 个解析器包成 Provider 产出 PerfProfile；旧表适配器过渡；native 符号校验 | |
| **P2** | 单次分析详情页（消费 1 个 Run）：各源分区 + 概览 + 交叉结论 | 替代各源散页 |
| **P3** | 对比分析页（消费 2 个 Run，统一深层）：可比性 + 交叉校验 + 各源差分 + **可读性优化（§6.3）** | 合并三处旧 diff |
| **P4** | Run 多源关联 + AI 综合分析：协同/事后/手动关联；prompt + insights（去用例化） | |
| **P5** | 新增数据源：FrameTimeline / Thermal（P1 级）→ PMU → 其余 | 每个 = 1 Provider + 1 skill |
| **P6** | 退役冗余 + Executor Registry 收尾：删 Maple 命名/重复页/并行表 | |

原则：**先定 PerfProfile 地基（P0/P1），再动 UI**。

---

## 13. 关键验收标准

1. 每类原始文件都能作为 Asset 存储并追踪；UnityProfilerData 原有功能不回退。
2. 出数据（Provider）与分析（skill）解耦，skill 读 PerfProfile 而非原始文件。
3. 单次分析能给"瓶颈类型 + 交叉结论"，非专家可读。
4. 对比分析统一走深层；**结论先行、术语可展开**，非专家 10 秒内能说出"有没有用、主要变化"。
5. 新增一个数据源只需加 1 Provider + 1 单源 skill，跨源 skill 与 UI 不改。
6. core 支撑趋势/列表/单次展示；趋势查询不重解析原始文件。
7. 全代码库无 `Maple` 关键字；`pdata` 统一为 `UnityProfilerData`。

---

## 14. 待定问题（供后续细化）

- core 指标袋的 `key` 命名规范（命名空间、单位约定）需定稿。
- 显著性判定阈值：是否引入"同配置多次采集"作为方差基准？初期用经验阈值。
- 对比"深层联合"是回读 raw 重解析，还是读已缓存 detail？影响速度，先做重解析。
- 帧口径偏差告警阈值与 UI 呈现。
- 旧表 → 新模型的迁移脚本与兼容期长度。
- Run 关联（协同/事后建议/手动）的具体签名规则（沿用 v1 §8 思路，去用例化）。
