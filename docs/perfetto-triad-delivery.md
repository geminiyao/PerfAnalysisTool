# Perfetto 三态对比报告 — 交付说明

> 本文档记录当前 Perfetto **base / cur / throttle** 三态对比报告的流水线做法、与金标准的关系、**各节点 LLM 参与情况**，以及供其他 Agent 评估开发现状的代码清单。  
> 对照参考：[`docs/simpleperf-v4-diff-delivery.md`](simpleperf-v4-diff-delivery.md)（simpleperf 差分 v4，架构相反：默认无 LLM）。

**文档日期**：2026-06-29  
**示例 Web Run**：`http://localhost:3000/cpu/runs/triad_1782702063785_d3f73683`


---

## 1. 报告文件路径

### 1.1 金标准（对照基准）

| 说明 | 路径 |
|------|------|
| **金标准 v5.3 三态报告** | [`docs/report/performance-report_perfetto_ULTIMATE_v5.3.md`](report/performance-report_perfetto_ULTIMATE_v5.3.md) |
| 行数 | **816 行**（`triad-report-quality.json` 按 `\n` 切分计数） |
| 性质 | 人工策展 + Skill 方法论标杆；基于同批 `sample_*_20260624_*` 三份 trace + 旁路文件；**非**流水线逐字复刻目标 |
| 备选金标准 | 若 v5.3 不存在则回退 `docs/report/performance-report_perfetto_ULTIMATE_v5.2.md`（`goldenReportPath()`） |

历史版本（仅作演进参考，**验收以 v5.3 为准**）：

- `docs/report/performance-report_perfetto_ULTIMATE_v5.2.md`
- `docs/report/performance-report_perfetto_ULTIMATE_v5.1.md` … v1

### 1.2 本次 Web 跑批产出（`triad_1782702063785_d3f73683`）

校准输入（与金标准同批样本）：

| 角色 | trace | sample 目录 |
|------|-------|-------------|
| base | `G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_base_20260624_104944/2026-06-24_10-49-c1a652.pftrace` | `.../sample_base_20260624_104944` |
| cur | `G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_cur_20260624_105041/2026-06-24_10-50-efb338.pftrace` | `.../sample_cur_20260624_105041` |
| throttle | `G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_throttle_20260624_105539/2026-06-24_10-55-2f0696.pftrace` | `.../sample_throttle_20260624_105539` |

| 阶段 | 路径 | 行数 / 状态 | 说明 |
|------|------|-------------|------|
| **工作目录（主产物）** | [`web/data/results/triad_1782702063785_d3f73683/`](../../web/data/results/triad_1782702063785_d3f73683/) | — | 三态一次跑批的完整中间态 |
| **CLI 正式报告** | `web/data/results/triad_1782702063785_d3f73683/performance-report.md` | **887 行** | CodeBuddy CLI 按 Skill + 模板生成；质量门 **PASS** |
| **紧凑事实包** | `web/data/results/triad_1782702063785_d3f73683/triad-report-facts-compact.json` | — | 框架从三份 summary 裁剪、无 LLM |
| **CLI Prompt 存档** | `web/data/results/triad_1782702063785_d3f73683/triad-cli-prompt.txt` | — | 发给 CodeBuddy 的完整 prompt |
| **CLI 日志** | `web/data/results/triad_1782702063785_d3f73683/triad-cli.log` | — | stream-json 事件摘要 |
| **质量门结果** | `web/data/results/triad_1782702063785_d3f73683/triad-report-quality.json` | `ok: true` | 行数 ≥ 金标准 65%；章节 / 探针 / 热点覆盖 |
| **各角色 Provider 摘要** | `.../base|cur|throttle/perfetto-profile-summary.json` | ~25KB/份 | Python Provider 确定性产出 |
| **各角色全量 Profile** | `.../base|cur|throttle/perfetto-profile.json` | ~2MB/份 | 入库 / 深层下钻用，LLM 不直读 |
| **Web 导出归档** | [`output/p-web-perfetto-triad/performance-report_triad_1782702063785_d3f73683_20260629111429.md`](../../output/p-web-perfetto-triad/performance-report_triad_1782702063785_d3f73683_20260629111429.md) | 887 行 | `saveReportMarkdown()` 时间戳副本；内容与 `performance-report.md` 一致 |
| **Web 展示** | `http://localhost:3000/cpu/runs/triad_1782702063785_d3f73683` | — | 父 Run；子 Run：`triad_1782702063785_d3f73683_{base,cur,throttle}` |

