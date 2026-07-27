# TODO-WT-046-v4 · 章节设计 + render 层修复（治本：3 层重复根因）

> 状态：TODO ｜ 里程碑：M5 善后（报告可读性收尾·v4）｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：WT-046 v3 ✅（prompt 禁内容约束生效，§0 ① narrative 干净了，harness [2c] PASS，但章节设计 + render 层重复未解决——用户验收"区别不大"）
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§六严禁硬编码 + §七三段管线 + §八占位符填充）+ 本工单"3 层重复根因"节

## 背景

WT-046 v1/v2/v3 三次打回都在 prompt 约束层修，v3 的 §0 ① narrative 确实干净了（harness [2c] PASS），但用户验收仍然说"区别不大，核心结论、结论先行、下钻主题内容重复太多"——因为**根因是章节设计 + render 渲染层**的问题，prompt 约束治不了。

v3 的 prompt 改动是对的（§0 ① narrative 干净了），但只解决了 3 层重复中的 1 层（§0/§3 内容重复），另外 2 层（topConclusions 挂 HTML 树 + §3 下钻双重 callTree）+ §4/§3 recommendations 重复都没解决。这次 v4 必须从 render + 章节设计层治本。

## 3 层重复根因（开发 agent 必读）

### 第 1 层：topConclusions 行下挂完整 callTree HTML 树（核心结论太冗长）

`render-html.ts:499-512` 把 topConclusions 每行下面挂一棵完整 callTree HTML 树（`renderTreeHTML` 全展开）。5 条 topConclusions = 5 棵完整 callTree。读者看核心结论表时就被 5 棵树淹没。

perfetto v5 标杆的 topConclusions **不挂 HTML 树**——只挂 ASCII 摘要图或 note。WT-032 当时为了"对齐 v5.3 §0 标杆每条结论配图"加的，但 v5.3 配的是紧凑 ASCII 图，不是完整 HTML 树。过度渲染了。

**证据**：perfetto v1 标杆 report.html 有 12 个 `tree-section`，unity v3 有 19 个——多 7 个就是 topConclusions 行下挂的 callTree HTML 树。

### 第 2 层：§3 下钻 narrative 里嵌 callTree 摘要文字 + 下面又有 HTML 渲染树（双重 callTree）

`narrative-prompt.txt:230` 明确引导 LLM：
```
| §3 下钻 | 每个下钻 item 配 1 个 callTree 摘要 ASCII 图（├─/└─ + ms + 标注 + 归并说明） | `<主入口> 12.88ms (30.7%) ├─ <大头子模块B1> 6.14ms (大头) └─ <业务模块A> 3.44ms` |
```

LLM 老实在 §3 下钻 ① narrative 里嵌了 callTree 摘要文字（``` 包裹的 ASCII 块）。但 `render-html.ts:416` 又因为 `item.callTree.rootMarker` 渲染了一棵完整 HTML 树。**同一个 callTree 在 §3 下钻 ① 里出现两次**——narrative 文字版 + HTML 渲染版。

perfetto v5 的 §5 下钻 item 的 narrative **不含 callTree 摘要文字**——它只讲"子树占比/热点描述 + 红线判定 + 演化趋势"，callTree 用 `item.callTree.rootMarker + note` 字段让 render 渲染 HTML 树。narrative 文字和 callTree HTML 各司其职，不重复。

**证据**：v3 narrative.json:502 的 §3 下钻 ① narrative 里嵌了：
```
MapSignificanceMgr callTree 摘要:
  MapSignificanceMgr  cur 3.994ms/帧 (占 p50 9.5%, 涨 ×57.88)  ── 调度壳
  └─ EntityTask  cur 3.574ms/帧 (大头, 拆出)
     ├─ ProcessTask_MapEntityAdd    1.546ms (大头)
     ├─ ProcessTask_MapObjRefresh   1.198ms
     └─ ProcessTask_MapObjCleanUp  0.470ms
