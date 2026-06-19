# simpleperf-native-analysis Skill

分析 Android **native C++ / CPU 周期**性能(libil2cpp / libunity / libxlua / lib_burst_generated 等),从 simpleperf `perf.data` 产出**单源分析报告**。它是 `unity-profiler-analysis`(引擎语义层 What)的 **native 层对应物(Where:CPU 周期具体花在哪个函数/库)**。

> **本 skill 已对齐新 PerfProfile 流程**(出数据=Provider 脚本,解读=本 skill 读 summary)。
> 工具根目录: `K:\AI\PerfAnalysisTool_Codebuddy\simpleperf\`

## When to use this skill

- 用户提供 `perf.data`(+ `binary_cache`),要 native/CPU 热点、函数级分析。
- 关键词: simpleperf, perf.data, libil2cpp, libxlua, native profiling, 函数级热点, 火焰图。
- **单次分析** → 走本 skill 新流程。**A/B 两份对比 / 多版本回归 / 火焰图 SVG** → 见末尾「Legacy 工具(对比/火焰图)」。

不要用于 Unity `.pdata`(用 `unity-profiler-analysis`)或 perfetto trace(用 `perfetto-trace-analysis`)。

## Prerequisites

- Python 3(NDK simpleperf 的 `report_html.RecordData` 依赖)。
- NDK simpleperf 目录可达,默认 `D:/Android/android-ndk-r21e-windows-x86_64/simpleperf`(可用环境变量 `NDK_SIMPLEPERF_DIR` 覆盖,见 `simpleperf_analyzer/config.py`)。
- `binary_cache/` 符号目录(采集产出或 NDK 自带);缺失则函数名退化为 `lib.so[+offset]`,符号校验会 FAIL。

## Execution Flow

**必须按序执行。**

### Step 1: 出数据 —— 构建统一 PerfProfile

```bash
python simpleperf/build_simpleperf_profile.py --perf <perf.data> --binary-cache <binary_cache_dir> --out <out_dir> [--top-func 30]
```

产出到 `<out_dir>/`:
- `simpleperf-profile.json` — 全量 PerfProfile(`core` 指标袋 + `detail.simpleperf` 全量分层 callTrees / 符号校验 / anchors …)。**入库/对比深层用,AI 不直接读(大)。**
- `simpleperf-profile-summary.json` — **AI 读这个**(~65KB:指标袋全量 + symbolCheck + layerBreakdown + hotspots + threads + libs + anchors + 剪枝 callTrees)。
- `simpleperf-folded.txt` — folded stacks(喂 flamegraph.pl 出 SVG)。

> base 样本示例:`--perf output/maple/base_PAL-AL00_20260612_154316/perf.data --binary-cache output/maple/base_PAL-AL00_20260612_154316/binary_cache --out output/p1-simpleperf`

等待完成再继续。

### Step 2: 读 summary(禁读全量)

**⛔ 禁止**用 Read 工具读 `simpleperf-profile.json`(大)。**✅ 读 `simpleperf-profile-summary.json`**(~65KB),它含分析所需全部:
- `metrics[]` — 指标袋(`cpu.lib.<so>.pct` / `cpu.thread.<t>.pct` / `cpu.func.<f>.selfPct` / `cpu.anchor.<a>.subtreePct`,命名见 `docs/metric-key-naming-spec.md`)。
- `symbolCheck` — `{status: PASS/PASS_WITH_WARNING/FAIL, appSymbolizedPct, anchorsResolved/Total, notes}`。**报告必须先报它**。
- `layerBreakdown` — `{business, engine, runtime, noise}` 各层 CPU 占比。
- `hotspots` / `libs` / `threads` / `anchors` — top 热点函数 / so 占比 / 线程占比 / 锚点子树。
- `callTrees[]` — 每线程统一结构调用树(剪枝;节点带 `layer`)。
- `confidence` / `event`(`cpu-clock` 占比 vs `cpu-cycles:u` 缩放周期)。

需要 summary 之外的数据(如某函数完整子树)时,用脚本从全量取,**不要整读**:
```bash
cd <out_dir> && node -e "const p=require('./simpleperf-profile.json'); const t=p.detail.simpleperf.callTrees.find(x=>x.thread==='UnityMain'); console.log(JSON.stringify(t,null,2).slice(0,4000));"
```

### Step 3: 分析(依据 report-spec §3)

1. **符号校验先行**:`symbolCheck.status` = FAIL → **不给强函数级结论与火焰图**,只给 so/线程级 + 告警(需求 §10)。PASS/WARN 才继续。
2. **分层定位(根因导向,别只列函数)**:
   - **业务层**(libil2cpp/libxlua 带业务名函数)= 有优化意义。
   - **引擎层**(libunity)= 次要。**底层噪音**(libc/kernel/vdso)= 过滤,但若是 **atrace 埋点开销**(`vfprintf`/`write`/`snprintf` 高)要点出「观测者效应,正式基线应关 atrace 重采」。
3. **so 占比(Level 1)+ anchor 子树(Level 2)** = 抗内联的稳定聚合;**热点函数 self(Level 3)** 给具体单点 + 调用链(从 callTrees 取)。
4. **运行时开销归因**(simpleperf 独占):`layer='runtime'` 聚合(虚表/icall/GC barrier)——别的源看不见。标注「重要但与用例相关」。
5. **Job.Worker 逐 job**:样本不足时(显示样本数 <1000)标「以 Unity Profiler 为准」。

### Step 4: 出报告 + 自检

中文 Markdown,**结论先行**(report-spec §0)。文件名带时间戳 `performance-report_YYYYMMDDHHmmss.md`,存 `<out_dir>/`。

## Output Format(报告结构)

```markdown
# CPU 性能分析报告 · simpleperf 单源

