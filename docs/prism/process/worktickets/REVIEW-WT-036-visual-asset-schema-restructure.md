# TODO-WT-036 · 视觉资产 schema 重构：从顶层字段移到 section item（去 perfetto 特有字段污染通用 schema）

> 状态：TODO ｜ 里程碑：M5 Perfetto agent 化 ｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：WT-030~035 已完成（render markdown 表格 / 多线程覆盖 / topConclusions 挂 callTree / 红线标注 / 红队回路 / harness 软警告）。
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§三对照标杆 + §六严禁硬编码）+ `CODEBUDDY.md`（三段管线硬契约）+ `docs/prism/memory/rationale.md` DR-45（视觉资产字段缺口）。

## 背景

WT-030~035 完成后，报告内容厚度对标 v5.3，但用户 review v4（`2026-07-16_wt030-035-v4`）后发现两个架构问题：

### 问题 1：通用 NarrativeReport schema 被 perfetto 特有字段污染

当前 `narrative-types.ts` 的 `NarrativeReport` 顶层有这些视觉资产字段：
- `metaInfo`（§1 采集元信息）—— perfetto 多态报告概念
- `threadOverview`（§2 多线程宏观）—— perfetto 多态报告概念
- `throttlingMatrix`（§4 降频判定矩阵）—— perfetto 特有（unity/simpleperf 没有降频概念）
- `redlineMatrix`（§5 红线触发清单）—— perfetto 特有（unity 有红线但结构不同）
- `asciiArt`（§0/§3/§4 ASCII 图）—— 通用，但当前实现是 perfetto 模板驱动

**问题**：下次跑 unity/simpleperf 时，这些字段大部分是空的（unity 报告没有"降频矩阵"/"红线清单"概念）。通用 schema 不该有数据源特定字段——违反 DR-41 数据源无关原则。

### 问题 2：render-html 的 visualAssetKey 兜底逻辑仍有硬字段名

WT-030~035 v3 改了 render-html 用 `section.visualAssetKey` 显式关联视觉资产（LLM 声明，不是 heading 模糊匹配）。但兜底逻辑里还有：
```ts
const metaInfoMatched = declaredKeys.has('metaInfo');
const threadOverviewMatched = declaredKeys.has('threadOverview');
const throttlingMatrixMatched = declaredKeys.has('throttlingMatrix');
const redlineMatrixMatched = declaredKeys.has('redlineMatrix');
```
这些 `metaInfo`/`threadOverview`/`throttlingMatrix`/`redlineMatrix` 是 perfetto 特有的字段名，写死在通用 render-html 里 = 作文机硬编码。

### 问题 3：v4 相比 v1 丢失内容 + 渲染超框 + 核心结论与 §0 重复

用户对比 v4（`2026-07-16_wt030-035-v4`）与 v1（`2026-07-16_wt030-035`）发现：
- v4 的 threadOverview 只有 4 行（v1 有 8 行，含 Audio 线程池 5 个子线程 + AsyncWorker）
- v4 的表格超框（渲染宽度溢出）
- v4 的"核心结论"表和"§0 结论先行"内容重复（v1 没有这个问题）
- v4 的"降频判定矩阵"没了（v1 有）

根因：narrative LLM 在 v4 跑时受 prompt 改动影响（visualAssetKey 引导 + §0-§7 八章节要求），重新组织了 sections 结构，但丢了部分内容。这不是 render bug，是 narrative LLM 的写作问题——但暴露了 schema 设计的脆弱性：视觉资产字段和 sections 是两套并行结构，LLM 容易顾此失彼。

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §三对照标杆 + §六严禁硬编码
- `CODEBUDDY.md`（项目根）— 三段管线硬契约 + 数据源无关优先
- `docs/prism/memory/rationale.md` DR-45 §1.3 — 渲染层视觉资产缺口
- `web/server/prism/narrative-types.ts` — 当前 NarrativeReport schema（line 124-156 视觉资产字段）
- `web/server/prism/render-html.ts` — 当前 visualAssetKey 兜底逻辑（line 550-570）
- `web/server/prism/prompts/report-templates/perfetto-multi-state.txt` — perfetto 模板（§0-§7 章节骨架）

## 任务

### 需求 A：NarrativeReport schema 去数据源特定字段

**文件**：`web/server/prism/narrative-types.ts`

`NarrativeReport` 顶层只保留真正通用的字段：
```ts
export interface NarrativeReport {
  runId: string;
  overview: string;
  rating: 'excellent' | 'pass' | 'weak' | 'fail';
  topConclusions: TopConclusionRow[];
  judgmentBoundary?: { canJudge: string[]; cannotJudge: string[] };
  ruledOut?: { name: string; why: string }[];
  sections: NarrativeSection[];
  prioritySummary: { priority: string; action: string; benefit: string }[];
  narrativeProvenance: NarrativeProvenance;
}
```

