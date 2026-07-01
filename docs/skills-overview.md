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
| **unity diff** | unity 对比 | ✅ | ✅ | `unity-diff-builder` skeleton | enrich 确定性填占位 → CodeBuddy 在 enriched 上加厚 | `validateUnityDiffQuality` PASS | **正式验收** = ai-thickened；`skipAiEnrich` 时仅 enriched | `buildUnityCompareReport()` |
| **perfetto 单次** | perfetto 单次 | ✅ | ✅ | `render_perfetto_skeleton.py`（`LLM_FILL` 占位，N=1） | 只填占位符 | `validateSingleReport` | CLI/质量门 fail → 骨架 | `buildPerfettoSingleReport()` |
| **perfetto diff** | perfetto 对比 | ✅ | ✅ | 同上（N≥2，任意角色名） | 只填占位符 | `validateDiffReport` | 同上（L1 骨架兜底） | `buildPerfettoDiffReport()` |
| **simpleperf diff** | simpleperf 对比 | ✅ | ✅ | Provider 渲染 v4 骨架 | Python `enrich_v4_report` + 可选 CLI 加厚 | `compare_v4_report_quality.py`（0.82/0.92/0.95） | enriched → Provider 版 | `buildSimpleperfDiffReport()` |
| **unity 单次** | unity 单次 | ✅ | ❌ | 无报告骨架 | `executeCli` 读 summary **整篇写报告** | 仅 `checkSkillOutput`（查文件存在） | CLI 失败直接抛错，无 L1 兜底 | `runSingleSourceSkillAnalysis('unity_profiler')` |
| **simpleperf 单次** | simpleperf 单次 | ✅ | ❌ | 无报告骨架 | 同上 | 同上 | 同上 | `runSingleSourceSkillAnalysis('simpleperf')` |
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
| `unity-diff/` | unity 对比 | [`performance-report.ai-thickened.md`](../output/samples/unity-diff/performance-report.ai-thickened.md) | Web 正式 ai-thickened（enrich + CLI + 质量门 PASS） |
| `perfetto-single/` | perfetto 单次 | [`performance-report.e2e-l3-filled.md`](../output/samples/perfetto-single/performance-report.e2e-l3-filled.md) | Sprint 7 单次 e2e L3，`LLM_FILL=0` |
| `perfetto-diff/` | perfetto 对比 | [`performance-report.e2e-l3-triad.md`](../output/samples/perfetto-diff/performance-report.e2e-l3-triad.md) | Sprint 7 三态 e2e L3（673 行） |
| `simpleperf-single/` | simpleperf 单次 | [`performance-report.web-stressmove.md`](../output/samples/simpleperf-single/performance-report.web-stressmove.md) | Web 落盘 stressmove 场景 |
| `simpleperf-diff/` | simpleperf 对比 | [`performance-report.web-v4-diff.md`](../output/samples/simpleperf-diff/performance-report.web-v4-diff.md) | Web 落盘 v4 hybrid diff |
| `cross-single/` | 三源单次 | [`performance-report.fallback-builder.md`](../output/samples/cross-single/performance-report.fallback-builder.md) | fallback builder（AI 路径待验收） |
| `cross-diff/` | 三源对比 | — | Phase C 待实现，见 `cross-diff/README.md` |

**读表要点**：

- **已接入高质量四件套**（4 条）：unity diff、perfetto 单次、perfetto diff、simpleperf diff。其中 unity/simpleperf diff 多一层确定性 enrich（模板填占位），比 perfetto v6 的「数字物理隔离 `LLM_FILL`」稍弱，但同属 hybrid 范式。
- **未接入**（2 条）：unity 单次、simpleperf 单次 — 仍走老式 `executeCli` 全 AI 写报告路径。
- **三源单次 cross**：代码已接 AI 路径（Phase B），但 `output/p-web-cross/` 正式产出目前均为 fallback builder；架构也是「AI 改写」而非 v6 填空，**待验收 + 待升级**。
- **三源 diff**：矩阵唯一空白格，Phase C 待开。

**推进顺序**（已确认）：~~Phase X → A → B → C → D~~ → E ✅

