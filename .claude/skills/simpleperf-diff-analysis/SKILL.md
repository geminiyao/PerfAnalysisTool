---
name: simpleperf-diff-analysis
description: Hybrid v4.1 simpleperf diff reports — Provider renders skeleton; AI enriches narrative; quality gate with fallback.
---

# simpleperf 双文件差分性能分析 (v4 · 正式交付)

## 正式交付标准

任意一组 `base.data + cur.data + binary_cache` 输入，产出 `performance-report.md`：

1. **结构**与金标准 v4 一致（§0–§11）
2. **核心数字**以 Provider 为准（探针、Top-N、线程）
3. **叙事厚度**接近金标准（Provider 模板 + AI 润色）
4. **AI 润色失败**时自动回退 Provider 加厚版（不交付坏报告）

## Execution Flow

### Step 1: Provider（必须）

```bash
python simpleperf/build_simpleperf_profile.py --base <base> --perf <cur> --binary-cache <cache> --out <out_dir>
# 或已有 diff JSON：
python scripts/rerender_v4_report.py <out_dir>
```

产出：`<out_dir>/report/performance-report_simpleperf_v4.md`

### Step 2: summary JSON

```bash
python scripts/build_simpleperf_diff_summary.py <out_dir>
```

### Step 3: 质量门（Provider）

```bash
python scripts/validate_v4_report.py <out_dir>
python scripts/compare_v4_report_quality.py <out_dir>/report/performance-report_simpleperf_v4.md
```

### Step 4: AI 润色（默认开启，可 `-ProviderOnly` 跳过）

**必读** Provider 全文 + `simpleperf-diff-summary.json` + `docs/aoe-cpu-analysis-knowledge.md`

**允许修改**：§0 措辞、§4.3–4.6 业务叙事、§3.3 过渡句（**数字不变**）

**禁止修改**：表格数字、mermaid、§5.2 调用树、章节顺序

产出：`<out_dir>/report/performance-report_simpleperf_AI_v4.md`

### Step 5: 质量门（AI）+ 回退

```bash
python scripts/compare_v4_report_quality.py <ai_report> --min-length-ratio=0.78
```

- PASS → `performance-report.md` = AI 版
- FAIL → `performance-report.md` = Provider 版

## 一键命令

```bat
scripts\run_aoeyz_v4_codebuddy.bat              REM 正式交付（Provider + AI + 回退）
scripts\run_simpleperf_v4_codebuddy.ps1 -ProviderOnly   REM 仅 Provider
scripts\run_simpleperf_v4_codebuddy.ps1 -SkipEnrich    REM 跳过 AI
```

自定义数据：

```powershell
.\scripts\run_simpleperf_v4_codebuddy.ps1 `
  -Base D:\path\base.data -Cur D:\path\cur.data `
  -BinaryCache D:\path\binary_cache `
  -OutDir docs\report\_intermediate\my_diff `
  -SceneBase "场景A" -SceneCur "场景B"
```
