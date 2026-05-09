---
name: unity-profiler-scoring
description: Score and evaluate Unity Profiler performance analysis reports against source data. Use when user asks to rate, score, or compare report quality (评分/打分/评估报告).
---

# Unity Profiler Report Scoring

## When to Use This Skill

- User asks to score/evaluate a performance report
- User wants to compare quality of different reports
- Keywords: 评分, 打分, 评估报告, 给报告打分, score report, evaluate, rate report, 对比报告

## Execution Flow

### Step 1: Identify Files

Determine:
- **Report file** (`.md`): The report to evaluate. If user specifies a path, use it. Otherwise, find the most recent `performance-report*.md` in `./output/`.
- **Baseline file** (`preprocess-result.json`): The source data the report was generated from. Default: `./output/preprocess-result.json`.

If either file is missing, ask the user to provide the path.

### Step 2: Run Auto-Scoring Script

```bash
npx tsx .claude/skills/unity-profiler-scoring/scripts/score-report.ts \
  --report <report.md> \
  --baseline <preprocess-result.json> \
  --output ./output/scoring
```

This produces (filenames include report name + timestamp to avoid overwriting):
- `./output/scoring/score_<reportName>_<timestamp>.json` — machine-readable scores
- `./output/scoring/score_<reportName>_<timestamp>.md` — human-readable summary

### Step 3: Read and Present Results

Read the generated `score_*.md` file and `score_*.json` file.

### Step 4: LLM 补充评审（自动，无需人工）

读取报告内容和 baseline 数据，自动评估 4 个人工项：

- **A2 (调用链完整性)**: For each Jank/hotspot analyzed in the report, check if there is a complete call chain from PlayerLoop/top-level down to the bottleneck node. Compare against `jankFrames[].hotPath` and `markers[].callChain` in baseline.
- **B1 (瓶颈定位准确性)**: Check if the reported bottleneck matches `**BOTTLENECK**` markers in baseline jankFrames hotPath.
- **B2 (根因推理深度)**: Check if the analysis references project-specific knowledge (MapSignificanceMgr known issue, AOE architecture, xLua bridging, network decode patterns, etc. from `references/unity-cpu-knowledge.md`).
- **C1 (建议可执行性)**: For each optimization suggestion, verify it has: specific operation steps + target code path/setting + expected benefit. Mark down if vague ("优化性能", "减少开销").

Score each 0-100 per the rubric.

### Step 5: Output Final Score

将自动项 + LLM 评审项合并，重新计算最终加权总分：

```
Final = A_avg × 0.4 + B_avg × 0.35 + C_avg × 0.25  (满分 100)
```

**直接覆盖** `score_*.md` 文件为完整的 11 项评分报告，包含：
1. 🏆 总分 + 档位
2. 📋 汇总评分表（11 项全部有分数）
3. 📊 分类得分（含完整平均值）
4. ⚠️ 扣分点总结（所有 <100 的项，编号列表，含扣分原因简述）
5. 档位参考

不再有"待人工"项，用户看到的就是最终结果。

If scoring multiple reports, present a comparison table.

---

## Scoring Dimensions (3 Categories × 11 Items)

| Category | Weight | Items |
|----------|--------|-------|
| **A 数据准确性** | 40% | A1 概览数据 · A2 调用链 · A3 数值引用 · A4 mustReport覆盖 |
| **B 分析质量** | 35% | B1 瓶颈定位 · B2 根因深度 · B3 判定透明 · B4 不确定标注 |
| **C 实用价值** | 25% | C1 建议可执行 · C2 优先级合理 · C3 结构完整 |

Auto-scored: A1, A3, A4, B3, B4, C2, C3 (7 items)
Manual/LLM: A2, B1, B2, C1 (4 items)

Scale: 0(不可用) ~ 100(优秀)

---

## Rubric Reference

Full scoring rubric: `.claude/skills/unity-profiler-scoring/rubric.md`

---

## Examples

### 单份报告评分（仅自动项）

```
给 output/performance-report_20260508170000.md 打分，baseline 是 output/preprocess-result.json
```

### 单份报告评分（全量，含人工项）

```
评估 output/performance-report_20260508170000.md 的质量，baseline 是 output/preprocess-result.json。自动评分完成后，请帮我补充人工评审项（A2/B1/B2/C1），给出完整的11项评分和最终总分。
```

### 对比两份报告

```
对比评分以下两份报告，baseline 都是 output/preprocess-result.json：
- 报告A: output/performance-report_opus.md
- 报告B: output/performance-report_sonnet.md

请分别评分并输出对比表格，标注哪份更优。
```

### 批量评分（多份）

```
请依次对以下报告打分（含人工项），baseline 是 output/preprocess-result.json：
1. output/performance-report_opus.md
2. output/performance-report_sonnet.md
3. output/performance-report_gpt4o.md

最后给一个横向对比表格和排名。
```

### English

```
score the latest report, including manual items
```
