# 工单 WT-010 · BK-26 三源同构试点验证：simpleperf + Perfetto/ptrace 真实数据最小闭环

> 状态：DONE（主 agent 验收 PASS）｜里程碑：M5 多源扩展前置风险验证 / 引擎层完整度｜执行方：Cursor/agent
> 依据：用户 2026-07-13 关注“三源其它两源数据能否按照当前 agent 设计跑出高于作文机的报告”，并提供 simpleperf 与 Perfetto/ptrace 真实数据路径。

## 背景（为什么做）

Unity `pdata` 侧的 Prism agent 流程已经能跑出结构化探索、叙事报告、记忆沉淀。但北极星不是单 Unity 工具，而是三源性能分析师：Unity / simpleperf / perfetto 能共用同一套 agent 设计，接新源靠 adapter 而不是重写整套分析。

本工单做 **BK-26 最小同构试点**：用户已提供 simpleperf 真实 `perf.data`，且 Perfetto/ptrace 数据在外部目录。试点维度修正为：**simpleperf 先跑真实 base/stressmove 双样本验证 diff/单源链路；Perfetto/ptrace 先盘点真实目录并尝试最小 provider/skeleton 链路**。这样能同时回答其它两源是否能接入当前 agent 设计。

本单目标不是做完整 M5，而是回答两个问题：
1. simpleperf 能否基于真实 `perf_aoeyz_base.data` / `perf_aoeyz_stressmove.data` 跑通“源数据 → 统一模型/查询语义 → 报告产物 → 质量验收”？
2. Perfetto/ptrace 真实目录下是否具备可接入样本，能否走现有 provider/skeleton/report 链路？如果不能，缺口在哪里。

## 目标（做完什么样，可观测）

1. 用用户提供的 simpleperf 真实数据跑通最小链路，至少验证 base/stressmove 两份输入能否解析并产出 profile/report/diff 类产物。
2. 盘点并尝试使用用户提供的 Perfetto/ptrace 数据目录，确认是否有 `.pftrace` 或等价 trace 可被现有 provider 接入。
3. 验证 simpleperf / Perfetto 数据是否能进入统一 `PerfProfileCore` / `detail.<source>` / `CallTree` 契约。
4. 对照 Unity Prism 流程，列出可复用部分与不可复用缺口。
5. 输出一份 BK-26 试点报告：simpleperf 与 Perfetto/ptrace 哪个已可继续推进，下一步需要补什么 adapter/query/tool。

## 改哪些文件（精确）

本单是试点验证工单，默认**不改产品代码**。

允许改：
- `docs/prism/process/worktickets/TODO-WT-010-bk26-perfetto-isomorphism-spike.md`：在本文末尾回填“完工报告”。
- 如必须保存临时验证结果，只允许写到 `web/data/prism-out/bk26-isomorphism-spike/` 或已有 `web/data/results/<runId>/` 产物目录。

只读参考：
- `web/shared/perf-model.ts`
- `web/server/services/run-ingest-service.ts`
- `web/server/services/perfetto-single-service.ts`
- `web/server/services/simpleperf-single-service.ts`
- `web/server/routes/run-ingest.ts`
- `web/server/services/ingest-detect.ts`
- `scripts/perfetto_provider.py`
- `scripts/build_perfetto_profile.py`
- `scripts/render_perfetto_skeleton.py`
- `simpleperf/build_simpleperf_profile.py`
- `simpleperf/simpleperf_analyzer/perf_provider.py`
- 用户提供 simpleperf 数据：`D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_base.data`
- 用户提供 simpleperf 数据：`D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_stressmove.data`
- 用户提供 Perfetto/ptrace 数据目录：`G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts`
- 仓库内备用 Perfetto 样例：`output/perfetto/*.pftrace`
- `docs/report/performance-report_perfetto_SINGLE_GOLDEN_v1.md`
- `docs/report/_intermediate/**` 中已有 perfetto/simpleperf 中间产物

禁止改：
- Prism Unity `web/server/prism/*` 产品代码。
- simpleperf/perfetto provider 代码，除非完工报告证明现有入口有明显 bug 且只做最小修复；默认本单只验证。

