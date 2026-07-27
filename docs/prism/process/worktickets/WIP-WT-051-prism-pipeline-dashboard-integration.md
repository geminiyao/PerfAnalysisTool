# 工单 WT-051 · Prism 三段管线接入 dashboard

## 背景（为什么做）

当前 dashboard 抽屉的"AI 分析"按钮走的是旧 skill / cross-source 路径（`run-analysis-service.ts:187` → `perfetto-single-service` / `cross-source-analysis-service`），直接产 markdown，**不是 Prism 三段管线**（explore LLM → narrative LLM → render）。

证据：`run-analysis-service.ts` / `perfetto-single-service.ts` / `cross-source-analysis-service.ts` 三个文件 grep "prism" 零命中。Prism 三段管线入口（`run-unity-pipeline.ts` / `run-perfetto-pipeline.ts`）只被 CLI 脚本和 harness 引用，**没有任何 dashboard 路由调用**。

用户要"先把整个流程跑起来"——固定跑 3 个场景（空场景/压测战斗/压测行军）× VG 版本，看回路通电状态 + 沉淀内容。但当前 Prism 三段管线没接进 dashboard，跑场景只能用 CLI 手动跑，回路（开局注入/收尾沉淀）虽然在 Prism 管线里通电了，但用户看不到。

**本工单把 Prism 三段管线接进 dashboard**：dashboard 抽屉加"Prism 分析"按钮，调 Prism 三段管线，产出 report.html，用 iframe 展示。复用现有 `analysis-queue.ts`（加 Prism 任务类型）+ SSE 进度推送。

## 目标（做完什么样）

1. dashboard 抽屉"AI 分析"按钮旁加"Prism 分析"选项（或单独按钮），点击后入队 Prism 三段管线
2. 后端加 API endpoint 调 Prism 三段管线（unity / perfetto 两个源），复用 `analysis-queue.ts`
3. SSE 推送 explore / narrative / render 三阶段进度
4. 完成后 dashboard 用 iframe 展示 report.html
5. 跑一次空场景验证流程串通

## 改哪些文件

### 后端
- `web/server/services/analysis-queue.ts` — 扩展支持 Prism 任务类型（不只是 unity_profiler skill）
- `web/server/services/prism-runner.ts` — **新建**，封装 Prism 三段管线调用（参考 `run-unity-pipeline.ts:81-196` 的三段串联逻辑，但作为可导入函数而非 CLI 脚本）
- `web/server/routes/runs.ts` 或 `web/server/routes/analysis.ts` — 加 POST endpoint 触发 Prism 分析
- `web/server/routes/analysis.ts` — SSE 加 Prism 三阶段进度推送（explore 进度 / narrative 进度 / render 完成）

### 前端
- `web/src/pages/Dashboard.tsx` — `VersionRunDrawer`（:343-421）加"Prism 分析"按钮，调新 API
- `web/src/services/api.ts` — 加 `generatePrismAnalysis(runId, opts)` 函数
- `web/src/pages/RunDetail.tsx` 或新组件 — 加 iframe 展示 report.html

### 不改
- `web/server/prism/run-unity-pipeline.ts` / `run-perfetto-pipeline.ts` — CLI 入口保持不变（prism-runner.ts 复用其三段串联逻辑，不修改 CLI 脚本本身）
- `web/server/prism/explore-service.ts` / `narrative-service.ts` / `render-html.ts` — 不改

## 具体要求

### 需求 A：prism-runner.ts 封装 Prism 三段管线

**新建 `web/server/services/prism-runner.ts`**，导出可导入函数 `runPrismPipeline(opts)`：

