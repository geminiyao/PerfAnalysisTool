# 性能分析体系总览

**目标**：长期版本性能数据采集 + 版本间性能对比，多源（Unity Profiler / Perfetto / Simpleperf）覆盖。

## 当前完成状态速览

### 功能矩阵（能否产出报告）

```
              单源单次              单源对比
unity       ✅ 能跑                ✅ Phase A 已完成
perfetto    ✅ 能跑（v6 单次）      ✅ v6 N 列 diff（triad 老路径仍保留）
simpleperf  ✅ 能跑                ✅ v4 diff 已完成
三源        ✅ cross 能跑          ❌ Phase C 未做
```

### 高质量 hybrid 接入状态

**「高质量」定义**：Provider 骨架（数字确定性）→ LLM 只润色/填空叙事 → 自评门 → 失败有兜底交付。

| 流水线 | 矩阵格 | 能产出报告 | 高质量 hybrid | Provider 骨架 | LLM 角色 | 自评门 | 失败兜底 | Service 入口 |
|---|---|:---:|:---:|---|---|---|---|---|
| **unity diff** | unity 对比 | ✅ | ✅ | `unity-diff-builder` skeleton + `LLM_FILL`（§3.x 分析槽） | L1 enrich 填 `ENRICH_FILL`（§4/§5）→ L2 CLI 填 `LLM_FILL`（§3.3–§3.6 数据分析） | `validateUnityDiffQuality` PASS | **正式验收** = ai-thickened；`skipAiEnrich` 时仅 enriched | `buildUnityCompareReport()` |
| **perfetto 单次** | perfetto 单次 | ✅ | ✅ | `render_perfetto_skeleton.py`（`LLM_FILL` 占位，N=1） | 只填占位符 | `validateSingleReport` | CLI/质量门 fail → 骨架 | `buildPerfettoSingleReport()` |
| **perfetto diff** | perfetto 对比 | ✅ | ✅ | 同上（N≥2，任意角色名） | 只填占位符 | `validateDiffReport` | 同上（L1 骨架兜底） | `buildPerfettoDiffReport()` |
| **simpleperf diff** | simpleperf 对比 | ✅ | ✅ | Provider 渲染 v4 骨架 | Python `enrich_v4_report` + 可选 CLI 加厚 | `compare_v4_report_quality.py`（0.82/0.92/0.95） | enriched → Provider 版 | `buildSimpleperfDiffReport()` |
| **unity 单次** | unity 单次 | ✅ | ❌ | 无报告骨架 | `executeCli` 读 summary **整篇写报告** | 仅 `checkSkillOutput`（查文件存在） | CLI 失败直接抛错，无 L1 兜底 | `runSingleSourceSkillAnalysis('unity_profiler')` |
| **simpleperf 单次** | simpleperf 单次 | ✅ | ✅ | `v4_single_report_renderer.py`（`LLM_FILL` 占位，N=1） | Python `enrich_v4_single_report` 填大部分槽 → CLI 填 §4 等剩余 | `compare_v4_single_report_quality.py` | enriched → **provider**（L0） | `buildSimpleperfSingleReport()` |
| **三源单次 cross** | 三源单次 | ✅ | 🟡 设计中 | `buildCrossSourceMarkdown` 程序拼装（非 v6 数字隔离） | AI 整篇改写（非 `LLM_FILL` 填空） | `validateCrossSourceQuality` | fallback builder 永远可交付 | `generateCrossSourceAnalysisForRun()` |
| **三源 diff** | 三源对比 | ❌ | ❌ | — | — | — | — | Phase C 待建 `cross-source-compare-service` |

### 正式样例目录

**根目录**：`output/samples/`（说明见 `output/samples/README.md`）

每条流水线样例路径 `output/samples/<子目录>/performance-report.<后缀>.md`（后缀标明形态，如 `e2e-l3-filled`），旁路 `meta.json` 记录 `destFile` 与同步源。**换样例时改 `scripts/sync-sample-reports.mjs` 中的 `source` / `destSuffix` 后执行：**

```bash
node scripts/sync-sample-reports.mjs
```

| 子目录 | 流水线 | 正式样例 | 后缀含义 |
|---|---|---|---|
| `unity-single/` | unity 单次 | [`performance-report.cli-sourcemap.md`](../output/samples/unity-single/performance-report.cli-sourcemap.md) | CLI + marker→源码映射 |
| `unity-diff/` | unity 对比 | [`performance-report.ai-thickened.md`](../output/samples/unity-diff/performance-report.ai-thickened.md) | Web 正式 ai-thickened（enrich + CLI 填 `LLM_FILL` + 质量门 PASS）；快验见 [`enriched-v2.md`](../output/samples/unity-diff/performance-report.enriched-v2.md) |
| `perfetto-single/` | perfetto 单次 | [`performance-report.e2e-l3-filled.md`](../output/samples/perfetto-single/performance-report.e2e-l3-filled.md) | Sprint 7 单次 e2e L3，`LLM_FILL=0` |
| `perfetto-diff/` | perfetto 对比 | [`performance-report.e2e-l3-triad.md`](../output/samples/perfetto-diff/performance-report.e2e-l3-triad.md) | Sprint 7 三态 e2e L3（673 行） |
| `simpleperf-single/` | simpleperf 单次 | [`performance-report.ai-thickened.md`](../output/samples/simpleperf-single/performance-report.ai-thickened.md) | hybrid：Provider + enrich + CLI + 质量门（待正式 e2e 验收后 sync） |
| `simpleperf-diff/` | simpleperf 对比 | [`performance-report.web-v4-diff.md`](../output/samples/simpleperf-diff/performance-report.web-v4-diff.md) | Web 落盘 v4 hybrid diff |
| `cross-single/` | 三源单次 | [`performance-report.fallback-builder.md`](../output/samples/cross-single/performance-report.fallback-builder.md) | fallback builder（AI 路径待验收） |
| `cross-diff/` | 三源对比 | — | Phase C 待实现，见 `cross-diff/README.md` |

**读表要点**：

- **已接入高质量 hybrid**（6 条）：unity diff、perfetto 单次、perfetto diff、simpleperf diff、**simpleperf 单次**（代码已接，样例待正式 e2e sync）。
- **未接入 hybrid**（1 条）：unity 单次 — 仍走老式 `executeCli` 全 AI 写报告路径。
- **三源单次 cross**：代码已接 AI 路径（Phase B），但 `output/p-web-cross/` 正式产出目前均为 fallback builder；架构也是「AI 改写」而非 v6 填空，**待验收 + 待升级**。
- **三源 diff**：矩阵唯一空白格，Phase C 待开。

**推进顺序**（已确认）：~~Phase X → A → B → C → D~~ → E ✅

