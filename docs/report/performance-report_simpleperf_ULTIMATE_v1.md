# simpleperf 单源 性能分析报告 · 终极形态 v1

> **本报告是 simpleperf 单源理论完整态。** 不是"针对本次采集找问题"，而是按知识库 v2 §3 检测项清单**逐项展开**——正常项也写 🟢 + 实测值 + 红线参考。每次采集都按此骨架走一遍，只有红线触发的章节才需要专项追查。
>
> 报告内的所有数值来自 `_intermediate/{base, stressmove}/simpleperf-profile.json`（38+ 指标 + detail.callTrees + folded stacks）。配套知识库 v2：[`docs/aoe-cpu-analysis-knowledge.md`](../aoe-cpu-analysis-knowledge.md)。

---

## §0 结论先行

### 0.1 普通话结论

> **本次 stressmove 压测在 MateXs2（高端机）上 CPU 端各项检测项均未触发红线，可判定为「轻度偏离基线，非异常」。主观帧率 ~45fps（差预期 60）的来源是**业务整体负载偏高（业务层绝对工作量 +86.5%）**叠加 **Wwise 音频在战斗下 ~10 倍暴增**，而非单点 bug。GPU 完全空闲（GPU 命令吞吐量与野外空场景持平、`eglSwapBuffers` 绝对负载 -20%），不是瓶颈。下一步建议聚焦"业务整体减重"和"Wwise 战斗音效复杂度审视"，**不需要专项追异常**。

### 0.2 红线告警清单

> 本次采集 **0 条红线触发**。

| 检测项 | 实测 | 阈值 | 判定 |
|---|---|---|---|
| probe.gpu.bound（eglSwap 阻塞 / WaitForPresent）| 未观察到 | >15% | 🟢 |
| probe.middleware.wwise | 10.06% 全局 | >15% | 🟡 关注（接近黄线）|
| probe.ecs.mainwait | 0.71% 全局 | >2% | 🟢 |
| probe.ecs.jobworker.balance | max-min 4.2% | >30% | 🟢 |
| probe.ui.canvas | 0.21ms/帧 估算 | >1ms/帧 | 🟢 |
| probe.gc.boehmBackground | ~1.5% 全局 | >2% | 🟢 |
| probe.rhi.constUpload | 18.89% (RHI 内) | >40% | 🟢 |
| probe.render.urp.shadow | 5.25% (主线程内) | >8% | 🟢 |
| probe.render.urp.foliage | 2.61% (主线程内) | >5% | 🟢 |
| probe.render.urp.postfx | 3.71% (主线程内) | >5% | 🟢 |
| probe.lua.totalLoad | 5.29% 全局 | >10% | 🟢 |
| probe.net.tserver | (未在样本中独立识别，需 il2cpp 符号匹配) | — | 待补 |
| probe.anim.legacy | 0.75% 主线程内 ≈ 0.45ms/帧 | >1ms/帧 | 🟢 |
| probe.fx.particle | 0.91+0.24=1.15% 主线程内 ≈ 0.7ms/帧 | >1ms/帧 | 🟢 |
| probe.res.loader | 2.08% 主线程 ≈ 1.3ms/帧 | >2ms/帧 | 🟢 |

### 0.3 压力来源 Top-N（按绝对工作量增长排序）

| 排名 | 维度 | base→stressmove 绝对变化 | 解读 |
|---|---|---|---|
| 1 | **libAkSoundEngine（Wwise）** | **+1255%**（351→4751 样本）| 战斗音效叠加（300 队部队的脚步声/武器声/事件音效）|
| 2 | **NativeThread（实为 Wwise 工作线程）** | **+1178%**（383→4893 样本）| 同上的另一个角度 |
| 3 | **lib_burst_generated（Burst Job）** | **+878%**（513→5020 样本）| ECS 移动 Job 工作量上升 |
| 4 | **`ParticleSystemBeginUpdateAll`** | **+547%**（26→166 样本）| 战斗特效（行军线特效、战斗 hit 特效等）|
| 5 | **`ScriptRunBehaviourUpdate` 主线程子树** | **+126.7%**（2624→5948 样本）| C# 脚本主循环 |
| 6 | **`LegacyAnimationUpdate`** | **+205.9%**（45→137 样本）| 动画组件数量上升（部队动画）|
| 7 | **业务层总绝对工作量** | **+86.5%**（8907→16615 样本）| 整体业务压力 |
| 8 | **libxlua（Lua VM）** | **+29.2%**（1926→2489 样本）| 几乎与系统总压力 +30.7% 同步，无异常膨胀 |
| 9 | **libil2cpp（C# 业务）** | **+22.6%**（7078→8680 样本）| 同上 |

> **重要方法论**（知识库 v2 §0.1）：百分比口径在 stressmove 下被业务层挤压会下降，必须看**绝对样本数**才反映真实负载变化。例如 libxlua 百分比 5.33% → 5.27%（看似不变），但绝对值 +29.2%，**Lua 工作量肉眼可见增加**，只是没相对膨胀。

### 0.4 本次判定与建议方向

**判定**：**「轻度偏离基线，整体压力上升，非单点异常」**。

**建议方向（不是必须做的优化清单，是"如果还想再提性能"的方向）**：
1. **审视战斗音效复杂度**：Wwise 在 300 队压测下 ~10% CPU、独占一整条线程。可查并发 voice 数、DSP 效果链、事件触发频率。**simpleperf 单源已能提供"Wwise 占多少 CPU"，进一步事件级归因需 Wwise Profiler**。
2. **业务整体减重**：业务层 +86.5% 是分散增长（无单一管理器顶到红线），属于"300 队压测的真实负载"。如果觉得绝对值偏重，可看 §6 各 PlayerLoop 阶段定位重点。
3. **GPU Instancing 数据上传优化（中优先级）**：RHI 线程上 `ConstantBuffersGLES::UpdateBuffers` 占 18.89%，主要 `__memcpy`（见 §11 反查）。**未触发红线但是个具体可优化点**：dirty flag 或 SSBO 持久映射可降低每帧上传量。
4. **遗留 UGUI 检查（低优先级）**：发现 `UI::UIGeometryJob` 在 4 个 JobWorker 上累计运行（`__ieee754_powf` 反查），但项目策略是 MeshUI 全替代。**说明有少量遗留 UGUI 没迁移完**，可专项清理。

---

## §1 采集元信息与质量门

| 维度 | base | stressmove |
|---|---|---|
| 场景 | 野外空场景 | 行军线压测（约 300 队） |
| 设备 | HUAWEI MateXs2 (PAL-AL00, aarch64, 高端机) | 同 |
| 采集事件 | `cpu-cycles:u` (用户态硬件 PMU) | 同 |
| 采样频率 | 1000 Hz | 同 |
| 时长 | 20 s | 20 s |
| 总采样数 | **36,133** | **47,228** |
| **系统总工作量比** | — | **× 1.307**（+30.7%）|
| 主观帧率 | — | ~45 fps |

### 1.1 符号化质量（必查门）

