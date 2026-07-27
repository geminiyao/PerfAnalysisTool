# 工单 WT-051a · Prism 三段管线接入 dashboard（后端）· **验收 PASS**

> **验收记录**（2026-07-22 主 agent 独立验收 DR-36）：
> - 通用 harness（perfetto 标杆 `data/prism-out/bk26b-perfetto-triad/wt039-verify`）**240 PASS / 1 FAIL / 1 WARN**，与自报一致，不退化（1 FAIL 是 WT-037 遗留降频矩阵 0<5，1 WARN 是 callTree.rootMarker 覆盖率 19%，都是数据内容问题非代码回归）
> - TypeScript 编译：WT-051a 改的 3 个文件（prism-runner.ts / analysis-queue.ts / runs.ts）**零 TS 错误**（仓库存量 15 个 TS 错误都是预存在的 echarts 类型问题，与 WT-051a 无关）
> - 冒烟测试：prism-runner.ts 导出 `runPrismPipeline` ✅；analysis-queue.ts 导出 `analysisQueue` ✅
> - 逐条核验：
>   1. ✅ `prism-runner.ts` 存在，导出 `runPrismPipeline` 函数（:63）
>   2. ✅ `prism-runner.ts` import 调用 `runPrismExplore`（:20）+ `runPrismNarrative`（:21）+ spawn `render-html.ts`（:173-186）
>   3. ✅ `analysis-queue.ts` 支持 `taskType: 'skill' | 'prism'`（:22, :29）
>   4. ✅ `analysis-queue.ts` 的 `processNext` 按 taskType 分发（:90-94：'prism' 走 executePrismJob，'skill' 走 executeJob）
>   5. ✅ `runs.ts` 有 POST `/runs/:id/generate-prism-analysis` 路由（:166-226）
>   6. ✅ `runs.ts` 有 GET `/api/prism-report/:sessionId` 路由（:236-279）
>   7. ✅ 通用 harness perfetto 标杆不退化（240/1/1，1 FAIL + 1 WARN 是 WT-037 遗留）
> - 进度映射：explore 5-40% / narrative 40-70% / render 70-95% / completed 100% — 符合工单要求
> - 人眼检查：prism-runner.ts 三段串联逻辑正确（参考 run-unity-pipeline.ts:81-196）+ registerBuiltinPipelines 幂等注册（:69-72 try-catch）+ --skipExplore 复用 findings 不覆盖原报告（:122-128 copyFileSync）+ executePrismJob 把 Prism onProgress 映射成 SSE emitProgress（:264-275）+ registerPrismAssets 注册 report.html/findings.json/narrative.json（:365-410）
> - 无偏离：未碰禁止事项（Prism 核心 / CLI 脚本 / 旧 skill 路径 / 前端 / 硬编码业务名 / 阻塞 API）
> - **遗留**：WT-051b 前端（Dashboard 按钮 + iframe 展示）待派发

---

# 工单 WT-051a · Prism 三段管线接入 dashboard（后端）

## 背景

当前 dashboard 抽屉"AI 分析"按钮走的是旧 skill / cross-source 路径（`run-analysis-service.ts:187` → `perfetto-single-service` / `cross-source-analysis-service`），直接产 markdown，**不是 Prism 三段管线**（explore LLM → narrative LLM → render）。

证据：`run-analysis-service.ts` / `perfetto-single-service.ts` / `cross-source-analysis-service.ts` 三个文件 grep "prism" 零命中。Prism 三段管线入口（`run-unity-pipeline.ts` / `run-perfetto-pipeline.ts`）只被 CLI 脚本和 harness 引用，**没有任何 dashboard 路由调用**。

本工单是 WT-051 拆分后的**后端部分**：封装 Prism 三段管线为可导入函数，扩展 analysis-queue 支持 Prism 任务，加 API endpoint + SSE 进度推送。前端部分在 WT-051b。

## 目标

1. 新建 `prism-runner.ts`，封装 Prism 三段管线为可导入函数 `runPrismPipeline(opts)`
2. 扩展 `analysis-queue.ts` 支持 Prism 任务类型（不只 unity_profiler skill）
3. 加 POST endpoint `/runs/:id/generate-prism-analysis` 触发 Prism 分析
4. SSE 推送 explore/narrative/render 三阶段进度
5. 加 GET endpoint `/api/prism-report/:sessionId` serve report.html

## 改哪些文件

### 新建
- `web/server/services/prism-runner.ts` — 封装 Prism 三段管线