```
下面又有 `item.callTree.rootMarker = "MapSignificanceMgr"` 触发的 HTML 渲染树。

### 第 3 层：§4 P0-1 重复 §3 下钻 ① 的 recommendations（结构性重复）

同一个 finding（如 MapSignificanceMgr 涨 57.88 倍）的 recommendations 在两处都出现：
- §3 下钻 ① recommendations：["复用 entity task 对象池...", "ProcessTask_MapEntityAdd 分帧化...", "排查为什么每帧处理这么多实体..."]
- §4 P0-1 narrative：重复讲"对象池 + 分帧处理"

§0 ① 现在干净了（v3 改对了），但 §4 P0-1 仍然和 §3 下钻 ① 重复 recommendations。

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §六严禁硬编码 + §七三段管线 + §八占位符填充
- `web/server/prism/render-html.ts:499-512` — topConclusions 行下挂 callTree HTML 树的代码（需求 A 目标）
- `web/server/prism/render-html.ts:402-459` — renderItemCard（§3 下钻 item 渲染，需求 B 相关）
- `web/server/prism/prompts/narrative-prompt.txt:230` — §3 下钻配 callTree 摘要 ASCII 图的引导（需求 B 目标）
- `web/server/prism/prompts/narrative-prompt.txt:252-259` — callTree 摘要树范例（需求 B 目标）
- `web/server/prism/prompts/report-templates/unity-multi-state.txt` — §4 章节骨架（需求 C 目标）
- `web/data/prism-out/bk26b-perfetto-triad/2026-07-16_wt030-035/narrative.json:197-226` — perfetto v5 §5 下钻 item 标杆写法（学它怎么不嵌 callTree 摘要文字）
- `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v3/narrative.json:502` — v3 失败案例（§3 下钻 ① 看怎么双重 callTree 的）

## 任务

### 需求 A（render 层）：topConclusions 行不挂完整 callTree HTML 树

**文件**：`web/server/prism/render-html.ts`

**改动（第 499-512 行 `conclusionsHTML` 构建逻辑）**：

当前代码（topConclusions 行下挂完整 callTree HTML 树）：
```ts
const tree = treesByKey.get(`tc::${row.rank}`);
let extraHTML = '';
if (tree) {
  const rootMs = tree.totalMsPerFrame;
  extraHTML = `<tr><td colspan="5"><div class="tc-tree-section">
    <div class="tree-header">
      <span class="tree-title">调用树（per-frame avg）</span>
      <span class="tree-legend">${TREE_LEGEND}</span>
    </div>
    <div class="tree-container">${renderTreeHTML(tree, rootMs, 0)}</div>
  </div></td></tr>`;
} else if (row.asciiArt) {
  ...
}
```

改成：**topConclusions 行下不挂完整 callTree HTML 树**。只保留 ASCII 摘要图或 callTree.note（一句话备注）。完整 callTree 只在 §3 下钻出现。

具体改法：
- 删掉 `if (tree) { ... renderTreeHTML ... }` 分支（不挂 HTML 树）
- 保留 `else if (row.asciiArt)` 分支（ASCII 摘要图保留）
- 加一个 `else if (row.callTree?.note)` 分支（只挂 note 一句话备注，不挂树）
- 改完 topConclusions 表下面最多只有 ASCII 摘要图或 note，不再有 HTML 树

**注意**：`treesByKey.get('tc::${row.rank}')` 这个查询可以保留（其它地方可能用），只是不在 topConclusions 行下渲染 HTML 树。如果 `tc::rank` 这个 key 不再被任何渲染用，可以把 `render-html.ts:1791-1792` 的 topConclusions callTree refs 收集也删掉（避免无效查询）。

**理由**：topConclusions 是"核心结论表"，读者一眼看完 5 条结论。5 棵完整 callTree 挂在表下面把读者淹没。完整 callTree 只在 §3 下钻出现（每个 finding 详细展开的地方）。

### 需求 B（prompt 层）：§3 下钻 narrative 不许嵌 callTree 摘要文字

**文件**：`web/server/prism/prompts/narrative-prompt.txt`

**改动 1（第 230 行 ASCII 图类型表 §3 下钻行）**：

当前：
```
| §3 下钻 | 每个下钻 item 配 1 个 callTree 摘要 ASCII 图（├─/└─ + ms + 标注 + 归并说明） | `<主入口> 12.88ms (30.7%) ├─ <大头子模块B1> 6.14ms (大头) └─ <业务模块A> 3.44ms` |
```

改成：
```
| §3 下钻 | narrative 只讲子树占比/热点描述 + 红线判定 + GC 归因 + 优化建议；**不许嵌 callTree 摘要文字**（``` 包裹的 ├─/└─ 缩进块）——callTree 用 item.callTree.rootMarker 让 render 渲染 HTML 树 | `<主入口> 12.88ms (30.7%)，子树大头 <大头子模块B1> 6.14ms，<业务模块A> 3.44ms——红线判定 foldChange ×N.N + 占 p50 Y%` |
```