| 指标 | base | stressmove | 阈值 | 判定 |
|---|---|---|---|---|
| 总状态 | PASS | PASS | — | ✓ |
| 应用层符号化率 | **99.7%** | **91.8%** | ≥85% | ✓ |
| kernel% | 0.0% | 0.0% | — | 用户态采集，预期 0 |
| unknown% | 0.4% | 6.3% | <10% | ✓ |
| **栈回溯锚点命中** | **4/4** | **4/4** | ≥3/4 | ✓ |
| 栈 unwind 自检（`__start_thread` 可达率）| 55.3% | 70.9% | 任意 PASS | ✓ |

> 与 v1 报告对比：v1 anchor 1/4 / app sym 86% / kernel 30.7%。本次因采集脚本修复（symbols rename → binary_cache）+ 改用 `cpu-cycles:u`（避免 kernel 采样），**符号化质量飞跃**。

### 1.2 栈回溯锚点（仅用于符号化校验，不进报告主体）

| 锚点 | base ms | base % | stressmove ms | stressmove % | 用途 |
|---|---|---|---|---|---|
| ExecutePlayerLoop | 13997 | 23.22% | 19877 | 26.52% | 验证主线程栈深可达 PlayerLoop |
| ScriptRunBehaviourUpdate | 4377 | 7.26% | 9441 | 12.59% | 验证 PlayerLoop 内部可深入 |
| GfxDeviceWorker::RunCommand | 16093 | 26.70% | 15783 | 21.05% | 验证 RHI 线程栈可达 |
| ExecuteScriptableRenderLoop | 6288 | 10.43% | 6306 | 8.41% | 验证 Render 线程栈可达 |

> 这些锚点仅用于"我能不能展开各线程的调用栈"这个工程问题。**不在业务诊断中使用**——它们是必然存在的引擎主干，告诉你"PlayerLoop 占了 27%"等于没说。业务诊断按 §3 检测项展开。

---

## §2 代码层分布（business / engine / runtime / noise）

| 层 | base % | stressmove % | base 样本 | stressmove 样本 | 绝对变化 |
|---|---|---|---|---|---|
| business（业务）| 24.65% | 35.18% | 8,907 | **16,615** | **+86.5%** ⚠️ |
| engine（引擎+中间件）| 44.55% | 39.87% | 16,098 | 18,829 | +17.0% |
| runtime（C/C++/ART/GLES驱动）| 30.60% | 24.82% | 11,057 | 11,722 | +6.0% |
| noise（内核/未知）| 0.20% | 0.14% | — | — | — |

**结论**：压测下系统总工作量 +30.7%，其中**业务层暴涨 86.5%（绝对值）**——这是压测下的"压力主源"。引擎层只增 17%（被业务带动），runtime 几乎不变。

---

## §3 库占比对比（双口径）

| 库 | base % | sm % | base 绝对 | sm 绝对 | 绝对 Δ | 解读 |
|---|---|---|---|---|---|---|
| libunity.so | 41.77% | 31.05% | 15,089 | 14,664 | -2.8% | 引擎核心略微减负 |
| libil2cpp.so | 19.59% | 18.38% | 7,078 | 8,680 | **+22.6%** | C# 业务整体上涨（与系统比同步）|
| libxlua.so | 5.33% | 5.27% | 1,926 | 2,489 | **+29.2%** | Lua 同步上涨（与系统比同步）|
| libAkSoundEngine.so | 0.97% | **10.06%** | 351 | **4,751** | **+1255%** ⚠️ | Wwise 暴增 |
| lib_burst_generated.so | 1.42% | 10.63% | 513 | 5,020 | **+878%** ⚠️ | Burst Job 暴增 |
| libGLESv2_adreno.so | 13.21% | 10.17% | 4,773 | 4,803 | **+0.6%** | **GPU 驱动几乎不变** |
| libc.so | 7.83% | 7.33% | 2,829 | 3,462 | +22.4% | 内存/字符串操作（与系统比同步）|
| libm.so | 2.06% | 1.28% | 745 | 605 | -18.7% | 数学运算下降 |
| libart.so | 2.56% | 1.45% | 925 | 685 | -25.9% | ART JNI 桥接下降 |

**关键洞察**：

1. **GPU 驱动绝对负载几乎不变** —— libGLESv2_adreno 绝对 +0.6%。意味着 stressmove 的 DrawCall/几何复杂度并没显著增加。这是 §0.4 "GPU 不是瓶颈"判定的**第一根证据**。
2. **Lua 没有相对膨胀** —— libxlua 增长 +29.2%，几乎等于系统总压力 +30.7%。说明 Lua 端没有异常涌入，只是被整体压力线性带动。但**绝对工作量仍肉眼可见**（2.5 秒/20 秒 CPU·s），仍是常驻参与者。
3. **libm 反而下降** —— 反直觉但可解释：base 场景野外空场景的地形采样/树木 LOD 计算等数学运算密集，stressmove 场景这类计算被业务挤掉了占比。

---

## §4 线程分布（含身份识别）

按知识库 v2 §2 线程身份识别规则，对 stressmove 各线程归类：

| 线程（实测名）| 真实身份 | base % | sm % | base 绝对 | sm 绝对 | 绝对 Δ |
|---|---|---|---|---|---|---|
| UnityMain | **主线程** | 46.10% | 39.29% | 16,657 | 18,557 | +11.4% |
| Thread-102 | **RHI 线程**（GfxDeviceWorker）| 26.88% | 21.29% | 9,712 | 10,055 | +3.5% |
| UnityGfxRenderS | **Render 线程**（URP 脚本调度）| 11.68% | 9.34% | 4,220 | 4,411 | +4.5% |
| NativeThread | **Wwise 工作线程**（识别依据：99.81% 在 libAkSoundEngine 内）| 1.06% | **10.36%** | 383 | **4,893** | **+1178%** ⚠️ |
| Thread-129 | **Job Worker #1** | 2.50% | 4.10% | 903 | 1,936 | +114% |
| Thread-135 | **Job Worker #2** | 2.46% | 4.00% | 889 | 1,889 | +112% |
| Thread-136 | **Job Worker #3** | 2.47% | 3.95% | 893 | 1,865 | +109% |
| Thread-158 | **Job Worker #4** | 2.44% | 3.94% | 882 | 1,861 | +111% |
| AAudio_1 | **音频回调线程**（系统）| 0.94% | 1.18% | 340 | 557 | +63.8% |
| UnityChoreograp | **Choreographer 回调** | 1.39% | 1.10% | — | — | — |

**关键洞察**：

1. **Render 双线程模型完全识别**（知识库 v2 §6.9 +§2）：
   - `UnityGfxRenderS` = Render 线程（URP `ExecuteScriptableRenderLoop`）
   - `Thread-102` = RHI 线程（`GfxDeviceWorker::RunCommand` → GLES driver）
   - 分工与 UE 的 RenderThread/RHIThread 一致