## 具体要求

### 1. 盘点 simpleperf + Perfetto/ptrace 现有链路

在完工报告中明确：

**simpleperf：**
- base 路径：`D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_base.data`。
- stressmove 路径：`D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_stressmove.data`。
- provider 入口：`simpleperf/build_simpleperf_profile.py` / `simpleperf/simpleperf_analyzer/perf_provider.py`。
- service 入口：`web/server/services/simpleperf-single-service.ts`。
- 是否需要 binary cache / symbols；若需要，记录自动发现结果或缺失原因。
- 产物形态：profile-summary/profile/folded/report/diff 是否存在。
- 是否能进入 `PerfProfileCore`：metrics/frame/system/confidence 是否有值。
- 是否有 `detail.simpleperf.callTrees` 或等价函数树/热点列表。

**Perfetto/ptrace：**
- 真实数据目录：`G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts`。
- 目录下实际可用 trace 文件（如 `.pftrace` / `.perfetto-trace` / `.trace` 等）列表。
- provider 入口：`scripts/build_perfetto_profile.py` / `scripts/perfetto_provider.py`。
- service 入口：`web/server/services/perfetto-single-service.ts`。
- 产物形态：summary/profile/skeleton/report 是否存在。
- 是否能进入 `PerfProfileCore`：metrics/frame/threads/system/confidence 是否有值。
- 是否有 `detail.perfetto.callTrees` 或等价调用树/热点 slices。

### 2. 跑最小链路

优先选择**不依赖真实 CLI LLM**的路径先跑 deterministic provider/skeleton。若 CLI 可用，再尝试 AI 加厚；若 Cursor/CodeBuddy CLI 不可用，不算失败，但要说明。

**simpleperf 最小链路优先级更高**（用户已给真实 base/stressmove 双样本）：

```bash
# 命令按实际脚本参数调整，完工报告必须记录真实命令
python simpleperf/build_simpleperf_profile.py D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_base.data <out-base>
python simpleperf/build_simpleperf_profile.py D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_stressmove.data <out-stressmove>
```

如果已有 diff 入口，尝试 base vs stressmove diff；没有则至少分别产出两个 profile-summary/profile，并说明 diff 缺口。

**Perfetto/ptrace 链路**：先在 `G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts` 找真实 trace；若目录下暂找不到可用 trace，才用仓库内 `output/perfetto/*.pftrace` 作为备用样例。

```bash
python scripts/build_perfetto_profile.py <trace> <out>
python scripts/render_perfetto_skeleton.py --sample single=<summary.json> --out <skeleton.md>
```

如果没有直接 CLI，允许写一次性 Node/Python 调用片段到临时目录执行，但不要提交临时脚本到仓库；把命令和输出记录进完工报告。

### 3. 对照 Unity Prism agent 设计

用表格回答：

| 层 | Unity Prism 现状 | simpleperf 现状 | Perfetto/ptrace 现状 | 是否同构 | 缺口 |
|---|---|---|---|---|---|
| 原始数据 | `.pdata` | `.data` | `.pftrace`/trace目录 | ? | ? |
| ingest/core | prism sqlite / tools | PerfProfileCore? | PerfProfileCore? | ? | ? |
| 查询工具 | queryMarkers/drillDown/... | ? | ? | ? | ? |
| 证据账本 | ledger.json | ? | ? | ? | ? |
| explore agent | explore-prompt + tools.cli | ? | ? | ? | ? |
| narrative/report | narrative.json + report.html | report.md? | skeleton/report.md? | ? | ? |
| memory loop | DataRequest capabilities | ? | ? | ? | ? |

### 4. 判断能否“高于作文机”

不要自夸。按可观察指标判断：

- 是否有确定性骨架，避免 LLM 编数；
- 是否有证据 provenance；
- 是否能输出线程/调度/系统状态；
- 是否能把热点与 frame/线程状态串联；
- 是否有审计/质量门；
- 与现有 golden report 相比缺什么。

结论只能写三种之一：

