# TODO-WT-044 · 跑 VG unity profiler 数据产出多态报告（M5 主线验收）

> 状态：TODO ｜ 里程碑：M5 多源扩展（unity 多态接入主线验收）｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：WT-038/039/040/041/042/043 全部完成 ✅
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§七三段管线 + §八占位符填充）+ `docs/prism/memory/methodology/multi-state.md`（DR-43 扩展后）+ CODEBUDDY.md（严禁硬编码 + 三段管线硬契约）

## 背景

M5 阶段目标：用 VG 的 unity profiler 数据（baseline vs current）跑出高质量多态报告，验证 DR-43 扩展后的 2 态多态方法论 + WT-038~043 全部前置工作。

**这是 M5 主线验收工单**——前置 6 张工单（038 数据源无关化 / 039 红线归并新规则 / 040 dataSource 字段 / 041 DR-43 扩展 / 042 unity-multi-state 模板 / 043 unity-explore 多态引导）都是为了这一刻。本工单跑通 = M5 阶段目标达成。

**VG 数据现状**：
- 数据位置：`web/data/results/udiff_*/base/` + `cur/`（每个含 preprocess-result.json + preprocess-summary.json）
- 推荐样本：`udiff_1782983710451_be175ef1`（outside-baseline vs outside-stressmove，599 vs 600 帧，主线程 16.66→44.59ms +167.6% 回归）
- 标杆报告（旧作文机 v1 产）：`web/data/results/udiff_1782983710451_be175ef1/performance-report_unity_diff_AI_v1.md`

**关键技术缺口**（本工单要解决的）：

**先理解 perfetto multi 的机制**（已跑通，unity multi 要参考）：
- runId = triad 根目录名（`bk26b-perfetto-triad`），不是单个样本
- tools 层有 `role` 参数（base/cur/throttle），LLM 调用工具时传 role
- tools 层根据 role 拼路径 `PERFETTO_TRIAD_ROOT/base` / `/cur` / `/throttle`，读 JSON 文件
- **explore-service 不需要知道多态**——它只传 runId，LLM 通过工具的 role 参数自己访问不同样本

**unity 的机制差异**（当前）：
- runId = 单个样本（如 `unity-outside-stressmove`）
- tools 层（queryMarkers/scanMetricOverFrames/getFrameCallTree/aggregateSubtree）没有 `role` 参数，用 runId 从 sqlite 查（`WHERE run_id = ?`）
- 一个 runId 对应一个样本的数据（pdata 灌库后每帧每 marker 带 run_id）
- **多态需要两个 runId**（base runId + cur runId）

**unity multi 真正要做的**（参考 perfetto multi 机制）：

1. **核心缺口：unity tools 层不支持多态样本对比**。有两种方案：
   - **方案 A（sqlite 路线）**：把 VG 的 base/cur 两个 pdata 灌进 sqlite（用不同 runId 如 `vg-baseline` / `vg-stressmove`），unity tools 加 `role` 或 `compareRunIds` 参数，工具内部算 foldChange 返回对比结果
   - **方案 B（JSON 路线，像 perfetto）**：新建 unity multi tools，从 udiff 目录的 base/cur/preprocess-result.json 读数据（已有 markers 数组含 msSelfMean/msTotalMean/percentOfFrame），算 foldChange 返回。**不需要灌库**，直接读 JSON
   - **推荐方案 B**：VG 的 udiff 数据只有 preprocess-result.json 没有 pdata，JSON 路线不需要先灌库，且和 perfetto multi 机制一致（tools 层 role 参数 + 读 JSON）