**理由**：narrative 文字和 callTree HTML 各司其职，不重复。narrative 讲"子树占比/热点描述 + 红线判定 + GC 归因 + 优化建议"（人话描述），callTree 用 HTML 渲染树（结构化展示）。对齐 perfetto v5 标杆的 §5 下钻 item 写法（narrative.json:197-226）。

**改动 2（第 252-259 行 callTree 摘要树范例）**：

当前：
```
callTree 摘要树（**只用于 §3 下钻**，摘要级，10 行内；§0 不许用——§0 也不许讲范例里出现的子节点 ms/占比/foldChange/GC alloc 等细节，如 <大头子节点A1> 4.92% / <大头子模块B1> 5.19% 📈 ×1.37——这些细节是 §3 下钻专属）：
  <主入口>  cur 7.32ms/帧 (占 p50 24.1%)
  ├─ <业务模块A>           3.80ms (12.5%)  ── 统筹
  │   ├─ <大头子节点A1>    4.92%   (子节点平均, 不单独列)
  │   └─ <大头子节点A2>    3.99%
  └─ <业务模块B>           2.90ms (9.5%)  ── 大头拆出
      ├─ <大头子模块B1>    5.19%  📈 cur→throttle ×1.37
      └─ <其它子节点B2>    2.38%
```

改成（删掉范例，改成说明文字）：
```
callTree 渲染（**只用于 §3 下钻**，由 render-html.ts 渲染 HTML 树，LLM 不在 narrative 里画 callTree 摘要文字）：
- LLM 在 item.callTree.rootMarker 填入 root marker 名（如 <主入口>）
- LLM 在 item.callTree.note 填入一句话备注（如"子树大头 <大头子模块B1> 6.14ms，foldChange ×N.N"）
- render-html.ts 会自动渲染 HTML 树（含剪枝 + 红线标注 + 归并说明）
- §3 下钻 narrative 只讲子树占比/热点描述 + 红线判定 + GC 归因 + 优化建议，**不嵌 callTree 摘要文字**（``` 包裹的 ├─/└─ 缩进块）——callTree 由 render 渲染
```

**理由**：明确 LLM 不在 narrative 里画 callTree 摘要文字，callTree 由 render 渲染。范例改成"LLM 填什么字段"的说明，不是"LLM 画什么 ASCII 图"。

### 需求 C（章节设计层）：§4 ROI 不重复 §3 下钻的 recommendations

**文件 1**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

**改动（§4 章节骨架加约束）**：

在 §4 ROI 章节骨架里加约束：
```
★【§4 ROI 不重复 §3 下钻的 recommendations】
§4 ROI 只给"优先级排序 + 散点图 + 一句话行动方向"，不重复 §3 下钻的详细 recommendations。
§3 下钻是"详细展开的地方"（callTree + 红线 + GC + 源码 + 优化建议），§4 只是指路牌——告诉读者"先治哪个"，具体怎么治去 §3 下钻看。
❌ 反例：§4 P0-1 的 recommendations 写"复用 entity task 对象池 + ProcessTask_MapEntityAdd 分帧化"——这是 §3 下钻 ① 的 recommendations，§4 重复了。
✅ 正例：§4 P0-1 只写"MapSignificanceMgr 对象池 + 分帧处理（详见 §3 下钻 ①）"——一句话行动方向 + 引用。
```

**文件 2**：`web/server/prism/prompts/narrative-prompt.txt`

**改动（第 231 行 §4 范例）**：

当前：
```
| §4 ROI | foldChange × 占 p50% 散点图（ASCII） | `<相机移动模块>: ×∞ × 95.4% ████████████ P0 / <主入口>: ×10.5 × 30.7% ███████ P0` |
```

改成：
```
| §4 ROI | foldChange × 占 p50% 散点图（ASCII）+ 一句话行动方向（**不重复 §3 下钻的 recommendations**，只给"先治哪个 + 详见 §3 下钻 ①"） | `<相机移动模块>: ×∞ × 95.4% ████████████ P0 优先治（详见 §3 下钻 ②）` |
```

**理由**：同一个 finding 的 recommendations 只在 §3 下钻 出现一次，§4 只是指路牌。

### 需求 D：重跑 narrative LLM + render（不重跑 explore）

**命令**：
```bash
cd web && npx tsx server/prism/run-unity-pipeline.ts \
  --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v4