- `PASS：simpleperf 与 Perfetto/ptrace 至少一个已可作为第二源同构试点继续推进，另一个缺口明确`；
- `PARTIAL：链路能跑，但缺 X/Y/Z，需先补 adapter/query/ledger`；
- `FAIL：现有其它两源链路不足以进入 agent 同构验证，需先补基础解析`。

### 5. 输出下一步工单建议

根据试点结果，给出最多 3 张后续工单候选，例如：

- BK-26a simpleperf 统一查询工具最小集；
- BK-26b Perfetto/ptrace 统一查询工具最小集；
- BK-26c 多源 evidence ledger；
- BK-26d 其它源 narrative/report 接入 Prism 标准 `narrative.json + report.html`；
- BK-9 adapter 抽象正式化。

## 禁止事项

- 不许直接宣布“三源已成”——本单只是其它两源最小试点。
- 不许跑 Unity 40min explore。
- 不许把 Markdown skeleton 当成等价于 Prism 标准报告，需明确差距。
- 不许改大量产品代码来“顺手实现 M5”。
- 不许生成伪造 trace 或伪造报告。

## 验收标准（主 agent 按 DR-36 逐条核）

1. 完工报告列出实际使用的 simpleperf data、Perfetto/ptrace trace、命令、产物路径。
2. simpleperf 至少尝试 base/stressmove 两份真实 `.data`；若失败，必须有真实错误日志和原因。
3. Perfetto/ptrace 至少盘点 `G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts` 并尝试一个可用 trace；若目录无可用 trace，可用仓库 `output/perfetto/*.pftrace` 备用，但要说明。
4. 至少产出一个 provider/skeleton/report/profile 类产物；若失败，必须有真实错误日志和原因。
5. 完成 Unity vs simpleperf vs Perfetto/ptrace 同构对照表。
6. 明确判断 PASS/PARTIAL/FAIL，且理由基于实际产物。
7. 给出不超过 3 个后续工单候选，按优先级排序。
8. 未改产品代码；若改了，需说明原因和 diff，主 agent 单独验收。

## 完工报告（施工方填）

> 施工时间：2026-07-13｜执行方：Cursor agent｜未改产品代码（`web/server/prism/*`、provider 脚本均未动）

### 1. 使用的输入数据

**simpleperf（真实双样本，均跑通）：**
- `D:\Android\android-ndk-r21e-windows-x86_64\simpleperf\perf_aoeyz_base.data`（36,093,180 B，md5 `3726d68fce3552c2da832f5fe47374ce`，samples=36133）
- `D:\Android\android-ndk-r21e-windows-x86_64\simpleperf\perf_aoeyz_stressmove.data`（36,093,180 B，md5 `55d2e4a9a340ec98c4c87b35baee701b`，samples=47228）——同 size 不同内容
- binary_cache：数据旁路目录 `...\simpleperf\binary_cache` **为空**；实际使用仓库根 `K:\AI\PerfAnalysisTool_Codebuddy\binary_cache`（67 文件）。symbolCheck=`WARN`（base appSymbolizedPct=79.9%，cur=71.6%）

**Perfetto/ptrace 目录盘点（`G:\AOEYZ_Trunk\Tools\AndroidPerfettoScripts`）：**

| 相对路径 | 大小 |
|---|---|
| `base_2026-06-22_21-56-7c2693.pftrace` | 31.9 MB ← **本单实际跑通样本** |
| `cur_2026-06-23_10-10-72c91a.pftrace` | 31.9 MB |
| `thermal_2026-06-23_10-24-744cf3.pftrace` | 31.9 MB |
| `thermail_2026-06-23_10-34-ae0ff5.pftrace` | 31.9 MB |
| `sample_06231536\*.pftrace`（5 份） | 215–512 MB |
| `sample_base_20260624_104944\*.pftrace` | 255.8 MB |
| `sample_cur_20260624_105041\*.pftrace` | 255.9 MB |
| `sample_throttle_20260624_105539\*.pftrace` | 219.4 MB |

未使用仓库备用 `output/perfetto/*.pftrace`（真实目录已有可用 `.pftrace`）。本单未跑大样本 triad（base/cur/throttle），仅验证最小 provider/skeleton。

### 2. 真实命令