**删除**顶层 perfetto 特有字段：`metaInfo` / `threadOverview` / `throttlingMatrix` / `redlineMatrix` / `asciiArt`。

**保留** `TopConclusionRow.callTree` / `TopConclusionRow.asciiArt`（这两个是通用的——任何数据源的核心结论都可能挂调用树/ASCII 图）。

### 需求 B：视觉资产移到 NarrativeItem 的结构化内容

**文件**：`web/server/prism/narrative-types.ts`

`NarrativeItem` 扩展一个可选字段 `visualAsset`，支持多种类型（表格/ASCII 图/矩阵），由 LLM 按 `{{REPORT_TEMPLATE}}` 注入的模板填：

```ts
/** 视觉资产（LLM 按 {{REPORT_TEMPLATE}} 模板填，render 按类型渲染） */
export interface VisualAsset {
  /** 资产类型：table（表格）/ ascii（ASCII 图）/ matrix（矩阵） */
  type: 'table' | 'ascii' | 'matrix';
  /** 资产标题（如"采集元信息"/"多线程宏观"/"降频判定矩阵"） */
  title: string;
  /** 表格数据（type=table 或 type=matrix 时填） */
  table?: {
    headers: string[];      // 表头
    rows: string[][];       // 数据行
  };
  /** ASCII 图内容（type=ascii 时填） */
  ascii?: {
    content: string;         // ASCII 图文本
    caption?: string;        // 图下方解读
  };
  /** 矩阵的判定档列（type=matrix 时可选，如 confirmed/likely/suspected） */
  levelColumn?: string;
}

export interface NarrativeItem {
  findingIds: string[];
  title: string;
  narrative: string;
  callTree?: CallTreeRef;
  sourceInsight?: string;
  recommendations: string[];
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** 可选：视觉资产（表格/ASCII 图/矩阵），LLM 按模板填 */
  visualAsset?: VisualAsset;
}
```

**关键**：`VisualAsset` 是通用的（table/ascii/matrix 三种类型），不硬编码 perfetto 特有的"降频"/"红线"概念。perfetto 模板告诉 LLM "§4 填一个 type=matrix 的 visualAsset，标题'降频判定矩阵'"，unity 模板可以告诉 LLM 填别的。

### 需求 C：NarrativeSection 去掉 visualAssetKey

**文件**：`web/server/prism/narrative-types.ts`

`NarrativeSection` 去掉 `visualAssetKey` 字段（WT-030~035 v3 加的，是过渡方案）。视觉资产现在直接在 item 的 `visualAsset` 字段里，不需要 section 级关联。

### 需求 D：render-html 渲染 VisualAsset

**文件**：`web/server/prism/render-html.ts`

1. **去掉**顶层视觉资产字段的独立渲染逻辑（`metaInfoHTML` / `threadOverviewHTML` / `throttlingMatrixHTML` / `redlineMatrixHTML` / `asciiArtHTML` 全删）
2. **去掉** `visualAssetKey` 兜底逻辑（`declaredKeys` / `metaInfoMatched` 等全删）
3. **新增** `renderVisualAsset(asset: VisualAsset): string` 函数，按 type 渲染：
   - `type=table` → `<table>` + headers + rows
   - `type=ascii` → `<pre>` 块
   - `type=matrix` → `<table>` + 按 levelColumn 上色（confirmed/likely/suspected 三档）
4. **在 `renderItemCard` 里**：item 有 `visualAsset` 时，渲染在 narrative 文本下方、callTree 上方

### 需求 E：perfetto-multi-state.txt 模板更新

**文件**：`web/server/prism/prompts/report-templates/perfetto-multi-state.txt`

模板的 §1/§2/§4/§5 章节骨架更新，告诉 LLM 在对应 section 的 item 里填 `visualAsset`：
- §1 采集元信息 → item.visualAsset = {type:"table", title:"采集元信息", table:{headers:["指标","值"], rows:[...]}}
- §2 多线程宏观 → item.visualAsset = {type:"table", title:"多线程宏观", table:{headers:["线程","Run%","Sleep%","Runnable%","关键特征","定位"], rows:[...]}}
- §4 降频时序 → item.visualAsset = {type:"matrix", title:"降频判定矩阵", table:{headers:["信号","判定档","证据"], rows:[...]}, levelColumn:"判定档"}
- §5 红线触发清单 → item.visualAsset = {type:"table", title:"红线触发清单", table:{headers:["模块","单次 avg ms","红线类型","子函数热点"], rows:[...]}}

### 需求 F：narrative-prompt.txt 更新

**文件**：`web/server/prism/prompts/narrative-prompt.txt`

1. 去掉"顶层视觉资产字段必须填"的引导（改为"按模板在 item 里填 visualAsset"）
2. 去掉 `visualAssetKey` 引导
3. 加 `VisualAsset` schema 说明（通用，不提 perfetto 特有概念）
4. 保留"sections 必须建全模板要求的所有章节"引导

