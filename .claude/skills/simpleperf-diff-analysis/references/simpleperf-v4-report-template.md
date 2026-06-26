# simpleperf 双文件差分性能分析报告 · v4.1 模板

> **本模板基于 v4.1 终极形态沉淀**。AI 写报告时**直接套这个模板填数据**，不要自创结构。
>
> 配套：[SKILL.md](../SKILL.md) · [aoe-cpu-analysis-knowledge.md](../../../../docs/aoe-cpu-analysis-knowledge.md) · gold 参考 `docs/report/performance-report_simpleperf_ULTIMATE_v4.md`

## 报告骨架（必备章节）

```
§0  结论先行
§1  采集元信息与质量门
§2  库（so）维度对比
§3  线程维度对比
§4  全局性能热点 Top-N
§5  主线程深度分析
§6  渲染相关线程
§7  ECS / Worker 线程
§8  中间件 — Wwise 专章
§9  Lua GC 工作线程专章
§10 反查清单（运行时函数 → 业务模块）
§11 本源能力边界
```

文首元数据块:

```markdown
# simpleperf 单源 性能分析报告 · 终极形态 v4.1.1

> 配套：[知识库 v2.1](../aoe-cpu-analysis-knowledge.md) · 差分火焰图（若有）。
> 数据列只放纯数字，混合内容拆到说明列。所有百分比默认"全局占比"（占采集总样本数）。
> **术语**：`base` = 基线采集；`cur` = 当前采集。`cur` 与具体场景解耦，使报告可模板化。
```

---

## §0 结论先行（模板）

### 形式硬规则

- 用 **bullet 列表** 写 4–6 条核心结论，末尾 **ROI 优化方向编号列表**
- 必含：系统总工作量变化%、业务层变化%、显著业务模块暴涨（点名 ECS/Wwise/MeshUI/行军线等）、GPU bound 判定、主观帧率（若有）
- `probe.gpu.bound` = green 时写：**未观察到 CPU 侧 GPU bound 信号**，并注明 simpleperf 不直接观测 GPU 顶点处理
- 禁止在 §0 放对比表格

```markdown
## §0 结论先行

**本次采集**（<设备> / <cur 场景> / <时长>s）相比 base <base 场景>：

- **系统总工作量上升 +XX.X%**，其中**业务层绝对工作量 +YY.Y%**。
- **N 项业务模块出现显著负载暴涨**（详见 §4）：
  - ECS Burst Job … — 已下沉 Worker 并行，**不阻塞主线程**
  - Wwise … — 独占线程
  - MeshUI … — 主线程
  - 行军线 … — 主线程
- **未观察到 CPU 侧 GPU bound 信号**（…）。GPU 实际工作量需 perfetto / RenderDoc 复核。
- 主观帧率 ~XXfps …

按 ROI 排序的优化方向：

1. **Wwise …**
2. **MeshUI …**
3. …
```

---

## §1 采集元信息与质量门

### 1.1 元信息表

| 项 | base | cur |
|---|---|---|
| 场景 | … | … |
| 设备 | … | 同 |
| 采集事件 | cpu-cycles:u | 同 |
| 采样频率（Hz）| … | … |
| 时长（s）| … | … |
| 总采样数 | … | … |
| 系统总工作量比 | 1.000 | … |
| 主观帧率 | — | … |

数据来源: `meta`, `diff` 中 base/cur totalSamples, `meta.systemPressureDeltaPct`.

### 1.2 符号化质量

| 指标 | base | cur | 阈值 | 判定 |
|---|---|---|---|---|
| 总状态 | … | … | — | 🟢/🔴 |
| 应用层符号化率 | … | … | ≥85% | … |
| kernel% | … | … | — | … |
| unknown% | … | … | <10% | … |
| 栈回溯锚点命中 | … | … | ≥3/4 | … |
| `__start_thread` 可达率 | … | … | 任意 PASS | … |

数据来源: `symbolCheck.base` / `symbolCheck.cur`.

---

## §2 库（so）维度对比

### 2.1 库占比（按绝对增量降序）

| 库 | 绝对增量 | 增量% | cur abs | base abs | 占比 cur % | 说明 |
|---|---|---|---|---|---|---|
| **lib_burst_generated** | … | … | … | … | … | ECS Burst Job |
| **libAkSoundEngine** | … | … | … | … | … | Wwise |
| libil2cpp | … | … | … | … | … | C# 业务 |
| … | … | … | … | … | … | … |

#### 库占比绝对增量柱状图（有显著正负增量时必写）

```mermaid
xychart-beta
    title "库占比 base→cur 绝对增量 (samples)"
    x-axis ["Burst", "AkSnd", "il2cpp", ...]
    y-axis "样本数增量" <min> --> <max>
    bar [...]
```

### 2.2 业务层拆分

写清 **业务层定义**（il2cpp + xlua + burst + 项目 native），表格:

| 子项 | 增量 abs | 占业务总增量 | 说明 |
|---|---|---|---|
| lib_burst_generated | … | …% | ECS Burst（Worker 并行）|
| libil2cpp | … | …% | C# 主线程 |
| libxlua | … | …% | Lua VM |
| **合计** | … | 100% | — |

**关键解读**：Burst 占比高 ≠ 主线程膨胀。

### 2.3 libc 等运行时库（可选）

