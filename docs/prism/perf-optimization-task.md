# Prism Pipeline 性能优化任务

## 一、现状

Prism 三阶段管线（explore → narrative → render）单次分析耗时 **35-46 分钟**，严重影响可用性。

### 最近两次 profile run 真实数据

| 指标 | Run 1 (07-24_11-15) | Run 2 (07-24_11-56, profile run) |
|------|---------------------|----------------------------------|
| 总耗时 | 35.5 min | 45.9 min |
| Explore | 23.0 min | 31.4 min |
| Narrative | 11.4 min | 13.3 min |
| Render | 1.0 min | 1.2 min |
| 工具调用次数 | 16 | 22 |
| 是否命中 timeout | 否 | 是（30min timeout → grace polling 接住） |

### 精确计时数据文件

- **Run 1 pipeline-timing.json**: `web/data/prism-out/camera_ab_24072PX77C_20260723_194703/2026-07-24_11-15-20/pipeline-timing.json`
- **Run 2 pipeline-timing.json**: `web/data/prism-out/camera_ab_24072PX77C_20260723_194703/2026-07-24_11-56-38/pipeline-timing.json`
- **Run 2 explore-raw-stream.jsonl** (574KB, 完整 LLM stream): `web/data/prism-out/camera_ab_24072PX77C_20260723_194703/2026-07-24_11-56-38/explore-raw-stream.jsonl`
- **Run 2 narrative-raw-stream.jsonl** (164KB, 完整 LLM stream): `web/data/prism-out/camera_ab_24072PX77C_20260723_194703/2026-07-24_11-56-38/narrative-raw-stream.jsonl`
- **Run 2 ledger.json** (204KB, 工具调用明细): `web/data/prism-out/camera_ab_24072PX77C_20260723_194703/2026-07-24_11-56-38/ledger.json`

## 二、根因分析（基于真实数据）

### Explore 阶段瓶颈拆解（Run 1, 23 min）

| 类别 | 耗时 | 占比 |
|------|------|------|
| LLM 决策思考（处理上轮结果 + 决定下一步） | 13.3 min | 58% |
| LLM 生成输出（写 verdict/findings/data-requests） | 6.6 min | 29% |
| 工具执行（16 次调用） | 2.3 min | 10% |
| 收尾 | 0.5 min | 3% |

**核心结论：90% 的时间是 LLM 在思考，工具执行只占 10%。**

### 上下文膨胀效应

LLM 每轮推理的上下文 = system prompt (40KB) + 工具定义 (~25KB) + 所有历史 tool_result 累积。

| 轮次 | 累计上下文 | LLM 思考耗时 | tool_result 大小 |
|------|-----------|-------------|-----------------|
| #1 | 65KB | 46s | 249 chars |
| #5 | 79KB | 89s | 30,462 chars |
| #10 | 185KB | 112s | 30,689 chars |
| #12 | 240KB | 137s | 6,563 chars |
| #14 (写 findings) | 247KB | 248s | 166 chars |

6 个 ~30KB 的 tool_result 占了 180KB 上下文（73%）。到第 10 轮时 LLM 要读 185KB 才能决定下一步查什么。

### 隐藏黑洞：156 个工具定义

从 raw stream 第一行（system init 事件）发现：codebuddy CLI 启动时加载了 **156 个工具定义**（~25KB）：
- 126 个 MCP 工具：crashsight(17) + garyUnityMCP(21) + garyUnrealMCP(30) + km(14) + recruit-mcp(3) + tapd(4) + user-unityMCP(31) + yzkanban(6)
- 30 个标准工具：Agent, Read, Write, Edit, Bash, PowerShell, Glob, Grep, TaskCreate, WebFetch, WebSearch, ImageGen...

explore LLM 只需要 Bash + Read + Write + Glob + Grep（5 个），但 `--allowedTools` 不是排他的，156 个工具定义全部加载到上下文。

### Run 2 额外问题：LLM 做了 8 次无用的验证+编辑调用

Run 2 的 22 次工具调用中，#15-#22（8 次）是 LLM 在写完 findings.json 后：
- 用 Bash 读回 findings.json 验证格式
- 用 Grep 搜索 findings.json 内容
- 用 **Edit** 修改 findings.json（两次！）
- 再读回验证

这 8 次调用浪费了约 8 分钟。

## 三、已完成的优化

| 优化 | 文件 | 效果 |
|------|------|------|
| tools.cli.bundle.js 预编译 | explore-service.ts + esbuild | 工具执行从 757ms→171ms/call (77% 快) |
| --tools 排他限制 + --strict-mcp-config | explore-service.ts, narrative-service.ts | 156→5 个工具定义 (省 ~24KB/轮) — **已改代码，未验证** |
| Raw stream 文件保存 | explore-service.ts, narrative-service.ts | explore-raw-stream.jsonl + narrative-raw-stream.jsonl |
| Narrative 实时进度 | narrative-service.ts + prism-runner.ts | 从 0 反馈 → "LLM 推理中 (Xs)" |
| Timeout grace polling | explore-service.ts, narrative-service.ts | 30min + 5min 轮询，不再硬失败 |
| 心跳显示当前活动 | analysis-queue.ts | "⏱ 已运行 Xm | #4 调用 scanMetricOverFrames" |
| pipeline-timing.json 解析工具名 | prism-runner.ts | Modal 显示 "queryUnityMarkers+scanPeakMarkers" 而非原始 cmd |
| Prism 报告 tag 折叠 | Dashboard.tsx | 超过 4 个折叠成 "+N 更多" |
| 三阶段计时下拉选择 | Dashboard.tsx | 可切换查看任意一次分析的计时 |

