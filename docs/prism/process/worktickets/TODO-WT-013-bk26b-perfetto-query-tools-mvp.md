# 工单 WT-013 · BK-26b-impl Perfetto query 最小集实现

> 状态：TODO（待施工）｜里程碑：M5 多源扩展 / Perfetto agent 同构｜执行方：Cursor/agent
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

待填写。

## 验收结论（主 agent 填）

待验收。