2. **explore-service 不需要改**：它只传 runId，多态是 tools 层 + LLM 层的事。perfetto multi 就是这么跑的
3. **可选：新建 run-unity-pipeline.ts 串联三段**：三段各自有 CLI 入口，不建串联脚本也能跑

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §七三段管线 + §八占位符填充纪律
- `docs/prism/memory/methodology/multi-state.md` — DR-43 扩展后（2 态判定 + 叙事 + 措辞）
- `docs/prism/process/worktickets/TODO-WT-042-*.md` — unity-multi-state.txt 模板（WT-042 完成）
- `docs/prism/process/worktickets/TODO-WT-043-*.md` — unity-explore-prompt 多态引导 + detectStateMode 路由（WT-043 完成）
- `web/server/prism/run-perfetto-pipeline.ts` — 参考 perfetto pipeline 串联结构
- `web/data/results/udiff_1782983710451_be175ef1/performance-report_unity_diff_AI_v1.md` — 标杆 diff 报告（旧作文机 v1 产，参考结构不照抄叙事）

## 任务

### 需求 A：unity tools 层加多态样本对比支持（核心缺口）

**文件**：`web/server/prism/tools.ts`

参考 perfetto multi 的机制（tools 层 `role` 参数 + 读 JSON），给 unity tools 加多态对比能力。**推荐方案 B（JSON 路线）**：

新建 unity multi tools（或扩展现有 unity tools 加 `role`/`compareRunIds` 参数），从 udiff 目录的 base/cur/preprocess-result.json 读数据：
- 读 base 的 markers / callTrees / frameSummary
- 读 cur 的 markers / callTrees / frameSummary
- 算 foldChange（cur vs base 的 totalMs/perFrameMs 比值）
- 算绝对增量（cur - base 的 totalMs/perFrameMs 差值）
- 返回对比结果（涨幅 top N + 绝对增量 top N）

**参考 perfetto tools 的实现**（tools.ts:2330-2400）：
- `PerfettoSampleRole` 类型（base/cur/throttle/single）
- `resolvePerfettoRunDir` 根据 role 拼路径
- `loadPerfettoRun` 读 JSON 文件

unity multi tools 类似：
- `UnitySampleRole` 类型（base/cur/single）
- `resolveUnityRunDir` 根据 role + udiff 目录拼路径
- `loadUnityRun` 读 preprocess-result.json
- 新增 `queryMarkersMultiState` / `aggregateSubtreeMultiState` 等对比工具，或扩展现有工具加 `compareRole` 参数

**关键**：不硬编码业务名，foldChange 和绝对增量是通用计算，对所有 marker 适用。

### 需求 B：explore-prompt 引导 LLM 用多态工具

**文件**：`web/server/prism/prompts/unity-explore-prompt.txt`（WT-043 已加多态引导）

WT-043 已经加了"多态模式·先建基线和当前两张全景地图"引导，但引导里提到"对基线和当前样本分别跑 queryMarkers"——需要确认引导和需求 A 的工具实现匹配。如果需求 A 加了新的多态工具（如 `queryMarkersMultiState`），要在 prompt 里说明用法。

**注意**：WT-043 的引导可能需要微调，匹配需求 A 的工具实现方式。

### 需求 C：新建 run-unity-pipeline.ts 串联三段（可选，也可三段分别跑）

**文件**：`web/server/prism/run-unity-pipeline.ts`（新建，参考 `run-perfetto-pipeline.ts` 结构）

**注意**：unity 三段各自有 CLI 入口，不建串联脚本也能跑（三段分别跑）。串联脚本只是方便。如果时间紧，优先做需求 A/B/D，需求 C 可选。

串联三段：
1. explore LLM（explore.cli.ts --source unity --run-id <udiff_id>）→ findings.json + verdict.json
2. narrative LLM（narrative-service.ts --source unity --run-id <udiff_id>）→ narrative.json（WT-043 的 detectStateMode 会选 unity-multi-state.txt 模板）
3. render 纯代码（render-report.ts --dir <output>）→ report.html

**CLI 参数**（如建串联脚本）：
```
npx tsx web/server/prism/run-unity-pipeline.ts --multi-state-dir <udiff_dir> [--out <dir>] [--skip-explore]
```

**如不建串联脚本，三段分别跑**：
```
# 1. explore（需求 A 加好多态工具后）
npx tsx web/server/prism/explore.cli.ts --source unity --run-id udiff_1782983710451_be175ef1 --out data/prism-out/udiff_1782983710451_be175ef1/<timestamp>

# 2. narrative
npx tsx web/server/prism/narrative-service.ts --source unity --run-id udiff_1782983710451_be175ef1 --out data/prism-out/udiff_1782983710451_be175ef1/<timestamp>

# 3. render
npx tsx web/server/prism/render-report.ts --dir data/prism-out/udiff_1782983710451_be175ef1/<timestamp>
```

