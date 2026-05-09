---
name: perfetto-trace-analysis
description: Analyzes Perfetto .pftrace files for Android Unity games to diagnose CPU scheduling issues, thermal throttling, thread coordination problems, and system-level performance bottlenecks
---

# Perfetto System-Level Performance Analysis

## When to Use This Skill

- User provides a `.pftrace` file (Perfetto trace)
- User asks about Android system-level performance, CPU scheduling, thermal throttling
- User asks about big/little core usage, thread scheduling, frame drops on Android
- User mentions keywords: perfetto, pftrace, systrace, atrace, CPU scheduling, thermal, big core, frequency

## Execution Flow

**You MUST follow this flow in order:**

### Step 1: Run Preprocessing Script

```bash
python .claude/skills/perfetto-trace-analysis/scripts/preprocess.py --input <file.pftrace> --target-fps <fps> --output-dir ./output/perfetto
```

- `<file>`: The .pftrace file the user provided
- `<fps>`: Target FPS (default 30)
- Output: `./output/perfetto/preprocess-result.json`

Wait for this to complete before proceeding.

### Step 2: Read Data and Knowledge Base

#### 2a. Read preprocess-result.json

Read the full output (typically 5-15KB, safe to read entirely).

#### 2b. Read perfetto-knowledge.md

- `.claude/skills/perfetto-trace-analysis/references/perfetto-knowledge.md`

### Step 3: Analyze

Perform ALL analysis dimensions (A-H) described in the Analysis Procedure below.

### Step 4: Generate Report and Self-Check

Generate the final report. Save to `./output/perfetto/`.

The filename MUST include a timestamp: `perfetto-report_YYYYMMDDHHmmss.md`

---

## Analysis Procedure

### A. Frame Rate & Stability

1. Compare actual FPS vs target FPS
2. Analyze frame time distribution (mean, median, P25/P75, min/max)
3. Identify Jank frames (ratio > 2x prev 3-frame average)
4. For Jank frames, determine if caused by: CPU scheduling, frequency drop, or thread contention

### B. CPU Scheduling (Big/Little Core)

1. Report main thread's big-core vs little-core usage percentage
2. Report render thread's big-core vs little-core usage percentage
3. Analyze core migration frequency (too many migrations = scheduling instability)
4. Check if critical threads (Main, Render) are consistently on big cores
5. If on little cores frequently → suggest thread affinity optimization

### C. CPU Frequency & Throttling

1. Report average frequency for big/little clusters
2. Detect throttle events (frequency drop > 20% from max)
3. **Classify throttle type using throttleClassification data:**
   - Check `thermalThrottle` flag — if true, this is confirmed thermal throttling
   - Check `normalDvfs` flag — if true, frequency drops are normal power-saving
   - Review `evidence` array for specific diagnostic signals:
     - Load-frequency divergence: high CPU load + freq drop = thermal
     - Frequency ceiling lock: max-achievable freq decreasing over time = thermal cap
     - Thermal zone temperature: device temp > 42°C = overheating
     - Cluster-wide sync drop: all big cores locked to same low freq = thermal limit
   - Use `thermalScore` (0-10) as confidence indicator
4. Correlate throttle timing with frame time spikes
5. Assess thermal pressure severity:
   - thermalScore ≥ 5: severe thermal throttling, device overheating
   - thermalScore 3-4: moderate thermal impact
   - thermalScore 0-2: unlikely thermal, probably normal DVFS or other cause

### D. Thread Scheduling Efficiency

1. Runnable wait time: how long threads wait in ready queue before getting CPU
   - avg < 1ms: normal
   - avg 1-3ms: moderate contention
   - avg > 3ms: severe contention
2. Preemption analysis: how often game threads are interrupted
   - Check preemptionCount: correlate high preemption with system interference (dimension F)
3. Max runnable time: worst-case scheduling delay
4. Wakeup latency: time from sched_waking event to thread actually getting CPU
   - avg < 0.5ms: normal
   - avg 0.5-2ms: moderate delay
   - avg > 2ms: severe wakeup delay (may indicate CPU overload)

### E. Multi-Thread Coordination

1. Main-Render overlap: are they running in parallel or serial?
2. Render thread idle time (Semaphore.WaitForSignal = waiting for main)
3. Determine frame bottleneck: Main-bound vs Render-bound vs GPU-bound
4. Job Worker utilization:
   - Worker count and total CPU time
   - Big/little core distribution for workers
   - If workers mostly on big cores → may be competing with Main/Render
   - If workers utilization < 10% → job system underutilized
   - If workers utilization > 60% → potential thread pool saturation

### F. System Interference

1. Identify top system processes running on same cores as game
2. Quantify total interference time vs frame budget
3. Flag if surfaceflinger/system_server consume > 5% of frame budget
4. Note any unusual system activity (Bluetooth, PEM, thermal daemon)

### G. GPU Load Analysis (if data available)

1. Check gpuAnalysis.available — if false, state "本 trace 未采集 GPU 数据" and skip
2. If data available:
   - GPU frequency: average vs max (is it at max = saturated?)
   - GPU utilization distribution (average/peak percentage)
   - GPU-bound determination: utilization > 80% + main thread has Gfx.WaitForPresent
3. Combine with E's bottleneck analysis to confirm GPU-bound vs CPU-bound
4. Confidence level: high (direct utilization data) / medium (frequency only) / low (inferred)