### 1.3 关键绝对路径速查

| 类型 | 绝对路径 |
|------|----------|
| 本次 Web Run URL | `http://localhost:3000/cpu/runs/triad_1782702063785_d3f73683` |
| 本次报告主文件 | `K:/AI/PerfAnalysisTool_Codebuddy/web/data/results/triad_1782702063785_d3f73683/performance-report.md` |
| 本次报告导出归档 | `K:/AI/PerfAnalysisTool_Codebuddy/output/p-web-perfetto-triad/performance-report_triad_1782702063785_d3f73683_20260629111429.md` |
| 本次质量门结果 | `K:/AI/PerfAnalysisTool_Codebuddy/web/data/results/triad_1782702063785_d3f73683/triad-report-quality.json` |
| 本次 CLI Prompt | `K:/AI/PerfAnalysisTool_Codebuddy/web/data/results/triad_1782702063785_d3f73683/triad-cli-prompt.txt` |
| 金标准报告 | `K:/AI/PerfAnalysisTool_Codebuddy/docs/report/performance-report_perfetto_ULTIMATE_v5.3.md` |
| 金标准回退 | `K:/AI/PerfAnalysisTool_Codebuddy/docs/report/performance-report_perfetto_ULTIMATE_v5.2.md` |

### 1.4 与 simpleperf 的关键差异


| 维度 | Simpleperf v4 diff | Perfetto 三态 |
|------|-------------------|---------------|
| 报告主体生成 | Python 规则渲染 Provider + 确定性 Enrich | **CLI LLM 读 Skill/模板写全文** |
| Web 默认 LLM | 关闭（`skipAiEnrich=true`） | **必须**（mock 仅复制已有金标准，非真实生成） |
| 确定性加厚步骤 | `enrich_v4_report.py` | **无**；厚度靠 LLM 一次写完 + 质量门 |
| Provider 角色 | 报告骨架 + 数字 | **仅出数据**（summary JSON） |

---

## 2. 当前流水线做法

```
base.pftrace + cur.pftrace + throttle.pftrace (+ 同目录 meta / 旁路文件)
    ↓  ×3 并行逻辑（for 循环）
scripts/build_perfetto_profile.py          # 调用 perfetto_provider.build_profile_dict
    → perfetto-profile.json + perfetto-profile-summary.json  （每角色子目录）
    ↓
web ingestProfile()                          # 三份子 Run 入库（metrics 在子 Run）
    ↓
writeTriadFacts()                            # triad-report-facts-compact.json（框架裁剪）
buildTriadPrompt()                           # 拼 prompt → triad-cli-prompt.txt
    ↓
runCliTriad() → CodeBuddy / Claude CLI       # ★ LLM 读 Skill + 模板 + facts，写 performance-report.md
    ↓
validateTriadReportQuality()                 # 对照金标准 v5.3：行数、§ 章节、关键 marker、热点、帧数探针
writeQualityReport() → triad-report-quality.json
    ↓  (失败则 throw，无 Web 兜底)
saveReportMarkdown() + saveRun(parent) + saveAnalysisWithReport()
    ↓
Web 展示（/perfetto-triad 上传 → /cpu/runs/{triadId}）
```

### 2.1 流程节点 × 机制 × LLM