若 libc 增量与系统压力同步，一句说明「不需要单独反查」。

---

## §3 线程维度对比

### 3.1 线程占比 + 身份识别

| 真实身份 | 绝对增量 | 增量% | cur abs | base abs | cur % | 线程代号 (comm) | 说明 |
|---|---|---|---|---|---|---|---|
| **Wwise 工作线程** | … | … | … | … | … | NativeThread | tid … |
| 主线程 | … | … | … | … | … | UnityMain#tid | … |
| Job Worker #1–#4 | … | … | … | … | … | Thread-… | ECS 并行 |
| RHI 线程 | … | … | … | … | … | … | … |
| Render 线程 | … | … | … | … | … | UnityGfxRenderS | … |
| **Lua MtGC** | … | … | … | … | … | UnityMain（误名）| tid **19816** |

### 3.2 线程身份地图（每条关键线程一小节）

对 Wwise / UnityMain / RHI / Render / JobWorker 池 / Lua MtGC 各写 2–4 句：tid、top lib、是否红线。

---

## §4 全局性能热点 Top-N

### 4.1 探针红绿灯摘要

列出 `redProbes` 全文 + `yellowProbes` 摘要表格:

| 探针 | base | cur | 阈值 | verdict | 说明 |
|---|---|---|---|---|---|

### 4.2 Top 热点表（来自 `topN`）

| 排名 | 模块/函数 | cur 全局% | abs Δ | 线程归属 | 说明 |
|---|---|---|---|---|---|

### 4.3–4.6 业务模块专段（每个 red/yellow 模块一小节）

结构: **现象 → 数据 → 业务含义 → 优化方向**

必覆盖（若 summary 有数据）:
- 4.3 ECS Burst / Job System
- 4.4 MeshUI / MUILayout
- 4.5 行军线 OutSideViewArmyLineMgr
- 4.6 其他显著模块

结合 `docs/aoe-cpu-analysis-knowledge.md` 写业务含义，数字仍来自 summary。

---

## §5 主线程深度分析

### 5.1 PlayerLoop 阶段对比

| 阶段 | base abs | cur abs | Δ abs | Δ% | cur 全局% | 说明 |
|---|---|---|---|---|---|---|

数据来源: `diff.playerLoopStages`.

### 5.2 主线程 call tree 缩进树

用 `mainThreadTree.root` 渲染 ASCII 缩进树（depth≤5，标注 self% / markers）:

```
ExecutePlayerLoop (…)
  ScriptRunBehaviourUpdate (…)
    …
```

### 5.3 主线程结论

2–3 段：主线程增量来源、是否与 MeshUI/行军线一致、是否被 Worker 误解为「业务暴涨」。

---

## §6 渲染相关线程

### 6.1 RHI 线程（tid …）

top 函数、ConstantBuffersGLES 等 GLES 上传增量。

### 6.2 Render 线程（UnityGfxRenderS）

URP 脚本调度占比变化。

### 6.3 GPU bound 判定

- 引用 `probe.gpu.bound`
- green: **未观察到 CPU 侧 GPU bound 信号**
- 写明 simpleperf 局限

---

## §7 ECS / Worker 线程

### 7.1 Job Worker 池负载均衡

四路 Worker abs 对比，是否均衡。

### 7.2 Burst Job 与业务模块关联

lib_burst_generated 增量与 §4.3 交叉引用。

---

## §8 中间件 — Wwise 专章

- 线程 tid、libAkSoundEngine 占比
- base→cur 增量叙事
- `redProbes` 中 wwise 相关 verdict
- 优化建议（战斗音效复杂度、Voice 数等）

---

## §9 Lua GC 工作线程专章

- **tid 19816**，identity `lua_mtgc_worker`
- 入口 `LuaMultiThreadGC_LuaGCThreadProc`
- comm 误名 UnityMain 的解释
- base vs cur 工作量变化

---

## §10 反查清单（运行时函数 → 业务模块）

| 运行时符号 | cur 全局% | Δ | Top 上游调用者 | 归属业务模块 |
|---|---|---|---|---|

数据来源: `diff.callUpTracing`，按 cur 全局% 或 absDelta 排序。

---

## §11 本源能力边界

分档列出 simpleperf **能 / 不能** 回答的问题:

| 问题 | 能否 | 替代数据源 |
|---|---|---|
| 函数级 CPU self% / 库线程对比 | ✅ | 本报告 |
| 业务模块剥洋葱 | ✅ | businessModules |
| GPU 是否满载 | ❌/🟡 | perfetto GPU counter |
| off-CPU / 等锁 / binder | ❌ | perfetto sched |
| 降频 / 热节流 | ❌ | perfetto cpufreq |
| Wwise 内部分解 | 🟡 | 仅见 libAkSoundEngine 聚合 |

末尾 **工程化建议**（2–4 条）: 与 perfetto 互补采数、符号缓存维护等。

---

## 自检清单（写完必过）

- [ ] §0–§11 章节齐全，顺序正确
- [ ] 系统压力 % 与 `meta.systemPressureDeltaPct` 一致
- [ ] GPU bound green 措辞正确
- [ ] tid 19816 标为 Lua MtGC
- [ ] 无旧版「一、符号校验」格式
- [ ] 已写入 `report/performance-report_simpleperf_v4.md` 并复制 `performance-report.md`