> **结论**: (一句普通话:CPU 集中在哪/头号热点/性质 + 首要建议 + 可信度)

## 一、符号校验(可信度门槛)
PASS/WARN/FAIL + appSymbolizedPct + anchorsResolved。FAIL 则下方函数级结论降级。

## 二、概览 · so 占比(Level 1)与线程 CPU
各 so 占比(`cpu.lib.*`)、各线程占比(`cpu.thread.*`);分层 layerBreakdown(business/engine/runtime/noise)。

## 三、热点函数(Level 3,self-time)
### 热点 #N: [func]
- self% + 所属层 + 完整调用链(从 callTrees,带 layer)
- self/total 比 → 瓶颈类型(自身循环 / 运行时开销 / 高频累积)

## 四、Anchor 子树(Level 2,抗内联)
锚点子树占比(命中时);未命中标「栈未回溯到该入口,本样本不可用」。

## 五、运行时开销归因(simpleperf 独占)
虚表/icall/GC barrier(runtime 层)聚合占比。

## 六、优化建议(按杠杆)
点名到 so/函数 + 动作 + 预期 + 风险。

## 七、局限与可信度
event 类型(ms 是否缩放)、atrace 观测偏差、Job.Worker 样本量、符号 unknown%。
```

## Output Quality Rules(MUST NOT VIOLATE)

1. **符号校验门槛**:FAIL 时不给强函数级结论/火焰图。
2. **分层根因**:区分 业务/引擎/噪音;噪音里的 atrace 埋点开销要点明观测偏差,不当业务热点。
3. **完整调用链**:每个热点带从线程入口到该节点的链(fenced code block,带 self/total%)。
4. **判定依据透明**:每个「是/不是热点」引具体 self%。
5. **event 标注**:`cpu-cycles:u` 的 ms 是缩放周期数(相对值,标 `relative`);`cpu-clock` 为采样占比。
6. **[推断]** 标无直接数据支撑的推理;缺数据标「数据缺失」。
7. **不编造**:函数名/百分比均来自 summary。

## Legacy 工具(A/B 对比 / 火焰图,非单源)

单源分析走上面新流程。以下旧工具用于**对比/火焰图**(P3 统一对比报告落地前的现成能力):
```bash
# A/B 对比 (Level1/2/3 + 差分火焰图)
python scripts/compare.py BASELINE.data CURRENT.data --binary-cache BC --out result/compare
# folded → SVG
# (用 Step1 产的 simpleperf-folded.txt 喂 FlameGraph/flamegraph.pl)
```
> 对比报告的可读性重构(决策 9:5 步结论先行)属 P3,届时由 `cross-source-analysis` skill 统一收口。
