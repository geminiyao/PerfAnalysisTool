---
name: perfetto-diff-analysis
description: Hybrid v6 perfetto N-份对比分析 skill — Provider 渲染骨架（含数字/表格/ASCII/callTree N 列签名），AI 仅填占位符叙事；支持双份 diff、三态 triad 或更多份对比。与 simpleperf-diff-analysis / unity-profiler-compare 同构。
---

# Perfetto N 份对比性能分析（diff）

吃 N（≥2）份 `.pftrace` 或对应 `perfetto-profile-summary.json`，输出**带 LLM_FILL 占位符的骨架 markdown**，由 LLM 填空生成最终报告。

> 与 `perfetto-trace-analysis`（单次 skill）共用同一个数据层（`build_perfetto_profile.py`）+ 同一个骨架渲染器（`scripts/render_perfetto_skeleton.py`，N 列参数化）。
>
> 单次 skill 用 N=1，本 skill 用 N≥2。代码 100% 复用。

## When to Use

- 用户提供 ≥2 份 `.pftrace`，问跨次/跨场景/跨设备的演化对比、降频时序、业务模块 ms/帧 漂移。
- 关键词：base/cur/throttle 三态对比、双份 diff、N 份 perfetto 对比、triad、版本对比。

不要用于：
- 单次 trace（用 `perfetto-trace-analysis`）
- 函数级对比（用 `simpleperf-diff-analysis`）
- Unity Profiler ms/帧 对比（用 `unity-profiler-compare`）

## Execution Flow

### Step 1: 出数据 —— 每份 trace 跑 build_perfetto_profile

```bash
python scripts/build_perfetto_profile.py --trace <s1.pftrace> --out <out_dir>/s1
python scripts/build_perfetto_profile.py --trace <s2.pftrace> --out <out_dir>/s2
# ... 跑 N 次
```

每份产出 `perfetto-profile.json` + `perfetto-profile-summary.json`。

### Step 2: 渲染骨架（确定性，无 LLM）

```bash
python scripts/render_perfetto_skeleton.py \
  --sample "base=<out_dir>/s1/perfetto-profile-summary.json" \
  --sample "cur=<out_dir>/s2/perfetto-profile-summary.json" \
  [--sample "throttle=<out_dir>/s3/perfetto-profile-summary.json"] \
  --out <out_dir>/skeleton.md
```

骨架已含：
- §-1 数据采集 / §1 数据口径 / §2 元信息（N 列对照）
- §3 多线程独立分析（7 条线程 N 列三态对照）
- §4 off-CPU 归因（含 ASCII 比例条 + 重叠法表 + LLM_FILL 因果链）
- §5 降频时序证据链（per-CPU N 列对照）
- §6 主线程一帧时间去向（含 callTrees N 列签名缩进树 + Top 红线下钻 + 红线触发清单）
- §7 GPU bound 判定矩阵
- §9 / §10 能力边界 + 自评

LLM 只能填 `<!-- LLM_FILL: ... -->` 注释，**不能修改表格 / ASCII / callTree 任何字符**。

### Step 3: LLM 填占位符

通过 `prompts/diff-prompt.txt` 把骨架交给 codebuddy CLI（Web 端走 `perfetto-diff-service.ts`，stdin 注入 prompt）。LLM 严格守骨架填占位符，输出 `performance-report.md`。

### Step 4: 质量门 + 自检（Provider 端跑）

```bash
python scripts/validate_perfetto_report.py --report <out_dir>/performance-report.md \
  --skeleton <out_dir>/skeleton.md
```

3 档质量门：
- L3 ≥ 0.95× 金标准 → 金标准等价
- L2 ≥ 0.92× → 交付质量
- L1 ≥ 0.82× → 基础合格
- 失败 → 直接交付骨架（骨架本身已含全部数字 / 表格 / 调用树，可独立交付）

## Output Format

跟 `references/perfetto-report-template.md` 一致（v5.3 三态金标准章节结构 §-1 ~ §10），N 列参数化。

## Output Quality Rules（MUST NOT VIOLATE）

1. **数字不许动**：所有表格 / ASCII / callTree 节点签名由 Provider 渲染，LLM 不许改任何字符
2. **占位符必填**：`<!-- LLM_FILL -->` 占位符必须 100% 替换；最终报告 `grep -c LLM_FILL == 0`
3. **数字溯源**：叙事中出现的所有数字 token 必须在骨架的表格 / ASCII / 节点签名中能找到
4. **跨次口径**：跨样本对比一律用 ms/帧 或 totalPct，不能用累计 totalMs 算 Δ%
5. **降频分级诚实**：confirmed 需 sysfs；无则停在 likely 档
6. **GPU/FrameTimeline 缺数据**：明说"无法定论"，不臆断
7. **不预设业务模块名**：项目包未注入的模块名 LLM 不能自创，热点名只能从本次 callTree / aoeHotSlices 取

## 共享 prompt 模板

Web (`perfetto-diff-service.ts`) 与手工 CLI 共用 `prompts/diff-prompt.txt`，stdin 注入避免 Windows .cmd 长 prompt 截断。