```typescript
interface PrismPipelineOptions {
  source: 'unity' | 'perfetto';
  runId: string;
  multiStateDir?: string;  // unity 多态目录（含 base/cur 子目录）
  outputDir?: string;       // 输出目录（默认 web/data/prism-out/<runId>/<timestamp>）
  skipExplore?: boolean;    // 复用已有 findings.json
  timeoutMs?: number;
  onProgress?: (stage: 'explore' | 'narrative' | 'render', progress: number, message: string) => void;
}

interface PrismPipelineResult {
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
- 复用 `run-unity-pipeline.ts:81-196` 的三段串联逻辑（registerBuiltinPipelines → runPrismExplore → runPrismNarrative → spawn render-html.ts）
- 不是 spawn CLI 脚本，是直接 import 调用 `runPrismExplore` / `runPrismNarrative`（已在 explore-service.ts / narrative-service.ts 导出）
- render 阶段 spawn `render-html.ts`（参考 `run-unity-pipeline.ts:168-181`）
- `onProgress` 回调在三阶段开始/结束时调用，用于 SSE 推送
- unity 源需要 `multiStateDir`（含 base/cur 子目录），perfetto 源需要 `runId`（如 bk26b-perfetto-triad）

### 需求 B：扩展 analysis-queue.ts 支持 Prism 任务

**改 `web/server/services/analysis-queue.ts`**：

当前 queue 只服务 unity_profiler skill（`executeJob:127` 调 `executeCli` with `skill: 'unity_profiler'`）。扩展支持 Prism 任务类型：

```typescript
interface QueueItem {
  sessionId: string;
  cliProvider: CliProvider;
  params?: AnalysisParams;
  addedAt: number;
  // 新增
  taskType: 'skill' | 'prism';  // 任务类型
  prismOpts?: PrismPipelineOptions;  // Prism 任务参数
}
```

**修改点**：
- `enqueue` 加 `taskType` 和 `prismOpts` 参数（向后兼容，默认 taskType='skill'）
- `executeJob` 根据 `taskType` 分发：'skill' 走 `executeCli`，'prism' 走 `runPrismPipeline`
- Prism 任务的 `onProgress` 回调转成 `emitProgress` 推送 SSE
- Prism 任务产出物（report.html / findings.json / narrative.json）注册到 assets 表（参考 `registerGeneratedAssets:217-252`，但文件名不同）

### 需求 C：后端 API endpoint

**改 `web/server/routes/runs.ts`**（或 `analysis.ts`），加 POST endpoint：

```
POST /runs/:id/generate-prism-analysis
Body: { source: 'unity' | 'perfetto', multiStateDir?: string, skipExplore?: boolean }
返回: { sessionId, status: 'queued', position }
```

**实现要点**：
- 创建 session（或复用现有 session 机制）
- 调 `analysisQueue.enqueue(sessionId, 'codebuddy', params, 'prism', prismOpts)` 入队
- 返回 sessionId 供前端查进度

### 需求 D：SSE 进度推送

**改 `web/server/routes/analysis.ts`**，SSE 推送 Prism 三阶段进度：

- explore 阶段开始：`{ stage: 'explore', progress: 10, message: 'explore LLM 开始...' }`
- explore 完成：`{ stage: 'explore', progress: 30, message: 'explore 完成，N findings' }`
- narrative 阶段开始：`{ stage: 'narrative', progress: 40, message: 'narrative LLM 开始...' }`
- narrative 完成：`{ stage: 'narrative', progress: 80, message: 'narrative 完成' }`
- render 阶段开始：`{ stage: 'render', progress: 85, message: 'render 开始...' }`
- render 完成：`{ stage: 'completed', progress: 100, message: '报告已生成', reportHtmlPath }`

### 需求 E：前端"Prism 分析"按钮 + iframe 展示

**改 `web/src/pages/Dashboard.tsx`**（VersionRunDrawer :343-421）：

- 在现有"AI 分析"按钮旁加"Prism 分析"按钮（或 Dropdown 加一个选项）
- 点击调 `generatePrismAnalysis(runId, { source: 'unity', multiStateDir })`
- 监听 SSE 进度（复用现有 SSE 机制），显示进度条
- 完成后跳转或弹窗用 iframe 展示 report.html

**改 `web/src/services/api.ts`**：
```typescript
export async function generatePrismAnalysis(runId: string, opts: { source: 'unity' | 'perfetto'; multiStateDir?: string; skipExplore?: boolean }): Promise<{ sessionId: string; status: string; position: number }>;
```

**iframe 展示**：
- 新建路由 `/prism-report/:sessionId` 或在 RunDetail 加 tab
- iframe src 指向后端 serve report.html 的路由
- 后端加路由 `GET /api/prism-report/:sessionId` 返回 report.html 文件

### 需求 F：后端 serve report.html 路由

**改 `web/server/routes/runs.ts`** 或新建路由：

```
GET /api/prism-report/:sessionId
返回: report.html 文件（Content-Type: text/html）
```

- 从 session 的 outputDir 找 report.html
- 设置 Content-Type: text/html
- iframe 直接加载

## 禁止事项

- **不许改 Prism 三段管线核心代码**（explore-service.ts / narrative-service.ts / render-html.ts）——本工单只做接入，不改 Prism 内部
- **不许改 Prism CLI 脚本**（run-unity-pipeline.ts / run-perfetto-pipeline.ts）——prism-runner.ts 复用其逻辑但不修改原脚本
- **不许动旧 skill 路径**（run-analysis-service.ts / perfetto-single-service.ts）——保留旧"AI 分析"按钮，加新的"Prism 分析"按钮
- **不许过度设计**——iframe 展示够用就行，不要搞 JSON bundle 重新渲染（report.html 本身就是成品）
- **不许硬编码业务名**——prism-runner.ts 要支持 unity 和 perfetto 两个源，不要写死 AOE 业务词
- **不许阻塞 API**——Prism 跑一次 17 分钟，必须走 queue 异步

## 验收标准（★客观可核）

### 机器断言
1. `web/server/services/prism-runner.ts` 存在，导出 `runPrismPipeline` 函数
2. `prism-runner.ts` 调用 `runPrismExplore` + `runPrismNarrative` + spawn `render-html.ts`（grep 验证 import 和 spawn）
3. `analysis-queue.ts` 支持 `taskType: 'prism'`（grep 验证）
4. `analysis-queue.ts` 的 `executeJob` 根据 taskType 分发（'skill' 走 executeCli，'prism' 走 runPrismPipeline）
5. `web/server/routes/runs.ts`（或 analysis.ts）有 POST `/runs/:id/generate-prism-analysis` 路由
6. `web/src/services/api.ts` 有 `generatePrismAnalysis` 函数
7. `web/src/pages/Dashboard.tsx` 有"Prism 分析"按钮（grep "Prism 分析" 验证）
8. 后端有 serve report.html 的路由（GET /api/prism-report/:sessionId）
9. 前端有 iframe 展示 report.html 的组件

### 端到端验证
10. 启动 dashboard，点"Prism 分析"按钮，能看到 SSE 进度推送（explore/narrative/render 三阶段）
11. 完成后 iframe 能加载 report.html（不是 404）
12. 不影响旧"AI 分析"按钮（旧路径仍能跑）

### 不退化
13. 通用 harness（`web/server/prism/harness.ts`）跑 perfetto 标杆报告不退化（239 PASS / 2 FAIL / 1 WARN，2 FAIL 是 WT-037 遗留）

## 完工报告（施工方填）

- 改了什么文件
- 怎么自测的
- 有无偏离工单

## 验收结论（主 agent 填）

PASS / 打回 + 原因
