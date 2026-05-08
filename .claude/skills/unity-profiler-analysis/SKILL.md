---
name: unity-profiler-analysis
description: Analyzes Unity Profiler pdata files to identify CPU performance bottlenecks, diagnose Jank stuttering and hotspot markers, and generate detailed performance reports with optimization suggestions
---

# Unity Profiler CPU Performance Analysis

## When to Use This Skill

- User provides a `.pdata` file or parsed profiler JSON data
- User asks to analyze CPU performance, frame time, Jank/stutter, or hotspot functions
- User asks for performance report, bottleneck identification, or optimization suggestions
- User mentions keywords: pdata, profiler, frame rate, Jank, call tree, performance analysis

## Execution Flow

**You MUST follow this flow in order:**

### Step 1: Run Preprocessing Script

Execute the preprocessing script to generate structured analysis data:

```bash
npx tsx .claude/skills/unity-profiler-analysis/scripts/preprocess.ts --input <file> --target-fps <fps>
```

- `<file>`: The .pdata or .json file the user provided
- `<fps>`: Target FPS from config.json (default 30), or user-specified value
- Output is saved to: `.claude/skills/unity-profiler-analysis/output/preprocess-result.json`

Wait for this to complete before proceeding.

### Step 2: Run Source Mapping (if projectPath configured)

If `config.json` has a non-empty `projectPath`, run source mapping:

```bash
npx tsx .claude/skills/unity-profiler-analysis/scripts/map-source.ts --input .claude/skills/unity-profiler-analysis/output/preprocess-result.json --project <projectPath>
```

Output: `.claude/skills/unity-profiler-analysis/marker-source-map.json`

Skip this step if `projectPath` is empty.

### Step 3: Read Data and Analyze

**IMPORTANT: Do NOT read these files in full. They can be 100-500KB. Use the extraction methods below to stay within token budget.**

#### 3a. Read preprocess-result.json (selective extraction)

Execute a script to extract only the needed fields:

```bash
cd .claude/skills/unity-profiler-analysis/output && node -e "
const data = require('./preprocess-result.json');
const result = {};
result.frameSummary = data.frameSummary;
result.markersTop20 = data.markers.slice(0, 20).map(m => ({
  name:m.name, msSelfMean:m.msSelfMean, msSelfMax:m.msSelfMax,
  msTotalMean:m.msTotalMean, percentOfFrame:m.percentOfFrame,
  count:m.count, callsPerFrame:m.callsPerFrame,
  presentOnFrameCount:m.presentOnFrameCount, thread:m.thread,
  callChain:m.callChain, mustReport:m.mustReport
}));
result.jankFrames = data.jankFrames.map(j => ({
  frameIndex:j.frameIndex, totalMs:j.totalMs, category:j.category,
  jankMultiplier:j.jankMultiplier, hotPath:j.hotPath, mustReport:j.mustReport
}));
result.markerSpikes = data.markerSpikes;
console.log(JSON.stringify(result, null, 2));
"
```

This outputs ~10-20KB instead of 452KB.

#### 3b. Read marker-source-map.json (grep entries only)

Since this file is now small (~27KB, only grep-matched entries), you can read it directly:
- `.claude/skills/unity-profiler-analysis/marker-source-map.json`

Only entries with `source: "grep"` contain useful source code mappings.

This outputs only source-mapped entries (~5-15KB instead of 107KB).

#### 3c. Read unity-cpu-knowledge.md

This file is small (~19KB), read it in full:
- `.claude/skills/unity-profiler-analysis/references/unity-cpu-knowledge.md`

#### 3d. Read source code for hotspot markers

For markers that have source mappings (from 3b), read the relevant source files to perform root-cause analysis with actual code context.

Then perform analysis following the procedure below.

### Step 4: If Needed, Query Specific Frames

