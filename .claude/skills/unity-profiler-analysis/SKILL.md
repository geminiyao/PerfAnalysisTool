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

### Step 1: Build the unified PerfProfile (出数据层)

Execute the Provider to parse the UnityProfilerData (.pdata) into a **unified PerfProfile** (统一领域模型 core + detail，依据 `docs/report-spec-and-data-contract.md` §2/§7）:

```bash
npx tsx .claude/skills/unity-profiler-analysis/scripts/build-profile.ts --input <file> --target-fps <fps> [--out-dir <dir>]
```

- `<file>`: The .pdata or parsed `.json` file the user provided
- `<fps>`: Target FPS from config.json (default 30), or user-specified value
- `<dir>`: (Optional) Output directory. Default: `./output/` (relative to cwd)
- Outputs to `<dir>/`:
  - `unity-profile.json` — full `PerfProfile` (`core` 指标袋/帧口径 + `detail.unity_profiler` 全量 markers / 结构化 callTrees / jankFrames …)。**入库/对比深层联合用，AI 不直接读（大）。**
  - `unity-profile-summary.json` — **AI 读这个**（精简摘要 ~50KB：core 指标袋全量 + frameSummary + top markers + spikes + jank + 剪枝 callTrees + threadSummary）。
  - `preprocess-result.json` — 向后兼容旧 web 流程与 `query-frame.ts`。

**Fast re-run optimization**: If `<dir>/parsed-data.json` already exists (from a previous run on the **same** pdata) and only `target-fps`/config changed, pass it as `--input` for a ~3-5s re-run instead of re-parsing the .pdata.

Decision rules:
- User provides a **new .pdata file** → use the .pdata as input.
- User says "re-analyze with different fps" on the **same** pdata → use `parsed-data.json`.
- User explicitly says "skip preprocessing" → skip Step 1, use existing `unity-profile-summary.json`.

Wait for this to complete before proceeding.

**Web / Service 路径（Hybrid v6）**：当由 `buildUnitySingleReport()` 调度时，Step 1 之后会额外跑 `unity-single-builder.ts` 产出 `performance-report_unity_single_skeleton.md`（含全部表格/callTree + `<!-- LLM_FILL:... -->` 槽）。CLI 读 `prompts/single-prompt.txt` **只替换 LLM_FILL**，禁止改表格与代码块。质量门：`LLM_FILL==0` + 表格保留。

### Step 2: Run Source Mapping (if projectPath configured)

If `config.json` has a non-empty `projectPath`, run source mapping:

```bash
npx tsx .claude/skills/unity-profiler-analysis/scripts/map-source.ts --input ./output/preprocess-result.json --project <projectPath>
```

Output: `.claude/skills/unity-profiler-analysis/marker-source-map.json`

Skip this step if `projectPath` is empty.

### Step 3: Read the PerfProfile and Analyze

**⛔ FORBIDDEN: Do NOT use the Read tool on `unity-profile.json` (full PerfProfile, ~2MB) or `preprocess-result.json`. Reading them wastes 100K+ tokens.**

**✅ REQUIRED: Read `unity-profile-summary.json` instead (~50KB). It is the单源 PerfProfile 摘要 and contains everything needed for analysis.**

The summary (from Step 1) contains:
- `metrics[]` — **core 指标袋**（按 `docs/metric-key-naming-spec.md` 命名: `frame.*` / `marker.<name>.msPerFrame` / `gc.*` / `jank.*` / `spike.*`）。报告引用证据时优先用这些 `key`。
- `frame[]` — 帧口径（`frameDefinition: playerloop`，禁与 perfetto choreographer 直比）。
- `frameSummary` — count / actualFps / mean / median / min / max / worst/medianFrameIndex / jankCount / bigJankCount。
- `markers[]` — top 20 + all `mustReport: true`（含 call chains）。
- `markerSpikes[]` — top 20。
- `jankFrames[]` — all（hotPath；callTreeSummary 用 query-frame 取）。
- `callTrees[]` — **统一结构调用树**（worst + median 帧，已按 totalPct≥2% 剪枝；节点 `name/selfMs/selfPct/totalMs/totalPct/children`）。这是热点/瓶颈节点的结构化证据来源。
- `threadSummary[]` — Main/Render/Submit/Job.Worker 每帧负载（Job.Worker 此处最可靠）。
- `confidence` — 帧数偏低等可信度提示，需在报告中据此打折。

#### 3a. Read unity-profile-summary.json

```bash
cat ./output/unity-profile-summary.json
```

Read the file directly. It's already small enough (~50KB).

If you need data beyond the summary (e.g. markers ranked #21-50, the full structured tree of a node, or a specific marker not in top 20):

```bash
cd ./output && node -e "
const p = require('./unity-profile.json');
const d = p.detail.unity_profiler;
const m = d.markers.find(m => m.name === 'YourMarkerName');
console.log(JSON.stringify(m, null, 2));
"
```

**Never read the full unity-profile.json / preprocess-result.json with the Read tool. Always extract specific items via script.**

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

Generate the final report, then run self-check. Save to the same output directory as Step 1 (default: `./output/`).

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

Output in **Chinese**, **Markdown** format.

**结论先行 (北极星, `docs/report-spec-and-data-contract.md` §0)**: 报告标题下**第一行**必须是一句普通话总结 (headline)，例如"主要瓶颈是 X，根因是 Y，建议 Z"。整篇围绕 **问题 → 根因 → 建议** 的论证链，数据只作证据（挂 `metric.key` 或 `detail` 路径），不要罗列指标。可信度（如帧数偏低、`confidence.notes`）要在结论里打折说明。

Follow this structure:

```markdown
# CPU 性能分析报告

> **结论**: (一句普通话：主要瓶颈/最大问题 + 根因 + 首要建议 + 可信度)

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

## 三、热点分析

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

## 四、Jank 卡顿分析

### 卡顿模式总结
(Table grouping Jank frames by category)

### BigJank/Jank #N: [description]
- 耗时 / 倍数
- 完整调用链
- 瓶颈节点 + self-time
- 源码位置 (if available)
- 根因分析

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

**Format requirement**: Call chains MUST use fenced code blocks with indented hierarchy. Each node MUST include timing (ms) and percentage of frame. Use `→` prefix with 2-space indent per level. Mark the bottleneck with `**BOTTLENECK**`.

- ❌ INVALID (no code block, no hierarchy, no timing):
  "GC.Collect caused the Jank"

- ❌ INVALID (single-line arrow, hard to read):
  "PlayerLoop → Update.ScriptRunBehaviourUpdate → BehaviourUpdate → ... → GC.Collect"

- ✅ VALID:
  ```
  PlayerLoop (557.1ms, 100.0%)
    → Update.ScriptRunBehaviourUpdate (536.7ms, 96.3%)
      → BehaviourUpdate (536.7ms, 96.3%)
        → AOE.dll!AOE::GameLauncher.Update() (535.9ms, 96.2%)
          → Core.Update (535.8ms, 96.2%)
            → CS:AOE.LuaMgr (528.0ms, 94.8%)
              → LuaMgr.OnTick&UpdateSchedule (528.0ms, 94.8%)
                → MapSignificanceMgr.ProcessTask_ZoomEntityAdd (524.9ms, 94.2%)
                  → TBUResManager.GetResFileInfo (178.4ms, 32.0%) **BOTTLENECK**
  ```

- ✅ VALID (abbreviated middle layers with `→ ...`):
  ```
  PlayerLoop (43.7ms, 100.0%)
    → Update.ScriptRunBehaviourUpdate (16.9ms, 38.6%)
      → ... → CS:AOE.TServerManager (13.6ms, 31.0%)
        → TServer.HandleMessages (11.5ms, 26.3%)
          → YzEntityMoveLineNtf (11.3ms, 25.9%) **BOTTLENECK**
  ```

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

After each step completes, report the estimated token consumption for that step.
**Estimation method: measure actual file size read, then multiply by 350 tokens/KB.**

```
[Step 1] preprocess.ts executed — ~0 token (script only, no AI read)
[Step 2] map-source.ts executed — ~0 token (script only)
[Step 3a] Read preprocess-summary.json — actual file size: ___KB × 350 = ___K token
[Step 3b] Read marker-source-map.json — actual file size: ___KB × 350 = ___K token
[Step 3c] Read unity-cpu-knowledge.md — actual file size: ___KB × 350 = ___K token
[Step 4] query-frame × N calls — actual output: ___KB × 350 = ___K token
[Step 5] Report generation — ~5K token (output only)
Total estimated: ___K token
```

⛔ If any single step exceeds 30K tokens, STOP and verify you are reading the correct file (summary, not full result).

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
User: 基于已有的预处理结果重新分析，这次重点关注 XXXManager.DoSomething 的波动
```