### 需求 D：跑 VG 数据产出多态报告

用推荐样本 `udiff_1782983710451_be175ef1` 跑完整三段管线，产出 report.html。

**输出目录**：`web/data/prism-out/udiff_1782983710451_be175ef1/<timestamp>/`

**不覆盖原报告产出物**（feedback memory）：如果输出目录已有 report.html/narrative.json，换路径或备份，不许覆盖。

## 硬约束

1. **三段管线硬契约**（DR-44 + dev-conventions.md §七）：
   - explore LLM → findings.json（含 conclusion/reasoning/recommendation）
   - narrative LLM → narrative.json（含 overview/topConclusions/sections，无审计字段）
   - render 纯代码 → report.html
   - **不允许脚本拼 narrative.json 或用 if-else 套模板写人话**
2. **严禁硬编码**（DR-41 + dev-conventions.md §六）：
   - 不硬编码业务名（LuaMgr/行军线/MapSignificance 等）
   - 不硬编码绝对阈值（用 foldChange + 相对占比）
   - 不硬编码叙事模板（由 LLM 根据 findings 推理生成）
3. **不覆盖原报告产出物**：重跑管线时新 report.html/narrative.json 不许覆盖原产出物，换路径或备份
4. **detectStateMode 要生效**：WT-043 加的 detectStateMode 应该检测到 base/cur 子目录 → 选 unity-multi-state.txt 模板（不是 unity-single-state.txt）
5. **dataSource 筛选要生效**：WT-040 加的 dataSource 字段应该让 unity explore 注入 unity + cross-source 的 memory（不含 perfetto 特定条目）

## 验收 harness（必填，开发 agent 完成前自己跑通，不丢给主 agent）

**通用 harness**（跑新产出的 unity 多态报告）：
```
cd web && npx tsx server/prism/harness.ts --source unity --dir <新产出目录>
```
期望：全 PASS（WT-037 的内容厚度断言可能需要调整阈值——unity 多态报告和 perfetto 多态报告的章节结构不同，unity 没有降频章节。如果 A3 降频矩阵断言对 unity 不适用，加 source 判断跳过或调整阈值）

**工单特定断言**：
```bash
# 1. run-unity-pipeline.ts 存在
ls web/server/prism/run-unity-pipeline.ts
# 期望文件存在

# 2. explore-service 支持多态样本
grep -c "sampleRunIds\|multiStateDir\|多态" web/server/prism/explore-service.ts
# 期望 ≥1

# 3. report.html 产出
ls <新产出目录>/report.html
# 期望文件存在

# 4. narrative.json 产出且 generatedBy=LLM
grep -c "generatedBy.*LLM" <新产出目录>/narrative.json
# 期望 ≥1

# 5. narrative.json 无审计字段（evidenceIds 不在顶层）
grep -c "evidenceIds" <新产出目录>/narrative.json
# 期望 0 或只在 item 级别

# 6. report.html 含多态章节（§0-§4）
grep -c "§0\|§1\|§2\|§3\|§4" <新产出目录>/report.html
# 期望 ≥5

# 7. report.html 无业务名硬编码（narrative LLM 产出，不应有 AOE 专属业务名除非数据里真有）
# 注：VG 数据是 AOE 游戏的，报告里会出现 LuaMgr/行军线等是合理的（来自数据），不是硬编码
# 此条不断言，由主 agent 验收时人眼检查

# 8. detectStateMode 选了 unity-multi-state.txt（不是 single-state）
# 检查 narrative.json 的 narrativeProvenance 或日志
grep -c "unity-multi-state\|multi-state" <新产出目录>/narrative.json
# 期望 ≥1（如果 narrativeProvenance 记录了模板路径）
```

