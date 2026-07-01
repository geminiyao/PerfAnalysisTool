# Unity Profiler 双版本对比报告 — \<base label\> vs \<cur label\> · 金标准模板 (Hybrid v1)

> 设备 / 场景 / 采集时长 / 帧数 / target FPS
> 生成: unity-profiler-compare skill (Provider unity-diff-builder + AI 增量润色)

> **本文件是 unity-profiler-compare skill 的金标准模板**。Provider 输出骨架版即可被自评门接受；AI 润色版应在此模板基础上补充业务叙事，但**不得改任何数字 / 表格 / 状态标签 / mermaid / 章节顺序**。

---

## §0 一句话结论

**主线程帧均 26.97ms → 35.88ms (+8.91ms, 回归)；P95 35.89 → 43.88 (+7.99ms)；fps 37.1 → 27.9 (-9.2)。**

> **头号回归**: `URP.MainRenderingTransparent` ms/帧 0.77 → 2.57 (+1.79ms, +232.5%) 🔴。建议 P0 削减 transparent pass 的 drawcall 与材质切换。
>
> _AI 润色：此处可补 1-2 句业务上下文，例如"主要由 Inl_OpaquePass +369% 驱动；同期 BehaviourUpdate -2.7ms 改善但被渲染回归吃掉"。数字必须从 §3 引用，不准编造。_

---

## §1 同源性校验

| 项 | base | cur | 一致性 |
|---|---|---|---|
| target FPS | 30 | 30 | ✅ |
| 帧数 | 370 | 316 | ⚪ ratio 0.85 |
| 设备 | PAL-AL00 | PAL-AL00 | ✅ |
| 场景 | StressTestBattleSimpleMode | StressTestBattleSimpleMode | ✅ |

> 帧数比 0.5–2 视为可比。低于 0.5 或高于 2 触发 ⚠️，跨次对比需用 ms/帧 + PL%（见 [[feedback_diff_metrics]]）。

---

## §2 帧级 Δ

| 指标 | base | cur | Δ | Δ% | 状态 |
|---|---|---|---|---|---|
| mean | 26.97 | 35.88 | +8.91 | +33.0% | 🔴 |
| median | 26.08 | 33.62 | +7.54 | +28.9% | 🔴 |
| p90 | 32.88 | 41.33 | +8.45 | +25.7% | 🔴 |
| p95 | 35.89 | 43.88 | +7.99 | +22.3% | 🔴 |
| p99 | 44.36 | 83.64 | +39.28 | +88.5% | 🔴 |
| p999 | 51.22 | 106.56 | +55.34 | +108.0% | 🔴 |
| actualFps | 37.1 | 27.9 | -9.20 | -24.8% | 🔴 |
| jankCount | 0 | 2 | +2 | — | 🔴 |
| bigJankCount | 0 | 0 | 0 | — | ⚪ |

> _AI 润色：可补一句"P99 +88.5%、P999 +108%，说明 cur 出现了 base 没有的尾延爆点（见 §6 慢帧 / 波动 Δ）"。_

---

## §3 主线程业务子树 Δ (aggregatedCallTrees)

Main Thread ms/帧: 26.97 → 35.88 (+8.91ms, +33.0%) 🔴

```
└─ PlayerLoop: 26.89 → 35.78ms (+8.89ms, +33.1%) 🔴 gcΔ=+3686
  └─ PostLateUpdate.FinishFrameRendering: 6.99 → 9.53ms (+2.54ms, +36.3%) 🔴 gcΔ=+17370
    └─ URP.Render: 6.07 → 8.20ms (+2.13ms, +35.1%) 🔴 gcΔ=+17590
      └─ URP.RenderCameraStack: 5.88 → 7.85ms (+1.97ms, +33.5%) 🔴
        └─ URP.RenderSingleCamera: 5.62 → 7.44ms (+1.82ms, +32.4%) 🔴
          └─ URP.MainRenderingTransparent: 0.77 → 2.57ms (+1.79ms, +232.5%) 🔴 gcΔ=+11144
            └─ Inl_OpaquePass: 0.25 → 1.16ms (+0.91ms, +369.5%) 🔴 gcΔ=+10570
            └─ Inl_TerrainPass: 0.03 → 0.13ms (+0.10ms, +374.1%) 🔴
          └─ URP.BeforeRendering: 2.52 → 1.70ms (-0.83ms, -32.8%) 🟢
  └─ Update.ScriptRunBehaviourUpdate: 8.03 → 6.05ms (-1.98ms, -24.7%) 🟢 gcΔ=-11996
    └─ BehaviourUpdate: 8.02 → 6.04ms (-1.99ms) 🟢
      └─ AOE.dll!AOE::GameLauncher.Update(): 7.12 → 4.39ms (-2.73ms, -38.3%) 🟢 gcΔ=-11510
```

> **要点**：
> 1. 头号回归集中在 URP 渲染管线（PostLateUpdate.FinishFrameRendering 子树整体 +2.54ms）
> 2. transparent pass 是渲染回归的根因（+232%），其下 `Inl_OpaquePass` +369%、`Inl_TerrainPass` +374%
> 3. 业务侧 `Update.ScriptRunBehaviourUpdate` 反而改善 -1.98ms（gcAlloc 也下降 11996 次）
> 4. 净效果仍是回归，因为渲染回归 (+2.54) 大于业务改善 (-1.98)
>
> _AI 润色：每节点已带 ms/帧 Δ + 状态 emoji，AI 不准动这些。AI 可在缩进树后加上业务侧解释（如"transparent pass 涨可能由材质数变化导致"），但**所有数字必须引自骨架表**。_

---

## §4 各线程 (per-thread) Δ

