# TODO-WT-047 · 报告图增强（ASCII 图铺满 + SVG 火焰图 stretch）

> 状态：TODO ｜ 里程碑：M5 善后（报告可读性收尾）｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：WT-046 ✅（prompt+模板可读性修复，ASCII 图引导基础）+ WT-045 ✅（callTree 剪枝）
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§六严禁硬编码 + §七三段管线）+ `web/server/prism/prompts/report-templates/perfetto-multi-state.txt`（perfetto 模板的 ASCII 图范例）+ `web/data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5/narrative.json:90-130`（perfetto v5 的 ASCII 图实际产出，3 种类型范例）

## 背景

WT-044/045/046 验收后，报告可读性提升（callTree 剪枝 + 红线标注 + 人话化 + 章节职责分工），但**整体报告仍然缺图**——visual-asset 全是 table，没有 ASCII 图（perfetto v5 有 10 个 ASCII 图，unity pruned 有 0 个）。大段文字不直观，图文并茂对人阅读更友好。

**perfetto v5 已验证 ASCII 图有效**（3 种类型）：
1. **三态对比柱状图**（§0）：`base ████████ ░░ / cur ██████ ░░░░ / throttle ████ ░░░░░░` — 直观看到演化趋势
2. **callTree 缩进树 + 标注**（§0）：`Core.Update 7.32ms/帧 (24.1%) ├─ LuaMgr 3.80ms (12.5%) ── 统筹` — 比 HTML tree-row 紧凑 5 倍，有标注
3. **多信号对照**（§0）：`大核 reach%: base 74.9% │ cur 75.6% │ throttle 59.2% ↓` — 多维度一眼看完
4. **等待因果链**（§3）：`主线程 → URP.Render → URP.AfterRendering → Gfx.WaitForPresent 17.8ms (超 vsync)` — 因果链一目了然

**本工单要做**：narrative-prompt.txt 引导 LLM 在所有章节产 ASCII 图（Phase 1，不改 render）+ 可选 SVG 火焰图替代 §3 的 HTML tree-row（Phase 2 stretch，改 render）。

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §六严禁硬编码 + §七三段管线
- `web/server/prism/prompts/report-templates/perfetto-multi-state.txt` — perfetto 模板的 ASCII 图范例（§0/§3/§4 都有）
- `web/data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5/narrative.json:90-130` — perfetto v5 的 ASCII 图实际产出（3 种类型）
- `web/server/prism/prompts/narrative-prompt.txt` — 需求 A 改动目标
- `web/server/prism/render-html.ts` — 需求 B 改动目标（SVG 火焰图渲染）

## 任务

### 需求 A：narrative-prompt.txt 引导 LLM 在所有章节产 ASCII 图（Phase 1，必做）

**文件**：`web/server/prism/prompts/narrative-prompt.txt`

**要做**：在 narrative-prompt.txt 加一段"ASCII 图硬规则"，引导 LLM 在每个章节的 visualAsset 里产 `type: "ascii"` 资产。render 已支持（`<pre class="ascii">`），不用改 render。

**各章节 ASCII 图类型**（参考 perfetto v5 实际产出）：

| 章节 | ASCII 图类型 | 范例 |
|---|---|---|
| §0 三大演化结论 | 三态/二态对比柱状图 + callTree 摘要 + 因果链 | `base ████████ / cur ██████ ░░░░` + `Core.Update 7.32ms ├─ LuaMgr 3.80ms ── 统筹` |
| §1 采集元信息 | p50/p99 柱状图（base vs cur） | `p50: base ████ 16.66ms / cur ████████████ 41.92ms (×2.52)` |
| §2 多线程宏观 | 多线程 ms/帧柱状图（base vs cur） | `Main Thread: base ████ 16.66 / cur ████████████ 44.59 (×2.68)` |
| §3 红线清单 | 表格（已有，不强求 ASCII） | — |
| §3 下钻 | callTree 摘要 + 标注（每个下钻 item 1 个） | `Core.Update 12.88ms (30.7%) ├─ MapManager 6.14ms (大头) └─ LuaMgr 3.44ms` |
| §4 ROI | foldChange × 占 p50% 散点图（ASCII） | `OnCameraMove: ×∞ × 95.4% ████████████ P0 / Core.Update: ×10.5 × 30.7% ███████ P0` |

