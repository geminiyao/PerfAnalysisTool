# P0 领域模型地基 · 迁移说明

> 日期: 2026-06-16 · 阶段: P0 (用户无感地基)
>
> 依据: [`performance-platform-requirements-v2.md`](./performance-platform-requirements-v2.md) §2/§11/§12、[`analysis-framework-design.md`](./analysis-framework-design.md) §5/§6。
>
> 本阶段只**新增**类型与表 + **只读适配器**, 不改旧表、不双写、不删表、不重命名旧代码 (Maple/pdata 全量替换属 P6)。

---

## 1. 改了哪些类型 / 表

### 新增类型 (`web/shared/perf-model.ts`)

| 类型 | 职责 | 对应文档 |
|---|---|---|
| `SourceId` | 源标识 (`unity_profiler` / `simpleperf` / `perfetto` + 可扩展) | framework §5.2 |
| `Metric` | 指标袋一行 (`key/value/unit/source/confidence`) | framework §5.1 |
| `FrameStat` / `ThreadStat` / `SystemStat` / `ProfileConfidence` | core 的归一化结构 | framework §5.1 |
| `PerfProfileCore` | `schemaVersion + metrics[] + frame[] + threads[] + system + confidence` | framework §5.1 |
| `SourceDetail` | schemaless 各源富数据 | framework §5.2 |
| `RawAssetRef` | 原始文件指针 (引用 assets) | 需求 §2 / §9 |
| `PerfProfile` | `raw + core + detail` | framework §5 |
| `Run` | 一次采集 = 出数据单元 (含 profile + meta + `legacy` 溯源) | 需求 §2 |
| `Analysis` | 分析任务 (`single` / `compare`) | 需求 §2 |
| `Report` / `Insight` / `InsightEvidence` | 分析产出 (结论先行 headline + insights) | 需求 §6.3 / §8 |
| `PerfProvider` 等 | P1 Provider 接口预声明 (P0 不实现) | framework §6 |

- 全部新命名: 无 `Maple`; `.pdata` 概念统一为 `unity_profiler` / UnityProfilerData。
- 硬编码列 `il2cppBasePct` → 指标袋 key `cpu.lib.libil2cpp.pct`。
- `PERF_PROFILE_SCHEMA_VERSION = 1`: 归一化逻辑升级后据此从 raw 重算。

### 新增表 (`web/server/db/schema.ts` + 建表 DDL 在 `web/server/db/index.ts`)

| 表 | 语义 | 关键列 |
|---|---|---|
| `runs` | Run。core 的 frame/threads/system/confidence 以 JSON 物化, raw/detail 存指针 | `sources`, `schema_version`, `core_*_json`, `raw_json`, `detail_json` |
| `run_metrics` | core 指标袋 (= 需求中的 "metrics")。一指标一行, 趋势/列表硬依赖 | `run_id`, `key`, `value`, `unit`, `source`, `confidence` |
| `analyses` | 分析任务 | `mode`, `run_ids`(JSON), `status`, `skill`, `report_id` |
| `analysis_reports` | 分析报告 (= 需求中的 "reports") | `analysis_id`, `headline`, `markdown`, `insights_json` |

> **命名偏差 (待确认)**: 需求 P0 把表命名为 `metrics` / `reports`, 但同名物理表已被旧模型 (挂在 `sessions`) 占用, SQLite 不允许同名表共存。故新模型物理表名取 `run_metrics` / `analysis_reports`, 语义等价。旧表 P6 退役后可再收敛命名。

旧表 (`sessions` / `simpleperf_sessions` / `metrics` / `reports` / `maple_runs` / `maple_pdata_results` / `maple_perfetto_results` / `maple_compare_reports` / `maple_compare_sessions`) **原样保留, 未改动**。

---

## 2. 适配器怎么接 (`web/server/services/run-adapter.ts`)

纯**只读**内存映射, 旧表行 → 新模型对象。不写新表、不改旧表。

| 函数 | 输入旧表 | 产出 |
|---|---|---|
| `mapleRunToRun(runId)` | `maple_runs` + `maple_pdata_results` + `maple_perfetto_results` | `Run` (unity_profiler + perfetto core; simpleperf 仅 raw) |
| `legacyProfilerSessionToRun(sessionId)` | `sessions` + `metrics` | `Run` (unity_profiler 单次上传) |
| `simpleperfSessionToRun(id)` | `simpleperf_sessions` | `Run` (simpleperf raw + 产物指针, core 待 P1 Provider) |
| `mapleCompareToAnalysis(id)` | `maple_compare_reports` | `{ analysis: Analysis(compare), report: Report }` |
| `listAdaptableMapleRunIds()` | `maple_runs` | `string[]` (过渡期列表枚举) |

映射要点:
- 旧硬编码列 → 指标袋: `il2cppBasePct` → `cpu.lib.libil2cpp.pct`, `scriptingMs` → `marker.scripting.msPerFrame`, `cpuFreqAvgMhz` → `system.cpuFreqAvgMhz` 等。
- 帧口径显式标注: unity_profiler = `playerloop`, perfetto = `choreographer` (禁止默认直比)。
- 富数据/产物 (frameDist、topMarkers、folded、flamegraph、SQL 窗口) → `detail.<source>`。
- 缺字段降级, 不报错; 缺口写入 `confidence.notes` (如 "simpleperf 逐 run 指标旧模型未入库")。
- 每个产出的 `Run.legacy` / `Analysis.legacy` 标注来源表 + 旧 id, 便于溯源与后续物化。

接入方式 (后续页面): P2 单次详情页 / 趋势页直接调用上述函数拿 `Run`, 无需感知旧表结构; 待 P1 Provider 化后改为读 `runs`/`run_metrics`, 调用点不变 (只换数据来源)。

---

## 3. 后续 P1 Provider 化的接口签名

P0 已在 `perf-model.ts` 预声明, P1 落地实现:

```ts
interface PerfProvider {
  readonly source: SourceId;
  readonly acceptsRoles: string[];                 // 该源能解析的 raw 角色
  parse(input: ProviderParseInput): Promise<ProviderParseResult>;
}

interface ProviderParseInput {
  runId: string;
  raw: RawAssetRef[];
  options?: Record<string, unknown>;               // 工具链/符号路径等, schemaless
}

interface ProviderParseResult {
  source: SourceId;
  metrics: Metric[];
  frame: FrameStat[];
  threads: ThreadStat[];
  system: Partial<SystemStat>;                      // 合并时按源覆盖
  detail: unknown;
  notes: string[];
}
```

P1 计划: 把 3 个现有解析器 (UnityProfilerData / perf.data / .pftrace) 各包成一个 `PerfProvider`, 上层合并各 `ProviderParseResult` 写入 `runs` + `run_metrics`; 旧表适配器作为历史数据兜底保留, 直到数据迁移完成。

---

## 4. 验证

- `npx tsc -p tsconfig.server.json --noEmit` 通过 (exit 0)。
- 新表建表语句已加入 `initTables()`, 首次 `getDb()` 自动创建, 与旧表并存。