### 1:Render Thread
| marker | selfMean base→cur | Δ | 状态 |
|---|---|---|---|
| Gfx.RenderSlaver.ThreadRun | 1.40→2.05 | +0.65ms | 🔴 |
| ForwardRenderPass | 1.21→1.85 | +0.64ms | 🔴 |
| RenderLoop.Draw | 1.09→1.48 | +0.39ms | 🔴 |

### 1:Submit Thread
| marker | selfMean base→cur | Δ | 状态 |
|---|---|---|---|
| Gfx.PresentFrame | 9.11→13.20 | +4.09ms | 🔴 |
| ForwardRenderPass | 1.69→2.41 | +0.72ms | 🔴 |

### 1:Job.Worker
| marker | selfMean base→cur | Δ | 状态 |
|---|---|---|---|
| Canvas.GeometryJob | 0.63→0.71 | +0.08ms | ⚪ |

> _AI 润色：可补一句"Submit Thread Gfx.PresentFrame +4ms 与 §3 主线程渲染回归同向，三者共同推高 P99"。_

---

## §5 GC 压力 Δ

每帧 alloc 总数: 124.20→157.10 次/帧 (+32.90, +26.5%)

| 业务子树 | gcAlloc base→cur | Δ | ms/帧 Δ |
|---|---|---|---|
| PlayerLoop▸PostLateUpdate.FinishFrameRendering | 18426→35796 | +17370 | +2.54ms |
| PlayerLoop▸PostLateUpdate.FinishFrameRendering▸URP.Render | 16950→34540 | +17590 | +2.13ms |
| PlayerLoop▸PostLateUpdate.FinishFrameRendering▸URP.Render▸URP.RenderCameraStack | 16950→34540 | +17590 | +1.97ms |
| PlayerLoop▸Update.ScriptRunBehaviourUpdate | 17828→5832 | -11996 | -1.98ms |
| PlayerLoop▸Update.ScriptRunBehaviourUpdate▸BehaviourUpdate | 17828→5832 | -11996 | -1.99ms |

> **要点**（[[methodology_gc_alloc_attribution]]）：
> - URP 渲染子树 alloc 翻倍（+17590 次/全 trace）→ 同步 GC 风险升高
> - Script 业务子树 alloc 减少 11996 次 → GC 改善
> - 净效果：每帧 alloc +32.9 次（>100 阈值边缘）
>
> _AI 润色：可点名"URP 子树 alloc 翻倍触发 GC.Collect 频次升高，与 §6 spike 对应"。_

---

## §6 慢帧 / 波动 Δ

### 新增 spike (cur 独有)
| marker | spikeRatio | selfMean |
|---|---|---|
| ParticleSystem.UpdateJob | 12.3× | 18.5ms |
| Batch.FillInstanceProperties | 54× | 4.98ms |
| BatchRenderer.Flush | 25× | 4.25ms |

### 已解决 spike (base 独有)
| marker | base spikeRatio |
|---|---|
| MeshLinePass | 57× |
| PostFXTransparentPass | 44× |

> _AI 润色：可补"cur 新增的 ParticleSystem / Batch 类爆发表明粒子/批渲染压力上升；MeshLinePass 已解决意味着上版的线渲染问题已修复"。_

---

## §7 新增 / 消失 marker

**cur 新增** (top 10): `URP.MainRenderingOpaque`, `Inl_TerrainPass`, `Inl_PostTransparentTerrainDecal`, ...

**cur 消失** (top 10): `WaitForJobGroupID`, `Semaphore.WaitForSignal`, `MeshLinePass`, ...

> _AI 润色：消失的 wait 类 marker 通常说明 job 调度路径变了；新增的 Inl_* 表明 URP 内联了某些 pass。_

---

## §8 可执行建议（按 ROI）

### P1 — 削减 URP.MainRenderingTransparent (+1.79ms/帧 回归)

- 路径: `PlayerLoop▸PostLateUpdate.FinishFrameRendering▸URP.Render▸URP.RenderCameraStack▸URP.RenderSingleCamera▸URP.MainRenderingTransparent`
- ms/帧 0.77 → 2.57 (+232.5%) 🔴
- gcAlloc Δ +11144 次/全 trace（同步 GC 风险）

> _AI 润色：可补 2-3 个业务方向，如"检查透明物体数量是否暴涨 / 透明材质 SetPass 调用次数 / GPU Instancing 是否失效"。_

### P2 — 削减 Inl_OpaquePass (+0.91ms/帧)

- 路径: `URP.MainRenderingTransparent▸Inl_OpaquePass`
- ms/帧 0.25 → 1.16 (+369.5%) 🔴
- gcAlloc Δ +10570

### P3 — 利用业务侧已改善的 -1.98ms 预算

- `BehaviourUpdate` 已减 1.99ms，下版本可用这部分预算吸收渲染回归；优先级低于削减 P1/P2

> _AI 润色：建议这一节最容易加价值。Provider 给出 top 3 degraded 节点；AI 可基于业务知识补"为什么会回归"+"如何修"。但**禁止改 ms/帧 数字 / Δ%**。_

---

## 自评门规则（机器校验）

> 此节非必备，但工程化时由 unity-compare-service 的 `validateUnityDiffQuality()` 检查：
>
> 1. 必备章节：§0 / §1 / §2 / §3 / §5 / §8 全部存在
> 2. 必引证据：含 `ms/帧` + Δ% 数字 + 状态 emoji（🔴/🟢）
> 3. 数字保护：§2 mean Δ 必须与 unity-diff-summary.json 一致（防 AI 改）
> 4. 行数门：≥金标准 78%
>
> AI 版任一项失败 → 回退 Provider 骨架版（永远能交付）。