```powershell
# cwd: K:\AI\PerfAnalysisTool_Codebuddy
python simpleperf/build_simpleperf_profile.py `
  --base "D:\Android\android-ndk-r21e-windows-x86_64\simpleperf\perf_aoeyz_base.data" `
  --perf "D:\Android\android-ndk-r21e-windows-x86_64\simpleperf\perf_aoeyz_stressmove.data" `
  --binary-cache "K:\AI\PerfAnalysisTool_Codebuddy\binary_cache" `
  --out "K:\AI\PerfAnalysisTool_Codebuddy\web\data\prism-out\bk26-isomorphism-spike\simpleperf-diff" `
  --scene-base "野外空场景" --scene-cur "stressmove" --device "MateXs2"
# exit 0；耗时 ~32s；systemPressureDeltaPct=+30.7；symbolCheck=WARN

python scripts/build_perfetto_profile.py `
  --trace "G:\AOEYZ_Trunk\Tools\AndroidPerfettoScripts\base_2026-06-22_21-56-7c2693.pftrace" `
  --out "K:\AI\PerfAnalysisTool_Codebuddy\web\data\prism-out\bk26-isomorphism-spike\perfetto-single"
# exit 0；耗时 ~19s；metricCount=16；parseStatus=partial；throttling=suspected

python scripts/render_perfetto_skeleton.py `
  --sample "single=K:\AI\PerfAnalysisTool_Codebuddy\web\data\prism-out\bk26-isomorphism-spike\perfetto-single\perfetto-profile-summary.json" `
  --out "K:\AI\PerfAnalysisTool_Codebuddy\web\data\prism-out\bk26-isomorphism-spike\perfetto-single\perfetto-skeleton.md"