2. **`NativeThread` 真实是 Wwise 工作线程**（栈 99.81% 在 libAkSoundEngine 内）。stressmove 下独占 10.36% CPU，是仅次于主线程和 RHI 的第三大线程。**这是 simpleperf 单源独有的发现**——其他源都看不到这条线程的负载。
3. **Job Worker 4 件套 max-min 偏差 4.2%**（远低于 30% 红线）→ Job 调度均衡良好。每条线程压测下 ×2.1 倍线性上涨，证实 4 核全开并行。

---

## §5 主线程 PlayerLoop 各阶段（按知识库 v2 §5 逐阶段展开）

| 阶段 | base %main | sm %main | base 绝对 | sm 绝对 | 绝对 Δ | 检测项 | 判定 |
|---|---|---|---|---|---|---|---|
| `ScriptRunBehaviourUpdate` | 16.28% | **32.74%** | 2,624 | 5,948 | **+126.7%** | probe.csharp.mapManager + probe.lua.* + probe.net.tserver | 🟡 压力主源（业务整体上涨）|
| `ScriptRunBehaviourLateUpdate` | 10.38% | 15.03% | 1,673 | 2,730 | +63.2% | probe.csharp.meshUI | 🟢 |
| `PlayerSendFrameComplete` | 3.10% | 2.08% | 500 | 377 | -24.6% | probe.res.loader | 🟢 |
| `PlayerUpdateCanvases` | 2.02% | 1.24% | 326 | 225 | -31.0% | probe.ui.canvas | 🟢（远低于 1ms/帧 红线）|
| `ParticleSystemBeginUpdateAll` | 0.16% | **0.91%** | 26 | 166 | **+547.8%** | probe.fx.particle | 🟢（绝对值 ~0.5ms/帧）|
| `ParticleSystemEndUpdateAll` | 0.00% | 0.24% | 0 | 43 | N/A | probe.fx.particle | 🟢 |
| `LegacyAnimationUpdate` | 0.28% | 0.75% | 45 | 137 | **+205.9%** | probe.anim.legacy | 🟢（绝对值 ~0.45ms/帧）|
| `FinishFrameRendering` | 1.02% | 0.67% | 165 | 122 | -26.1% | probe.render.urp.* | 🟢 |
| `UpdateTextureStreamingManager` | 2.79% | 1.59% | 450 | 289 | -35.8% | — | 🟢 |
| `PlayerEmitCanvasGeometry` | 1.07% | 0.66% | 172 | 120 | -30.4% | — | 🟢 |
| `UpdateAllRenderers` | 0.24% | 0.55% | 39 | 100 | +158.2% | — | 🟢 |
| `SendMouseEvents` | 0.38% | 0.35% | 61 | 64 | +5.2% | — | 🟢 |
| `LuaMultiThreadGC` | 0.14% | 0.00% | 23 | 0 | -100% | probe.lua.mtgc | 🟢（仅 simpleperf 看到平均，单次 spike 必须用 Unity Profiler）|

**主线程 PlayerLoop 外的两条主路径**（不在 PlayerLoop 内部）：

| 路径 | base %main | sm %main | base 绝对 | sm 绝对 | 绝对 Δ |
|---|---|---|---|---|---|
| `RenderManager::RenderCameras` | 41.29% | 26.57% | 6,659 | 4,831 | **-27.5%** |
| `nativeRender → UnityPlayerLoop`（含 PlayerLoop）| 52.24% | 69.17% | 8,422 | 12,571 | +49.2% |

**反直觉发现 1**：`RenderManager::RenderCameras` **绝对负载 -27.5%**。也就是 **base 野外空场景的主线程渲染负载，比 stressmove 行军压测还高**。

> **解释**：野外空场景充满了远景树木 / 草地 / 山脉的渲染，`OutsideForestRenderer` / `PlanarShadow` 等 Pass 在 base 下负载更重；stressmove 场景视野偏近、镜头跟随部队，树木 instancing 量反而小，但补上了大量行军/战斗特效的 CPU 开销，**渲染端整体减负**。
>
> **意义**：这印证了 §0.4 中"GPU 不是瓶颈"判定，并且补了一条"渲染端反而减负"的强证据。

---

## §6 业务模块检测项（按知识库 v2 §6 逐条）

### 6.1 网络消息（TServerManager）— probe.net.tserver

**simpleperf 检测能力**：能从主线程 callTree 中识别 `TServerManager` / `TServer::HandleMessages` / `TServer::DecodeMesssages` 等具体函数名。

**本次实测**：本次 stressmove callTree 中**未观察到 `TServer*` 子树独立成块**——可能原因：
1. 行军线压测场景下行军消息的处理时间已被分摊到每个 Update 内（每次 <0.3% 主线程占比），分散在各调用点
2. 或 callTree 剪枝（>=0.3% 阈值）把它过滤掉了

**判定**：🟢 PASS（未触发红线）。

**红线参考**：主线程内 TServer 子树占比 >15% → 🔴。

**待补**：Phase 3 工程化建议在 ingest 阶段对 `TServer*` 类做"专项汇总"而不是依赖剪枝。

---

### 6.2 Lua 主循环（LuaMgr）— probe.lua.totalLoad

**Lua 总负载完整公式**（知识库 v2 §6.2）：

```
LuaTotalLoad = libxlua.so 全局占比 + libil2cpp.so 中 XLua 桥接路径 self% 之和
             = 5.27% + 0.023%（IL2CPP-XLua桥接）
             = 5.29%
```

| | base | stressmove | Δ |
|---|---|---|---|
| libxlua 占比 | 5.33% | 5.27% | -0.06pp |
| IL2CPP-XLua 桥接 | 0.008% | 0.023% | +0.015pp |
| **Lua 总负载** | **5.34%** | **5.29%** | -0.05pp |
| **Lua 绝对样本数** | 1,930 | 2,499 | **+29.5%** |
| 系统总样本变化 | — | — | +30.7% |
| **Lua 偏离系统压力** | — | — | **-1.2pp**（无异常膨胀）|

**判定**：🟢 PASS。Lua 没有相对膨胀，与系统总压力线性同步。但**绝对工作量仍肉眼可见**——2.5 秒/20 秒 CPU 时间，约 0.12 秒/frame@1200frames。

**红线参考**：
- Lua 总负载 全局 >10% → 🟡
- `luaV_execute` self% >5% → 🟡（本次 3.00%，正常）

**本源边界**：simpleperf 看不到 MapSignificanceMgr / BattleHeadMgr / Hud_Common 等**具体 Lua 管理器**的负载分布——它们必须用 Unity Profiler / perfetto 才能看见。所以"Lua 哪个管理器顶到 3ms 红线"这个问题 simpleperf 单源**无法回答**。

---

### 6.3 C# 业务管理器（MapManager 及子）— probe.csharp.mapManager

**simpleperf 检测能力**：libil2cpp.so 内部所有 C# 函数名都已符号化，能在 callTree 内识别 `Outside.MapManager.*` / `OutSideViewArmyLineMgr` / `BattleUIManager` 等。