| 节点 | 实现 | LLM？ | 说明 |
|------|------|-------|------|
| **① Trace 解析 / Provider** | `scripts/perfetto_provider.py` + `build_perfetto_profile.py` | **否** | TraceProcessor SQL；产出 metrics、threadsSched、throttling、offCpu、binder、gcAlloc、aoeHotSlices、callTrees 等 |
| **② 帧分析 L1–L3（可选共用）** | `scripts/frame_analysis.py`（新） | **否** | 按 `docs/frame-analysis-data-contract.md` 做帧口径分析；Provider 可引用 |
| **③ Profile 入库** | `run-ingest-service.ts` → `ingestProfile()` | **否** | 写 run-store / SQLite |
| **④ 事实包裁剪** | `perfetto-triad-service.ts` → `writeTriadFacts()` | **否** | 从三份 summary 提取 hotSlices、unityMainTree、threads、throttling 等 → `triad-report-facts-compact.json`（避免 LLM 读 2MB JSON） |
| **⑤ Prompt 组装** | `buildTriadPrompt()` | **否** | 指向 Skill 目录、模板路径、金标准路径、三份 summary 路径、硬性章节清单 |
| **⑥ 报告正文生成** | `runCliTriad()` → `spawnCliProcess(codebuddy, prompt)` | **是（核心）** | LLM 按 `perfetto-trace-analysis` Skill + `perfetto-report-template.md` 撰写 **整篇** Markdown；保存为 `performance-report.md` |
| **⑦ 报告规范化** | `normalizeReportInOutputDir()` | **否** | 文件名 / 路径整理 |
| **⑧ 质量门禁** | `validateTriadReportQuality()` | **否** | 行数 ≥ 65% 金标准；§-1…§10 章节号；Gfx.WaitForPresent / GC.Alloc / binder / off-CPU / ASCII 资产等 marker；样本热点名覆盖；三态 PlayerLoop 帧数出现；拒绝「Web 兜底版」文案 |
| **⑨ Web 导出 / 入库** | `saveReportMarkdown` + `saveAnalysisWithReport` | **否** | 父 Run `triad_*` + analysis 记录 |
| **Mock provider** | 复制 `findMatchingSkillReport('perfetto')` | **否** | 仅 E2E/离线；**不是**真实三态生成 |

**一句话**：度量与结构数据 **100% 来自 Python Provider + 框架事实包**；**叙事、章节编排、ASCII 图、业务解读全文由 LLM 撰写**，不是「模板填槽」式框架渲染（与 simpleperf v4 相反）。

### 2.2 CLI Prompt 硬性约束（摘要）

来源：`triad-cli-prompt.txt`（本次 run 实例）

- 必须先 Read `references/perfetto-report-template.md`，按 v5.3 章节写，不得自述读了模板
- 验收对照 `performance-report_perfetto_ULTIMATE_v5.3.md`：结构一致、核心数字一致、厚度接近
- 优先读 `triad-report-facts-compact.json`，禁止默认全文读三份 summary
- 必须覆盖 §-1…§10、§3 多线程、§4.5 因果链 ASCII、§5.2 降频形态、§5.4 矩阵、§6.2 callTrees、§6.3 热点下钻、§7.3 GPU 矩阵
- 热点名必须来自本次 `facts.hotSlices`，禁止编造业务模块
- 只写报告，不改 skill / 代码；不用子 Agent

### 2.3 一键命令

```powershell
# 直接调 service（需本机 CodeBuddy CLI 可用）
cd web
npx tsx server/scripts/tmp-perfetto-triad-e2e.ts

# Web 本地路径模式（三份 sample 目录）
# POST /runs/ingest/perfetto-triad/local
# body: { paths: { base, cur, throttle }, cliProvider: "codebuddy" }

# 重启 Web
.\scripts\restart-web-server.ps1
```

单角色 Provider（非三态）：

```powershell
python scripts/build_perfetto_profile.py `
  --trace G:/.../sample_base_.../xxx.pftrace `
  --out output/p1-perfetto-base
```

---

## 3. LLM 是否参与？（与 simpleperf 对比）

