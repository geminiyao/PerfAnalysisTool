# 工单 WT-014 · BK-26b-fix Perfetto provider sidecar ingest + base callTrees 空树修复

> 状态：TODO（待施工）｜里程碑：M5 多源扩展 / Perfetto 数据质量｜执行方：Cursor/agent
> 依据：DONE-WT-011 记录 BUG-P1 / BUG-P2。

## 背景

新版 Perfetto triad 目录中存在 `thermal_before.txt`、`thermal_after.txt`、`cpuinfo_max_freq.txt`、`collection-manifest.json`，但 provider 当前仍报告 `confirmedAvailable=false` 且 evidence 写“无 thermal_before/after.txt”。同时 base 样本 `callTrees=[]`，但 `atraceSlices.PlayerLoop.count=684`，说明树构造或剪枝存在问题。

## 目标

1. provider 自动读取 trace 同目录 sidecar。
2. 将 collection manifest / thermal / cpuinfo 进入 profile detail 或 core system。
3. 修复或明确解释 base callTrees 空树原因。

## 参考输入

- `docs/prism/process/worktickets/DONE-WT-011-bk26b-perfetto-triad-query-spike.md`
- `G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_base_20260624_104944`
- `G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_cur_20260624_105041`
- `G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_throttle_20260624_105539`
- `scripts/perfetto_provider.py`
- `scripts/build_perfetto_profile.py`
- `web/shared/perf-model.ts`

## 具体要求

### 1. sidecar ingest

读取 trace 同目录：

- `collection-manifest.json`
- `thermal_before.txt`
- `thermal_after.txt`
- `cpuinfo_max_freq.txt`

输出应包含：

- manifest targetApp/duration/categories/knownLimitations
- thermal before/after/delta（至少主要 thermal zone）
- cpu theoretical max freq
- `confirmedAvailable` 语义修正：sidecar 存在时不再写“无 thermal_before/after.txt”

### 2. base callTrees 空树

对 base 样本排查：

- profile 里 `atraceSlices.PlayerLoop.count=684`
- 但 `detail.perfetto.callTrees=[]`

需要定位是：

- parent 图断裂；
- minTotalPct/minDepth 剪枝；
- window/utid 选择问题；
- 还是 provider 逻辑 bug。

若能修复，修复并补测试；若不能，写明原因并保证 query 工具能诚实降级。

## 禁止事项

- 不要改 agent explore/narrative。
- 不要伪造 thermal/FrameTimeline/GPU。
- 不要改采集脚本，除非只是文档建议。

## 验收标准

1. 三组 triad 重新 build 后 profile 中能看到 sidecar 信息。
2. evidence 不再错误声称无 thermal sidecar。
3. base callTrees 空树要么修复，要么有明确可验证原因。
4. 测试或最小重跑命令通过。
5. 完工报告列出 before/after。

## 完工报告（施工方填）

待填写。

## 验收结论（主 agent 填）

待验收。