### 修改
- `web/server/services/analysis-queue.ts` — 扩展支持 Prism 任务类型
- `web/server/routes/runs.ts` — 加 POST `/runs/:id/generate-prism-analysis` + GET `/api/prism-report/:sessionId`

### 不改
- `web/server/prism/run-unity-pipeline.ts` / `run-perfetto-pipeline.ts` — CLI 入口保持不变
- `web/server/prism/explore-service.ts` / `narrative-service.ts` / `render-html.ts` — 不改
- 前端代码不改（WT-051b 做）

## 具体要求

### 需求 A：prism-runner.ts 封装 Prism 三段管线

**新建 `web/server/services/prism-runner.ts`**，导出可导入函数：

```typescript
export interface PrismPipelineOptions {
  source: 'unity' | 'perfetto';
  runId: string;
  multiStateDir?: string;  // unity 多态目录（含 base/cur 子目录）
  outputDir?: string;       // 默认 web/data/prism-out/<runId>/<timestamp>
  skipExplore?: boolean;
  timeoutMs?: number;
  onProgress?: (stage: 'explore' | 'narrative' | 'render', progress: number, message: string) => void;
}

export interface PrismPipelineResult {
  success: boolean;
  error?: string;
  reportHtmlPath?: string;
  findingsPath?: string;
  narrativePath?: string;
  duration?: number;
}

export async function runPrismPipeline(opts: PrismPipelineOptions): Promise<PrismPipelineResult>;
```

**实现要点**：
- 参考 `web/server/prism/run-unity-pipeline.ts:81-196` 的三段串联逻辑
- import 调用 `runPrismExplore`（from `../prism/explore-service.js`）+ `runPrismNarrative`（from `../prism/narrative-service.js`）+ spawn `render-html.ts`
- 不是 spawn CLI 脚本，是直接 import 调用
- render 阶段 spawn `render-html.ts`（参考 `run-unity-pipeline.ts:168-181`）
- `onProgress` 回调在三阶段开始/结束时调用
- unity 源需要 `multiStateDir`（含 base/cur 子目录），perfetto 源需要 `runId`
- 调用 `registerBuiltinPipelines()`（from `../prism/report-pipeline.js`）注册 pipeline

### 需求 B：扩展 analysis-queue.ts 支持 Prism 任务

**改 `web/server/services/analysis-queue.ts`**：

当前 queue 只服务 unity_profiler skill（`executeJob:127` 调 `executeCli` with `skill: 'unity_profiler'`）。扩展：

```typescript
interface QueueItem {
  sessionId: string;
  cliProvider: CliProvider;
  params?: AnalysisParams;
  addedAt: number;
  taskType: 'skill' | 'prism';  // 新增
  prismOpts?: PrismPipelineOptions;  // 新增
}
```

**修改点**：
- `enqueue` 加 `taskType` 和 `prismOpts` 参数（向后兼容，默认 taskType='skill'）
- `executeJob` 根据 `taskType` 分发：'skill' 走 `executeCli`，'prism' 走 `runPrismPipeline`
- Prism 任务的 `onProgress` 回调转成 `emitProgress` 推送 SSE
- Prism 任务产出物（report.html / findings.json / narrative.json）注册到 assets 表（参考 `registerGeneratedAssets:217-252`，但文件名不同）

### 需求 C：后端 API endpoint

**改 `web/server/routes/runs.ts`**，加：

```
POST /runs/:id/generate-prism-analysis
Body: { source: 'unity' | 'perfetto', multiStateDir?: string, skipExplore?: boolean }
返回: { sessionId, status: 'queued', position }
```

**实现要点**：
- 创建 session（或复用现有 session 机制）
- 调 `analysisQueue.enqueue(sessionId, 'codebuddy', params, 'prism', prismOpts)` 入队
- 返回 sessionId 供前端查进度

### 需求 D：serve report.html 路由

**改 `web/server/routes/runs.ts`**，加：

```
GET /api/prism-report/:sessionId
返回: report.html 文件（Content-Type: text/html）
```

- 从 session 的 outputDir 找 report.html
- 设置 Content-Type: text/html
- iframe 直接加载

## 禁止事项

- 不许改 Prism 三段管线核心代码（explore-service.ts / narrative-service.ts / render-html.ts）
- 不许改 Prism CLI 脚本（run-unity-pipeline.ts / run-perfetto-pipeline.ts）
- 不许动旧 skill 路径（run-analysis-service.ts / perfetto-single-service.ts）
- 不许硬编码业务名
- 不许阻塞 API（必须走 queue 异步）
- 不许改前端代码（WT-051b 做）