| Phase | 内容 | 状态 |
|---|---|---|
| X | unity provider 数据加厚（多线程 markers / aggregatedCallTrees / GC 业务归因 ...）| ✅ 已完成 |
| A | unity diff（hybrid 三层：Provider + enrich + CLI 填 `LLM_FILL`；§3 数据分析 v2）| ✅ 已完成（2026-06-30，§3 LLM_FILL 2026-07）|
| B | cross-source 接 AI-authored | 🟡 代码已完成，正式产出待验收（见上表） |
| C | 三源 diff（提炼层）| ⏳ 待开 |
| D | simpleperf 单源（SKILL + service 接线；**非** hybrid 四件套）| ✅ 能跑 |
| **E** | **perfetto-diff-analysis（v6 N 列通用：单次 N=1 / 双份 N=2 / triad N=3 / 任意 N≥2 同源代码）+ 骨架填空模式** | **✅ 已完成（2026-06-30）** |
| 待定 | unity provider 加 rendering/memory stat 字段（依赖项目侧 ProfilerRecorder 改造）| 🟡 暂缓 |
| **探索** | **叙事三层（锚定/解读/探索）+ 三种演进做法试点** — 见下文 §「叙事架构演进」| 🟡 待讨论选型后开试点 |

---

## Hybrid 技术方案总览

### 分层模型（所有 hybrid 流水线共用）

```
L0  Provider / 骨架     summary → 程序渲染：表格、callTree、Δ%、ASCII…（数字确定性）
L1  Enriched（可选）    脚本按规则填叙事槽（不调用 LLM）
L2  AI-thickened        CodeBuddy CLI：填剩余 LLM_FILL / 加厚 prose
L3  质量门              占位符清零、厚度、表格行存在、关键数字 substring 校验
失败兜底                交付更低一层（provider / skeleton / enriched），或正式路径抛错
```

**`deliverSource` 含义**（Service 返回字段，表示最终 `performance-report.md` 来自哪一层）：

| 值 | 典型流水线 | 含义 |
|---|---|---|
| `ai-authored` | unity-diff、simpleperf-single | L2 通过质量门，正式验收目标 |
| `enriched` | unity-diff（`--skip-ai`） | L1 脚本叙事已齐，无 CLI 加厚 |
| `provider` | simpleperf-single | L0 原始骨架（叙事槽可能仍在） |
| `skeleton` | unity-diff（类型保留） | L0 概念名；当前正式路径失败时多 **抛错** 而非静默交付 |

### 两种叙事范式（不是优劣，是切分不同）

| 维度 | **路线 A：ENRICH 两段式** | **路线 B：LLM_FILL 一段式** |
|---|---|---|
| 代表流水线 | unity-diff、simpleperf diff/single | perfetto 单次/diff（v6） |
| L0 占位符 | `ENRICH_FILL`（§4/§5 等辅助叙事）+ `LLM_FILL`（§3.x 数据分析；simpleperf 亦用此名） | `<!-- LLM_FILL: 任务卡指令 -->` |
| L1 enrich | **有** — TS/Python 规则引擎填槽 | **无** — 槽位直接留给 LLM |
| L2 CLI 角色 | 在 enriched 上 **填 `LLM_FILL` 分析槽**（unity-diff §3.x；simpleperf 等亦可能加厚 prose） | **一次性填完**所有叙事槽 |
| 脚本叙事本质 | 规则匹配（模块类型 / 线程名 / GC 口径）+ 数据字段，**不全是**固定话术换数字 | — |
| LLM 自由度 | 槽内偏低，加厚段中等 | 槽内高（受任务卡约束） |
| 稳定性 / 成本 | 同输入 enrich 近似 deterministic；CLI 负担小 | 措辞波动；CLI 负担大 |
| 数字保护 | Provider 锁数字 + enrich 不碰表 | Provider **物理隔离**数字，LLM 只填注释槽 |

> **unity diff**、**simpleperf 单次**均为路线 A 混合体：流程是 Provider → enrich → CLI，但**数据分析槽**使用 `LLM_FILL`（非纯 `ENRICH_FILL` 模板）。

### 占位符机制（不是独立 template.md）

没有运行时「母版 template.md」。Provider **用代码拼出整篇 markdown**，在叙事位置插入 HTML 注释占位符，再由 enrich 或 LLM 替换：

```markdown
| 1 | CS:AOE.MeshUIManager | +1.97ms | +11677 | 🔴 |   ← 程序渲染（Provider 锁定）

**业务含义**：<!-- LLM_FILL:§3.5:业务含义: 60-120字… -->   ← L2 CLI 填（数据分析）
**优化方向**：<!-- LLM_FILL:§3.5:优化方向: 3-5条bullet… -->

<!-- ENRICH_FILL:§4:1:Job.Worker -->                        ← L1 enrich 填（辅助一句）
> **1:Job.Worker**：Burst Job 调度加重 0.61ms（…）         ← enrich 填后
```

### 正式验收 vs 快验（Service E2E）

| 级别 | 命令 | 通过标准 |
|---|---|---|
| **快验** | `npx tsx web/server/scripts/e2e-<流水线>.ts --skip-ai` | 到 L1 enriched（或 provider 兜底）；**非**正式验收 |
| **正式验收（ai-thickened）** | 同上，**不要** `--skip-ai` | `deliverSource=ai-authored`、占位符清零、质量门 PASS → `node scripts/sync-sample-reports.mjs` |

E2E 脚本直接调 Web 后端同一 `build*Report()`，与浏览器点按钮的报告生成逻辑同级（不经 HTTP）。

### 矩阵：各流水线技术方案一览

| 流水线 | 范式 | L0 Provider | L1 Enrich | L2 CLI | 占位符 | 质量门 | 失败兜底 | Service / E2E |
|---|---|---|---|---|---|---|---|---|
| **unity diff** | A* | `unity-diff-builder.ts` | `unity-diff-enrich.ts` | `unity-compare-service` | `ENRICH_FILL` + `LLM_FILL` | `validateUnityDiffQuality` | 正式路径抛错 | `buildUnityCompareReport` / `e2e-unity-diff.ts` |
| **perfetto 单次** | B | `render_perfetto_skeleton.py` N=1 | — | `perfetto-single-service` | `LLM_FILL` | `validateSingleReport` | L0 skeleton | `buildPerfettoSingleReport` |
| **perfetto diff** | B | 同上 N≥2 | — | `perfetto-diff-service` | `LLM_FILL` | `validate_perfetto_report.py` | L0 skeleton | `buildPerfettoDiffReport` |
| **simpleperf diff** | A | `build_simpleperf_profile` v4 | `enrich_v4_report.py` | 可选 CLI 加厚 | `LLM_FILL` | `compare_v4_report_quality.py` | enriched → provider | `buildSimpleperfDiffReport` / `e2e-simpleperf-diff.ts` |
| **simpleperf 单次** | A* | `v4_single_report_renderer.py` | `enrich_v4_single_report.py` | `simpleperf-single-service` | `LLM_FILL` | `compare_v4_single_report_quality.py` | enriched → provider | `buildSimpleperfSingleReport` / `e2e-simpleperf-single.ts` |
| **unity 单次** | _legacy_ | `preprocess.ts`（仅 JSON） | — | `executeCli` 整篇写 | 无骨架槽 | `checkSkillOutput` | 无 L0 兜底 | `runSingleSourceSkillAnalysis('unity_profiler')` |
| **cross 单次** | 混合 | `cross-source-digest` + builder | — | AI 整篇改写 | 无 v6 槽 | `validateCrossSourceQuality` | fallback builder | `generateCrossSourceAnalysisForRun` |
| **cross diff** | — | 未建 | — | — | — | — | — | Phase C |