## 四、待优化项（按预估收益排序）

### 优化 A：精简 tool_result 返回内容（预估省 4-6 min）

**问题**：6 个 batch 调用各返回 ~30KB 数据，累积 180KB 上下文。LLM 后续每轮推理都要处理全部历史。

**方案**：在 `tools.cli.ts` 的 batch 模式下，对每个工具的返回结果做摘要：
- queryUnityMarkers：只返回 top N 的 name + selfMs + totalMs，去掉 frameIndices 数组
- scanMetricOverFrames：只返回 mean/p50/p95/max + 5 个采样点，去掉全部逐帧数据
- getFrameCallTree：只返回 top 10 调用链节点，去掉深层子节点
- drillDownMarker：只返回 leaves top 5 + annotations，去掉完整子树

目标：每个 tool_result 从 ~30KB → ~10KB，总上下文从 247KB → ~127KB。

**验证方式**：对比优化前后的 pipeline-timing.json，看 LLM 思考时间是否下降。

**关键文件**：
- `web/server/prism/tools.cli.ts` — batch 命令处理
- `web/server/prism/tools.ts` — 各工具的返回格式

### 优化 B：预计算初始查询并注入 prompt（预估省 2-3 min）

**问题**：前 2-3 轮工具调用每次都一样（queryUnityMarkers + scanPeakMarkers + scanMetricOverFrames(PlayerLoop)）。

**方案**：在 `explore-service.ts` 启动 CLI 之前，用 `tools.cli.bundle.js batch` 预跑这些查询，把结果注入 prompt 的"已查询数据"区域。LLM 跳过前 2-3 轮，直接从 drillDown 开始。

**关键文件**：
- `web/server/prism/explore-service.ts` — 启动前预计算
- `web/server/prism/prompts/unity-explore-prompt.txt` — 模板加"已查询数据"区域

### 优化 C：消除 LLM 写完 findings 后的验证+编辑调用（预估省 5-8 min）

**问题**：Run 2 中 LLM 在写完 findings.json 后做了 8 次调用（读回验证、Grep 搜索、Edit 修改），浪费约 8 分钟。

**方案**：在 explore prompt 中明确规定：
- "写完 findings.json 后直接结束，不要读回验证"
- "不要用 Edit 修改已写的文件，如果需要改就重新 Write 整个文件"
- "不要用 Grep 搜索你刚写的文件"

**关键文件**：
- `web/server/prism/prompts/unity-explore-prompt.txt`

### 优化 D：同 runId 复用 findings（预估省 23-31 min，条件性）

**问题**：同一份数据每次都重新 explore，但 findings 内容基本相同。

**方案**：UI 上加"复用上次 findings"选项，跳过 explore 直接跑 narrative + render。在 Dashboard.tsx 的 Prism 分析按钮旁加一个"快速重分析"按钮。

**关键文件**：
- `web/src/pages/Dashboard.tsx` — UI 按钮
- `web/server/services/prism-runner.ts` — skipExplore 逻辑
- `web/server/services/analysis-queue.ts` — 传递 skipExplore 参数

### 优化 E：验证 --tools + --strict-mcp-config 效果（预估省 2-3 min）

**问题**：代码已改为 `--tools`（排他）+ `--strict-mcp-config`（禁 MCP），但未验证实际效果。

**方案**：跑一次新 analysis，对比 raw stream 第一行的工具定义数量（应从 156 → 5），对比 LLM 思考时间。

**关键文件**：
- `web/server/prism/explore-service.ts` — CLI_PROVIDERS
- `web/server/prism/narrative-service.ts` — NARRATIVE_CLI_PROVIDERS

## 五、目标

| 场景 | 当前 | 目标 |
|------|------|------|
| 首次分析（full pipeline） | 35-46 min | **< 20 min** |
| 重复分析（skip explore） | 35-46 min | **< 15 min** |
| explore 阶段 | 23-31 min | **< 12 min** |
| narrative 阶段 | 11-13 min | **< 8 min** |

## 六、验证方法

1. 每次优化后跑一次 full pipeline（可通过脚本或 web UI）
2. 对比 `pipeline-timing.json` 的 explore/narrative/render 耗时
3. 检查 `explore-raw-stream.jsonl` 第一行确认工具定义数量
4. 检查 tool_result 大小是否减小
5. 跑 harness 验证报告质量不退化：`cd web && npx tsx server/prism/harness.ts --source unity --dir <run-dir>`

## 七、关键文件索引

| 文件 | 作用 |
|------|------|
| `web/server/prism/explore-service.ts` | Explore 阶段 LLM 调用 + CLI 参数 + raw stream 保存 |
| `web/server/prism/narrative-service.ts` | Narrative 阶段 LLM 调用 + CLI 参数 + raw stream 保存 |
| `web/server/prism/tools.cli.ts` | Prism 工具 CLI 入口（batch 模式 + 单工具模式） |
| `web/server/prism/tools.ts` | 各工具实现（queryUnityMarkers, scanMetricOverFrames 等） |
| `web/server/prism/prompts/unity-explore-prompt.txt` | Explore prompt 模板（40KB） |
| `web/server/services/prism-runner.ts` | 三阶段编排 + pipeline-timing.json 写入 |
| `web/server/services/analysis-queue.ts` | Web UI 触发 + SSE 进度推送 + 心跳 |
| `web/src/pages/Dashboard.tsx` | 前端 UI（进度显示 + 三阶段计时 Modal + 报告 tag） |
| `web/data/prism-out/<runId>/<timestamp>/` | 每次分析的输出目录（findings/verdict/narrative/report/raw-stream） |
