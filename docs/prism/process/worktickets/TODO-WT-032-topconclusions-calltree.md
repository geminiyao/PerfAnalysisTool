# TODO-WT-032 · topConclusions 挂 callTree（DR-45 差距3，schema 扩展）

> 状态：TODO ｜ 里程碑：M5 Perfetto agent 化 ｜ 执行方：Cursor（施工）+ 主 agent（验收）
>
> 前置：**WT-031 验收通过**（explore 已重跑拿全线程 sched 数据，findings 有完整 callTree 数据可挂）。
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§三对照标杆 + §四图文穿插）+ `CODEBUDDY.md`（三段管线硬契约）+ `docs/report/performance-report_perfetto_ULTIMATE_v5.3.md` §0（三大结论配 ASCII 调用树标杆）。

## 背景

对照 v5.3 标杆 §0，三大结论每条配 ASCII 调用树/柱状图穿插——读者一眼能看到结论 + 配套可视化。当前 `topConclusions` 是纯文本表格（rank/problem/kind/contribution/severity），无任何可视化。差距：结论是"干说"，没有"配图佐证"。

**根因**：`narrative-types.ts` 的 `TopConclusionRow` 没有 `callTree`/`asciiArt` 字段——narrative LLM 想挂也挂不上。render-html 也没有"核心结论表每行下挂调用树"的渲染逻辑。

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §三对照标杆 + §四图文穿插（调用树有焦点）
- `CODEBUDDY.md`（项目根）— 三段管线硬契约
- `docs/report/performance-report_perfetto_ULTIMATE_v5.3.md` §0 — 三大结论配 ASCII 图标杆
- `web/server/prism/narrative-types.ts` — 现有 TopConclusionRow 结构（line 67-77）
- `web/server/prism/render-html.ts` — 现有 conclusionsHTML 渲染（line 242-251）+ requeryTrees（line 1191-1245）

## 任务

### 需求 A：narrative-types.ts 扩 TopConclusionRow

**文件**：`web/server/prism/narrative-types.ts`

`TopConclusionRow`（line 67-77）扩展两个可选字段（复用已有类型，不新建）：

```ts
export interface TopConclusionRow {
  rank: number;
  problem: string;
  kind: string;
  contribution: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  dimensions?: HotspotDimension[];
  judgability?: HotspotJudgability;
  /** 可选：挂在这条结论下的调用树（render 重查渲染，复用 NarrativeItem.callTree 的 CallTreeRef 类型） */
  callTree?: CallTreeRef;
  /** 可选：挂在这条结论下的 ASCII 图（LLM 产文本，render 原样渲染在 <pre> 块，复用 AsciiArt 类型） */
  asciiArt?: AsciiArt;
}
```

**关键**：`CallTreeRef` 和 `AsciiArt` 类型已存在（narrative-types.ts:12-17 + 114-122），直接复用，不新建类型。

### 需求 B：render-html.ts 核心结论表每行下挂 callTree/asciiArt

**文件**：`web/server/prism/render-html.ts`

1. **`requeryTrees`（line 1191-1245）扩展**：当前只处理 `narrative.sections[].items[].callTree`。扩展为也处理 `narrative.topConclusions[].callTree`：
   - 在收集 refs 的循环里（line 1200-1207）加：
     ```ts
     narrative.topConclusions.forEach((row, i) => {
       if (row.callTree?.rootMarker) {
         refs.push({ key: `tc::${row.rank}`, rootMarker: row.callTree.rootMarker });
       }
     });
     ```
   - 函数返回的 Map 现在含两类 key：`<secHeading>::<i>`（section items）+ `tc::<rank>`（topConclusions）

2. **`renderHTML` 入参改名**（line 209-215）：`treesByItemKey: Map<string, DrillDownNode | null>` 改名为 `treesByKey`（因为现在含 topConclusions 的树，不只是 item）。所有引用处同步改名。

3. **`conclusionsHTML`（line 242-251）扩展**：每行 `<tr>` 后若 `row.callTree` 或 `row.asciiArt` 存在，追加一行 `<tr><td colspan="5">` 挂渲染内容：
   ```ts
   const conclusionsHTML = narrative.topConclusions.map(row => {
     const sc = sevStyle(row.severity);
     const tree = treesByKey.get(`tc::${row.rank}`);
     let extraHTML = '';
     if (tree) {
       const rootMs = tree.totalMsPerFrame;
       extraHTML = `<tr><td colspan="5"><div class="tc-tree-section">${renderTreeHTML(tree, rootMs, 0)}</div></td></tr>`;
     } else if (row.asciiArt) {
       extraHTML = `<tr><td colspan="5"><div class="tc-ascii-section"><pre class="ascii-art-content">${htmlEsc(row.asciiArt.content)}</pre>${row.asciiArt.caption ? `<div class="ascii-art-caption">${htmlEsc(row.asciiArt.caption)}</div>` : ''}</div></td></tr>`;
     }
     return `<tr>
       <td class="tc-rank">${row.rank}</td>
       <td class="tc-problem">${htmlEsc(row.problem)}</td>
       <td class="tc-kind">${htmlEsc(KIND_CN[row.kind] ?? row.kind)}</td>
       <td class="tc-contribution">${htmlEsc(row.contribution)}</td>
       <td class="tc-severity"><span class="chip sev-chip" style="color:${sc.dot};background:${sc.badge}">${SEV_CN[row.severity] ?? row.severity}</span></td>
     </tr>${extraHTML}`;
   }).join('');
   ```