---

## 各流水线技术方案明细

### unity diff（路线 A* · 真三层 hybrid，§3 数据分析用 LLM_FILL）

| 项 | 内容 |
|---|---|
| 数据流 | `base/cur.pdata` → preprocess → `unity-diff-builder` → `unity-diff-summary.json` + skeleton.md → enrich → CLI |
| L0 展示层 | §3：phase 总览树 / Top-N 帧预算表 / Top-N 驱动调用树（# 对齐）/ 出现帧明细 / §3.3–§3.6 身份+子函数表；§4/§5 表格；§8 ROI 索引 |
| L0 占位符 | `LLM_FILL:§3.N:{业务含义\|调用入口\|优化方向\|探索}`（每热点 4 槽，**数据分析主战场**）；`ENRICH_FILL:§4:{thread}` / `ENRICH_FILL:§5要点`（辅助一句） |
| L1 enrich | `unity-diff-enrich.ts`：填 `ENRICH_FILL`（§4 per-thread、§5 GC 要点）+ §0 场景对比/粗估优化空间；**不填** §3.x `LLM_FILL` |
| L2 CLI | `runAiEnrichment()` 读 enriched + summary；**替换全部 `<!-- LLM_FILL:... -->`** → `performance-report_unity_diff_AI_v1.md` |
| 质量门 | `ENRICH_FILL == 0`（enriched 层）+ `LLM_FILL == 0`（ai-thickened）；必备 §3 Top-N 驱动树 / phase 总览 / §3.3+ |
| 数字保护 | 表格、Δ%、emoji、callTree 由 Provider 锁定；CLI prompt 禁止改 §2/§3 表与树 |
| 项目特化 | Top-N 展示合并（`pb.decode` / `[res]` / `URP.*` pass）在 builder 展示层，不改 Δ 计算与通用流水线 |
| 样例 | `output/samples/unity-diff/performance-report.ai-thickened.md`（L2）；`performance-report.enriched-v2.md`（L1，`LLM_FILL` 仍在） |

### perfetto 单次 / diff（路线 B · v6 骨架填空）

| 项 | 单次 (N=1) | diff (N≥2) |
|---|---|---|
| Provider | `render_perfetto_skeleton.py` | 同上，多列角色名参数化 |
| 项目知识 | `projects/<name>/business-modules.yaml` 注入 threadHint / topNRemark |
| 占位符 | `<!-- LLM_FILL: 任务卡（须引上面数字、禁止编造）-->` | 同左，~44 槽 |
| LLM | 一次填完所有槽 | 同左 |
| 质量门 | 占位符 0、表格行缺失 ≤5、厚度 ≥0.85×骨架 | + 三档 L1/L2/L3 |
| 兜底 | CLI/质量门 fail → 交付 **skeleton.md**（数字在，叙事槽仍在） | 同左 |
| Service | `perfetto-single-service.ts` | `perfetto-diff-service.ts` |

### simpleperf diff（路线 A）

| 项 | 内容 |
|---|---|
| Provider | `build_simpleperf_profile.py` → `performance-report_simpleperf_v4.md` |
| Enrich | `scripts/enrich_v4_report.py` — 确定性填 §0–§5 等 `LLM_FILL` |
| CLI | 可选加厚；prompt 禁止改表格数字 |
| 质量门 | `compare_v4_report_quality.py`（0.82 / 0.92 / 0.95 厚度档） |
| 兜底 | FAIL → Provider 版 |

### simpleperf 单次（路线 A，占位符名同 perfetto）

| 项 | 内容 |
|---|---|
| Provider | `v4_single_report_renderer.py`（N=1） |
| Enrich | `enrich_v4_single_report.py` — §0 整块替换 + §1–§3/§5 规则句 + §4 兜底句 |
| CLI | `single-prompt.txt` — 仅替换**残留** `LLM_FILL`（尤其 §4 主线程深度解读） |
| 质量门 | `compare_v4_single_report_quality.py`；enriched 快验阈值 0.55× |
| Service | `simpleperf-single-service.ts`；`run-analysis-service` simpleperf 分支 |
| E2E | `web/server/scripts/e2e-simpleperf-single.ts` |

### unity 单次（_legacy · 待 hybrid 化）

| 项 | 内容 |
|---|---|
| 现状 | Provider 只产 JSON；`executeCli` 读 summary **整篇写** markdown |
| 风险 | 数字漂移、结构/厚度不稳、无 L0 兜底 |
| 改造方向 | 参照 simpleperf 单次或 perfetto v6 接入 Provider 骨架 + 质量门 |

### cross 单次（混合 · 待升级 v6）

| 项 | 内容 |
|---|---|
| 现状 | digest 程序拼装证据；AI 路径为整篇改写，非槽位填空 |
| 兜底 | `buildCrossSourceMarkdown` 永远可交付 |
| 改造方向 | 骨架化 digest 输出 + `LLM_FILL` 或事实清单双 pass |

### cross diff（未建）

Phase C：`cross-source-compare-service` 调度三底层 diff + 提炼层。

---

## 叙事架构演进（锚定 / 解读 / 探索）

**设计矛盾**：既要 LLM 更高自由度（含「涌现」式跨章节联想），又不要整篇报告「飘」（编造数字、无依据断言）。

**原则**（建议作为后续统一标尺）：

> **数字与结构由程序锁定；解读由 LLM 在任务卡与事实清单约束下书写；跨模块假设单独成段并标注「待验证」。**

### 报告三层语义（非文件分层）

| 层 | 内容 | 谁写 | 读者预期 |
|---|---|---|---|
| **锚定层 Anchor** | 表格、callTree、Δ%、口径说明 | Provider（+ enrich 不改表） | 可当作事实 |
| **解读层 Interpret** | 「意味着什么」「可能原因」「先查哪」 | enrich 和/或 LLM | 有依据的解释 |
| **探索层 Explore** | 跨 § 关联假设、优化方向、风险提醒 | **建议专供 LLM** | 显式「可能 / 待验证」 |

不必在「整篇自由」与「整篇死板」间二选一；**涌现应主要在探索层**，而非动锚定层数字。

### 三种演进做法（由稳到野）

#### 做法 1 · 锚 + 槽（在现有 hybrid 上提纯）

在 Provider 骨架中划分槽位等级，不改主流程：

- 解读槽：现有 `LLM_FILL` / enrich 规则
- **探索槽**：新增 `<!-- LLM_FILL:§X探索 -->`，任务卡要求「1–2 条跨章节假设，每条标注依据 §?，允许待验证」

| 优点 | 缺点 | 适合 |
|---|---|---|
| 改动小；与 perfetto v6 / unity-diff 兼容 | 涌现仍受任务卡篇幅限制 | **首选试点**；任何已有 hybrid 流水线 |
| 质量门可加「探索段存在 + 含待验证」软规则 | 规则写在 HTML 注释，难外置维护 | unity-diff（章节多、已有「AI 补充」） |