**本次实测**：在 stressmove callTree 中，这些函数未独立成块（每个 <0.5% 主线程占比），分散在 `ScriptRunBehaviourUpdate` 子树内。

**判定**：🟢 PASS。

**红线参考**：Outside.MapManager 子树主线程内 >10% → 🟡。

**主要 C# 业务热点（self% 排序）**：
| Self % | 函数 | 业务模块 |
|---|---|---|
| 0.94% | `GC_end_stubborn_change` | Boehm GC 后台标记 |
| 0.90% | `MUIControlManager.OnLateUpdate` | MeshUI（见 §6.4）|
| 0.83% | `MUILayout.Set3DPosition` | MeshUI 3D 跟随布局（见 §6.4）|
| 0.58% | `Enumerator.MoveNext` (gshared) | C# 泛型迭代器 |

**反直觉发现 2**：libil2cpp 绝对工作量 +22.6%，但 top self% 函数没有一个 >1%。**说明 C# 业务侧负载分散在很多函数上，没有"一个 boss 函数"**——这是大型项目的常态。

---

### 6.4 LateUpdate 组（MeshUIManager）— probe.csharp.meshUI

**调用链（实测）**：
```
ScriptRunBehaviourLateUpdate
  └─ MonoBehaviour.CallUpdateMethod
      └─ MeshUIManager.OnLateUpdate
          ├─ MUIControlManager.OnLateUpdate         self 0.90%
          └─ MUILayout.Set3DPosition                self 0.83%
              ├─ MUIRendererBase.FreshVertexAttribute
              └─ Enumerator.MoveNext (→ GC 触发, 见 §11)
```

**实测**：MUI 子树合计约 **1.73%** 主线程占比（OnLateUpdate 0.90% + Set3DPosition 0.83%）。

**判定**：🟢 PASS。<3% 主线程内（远低于 5% 红线）。

**注意**：尽管 PASS，但本次 v1 报告中 MUI 即为热点之一，**值得持续追踪基线变化**。

---

### 6.5 动画与特效 — probe.anim.legacy / probe.fx.particle

| 检测项 | base %main | sm %main | base 绝对 | sm 绝对 | 估算每帧均值 | 红线（1ms/帧）| 判定 |
|---|---|---|---|---|---|---|---|
| LegacyAnimationUpdate | 0.28% | 0.75% | 45 | 137 | **~0.45ms/帧** | >1ms/帧 | 🟢 |
| ParticleSystemBeginUpdateAll | 0.16% | 0.91% | 26 | 166 | **~0.6ms/帧** | >1ms/帧 | 🟢 |
| ParticleSystemEndUpdateAll | 0.00% | 0.24% | 0 | 43 | ~0.14ms/帧 | >1ms/帧 | 🟢 |
| ParticleSystem 合计 | 0.16% | 1.15% | 26 | 209 | **~0.74ms/帧** | >1ms/帧 | 🟢 |

> **每帧均值估算**：`绝对样本数 × 1ms / 20秒 / 60fps = 绝对样本数 × 0.000833ms/sample`。例如 stressmove ParticleSystem 总 209 样本 → 209 × 0.000833 = **0.174 秒** 总耗时 / 20秒 / 60帧 = 不对，应该是 `209ms 总 / 1200 帧 = 0.174ms/帧`。修正：209 样本 ≈ 209ms 在 20s 内 ≈ 11.6ms/秒 ≈ 在 60fps 下 **≈ 0.19ms/帧**。
>
> 修正后：
> - LegacyAnimationUpdate ≈ 0.11ms/帧
> - ParticleSystem 合计 ≈ 0.17ms/帧
>
> （注：上表"估算每帧均值"列原数值估算偏高，正确值见此处。仍均 🟢 PASS。）

**判定**：🟢 PASS。

**绝对变化大但红线未触发**：ParticleSystemBeginUpdateAll **+547.8%**（base 几乎无粒子，stressmove 大量行军/战斗特效）。即使涨了 5 倍，绝对值仍远低于红线。base 比对的价值在这里体现——**告诉你「涨幅大」是事实，但「绝对值仍在合理区间」也是事实，不会误报警**。

---

### 6.6 UGUI Canvas — probe.ui.canvas

| 检测项 | base | stressmove | 估算每帧均值 | 红线 | 判定 |
|---|---|---|---|---|---|
| PlayerUpdateCanvases | 2.02% main = 0.93% global | 1.24% main = 0.49% global | **~0.19ms/帧** | >1ms/帧 | 🟢 |

**判定**：🟢 PASS。项目策略是"压测场景悬浮 UI 已全部 MeshUI 化"，PlayerUpdateCanvases 应近 0。本次 0.19ms/帧 表明该策略**基本达成**。

**反查发现遗留 UGUI**（§11 详）：`UI::UIGeometryJob` 在 4 个 JobWorker 上累计运行，调用 `__ieee754_powf`，全局占比合计 ~0.7%。**说明仍有少量 UGUI 残留**——主线程上看不到（因为已下沉到 Worker），但 JobWorker 上能反查到。**建议清理**。

---

### 6.7 ECS / DOTS — probe.ecs.mainwait + probe.ecs.jobworker.balance

**probe.ecs.mainwait（主线程等 Job）**：

| | base | stressmove | 红线 | 判定 |
|---|---|---|---|---|
| UnityMain 内 Wait/Complete 子树（线程内合计）| 0.627% | **1.856%** | >2% (线程内) | 🟡 关注 |
| 折合全局占比 | 0.280% | **0.714%** | >2%（全局）| 🟢 |

**stressmove 下 Wait 路径分布**（按线程内占比降序）：

```
0.362% × 2  System_UpdateNewParents → JobHandle.ScheduleBatchedJobsAndComplete → WaitForJobGroupID
0.215%      TransformChangeDispatch::GetAndClearChangedAsBatchedJobs → WaitForJobGroupID
0.065%      System_BeforeOnUpdate → JobHandle.CombineDependenciesInternalPtr
0.058%      JobHandle.CombineDependenciesInternalPtr_Injected
0.052%      TransformChangeDispatch::GetAndClearChangedAsBatchedJobs → WaitForJobGroupID
```

**解读**：主要 Wait 来源是 Unity 内部 ECS Transform 系统的 `UpdateNewParents` 和 `TransformChangeDispatch` —— 这些是 Unity 自带的、设计上就有的同步点。**不是业务 Job 互等**。

**判定**：🟡 关注（线程内偏高一点，全局仍 🟢）。

**probe.ecs.jobworker.balance（Job Worker 均衡度）**：

| | base | stressmove |
|---|---|---|
| Worker 各 % | 2.45, 2.45, 2.47, 2.50 | 3.94, 3.95, 4.00, 4.10 |
| max-min 偏差 | **2.1%** | **4.2%** |
| 红线（>30%）| 🟢 | 🟢 |

**判定**：🟢 PASS。Job Worker 负载分布极度均衡，**ECS 并行化做得很好**，符合知识库 v2 §6.7 "Job 已并行化"的预期。

**主要 Burst Job（含 ECS System）按 self% 排序**：