### 需求 G：harness 更新

**文件**：`web/server/prism/harness.ts`

1. WT-035 的 4 类软警告里，"视觉资产全空"检查改为检查 `sections[].items[].visualAsset`（不是顶层字段）
2. "多线程覆盖不足"检查改为扫 sections 里 title 含"多线程"的 visualAsset table 行数
3. "topConclusions 无 callTree"检查不变（TopConclusionRow.callTree 保留）
4. "callTree 无红线标注"检查不变

## 硬约束

1. **三段管线硬契约**：render 层只做呈现（渲染 VisualAsset），不写判定逻辑
2. **不硬编码数据源特定字段**：NarrativeReport 顶层不许有 perfetto 特有字段（metaInfo/threadOverview/throttlingMatrix/redlineMatrix/asciiArt）
3. **VisualAsset 是通用的**：type=table/ascii/matrix 三种，不硬编码"降频"/"红线"概念
4. **修完 harness 必须 FAIL=0**
5. **不覆盖原报告**：端到端冒烟用 `--out` 新目录
6. **不丢内容**：v4 丢的 threadOverview 行数（Audio 线程池 5 个子线程）/降频矩阵/核心结论与 §0 不重复——重构后要恢复 v1 的内容厚度

## 验收 harness（必填，开发 agent 完成前自己跑通）

**通用 harness**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/<新目录>
```
期望：FAIL=0，warning=0。

**工单特定断言**：
```bash
# 验 NarrativeReport 顶层无 perfetto 特有字段
grep -c "metaInfo?:" web/server/prism/narrative-types.ts  # 期望 0
grep -c "threadOverview?:" web/server/prism/narrative-types.ts  # 期望 0
grep -c "throttlingMatrix?:" web/server/prism/narrative-types.ts  # 期望 0
grep -c "redlineMatrix?:" web/server/prism/narrative-types.ts  # 期望 0

# 验 NarrativeItem 有 visualAsset 字段
grep -c "visualAsset?: VisualAsset" web/server/prism/narrative-types.ts  # 期望 ≥1

# 验 render-html 有 renderVisualAsset 函数
grep -c "function renderVisualAsset" web/server/prism/render-html.ts  # 期望 ≥1

# 验 render-html 无 visualAssetKey 兜底逻辑
grep -c "declaredKeys" web/server/prism/render-html.ts  # 期望 0
```

**端到端冒烟**（不重跑 explore，复用 WT-031 的 findings）：
```
cd web && npx tsx server/prism/run-perfetto-pipeline.ts --skip-explore --out data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036
```
期望：
- 新 narrative.json 的 sections 有 §0-§7 八章节
- §1/§2/§4/§5 的 item 有 visualAsset 字段
- threadOverview 表格行数 ≥5（含 Audio 线程池，不丢内容）
- 降频判定矩阵存在
- 核心结论表和 §0 不重复
- report.html 表格不超框

## 完成标准

1. 通用 harness FAIL=0，warning=0
2. 工单特定断言全 PASS
3. 端到端冒烟成功，新 report.html 内容厚度 ≥ v1（`2026-07-16_wt030-035`）
4. 不丢内容：threadOverview 行数 ≥5 / 降频矩阵存在 / 核心结论与 §0 不重复
5. 把新 report.html 路径 + 改动清单告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 + warning=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

1. 独立跑一遍通用 harness + 工单特定断言
2. 打开新 report.html 对照 v1（`2026-07-16_wt030-035`）逐项核：
   - §2 多线程覆盖 ≥5 类线程（含 Audio 线程池）
   - §4 降频判定矩阵存在
   - 核心结论表和 §0 结论先行不重复
   - 表格不超框
3. 对照 v5.3 标杆核结构 + 叙事可读性
4. 任一不通过 = 打回

## 注意事项

- **这是 schema 重构**：视觉资产从顶层字段移到 section item 里。narrative.json 结构变了，render-html 渲染逻辑也变了。要同步改 narrative-types.ts / render-html.ts / narrative-prompt.txt / perfetto-multi-state.txt / harness.ts。
- **不丢内容是硬约束**：v4 丢的 threadOverview 行数/降频矩阵/核心结论与 §0 重复——重构后要恢复 v1 的内容厚度。narrative LLM 可能因为 schema 变化丢内容，要在 prompt 里强调"按模板填全视觉资产，不许漏"。
- **VisualAsset 是通用的**：type=table/ascii/matrix 三种，不硬编码 perfetto 特有概念。下次跑 unity/simpleperf 时，unity 模板可以告诉 LLM 填别的 visualAsset（如 unity 的"帧时间分布表"）。
- **WT-034 红队回路要适配**：runNarrativeRedTeam 的 4 维度检查里，"视觉资产全空"和"多线程覆盖不足"要改为扫 sections[].items[].visualAsset（不是顶层字段）。
