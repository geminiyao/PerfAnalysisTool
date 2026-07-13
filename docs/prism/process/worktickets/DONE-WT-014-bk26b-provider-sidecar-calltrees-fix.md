# 工单 WT-014 · BK-26b-fix Perfetto provider sidecar ingest + base callTrees 空树修复

> 状态：DONE（主 agent 验收 PASS）｜里程碑：M5 多源扩展 / Perfetto 数据质量｜执行方：CodeBuddy agent + 主 agent 小修/验收
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

## 改哪些文件

允许改：

- `scripts/perfetto_provider.py`：sidecar 读取、throttling evidence、callTree 空树修复/诊断。
- `scripts/build_perfetto_profile.py`：仅当需要传递 trace 同目录/summary 字段时做最小修改。
- `web/shared/perf-model.ts`：仅当现有 `PerfettoThrottling` 字段不够表达 sidecar 时做最小类型扩展；若现有字段够用，不要改。
- `scripts/*perfetto*test*.py` 或 `web/server/prism/*.test.ts`：如需补最小测试/探针。
- `web/data/prism-out/bk26b-perfetto-triad/{base,cur,throttle}/**`：允许重新生成验证产物。
- 本工单文件：回填完工报告并改 `REVIEW-`。

禁止改：

- `web/server/prism/tools.ts` / `tools.cli.ts` 的 WT-013 query 逻辑，除非完工报告证明 provider 字段名变化导致 query 必须同步。
- explore / narrative / report 相关代码。
- 采集脚本 `record_aoeyz.bat`。

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

## 接续说明（主 agent，2026-07-13）

前两次 CodeBuddy dispatch 因外层超时中断，已完成诊断但未进入正式修复。请施工方不要再重复大范围诊断，直接基于下面结论实现。

### 已确认 BUG-P1 根因

- `scripts/perfetto_provider.py` 当前 `_throttling(..., sysfs_available=False)` 硬编码 false。
- evidence 文案固定写“本样本无 thermal_before/after.txt”。
- 但三组 triad 目录实际都有：`collection-manifest.json`、`thermal_before.txt`、`thermal_after.txt`、`cpuinfo_max_freq.txt`。

要求：

- 在 provider 中从 `trace_path` 同目录读取 sidecar。
- 将 `collectionManifest`、`thermal`、`cpuinfoMaxMhz`/`reachVsCpuinfoPct` 写入 `detail.perfetto.throttling`。
- evidence 不得再说“无 thermal_before/after.txt”；如果没有 `scaling_max_freq` / cooling state，只能说“thermal/cpuinfo sidecar available，但 confirmed throttling 仍缺 scaling/cooling 证据”。

### 已确认 BUG-P2 根因

CodeBuddy 诊断脚本确认：

- base 真正 UnityMain utid 有 `PlayerLoop.count=684`。
- `callTrees=[]` 不是没有 slices，而是 `_slice_tree` 当前只从 `parent_id IS NULL` roots 聚合，且 SQL 过滤 `s.dur >= 0`。
- base 中顶层 `PlayerLoop` root `dur=-1` 被过滤；剩余 roots 极小，被 `min_pct=0.5` 剪掉。
- 大量真正有价值的 PlayerLoop 是非 root slice（例如多数 parent_id 指向其它容器），所以 root-only 聚合会丢掉主树。

要求：

- 修 `_slice_tree`，当 root 聚合为空时，诚实 fallback 到 `PlayerLoop` anchor 聚合：选取当前 utid 下 name 为 `PlayerLoop` 的 slice 作为虚拟 roots，聚合其子树。
- 不要凭空造树；fallback 只能使用真实 slice rows。
- 若 fallback 仍为空，则保留空树并在 parseNotes 或 debug 字段说明原因。
- cur/throttle 现有 callTrees 不应退化。

### 清理要求

前次中断留下的临时诊断文件 `scripts/_diag*.py` / `scripts/_diag_calltrees.py` 不应作为最终提交内容；施工方完成前请删除这些临时文件或在完工报告说明它们未纳入交付。

## 完工报告（施工方填）

> 施工时间：2026-07-13｜执行方：CodeBuddy agent（3 次 dispatch 诊断/实现，外层超时中断）+ 主 agent 小修收尾｜范围：provider sidecar ingest + base callTrees fallback

### 1. 修改文件

| 文件 | 变更 |
|---|---|
| `scripts/perfetto_provider.py` | 新增 trace 同目录 sidecar 读取；`throttling` 输出 `thermal` / `collectionManifest` / `cpuinfoMaxMhz` / `reachVsCpuinfoPct`；修正 evidence；`_slice_tree` 增加 PlayerLoop anchor fallback。 |
| `web/server/prism/tools.test.ts` | 更新 WT-013/014 联动测试：base callTree 在 provider fallback 后应可用且 hotPath 含 PlayerLoop。 |
| `web/data/prism-out/bk26b-perfetto-triad/{base,cur,throttle}/` | 重新生成三组 `perfetto-profile.json` / `perfetto-profile-summary.json`。 |
| 本工单 | 补充接续说明、完工报告、验收结论。 |