| 环节 | Perfetto 三态 | Simpleperf v4 diff |
|------|---------------|-------------------|
| 数据解析 | Python Provider，无 LLM | Python Provider，无 LLM |
| 报告骨架 | **无**独立 Provider 渲染器 | `v4_report_renderer.py` 规则渲染 |
| 报告正文 | **CLI LLM 全文撰写** | 规则 + `enrich_v4_report.py`（确定性） |
| Web 默认 | **必须 CLI**（否则报错） | 默认跳过 LLM |
| 质量门失败后 | **抛错**，不回退 Web 兜底 | 可回退 Provider / 跳过 enrich |
| 文件名误导 | 无（不叫 AI_xxx） | `AI_v4.md` 实际无 LLM |

**设计意图**：Perfetto 报告章节多、ASCII 资产多、三态叙事厚，当前选择 **Skill 约束的单次 LLM 生成**，用确定性质量门卡住底线；尚未实现 simpleperf 式的「L1 纯规则 + L2 可选 LLM 润色」分层。

---

## 4. 与金标准的差距（本次 run）

来源：`triad-report-quality.json`

| 维度 | 金标准 v5.3 | 本次 `triad_1782702063785` | 评价 |
|------|-------------|---------------------------|------|
| 行数 | 816 | 887（≈1.09×） | 厚度门 PASS（≥65%） |
| 质量门 errors | — | `[]` | **PASS** |
| 质量门 warnings | — | `[]` | 无警告 |
| 数值 / 章节 / marker | 人工策展标杆 | 自动验收通过 | 结构对齐；**非字节级等同** |
| 叙事稳定性 | 固定 | 依赖 LLM 每次生成 | 同输入重跑可能有措辞差异 |
| 可复现性 | 高（文档即产物） | 中（CLI 时长、模型、超时） | 45 分钟硬超时 |

**适用场景**：

- ✅ 三态对比正式评审：当前路径已是「正式报告」定义（非 Web 结构化兜底）
- ⚠️ CI 无人值守：依赖 CodeBuddy CLI、长耗时、LLM 非确定性
- ⚠️ 与金标准逐段 diff：需人工或另写 compare 脚本（尚无 `compare_v53_report_quality.py`）

---

## 5. 章节 × 生成策略（当前实现）

| 章节 | 当前机制 | LLM？ |
|------|----------|-------|
| §-1 数据采集 · 能力声明 | LLM 读 facts + 旁路 manifest | **是** |
| §0 结论先行 | LLM 叙事 | **是** |
| §1–§2 采集质量 / 元信息 | LLM 填表（数字来自 summary） | **是**（数字受 prompt 约束，无独立 validate 探针） |
| §3 多线程独立分析 | LLM + threadsSched 数据 | **是** |
| §4 off-CPU + §4.4/4.5 ASCII | LLM | **是** |
| §5 降频证据链 + §5.2/5.4 | LLM（`throttling.level` 应用 M2） | **是** |
| §6 callTrees + §6.3 下钻 | LLM 读 `unityMainTree` / hotSlices | **是** |
| §7 GPU bound + §7.3 矩阵 | LLM | **是** |
| §8–§10 | LLM | **是** |
| 质量门探针 | TypeScript 字符串 / 行数 / 章节号 | **否** |

**未来可借鉴 simpleperf**：表与树永不 LLM、仅 §0 / 部分叙事 LLM——需先补 **确定性 Provider 渲染器**（当前缺失）。

---

## 6. 本轮相关代码改动清单（报告持久化 / 查看入口 / 超时）

> 本节记录 2026-06-29 针对「报告刷新丢失、Runs 看不到父 Run、子 Run 详情看不到三态报告、生成超时」这一轮修复。下表只列本轮直接相关文件，不代表整个 Perfetto 三态特性的全部文件。