**引导段示例**（加到 narrative-prompt.txt）：
```
★【ASCII 图硬规则·每章节都要图文并茂】
报告不许只有表格和文字，每个章节都要有 ASCII 图（visualAsset.type="ascii"）。render 会把 ASCII 图渲染成 <pre class="ascii"> 块。

各章节 ASCII 图类型（参考 perfetto v5 标杆）：
- §0 三大演化结论：每条结论配 1 个 ASCII 图（三态/二态柱状图 / callTree 摘要 / 因果链）
- §1 采集元信息：p50/p99 柱状图（base vs cur）
- §2 多线程宏观：多线程 ms/帧柱状图（base vs cur）
- §3 下钻：每个下钻 item 配 1 个 callTree 摘要 ASCII 图（├─/└─ + ms + 标注 + 归并说明）
- §4 ROI：foldChange × 占 p50% 散点图（ASCII）

ASCII 图要点：
1. 紧凑：10 行内讲完一个子树/一个对比（不要 50 行全展开，那是 render 的 tree-row 职责）
2. 有焦点：LLM 主动选重点节点 + 标注（🔴/🟡/📈 ×N.N），不是全展开
3. 有归并说明：统筹/大头拆出/语义独立性 要在 ASCII 图里标注
4. 人话：caption 用人话说明这张图讲什么

ASCII 图范例（参考 perfetto v5）：
```
三态柱状图：
  base       ████████████████████████████ ░░░░    Run 86.94% / Sleep 12.04%
  cur        ████████████████████████ ░░░░░░░    Run 77.82% / Sleep 20.40%
  throttle   ██████████████████ ░░░░░░░░░░░░       Run 56.99% / Sleep 38.99%

callTree 摘要：
  Core.Update  cur 7.32ms/帧 (占 p50 24.1%)
  ├─ CS:AOE.LuaMgr           3.80ms (12.5%)  ── 统筹
  │   ├─ BattleHeadMgr.OnUpdate    4.92%   (子节点平均, 不单独列)
  │   └─ MapSignificanceMgr.ProcessTasks 3.99%
  └─ CS:AOE.Outside.MapManager 2.90ms (9.5%)  ── 大头拆出
      ├─ OutSideViewArmyLineMgr 5.19%  📈 cur→throttle ×1.37
      └─ BattleUIManager        2.38%

因果链：
  主线程 PlayerLoop
    ├─ Core.Update (业务 7.32ms/帧)
    └─ URP.Render (渲染提交)
       └─ URP.AfterRendering (throttle 占 41%)
          └─ Gfx.WaitForPresentOnGfxThread 17.8ms/帧 (超 vsync 16.66ms)
```

**关键**：ASCII 图是 LLM 主动画的摘要，不是 render 全展开。LLM 根据叙事需要选重点节点 + 标注 + 归并说明，10 行讲清一个子树。

### 需求 B：SVG 火焰图替代 §3 的 HTML tree-row（Phase 2，stretch，可选）

**文件**：`web/server/prism/render-html.ts`

**要做**：在 render-html.ts 加 `renderFlameGraph` 函数，把 callTree 渲染成 SVG 火焰图（横向条形图，宽度=占比，颜色=类别，可点击下钻）。

**应用场景**：仅 §3 下钻的 callTree（不是所有章节）。火焰图就是为 callTree 设计的，最适合 §3。

**SVG 火焰图 vs HTML tree-row**：
| 维度 | HTML tree-row（当前） | SVG 火焰图 |
|---|---|---|
| 信息密度 | 低（50 行展开一个子树） | 高（1 张图看完整个子树） |
| 直观性 | 低（indent + ms + pct，机器风） | 高（宽度=占比，颜色=类别，一眼看出大头） |
| 交互 | 无 | 可点击下钻 + hover 显示详情 |
| 实现难度 | 已有 | 中高（要写 SVG 渲染 + 交互逻辑） |

**实现要点**（如果做）：
1. `renderFlameGraph(node: DrillDownNode, rootMs: number, depth: number): string` — 递归渲染 SVG 矩形
2. 每个节点一个 `<rect>`，宽度 = `pctOfRoot * 100%`，高度 = 固定（如 20px），y = `depth * 20`
3. 颜色按 `categoryColor(node.name)` 分类（已有函数）
4. 节点文字在 rect 里（name + ms + pct）
5. 红线标注用 rect 边框颜色（redlineFlag=🔴红边 / foldChange=📈橙边）
6. 可选：点击下钻（JS 展开/折叠 children）

**关键**：SVG 火焰图是 stretch，如果时间紧优先做需求 A（ASCII 图铺满）。需求 A 已经能大幅提升可读性，需求 B 是锦上添花。

## 硬约束

1. **三段管线硬契约**（DR-44 + dev-conventions.md §七）：需求 A 只改 narrative-prompt.txt，不改 render；需求 B 改 render-html.ts 加 SVG 渲染，不改 explore/narrative
2. **严禁硬编码**（DR-41 + dev-conventions.md §六）：ASCII 图范例用占位符 `<节点名>` / `<大头子节点A1>`，不写死业务名
3. **不覆盖原报告产出物**（feedback memory）：重跑管线时新 report.html 不许覆盖 `2026-07-20_wt046/`，换路径 `2026-07-20_wt047/`
4. **需求 A 要重跑 narrative LLM**（ASCII 图是 narrative 阶段产的）；需求 B 只重跑 render
5. **perfetto 路径不退化**：narrative-prompt.txt 是数据源共用的，改完要确认 perfetto 报告也受益（ASCII 图更多）但不退化

## 验收 harness（必填，开发 agent 完成前自己跑通，不丢给主 agent）

**通用 harness（跑新产出的 unity 多态报告）**：
```
cd web && npx tsx server/prism/harness.ts --source unity --dir <新产出目录>
```
期望：82 PASS / 0 FAIL / 0 WARN（WT-045/046 的断言不能退化）

**工单特定断言**：
```bash
# 1. narrative-prompt.txt 有 ASCII 图硬规则
grep -c "ASCII 图硬规则\|图文并茂\|每章节都要有 ASCII 图" web/server/prism/prompts/narrative-prompt.txt
# 期望 ≥3

