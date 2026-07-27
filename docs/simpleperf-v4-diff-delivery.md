# Simpleperf v4 差分报告 — 交付说明

> 本文档记录当前 simpleperf base/cur 差分 v4 报告的流水线做法、与金标准的关系、LLM 参与情况，以及后续建议。  
> 代码入口见 `.claude/skills/simpleperf-diff-analysis/SKILL.md`（commit `9e8da9c` 起）。

---

## 1. 报告文件路径

### 1.1 金标准（对照基准）

| 说明 | 路径 |
|------|------|
| **金标准 v4 差分报告** | [`docs/report/performance-report_simpleperf_ULTIMATE_v4.md`](report/performance-report_simpleperf_ULTIMATE_v4.md) |
| 行数 | 663 行 |
| 性质 | 人工策展 + 分析师叙事厚度标杆；**非**流水线自动生成目标 |

### 1.2 当前流水线产出（aoeyz 校准数据）

校准输入：

- base: `D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_base.data`
- cur: `D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_stressmove.data`
- symbols: `D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/binary_cache`
- 工作目录: [`docs/report/_intermediate/aoeyz_diff/`](report/_intermediate/aoeyz_diff/)

| 阶段 | 路径 | 约行数 | 说明 |
|------|------|--------|------|
| **Provider 骨架** | [`docs/report/_intermediate/aoeyz_diff/report/performance-report_simpleperf_v4.md`](report/_intermediate/aoeyz_diff/report/performance-report_simpleperf_v4.md) | ~547 | Python 规则渲染；compare ≥0.82× |
| **Enriched 交付版** | [`docs/report/_intermediate/aoeyz_diff/report/performance-report_simpleperf_AI_v4.md`](report/_intermediate/aoeyz_diff/report/performance-report_simpleperf_AI_v4.md) | ~595 | `enrich_v4_report.py` 确定性加厚；compare ≥0.92× |
| **最终拷贝** | [`docs/report/_intermediate/aoeyz_diff/performance-report.md`](report/_intermediate/aoeyz_diff/performance-report.md) | 同 Enriched | 流水线写入的交付文件名 |
| Web 一次导出存档 | [`docs/report/_intermediate/aoeyz_diff/report/simpleperf-diff_spdiff_1782476065966_6c9a4aa9.md`](report/_intermediate/aoeyz_diff/report/simpleperf-diff_spdiff_1782476065966_6c9a4aa9.md) | ~611 | Web 跑批历史快照；**重新 enrich 后以 `AI_v4.md` 为准** |

Web 运行时另会导出到：

```
output/p-web-simpleperf-diff/performance-report_{diffId}_{timestamp}.md
```

---

## 2. 当前流水线做法

```
base.data + cur.data + binary_cache
    ↓
simpleperf/build_simpleperf_profile.py     # 解析 → profile JSON + simpleperf-diff.json
    ↓
Provider: performance-report_simpleperf_v4.md
    ↓
scripts/build_simpleperf_diff_summary.py
scripts/validate_v4_report.py              # 数值探针 10/10
scripts/compare_v4_report_quality.py       # 结构 40/40 + 行数比（Provider ≥0.82×）
    ↓
scripts/enrich_v4_report.py                # enriched=True 确定性加厚
scripts/validate_v4_report.py
scripts/compare_v4_report_quality.py       # ≥0.92× 金标准
    ↓
performance-report_simpleperf_AI_v4.md → performance-report.md
    ↓
[可选] CodeBuddy CLI boost               # Web 默认关闭
    ↓
Web 展示 / 入库（/simpleperf-diff）
```

### 一键命令

```powershell
# CLI 正式流水线
.\scripts\run_simpleperf_v4_codebuddy.ps1 `
  -Base D:\...\perf_aoeyz_base.data `
  -Cur D:\...\perf_aoeyz_stressmove.data `
  -BinaryCache D:\...\binary_cache `
  -OutDir docs\report\_intermediate\aoeyz_diff

# 仅重跑 enrich（已有 diff JSON）
python scripts/enrich_v4_report.py docs/report/_intermediate/aoeyz_diff

# Web E2E
cd web && npx tsx server/scripts/e2e-simpleperf-diff.ts --http

# 重启 Web 服务（Windows）
.\scripts\restart-web-server.ps1
```

---

## 3. LLM 是否参与？

**结论：默认路径没有 LLM。**

| 环节 | 实际机制 | LLM？ |
|------|----------|-------|
| Provider | `v4_report_renderer.py` 规则渲染 | 否 |
| Enrich（`performance-report_simpleperf_AI_v4.md`） | `enrich_v4_report.py` → `render_v4_report(enriched=True)` | **否**（文件名含 AI 为历史命名） |
| Web 默认 | `skipAiEnrich=true`，跳过 CLI boost | 否 |
| 可选 CLI boost | `simpleperf-diff-service.ts` → CodeBuddy/Claude | **是**（需显式开启；有过改表、超时风险） |

因此当前交付物是：**度量与结构 100% 来自 perf.data + 规则引擎；叙事为模板加厚，不是模型读栈后撰写。**