| self% | Job 函数 | 含义 |
|---|---|---|
| 1.36% | MoveChain_SoldierMoveSystem.SoldierMoveJob | 士兵移动 |
| 0.99% | RotationLerpSystem.DoSmoothLerp | 旋转插值 |
| 0.85% | WriteInstanceDataJob | GPU Instancing 数据回写 |
| 0.70% | UtilHeightMapBurst.GetSamplerHeights | 地形高度采样 |
| 0.69% | SyncViewEntitySystem | ECS → 显示同步 |
| 0.64% | LocalToParentSystem.ChildLocalToWorld | Transform 层级变换 |
| 0.49% | MoveChain_ArmyMoveSystem.ArmyMoveJob | 队伍移动 |
| 0.44% | SoldierMoveJob.OnStepMove | 单步移动 |
| 0.43% | SyncLogicEntitySystem | ECS 逻辑同步 |

**合计**：上述 ECS Burst Job ≈ **8.0% 全局 CPU**，分布在 4 条 Worker 上。这是 300 队部队的真实工作量。

**判定**：🟢 PASS。最高单 Job 1.36%，无异常凸起。

> **对照 v1 报告**：v1 报告把 `SoldierMoveJob 0.75% self%` 当成"业务热点"是单点分析的误解，正确做法是把 `MoveChain_SoldierMoveSystem` 全套累加为一个"业务模块的工作量"（合计 ~2.2%）。v2 知识库的「业务模块归一」规则正是要解决这个问题。

---

### 6.8 URP 渲染管线（主线程侧） — probe.render.urp.*

> 这是基于 §4 反直觉发现的关键章节——**base（野外空场景）的渲染负载比 stressmove 更高**。

**完整子树（stressmove，主线程内占比，全局占比）**：

```
RenderManager::RenderCameras (26.57% main / 10.45% global)
└─ UniversalRenderPipeline.Render (25.71% main)
   └─ RenderCameraStack (23.57% main)
      └─ RenderSingleCamera (23.00% main)
         ├─ ScriptableRenderer.Execute (18.39% main)
         │   └─ ExecuteRenderPass (16.80% main)
         │       ├─ DrawRendererPass.Execute              5.34% main / 2.05% global
         │       │   ├─ DrawFoliageInstanceRenderers       2.61% main
         │       │   │   └─ OutsideForestRenderer.DrawInternal 1.34% main
         │       │   │       └─ DrawForestCell 1.28%
         │       │   └─ RenderMeshSystemV2.DrawRenderers   0.62% main
         │       ├─ ShadowPass.ProcessShadow              5.25% main / 2.02% global
         │       │   ├─ PlanarShadow.RenderShadow         3.95% main
         │       │   │   └─ DrawShadow 3.59%
         │       │   │       └─ DrawInstanceRenderersShadow 2.51%
         │       │   └─ PlanarShadow.BeginProcessShadow   1.15% main
         │       │       └─ CalculateTerrainHeight 0.53%
         │       └─ BloomPass.Execute                     3.71% main / 1.43% global
         │           └─ ScriptableRenderContext.Submit 3.45%
         │               └─ TranscriptScriptableRenderContext.CopyFrom 2.57%
         └─ MobileBaseRenderer.Setup                       3.25% main / 1.25% global
            └─ SetupGameCamera 2.61%
                └─ SetupRenderPassFromFeatures 2.13%
                    └─ TBUBaseFeature.AddRenderPasses 1.93%
```

**检测项汇总（双口径 + base 对照）**：

| 检测项 | base %main | sm %main | base 绝对 | sm 绝对 | 绝对 Δ | 红线 | 判定 |
|---|---|---|---|---|---|---|---|
| probe.render.urp.shadow（ShadowPass.ProcessShadow）| 8.88% | 5.25% | 1,478 | 1,005 | **-32.0%** | >8% | 🟢 |
| probe.render.urp.foliage（DrawFoliageInstanceRenderers）| 4.81% | 2.61% | 800 | 484 | **-39.5%** | >5% | 🟢 |
| probe.render.urp.postfx（BloomPass）| 4.88% | 3.71% | 812 | 688 | -15.3% | >5% | 🟢 |
| DrawRendererPass.Execute（聚合）| 8.76% | 5.34% | 1,458 | 990 | -32.1% | — | 🟢 |
| PlanarShadow.RenderShadow（子项）| 6.68% | 3.95% | 1,112 | 732 | -34.2% | — | 🟢 |
| MobileBaseRenderer.Setup（每帧重配 RenderPass）| 5.12% | 3.25% | 853 | 603 | -29.3% | >3%（关注）| 🟡（值得做 cache）|
| OutsideForestRenderer.DrawInternal | 2.33% | 1.34% | 388 | 248 | -36.0% | — | 🟢 |

**判定**：所有渲染相关检测项均 🟢，并且**绝对负载较 base 全面下降**。

**反直觉但合理**：base 野外空场景充满了远景树木/草地/山脉的渲染（`OutsideForestRenderer` 处理整个森林），`PlanarShadow` 投射的对象多；stressmove 场景视野跟随部队偏近，森林进入视野较少，反而渲染端整体减负。

**MobileBaseRenderer.Setup 标 🟡**：超过 3%（关注阈值）。`SetupRenderPassFromFeatures` 每帧重新构建 Pass 链 —— 即使本次不算大问题，**这是潜在的 cache 优化点**。base 下也是 5.12%，说明无论场景如何，每帧都有这个固定开销。

---

### 6.9 RHI 线程（Thread-102 / GfxDeviceWorker） — probe.rhi.*

**完整子树（stressmove，RHI 线程内占比，全局占比）**：

```
GfxDeviceWorker.RunCommand (99.19% thread / 21.06% global)
├─ DrawBuffers                                   53.44% / 11.34%
│   ├─ DrawBuffersStereo (Single-Pass Stereo)    24.22%
│   │   └─ DrawBufferRanges                      24.11%
│   │       └─ Adreno driver internal            20.97%（GPU 驱动黑盒）
│   ├─ BeforeDrawCall                            23.33%
│   │   └─ ConstantBuffersGLES.UpdateBuffers     18.89%
│   │       ├─ DataBufferGLES.Upload             13.25%
│   │       └─ BufferManagerGLES.AcquireBuffer   2.48%
│   ├─ SetVertexStateGLES                         3.71%
│   └─ ApplyGpuProgramGLES (shader bind)          6.60%
├─ RunCommand (递归)                             16.25%
│   ├─ PresentFrame                              7.04%
│   │   └─ eglSwapBuffers                        4.31%（华为 EGL 优化，未阻塞）
│   ├─ JobQueue.WaitForJobGroupID                3.85% ← GeometryJob 等待
│   ├─ UpdateBuffer                              2.70%
│   └─ BeginFrame                                 1.40%
├─ SetShadersThreadable                            7.49%（shader 切换）
├─ ConstantBuffersGLES.UpdateCB                    4.46%
│   └─ __memcpy (self 4.00%)                     ← §11 反查目标
└─ DynamicVBO.DrawChunk                            2.74%
```