#### 做法 2 · 双 Pass（事实清单 → LLM 叙事）

```
Pass A（程序） summary → fact-bullets.json（仅可校验短句，带 factId）
Pass B（LLM）  facts + rules.yaml / 知识库 → 填解读槽 + 探索槽
```

| 优点 | 缺点 | 适合 |
|---|---|---|
| 最接近「给数据+规则，AI 叙事」 | 需新建 fact 抽取与引用校验 | unity-single、cross（尚无 enrich） |
| enrich 可逐步下线，规则外置 YAML | 工程量大于一槽位试点 | 新流水线默认架构 |
| 结论可追溯到 factId | 两次 LLM 调用或更长 prompt | 对审计要求高的对比报告 |

#### 做法 3 · 加厚段分级（unity 现状增强）

保留 enrich 打底，CLI 输出分栏：

- **AI 补充**（中自由度）：贴数字的解释
- **AI 探索（待验证）**（高自由度）：跨模块假设，3–5 行限额

| 优点 | 缺点 | 适合 |
|---|---|---|
| 与 unity-diff ai-thickened **几乎零骨架改动** | 探索段无独立占位符时难回归检测 | unity-diff、simpleperf-diff |
| 读者心理预期清晰 | 仍依赖 CLI 自律遵守分级标题 | 快速出可读样例 |

### 三种做法如何取舍（待讨论）

| 决策因素 | 倾向做法 1 | 倾向做法 2 | 倾向做法 3 |
|---|---|---|---|
| 上线时间 | ✅ 最快 | ❌ 最慢 | ✅ 快 |
| 与现有代码兼容 | ✅ | 🟡 需新模块 | ✅ |
| 规则可维护（非写死在 TS） | 🟡 | ✅ | 🟡 |
| LLM 涌现空间 | 🟡 中 | ✅ 高 | ✅ 高（探索段） |
| 防飘（可自动化验收） | ✅ 易加槽位检测 | ✅ factId 校验最强 | 🟡 需标题/软规则 |
| 推荐试点流水线 | **unity-diff**（有 enrich+加厚，易对比） | unity-single / cross | unity-diff |

**建议讨论顺序**：

1. 是否接受「探索层」进入正式报告（部分读者可能觉得冗长）？
2. 试点流水线：**unity-diff**（做法 1 或 3 成本最低，样例已有 ai-thickened 可 A/B）
3. 若试点 PASS，再决定是否对 perfetto v6 只加探索槽（做法 1），或对 unity-single 上新架构（做法 2）

**试点验收**（与现网一致）：`npx tsx web/server/scripts/e2e-unity-diff.ts` 正式 ai-thickened + 人工读 §0/§5 探索段是否「有依据、不飘」。

---

**核心原则**：
1. **provider 出数据，AI 写报告**：所有 skill 都走"provider 解析原始文件 → JSON 落盘 → AI 读 JSON 按 SKILL.md 规则写 markdown"路径
2. **CLI / Web 同一条 service 路径**：避免 simpleperf-diff 早期 cli/web 分叉的旧坑
3. **金标准 + 自评门**：每个产出报告都对照 docs/report/performance-report_<source>_ULTIMATE_*.md 做章节覆盖与关键 marker 校验，不达标回退到程序拼装 fallback
4. **三源融合是提炼层，不是重新分析**：cross-source 不重做底层，只做"共性印证 + 矛盾标注 + 因果链推断"

---

## 一、当前矩阵（已实现 vs 待实现）

> 高质量 hybrid 接入明细见文首 **「高质量 hybrid 接入状态」** 表。

```
                单源单次              单源对比 (diff)
unity         ✅ 能跑 / ❌ 非 hybrid   ✅ hybrid 三层 (A)
perfetto      ✅ v6 单次 hybrid (B)   ✅ v6 N 列 hybrid (B)
simpleperf    ✅ hybrid 单次 (A*)     ✅ v4 hybrid (A)
三源          🟡 cross 能跑 / 待验收   ❌ Phase C 待做

待补强（按优先级）：
1. 三源 diff 提炼层（Phase C）—— 矩阵最后一格 + 终极对比入口
2. 三源单次 cross — AI 路径验收 + 架构升级（v6 填空 / 双 Pass）
3. unity 单次 — 接入 Provider 骨架 + 自评门 + L1 兜底
4. 叙事三层试点 — unity-diff 探索槽 / 加厚分级（见「叙事架构演进」）
5. unity provider 加 rendering/memory stat 字段（依赖项目侧 ProfilerRecorder 改造，暂缓）
```

---

## 二、已有 4 条流水线详细设计

四条流水线共用同一个三层架构：