# 2. 新 narrative.json 有 ASCII 图 visualAsset（type=ascii）
grep -c '"type": "ascii"' <新产出目录>/narrative.json
# 期望 ≥5（每章节至少 1 个 ASCII 图：§0 3条 + §1 1个 + §2 1个 + §3 下钻 5个 + §4 1个 = 10+，阈值 5 宽松）

# 3. 新 report.html 有 ASCII 图渲染（<pre class="ascii">）
grep -c '<pre class="ascii">' <新产出目录>/report.html
# 期望 ≥5（和 narrative.json 的 ASCII 图数量对应）

# 4. 需求 B（SVG 火焰图，如果做）：render-html.ts 有 renderFlameGraph 函数
grep -c "renderFlameGraph\|<svg\|<rect" web/server/prism/render-html.ts
# 期望 ≥3（如果做了 SVG 火焰图）；如果不做（stretch 跳过），此条 SKIP

# 5. 新 report.html 的 §0 每条结论都有 ASCII 图（不是只有文字）
# 此条由主 agent 人眼检查
```

**端到端冒烟（重跑 narrative + render，不重跑 explore）**：
```
cd web
# 复用 WT-046 的 findings.json（含 callTreeAnnotations），只重跑 narrative + render
mkdir -p data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt047
cp data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046/{findings,verdict}.json \
   data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt047/
npx tsx server/prism/run-unity-pipeline.ts --skip-explore --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt047
```

**perfetto 不退化检查**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
# 期望：原 79 PASS / 2 FAIL / 1 WARN 不退化
```

## 完成标准

1. 通用 harness 82 PASS / 0 FAIL / 0 WARN（unity 多态报告）
2. 工单特定断言全 PASS（需求 B SVG 火焰图可 SKIP）
3. 端到端冒烟成功，新 report.html 产出（路径 `2026-07-20_wt047/report.html`）
4. **不覆盖原 `2026-07-20_wt046/report.html`**（feedback memory 硬约束）
5. **新 narrative.json 有 ≥5 个 ASCII 图 visualAsset**（需求 A 生效）
6. **新 report.html 有 ≥5 个 `<pre class="ascii">`**（ASCII 图渲染）
7. **每章节都有 ASCII 图**（§0/§1/§2/§3 下钻/§4，人眼检查）
8. **perfetto 报告不退化**（narrative-prompt.txt 改动不影响 perfetto）
9. 把改动 diff + harness 末尾输出 + 新 report.html 路径 + ASCII 图数量告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做（不只信开发 agent 报告的 PASS）：

1. 独立跑一遍通用 harness + 工单特定断言
2. 打开 report.html 看图文并茂效果（harness 验不了"图是否直观"，要人看）：
   - 每章节是否有 ASCII 图（不是只有表格和文字）
   - ASCII 图是否紧凑有焦点（10 行内讲清一个子树，不是 50 行全展开）
   - ASCII 图是否有标注（🔴/🟡/📈 ×N.N）+ 归并说明（统筹/大头拆出）
   - SVG 火焰图（如果做）：是否直观（宽度=占比，颜色=类别，一眼看出大头）
3. 对照 WT-046 报告看图增强效果
4. 确认 perfetto 报告也受益（ASCII 图更多）但不退化
5. 任一不通过 = 打回，不在错误基座上继续堆功能

## 注意事项

- **本工单是图增强**：需求 A 改 narrative-prompt.txt（引导 LLM 产 ASCII 图），需求 B 改 render-html.ts（SVG 火焰图，stretch）
- **需求 A 是 Phase 1 必做**：ASCII 图已验证有效（perfetto v5 有 10 个），render 已支持，只改 prompt 引导。投入小收益大。
- **需求 B 是 Phase 2 stretch**：SVG 火焰图工作量大（写 SVG 渲染 + 交互逻辑），如果时间紧可跳过。需求 A 已经能大幅提升可读性。
- **ASCII 图是 LLM 主动画的摘要**：不是 render 全展开。LLM 根据叙事需要选重点节点 + 标注 + 归并说明，10 行讲清一个子树。这是 ASCII 图比 HTML tree-row 更可读的核心原因。
- **不覆盖原报告产出物**：重跑管线时新 report.html 不许覆盖 `2026-07-20_wt046/`，换路径 `2026-07-20_wt047/`。
- **perfetto 也受益**：narrative-prompt.txt 是数据源共用的，改完 perfetto 报告也应该有更多 ASCII 图（perfetto v5 已有 10 个，改完应该保持或增加）。
