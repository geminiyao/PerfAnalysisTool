# TODO-WT-041 · DR-43 多态方法论扩展覆盖 2 态（diff = N=2 多态）

> 状态：TODO ｜ 里程碑：M5 多源扩展 ｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：无（纯方法论设计，扩展已有 DR-43 draft）
> 开工前必读：`docs/prism/memory/methodology/multi-state.md`（DR-43 draft）+ `docs/prism/memory/methodology/single-state.md`（DR-42 draft）

## 背景

用户提出概念对齐：**diff 和 multi 本质都是"多态"**（≥2 个样本对比），只是样本数不同：

| 态数 | 旧叫法 | 统一叫法 | 判定方法论 | 叙事形态 |
|---|---|---|---|---|
| 1 | single/单态 | 单态 | 相对占比（DR-42） | 当前态型 |
| 2 | diff | 多态（2 态） | 相对倍数 + 绝对增量（DR-43 扩展） | 演化型（基线→当前） |
| ≥3 | multi | 多态（N 态） | 相对倍数 + 演化趋势单调性（DR-43 已有） | 演化型（健康→病态） |

**关键洞察**：2 态和 ≥3 态的判定方法论本质相同（都用 foldChange + 绝对增量），只是 ≥3 态多了"演化趋势单调性"这个增强信号。所以 DR-43 扩展一下就能覆盖 2 态，**不需要单独的 DR-46 diff 方法论**。

**2 态和 ≥3 态的唯一区别**：≥3 态能看"单调性"（base→cur→throttle 是否单调下降），2 态只能看"涨/跌"（baseline→current 涨了多少）。但判定逻辑本质相同。

## 必读文档

- `docs/prism/memory/methodology/multi-state.md` — DR-43 draft（当前只讲三态演化）
- `docs/prism/memory/methodology/single-state.md` — DR-42 draft（单态判定）
- `docs/prism/memory/methodology/README.md` — 方法论统一索引

## 任务

### 需求 A：DR-43 扩展覆盖 2 态

**文件**：`docs/prism/memory/methodology/multi-state.md`

当前 DR-43 只讲"三态演化"，需要补一段"2 态是 N=2 的特例"：

在"多态判定方法论"节加：
```
### 2 态多态（diff，N=2 的特例）

2 态多态是 N=2 的多态，判定方法论与 ≥3 态本质相同，只是"演化趋势单调性"退化为"涨/跌"：

| 维度 | ≥3 态（已有） | 2 态（本节新增） |
|---|---|---|
| 业务涨幅 | foldChange ≥ 2 + 演化趋势（单调性） | foldChange ≥ 2 + 绝对增量 ≥ p50 的 1%（防"从 0.01 涨到 0.05 涨 5 倍但无意义"） |
| 红线触发 | foldChange ≥ 2 + perFrameMs 显著 | foldChange ≥ 2 + perFrameMs 占 p50 ≥ 5% |
| GPU-bound | 三态 wait slice 重叠演化 | 基线→当前 wait slice 增量归因 |
| 降频 | 三态 reach 演化（单调下降） | 基线→当前 reach 变化（涨/跌） |
| 叙事 | 演化型（健康→病态） | 演化型（基线→当前） |
```

在"多态叙事结构"节加 2 态版：
```
### 2 态叙事结构（基线→当前）

§0 结论先行（2 态版，三大对比结论）
  ① 最大涨幅模块: foldChange top 1 + 绝对增量 + 占当前 p50%
  ② 新出现瓶颈: 基线无 + 当前触红线
  ③ 退化形态: 基线健康态 → 当前病态的形态变化

§1 采集元信息（2 态: 基线/当前 fps/p50/帧数对照表）
§2 多线程宏观（2 态: 基线/当前 run/sleep 对照 + 涨幅）
§3 主线程一帧时间去向（2 态: callTree 对照 + 红线矩阵 foldChange 列 + 下钻）
§4 ROI 优化方向（2 态: 按 foldChange × 占 p50% 排序，优先治涨幅最大的回归）
```

### 需求 B：2 态措辞模板

在"多态措辞模板"节加 2 态版：
```
| 场景 | 2 态措辞 |
|---|---|
| 形态变化 | "从基线的 X 到当前的 Y——核心增量是 Z" |
| 涨幅 | "当前比基线涨 ×N.N" |
| 增量归因 | "Sleep 增量 NNpp 中约 XX% 来自等 GPU" |
| 回归 | "基线在健康档（p50 < 预算），当前超预算——这是回归" |
```

### 需求 C：方法论索引更新

**文件**：`docs/prism/memory/methodology/README.md`

更新索引，说明 DR-43 覆盖 2 态和 ≥3 态：
```
- DR-43 多态分析方法论（统一覆盖 2 态和 ≥3 态）
  - 2 态（diff）：相对倍数 + 绝对增量，叙事"基线→当前"
  - ≥3 态：相对倍数 + 演化趋势单调性，叙事"健康→病态"
```

## 硬约束

1. **不新建 DR-46**：2 态和 ≥3 态统一用 DR-43，不单独开 DR-46 diff 方法论
2. **2 态是 N=2 的特例**：判定逻辑本质相同，只是"单调性"退化为"涨/跌"
3. **绝对增量阈值防误判**：foldChange ≥ 2 但绝对增量 < p50 的 1% 不算回归（防"从 0.01 涨到 0.05 涨 5 倍但无意义"）
4. **不硬编码业务名**：方法论用通用占位符

## 验收 harness（必填，开发 agent 完成前自己跑通）

**工单特定断言**：
```bash
# 1. multi-state.md 含 2 态覆盖
grep -c "2 态\|N=2\|diff" docs/prism/memory/methodology/multi-state.md
# 期望 ≥3

# 2. multi-state.md 含绝对增量阈值
grep -c "绝对增量" docs/prism/memory/methodology/multi-state.md
# 期望 ≥2

# 3. README.md 索引更新
grep -c "2 态\|N=2" docs/prism/memory/methodology/README.md
# 期望 ≥1
```

**端到端冒烟**：本工单是纯方法论改动，不跑报告。但要把更新后的 multi-state.md 给主 agent 看，确认能指导 unity 2 态多态报告。

## 完成标准

1. 工单特定断言全 PASS
2. DR-43 multi-state.md 扩展覆盖 2 态，判定逻辑清晰
3. README.md 索引更新
4. 把改动清单告诉主 agent

---

## 主 agent 验收清单

1. 读 multi-state.md 确认 2 态覆盖完整（判定 + 叙事 + 措辞）
2. 确认"绝对增量阈值"防误判逻辑清晰
3. 确认 README.md 索引更新
4. 任一不通过 = 打回

## 注意事项

- **本工单是 unity 多态接入的前置**：unity diff（VG baseline vs current）需要 DR-43 扩展后的方法论指导
- **不新建 DR-46**：用户明确"diff 就是 2 multi 就是多，统一都认为 single 以上的就都是 diff 或者 multi"
- **2 态和 ≥3 态的唯一区别是单调性**：≥3 态能看单调性，2 态只能看涨/跌，但判定逻辑本质相同