If you need more detail on a specific frame (e.g. a marker's self/total < 20% and you need to see deeper children):

```bash
npx tsx .claude/skills/unity-profiler-analysis/scripts/query-frame.ts --input <file> --frame <index> --depth 10
```

### Step 5: Generate Report and Self-Check

Generate the final report, then run self-check. Save to `.claude/skills/unity-profiler-analysis/output/performance-report_<timestamp>.md`

The filename MUST include a timestamp suffix in format `YYYYMMDDHHmmss` (local time when generating the report). Example: `performance-report_20260508172030.md`

---

## Analysis Procedure

Perform ALL of the following (not either/or):

### A. Jank Stutter Analysis

For each item in `jankFrames`:
1. Read the `callTreeSummary` and `hotPath`
2. Identify the bottleneck node:
   - Look for nodes marked `**BOTTLENECK**` (self-time > 30% of parent)
   - If none marked, find the node with highest absolute self-time
   - If all self-times are low but total is high → breadth problem (too many sub-calls)
3. Note the `category` and look for patterns across multiple Jank frames
4. If available, reference `marker-source-map.json` for source location

Aggregate analysis:
- Group Jank frames by category
- Same category appearing multiple times → systemic issue (high priority)
- Single occurrence → one-off (lower priority)

### B. Hotspot Analysis (Steady High Self-Time)

From `markers` list (already sorted by self-time descending):
1. **You decide** which markers are performance hotspots — there is NO fixed top-N cutoff
2. State your judgment criteria explicitly in the report (which values led you to this conclusion)
3. For each hotspot:
   - Report full call chain
   - Analyze self-time / total-time ratio → determine bottleneck type:
     - self/total > 50% → function itself is the bottleneck
     - self/total < 20% → bottleneck in deeper children (consider query-frame)
     - count/frame > 5 and low per-call time → high-frequency accumulation
   - Reference source code if available

### C. Marker Spike Analysis (Volatile Markers)

From `markerSpikes` list:
1. **You decide** which volatile markers represent real problems
2. Consider: how high is the spike ratio? How many frames are affected? What's the impact on those frames?
3. State judgment criteria in the report

### D. Special Marker Interpretation

| Marker | If self-time is high | Conclusion |
|--------|---------------------|-----------|
| `Gfx.WaitForPresent` | CPU waiting for GPU | GPU Bound — CPU optimization has limited effect |
| `WaitForTargetFPS` | CPU is idle waiting for vsync | CPU load is light, frame budget has headroom |
| `WaitForRenderThread` | Main thread waiting for render thread | Render thread is the bottleneck |

### E. Root Cause Reasoning

Combine:
- Unity performance knowledge (from `references/unity-cpu-knowledge.md`)
- Source code snippets (from `marker-source-map.json`)
- Call chain patterns

To determine WHY each bottleneck exists.

---

## Output Format

Output in **Chinese**, **Markdown** format. Follow this structure:

```markdown
# CPU 性能分析报告

## 一、概览

| 指标 | 数值 |
|------|------|
| 总帧数 | (from frameSummary.count) |
| 目标帧率 | (from config.targetFps) |
| 实际平均帧率 | (from frameSummary.actualFps) |
| 平均帧耗时 | (from frameSummary.mean) |
| 中位数帧耗时 | (from frameSummary.median) |
| 最差帧 | #index (ms) |
| Jank 次数 | (from frameSummary.jankCount) |
| BigJank 次数 | (from frameSummary.bigJankCount) |

## 二、核心结论

> 2-3 sentences summarizing the most critical findings.

## 三、Jank 卡顿分析

### 卡顿模式总结
(Table grouping Jank frames by category)

### BigJank/Jank #N: [description]
- 耗时 / 倍数
- 完整调用链
- 瓶颈节点 + self-time
- 源码位置 (if available)
- 根因分析

## 四、热点分析

### 判定依据
(Explain why you identified these markers as hotspots, citing specific numbers)

### 热点 #N: [MarkerName]
- 调用链
- self-time / total-time ratio
- 每帧调用次数
- 瓶颈类型
- 源码位置 (if available)
- 根因分析

### 特殊 Marker 说明
(Gfx.WaitForPresent, WaitForTargetFPS, etc.)

## 五、Marker 波动分析

### 判定依据
(Why these volatile markers are problems)

### 波动 Marker #N: [name]
- spike ratio, spike frame count
- 分析

## 六、优化建议

### P0: [title]
- 目标 Marker
- 源码位置
- 预期收益
- 具体方案
- 风险

### P1: ...

## 七、补充说明
- 数据局限性
- 建议下一步
```

---

## Output Quality Rules (MUST NOT VIOLATE)

### Rule 1: MUST_REPORT Full Coverage
Every item in the input data with `"mustReport": true` MUST be analyzed individually in the report. You may NOT skip, merge, or gloss over any of them.

### Rule 2: Complete Call Chains
Every performance problem mentioned in the report MUST include a complete call chain (from PlayerLoop or top-level down to the bottleneck node).
- ❌ INVALID: "GC.Collect caused the Jank"
- ✅ VALID: "PlayerLoop → Update → ScriptRunBehaviourUpdate → xlua.call → LuaEnv.Tick → GC.Collect"

### Rule 3: Actionable Optimization Suggestions
Every optimization suggestion MUST include specific, executable steps.
- ❌ INVALID: "建议优化物理性能"
- ❌ INVALID: "减少开销"
- ✅ VALID: "启用 Layer-based collision filtering（Edit → Project Settings → Physics → Layer Collision Matrix），将不需要碰撞的层设置为不交互"

### Rule 4: Transparent Judgment Criteria
For every "is a hotspot / is not a hotspot" conclusion, you MUST state the evidence (citing specific numbers).
- ❌ INVALID: "YourLogic 是热点"
- ✅ VALID: "YourLogic: self-time 10ms，占帧 47.8%，每帧稳定出现，判定为热点"

### Rule 5: Uncertainty Marking
If a conclusion lacks direct data support (e.g. inferring sub-call relationships, guessing root causes), you MUST mark it with [推断].
- ❌ INVALID: "这是因为碰撞体过多"
- ✅ VALID: "[推断] 可能是碰撞体数量过多导致宽相位检测耗时高"

### Rule 6: Data Truthfulness
All frame numbers, timing values, marker names, and percentages cited in the report MUST come from the input data. Do NOT fabricate any data. If you need to reference data not present in the input, state "数据缺失".

---

## Token Usage Reporting

After each step completes, report the estimated token consumption for that step:

```
[Step 1] preprocess.ts executed — ~0 token (script only, no AI read)
[Step 2] map-source.ts executed — ~0 token (script only)
[Step 3] Read preprocess-result.json — ~25K token (frameSummary + markers top 20 + hotPaths + spikes)
[Step 4] query-frame × 2 calls — ~3K token
[Step 5] Report generation — ~5K token
Total estimated: ~33K token
```

Estimation method:
- 1KB JSON/text ≈ 300-400 token
- Script execution (Bash) that only checks stderr: ~0 token for the output
- Read tool output: count the approximate KB read × 350

---

## Self-Check (Execute After Report Generation)

After generating the report, verify:

- [ ] All `mustReport: true` items covered?
- [ ] Every analyzed hotspot/Jank has a complete call chain?
- [ ] Every optimization suggestion has concrete steps?
- [ ] Judgment criteria stated for all hotspot/spike determinations?
- [ ] All cited data matches the input (no fabrication)?
- [ ] Uncertain conclusions marked with [推断]?

If ANY item fails → fix it before outputting the final report. The user should only see the self-checked final version.

---

## Examples

### Example: Triggering This Skill

```
User: 这是我的 pdata 文件 recording.pdata，目标帧率 60，请做性能分析
```

```
User: 请分析 output/preprocess-result.json 中的性能数据
```

```
User: 基于已有的预处理结果重新分析，这次重点关注 YzEntityMoveLineNtf 的波动
```