| 文件 | 状态 | 改动说明 | LLM 参与关系 |
|------|------|----------|--------------|
| [`web/server/services/perfetto-triad-service.ts`](../web/server/services/perfetto-triad-service.ts) | `??` 未跟踪核心文件 | 三态完成后新增父 Run `triad_*`，`sources=['perfetto_triad']`；报告 analysis 关联 `[triadId, base, cur, throttle]`；CLI 超时由 15 分钟提高到 45 分钟；正式路径无 CLI 时直接失败，不再 Web 兜底 | 这里负责调度 LLM CLI；自身不做 LLM 推理 |
| [`web/server/services/analysis-store.ts`](../web/server/services/analysis-store.ts) | `M` | `getAnalysisReportByRunId()` 从 `find` 改为筛选 + 排序，优先返回 `skill` 含 `triad` 的 analysis，再按完成时间取最新；解决子 Run 详情被单源 perfetto 报告覆盖 | 无 LLM |
| [`web/server/services/ingest-job-service.ts`](../web/server/services/ingest-job-service.ts) | `M` | 三态任务完成事件返回 `reportMarkdown`；`runIds` 改为 `[triadId, ...子Run]`，前端生成后无需再靠 base 子 Run 拉报告 | 无 LLM |
| [`web/src/pages/PerfettoTriad.tsx`](../web/src/pages/PerfettoTriad.tsx) | `??` 未跟踪核心页面 | 生成完成后优先使用 `reportMarkdown`；否则从父 Run `triadId` 恢复；新增「打开持久化报告」按钮跳转 `/runs/{triadId}`；过滤重复显示的父 Run ID | 无 LLM |
| [`web/src/pages/RunDetail.tsx`](../web/src/pages/RunDetail.tsx) | `M` | 识别 `perfetto-trace-analysis+triad` / `perfetto_triad` / `triad_`；三态报告页只展示/下载已有报告，不显示误导性的「生成 perfetto 报告」按钮；下载名改为 `perfetto-triad-report_{id}.md` | 无 LLM |
| [`web/src/pages/Runs.tsx`](../web/src/pages/Runs.tsx) | `M` | `perfetto_triad` 增加独立颜色标签；页面说明父 Run 与 `base/cur/throttle` 子 Run 关系 | 无 LLM |

本轮修复后的查看路径：

1. `/perfetto-triad` 生成完成后页面下方直接渲染报告。
2. 点击「打开持久化报告」进入 `/runs/{triadId}`。
3. `Runs` 列表出现 `perfetto_triad` 父 Run。
4. 父 Run 与任一子 Run 的「完整报告」页签都应优先展示三态报告。

---

## 7. Git / 合入状态（供 Agent 评估）

| 状态 | 说明 |
|------|------|
| **已推送 `origin/master`** | `9e8da9c` simpleperf v4；**不含** Perfetto 三态核心实现文件 |
| **危险不一致** | `9e8da9c` 已提交 `run-ingest.ts`、`ingest-job-service.ts`、`App.tsx` 中对 `perfetto-triad-service.ts` / `PerfettoTriad.tsx` 的引用，但这两文件 **未进 Git**（`??` 未跟踪）→ 干净 clone **无法编译/跑三态** |
| **工作区 WIP** | 见 §8 清单；大量 `docs/report/performance-report_perfetto_ULTIMATE_*.md` 未提交 |

---

## 8. 相关代码文件清单（本次 Perfetto 三态特性）


### 8.1 Python — 数据 Provider（确定性，无 LLM）

| 文件 | Git | 做什么 |
|------|-----|--------|
| [`scripts/perfetto_provider.py`](../scripts/perfetto_provider.py) | `M` (+916/-23) | **核心**：TraceProcessor 解析；thread sched；callTrees；aoeHotSlices + `_peel_onion`；throttling 四档（confirmed/likely/suspected/none）+ 温度旁路；RHI/LuaMtGC/ECS Worker slice 反查；binderPeers；gcAllocByModule；offCpuAttribution；sysfs/thermal 旁路 |
| [`scripts/build_perfetto_profile.py`](../scripts/build_perfetto_profile.py) | 已存在（早先合入） | CLI 入口：写 `perfetto-profile.json` + `perfetto-profile-summary.json` |
| [`scripts/frame_analysis.py`](../scripts/frame_analysis.py) | `??` | L1–L3 帧分析引擎；契约 `docs/frame-analysis-data-contract.md`；与 unity skill 侧 `frame-analysis.ts` 对称 |