---

## 4. 与金标准的差距

| 维度 | 金标准 ULTIMATE_v4 | 当前 Enriched | 评价 |
|------|-------------------|---------------|------|
| 核心数字（systemPressure、探针、Top-N） | +30.7% 等 | 一致 | validate 10/10 |
| 结构 §0–§11 | 663 行 | ~595 行（0.90–0.92×） | compare 结构 40/40 PASS |
| §5.2 调用树 | 热点深挖 + 非热点折叠（手写策展） | 已用 `render_main_thread_gold_style` 规则策展 | 接近，非逐字等同 |
| §0 / §4 叙事 | 业务语境、优先级解读 | 规则模板 | 偏薄 |

**适用场景：**

- ✅ 版本监测 / CI 回归：看 systemPressure、探针、Top-N、§4 表
- ⚠️ 对外「分析师级」叙事：需 L2 LLM 或人工审阅

---

## 5. 章节 × LLM 策略（设计目标）

口诀：**表和树永不 LLM；§0 和 §4 叙事值得 LLM；其余默认规则。**

| 章节 | 策略 | 说明 |
|------|------|------|
| §0 结论先行 | 🤖 推荐 LLM（Skill 约束） | 可改措辞与优先级叙述，**禁止改数字** |
| §1–§2 | 🔒 永不用 LLM | 元数据、SO 库表 |
| §4.1–4.2 探针 / Top-N 表 | 🔒 永不用 | 阈值与判定 |
| §4.3–4.6 模块叙事 | 🤖 推荐 LLM | 业务语境、优化建议表述 |
| §5.1 / §5.3 | 🔒 永不用 | PlayerLoop 表、红线扫描 |
| §5.2 调用树 | ⚙️ 仅规则 | 热点专向展开（`narrative_tree.py`） |
| §6–§9 | ⚙️  primarily 规则 | URP/ECS/Wwise/Lua 以 JSON 为准 |
| §10 反查清单 | 🔒 永不用 | caller chain 表 |
| §11 能力边界 | ⚙️ 规则 / 固定文案 | — |

---

## 6. 三档交付建议（恢复伸缩性）

当前 Web 默认落在 **L1**；最初 SKILL 设计的 Hybrid LLM 对应 **L2**。

| 档位 | 用途 | LLM | 质量门 |
|------|------|-----|--------|
| **L1 监测**（现状） | CI、日常回归、Web 快速分析 | 无 | validate + compare ≥0.92× |
| **L2 标准** | 团队评审、策划对接 | Skill 只润 §0 + §4.3–4.6 | validate 不变；失败回退 L1 |
| **L3 深度** | 重大版本 / 对外 | L2 + 人工对照金标准 | — |

**待办（工程）：**

1. Web 增加 `reportTier: L1 | L2` 或「标准报告（含 AI 叙事）」开关  
2. L2 恢复 CLI boost，硬约束只 patch 允许段落  
3. 确定性加厚 §0（按 Top-N 红项自动生成，不依赖 LLM）  
4. 修复 §5.3 `OutSideViewArmyLineMgr` 探针与 Top-N 口径不一致  

---

## 7. 相关代码文件清单（`9e8da9c`）

以下为本特性合入的代码文件及职责说明（不含 `__pycache__`、本地 `db.sqlite`、`_intermediate` 生成物）。

### 7.1 Python 分析内核（`simpleperf/simpleperf_analyzer/`）

| 文件 | 做什么 |
|------|--------|
| `v4_report_renderer.py` | v4 报告主渲染器：§0–§11 章节；`enriched=True` 加厚叙事；enrich 时 §5.2 走金标准热点树 |
| `narrative_tree.py` | 调用树叙事：URP/RHI 金标准树；**`render_main_thread_gold_style`**（热点专向展开 + 非热点 phase 折叠） |
| `diff_engine.py` | base/cur profile 差分：systemPressure、探针、业务模块、线程等 → `simpleperf-diff.json` |
| `top_n_engine.py` | Top-N 排序与红/黄/绿判定（含 meshui、army_line NEW 热点标红） |
| `business_modules.py` | 业务模块聚合（MeshUI、行军线、ECS、Wwise 等）及子函数 self 样本 |
| `probes.py` | §4.1 探针定义与阈值判定（对齐知识库 v2.1 §6） |
| `main_thread_tree.py` | 主线程标注调用树（phase、wrapper、📈🔴 标记） |
| `playerloop_phases.py` | PlayerLoop phase 识别与 phaseLabel 标注 |
| `v4_extensions.py` | 从 profile 构建 v4 扩展字段（mainThreadTree、callTrees 等） |
| `call_up_tracer.py` | §10 运行时反查（`__memcpy`、GC 等 caller chain） |
| `thread_tagger.py` | 线程分类（main / RHI / render / worker 等） |
| `tree_utils.py` | 调用图遍历、符号规范化 |
| `stack_selfcheck.py` | 栈数据自检 |
| `naming.py` | 符号友好命名 |
| `perf_provider.py` | 与 Web `perf-model.ts` 对齐的 profile JSON 契约输出 |