### H. Time Segment Analysis

1. Analyze 3 segments (前段/中段/后段) for FPS, frequency, Jank differences
2. Detect temporal patterns:
   - Thermal degradation (performance worsens over time + frequency drops)
   - Burst Spike (Jank concentrated in one segment)
   - Warmup pattern (first segment unstable, then stabilizes)
   - Sustained slow frames (≥5 consecutive frames exceeding 1.5x budget)
3. Conclusion: Is the performance issue persistent or time-degrading?
4. Use patterns.description from preprocess data as supporting evidence

---

## Output Format

Output in **Chinese**, **Markdown** format:

```markdown
# Perfetto 系统级性能分析报告

## 一、概览

| 指标 | 数值 |
|------|------|
| 采集时长 | Xms (X.Xs) |
| 帧数 | N |
| 目标帧率 | X FPS |
| 实际帧率 | X FPS |
| 平均帧耗时 | X ms |
| 中位数帧耗时 | X ms |
| Jank 次数 | X |
| 设备 CPU | X 大核 + X 小核 |

## 二、核心结论

> 2-3 sentences: frame rate status, primary bottleneck (CPU/GPU/scheduling/thermal), key finding

## 三、CPU 调度分析

### 大小核使用
(Table: thread → big core %, little core %, migrations)

### Runnable 等待
(avg/max/p95 runnable time, interpretation)

### 唤醒延迟
(avg/max/p95 wakeup latency, is there wakeup delay?)

### 被抢占分析
(preemption count, correlation with system interference)

### 调度问题判定
(Is scheduling optimal? What's wrong?)

## 四、CPU 频率分析

### 频率概况
(avg freq per cluster, % of max)

### 降频检测
(throttle events count, timing, correlation with frames)

### 降频分类判定
(热降频 vs 正常 DVFS — based on throttleClassification evidence:
 - 负载-频率背离: 高负载时降频 → 热限制
 - 频率天花板锁定: max 频率随时间递减 → thermal cap
 - 温度数据: 设备温度 > 42°C → 过热
 - 全核同步降频: cluster 集体降到相同低频 → thermal limit)

### 热压力风险评估
(thermalScore severity + sustained throttling assessment)

## 五、多线程协作分析

### Main-Render 并行度
(overlap %, who waits for whom, bottleneck determination)

### 帧瓶颈判定
(Main-bound / Render-bound / GPU-bound)

### Job Worker 利用率
(Worker count, total CPU time, big/little core distribution, utilization %)

## 六、系统干扰分析

### 干扰进程 TOP 5
(Table: process, count, total ms, % of frame budget)

### 干扰严重度评估
(Normal / Mild / Severe)

## 七、GPU 负载分析

### GPU 数据可用性
(本 trace 是否包含 GPU 数据？如 gpuAnalysis.available = false，注明"本 trace 未采集 GPU 数据")

### GPU 频率与利用率
(如有数据：avg/max frequency, utilization avg/peak %)

### GPU-bound 判定
(是否 GPU-bound + confidence level + supporting evidence)

## 八、时间段分析

### 分段概况
| 指标 | 前段 | 中段 | 后段 |
|------|------|------|------|
| 帧率 | X FPS | X FPS | X FPS |
| 平均帧耗时 | X ms | X ms | X ms |
| 大核频率 | X MHz | X MHz | X MHz |
| 降频次数 | X | X | X |
| Jank 数 | X | X | X |

### 性能趋势判定
(Detected patterns + evidence from patterns.description)

## 九、优化建议

### P0/P1/P2 suggestions
- 目标问题
- 具体方案
- 预期收益

## 十、补充说明
- 数据局限性
- 建议下一步
```

---

## Output Quality Rules

### Rule 1: Data Truthfulness
All numbers MUST come from preprocess-result.json. Do NOT fabricate data.

### Rule 2: Judgment Criteria
For every conclusion (e.g. "scheduling is poor"), state the evidence with specific numbers.

### Rule 3: Actionable Suggestions
Every optimization suggestion must include specific steps (API calls, settings, code changes).

### Rule 4: Uncertainty Marking
If a conclusion is inferred (not directly from data), mark with [推断].

### Rule 5: Bottleneck Determination
Must clearly state: is the problem CPU-bound, GPU-bound, scheduling-bound, or thermal-bound? With evidence.

---

## Self-Check

After generating the report, verify:

- [ ] All scheduling data referenced correctly (including wakeup latency and preemption)?
- [ ] Throttling events analyzed and correlated with frame timing?
- [ ] Clear bottleneck determination (CPU/GPU/scheduling/thermal)?
- [ ] Optimization suggestions are actionable?
- [ ] All cited numbers match preprocess-result.json?
- [ ] Uncertain conclusions marked [推断]?
- [ ] GPU section: if data unavailable, stated clearly (not fabricated)?
- [ ] Time segment analysis: pattern detection backed by data evidence?

---

## Examples

### Example: Triggering This Skill

```
User: 分析这个 perfetto trace 文件 recording.pftrace，目标帧率 30
```

```
User: 我的 Android 游戏帧率不稳定，这是 pftrace 数据，帮我看看是不是调度问题
```

```
User: 请分析 CPU 大小核调度和降频情况
```