```

**复用 WT-046 的 findings.json**：如果 `--skip-explore` 不能直接复用，手动复制：
```bash
cp web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046/findings.json \
   web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v4/findings.json
```
然后再跑 narrative + render。

**产出路径**：`web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v4/report.html`

**不覆盖**（feedback memory 硬约束）：
- 不许覆盖 `2026-07-20_wt046/` / `2026-07-20_wt046_v2/` / `2026-07-20_wt046_v3/` / `2026-07-20_wt047/` / `2026-07-20_pruned/`

**注意 v3 的 runId bug**：v3 开发 agent 报告 narrative LLM 偶发把 runId 写成 `2026-07-20_wt046_v3`（应该是 `udiff_1782983710451_be175ef1/2026-07-20_wt046_v3`），导致 render-html 查 callTree 全部 NOT FOUND。如果 v4 也遇到这个问题，手动修 narrative.json 的 runId 字段后重跑 render。根因是 narrative-service.ts:594 JSON.parse 后没覆盖 `narrative.runId = runId`，LLM 写啥就是啥。本工单不修这个 bug，但遇到时要手动修 runId 重跑 render。

## 硬约束

1. **三段管线硬契约**（DR-44 + dev-conventions.md §七）：本工单改 render-html.ts + prompt + 模板 + 重跑 narrative+render，不改 explore-service / narrative-service
2. **严禁硬编码**（DR-41 + dev-conventions.md §六）：prompt 引导里用占位符 `<节点名>` / `<大头子节点A1>`，不写死业务名
3. **不覆盖原报告产出物**（feedback memory）：新 report.html/narrative.json 换路径 `2026-07-20_wt046_v4/`，不覆盖 v1/v2/v3/wt047/pruned
4. **不重跑 explore**：findings.json 复用 WT-046 的，只跑 narrative + render
5. **perfetto 路径不退化**：改 narrative-prompt.txt 是数据源无关的，不能让 perfetto 报告退化。改完要跑 perfetto harness 确认
6. **本工单是章节设计 + render 层修复**：不是只改 prompt。render-html.ts 的改动（需求 A）是核心——topConclusions 行不挂完整 callTree HTML 树

## 验收 harness（必填，开发 agent 完成前自己跑通，不丢给主 agent）

**通用 harness**：
```
cd web && npx tsx server/prism/harness.ts --source unity --dir data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v4
```
期望：83 PASS / 0 FAIL / 0 WARN（不退化）

**工单特定断言**：

```bash
# 1. render-html.ts topConclusions 行不挂完整 callTree HTML 树
# 检查 report.html 里 topConclusions 表下面没有 tc-tree-section（HTML 树容器）
grep -c "tc-tree-section" web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v4/report.html
# 期望：0（topConclusions 行下不挂 HTML 树）

# 2. §3 下钻 narrative 不含 callTree 摘要文字（``` 包裹的 ├─/└─ 缩进块）
# 检查 §3 下钻 item.narrative 不含 "├─\|└─" 缩进
# 此条由主 agent 人眼检查（机器难抓"narrative 文字 vs callTree HTML"边界）

# 3. §4 P0-1 不重复 §3 下钻 ① 的 recommendations
# 检查 §4 P0-1 的 recommendations 和 §3 下钻 ① 的 recommendations 不逐字重复
# 此条由主 agent 人眼检查

# 4. tree-section 总数下降（topConclusions 不挂树 + §3 下钻不双重）
grep -c "tree-section" web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v4/report.html
# 期望：≤12（v3 是 19，perfetto v1 标杆是 12）
```

**端到端冒烟**（不重跑 explore，复用 WT-046 的 findings.json）：
```
cd web && npx tsx server/prism/run-unity-pipeline.ts --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v4
```
跑通后把 report.html 路径告诉主 agent，主 agent 对照 §0/§3/§4 看重复是否消除。

**perfetto 不退化检查**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
# 期望：原 80 PASS / 2 FAIL / 1 WARN 不退化（2 FAIL 是 WT-037 遗留，与本工单无关）
```

## 完成标准