### 8.2 Skill — LLM 方法论与模板（报告权威）

| 文件 | Git | 做什么 |
|------|-----|--------|
| [`.claude/skills/perfetto-trace-analysis/SKILL.md`](../.claude/skills/perfetto-trace-analysis/SKILL.md) | `M` | 执行流 Step 1–4；v5.2 方法论 M1–M4；三态时由 CLI prompt 引用 |
| `references/perfetto-report-template.md` | `??` | **报告骨架唯一权威**（§-1…§10 顺序、ASCII 占位符） |
| `references/aoe-cpu-analysis-knowledge.md` | `??` | AOE 业务热点阈值与判读 |
| `references/lessons-learned.md` | `??` | v5 踩坑（callTrees vs atrace LIKE 等） |
| `references/frame-analysis-data-contract.md` | `??` | 帧分析字段契约 |
| `references/aoe-watch-spec.yaml` | `??` | 观测规格 |
| `references/collection-config-rationale.md` | `??` | 采集配置说明 |

### 8.3 Web Server — 三态编排（框架 + LLM 调度）

| 文件 | Git | 做什么 |
|------|-----|--------|
| [`web/server/services/perfetto-triad-service.ts`](../web/server/services/perfetto-triad-service.ts) | `??` **未提交** | **核心编排**：三份 profile 构建；`writeTriadFacts`；`buildTriadPrompt`；`runCliTriad`；`validateTriadReportQuality`；父 Run + analysis 入库 |
| [`web/server/services/ingest-job-service.ts`](../web/server/services/ingest-job-service.ts) | `M` | `runPerfettoTriadIngestJob()` 异步任务包装 |
| [`web/server/routes/run-ingest.ts`](../web/server/routes/run-ingest.ts) | 已在 `9e8da9c` | `POST /runs/ingest/perfetto-triad`（上传）；`/local`（本地路径）；`buildTriadSampleFromDir` |
| [`web/server/services/run-ingest-service.ts`](../web/server/services/run-ingest-service.ts) | 已合入 | `buildPerfettoProfile()` 调 Python 脚本 |
| [`web/server/scripts/tmp-perfetto-triad-e2e.ts`](../web/server/scripts/tmp-perfetto-triad-e2e.ts) | `??` | 本地 E2E：固定 G: 盘三份 sample + CodeBuddy |

### 8.4 Web Frontend

| 文件 | Git | 做什么 |
|------|-----|--------|
| [`web/src/pages/PerfettoTriad.tsx`](../web/src/pages/PerfettoTriad.tsx) | `??` **未提交** | `/perfetto-triad`：拖拽上传 / 本地路径；进度 SSE；Markdown 预览与下载 |
| [`web/src/services/api.ts`](../web/src/services/api.ts) | 已在 `9e8da9c` | `ingestPerfettoTriadRun` / `ingestPerfettoTriadLocalRun` |
| [`web/src/App.tsx`](../web/src/App.tsx) | 已在 `9e8da9c` | 路由 `/perfetto-triad`（**引用未提交的页面组件**） |
| [`web/src/components/AppSider.tsx`](../web/src/components/AppSider.tsx) | 已合入 | 侧栏「Perfetto 三态」 |
| [`web/src/pages/RunDetail.tsx`](../web/src/pages/RunDetail.tsx) | `M` | 三态父 Run 报告下载命名 `perfetto-triad-report_{id}.md` |
| [`web/src/components/FrameAnalysisPanel.tsx`](../web/src/components/FrameAnalysisPanel.tsx) | `??` | 帧分析 UI（与 frame_analysis 契约联动） |
| [`web/src/components/ThreadSchedBars.tsx`](../web/src/components/ThreadSchedBars.tsx) | `??` | 线程调度条可视化 |