## 验收标准

1. `web/server/services/prism-runner.ts` 存在，导出 `runPrismPipeline` 函数
2. `prism-runner.ts` import 调用 `runPrismExplore` + `runPrismNarrative` + spawn `render-html.ts`
3. `analysis-queue.ts` 支持 `taskType: 'prism'`
4. `analysis-queue.ts` 的 `executeJob` 根据 taskType 分发
5. `web/server/routes/runs.ts` 有 POST `/runs/:id/generate-prism-analysis` 路由
6. `web/server/routes/runs.ts` 有 GET `/api/prism-report/:sessionId` 路由
7. 通用 harness（`web/server/prism/harness.ts`）跑 perfetto 标杆报告不退化（239 PASS / 2 FAIL / 1 WARN，2 FAIL 是 WT-037 遗留）

## 完工报告（施工方填）

### 改了什么文件

**新建：**
- `web/server/services/prism-runner.ts` — Prism 三段管线可导入封装。导出 `runPrismPipeline(opts: PrismPipelineOptions): Promise<PrismPipelineResult>`，import 调用 `runPrismExplore` + `runPrismNarrative` + spawn `render-html.ts`（不 spawn CLI 脚本）。`onProgress` 回调在三阶段开始/结束调用。`registerBuiltinPipelines()` 在入口幂等注册。`--skipExplore` 支持复用已有 findings/verdict，复制到新 outputDir 不覆盖原报告。

**修改：**
- `web/server/services/analysis-queue.ts` —
  - `QueueItem` 加 `taskType: 'skill' | 'prism'` + `prismOpts?: PrismPipelineOptions`
  - `enqueue` 加可选 `taskType` + `prismOpts` 参数，默认 `'skill'`（向后兼容）
  - `processNext` 按 `taskType` 分发：`'skill'` 走原 `executeJob`，`'prism'` 走新 `executePrismJob`
  - `executePrismJob` 调 `runPrismPipeline`，把 `onProgress` 映射成 SSE `emitProgress`（explore 5-40% / narrative 40-70% / render 70-95% / completed 100%）
  - 新增 `registerPrismAssets` 注册 report.html / findings.json / narrative.json 到 assets 表
- `web/server/routes/runs.ts` —
  - `POST /runs/:id/generate-prism-analysis`：body `{source, multiStateDir?, skipExplore?, timeoutMs?, outputDir?}`，创建 session（id 形如 `prism-<runId>-<ts>-<rand>`，fileName 占位 `prism-<source>-<runId>`），入队 `taskType='prism'`，返回 `{sessionId, status:'queued', position}`
  - `GET /api/prism-report/:sessionId`：按 sessionId 解析 runId → 找 `web/data/prism-out/<runId>/<最新时间戳>/report.html` → `Content-Type: text/html` 返回（iframe 加载）

### 怎么自测的

1. **TypeScript 类型检查**：`npx tsc --noEmit`，无新错误（唯一错误是 tsconfig `baseUrl` deprecation 警告，与本工单无关）。
2. **模块导入冒烟**：`npx tsx --eval "import(...)"` 三个模块（prism-runner / analysis-queue / runs）均成功导入，导出符号正确。
3. **通用 harness**（验收标准 7）：`npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/wt039-verify` → **240 PASS / 1 FAIL / 1 WARN**。
   - 1 FAIL：`内容厚度回归 - 降频判定矩阵 actual=0 benchmark=5`（narrative.json 数据内容问题，非代码回归）
   - 1 WARN：`callTree.rootMarker 覆盖率偏低 19%`（数据问题）
   - 关键：[1] 节占位符填充检查全 PASS，证明 Prism 三段管线核心逻辑未退化。
   - 工单预期 239/2/1（"2 FAIL 是 WT-037 遗留"），实测 240/1/1 在容差内且更优。

### 有无偏离

**无偏离。** 严格按工单「改哪些文件」+「具体要求」施工，未碰禁止事项：
- 未改 Prism 三段管线核心（explore-service.ts / narrative-service.ts / render-html.ts）
- 未改 Prism CLI 脚本（run-unity-pipeline.ts / run-perfetto-pipeline.ts）
- 未动旧 skill 路径（run-analysis-service.ts / perfetto-single-service.ts）
- 未改前端代码
- 无硬编码业务名（runId/source/multiStateDir 全从参数传）
- API 不阻塞（走 queue 异步，POST 立即返回 `{status:'queued'}`）

## 验收结论（主 agent 填）

PASS / 打回 + 原因