**端到端冒烟**（跑完整三段管线）：
```
cd web && npx tsx server/prism/run-unity-pipeline.ts --multi-state-dir data/results/udiff_1782983710451_be175ef1 --out data/prism-out/udiff_1782983710451_be175ef1/<timestamp>
```
跑通后把 report.html 路径 + narrative.json 路径告诉主 agent，主 agent 对照标杆 diff 报告核结构 + 叙事可读性。

## 完成标准

1. 通用 harness FAIL=0（unity 多态报告通过，WT-037 断言可能需调整）
2. 工单特定断言全 PASS
3. 端到端冒烟成功，report.html + narrative.json 产出
4. **narrative.json 的 generatedBy=LLM**（不是脚本拼的）
5. **report.html 含 §0-§4 多态章节骨架**
6. 把 report.html 路径 + narrative.json 路径 + 改动清单告诉主 agent

harness 跑不通就继续改，改到全 PASS 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做（不只信开发 agent 报告的 PASS）：

1. 独立跑一遍通用 harness + 工单特定断言
2. 打开 report.html 看结构（harness 验不了"叙事可读性"，要人看）
3. **对照标杆 diff 报告逐项核**（`udiff_1782983710451_be175ef1/performance-report_unity_diff_AI_v1.md`）：
   - §0 三大演化结论（最大涨幅/新出现瓶颈/退化形态）是否都有
   - §1 采集元信息（基线/当前对照表）是否完整
   - §2 多线程宏观（UnityMain/UnityGfxRenderS run/sleep 对照）是否覆盖
   - §3 主线程 callTree + 红线清单 + 每个红线条目下钻
   - §4 ROI 优化方向（按 foldChange × 占 p50% 排序）
4. 确认三段管线完整性：
   - findings.json 是 explore LLM 产的（conclusion 是人话不是 log 风）
   - narrative.json 是 narrative LLM 产的（generatedBy=LLM，无审计字段）
   - report.html 是 render 纯代码产的（无套话，无数据源特定判定逻辑）
5. 确认 detectStateMode 选了 unity-multi-state.txt（不是 single-state）
6. 确认 dataSource 筛选生效（unity explore 注入的是 unity + cross-source memory，不含 perfetto 特定条目）
7. 任一不通过 = 打回，不在错误基座上继续堆功能

## 注意事项

- **本工单是 M5 主线验收**：前置 6 张工单都是为了这一刻。跑通 = M5 阶段目标达成
- **VG 数据是 AOE 游戏的**：报告里会出现 LuaMgr/行军线/MapSignificance 等业务名是合理的（来自数据，不是硬编码）。验收时不要把这些当硬编码打回
- **WT-037 断言可能需调整**：unity 多态报告和 perfetto 多态报告章节结构不同（unity 没有降频章节）。如果 A3 降频矩阵断言对 unity 不适用，加 source 判断跳过或调整阈值
- **不覆盖原报告产出物**：重跑管线时新 report.html/narrative.json 不许覆盖原产出物，换路径或备份
- **explore 阶段耗时较长**（10-20min）：开发 agent 完成前跑端到端冒烟时注意超时，可用 `--skip-explore` 复用 findings.json 反复调 narrative/render
- **如果 explore-service 改动较大**：建议先做需求 A（扩展多态样本支持）+ 需求 C（pipeline 脚本），用 `--skip-explore` 跑通 narrative + render，再回头做需求 B（provider 层多态数据加载）+ 需求 D（完整三段）

## 开工顺序建议

1. **第一步**：需求 A（explore-service 扩展多态样本）+ 需求 C（run-unity-pipeline.ts 新建）
2. **第二步**：用 `--skip-explore` 跑通 narrative + render（确认 detectStateMode 选 unity-multi-state.txt + 模板注入生效）
3. **第三步**：需求 B（provider 层多态数据加载）+ 需求 D（完整三段跑 VG 数据）
4. **第四步**：通用 harness + 工单特定断言全 PASS

如果第二步发现 narrative LLM 拿到的 prompt 不完整（模板没注入或 dataSource 筛选没生效），停下来诊断，不要在错误基座上继续堆功能（DR-45 教训）。