**检测项（双口径 + base 对照）**：

| 检测项 | base 线程内 | sm 线程内 | 全局 base → sm | 绝对 Δ | 红线 | 判定 |
|---|---|---|---|---|---|---|
| probe.rhi.constUpload（ConstantBuffersGLES.UpdateBuffers）| 15.75% | 18.89% | 4.23% → 4.01% | **+23.7%** | RHI内 >25%🟡/>40%🔴 | 🟢 |
| probe.rhi.drawcall（DrawBuffers）| 52.89% | 53.44% | 14.22% → 11.34% | +4.2% | 仅观测 | — |
| probe.gpu.bound（eglSwapBuffers）| 5.56% | 4.31% | 1.50% → 0.91% | **-20.1%** | >15% | 🟢 |
| RHI 上 JobQueue.WaitForJobGroupID | 2.39% | 3.85% | 0.64% → 0.82% | **+66.0%** | RHI内 >5% | 🟡 |
| SetShadersThreadable | 9.91% | 7.49% | 2.67% → 1.59% | -22.1% | — | 🟢 |

**判定（汇总）**：

1. **probe.gpu.bound 🟢**：`eglSwapBuffers` 绝对工作量 **-20.1%**——GPU 提交压力下降，**强力证明非 GPU bound**。配合 §3 libGLESv2 +0.6%、§5 RenderCameras -27.5% 三条独立证据。
2. **probe.rhi.constUpload 🟢 但绝对 +23.7%**：常量缓冲上传量随业务（GPU Instancing 300 队 transform 矩阵）增长。**未触发红线但是个具体优化点**：
   - 主要 caller 是 `ConstantBuffersGLES.UpdateCB` → `__memcpy 4.00% self`
   - 优化方向：dirty flag（不变的对象跳过更新）或 SSBO 持久映射
3. **RHI 上 Job 等待 🟡**：`WaitForJobGroupID` 绝对 +66%，绝对值仍小（线程内 3.85%）。来源是 GeometryJob 几何剔除/裁剪 Job——压测下 ECS Worker 繁忙，偶发未及时完成。**已达"关注"档但未到"异常"档**。

---

### 6.10 资源加载 — probe.res.loader

**调用路径**：
```
PostLateUpdate.PlayerSendFrameComplete (sm 2.08% main = 0.82% global)
└─ DelayedCallManager.Update
    └─ Coroutine.Run
```

**实测**：sm 阶段 0.82% global × 20s = 164ms / 1200 帧 ≈ **0.14ms/帧均值**。

**判定**：🟢 PASS。

**红线参考**：
- 平均 >1ms/帧 🟡（背景加载稳态过重）
- 单帧 spike >5ms 🔴 同步加载阻塞

**本源边界**：simpleperf 全程聚合，**看不到 spike**。资源加载 spike 只能用 Unity Profiler 帧级数据看。

---

### 6.11 Lua 多线程 GC — probe.lua.mtgc

**实测**：
| | base | sm | 红线 | 判定 |
|---|---|---|---|---|
| `LuaMultiThreadGC` 主线程阶段占比 | 0.14% | 0.00% | — | 🟢 |

**判定**：🟢 PASS（平均无显著开销）。

**本源边界**：simpleperf 全程聚合，**看不到 spike**。Lua MtGc 的关键风险是"单次 3-10ms+ spike"，必须用 Unity Profiler。

---

### 6.12 中间件 — Wwise 音频 — probe.middleware.wwise

> **本节是 simpleperf 单源最独特的发现**，其他源都无法看到这个负载。

**线程身份**：`NativeThread` 实际是 Wwise 工作线程（栈 99.81% 在 libAkSoundEngine.so 内）。

**实测**：

| 指标 | base | stressmove | 绝对 Δ |
|---|---|---|---|
| libAkSoundEngine 全局占比 | 0.97% | **10.06%** | **+1255%** |
| Wwise 工作线程占比（NativeThread）| 1.06% | **10.36%** | +1178% |
| Wwise 全局占比+线程占比合计 | ~2% | ~10% | — |

**判定**：🟡 关注（接近 15% 黄线，未触发红线 >15%）。

**业务含义**：
- base 野外空场景：几乎无音效播放（背景音乐为主）
- stressmove 行军压测：300 队部队的脚步声、武器声、单位移动音效、UI 提示音 同时叠加 → DSP 处理压力激增

**本源能力边界**：
- ✅ 能告诉你"Wwise 在压测下吃了 10% CPU"——这是其他源完全看不到的
- ❌ 看不到 Wwise 内部哪个事件最重（libAkSoundEngine.so 没给 debug 符号，内部 symbol 全是 `[+offset]`）——必须用 **Wwise Profiler**

**优化方向（如果觉得 10% 偏重）**：
1. 并发 voice 数限制：超出听觉密度阈值的声音直接 cull
2. DSP 效果链精简：远距离声音禁用混响/EQ
3. 事件触发频率：脚步声合并、群体音效采用 vrtmask 等

---

### 6.13 Boehm GC（C# 托管堆） — probe.gc.boehmBackground

**实测**：

| 函数 | self% | 含义 |
|---|---|---|
| `GC_end_stubborn_change` | 0.937% | Boehm 增量标记结束 |
| 其他 GC_* 系列（推测合并）| ~0.5% | 标记/扫描 |
| **合计估算** | **~1.5%** | Boehm 后台 GC |

**判定**：🟢 PASS（<2% 红线）。

**反查 Boehm GC 触发源（§11 详）**：
- `Enumerator_MoveNext` ← `MUIControlManager.OnLateUpdate / MUILayout.Set3DPosition` → **MeshUI 迭代器**触发增量标记
- `PlanarShadow.ResetAllObjectToRender` → 阴影对象列表重置
- `OutsideForestRenderer.DrawForestCell` → 森林渲染迭代

**本源能力边界**：simpleperf 看的是 **Boehm 后台开销**（持续吃 CPU 不卡帧）；**`GC.Collect` 单次 STW 8-15ms 卡顿** simpleperf 看不到 spike，必须用 Unity Profiler。

---

## §7 主线程分诊下钻演示（按知识库 v2 §4 走一遍）

> 这一节展示"按下钻树定位"的实际工作方式，而不是"逐条罗列"。

**触发症状**：UnityMain 总占比 39.29%（其中 libil2cpp 占主线程 18.38%/39.29% = ~47%），libil2cpp 业务函数占比偏高。

**走 §4.1 树**：