### 7.2 Python 构建入口

| 文件 | 做什么 |
|------|--------|
| `simpleperf/build_simpleperf_profile.py` | CLI/Web 共用入口：支持 `--base` 双采集 diff；输出 diff JSON + Provider v4 markdown |

### 7.3 流水线脚本（`scripts/`）

| 文件 | 做什么 |
|------|--------|
| `build_simpleperf_diff_summary.py` | 从 workDir 生成/汇总 `simpleperf-diff-summary.json` |
| `enrich_v4_report.py` | **确定性 enrich**（非 LLM）：读 diff JSON → `render_v4_report(enriched=True)` → `performance-report_simpleperf_AI_v4.md` |
| `validate_v4_report.py` | 数值探针校验（systemPressure、ecs、wwise、meshui、线程等 10 项） |
| `compare_v4_report_quality.py` | 结构 40 项 + 行数比质量门（默认 ≥0.92× 金标准） |
| `validate_v4_report_structure.py` | 报告章节结构校验（辅助） |
| `rerender_v4_report.py` | 仅从已有 diff JSON 重渲染 Provider 报告（调试） |
| `run_simpleperf_v4_codebuddy.ps1` | 正式 CLI 流水线：Provider → validate → enrich → compare，可选 CodeBuddy CLI boost |
| `run_aoeyz_v4_codebuddy.bat` | aoeyz 校准数据一键跑正式流水线 |
| `run_aoeyz_v4_report.bat` | aoeyz 校准数据快捷脚本（Provider 为主） |
| `restart-web-server.ps1` | Windows 重启 Web：Node 20、better-sqlite3 重建、Dev 模式 `tsx`、默认端口 3000 |

### 7.4 Web 后端

| 文件 | 做什么 |
|------|--------|
| `web/server/services/simpleperf-diff-service.ts` | 差分核心：build profile → post-provider → enrich → 质量门 → 可选 CLI boost → 入库 + 导出 markdown |
| `web/server/services/run-ingest-service.ts` | **`buildSimpleperfDiffProfile`**（base+cur 双采集）、`runProjectPython` 封装 |
| `web/server/services/ingest-job-service.ts` | `runSimpleperfDiffIngestJob` 异步任务；`finishJob` 携带 **`reportMarkdown`** |
| `web/server/routes/run-ingest.ts` | 路由：`POST /simpleperf-diff`（上传）、`/simpleperf-diff/local`、`/simpleperf-diff/bundle`；**Web 默认 `skipAiEnrich=true`** |
| `web/server/scripts/e2e-simpleperf-diff.ts` | E2E：Service 直连 + HTTP API 全链路验证 |
| `web/shared/types.ts` | `IngestJobKind: 'simpleperf_diff'`、`reportMarkdown`、`diffId` 等类型 |
| `web/shared/perf-model.ts` | PerfProfile 模型扩展（与 Python perf_provider 契约对齐） |

### 7.5 Web 前端

| 文件 | 做什么 |
|------|--------|
| `web/src/pages/SimpleperfDiff.tsx` | `/simpleperf-diff` 页：拖两份 `.data` → 进度 SSE → Markdown 渲染/下载 |
| `web/src/services/api.ts` | `ingestSimpleperfDiffRun` / `Local` / `Bundle`；解析 `reportMarkdown` |
| `web/src/App.tsx` | 注册路由 `/simpleperf-diff` |
| `web/src/components/AppSider.tsx` | 侧栏入口「Simpleperf 差分」 |

### 7.6 文档与 Skill

| 文件 | 做什么 |
|------|--------|
| `.claude/skills/simpleperf-diff-analysis/SKILL.md` | 差分分析 skill：Hybrid 设计（Provider + 可选 LLM 润色 + 质量门回退） |
| `.claude/skills/simpleperf-diff-analysis/references/simpleperf-v4-report-template.md` | v4 报告结构参考模板 |
| `docs/report/performance-report_simpleperf_ULTIMATE_v4.md` | **金标准**对照报告（已入库） |
| `docs/simpleperf-v4-diff-delivery.md` | 本文档：交付说明、路径、LLM 策略、后续建议 |

### 7.7 架构关系（代码层）

```
perf.data (base + cur)
    ↓
build_simpleperf_profile.py          ← simpleperf/
    ↓
simpleperf-diff.json + Provider v4   ← diff_engine.py + v4_report_renderer.py
    ↓
build_simpleperf_diff_summary.py     ← scripts/
validate_v4_report.py
compare_v4_report_quality.py
    ↓
enrich_v4_report.py                  ← scripts/（确定性，无 LLM）
    ↓
performance-report_simpleperf_AI_v4.md
    ↓
[可选] simpleperf-diff-service.ts    ← CLI boost（Web 默认关）
    ↓
SimpleperfDiff.tsx                   ← 浏览器展示
```

---

*最后更新：2026-06-26 · 对应 git `9e8da9c` simpleperf v4 diff 首次合入*
