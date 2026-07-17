# TODO-WT-043 · unity-explore-prompt 加多态模式引导

> 状态：TODO ｜ 里程碑：M5 多源扩展 ｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：WT-038（数据源无关化，explore-prompt.txt 重命名为 unity-explore-prompt.txt）+ WT-040（dataSource 字段）+ WT-041（DR-43 扩展覆盖 2 态）
> 开工前必读：`docs/prism/memory/methodology/multi-state.md`（DR-43 扩展后）+ `docs/prism/memory/dev/conventions.md`（§六严禁硬编码）

## 背景

当前 unity-explore-prompt.txt（WT-038 重命名后）是单态模式（一个样本）。多态模式需要引导 LLM 对比两个或更多样本（baseline vs current，或 base/cur/throttle），找涨幅/回归。

概念对齐：不区分 diff 和 multi，统一叫多态。2 态是 N=2 的多态，≥3 态是 N≥3 的多态。explore-prompt 加一段"多态模式引导"覆盖所有 N≥2 的情况。

## 必读文档

- `docs/prism/memory/methodology/multi-state.md` — DR-43 扩展后（WT-041 完成）
- `docs/prism/memory/dev/conventions.md` — §六严禁硬编码
- `web/server/prism/prompts/perfetto-explore-prompt.txt` — 参考 perfetto 多态引导写法

## 任务

### 需求 A：unity-explore-prompt.txt 加多态模式引导

**文件**：`web/server/prism/prompts/unity-explore-prompt.txt`（WT-038 重命名后）

在"判定基准 · 帧预算"节后加"多态 vs 单态 · 先识别态数再下判定"节（参考 perfetto-explore-prompt.txt:41-62 的写法）：

```
═══════════════════════════════════════════════════
【多态 vs 单态 · 先识别态数再下判定】
═══════════════════════════════════════════════════

本次采集可能是多态（基线/当前 2 态，或 base/cur/throttle ≥3 态）或单态（只有一个样本）。**你必须先识别态数，再选判定方法论**：

**多态判定（DR-43，≥2 个样本时用）—— 相对倍数 + 绝对增量**：
- 业务涨幅显著：foldChange ≥ 2（相对基线涨 2 倍以上）+ 绝对增量 ≥ p50 的 1%（防"从 0.01 涨到 0.05 涨 5 倍但无意义"）
- 红线触发：foldChange ≥ 2 + perFrameMs 占 p50 ≥ 5%
- GPU-bound：wait slice 单次 > vsync + Sleep 增量 ≈ wait 增量（基线→当前增量归因）
- 多线程健康：基线/当前 run/sleep 对照 + 涨幅
- 叙事形态：演化型（基线→当前，或健康→病态）

**单态判定（DR-42，仅 1 个样本时用）—— 相对占比 + 相对周期**：
- 业务热点：占 PlayerLoop p50 百分比 ≥ 5%
- 红线触发：perFrameMs 占 p50 百分比 ≥ 5% + 单次 avg ≥ vsync 周期的 50%
- GPU-bound：单次 Gfx.WaitForPresent > vsync 周期 + Sleep 中 wait 占比 ≥ 80%
- 叙事形态：当前态型（多信号同向验证）

**关键**：所有阈值都是"相对占比"或"相对周期"，不是绝对 ms。换设备/换场景自适应。
```

### 需求 B：多态模式工具引导

unity 工具集（queryMarkers/scanMetricOverFrames/getFrameCallTree 等）当前默认单态。多态模式需要引导 LLM：
- 对每个样本分别跑 queryMarkers/scanPeakMarkers/aggregateSubtree 建候选清单
- 用 foldChange 对比两样本的 marker totalMs/perFrameMs
- 找涨幅 top N 模块，每个下钻