1. 通用 harness 83 PASS / 0 FAIL / 0 WARN（unity 多态报告）
2. 工单特定断言 1 + 4 全 PASS（断言 2-3 主 agent 人眼检查）
3. 端到端冒烟成功，新 report.html 产出（路径 `2026-07-20_wt046_v4/report.html`）
4. **不覆盖** v1/v2/v3/wt047/pruned（feedback memory 硬约束）
5. **topConclusions 表下面不挂完整 callTree HTML 树**（只挂 ASCII 摘要图或 note）
6. **§3 下钻 ① narrative 不含 callTree 摘要文字**（``` 包裹的 ├─/└─ 缩进块）——callTree 只用 HTML 渲染树
7. **§4 P0-1 不重复 §3 下钻 ① 的 recommendations**（§4 只给一句话行动方向 + 引用）
8. **perfetto 报告不退化**
9. 把改动 diff + harness 末尾输出 + 新 report.html 路径告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做（不只信开发 agent 报告的 PASS）：

1. 独立跑一遍通用 harness + 工单特定断言 1 + 4
2. **打开 narrative.json + report.html 看结构（机器断言 2-3 主 agent 人眼检查）**：
   - topConclusions 表下面有没有挂完整 callTree HTML 树——**不应有**，只挂 ASCII 摘要图或 note
   - §3 下钻 ① narrative 有没有嵌 callTree 摘要文字（``` 包裹的 ├─/└─ 缩进块）——**不应有**，callTree 只用 HTML 渲染树
   - §4 P0-1 有没有重复 §3 下钻 ① 的 recommendations——**不应重复**，§4 只给一句话行动方向 + 引用
3. 对照 perfetto v1 标杆 report.html 看 tree-section 数量是否对齐（v3 是 19，v4 应该 ≤12）
4. 确认 perfetto 报告不退化
5. 任一不通过 = 打回，不在错误基座上继续堆功能

## 注意事项

- **本工单是章节设计 + render 层修复 v4**：不是只改 prompt。render-html.ts 的改动（需求 A）是核心——topConclusions 行不挂完整 callTree HTML 树。这是 v1/v2/v3 三次打回都没碰的 render 层改动。
- **v3 的 prompt 改动是对的**（§0 ① narrative 干净了，harness [2c] PASS），本工单不改 §0 的 prompt 约束，只改 §3 下钻 + §4 的 prompt 引导。
- **根因是章节设计 + render 层**：v1/v2/v3 都在 prompt 约束层修，但 3 层重复里有 2 层是 render 层过度渲染（topConclusions 挂 HTML 树 + §3 下钻双重 callTree），1 层是章节设计（§4/§3 recommendations 重复）。prompt 约束治不了 render 层问题。
- **对齐 perfetto v5 标杆**：perfetto v5 的 topConclusions 不挂 HTML 树，§5 下钻 narrative 不嵌 callTree 摘要文字，§7 ROI 不重复 §5 下钻的 recommendations。v4 对齐这个写法。
- **不覆盖原报告产出物**：新 report.html/narrative.json 换路径 `2026-07-20_wt046_v4/`。
- **perfetto 路径不退化**：改 narrative-prompt.txt 是数据源无关的，改完要确认 perfetto 不退化。narrative-prompt.txt 第 230 行 + 第 252-259 行范例改了，perfetto 报告也会受影响——但 perfetto-multi-state.txt 模板有自己的章节职责分工约束，perfetto §5 下钻一直用 HTML 树不用 narrative 嵌 callTree 摘要文字，所以不会退化。改完跑 perfetto harness 确认。

## 验收对照表（开发 agent 自检 + 主 agent 复核）

| 检查项 | WT-046 v3（失败） | WT-046 v4（期望） |
|---|---|---|
| topConclusions 行下挂完整 callTree HTML 树 | 有（5 棵树） | **无**（只挂 ASCII 摘要图或 note） |
| §3 下钻 narrative 嵌 callTree 摘要文字 | 有（``` 包裹的 ├─/└─ 缩进块） | **无**（callTree 只用 HTML 渲染树） |
| §4 P0-1 重复 §3 下钻 ① recommendations | 有（"对象池 + 分帧处理"两处都出现） | **无**（§4 只给一句话行动方向 + 引用） |
| report.html tree-section 总数 | 19 | ≤12（对齐 perfetto v1 标杆） |
| 通用 harness | 83/0/0 | 83/0/0（不退化） |
| perfetto harness | 80/2/1 | 80/2/1（不退化，2 FAIL 是 WT-037 遗留） |