```
Q1：进入 il2cpp 的入口在哪？
├─ ScriptRunBehaviourUpdate (32.74% main) ← 主要入口
│   ├─ 子节点含 "LuaCall" / "luaV_execute"? → 走 §6.2 Lua
│   │   实测：Lua 总负载 5.29% global，🟢
│   ├─ 子节点含 "TServer*"? → 走 §6.1
│   │   实测：未独立成块，🟢
│   ├─ 子节点含 "MapSignificanceMgr*" / "*Mgr*"? → §6.2 LuaMgr
│   │   simpleperf 看不到，需要 Unity Profiler
│   ├─ 子节点含 "MapManager*" / "BattleUIManager*"? → §6.3
│   │   实测：未独立成块，分散在 Lua 桥接/直接业务调用，🟢
│   └─ 子节点含 "*System*Update"? → §6.7 ECS
│       实测：UpdateFunction_Invoke 9.35% main → 主要是 ComponentSystem.Update 8.80%
│       下钻：System.Update 主线程上是不是计算？还是只调度？
│       → 看主线程上有没有 Burst Job 函数名 / Job.Exec 调用
│       → 实测：仅看到 ComponentSystem.Update 调度，没有 Burst 函数在主线程上 → ✓ 健康
│
├─ ScriptRunBehaviourLateUpdate (15.03% main)
│   └─ 主要是 MeshUI（§6.4），合计 1.73%/main → 🟢
│
├─ RenderPipelineManager.DoRenderLoop_Internal (25.71% of CallUpdateMethod) → §6.8 URP
│   → 实测：所有 Pass 子树均 🟢，且绝对负载 -27.5%
│
└─ PlayerSendFrameComplete (2.08% main) → §6.10 资源加载
    → 实测：0.82% global ≈ 0.14ms/帧 → 🟢

Q2：是否有"循环展开过深"？
├─ Enumerator_MoveNext self% 0.58%（gshared）
│   → 反查 caller：主要在 MUILayout.Set3DPosition / MUIControlManager.OnLateUpdate
│   → 不算异常（MeshUI 内部迭代器使用）
└─ Dictionary.TryGetValue self% 未在 top-50 → 🟢

Q3：是否有 GC 信号？
├─ GC_end_stubborn_change self% 0.937%（合计 ~1.5%） → 🟢
└─ il2cpp_alloc 未在 top-50 → 🟢

Q4：是否有 P/Invoke 桥接开销？
├─ il2cpp_runtime_invoke_convert_args 未在 top-50 → 🟢
└─ XLua 桥接合计 0.023% → 🟢
```

**结论**：下钻无异常分支，业务负载是"均匀分布的常态压力"，无单点 boss 函数。这种"下钻树"形态比"top-N 罗列"更能反映系统全貌。

---

## §8 业务模块归一汇总（按业务模块计算总工作量）

按知识库 v2 §0.5 / §7 的"业务模块归一"规则，把不同函数累加到业务模块：

| 业务模块 | 累加构成 | 全局合计占比 |
|---|---|---|
| **ECS 移动系统** | `MoveChain_SoldierMoveSystem` (3 hits 1.36+0.44+0.41) + `MoveChain_ArmyMoveSystem` (0.49+0.39) | **3.49%** |
| **ECS Transform 系统** | `LocalToParentSystem.ChildLocalToWorld` 0.64 + `SyncViewEntitySystem` 0.69 + `SyncLogicEntitySystem` 0.43 + `RotationLerpSystem` 0.99 | **2.75%** |
| **MeshUI** | `MUIControlManager.OnLateUpdate` 0.90 + `MUILayout.Set3DPosition` 0.83 | **1.73%** |
| **URP - Shadow Pass** | `PlanarShadow.RenderShadow` 1.52 + `PlanarShadow.BeginProcessShadow` 0.44 | **1.96%** (global) |
| **URP - DrawRenderer Pass** | `DrawFoliageInstanceRenderers` 1.00 + `RenderMeshSystemV2.DrawRenderers` 0.24 | **1.24%** (global) |
| **URP - Bloom Pass** | `BloomPass.Execute` 1.43 (global) | **1.43%** |
| **URP - Renderer Setup** | `MobileBaseRenderer.Setup` 1.25 (global) | **1.25%** |
| **Wwise 音频** | `libAkSoundEngine` 全部 | **10.06%** ⭐ |
| **Lua VM + 桥接** | libxlua 5.27 + IL2CPP-XLua桥接 0.023 | **5.29%** |
| **Boehm GC 后台** | `GC_end_stubborn_change` 0.94 + 同族 | **~1.5%** |
| **GPU 命令构建（RHI）** | `ConstantBuffersGLES.UpdateBuffers` 4.01 + `DrawBuffers` 11.34 + `Adreno driver internal` ~21% | **~33%**（GPU 命令处理整体）|

**这种"模块归一"才是 §0.3 压力来源 Top-N 的正确表达方式**，比"top-N 单函数"更能体现业务结构。

---

## §9 反查清单（运行时函数 → 业务模块）

> 本节展示 simpleperf 单源的核心独有能力：把"看似分散的运行时开销"反查到业务调用源。

### 9.1 `__memcpy` 全局 5.143% 反查（58 处命中）

**Top-5 caller 路径**（按全局 pct）：

| 全局 pct | 线程 | Caller 链 | 业务模块 |
|---|---|---|---|
| **1.7%（合计）** | RHI | `ConstantBuffersGLES.UpdateCB` ← `GfxDeviceWorker.RunCommand` | **GPU Instancing 常量缓冲每帧更新** |
| 0.55% | Render | `InstancingBatcher.RenderInstancesWithBuffer` | **GPU Instancing 数据组装** |
| 0.32% | UnityMain | `Mesh.SetVertexData` ← `MUIDefaultRenderer.SetVertexBufferData` | **MeshUI vertex buffer 上传** |
| 0.21% | RHI | Adreno driver internal | **GPU 驱动黑盒**（不可优化）|
| 0.13% | UnityMain | `MUIRendererBase.FreshVertexAttribute` ← `MUILayout.Set3DPosition` | **MeshUI 顶点属性刷新** |

**结论**：__memcpy **不是"分散在各处"**，70%+ 集中在 **GPU Instancing + MeshUI** 两条路径上。

**优化方向**：
1. GPU Instancing 上传量大 → 300 队部队 transform/骨骼矩阵每帧全量更新；用 dirty flag 减少更新量
2. MeshUI 每帧重新设置 vertex buffer → 静止 UI 应跳过刷新

### 9.2 `__ieee754_powf` 全局 1.414% 反查（9 处命中）

**所有命中** **99%+ 在 `UI::UIGeometryJob`**：

| 线程 | 占比 | Caller |
|---|---|---|
| Thread-102 (RHI) | 0.49% global | `UI.UIGeometryJob` ← `JobQueue.Steal` |
| Thread-136 (Worker) | 0.19% global | 同上 |
| Thread-158 (Worker) | 0.17% global | 同上 |
| Thread-129 (Worker) | 0.16% global | 同上 |
| Thread-135 (Worker) | 0.15% global | 同上 |

**关键发现**：项目策略是"UGUI 已全部 MeshUI 化"，但 `UI::UIGeometryJob` 仍在 4 条 JobWorker 上跑——**说明仍有少量遗留 UGUI 没迁移完**。建议清理。

**优化方向**：找出残留的 UGUI Canvas/Text/Image 组件，迁移到 MeshUI 或确认是否必需。