在"分析师的工作方式"节加多态模式引导：
```
0. **【多态模式·先建基线和当前两张全景地图】**
   多态分析时，先对基线和当前样本分别跑：
   - queryMarkers 主线程（基线 + 当前 各一次）
   - scanPeakMarkers（基线 + 当前 各一次）
   - aggregateSubtree（基线 + 当前 各一次）
   然后对比两样本的 marker totalMs/perFrameMs，算 foldChange，找涨幅 top N。
   候选清单 = 涨幅 top N + 当前态绝对值 top N（涨幅大的可能绝对值小，绝对值大的可能没涨——两个视角都要）。
```

### 需求 C：report-pipeline.ts 注册多态模式路由

**文件**：`web/server/prism/report-pipeline.ts`

当前 unity pipeline 的 reportTemplatePath 是 null。改成根据态数路由：
```ts
if (!registry.get('unity')) {
  registry.register({
    source: 'unity',
    explorePromptPath: 'prompts/unity-explore-prompt.txt',
    exploreTools: {},
    reportTemplatePath: null,  // 由 detectStateMode 动态选
    // 或: reportTemplatePath: 'prompts/report-templates/unity-single-state.txt',  // 默认单态
  });
}
```

或加一个 detectStateMode 函数，根据 runId 的样本数自动选模板：
- 1 个样本 → unity-single-state.txt
- ≥2 个样本 → unity-multi-state.txt

## 硬约束

1. **不硬编码业务名**：多态引导用占位符，不写 LuaMgr/行军线等
2. **2 态和 ≥3 态通用**：一段"多态模式引导"覆盖所有 N≥2 的情况
3. **绝对增量阈值防误判**：foldChange ≥ 2 但绝对增量 < p50 的 1% 不算回归
4. **不破坏单态模式**：单态时（1 个样本）仍用 DR-42 单态判定，不强制多态

## 验收 harness（必填，开发 agent 完成前自己跑通）

**工单特定断言**：
```bash
# 1. unity-explore-prompt.txt 含多态模式引导
grep -c "多态\|多态判定\|foldChange" web/server/prism/prompts/unity-explore-prompt.txt
# 期望 ≥3

# 2. 含绝对增量阈值
grep -c "绝对增量\|p50 的 1%" web/server/prism/prompts/unity-explore-prompt.txt
# 期望 ≥1

# 3. 无业务名硬编码
grep -c "行军线\|ArmyLine\|MapSignificance\|BattleHead\|LuaMgr" web/server/prism/prompts/unity-explore-prompt.txt
# 期望 0

# 4. report-pipeline.ts 路由更新（如改了）
grep -c "unity-multi-state\|unity-single-state\|detectStateMode" web/server/prism/report-pipeline.ts
# 期望 ≥1（如实现了 detectStateMode）
```

**端到端冒烟**（确认多态引导不破坏单态）：
```
cd web && npx tsx server/prism/explore.cli.ts --source unity --runId unity-outside-stressmove --output-dir data/prism-out/wt043-verify --dry-run
```
检查 prompt 含多态引导段，且单态模式仍能跑。

## 完成标准

1. 工单特定断言全 PASS
2. unity-explore-prompt.txt 含多态模式引导
3. 单态模式不破坏（重跑 unity 单态报告，harness 全 PASS）
4. 把改动清单告诉主 agent

---

## 主 agent 验收清单

1. 读 unity-explore-prompt.txt 确认多态引导段清晰
2. grep 确认无业务名硬编码
3. 确认单态模式不破坏（重跑 unity 单态报告）
4. 确认绝对增量阈值防误判逻辑清晰
5. 任一不通过 = 打回

## 注意事项

- **依赖 WT-038/040/041**：数据源无关化 + dataSource 字段 + DR-43 扩展，三个前置完成后再做本工单
- **不破坏单态**：单态时仍用 DR-42 单态判定，多态引导只在 ≥2 样本时生效
- **2 态和 ≥3 态通用**：一段引导覆盖所有 N≥2 的情况，不区分 diff 还是 multi