4. **加 CSS**（在现有 `.top-conclusions` 样式块后，约 line 593 后）：
   ```css
   .tc-tree-section { padding: 0 !important; background: #080d14; }
   .tc-tree-section .tree-container { padding: 10px 12px; }
   .tc-ascii-section { padding: 10px 14px !important; background: #080d14; }
   .tc-ascii-section .ascii-art-content { margin: 0; }
   ```

### 需求 C：narrative-prompt 加 topConclusions 挂 callTree 引导

**文件**：`web/server/prism/prompts/narrative-prompt.txt`

在 topConclusions 输出结构说明后（约 line 138，"按对整体贡献排序,稳态大头和高频尖峰排前" 那条之后）追加：

```
★【critical/high 的 topConclusion 必须挂 callTree 或 asciiArt】
rank 1-3 的 topConclusion（severity=critical 或 high）必须给 callTree.rootMarker 或 asciiArt。

- callTree.rootMarker 指向 findings 里查过的调用树根节点（如 "Core.Update" / "CS:AOE.Outside.MapManager" / "URP.Submit"）。
  render 会重查这棵树画彩色 flame-bar，挂在核心结论表对应行下方。
- asciiArt 给文本柱状图/对比图（如三态 Run/Sleep 对比、foldChange 涨幅柱状图）。
  render 原样渲染在 <pre> 块里，挂在核心结论表对应行下方。

medium/low 的可选，不强制。但 critical/high 不挂 = 结论干说无配图，对照 v5.3 §0 差距大。
```

## 硬约束

1. **三段管线硬契约**：render 层只做呈现（重查 callTree + 渲染），不写判定逻辑
2. **不硬编码业务名**：narrative-prompt 引导里用的"Core.Update"/"CS:AOE.Outside.MapManager" 是范例（占位符），不是硬编码盯防清单
3. **复用已有类型**：CallTreeRef 和 AsciiArt 类型已存在，不新建类型
4. **修完 harness 必须 FAIL=0**
5. **不覆盖原报告**：端到端冒烟用 `--out` 新目录

## 验收 harness（必填，开发 agent 完成前自己跑通）

**通用 harness**（用 WT-031 产出的新目录）：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt031
```
期望：35 PASS / 0 FAIL（不退化）。

**工单特定断言**：
```bash
# 验 narrative-types.ts 扩了字段
grep -c "callTree?: CallTreeRef" web/server/prism/narrative-types.ts  # 期望 ≥1（TopConclusionRow 里）
grep -c "asciiArt?: AsciiArt" web/server/prism/narrative-types.ts  # 期望 ≥1（TopConclusionRow 里）

# 验 render-html.ts 扩了渲染
grep -c "tc::" web/server/prism/render-html.ts  # 期望 ≥2（requeryTrees 收集 + conclusionsHTML 读取）

# 验 narrative-prompt 加了引导
grep -c "critical/high 的 topConclusion 必须挂" web/server/prism/prompts/narrative-prompt.txt  # 期望 ≥1
```

**端到端冒烟**（不重跑 explore，复用 WT-031 的 findings，新目录不覆盖）：
```
cd web && npx tsx server/prism/run-perfetto-pipeline.ts --skip-explore --out data/prism-out/bk26b-perfetto-triad/2026-07-16_wt032
```
期望：新 narrative.json 的 topConclusions 里 severity=critical/high 的行有 callTree 或 asciiArt 字段的比例 ≥50%；新 report.html 核心结论表每行下有 callTree 或 ASCII 图。

## 完成标准

1. 通用 harness FAIL=0
2. 工单特定断言全 PASS
3. 端到端冒烟成功，新 report.html 产出
4. 把新 report.html 路径 + 改动清单告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

1. 独立跑一遍通用 harness + 工单特定断言
2. 打开新 report.html 看 §0 核心结论表，critical/high 行下有 callTree 或 ASCII 图（harness 验不了"图文穿插视觉"，要人看）
3. 对照 v5.3 §0 三大结论配图标杆核
4. 任一不通过 = 打回

## 注意事项

- **复用 requeryTrees 逻辑**：不要新写一套 callTree 重查——扩展现有 requeryTrees 处理 topConclusions 即可，复用 perfettoNodeToDrillDown / drillDownMarker 的树构建。
- **callTree.rootMarker 指向 findings 里查过的节点**：narrative LLM 不能凭空造 rootMarker，必须从 findings 的 evidence 里取真实查过的 slice 名。render 重查时按 rootMarker 在 callTree 里搜索子树（复用 findPerfettoSubtree 逻辑）。
- **asciiArt 是 LLM 产文本**：render 原样渲染在 `<pre>` 块，不做解析。LLM 要产等宽对齐的 ASCII 图（柱状图/缩进树/对照表）。