```
┌─────────────────────────────────────────────────────────────────┐
│ 原始文件 (.pdata / .pftrace / .data + binary_cache)              │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Provider 层（确定性，纯计算，不下结论）                            │
│   Python / TypeScript 脚本                                       │
│   产出 *-profile.json + *-profile-summary.json                   │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Service 层（web 与 cli 共用）                                     │
│   web/server/services/*.ts                                       │
│   ingest 入库 → 调度 AI → 自评门 → 入库 analyses + 报告          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Skill 层（AI-authored 报告产出）                                  │
│   .claude/skills/<skill>/SKILL.md 规定章节骨架 + 金标准 + 必采证据 │
│   AI 读 summary.json → 按 SKILL.md 写 performance-report.md       │
│   质量门: validateXxxReportQuality() 对章节 + 关键 marker grep    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 unity-profiler-analysis（unity 单源单次）

| 项 | 内容 |
|---|---|
| 输入 | `.pdata`（Unity Profiler 二进制）|
| Provider | `.claude/skills/unity-profiler-analysis/scripts/preprocess.ts`（Node tsx）|
| Provider 入口（service） | `runSourceProfileBuild('unity_profiler', ...)` → `runUnityPreprocessScript()` |
| 数据产物 | `preprocess-result.json`（顶层：`config / frameSummary / markers[] / markerSpikes[] / jankFrames / frameTrees[] / threads[]`）|
| Skill | `.claude/skills/unity-profiler-analysis/SKILL.md` |
| AI 调度 | `runSingleSourceSkillAnalysis(runId, 'unity_profiler')` → `executeCli(skill='unity_profiler', ...)` |
| 报告产出 | `performance-report.md` → 入库 `analyses` + `analysis_reports` |
| 已知短板（待 Phase X 修） | 1) `markers[]` 仅主线程为主（Render 7 / Submit 39）；2) `frameTrees[]` 只有 worst+median 两单帧，无 aggregatedCallTree；3) callTree 节点未标 `gcAllocCount`；4) 无 `markerSourceMap`（要 projectPath） |

### 2.2 perfetto-trace-analysis（perfetto 单源单次）

| 项 | 内容 |
|---|---|
| 输入 | `.pftrace`（perfetto trace） |
| Provider | `scripts/build_perfetto_profile.py` (主) + `scripts/perfetto_provider.py`（核心 SQL） |
| Provider 入口（service） | `buildPerfettoProfile(tracePath, meta, options, outputDir)` |
| 数据产物 | `perfetto-profile.json`（全量）+ `perfetto-profile-summary.json`（~25KB，AI 读这个）|
| 关键字段 | `metrics[]` / `frame[]` (choreographer) / `threadsSched` / `system` / `throttling` / `offCpuReasons` / `atraceSlices` / `callTrees[]` / `frameTimeline` / `confidence` / `profileWindow` |
| Skill | `.claude/skills/perfetto-trace-analysis/SKILL.md` |
| AI 调度 | `runSingleSourceSkillAnalysis(runId, 'perfetto')` |
| 报告产出 | `performance-report.md` → 入库 |
| 已知短板 | 1) `[[project_perfetto_provider_bugs]]` 5 条（aoeHotSlices 口径错 / cpu offline 漏检 / threadsSched 默认线程窄 / callTree 长帧剪枝 / 采集质量自检缺）；2) thermal/cpuinfo 旁路文件支持已在 preprocess.py 但 perfetto_provider.py 当前未透传 |

### 2.3 simpleperf-diff-analysis（simpleperf 双态对比）

| 项 | 内容 |
|---|---|
| 输入 | `base.data` + `cur.data` + `binary_cache/` |
| Provider | `simpleperf/build_simpleperf_profile.py` |
| Provider 入口（service） | `buildSimpleperfDiffProfile()` |
| 数据产物 | `base-profile.json` + `cur-profile.json` + `simpleperf-diff-summary.json` + `report/performance-report_simpleperf_v4.md`（provider 直接落地骨架）|
| 关键字段 | `layerBreakdown` (business/engine/runtime/noise) / `callTrees[]` / `anchors` / `symbolCheck` / `threadCpuMs` / `flamegraphPath` |
| Skill | `.claude/skills/simpleperf-diff-analysis/SKILL.md`（v4.1 Hybrid: Provider 骨架 + AI 加厚） |
| AI 调度 | provider 先出骨架，AI 再润色 §0/§4.3-4.6/§3.3（数字不可改）→ `performance-report_simpleperf_AI_v4.md` |
| 质量门 | `compare_v4_report_quality.py --min-length-ratio=0.78`，PASS=AI 版，FAIL=Provider 版 |
| 已知短板 | 单源单次报告（不带 base 的）能力弱（采样工具天然如此，没基线只能给 top-N） |

### 2.4 unity-profiler-compare（unity 双版本对比，Phase A · Hybrid v1，✅ 已完成）

| 项 | 内容 |
|---|---|
| 输入 | `base.pdata` + `cur.pdata`（同设备、同场景、同 target FPS） |
| Provider | `.claude/skills/unity-profiler-compare/scripts/unity-diff-builder.ts`（TypeScript）|
| Provider 入口（service） | `buildUnityCompareReport()` (`web/server/services/unity-compare-service.ts`) |
| 数据产物 | `unity-diff-summary.json` + `performance-report_unity_diff_skeleton.md` + `performance-report_unity_diff_enriched.md`（`ENRICH_FILL=0`，残留 `LLM_FILL`）+ `performance-report_unity_diff_AI_v1.md`（`LLM_FILL=0`） |
| 关键字段 | `frameSummary Δ` / `callTreesDiff` / `markersByThreadDiff` / `gcAttribution` / `topHotspots` / `topHotspotsPresent` / `spikes` / `presence` |
| Skill | `.claude/skills/unity-profiler-compare/SKILL.md`（参照 simpleperf-diff hybrid v4 模式） |
| 流水线（**真 hybrid 三层**）| 1. **Provider** (unity-diff-builder)：表格/树 + `LLM_FILL`（§3.x）+ `ENRICH_FILL`（§4/§5）<br>2. **Enrich**：填 `ENRICH_FILL` + §0 扩写 — **必须成功**<br>3. **AI（正式验收）**：CLI 填全部 `LLM_FILL` → `validateUnityDiffQuality` PASS；失败 **抛错** |
| AI 调度 | `runAiEnrichment()` 读 enriched + summary；替换 `<!-- LLM_FILL:§3.N:槽名:… -->`；禁止改数字/表/树 |
| 质量门 | 必备 §0–§8 / Top-N 驱动树 / phase 总览 / §3.3+ / 无 `ENRICH_FILL` + 无 `<!-- LLM_FILL` / §2 mean Δ 一致 / 行数 ≥ 金标准 78% — **PASS = ai-authored** |
| Web/CLI 入口 | `POST /runs/ingest/unity-compare/local`（页面 `/unity-compare`）/ `npx tsx web/server/scripts/e2e-unity-diff.ts` |
| 金标准 | `docs/report/performance-report_unity_diff_GOLDEN.md` (~250 行) |
| 真实输出示例 | `output/samples/unity-diff/performance-report.ai-thickened.md`（e2e outside pdata） |
| 数字保护 | enrich 用 summary.json 直接渲染，AI 仅在 enriched 之上加厚；表格数字、Δ%、状态 emoji 全程不可改 |

### 2.5 cross-source-analysis（三源单次综合，Phase 0-4 刚做完）

| 项 | 内容 |
|---|---|
| 输入 | 三源已 ingest 入库的 runId（同次三源采集）|
| Service 入口 | `analyze-single.ts --profile-dir <dir>` (cli) / `generateCrossSourceAnalysisForRun(runId)` (web) |
| 数据产物 | `cross-source-evidence.json`（digest）|
| Digest 字段（Phase 1-3 加厚后 12 项核心字段）| `unityCallTreeComposite` (worst+median 合成) / `perfettoCallTreeIndented` / `simpleperfCallTreeIndented` / `simpleperfSoBreakdown` / `threadCategory` / `capabilityMatrix` / `sameCaptureExt` / `throttlingEvidence` / `offCpuAttribution` / `interThreadWait` / `alignedHotNodes` (三源对位 + 冲突标注) / `nativeReverseCallStack` |
| Skill | `.claude/skills/cross-source-analysis/SKILL.md` |
| 报告生成 | 双路径：1) `opts.markdownPath` 已存在 → AI-authored 路径；2) fallback → `buildCrossSourceMarkdown()` 程序拼装 |
| 当前状态 | **AI 路径代码已接**（`cross-source-analysis-service.ts` spawnCli + `validateCrossSourceQuality`），但正式产出目前均为 fallback builder；架构为「AI 改写」非 v6 填空，**待验收 + 待升级**（见文首表） |
| 报告章节 | §0 一句话 / §1 同源性 / §2 瓶颈定型 / §3 主循环阶段（unity 主轴 + perfetto 佐证）/ §4 三源对位 / §5 波动 / §6 Simpleperf 独家 / §7 Perfetto 独家 / §8 共性+独有+建议 / §9 局限 |
| insights 重写 | headline 用真实业务模块名（如 `LuaMgr.OnTick`）而非 `gc collect`；§8.1 共性基于 `alignedHotNodes`；§8.2 独有含 native 反向链；§5 GC 子树归因用 `gcAllocCount`（数据齐时）|

### 2.6 perfetto-triad（perfetto 三态对比）

| 项 | 内容 |
|---|---|
| 输入 | base/cur/throttle 三份 `.pftrace`（每份可附 sidecar：thermal_before/after.txt + cpuinfo_max_freq.txt + collection-manifest.json） |
| Service 入口 | `web/src/pages/PerfettoTriad.tsx`「生成三态对比报告」按钮 → `perfetto-triad-service.ts` |
| 流水线 | 1) 对每份 trace 跑 `buildPerfettoProfile`（单源 provider）；2) 写 `triad-cli-prompt.txt` (引用 `docs/report/performance-report_perfetto_ULTIMATE_v5.3.md` 当 golden)；3) `spawnCliProcess` 启动 claude/codebuddy；4) AI 读三份 summary 写对比 markdown |
| Skill 复用 | 复用 `.claude/skills/perfetto-trace-analysis/SKILL.md` + `references/perfetto-report-template.md` |
| 质量门 | `validateTriadReportQuality()`：报告行数 ≥ golden 65%、缺一级章节失败、缺关键 marker (`Gfx.WaitForPresent / GC.Alloc / binder / off-CPU` 等) 失败 |
| 当前状态 | **已工程化 + AI-authored**，但严格说是"伪 diff"——它复用 perfetto 单源 skill，AI 读三份 summary 后**手工对比**写出叙事，而非 provider 层做 diff。这种方式对 ULTIMATE 类风格够用 |
| **2026-06-30 改造** | stdin 注入修 Windows .cmd 截断（`buildArgs()` 不再传 prompt 实参，改 `child.stdin.write()`）；prompt 抽到 `prompts/triad-prompt.txt` 与 SKILL.md 共用 |

### 2.6 perfetto-diff-analysis（v6 N 列通用 diff，2026-06-30 完成）

> **新 skill**，与 `perfetto-trace-analysis` / `perfetto-triad-service.ts` 并列保留作对比基线。引入"骨架填空"形态——LLM 物理上够不到数字 / 表格 / 调用树，仅填占位符叙事。

| 项 | 内容 |
|---|---|
| 输入 | 1~N 份 `.pftrace` 或对应 `perfetto-profile-summary.json`（N=1 单次形态、N=2 双份 diff、N=3 triad、任意 N≥1 同源代码）|
| 角色名 | 不写死 base/cur/throttle，任意字符串（如 v1.0/v1.1/setting_low/high）|
| Provider | `scripts/render_perfetto_skeleton.py`（N 列参数化骨架渲染器，~700 行 Python）|
| 项目知识 | `scripts/perfetto_project_pack.py` 自动检测 → 加载 `projects/<name>/business-modules.yaml` 注入业务模块 `threadHint / topNRemark` 到骨架 |
| 数据产物 | `skeleton.md`（带 ~44 个 `<!-- LLM_FILL: <task-card> -->` 占位符；表格/ASCII/callTree 已 100% 渲染）+ `performance-report.md`（LLM 填空后）+ `diff-report-quality.json` |
| 关键设计 | **数字物理隔离**：所有 metric / 表格 / ASCII 比例条 / callTree 节点签名 `[base/cur/throttle ms/帧]` 由 Python 渲染；LLM 只能填 LLM_FILL 注释 |
| Skill | `.claude/skills/perfetto-diff-analysis/SKILL.md` |
| Prompt 模板 | `.claude/skills/perfetto-diff-analysis/prompts/diff-prompt.txt`（Web 与手工 CLI 共用一份，stdin 注入避开 Windows .cmd 截断）|
| Web Service | `web/server/services/perfetto-diff-service.ts`（`buildPerfettoDiffReport(samples: DiffSample[], opts)`，支持 N≥2）|
| 质量门 | `scripts/validate_perfetto_report.py` —— hard-fail（LLM_FILL 残留 = 0 / 骨架表格行缺失 ≤ 5 / 代码块缺失 ≤ 1）+ 三档质量门（L3 ≥0.95×、L2 ≥0.92×、L1 ≥0.82×）|
| L1 兜底 | 任何 fail（CLI 失败 / 质量门 fail）→ 直接交付骨架本身（已含全部数字/表格/调用树，可独立交付）→ 用户**永远拿得到产物** |
| 单次形态金标准 | `docs/report/performance-report_perfetto_SINGLE_GOLDEN_v1.md`（667 行，按 v5.3 单列裁剪）|
| Sprint 7 验收 | E2E run1（base/cur/throttle 三态）= **L3 金标准等价**（行数 673 / 骨架 602 / 比 1.118× / LLM_FILL 残留 0 / 表格 0 缺失 / 数字 0 真幻觉 / 优化方向引用具体函数名 + 跨字段联立分析）|
| 已知短板 | provider 上游 bug 仍存（aoeHotSlices 口径错 / cpu offline 漏检 / threadsSched 默认线程窄）；下游骨架渲染从 callTrees 父子链直接重算 ms/帧，绕开第一项；降频判定停在 likely 档（confirmed 需 sysfs root，物理不可达）|

#### v6 跟 triad（2.5）的区别

| 维度 | 2.5 perfetto-triad | 2.6 perfetto-diff-analysis（v6） |
|---|---|---|
| 角色 | 写死 base/cur/throttle 3 个 | 任意 N≥1 + 任意角色名 |
| 数字写法 | LLM 从 summary 自己抄进 markdown | Python 渲染到骨架，LLM 不许碰 |
| 数字幻觉风险 | 中-高（LLM 抄写） | 物理 0（骨架隔离） |
| 报告章节齐全度 | 软约束（prompt 列要求） | 硬约束（骨架已渲染所有章节，LLM 漏了也补回） |
| 失败兜底 | 抛 Error，用户什么都没有 | L1 骨架兜底，用户永远有产物 |
| 项目特化 | prompt 内硬编码 AOE marker | yaml 项目包 + auto-detect，换项目改 yaml 不改代码 |
| 共享 prompt | service.ts inline + SKILL.md 各一份 | 唯一 `prompts/diff-prompt.txt`，Web/CLI/SKILL 共享 |
| 跑 5 次 PASS 率 | 未标定（每次抽样波动）| R1 spike 5/5 + Sprint 7 e2e L3，方案稳 |

---

## 三、AI-authored 路径细节（统一形态）

四条 AI-authored 流水线（unity 单源 / perfetto 单源 / simpleperf-diff / perfetto-triad）的 AI 调度形态完全一致：

```typescript
// cli-executor.ts:142
const prompt = buildSkillPrompt(skill, projectPath, inputPath, job);
// prompt 内容：
//   - 引用 .claude/skills/<skill>/SKILL.md 的章节骨架与质量门规则
//   - 引用对应的 golden 报告（docs/report/performance-report_<source>_ULTIMATE_*.md）
//   - 给定 inputPath / outputDir
//   - 禁止改 skill / 禁止用 Agent / 禁止 conversation summary