# exit 0；461 行骨架，含 LLM_FILL 占位符
```

未跑 CLI LLM 加厚（本单优先 deterministic）；`simpleperf-single-service` / `perfetto-single-service` 的质量门路径存在但未走 web service。

### 3. 产物路径

根目录：`web/data/prism-out/bk26-isomorphism-spike/`

**simpleperf：**
- `simpleperf-diff/base/simpleperf-profile.json` + `simpleperf-profile-summary.json` + `simpleperf-folded.txt`
- `simpleperf-diff/cur/simpleperf-profile.json` + `simpleperf-profile-summary.json` + `simpleperf-folded.txt`
- `simpleperf-diff/diff/simpleperf-diff.json`
- `simpleperf-diff/report/performance-report_simpleperf_v4.md`（430 行，5 处 LLM_FILL）
- `simpleperf-diff/performance-report.md`（同内容副本）
- `simpleperf-diff/run.log`

**Perfetto：**
- `perfetto-single/perfetto-profile.json` + `perfetto-profile-summary.json`
- `perfetto-single/perfetto-skeleton.md`（461 行）
- `perfetto-single/run.log` + `skeleton-run.log`

### 4. simpleperf 是否跑通

**是（PASS）。** base+stressmove diff 全链路成功进入统一模型：

| 检查项 | 结果 |
|---|---|
| 解析 / profile | ✅ raw/core/detail/meta 齐全 |
| PerfProfileCore | ✅ schemaVersion + metrics（base 55 / cur 51）；⚠️ `core.frame=[]`、`core.threads=[]`、`core.system={}`（帧/线程/系统压在 `detail.simpleperf`） |
| `detail.simpleperf.callTrees` | ✅ 各 8 棵（含 UnityMain 等） |
| folded / summary / report / diff | ✅ 全有；diff systemPressure=+30.7%，probes=15，businessModules=28 |
| 符号化 | ⚠️ WARN（旁路 binary_cache 空；用仓库 cache 仍 <85%） |
| stackUnwind selfcheck | ⚠️ SKIP（缺 `samples.selfcheck.tmp`，非阻断） |

入口对照：`simpleperf/build_simpleperf_profile.py` → `perf_provider.py`；web 封装 `simpleperf-single-service.ts` / `run-ingest-service.buildSimpleperfProfile` 存在但本单未调。

### 5. Perfetto/ptrace 是否跑通

**是（PASS，parseStatus=partial）。** 真实目录有可用 `.pftrace`，最小 provider + skeleton 成功：

| 检查项 | 结果 |
|---|---|
| 目录可用性 | ✅ 12 份 `.pftrace`（含 base/cur/thermal 与大样本 triad） |
| PerfProfileCore | ✅ metrics=16；frame(choreographer) p50=16.6ms fps=68.3；threads=4；system 有 cpuFreq/binder/pss/cpuThrottled |
| `detail.perfetto.callTrees` | ✅ 1 棵 UnityMain（PlayerLoop 97.5% + FinishFrameRendering 0.72%） |
| threadsSched / throttling | ✅ 4 线程调度态；throttling=suspected |
| skeleton | ✅ `perfetto-skeleton.md` |
| parseStatus=partial 原因（真实 parseNotes） | ① 无 CombinedProfile 色块→全 trace 窗；② meta 无 pid→自动选 UnityMain 所属 pid=29348；③ 无 GPU counter；④ 无 FrameTimeline |

入口对照：`scripts/build_perfetto_profile.py` / `perfetto_provider.py` / `render_perfetto_skeleton.py`；web 封装 `perfetto-single-service.ts` 存在但本单未调。

### 6. Unity vs simpleperf vs Perfetto/ptrace 同构对照表

| 层 | Unity Prism 现状 | simpleperf 现状 | Perfetto/ptrace 现状 | 是否同构 | 缺口 |
|---|---|---|---|---|---|
| 原始数据 | `.pdata` | `.data` ✅ 真实双样本 | `.pftrace` ✅ 目录 12 份 | 数据形态不同、均可达 | 旁路 binary_cache 空；小 pftrace 缺 CombinedProfile/FrameTimeline |
| ingest/core | prism sqlite + PerfProfile | PerfProfile ✅（metrics 有；frame/threads/system 空壳） | PerfProfile ✅（metrics/frame/threads/system 充实） | **半同构** | simpleperf 需把 detail 线程/系统回填 core；统一 ingest 到 prism 查询库未接 |
| 查询工具 | queryMarkers / drillDown / getFrameCallTree / … + tools.cli | 无 Prism 工具面；靠 profile JSON / diff JSON 静态读 | 无 Prism 工具面；靠 summary/skeleton 静态读 | ❌ | 缺源适配 query 语义（BK-26a/b） |
| 证据账本 | ledger.json + verifiedEvidence | 无 | 无 | ❌ | 缺多源 evidence ledger |
| explore agent | explore-prompt + tools.cli | 无（仅 hybrid provider→可选 CLI 润色） | 无（仅 skeleton→可选 LLM_FILL） | ❌ | 未挂 Prism explore；现有是作文机式填空，非工具探索 |
| narrative/report | narrative.json + report.html | deterministic `performance-report_simpleperf_v4.md`（含 LLM_FILL） | deterministic `perfetto-skeleton.md`（含 LLM_FILL） | **骨架同构、交付物不同构** | Markdown≠Prism 标准 narrative/html；无审计页 |
| memory loop | DataRequest → capabilities | 无 | 无 | ❌ | 其它源未进记忆回路 |

### 7. 「高于作文机」可观察判断

| 指标 | simpleperf | Perfetto |
|---|---|---|
| 确定性骨架（防编数） | ✅ Provider 渲染数字/表 | ✅ skeleton 渲染数字/表 |
| 证据 provenance | ⚠️ JSON 字段可追溯，无 ledger 校验环 | 同左 |
| 线程/调度/系统状态 | ⚠️ detail/diff 有线程与 probes；core.system 空 | ✅ sched 三态 + cpufreq + throttling |
| 热点与 frame/线程串联 | ⚠️ callTrees + playerLoopStages；无 per-frame 轴 | ⚠️ callTrees + choreographer frame；无 FrameTimeline |
| 审计/质量门 | 服务层有 compare_v4_single；本单未跑 | 服务层有质量门；本单未跑 |
| vs golden / Prism 标准报告 | 接近 ULTIMATE md 骨架，≠ narrative.html | 接近 SINGLE_GOLDEN 骨架，≠ narrative.html |

结论：两源 **数据层已够格做第二源同构试点**；**agent 层（query/ledger/explore/narrative/memory）尚未同构**，不能宣称“按当前 Prism agent 设计已跑出高于作文机的完整报告”。

### 8. 总判定

**PASS：simpleperf 与 Perfetto/ptrace 至少一个已可作为第二源同构试点继续推进，另一个缺口明确**

理由（基于产物，非自报）：
1. simpleperf 真实 base/stressmove → profile/summary/folded/diff/report 全绿；
2. Perfetto 真实目录 `.pftrace` → profile/summary/skeleton 全绿（partial 缺口已写清）；
3. 两者均进入 `PerfProfile` + `detail.<source>.callTrees` 契约；
4. 相对 Unity Prism，缺口集中在 query 工具面 / ledger / explore / narrative.html / memory——正好是后续 BK-26a/b/d 范围，不必先重写解析层。

### 9. 后续工单建议（≤3，按优先级）

1. **BK-26a · simpleperf 统一查询工具最小集** — 优先第二源：把已有 callTrees/hotspots/threads/probes 暴露为可 provenance 的 query 工具（对标 queryMarkers/getFrameCallTree 子集），为 explore 复用铺路；顺带把 `core.frame/threads/system` 回填或明确 adapter 映射。
2. **BK-26b · Perfetto 统一查询工具最小集** — 暴露 threadsSched / callTrees / frame / throttling 查询语义；可选补大样本 triad（`sample_base/cur/throttle`）与 CombinedProfile/meta.json 采集约定，消掉 parseStatus=partial。
3. **BK-26d · 其它源 narrative/report 接入 Prism 标准** — 在 a/b 有工具证据后，把 md skeleton 升级为 `narrative.json + report.html`，并接多源 evidence ledger（BK-26c 可并入或紧随）。

### 10. 产品代码改动

无。仅写本工单完工报告 + 产物目录 `web/data/prism-out/bk26-isomorphism-spike/`。

## 验收结论（主 agent 填）

**验收结论：PASS（按 WT-010 范围通过，agent 层不同构缺口已明确，不等于三源完整完成）。**

DR-36 核验摘要：

1. **输入数据真实存在并符合用户路径**：已用工具核到 `D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_base.data`、`perf_aoeyz_stressmove.data`，以及 `G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts` 下 12 份 `.pftrace`。
2. **simpleperf 双样本链路通过**：`simpleperf-diff/diff/simpleperf-diff.json` 证实 base samples=36133、cur samples=47228、`systemPressure.totalSamplesDeltaPct=30.7`；base/cur profile 各有 `detail.simpleperf.callTrees` 8 棵，报告产物存在。
3. **Perfetto/ptrace 最小链路通过但 partial**：`perfetto-profile.json` 证实进入 `core.metrics/frame/threads/system` 与 `detail.perfetto.callTrees`；`perfetto-profile-summary.json` 证实 `parseStatus=partial`，原因是无 CombinedProfile、无显式 pid、无 GPU counter、无 FrameTimeline。
4. **日志与产物互相印证**：`run.log` / `skeleton-run.log` 显示 simpleperf、Perfetto provider、Perfetto skeleton 均写出目标产物；simpleperf `symbolCheck=WARN` 属符号覆盖不足，不阻断本验证目标。
5. **交付物边界清楚**：当前其它两源产物仍是 deterministic markdown/skeleton，含 `LLM_FILL` 占位；不是 Prism 标准 `narrative.json + report.html`，施工方没有把 skeleton 误宣称为标准报告。
6. **产品代码改动声明的验收口径**：本工单产物集中在 `web/data/prism-out/bk26-isomorphism-spike/` 与本工单文件。当前工作区存在其它历史/并行产品改动（例如 Prism renderer、前端、服务等），本次验收不将这些噪声归因于 WT-010；WT-010 范围内未发现需要修改产品代码才能通过的证据。

结论：WT-010 作为 BK-26 前置风险验证已达成。下一步不应直接宣称“三源已成”，而应拆后续工单：BK-26a simpleperf 统一查询工具最小集、BK-26b Perfetto/ptrace 统一查询工具最小集、BK-26d 其它源接入 Prism 标准 narrative/report。