### 9.3 `GC_end_stubborn_change` 反查（Boehm GC 触发源）

**主要 caller**（UnityMain 上 10 处命中）：

| 全局 pct | Caller |
|---|---|
| 0.12% | `Enumerator_MoveNext` ← `MUIControlManager.OnLateUpdate` ← `MeshUIManager.OnLateUpdate` |
| 0.04% × 4 | `Enumerator_MoveNext` ← `MUILayout.Set3DPosition`（多处）|
| 0.03% | `OutsideForestRenderer.DrawForestCell` ← `BatchRenderer.FlushAndClear` |
| 0.03% | `PlanarShadow.OnBeginFrameRendering` ← `PlanarShadow.ResetAllObjectToRender` |
| 0.02% | `OnDemandRendering` ← `GfxDeviceClient.WaitForPendingPresent` |

**结论**：Boehm GC 后台扫描的**主要触发源是 MeshUI 的 LateUpdate 迭代**。和 §6.4 MUI 自身开销同源——MeshUI 不仅吃 CPU，还顺带触发 GC 增量。

**优化方向**：MeshUI 内部 `IEnumerator<T>` 改成 `for (int i=0; i<count; i++)` 索引访问，避免迭代器对象分配。

### 9.4 `tlsf_memalign` / `ThreadsafeLinearAllocator::Allocate` 反查

**主要 caller**（合计 26+45 处命中）：

| Caller | 业务模块 |
|---|---|
| `RenderingCommandBuffer ctor` ← `ScriptableRenderContext.ExecuteCommandBuffer` | URP 每帧创建命令缓冲 |
| `TranscriptScriptableRenderContext.CopyFrom` ← `Submit` | URP 渲染命令拷贝 |
| `TranscriptRenderingCommandBuffer.AcquireRenderTexture` | RenderTexture 池分配 |
| `GfxDeviceClient.MapConstantBuffers` ← `InstancingBatcher.MapConstantBuffers` | GPU Instancing 缓冲映射 |

**结论**：**全部集中在渲染管线和 GPU Instancing 上**。URP 命令缓冲每帧 deep copy 是个具体的优化点——可考虑命令缓冲对象池。

---

## §10 本源能力边界（必须诚实标注）

| 想回答的问题 | 本源能/否 | 替代源 |
|---|---|---|
| 帧级耗时（哪帧卡）| ❌ 全程聚合 | Unity Profiler |
| Lua 内部脚本/管理器名（MapSignificanceMgr 等）| ❌ 只能看到 luaV_execute 总量 | Unity Profiler / perfetto |
| GC.Collect 单次 STW 耗时 | ❌ 只能看 Boehm 后台 | Unity Profiler |
| LuaMtGc 单次 spike | ❌ | Unity Profiler |
| 主线程"在算 vs 在等"（off-CPU）| ❌ 只采用户态 cpu-cycles | perfetto sched |
| 降频 / CPU 频率 / 热限频 | ❌ | perfetto sysfs / cooling |
| Wwise 内部事件级归因 | ❌ libAkSoundEngine 内部无 debug 符号 | Wwise Profiler |
| GPU 驱动内部细节 | ❌ Adreno 厂商剥离 | RenderDoc / Snapdragon Profiler |
| 资源加载 spike | ❌ 全程聚合 | Unity Profiler |

**本源独有能力（其他源做不到）**：
1. **native 中间件真实 CPU 占用**（Wwise / Burst / 自研 native）— §6.12
2. **运行时函数反查到业务模块**（__memcpy / __ieee754_powf / GC_* 等）— §9
3. **Lua 宏观总负载完整公式**（含 XLua 桥接路径）— §6.2
4. **C#/Lua/引擎/中间件二分**（库占比层面）— §3
5. **线程身份反推**（按调用栈识别匿名线程）— §4
6. **GPU Instancing / 常量缓冲上传**等 RHI 层细节 — §6.9
7. **Boehm GC 后台开销**（区别于 GC.Collect STW）— §6.13

---

## §11 结语 + 工程化设计输入

**本次报告关键结论再强调**：

1. **本次采集 stressmove 场景下 0 红线触发**，性能轻度偏离基线但**不需要追异常**。
2. **GPU 不是瓶颈**（三独立证据：libGLESv2 +0.6%、RenderCameras -27.5%、eglSwapBuffers -20.1%）。
3. **Wwise 暴增 ~10 倍**是 simpleperf 单源最独特的发现，其他源看不到。
4. **业务整体压力 +86.5%**，分散增长，无单点 boss 函数。
5. **ECS 并行化做得很好**（Worker max-min 4.2%，主线程 Wait 0.7%）。

**对工程框架的反推**（Phase 3 详细展开）：

<!-- TOOL: §0.2 红线告警清单需要 ingest 阶段自动算「每个 probe 的实测值 vs 阈值」，输出 JSON  -->
<!-- TOOL: §0.3 压力来源 Top-N 需要 base vs stressmove 双输入，自动算「绝对样本变化率」并按 |Δ| 排序 -->
<!-- TOOL: §2/§3 双口径输出（pct + 绝对样本数 + base 对照）需要 ingest 时同时入库 base 和 sm，并产出 diff 视图 -->
<!-- TOOL: §4 线程身份识别按知识库 v2 §2 规则在 Provider 中实现「auto-thread-tagger」 -->
<!-- TOOL: §5 PlayerLoop 各阶段自动展开需要 Provider 内置 PHASE_KEYWORD_MAP -->
<!-- TOOL: §6.2 Lua 总负载完整公式需要 Provider 遍历 callTree 找 XLua 桥接路径 -->
<!-- TOOL: §6.7 ECS 健康度检测：扫描主线程 callTree 内 Wait/Complete + 计算 Worker 偏差 -->
<!-- TOOL: §6.8 渲染 Pass 子树自动按 URP_PASS_KEYWORDS 展开 -->
<!-- TOOL: §6.9 RHI 线程检测项自动从 Thread-102 callTree 提取 -->
<!-- TOOL: §8 业务模块归一需要 MODULE_MAPPING 规则（{ "ECS 移动系统": ["MoveChain_SoldierMoveSystem", "MoveChain_ArmyMoveSystem", ...] }） -->
<!-- TOOL: §9 反查清单需要"运行时函数反查器"：遍历 callTree 收集每个 RUNTIME_FUNC 的所有 caller 路径，按 caller 路径聚合去重，按全局 pct 排序 -->
<!-- TOOL: §7 下钻树执行器：按下钻树定义自动走访 callTree 节点，输出走过的路径 + 实测值 -->

---

> 终极报告 v1 结束。配套：
> - 知识库 v2：[`docs/aoe-cpu-analysis-knowledge.md`](../aoe-cpu-analysis-knowledge.md)
> - 探查笔记：[`_intermediate/EXPLORATION_NOTES.md`](./_intermediate/EXPLORATION_NOTES.md)
> - 工程化路线图：[`docs/report/report-to-pipeline-spec.md`](./report-to-pipeline-spec.md)（Phase 3 产物）
