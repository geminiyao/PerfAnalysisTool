# cross-source-analysis Skill

源无关的**跨源综合分析** skill。消费**一个多源 Run**(同一次采集的 unity_profiler + simpleperf + perfetto 合并体),产出**一份高置信结论报告**:把三源各自的盲区用彼此补齐,按"问题→根因→建议"收敛成**共性问题(多源同向印证→高置信)+ 各源独有问题(只有某源看得到→不可替代)**。

这是 `unity-profiler-analysis` / `simpleperf-native-analysis` / `perfetto-analysis` 三个**单源** skill 的上层收口(framework §6 的 "1 个跨源 skill")。

## When to use

触发条件:
- 用户要"综合 / 交叉 / 三源一起看 / 到底瓶颈在哪 / 单源结论互相矛盾怎么办"。
- 已有同一次采集的 ≥2 源数据(各自单源 profile 已产出)。
- 需要"单次分析详情页顶部的交叉结论卡"(report-spec §8)。

不要用于:单源深钻(交给对应单源 skill)、两次采集的版本对比(那是 compare 模式,仍归各单源 skill + 本 skill 的对比分支)。

## 核心原则(必须遵守)

1. **方向一致 → 高置信;方向矛盾 → 先找原因**(framework §3.4)。绝不在矛盾未解释时下结论。
2. **帧口径禁直比**:`playerloop`(Unity 主循环墙钟)≠ `choreographer`(vsync 节拍)≠ `frametimeline`(显示链路)。比之前先对齐口径与**采样窗口**。
3. **结论先行 + 证据可溯源**(report-spec §0):每条结论挂 `Metric.key` 或 `detail.<source>.<path>` 出处,不确定标 `[推断]`,缺数据标"数据缺失"。
4. **三源职责**:unity=**What**(每帧哪个子系统)、simpleperf=**Where**(CPU 花在哪个 native 函数/库)、perfetto=**Why**(线程在跑还是在等、机器状态)。

## 工作流

### 1) 合并为多源 Run(若尚未合并)
```bash
# 把同次采集的多份单源 PerfProfile 合并成一份, 再入库成 1 个多源 Run
cd web
npx tsx server/scripts/merge-run.ts --out ../output/<feat>/merged-profile.json \
  --profile <unity-profile.json> --profile <simpleperf-profile.json> --profile <perfetto-profile.json>
npx tsx server/scripts/ingest-run.ts --profile ../output/<feat>/merged-profile.json \
  --run-id <run_id> --device <d> --scene <s>
```

### 2) 跑确定性关联(算指标,不下结论)
```bash
npx tsx server/scripts/cross-source-correlate.ts --run-id <run_id> --out ../output/<feat>/cross-source-evidence.json
```
产出的 `cross-source-evidence.json` 是本 skill 的**唯一数据输入**(不要再去翻原始大文件)。它已按主题汇好:
- `frame[]`(各源帧口径)、`bottleneckInputs`(主线程 Running/Sleeping + CPU 占比 + GPU忙 + 降频)
- `cpuLibs / cpuThreads / cpuFuncsTopSelf / anchors / symbolCheck / simpleperfLayerBreakdown`(simpleperf)
- `scheduling / system / offCpuReasons`(perfetto)、`gc / jank`(unity)
- **具体落地用 (必须写进报告, 别只写宏观)**:
  - `unityHotMarkers`(Top 热点 marker: self/占帧/调用链/线程)、`unitySpikes`(Top 波动: 倍数 + 帧窗口)、`unityThreadSummary`、`unityBusinessHotNodes`(调用树里 self 最重的业务节点, 如各 Mgr)
  - `simpleperfBusinessHotNodes`(native 业务函数, 印证 unity 热点是真 CPU 还是运行时开销)
  - `perfettoStageBreakdown`(主循环各阶段占比, "一帧时间去哪了")、`perfettoAtraceSlices`
  - `sourceMapAvailable`(false=未配 projectPath, 建议只能到 marker/manager 级)
- `mainLoopStages` / `crossRefs`(同一现象三树命中)、`confidence.notes`

### 3) 解读并写报告(本 skill 的活)
按下方结构写 markdown 报告。**先判瓶颈类型,再列共性/独有,最后给建议。**

## 报告结构(强制,自上而下)

1. **一句话结论 + 置信度**(最顶部):瓶颈类型 + 点名最贵的具体热点 + 首要建议。术语在此之后。
2. **同源性 / 可比性校验**:三源是否同一次采集?帧口径差异与采样窗口差异显式列出。
3. **瓶颈类型定型(核心)**:综合 `bottleneckInputs` 判 **CPU-bound / 等待型 / 降频**。引 perfetto Running% + simpleperf 线程占比;GPU 数据缺失时**明说无法定论**。
4. **主循环阶段分解**:用 `perfettoStageBreakdown` + unity marker ms,给"一帧时间去哪了"的占比表(脚本/渲染构建/Canvas/ECS…)。
5. **Top 热点清单(落地核心, 别省)**:用 `unityHotMarkers` + `unityBusinessHotNodes` + `simpleperfBusinessHotNodes`,**逐条**给:热点名 + unity 占帧 self + simpleperf native 印证 + 调用链 + 性质(自身循环/GC/等待)。这是单源报告的精华,跨源版必须有且更强(三源加持)。
6. **Top 波动 / 慢帧清单**:用 `unitySpikes`(倍数 + 帧窗口)+ `gc`,定位 P95/P99 来源。
7. **共性 / 各源独有**:`crossRefs` 给共性(≥2 源同向);各源独有(simpleperf 运行时开销/atrace 埋点开销、perfetto 降频/off-CPU、unity 子系统/Jank)。
8. **可执行建议(按杠杆, 点名到具体对象)**:每条点名 manager/marker/函数 + 动作 + 预期 + 证据。`sourceMapAvailable=false` 时注明只能到 manager 级、需配 projectPath。
9. **局限与可信度**:抄 `confidence.notes`;符号 FAIL / 降频 / 窗口 / 缺 GPU 时对结论打折说明。

> **铁律**:跨源报告是"最可落地的主报告",**必须 ≥ 单源报告的具体度**(有 Top 热点、Top 波动、点名建议),再叠加跨源印证与瓶颈定型。**只有宏观数据和泛泛建议 = 不合格**(看完跟没看一样)。

## 质量门(验收勾选,report-spec §6)
- [ ] 顶部普通话结论 + 置信度;术语在后。
- [ ] 矛盾(如帧率口径)已解释,未解释不下结论。
- [ ] 每条结论挂 `key`/`detail` 出处;`[推断]` / "数据缺失"如实标。
- [ ] 共性结论标注涉及哪些源;独有结论标注唯一来源。
- [ ] GPU/降频/符号/窗口等可信度因素已影响结论强度。

## 注意
- 本 skill **只读 `cross-source-evidence.json`**(+ 必要时回读 `detail.<source>.callTrees`),不读原始大文件;深层定制下钻(如某 manager 子任务)回读 raw,见 framework §5.5。
- simpleperf 的 ms 若来自 `cpu-cycles:u` 是缩放周期数(相对值);若 `cpu-clock` 是采样占比。绝对占比受采集时 atrace 等观测开销影响,跨源对比时注意。