### 8.5 文档与金标准

| 文件 | Git | 做什么 |
|------|-----|--------|
| [`docs/report/performance-report_perfetto_ULTIMATE_v5.3.md`](report/performance-report_perfetto_ULTIMATE_v5.3.md) | `??` | **当前金标准** |
| `docs/report/performance-report_perfetto_ULTIMATE_v5.2.md` 等 | `??` | 历史版本 |
| [`docs/perfetto-engineering-roadmap-v5.2.md`](perfetto-engineering-roadmap-v5.2.md) | `??` | 工程路线图 |
| [`docs/perfetto-skill-web-integration-spec.md`](perfetto-skill-web-integration-spec.md) | `??` | Skill ↔ Web 集成规格 |
| [`docs/frame-analysis-data-contract.md`](frame-analysis-data-contract.md) | `??` | 帧分析契约（与 skill references 同步） |

### 8.6 运行时产物（不入库）

| 路径 | 说明 |
|------|------|
| `web/data/results/triad_*/` | 每次三态跑批工作目录 |
| `output/p-web-perfetto-triad/` | 导出 Markdown 归档 |
| `web/data/db.sqlite` | Run / Analysis 存储 |

---

## 9. 已知问题与待办（Agent 评估入口）

1. **未提交核心文件**：`perfetto-triad-service.ts`、`PerfettoTriad.tsx` 未进 Git，但路由已引用 → **阻塞他人 clone**。
2. **无 L1 确定性报告路径**： unlike simpleperf，没有 `v5_report_renderer.py`；mock 只能复制旧报告。
3. **质量门较粗**：无逐字段数值探针（simpleperf `validate_v4_report.py` 级）；主要靠 marker 字符串 + 行数 + 热点名。
4. **LLM 非确定性**：同 facts 重跑，措辞/小节厚度可能波动；887 vs 816 行不代表稳定。
5. **CLI 依赖与超时**：45 分钟超时；开发时 `tsx watch` 重启会中断 ingest job。
6. **无专用 compare 脚本**：建议补 `scripts/compare_perfetto_v53_quality.py`（结构分 + 行数比 + 关键数字探针）。
7. **Provider 大 diff 未提交**：`perfetto_provider.py` +916 行仍在工作区，合入前需 review + 单测。
8. **TypeScript 构建**：历史上 `perfetto-triad-service.ts` 曾有 tsc 告警，合入前需 `cd web && npm run build` 验证。

---

## 10. 给其他 Agent 的快速结论

| 问题 | 答案 |
|------|------|
| 报告谁写的？ | **CodeBuddy CLI（LLM）** 按 Skill + 模板写全文；不是框架填表 |
| 数字谁算的？ | **Python `perfetto_provider.py`** + `triad-report-facts-compact.json` 裁剪 |
| 金标准在哪？ | `docs/report/performance-report_perfetto_ULTIMATE_v5.3.md` |
| 本次 Web 报告在哪？ | `web/data/results/triad_1782702063785_d3f73683/performance-report.md` + `output/p-web-perfetto-triad/performance-report_triad_1782702063785_d3f73683_20260629111429.md` |
| 能否无 LLM 交付？ | **当前不能**（正式路径强制 CLI；mock 非生产） |
| 开发完整度？ | Provider + Skill 文档较完整；**Web 编排与 UI 未提交**；与 `master` 存在断裂 |

---

## 11. 参考链接

- Simpleperf 对照交付说明：[`docs/simpleperf-v4-diff-delivery.md`](simpleperf-v4-diff-delivery.md)
- Skill 入口：[`.claude/skills/perfetto-trace-analysis/SKILL.md`](../.claude/skills/perfetto-trace-analysis/SKILL.md)
- 会话 transcript（本次三态跑批上下文）：`agent-transcripts/d260d471-5118-4c5b-924c-1f8829b34c26.jsonl`