// 接着 spawnCliProcess(claude/codebuddy, [...]):
//   - 进程内启动 AI agent
//   - AI 读 SKILL.md + summary.json + golden
//   - 写 performance-report.md 落到 outputDir
//   - validateXxxReportQuality() 自评 → PASS 入库 / FAIL 回退
```

每个 skill 共享的契约：
- **数字一律来自 provider，不准编造**
- **缺数据标 `数据缺失` 或 `[推断]`，不臆断**
- **报告章节顺序固定（对照 SKILL.md 必备章节）**
- **跨源印证 ≥2 源同向才能下高置信结论**

---

## 四、待补工作清单

按依赖关系排：

### Phase X · unity provider 数据加厚（阻塞所有后续）

| # | 子项 | 工时 |
|---|---|---|
| X.1 | 多线程 markers 覆盖（不只主线程）| 0.5 天 |
| X.2 | aggregatedCallTrees per-thread（全 trace 平均 ms/帧 + presentOnFrameCount）| 1.0 天 |
| X.3 | callTree 节点带 `gcAllocCount`（[[methodology_gc_alloc_attribution]]）| 0.4 天 |
| X.4 | frameSummary 加 P95/P99/P999 | 0.1 天 |
| X.5 | jankFrames 挂 top markers | 0.3 天 |
| X.6 | threadSummary 加 msPerFrame.{self,total} + topMarkers | 0.3 天 |
| X.7 | markerSourceMap (file:line)，依赖用户提供 projectPath | 0.5 天（可选）|
| **小计** | P0+P1 | **2.6 天**（不含 X.7） |

### Phase A · unity-profiler-compare（unity 单源 diff）

参照 simpleperf-diff hybrid v4 模板（**Provider 算 diff 数字 + AI 增量润色**），不照搬 perfetto-triad 全 AI 重写：

| # | 子项 | 工时 |
|---|---|---|
| A.1 | 写 `.claude/skills/unity-profiler-compare/SKILL.md`（参照 simpleperf-diff-analysis 的 v4 hybrid 模式） | 0.2 天 |
| A.2 | Provider：`unity-diff-builder.ts`，输入 base/cur 两份 preprocess-result.json，算 aggregatedCallTrees Δ + markersByThread Δ + frameSummary Δ + GC Δ → `unity-diff-summary.json` | 0.5 天 |
| A.3 | Service：`web/server/services/unity-compare-service.ts`，参照 `buildSimpleperfDiffReport()` 结构（Provider 出骨架 → AI 润色 → 质量门 → 入库）| 0.4 天 |
| A.4 | Web 页面：`web/src/pages/UnityProfilerCompare.tsx`（参照 simpleperf 上传页结构）| 0.3 天 |
| A.5 | 金标准模板：精简版 unity diff 章节骨架（含 Δ 表 / 业务子树 Δ / GC Δ / 慢帧 Δ）| 0.1 天 |
| **小计** | | **1.5 天** |

> **关键设计决策**：unity diff 的核心是 ms/帧 Δ% 等严格数字，必须 Provider 确定性计算后**禁止 AI 改数字**，AI 仅在骨架基础上加业务叙事。这与 simpleperf-diff hybrid v4 完全同构。
> A.2 的 diff 算法（aggregatedCallTrees 路径对位 + Δ）会被 Phase C 三源 diff 复用，所以 A 是 C 的底层依赖。

### Phase B · cross-source 接 AI-authored

当前 cross-source 走 fallback 程序拼装，需要接 CLI：

| # | 子项 | 工时 |
|---|---|---|
| B.1 | 写 `cross-source-cli-prompt.txt` 模板（引用 SKILL.md + golden）| 0.2 天 |
| B.2 | 在 `cross-source-analysis-service.ts` 加 spawnCli 路径（参照 perfetto-triad-service）| 0.2 天 |
| B.3 | 写 `validateCrossSourceReportQuality()` 自评门 | 0.1 天 |
| **小计** | | **0.5 天** |

### Phase C · cross-source-compare（三源 diff，提炼层）

| # | 子项 | 工时 |
|---|---|---|
| C.1 | 写 `.claude/skills/cross-source-compare/SKILL.md` | 0.2 天 |
| C.2 | 写 `web/server/services/cross-source-compare-service.ts`（输入 base/cur 两个三源 runId → 调度 unity-compare + perfetto-triad 双态 + simpleperf-diff 三个底层 → AI 提炼共性/矛盾/因果链）| 0.6 天 |
| C.3 | 写 SKILL.md 的"共性/矛盾/因果链"提炼规则（功耗→降频→性能 / GC→慢帧 等 4-5 条因果链模板）| 0.2 天 |
| **小计** | | **1 天** |

### Phase D · simpleperf-analysis（simpleperf 单源单次）

> **2026-07 更新**：已升级为 **路线 A hybrid**（`v4_single_report_renderer` + `enrich_v4_single` + `simpleperf-single-service`）。下文为最初 Phase D 规划，部分已由 hybrid 实现替代。

| 项 | 内容 |
|---|---|
| 输入 | `perf.data` + `binary_cache/` |
| Provider | `build_simpleperf_profile.py` N=1 → `v4_single_report_renderer.py` |
| Enrich | `scripts/enrich_v4_single_report.py` |
| Service | `web/server/services/simpleperf-single-service.ts` → `buildSimpleperfSingleReport()` |
| E2E | `web/server/scripts/e2e-simpleperf-single.ts` |
| 待办 | 正式 ai-thickened e2e PASS + sync `output/samples/simpleperf-single/performance-report.ai-thickened.md` |

参照 unity / perfetto 单源 skill 模板（**legacy 路径仍保留于 `runSingleSourceSkillAnalysis`**）：

| # | 子项 | 工时 |
|---|---|---|
| D.1 | 写 `.claude/skills/simpleperf-analysis/SKILL.md`（区别于现有 simpleperf-diff-analysis）| 0.2 天 |
| D.2 | 复用 `buildSimpleperfProfile` provider（已支持单文件 `--perf` 模式）| 0 |
| D.3 | 报告章节定位：so 分层负载 / 主线程 c# vs lua / Wwise/RHI 线程占机 / native 反向 / Top-N 热点 | 0.3 天 |
| D.4 | 接 `runSingleSourceSkillAnalysis(runId, 'simpleperf_native')` 已有路径（`SINGLE_SOURCE_SKILLS` 里已声明 `simpleperf-native-analysis`，但 skill 实体 SKILL.md 缺）| 0.2 天 |
| D.5 | 写金标准（精简版 ULTIMATE v4.1 单态版） | 0.1 天 |
| **小计** | | **0.8 天** |

> **定位**：simpleperf 单次本质是**描述性**报告（"CPU 花在哪"的功耗快照），不做诊断判定。读者价值是给 cross-source 单次 / 趋势曲线提供"点进去看明细"的落地页。

### Phase E · perfetto-diff-analysis（v6 N 列通用 + 骨架填空）

> **2026-06-30 完成**。把 perfetto 流水线按 simpleperf v4 方法论改成"骨架填空"形态，并把 triad 通用化为任意 N 列。

| # | 子项 | 工时 | 状态 |
|---|---|---|---|
| E.1 | R1 spike：验证 LLM 守骨架填空规矩 | 0.5 天 | ✅ 5/5 通过 |
| E.2 | 修 stdin 注入（Windows .cmd 截断） | 0.5 天 | ✅ |
| E.3 | Web/SKILL 共享 prompt 模板 | 0.5 天 | ✅ |
| E.4 | 单次形态金标准策展 | 1.5 天 | ✅ `performance-report_perfetto_SINGLE_GOLDEN_v1.md` 667 行 |
| E.5 | 骨架渲染器 N 列参数化 | 5 天 | ✅ `scripts/render_perfetto_skeleton.py` ~700 行 |
| E.6 | 项目硬编码剥离（auto-detect + business-modules.yaml）| 1 天 | ✅ |
| E.7 | 新建 `perfetto-diff-analysis` skill + Web service | 1.5 天 | ✅ 保留 triad 作对比基线 |
| E.8 | 数值对账 + 三档质量门 + L1 骨架兜底 | 1 天 | ✅ |
| E.9 | E2E 验证（PASS 率标定）| 1 天 | ✅ run1 = L3 金标准等价 |
| **小计** | | **~12 天**（实际） | ✅ |

> **保留策略**：原 `perfetto-trace-analysis` skill 不删（单次基线），原 `perfetto-triad-service.ts` 不删（仅修了 stdin），新 `perfetto-diff-analysis` 与之并列作对比验证。
>
> **下游影响**：Phase C 三源 diff 内部对 perfetto 的双态对比可以**直接调 perfetto-diff（N=2）** 而非 triad，更通用。

### 总计

| Phase | 工作 | 工时 | 必要性 | 状态 |
|---|---|---|---|---|
| X | unity provider 加厚 | 2.6 天 | ✅ 已完成 | ✅ |
| A | unity diff（参照 simpleperf-diff hybrid v4）| 1.5 天 | 🔴 C 的底层依赖 | ✅ |
| B | cross-source 接 AI-authored | 0.5 天 | 🟡 提质 | ✅ |
| C | 三源 diff（提炼层） | 1 天 | 🔴 终极目标对比入口 | ⏳ |
| D | simpleperf 单源 | 0.8 天 | 🟡 8 格矩阵补齐 + 趋势曲线落地页 | ✅ |
| **E** | **perfetto-diff（v6 N 列 + 骨架填空）**| **12 天**（实际）| 🟢 通用化 + 数字物理隔离 | **✅** |
| **必做合计 (A+B+C)** | | **3 天** | | ⏳ C 待开 |
| **含 D** | | **3.8 天** | | ✅ A/B/D 完成 |
| **全做 (含 E v6)** | | **15.8 天** | | ✅ A/B/D/E 完成 |

完成必做 X+A+B+C 后 8 格矩阵填满核心格（4 个单次单源中，simpleperf 单次缺位但可以由 simpleperf-diff 单态降级凑），且全部走 AI-authored + 自评门同一形态。
加 D 后 8 格矩阵真正全填满。

---

## 五、终极目标对应路径

```
长期版本采集
  └─ 每个版本一次 "三源同次采集" (unity + perfetto + simpleperf)
       │
       ├─ ingest 入库 → cross-source-analysis 单次报告 (当前已能跑)
       │   ↓
       └─ 趋势曲线 (web 直接读 analyses 表 metrics, 无需新 skill)

