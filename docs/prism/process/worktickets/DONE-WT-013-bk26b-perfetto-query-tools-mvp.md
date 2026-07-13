# 工单 WT-013 · BK-26b-impl Perfetto query 最小集实现

> 状态：REVIEW（待主 agent 验收）｜里程碑：M5 多源扩展 / Perfetto agent 同构｜执行方：Cursor/agent
> 依据：DONE-WT-011 已验证新版 Perfetto triad 更适合作主样本，并完成 6 个 query 工具契约设计。

## 背景

WT-010/WT-011 证明 Perfetto 数据层能进 `PerfProfile`，但 agent 层还缺可调用 query 工具。没有 query 工具，后续 explore/ledger/narrative 仍会退化成读 summary 写作文。

## 目标

实现 Perfetto query 最小集，首版直接读取已生成的 `perfetto-profile.json` / `perfetto-profile-summary.json`，不强制先落 sqlite。

必须实现 6 个工具：

1. `querySchedState`
2. `queryAtraceSlices`
3. `queryFrameTimeline`
4. `queryCpuFreq`
5. `getPerfettoCallTree`
6. `correlateFrameSchedCpu`

## 参考输入

- `docs/prism/process/worktickets/DONE-WT-011-bk26b-perfetto-triad-query-spike.md`
- `web/data/prism-out/bk26b-perfetto-triad/{base,cur,throttle}/perfetto-profile.json`
- `web/data/prism-out/bk26b-perfetto-triad/{base,cur,throttle}/perfetto-profile-summary.json`
- `web/shared/perf-model.ts`
- `web/server/prism/tools.ts`
- `web/server/prism/tools.cli.ts`
- `web/server/prism/tools.test.ts`

## 实现要求

1. 工具返回结构对齐 Prism：`{ data, provenance }`。
2. `provenance` 至少包含 `runId/tool/args/source:'perfetto'`。
3. 允许使用 role/runDir 参数指定 `base/cur/throttle`。
4. `getPerfettoCallTree` 对 base 样本 `callTrees=[]` 必须返回 `available:false` + reason，不许造树。
5. `queryFrameTimeline` 在无 Android FrameTimeline 时必须返回 `available:false`，但可返回 choreographer frame 摘要。
6. `correlateFrameSchedCpu` 首版只能声明 `granularity:'window'`，不得声称逐帧相关。
7. 注册 CLI batch/single 调用，便于 agent 后续探索。
8. 增加单测，至少覆盖 cur 正常、base 空 callTree 降级、throttle 降频信号。

## 禁止事项

- 不要实现 explore/narrative/report。
- 不要修 provider sidecar 或 base callTrees bug；那是 WT-014。
- 不要伪造 FrameTimeline/GPU/thermal。

## 验收标准

1. 6 个工具均可通过 CLI 或测试调用。
2. 三组 triad 至少各有 3 个工具读到真实数字。
3. base `getPerfettoCallTree` 诚实降级。
4. 测试通过。
5. 完工报告列出实际命令、结果和边界。

## 完工报告（施工方填）

> 施工时间：2026-07-13｜执行方：Cursor/agent（主 agent 接手验收与小修）｜范围：Perfetto query MVP（不含 explore/narrative/provider 修复）

### 1. 修改文件

| 文件 | 变更 |
|---|---|
| `web/server/prism/tools.ts` | 新增 WT-013 Perfetto JSON query 工具区；实现 `querySchedState`、`queryAtraceSlices`、`queryFrameTimeline`、`queryCpuFreq`、`getPerfettoCallTree`、`correlateFrameSchedCpu`；扩展 `Provenance` 可携带 `source/role`。 |
| `web/server/prism/tools.cli.ts` | 注册 6 个 Perfetto query；支持 `single` envelope 调用和 batch 调用；Perfetto JSON 工具不强制打开 sqlite。 |
| `web/server/prism/tools.test.ts` | 新增 `[11] WT-013 Perfetto JSON query tools` 测试，覆盖 cur 正常、base 空 callTree 降级、throttle 降频信号、window 粒度相关。 |
| `docs/prism/process/worktickets/REVIEW-WT-013-bk26b-perfetto-query-tools-mvp.md` | 回填本完工报告。 |

### 2. 工具能力

- `role` 支持：`base` / `cur` / `throttle` / `single`；默认读取 `web/data/prism-out/bk26b-perfetto-triad/<role>/perfetto-profile.json` 与 `perfetto-profile-summary.json`。
- `runDir` 支持：可直接指定包含 `perfetto-profile.json` / `perfetto-profile-summary.json` 的目录。
- 所有工具返回 `{ data, provenance }`；provenance 包含 `runId/tool/args/source:'perfetto'/role`。
- `getPerfettoCallTree` 对 `base` 的 `callTrees=[]` 返回 `available:false` + reason，未合成树。
- `queryFrameTimeline` 在本 triad 无 Android FrameTimeline 时返回 `androidFrameTimeline.available:false`，仅保留 choreographer 摘要。
- `correlateFrameSchedCpu` 固定 `granularity:'window'`，note 明确不声称逐帧相关。