未改：`web/shared/perf-model.ts`（现有 `PerfettoThrottling` 字段足够）、`build_perfetto_profile.py`、explore/narrative/report、采集脚本。

### 2. BUG-P1 sidecar ingest

新增读取：

- `collection-manifest.json`
- `thermal_before.txt`
- `thermal_after.txt`
- `cpuinfo_max_freq.txt`

After 结果（三组均成立）：

- `throttling.confirmedAvailable=true`（表示 thermal/cpuinfo sidecar available；不等于确认级降频）。
- `throttling.thermal` 含 `beforeC/afterC/deltaC/primaryZone`。
- `throttling.collectionManifest.targetApp=com.tencent.aoeyz`。
- `perCpu[*].cpuinfoMaxMhz` / `reachVsCpuinfoPct` 已填。
- evidence 不再错误声称“本样本无 thermal_before/after.txt”，改为：`thermal/cpuinfo sidecar available (...)，但确认级降频仍缺 scaling_max_freq / cooling state 证据。`

### 3. BUG-P2 base callTrees 空树

根因：base 中 root-only 聚合会丢主树。顶层 `PlayerLoop` root `dur=-1` 被原 SQL 的 `s.dur >= 0` 过滤；其它 roots 极小被 `min_pct=0.5` 剪掉；大量真实 PlayerLoop 是非 root anchor。

修复：`_slice_tree` 在 primary roots 聚合为空时，fallback 到当前 utid 下所有真实 `PlayerLoop` anchor slice，作为虚拟 roots 聚合其真实子树；dur<0 anchor 用子树 sum 估算。未合成不存在的节点。

After 结果：

- base `detail.perfetto.callTrees.length=1`。
- base parseNotes 增加 fallback 说明：`fallback 选取 PlayerLoop anchor (684 个) 作为虚拟 roots 聚合真实子树`。
- cur/throttle 仍各有 1 棵 callTree，未退化。

### 4. 清理

CodeBuddy 中断期间产生的 `scripts/_diag*.py` / `scripts/_diag_calltrees.py` 已删除，未纳入交付。

### 5. 验证命令

```bash
python scripts/build_perfetto_profile.py --trace "G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_base_20260624_104944/2026-06-24_10-49-c1a652.pftrace" --out "web/data/prism-out/bk26b-perfetto-triad/base"
python scripts/build_perfetto_profile.py --trace "G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_cur_20260624_105041/2026-06-24_10-50-efb338.pftrace" --out "web/data/prism-out/bk26b-perfetto-triad/cur"
python scripts/build_perfetto_profile.py --trace "G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_throttle_20260624_105539/2026-06-24_10-55-2f0696.pftrace" --out "web/data/prism-out/bk26b-perfetto-triad/throttle"
# 三组均 exit 0；base/cur metrics=16；throttle metrics=28；parseStatus=partial（既有采集能力边界）

cd web && node --import tsx server/prism/tools.test.ts
# Results: 116 PASS, 0 FAIL
```

附加验证脚本检查三组 profile：

- `confirmedAvailable true`：PASS
- `thermal before/after present`：PASS
- `manifest targetApp present`：PASS
- `no false no-thermal evidence`：PASS
- `callTrees non-empty`：PASS

## 验收结论（主 agent 填）

**验收结论：PASS（WT-014 / BK-26b-fix provider sidecar ingest + base callTrees 空树修复通过）。**

DR-36 核验摘要：

1. **sidecar 已入 profile**：三组 triad 的 `detail.perfetto.throttling` 均包含 `thermal`、`collectionManifest`、`perCpu[*].cpuinfoMaxMhz`、`reachVsCpuinfoPct`。
2. **错误 evidence 已修正**：三组 evidence 不再出现“本样本无 thermal_before/after.txt”；改为明确 sidecar available，但确认级降频仍缺 scaling/cooling 证据。
3. **base callTrees 已修复**：base 从 `callTrees=[]` 变为 1 棵 UnityMain tree，hotPath 含 PlayerLoop；parseNotes 记录了 PlayerLoop anchor fallback，未静默伪造。
4. **cur/throttle 未退化**：cur/throttle 重新 build 后仍各有 1 棵 callTree；关键数值保持 WT-011/WT-013 预期（cur UnityMain runningPct=77.82，throttle cpuFreqAvgMhz=1324.6 / bigCoreReachPct=59.2）。
5. **测试通过**：`cd web && node --import tsx server/prism/tools.test.ts` → `116 PASS, 0 FAIL`。
6. **边界清楚**：`parseStatus=partial` 仍保留，因为 CombinedProfile / FrameTimeline / GPU 仍是采集能力边界；本单未改 explore/narrative/report，也未改采集脚本。

结论：WT-014 可标记 DONE。下一步建议进入 `WT-017`：用 WT-013 query + WT-014 修复后 profile 接 Perfetto explore + ledger MVP。