版本对比 (双版本 diff)
  └─ 选 base 版 + cur 版 → cross-source-compare (Phase C 后)
       ├─ 内部调度 unity-diff + perfetto-triad/diff + simpleperf-diff (三个底层 AI 写)
       └─ AI 提炼共性 / 矛盾 / 因果链 → 综合 diff 报告
```

Web 主入口三个：
1. **三源单次** → cross-source 报告（已实现）
2. **三态/双态对比** → perfetto-triad（已实现）/ perfetto-diff (v6 N 列通用，已实现) / simpleperf-diff（已实现）/ unity-compare（已实现，hybrid 三层）
3. **跨版本三源 diff** → Phase C 后实现，是终极对比入口

---

## 六、关键文件位置速查

| 角色 | 文件 |
|---|---|
| **正式样例** | `output/samples/<pipeline>/performance-report.<后缀>.md` · 同步 `scripts/sync-sample-reports.mjs` |
| Skill 定义 | `.claude/skills/<skill>/SKILL.md` |
| Golden 报告 | `docs/report/performance-report_<source>_ULTIMATE_*.md`、`performance-report_perfetto_SINGLE_GOLDEN_v1.md`（单次形态）|
| Web service 入口 | `run-analysis-service.ts`（单源分流）、`simpleperf-single-service.ts`、`unity-compare-service.ts`、`perfetto-single-service.ts`、`perfetto-diff-service.ts`、`simpleperf-diff-service.ts`、`cross-source-analysis-service.ts` |
| Service E2E 脚本 | `web/server/scripts/e2e-unity-diff.ts`、`e2e-simpleperf-single.ts`、`e2e-simpleperf-diff.ts` |
| Simpleperf 单次 enrich | `scripts/enrich_v4_single_report.py` |
| Simpleperf 单次渲染 | `simpleperf/simpleperf_analyzer/v4_single_report_renderer.py` |
| Unity diff enrich | `.claude/skills/unity-profiler-compare/scripts/unity-diff-enrich.ts` |
| CLI executor | `web/server/services/cli-executor.ts`（统一 spawn AI CLI 的入口）|
| 共享 prompt 模板 | `.claude/skills/perfetto-trace-analysis/prompts/single-prompt.txt`（单次专用）<br>`.claude/skills/perfetto-trace-analysis/prompts/triad-prompt.txt`（老 triad 流程）<br>`.claude/skills/perfetto-diff-analysis/prompts/diff-prompt.txt`（v6 N≥2 通用 diff）|
| Digest 算法 | `web/server/services/cross-source-digest.ts`（三源对位、native 反向、能力矩阵 ...）|
| 报告 builder | `web/server/services/cross-source-report-builder.ts`（fallback 程序拼装）|
| Insights 算法 | `web/server/services/cross-source-insights.ts`（共性/独有/建议规则）|
| CLI 入口（共用 service）| `web/server/scripts/analyze-single.ts` |
| 骨架渲染器（v6） | `scripts/render_perfetto_skeleton.py`（N 列参数化）|
| 项目知识包 | `projects/<name>/*.yaml`（pack/business-modules/probes/slot-matchers/...）|
| Perfetto 项目包加载器 | `scripts/perfetto_project_pack.py`（auto-detect from summary）|
| 质量门 (perfetto v6) | `scripts/validate_perfetto_report.py`（hard-fail + 三档 + 数字对账）|
| 共享 prompt 模板 | `.claude/skills/<skill>/prompts/*.txt`（Web/CLI/SKILL 同一份）|
| 改造总结文档 | `docs/perfetto-pipeline-redesign-summary.md`（Sprint 1-7 交付物）|
