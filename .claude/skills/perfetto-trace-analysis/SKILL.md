---
name: perfetto-trace-analysis
description: Analyzes Perfetto .pftrace files for Android Unity games to diagnose CPU-bound vs wait-bound bottlenecks, thread scheduling, thermal throttling, off-CPU reasons, and system-level performance, producing a single-source PerfProfile report.
---

# Perfetto 系统级性能分析(单源)

从 perfetto `.pftrace` 产出**单源分析报告**。perfetto 回答 **Why:线程为什么没在跑、机器什么状态**——独占 off-CPU 原因、CPU/GPU 频率与降频、调度状态、binder、热状态、显示链路掉帧。

> **本 skill 已对齐新 PerfProfile 流程**(出数据=Provider 脚本,解读=本 skill 读 summary)。
> 主线: `帧慢是在算还是在等? 等什么? 机器拖后腿了吗?`——围绕这条组织,别平铺指标。

## When to Use

- 用户提供 `.pftrace`,问系统级/调度/降频/瓶颈定型。
- 关键词: perfetto, pftrace, systrace, atrace, CPU 调度, 降频, 大小核, off-CPU, 帧时间线。

不要用于 `.pdata`(用 `unity-profiler-analysis`)或 `perf.data`(用 `simpleperf-native-analysis`)。

## Prerequisites

- perfetto Python 包:`python -c "from perfetto.trace_processor import TraceProcessor; print('OK')"`,缺则 `pip install perfetto`。

## Execution Flow

**必须按序执行。**

### Step 1: 出数据 —— 构建统一 PerfProfile

```bash
python scripts/build_perfetto_profile.py --trace <x.pftrace> --out <out_dir> [--meta <meta.json>]
```

产出到 `<out_dir>/`:
- `perfetto-profile.json` — 全量 PerfProfile(`core.threads/frame/system` + `detail.perfetto` 全量 slice 树 / 降频 / off-CPU …)。**入库/深层用,AI 不直接读。**
- `perfetto-profile-summary.json` — **AI 读这个**(~25KB)。

> `meta.json`(trace 同目录)提供 device/scene/pid/durationSec,缺失也能跑。
> base 样本示例:`--trace output/maple/base_PAL-AL00_20260612_154316/2026-06-12_15-43-be56b7.pftrace --out output/p1-perfetto`

等待完成再继续。

### Step 2: 读 summary(禁读全量)

**✅ 读 `perfetto-profile-summary.json`**(~25KB),含:
- `metrics[]` — `thread.<name>.{running,runnable,sleeping}Pct` / `system.cpuFreqAvgMhz` / `system.binder.*` / `system.pssMb`(命名见 metric-key-naming-spec)。
- `frame[]` — **帧口径 `choreographer`(vsync 节拍,≠ playerloop,禁与 unity 直比)**。
- `threadsSched` — 关键线程 Running/Runnable/Sleeping。
- `system` — 频率 / GPU / binder / 内存。
- `throttling` — `{level: confirmed/suspected/none, evidence, perCpu}`。
- `offCpuReasons` — 主线程非运行时间拆分(若内核含 sched_blocked_reason)。
- `atraceSlices` / `callTrees[]` — 关键线程 atrace slice 树(主循环阶段)。
- `frameTimeline` — expected/actual frame(若 trace 含 actual_frame_timeline,否则 null)。
- `confidence` / `profileWindow`。

需更细(如某线程完整 slice 树、任意 marker 下钻)→ 回读全量或重查 raw(perfetto trace_processor SQL,见 framework §5.5):
```bash
cd <out_dir> && node -e "const p=require('./perfetto-profile.json'); const t=p.detail.perfetto.callTrees.find(x=>x.thread==='UnityMain'); console.log(JSON.stringify(t,null,2).slice(0,4000));"
```

### Step 3: 分析(依据 report-spec §4)

> **三态对比 / 多份 diff 报告**：Web 与手工 CLI 共用 `prompts/triad-prompt.txt` 模板（变量 `{{SKILL_DIR}}` / `{{OUTPUT_DIR}}` / `{{TEMPLATE_PATH}}` / `{{GOLDEN_PATH}}` / `{{FACTS_PATH}}` / `{{SAMPLE_LINES}}`）。手工跑时把变量替换好，stdin 注入 codebuddy CLI；Web 端 `perfetto-triad-service.ts.buildTriadPrompt()` 走同一份模板，**不再各自维护一套指令**。

1. **瓶颈类型定性(核心结论)**:综合主线程 Running vs Sleeping + GPU 忙 → 判 **CPU-bound / 等待型(等 GPU/锁/binder/vsync)**。这是 perfetto 对单次分析最大贡献。
2. **off-CPU 归因**(独占):主线程 Sleeping 高时拆「在等什么」;数据不足时明说。
3. **调度树**:关键线程 atrace slice 树(PlayerLoop→各阶段)+ 占比,看一帧「算 vs 等」分布。
4. **降频判定分级**:`throttling.level` = confirmed(有 sysfs:scaling_max<cpuinfo_max / cooling)/ suspected(仅频率低于额定)/ none。据此对全报告可信度打折。
5. **显示链路掉帧**:`frameTimeline` 有则报 expected vs actual、VSync miss;为 null 标「数据缺失,需采 actual_frame_timeline」。
6. **GPU**:无 GPU busy/频率计数器时,**明说「GPU 是否瓶颈无法定论」**,不臆断。

### Step 4: 出报告 + 自检

中文 Markdown,**结论先行**。文件名 `performance-report_YYYYMMDDHHmmss.md`,存 `<out_dir>/`。

## Output Format(报告结构)

```markdown
# 系统级性能分析报告 · perfetto 单源

> **结论**: (一句普通话:CPU-bound 还是等待型/等什么 + 是否降频 + 可信度)

## 一、瓶颈类型定性(核心)
主线程 Running/Sleeping(`thread.UnityMain.*`)+ GPU 忙 → CPU-bound / 等待型判定 + 依据。

## 二、主循环阶段分解
UnityMain atrace slice 树各阶段占比(脚本/渲染/Canvas/ECS…)。

## 三、off-CPU 归因(独占)
Sleeping 拆分(等 GPU/锁/binder/vsync);数据不足则说明。

## 四、线程调度
关键线程 Running/Runnable/Sleeping 表。

## 五、降频与系统状态
降频分级(confirmed/suspected/none)+ 证据;CPU 频率、binder、内存。

## 六、显示链路掉帧(若有 FrameTimeline)
expected vs actual、VSync miss;无则标数据缺失。

## 七、优化建议 + 局限
点名建议;帧口径/降频/GPU 缺数据/窗口 等可信度声明。
```

## Output Quality Rules(MUST NOT VIOLATE)

1. **帧口径**:`choreographer` ≠ playerloop,**禁与 unity 帧时长直比**;说明它是 vsync 节拍。
2. **瓶颈定型引数值**:Running/Sleeping% 明确给出再下 CPU-bound/等待型结论。
3. **降频分级诚实**:无 sysfs 旁路只能 suspected,不报 confirmed。
4. **GPU/FrameTimeline 缺数据**:明说「无法定论」,不臆断 GPU 瓶颈。
5. **[推断]** 标无直接数据的推理;缺数据标「数据缺失」。
6. **不编造**:线程名/百分比来自 summary;采样窗口(profileWindow)如非全程要标注。