| Phase | 内容 | 状态 |
|---|---|---|
| X | unity provider 数据加厚（多线程 markers / aggregatedCallTrees / GC 业务归因 ...）| ✅ 已完成 |
| A | unity diff（hybrid 三层：Provider 骨架 + 确定性 enrich + AI 加厚可选）| ✅ 已完成（2026-06-30）|
| B | cross-source 接 AI-authored | 🟡 代码已完成，正式产出待验收（见上表） |
| C | 三源 diff（提炼层）| ⏳ 待开 |
| D | simpleperf 单源（SKILL + service 接线；**非** hybrid 四件套）| ✅ 能跑 |
| **E** | **perfetto-diff-analysis（v6 N 列通用：单次 N=1 / 双份 N=2 / triad N=3 / 任意 N≥2 同源代码）+ 骨架填空模式** | **✅ 已完成（2026-06-30）** |
| 待定 | unity provider 加 rendering/memory stat 字段（依赖项目侧 ProfilerRecorder 改造）| 🟡 暂缓 |

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
unity         ✅ 能跑 / ❌ 非 hybrid   ✅ hybrid 三层
perfetto      ✅ v6 单次 hybrid        ✅ v6 N 列 hybrid
simpleperf    ✅ 能跑 / ❌ 非 hybrid   ✅ v4 hybrid
三源          🟡 cross 能跑 / 待验收   ❌ Phase C 待做

待补强（按优先级）：
1. 三源 diff 提炼层（Phase C）—— 矩阵最后一格 + 终极对比入口
2. 三源单次 cross — AI 路径验收 + 架构升级（v6 填空模式）
3. simpleperf / unity 单次 — 接入 Provider 骨架 + 自评门 + L1 兜底
4. unity provider 加 rendering/memory stat 字段（依赖项目侧 ProfilerRecorder 改造，暂缓）
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
| 数据产物 | `unity-diff-summary.json` (~10MB Δ 数据) + `performance-report_unity_diff_skeleton.md` (含 `_待 AI 填充_` 占位) + `performance-report_unity_diff_enriched.md` (确定性叙事填充) + `performance-report_unity_diff_AI_v1.md` (AI 加厚, 可选) |
| 关键字段 | `frameSummary Δ` (mean/median/p90/p95/p99/p999/fps/jank) / `callTreesDiff` (8 线程路径对位 ms/帧 Δ) / `markersByThreadDiff` (per-thread Top markers Δ) / `gcAttribution` (业务子树 alloc Δ，过滤泛阶段) / `spikes` (新增/解决 spike) / `presence` (新增/消失 marker) |
| Skill | `.claude/skills/unity-profiler-compare/SKILL.md`（参照 simpleperf-diff hybrid v4 模式） |
| 流水线（**真 hybrid 三层**）| 1. **Provider** (unity-diff-builder) skeleton + summary<br>2. **Enrich** (unity-diff-enrich.ts) §3 Top-N 要点 / §4 per-thread / §5 GC 要点 + §8 模板 — **必须成功**<br>3. **AI 加厚（正式验收）**：CodeBuddy 在 enriched 上加厚 → `validateUnityDiffQuality` PASS；失败 **抛错** |
| AI 调度 | `runAiEnrichment()` 读 enriched + summary；禁止改数字/表/树 |
| 质量门 | 必备 §0–§8 / ms/帧 + Δ% + emoji / §2 mean Δ 一致 / 无 ENRICH_FILL / 行数 ≥ 金标准 78% — **PASS = ai-authored** |
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

参照 unity / perfetto 单源 skill 模板：

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
| Web service 入口 | `web/server/services/run-analysis-service.ts` (单源)、`perfetto-triad-service.ts` (三态)、`perfetto-diff-service.ts` (v6 N 列)、`simpleperf-diff-service.ts` (双态)、`cross-source-analysis-service.ts` (三源单次) |
| CLI executor | `web/server/services/cli-executor.ts`（统一 spawn AI CLI 的入口）|
| 共享 prompt 模板 | `.claude/skills/perfetto-trace-analysis/prompts/single-prompt.txt`（单次专用）<br>`.claude/skills/perfetto-trace-analysis/prompts/triad-prompt.txt`（老 triad 流程）<br>`.claude/skills/perfetto-diff-analysis/prompts/diff-prompt.txt`（v6 N≥2 通用 diff）|
| Digest 算法 | `web/server/services/cross-source-digest.ts`（三源对位、native 反向、能力矩阵 ...）|
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