### 3. 验证命令与结果

```bash
cd web && node --import tsx server/prism/tools.test.ts
# Results: 115 PASS, 0 FAIL

cd web && node --import tsx server/prism/tools.cli.ts single '{"tool":"queryCpuFreq","args":{"role":"throttle"}}'
# exit 0；读到 avgMhz=1324.6、bigCoreReachPct=59.2、throttlingLevel=suspected、provenance.source=perfetto

cd web && node --import tsx server/prism/tools.cli.ts batch '[{"tool":"querySchedState","args":{"role":"cur","thread":"UnityMain"}},{"tool":"getPerfettoCallTree","args":{"role":"base"}},{"tool":"correlateFrameSchedCpu","args":{"role":"throttle"}}]'
# exit 0；cur UnityMain runningPct=77.82；base callTree available=false；throttle correlation granularity=window
```

额外检查：

```bash
cd web && npx tsc -p tsconfig.server.json --noEmit
# 未通过：TypeScript 7 对 tsconfig.server.json baseUrl 触发 TS5101（配置级既有问题）。

cd web && npx tsc -p tsconfig.server.json --noEmit --ignoreDeprecations 6.0
# 仍未通过：剩余 33 个既有类型/配置错误，集中在 .claude skill rootDir、prism-memory 测试、objective-report-utils、run-adapter，以及 tools.ts 旧 provenance cast。
# WT-013 新增 hotPath 类型推断问题已修复；CLI 新增 cast 已清理。
```

### 4. 三组 triad 覆盖

- `cur`：`querySchedState`、`queryAtraceSlices`、`queryFrameTimeline`、`getPerfettoCallTree` 正常读真实数字；测试核到 UnityMain `runningPct=77.82`、PlayerLoop `count=484`。
- `base`：`getPerfettoCallTree` 诚实降级，返回 `available:false` 和 `Perfetto callTrees is empty...` reason；未造树。
- `throttle`：`queryCpuFreq` / `correlateFrameSchedCpu` 读到降频信号：`avgMhz=1324.6`、`bigCoreReachPct=59.2`、`throttlingLevel=suspected`。

### 5. 边界声明

- 未实现 explore / narrative / report。
- 未修 provider sidecar ingest，也未修 base callTrees 空树；这仍归 WT-014。
- 未伪造 FrameTimeline / GPU / thermal；FrameTimeline 缺失时只返回 unavailable。
- `correlateFrameSchedCpu` 是窗口级摘要相关，不是逐帧相关。

## 验收结论（主 agent 填）

**验收结论：PASS（WT-013 / BK-26b-impl Perfetto query 最小集通过）。**

DR-36 核验摘要：

1. **6 个工具均已实现并导出**：`querySchedState`、`queryAtraceSlices`、`queryFrameTimeline`、`queryCpuFreq`、`getPerfettoCallTree`、`correlateFrameSchedCpu` 均落在 `web/server/prism/tools.ts` 的 WT-013 区块，首版直接读取 `perfetto-profile.json` / `perfetto-profile-summary.json`。
2. **provenance 达标**：工具返回 `{ data, provenance }`，provenance 含 `runId/tool/args/source:'perfetto'/role`，满足后续 ledger/explore 接入前提。
3. **CLI single/batch 可调用**：`tools.cli.ts` 已注册 6 个 Perfetto JSON 工具，且 JSON 工具不强制打开 sqlite；single 与 batch 实测均 exit 0。
4. **cur 正常样本可读**：测试核到 `cur` UnityMain `runningPct=77.82`、PlayerLoop `count=484`，并能读取 choreographer 摘要与非空 callTree。
5. **base 空 callTree 诚实降级**：`base` 的 `getPerfettoCallTree` 返回 `available:false` + reason，未合成/伪造调用树。
6. **FrameTimeline 缺失诚实降级**：`queryFrameTimeline` 对本 triad 返回 `androidFrameTimeline.available:false`，只保留 choreographer 摘要，未编造 jank。
7. **throttle 降频信号成立**：`queryCpuFreq(role=throttle)` 读到 `avgMhz=1324.6`、`bigCoreReachPct=59.2`、`throttlingLevel=suspected`；`correlateFrameSchedCpu` 也输出 `throttling suspected`。
8. **相关性边界正确**：`correlateFrameSchedCpu` 固定 `granularity:'window'`，note 明确不声称逐帧 sched/cpu 相关。
9. **测试通过**：主 agent 已复跑 `cd web && node --import tsx server/prism/tools.test.ts`，结果 `115 PASS, 0 FAIL, OVERALL: PASS`。
10. **全量 tsc 说明**：`tsc` 仍受仓库既有配置/类型债影响失败（TS7 baseUrl、`.claude` rootDir、prism-memory/objective-report-utils/run-adapter 等）；WT-013 新增类型推断问题已修，未发现阻断本工单的新增功能失败。

结论：WT-013 可标记 DONE。下一步建议先做 WT-014 修 provider sidecar / base callTrees 数据质量，再开 WT-017 Perfetto explore + ledger MVP，最后 WT-018 接 Prism 标准 `narrative.json + report.html`。
