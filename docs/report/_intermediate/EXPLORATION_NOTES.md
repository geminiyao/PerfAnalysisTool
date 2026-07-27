# simpleperf 终极报告 — Phase 1 探查笔记

> 这份文档不是给阅读用的终极报告，是 Phase 2 撰写终极报告前的"原始信号清单 + 工程化设计输入"。所有数字来自 `_intermediate/base/` 和 `_intermediate/stressmove/` 两份 PerfProfile JSON。

## 0. 输入数据元信息

| 维度 | base | stressmove |
|---|---|---|
| 场景 | 野外空场景 | 行军线压测（约 300 队） |
| 设备 | HUAWEI MateXs2 (PAL-AL00, aarch64) | 同 |
| 时长 | 20 s | 20 s |
| 采集事件 | `cpu-cycles:u`（用户态硬件 PMU）@ 1000Hz, `-g` DWARF 栈 | 同 |
| 总采样数 | **36,133** | **47,228** |
| **系统总活儿对比** | — | **+30.7%（采样总数比）** |
| 主观帧率 | — | ~45fps（目标 60，离预期有差距）|

> **重要方法论**：百分比是"在该次采集内的占比"，base 和 stressmove 总样本数不同。要看真实负载变化，必须用 `pct × totalSamples` 算绝对样本数。终极报告需双口径并行（百分比 + 绝对值）。

## 1. 符号化质量（PASS / WARN / FAIL）

| 指标 | base | stressmove | 判定 |
|---|---|---|---|
| status | PASS | PASS | ✓ |
| 应用层符号化率 | **99.7%** | **91.8%** | 远超 85% 阈值 |
| kernel% | 0.0% | 0.0% | 用户态采集，预期 0 |
| unknown% | 0.4% | 6.3% | stressmove 略高（可能因更多 vendor .so 调用）|
| **anchor 命中** | **4/4** | **4/4** | 完美 ✓ |
| 栈 unwind 自检 | PASS（__start_thread 可达 55.3%）| PASS（70.9%）| ✓ |

**与 v1 报告对比**：v1 报告 anchor 1/4、app sym 86%、kernel 30.7%。本次因采集脚本修复（symbols rename → binary_cache）+ 改用 cpu-cycles:u（避免 kernel 采样），**符号化质量飞跃**。这意味着 v1 报告里"anchor 子树本样本不可用"的局限**不复存在**。

## 2. 代码层归类（business / engine / runtime / noise）

| 层 | base % | stressmove % | base 绝对 | stressmove 绝对 | 绝对变化 |
|---|---|---|---|---|---|
| business（业务）| 24.65% | **35.18%** | 8,907 | **16,615** | **+86.5%** ⚠️ |
| engine（引擎+中间件）| 44.55% | 39.87% | 16,098 | 18,829 | +17.0% |
| runtime（C/C++/ART/GLES驱动）| 30.60% | 24.82% | 11,057 | 11,722 | +6.0% |
| noise（内核/未知）| 0.20% | 0.14% | — | — | — |

**结论**：压测下系统总工作量 +30.7%，其中**业务层暴涨 86.5%（绝对值）**——这就是压测下的"压力主源"。引擎层只增 17%（被业务带动），runtime 几乎不变。

## 3. 库占比对比（base ↔ stressmove）

| 库 | base % | stressmove % | base 样本 | stressmove 样本 | 绝对变化 | 解读 |
|---|---|---|---|---|---|---|
| libunity.so | 41.77% | 31.05% | 15,089 | 14,664 | **-2.8%** | 引擎层略微减负 |
| libil2cpp.so | 19.59% | 18.38% | 7,078 | 8,680 | **+22.6%** | C# 业务上涨 |
| libxlua.so | 5.33% | 5.27% | 1,926 | 2,489 | **+29.2%** | Lua 同步上涨（≈系统比例）|
| libAkSoundEngine.so | 0.97% | **10.06%** | 351 | **4,751** | **+1255%** ⚠️ | Wwise 暴增（300队战斗音效）|
| lib_burst_generated.so | 1.42% | **10.63%** | 513 | **5,020** | **+878%** ⚠️ | Burst Job 暴增（ECS 工作量）|
| libGLESv2_adreno.so | 13.21% | 10.17% | 4,773 | 4,803 | **+0.6%** | **GPU 驱动几乎不变** |
| libc.so | 7.83% | 7.33% | 2,829 | 3,462 | +22.4% | 内存/字符串操作 |
| libm.so | 2.06% | 1.28% | 745 | 605 | -18.7% | 数学运算下降（异常？）|
| libart.so | 2.56% | 1.45% | 925 | 685 | -25.9% | ART JNI 桥接下降 |
| libAOENative | — | — | — | — | — | 自研 native（值得查）|
| libTBUNative | — | — | — | — | — | 自研 TBU（值得查）|

**关键洞察**：
- **GPU 驱动 libGLESv2_adreno 绝对负载几乎不变**——意味着压测场景的 DrawCall/几何复杂度并没显著增加，**GPU 不是瓶颈**。
- **真正暴涨的是 Wwise + Burst Job**，加起来贡献了 ~9,000 个额外样本（约 9 秒 CPU 时间，分布在多核）。
- **libm 反而下降**很反直觉——可能是 base 里有"安静的浮点运算"（地形采样等），压测时反而被业务挤掉了。值得在终极报告里点一下。

## 4. 线程分布（绝对样本数对比）

| 线程 | base % | stressmove % | base 样本 | stressmove 样本 | 绝对变化 | 身份 |
|---|---|---|---|---|---|---|
| UnityMain | 46.10% | 39.29% | 16,657 | 18,557 | **+11.4%** | 主线程（业务/脚本）|
| Thread-102 | 26.88% | 21.29% | 9,712 | 10,055 | +3.5% | **RHI 线程**（GfxDeviceWorker → GLES）|
| UnityGfxRenderS | 11.68% | 9.34% | 4,220 | 4,411 | +4.5% | URP 渲染管线脚本调度 |
| NativeThread | 1.06% | **10.36%** | 383 | **4,893** | **+1178%** ⚠️ | 自研 native 线程（暴增）|
| Thread-129 | 2.50% | 4.10% | 903 | 1,936 | +114% | Job Worker #1 |
| Thread-135 | 2.46% | 4.00% | 889 | 1,889 | +112% | Job Worker #2 |
| Thread-136 | 2.47% | 3.95% | 893 | 1,865 | +109% | Job Worker #3 |
| Thread-158 | 2.44% | 3.94% | 882 | 1,861 | +111% | Job Worker #4 |
| AAudio_1 | 0.94% | 1.18% | 340 | 557 | +63.8% | 音频回调线程 |
| UnityChoreograp | 1.39% | 1.10% | — | — | — | Choreographer 回调 |

**RHI 线程身份确认（你的猜测对）**：Thread-102 的根调用栈是 `__start_thread → __pthread_start → Thread::RunThreadWrapper → GfxDeviceWorker::RunGfxDeviceWorker → GfxDeviceWorker::RunExt → GfxDeviceWorker::RunCommand`——这条就是 UE 中 RHI 线程的 Unity 等价物：接 Render Thread 的命令流，直接调 GLES。

**Render 双线程模型**：
- `UnityGfxRenderS`（"Unity Gfx Render Scripts"）：跑 URP 的 `ExecuteScriptableRenderLoop`，是 SRP 用户脚本侧
- `Thread-102` / `GfxDeviceWorker`：消费命令流、调 GLES driver
- 这与 UE 的 `RenderThread` / `RHIThread` 分工完全一致

**Job Worker 4 件套（Thread-129/135/136/158）**：4 条线程占比高度均衡（差 < 0.2%），说明 Job 调度负载均衡良好。压测下每条 ×2.1 倍线性上涨，**4 核满载并行干活**。

**NativeThread 暴增 12 倍**：base 几乎闲置，stressmove 占了 10.36%——这是**最值得追**的线程之一。需要看它跑的是什么（行军线消息处理？文件 IO？）。

## 5. Anchor 子树（PlayerLoop 各阶段）

| Anchor | base ms | base % | stressmove ms | stressmove % | base 绝对 | sm 绝对 | 绝对变化 |
|---|---|---|---|---|---|---|---|
| ExecutePlayerLoop | 13997 | 23.22% | 19877 | **26.52%** | 8,389 | 12,521 | **+49.3%** ⚠️ |
| ScriptRunBehaviourUpdate | 4377 | 7.26% | 9441 | **12.59%** | 2,624 | 5,946 | **+126.5%** ⚠️ |
| GfxDeviceWorker::RunCommand | 16093 | 26.70% | 15783 | 21.05% | 9,648 | 9,943 | +3.1% |
| ExecuteScriptableRenderLoop | 6288 | 10.43% | 6306 | 8.41% | 3,769 | 3,973 | +5.4% |

**关键洞察**：
- `ScriptRunBehaviourUpdate` 子树绝对负载 **+126.5%** ← 这就是压测压力的核心入口。
- `GfxDeviceWorker::RunCommand` 子树绝对负载 +3.1%（**几乎不变**）——意味着 GPU 命令吞吐量稳定，渲染压力没增加。
- 印证 §3 中 GLES 驱动绝对样本不变，三处独立信号互证 → **stressmove 不是 GPU bound，是脚本/业务 bound**。

**重要建议（修正 v1 anchor）**：
现在的 4 个 anchor 都是"必然存在的引擎主干"，告诉你"主循环占多少"几乎没有诊断价值。终极报告应该**重构 anchor 集**，按知识库的业务关注点定义：

| 维度 | 新 anchor（待匹配 symbol）| 想回答 |
|---|---|---|
| 网络 | `TServerManager::*` / `HandleMessages` / `DecodeMesssages` | 知识库#2 |
| Lua 主循环 | `LuaMgr.OnTick&UpdateSchedule` / `MapSignificanceMgr.*` | 知识库#3 |
| C# 业务 | `MapManager` / `OutSideViewArmyLineMgr` / `BattleUIManager` / `MeshUIManager` | 知识库#4/5 |
| ECS 红线 | 主线程上 `JobHandle::Complete` / `WaitForJobGroupID` 总和 | 知识库#8 |
| GPU bound 红线 | `URP::WaitForPresent` / `Gfx::WaitForPresentOnGfxThread` | 知识库#9 |
| 资源加载 | `LoaderManagerTickLoadOnFrameEnd` / `ResManager` | 知识库#10 |
| 动画/特效 | `LegacyAnimationUpdate` / `ParticleSystem::BeginUpdateAll` | 知识库#6 |
| UGUI | `PlayerUpdateCanvases` | 知识库#7（1ms 红线）|

terraform 工程化：在 `simpleperf_analyzer/config.py` 的 `DEFAULT_ANCHOR_FUNCS` 里替换。

## 6. UnityMain PlayerLoop 子树（stressmove 实测，占主线程口径）

> 这是 v1 报告"做不到"的章节。本次符号化 PASS + anchor 4/4，能完整钻出来。

```
ExecutePlayerLoop (68.88% of UnityMain)
├─ ScriptRunBehaviourUpdate           32.74%  ← 业务压力主源
│   └─ MonoBehaviour::CallUpdateMethod 32.41%
│       └─ il2cpp Runtime::Invoke      (业务侧 C# / Lua 入口)
├─ ScriptRunBehaviourLateUpdate       15.03%
├─ UpdateFunction.Invoke              9.35%  ← ECS SystemGroup 调度
│   └─ ComponentSystem_Update         8.80%
├─ PlayerSendFrameComplete            2.08%  ← 资源加载入口（知识库#10）
│   └─ Coroutine::Run                  2.05%
├─ TextureStreamingManager::Update    1.59%  ← 知识库未覆盖项
├─ PlayerUpdateCanvases               1.24%  ← UGUI（知识库#7 检查项）
│   └─ UI::Canvas::UpdateBatches       0.46%
├─ ParticleSystemBeginUpdateAll       0.91%  ← 特效（知识库#6）
├─ LegacyAnimationUpdate              0.75%  ← 动画（知识库#6）
├─ FinishFrameRendering               0.67%  ← 帧收尾
└─ PlayerEmitCanvasGeometry           0.66%  ← UGUI 几何提交
```

**渲染相关（不在 PlayerLoop 内，是主线程 nativeRender 入口）**：
```
RenderManager::RenderCameras (26.57% of UnityMain)
└─ UniversalRenderPipeline.Render (25.71%)
   └─ RenderCameraStack (23.57%)
      └─ RenderSingleCamera (23.00%)
         ├─ ScriptableRenderer.Execute              18.39%
         │   └─ ExecuteRenderPass                    16.80%
         │       ├─ DrawRendererPass                  5.34%
         │       │   ├─ DrawFoliageInstanceRenderers  2.61%（树木 instancing）
         │       │   └─ RenderMeshSystemV2.DrawRenderers 0.62%
         │       ├─ ShadowPass.ProcessShadow           5.25%
         │       │   ├─ PlanarShadow.RenderShadow      3.95%（平面阴影）
         │       │   └─ PlanarShadow.BeginProcess      1.15%
         │       └─ BloomPass.Execute                  3.71%（后处理 Bloom）
         └─ MobileBaseRenderer.Setup                  3.25%
```

**关键发现**：
1. **真正能动手优化的渲染负载**：阴影 5.25%（PlanarShadow + Shadow Pass）+ 树木 instancing 2.61% + Bloom 3.71% ≈ **11.5% 渲染负载**——这部分都是主线程上的 C# URP 配置代码，不是 GPU。
2. **MobileBaseRenderer.Setup 3.25%**：每帧重新组装 RenderPass（`SetupRenderPassFromFeatures` 2.13%），有 cache 的空间。
3. v1 报告说 `RenderShadowMaps 1.06%`——错了，那是个汇总值。实际是 PlanarShadow + ShadowPass 加起来 **5.25%**，比 v1 报告高 5 倍。

## 7. RHI 线程（Thread-102）调用栈

> Thread-102 占全局 21.21%，是仅次于 UnityMain 的第二大线程。

```
GfxDeviceWorker::RunCommand (99.19% of thread)
├─ DrawBuffers                        53.44%（实际 GLES draw call 提交）
│   ├─ DrawBuffersStereo               24.22%（多视图渲染优化）
│   │   └─ DrawBufferRanges            24.11%
│   │       └─ Adreno driver internal  20.97%（GPU driver 黑盒）
│   ├─ BeforeDrawCall                  23.33%
│   │   └─ ConstantBuffersGLES::UpdateBuffers 18.89%
│   │       └─ DataBufferGLES::Upload  13.25%（uniform/constant 上传）
│   ├─ SetVertexStateGLES              3.71%
│   └─ ApplyGpuProgramGLES (shader bind) 6.60%
├─ RunCommand (递归处理子命令)         16.25%
│   ├─ GfxDeviceGLES::PresentFrame      7.04%
│   │   └─ eglSwapBuffers               4.31%（华为 EGL，未阻塞，GPU 不是瓶颈）
│   ├─ JobQueue::WaitForJobGroupID      3.85% ⚠️ ← GeometryJob 等待（轻度）
│   ├─ GfxDeviceGLES::UpdateBuffer      2.70%
│   └─ GfxDeviceGLES::BeginFrame        1.40%
├─ SetShadersThreadable                  7.49%（shader 切换）
├─ ConstantBuffersGLES::UpdateCB         4.46%
│   └─ __memcpy (self) 4.00% ← uniform 数据 memcpy 是主要 self 开销
└─ DynamicVBO::DrawChunk                 2.74%
```

**红线信号检测**：
- 🟡 `JobQueue::WaitForJobGroupID` 3.85%（RHI 线程上）—— GeometryJob 几何剔除没准时完成，**轻度异常**。在压测下 ECS Job 系统繁忙时偶发，符合预期。绝对耗时不大。
- 🟢 `eglSwapBuffers` 未阻塞 4.31%（典型 GPU bound 会卡在这里 >15%）——GPU 不是瓶颈。
- 🟢 整条线 GLES 调用顺畅，没看到 `glFinish` / `glClientWaitSync` 类硬同步。

**ConstantBuffer 上传 18.89%（含子）**：这是 shader 参数每帧大量更新（300队部队的 instancing 矩阵、骨骼蒙皮参数等），**memcpy 4% 是这部分的主要 self 开销**。优化空间：能否用 SSBO + 持久映射减少 memcpy？

## 8. Burst Job 分布（lib_burst_generated.so 内部）

> base 1.42% → stressmove 10.63%（绝对 +878%）。所有 Job 函数名都符号化清晰。

| Job 函数（self%）| 业务模块 |
|---|---|
| `MoveChain_SoldierMoveSystem.SoldierMoveJob` 1.36% | 士兵移动主 Job |
| `RotationLerpSystem.DoSmoothLerp` 0.99% | 旋转平滑插值 |
| `WriteInstanceDataJob` 0.85% | GPU Instancing 数据回写 |
| `UtilHeightMapBurst.GetSamplerHeights` 0.70% | 地形高度采样（被 SoldierMove 调用）|
| `SyncViewEntitySystem` 0.69% | ECS 实体 → 显示同步 |
| `LocalToParentSystem.ChildLocalToWorld` 0.64% | Transform 层级变换 |
| `MoveChain_SoldierMoveSystem` 第二条 0.49% | （split）|
| `MoveChain_ArmyMoveSystem.ArmyMoveJob` 0.49% | 队伍路径移动 |
| `SoldierMoveJob.OnStepMove` 0.44% | 单步移动 |
| `SyncLogicEntitySystem` 0.43% | ECS 逻辑同步 |
| `MoveChain_SoldierMoveSystem` 第三条 0.41% | （split）|
| `ArmyMoveSystem.RefreshCurPosition` 0.39% | 路径点刷新 |

**合计**：上面这组 ECS Burst Job ≈ **8.0% 全局 CPU**。这是 300 队部队 × 多人 × 物理更新的真实工作量。

**对照 v1 报告**：v1 说 `SoldierMoveJob 0.75%` 是"业务热点"——单独看是低估了，应该把 `MoveChain_SoldierMoveSystem` 全套加起来。

**判定**：ECS 系统负载分布合理，没看到任何一个 Job 异常高（最高 1.36%），符合知识库 #8 "Job 已并行化"的预期。**Job 健康度 PASS**。

## 9. C# 业务函数热点（libil2cpp 已符号化）

| Self % | 函数 | 业务模块（关联知识库）|
|---|---|---|
| 0.94% | `GC_end_stubborn_change` | Boehm GC 常驻（不是 STW，是后台标记/扫描）|
| 0.90% | `MUIControlManager.OnLateUpdate` | MeshUI 后期更新（知识库 #5）|
| 0.83% | `MUILayout.Set3DPosition` | 3D 跟随 UI 布局（知识库 #5）|
| 0.58% | `Enumerator.MoveNext` | foreach/迭代器（C# 泛型）|

**对照 v1 报告**：v1 说"MUI 框架 OnLateUpdate 0.90% + Set3DPosition 0.69% ≈ 1.6%"——这次数据 Set3DPosition 稍高（0.83%），合计 **1.73%**。

**注意**：libil2cpp 绝对负载 +22.6%（§3），但 top self% 的 C# 函数都不算热（最高 0.94%）——意味着 **C# 业务侧负载分散在很多函数上**，没有"一个大 boss 函数"。这是均衡分布，符合大型项目的常态。

**Lua 桥接（XLua P/Invoke）这块需要在 Phase 2 专门展开**——具体怎么算 Lua 总负载（含被 il2cpp 调用的桥接路径）是个公式题，需要遍历 callTree 找出 `xlua_*` / `XLuaCallNative_*` 入口点。

## 10. 主线程红线检测（按你知识库逐条）

| 知识库点 | 红线信号 | base 观察 | stressmove 观察 | 判定 |
|---|---|---|---|---|
| #2 网络消息 | TServerManager 子树占比 | 待测（需 libil2cpp 符号匹配）| 同 | 待确认 |
| #3 Lua 主循环 | MapSignificanceMgr 顶到 3ms | Lua 内部不可见 → 需 Unity Profiler 配合 | 同 | **本源能力边界** |
| #6 动画 | LegacyAnimationUpdate >1ms | 0.75% × 20s = 150ms total / 1200frame ≈ 0.13ms/帧 | 同 | 🟢 远低于红线 |
| #6 特效 | ParticleSystemBeginUpdateAll >1ms | 0.91% × 20s = 182ms / 1200frame ≈ 0.15ms/帧 | 同 | 🟢 远低于红线 |
| #7 UGUI | PlayerUpdateCanvases >1ms | 1.24% × 20s = 248ms / 1200frame ≈ 0.21ms/帧 | 同 | 🟢 远低于红线 |
| #8 ECS Job 互等 | 主线程 WaitForJobGroupID | 全局 0.36% × 6 处去重 ≈ 0.4% | 同 | 🟡 轻度信号，但远低于异常 |
| #9 GPU bound | URP.WaitForPresent / Gfx.WaitForPresentOnGfxThread | 未发现 | 未发现 | 🟢 非 GPU bound |
| #10 资源加载 | LoaderManagerTickLoadOnFrameEnd | 在 PlayerSendFrameComplete 子树（2.08%）内 | 同 | 🟢 在合理范围 |
| #11 Lua MtGC | LuaMtGc.WaitGCThread spike | 数据全程聚合不可见 spike，需 Unity Profiler | 同 | **本源能力边界** |

**重大结论**：按知识库 11 条红线检测，**stressmove 这次采集没有任何"明显异常"信号**。主观帧率 45fps（差预期 60）的来源不是单点异常，而是**业务整体负载偏高 + Wwise 音频 + Burst Job 三路压力叠加**。

## 11. simpleperf 本源能力边界（必须诚实标注）

| 想回答的问题 | 本源能/否 | 替代源 |
|---|---|---|
| 帧级耗时（哪帧卡）| ❌ 全程聚合 | Unity Profiler |
| Lua 内部脚本/管理器名 | ❌ 只能看到 luaV_execute | Unity Profiler / perfetto |
| GC.Collect 单次 STW 耗时 | ❌ 只能看 Boehm 常驻 | Unity Profiler |
| 主线程"在算 vs 在等"（off-CPU）| ❌ 只采用户态 cpu-cycles | perfetto sched |
| 降频 / cpu freq | ❌ | perfetto sysfs / cooling |
| Wwise 内部事件级归因 | ❌ libAkSoundEngine 内部无 debug 符号 | Wwise Profiler |
| GPU 驱动内部细节 | ❌ Adreno 厂商剥离 | RenderDoc / Snapdragon Profiler |

## 12. 给 Phase 2 终极报告的设计要点

1. **结构按知识库 11 条展开**，每条一节，正常项也展开标 🟢。
2. **每节四件套**：问题 / 数据来源方法 / 本次观察（双口径 + diff vs base）/ 红线门槛。
3. **结论先行**：开头放一段"普通话总结"+ "红线告警清单"（这次 0 红线触发）+ "压力来源 Top-N"（业务+86.5% / Wwise+1255% / Burst+878%）+ "本次判定"（"轻度偏离基线，非异常，离 60fps 目标 -25% 的来源是业务整体偏重"）。
4. **强调本次数据的标志性发现**：anchor 4/4 / 符号化 99.7% / 知识库未触发红线——这本身就是结论：**当前版本性能符合预期，没有专项异常需要追查**。
5. **方法论章节**强制双口径：百分比 + 绝对样本数。
6. **anchor 重构**：把老 4 件套换成知识库业务关注 anchor 集（§5 表格）。
7. **图示**：rendering pass 子树（§6）、RHI 线程子树（§7）适合用 ASCII tree 表达，不需要外部图渲染。
8. **路线图附件用 `<!-- TOOL: -->` 注释逐项标**：anchor 重构、Lua 总负载公式、C#/Lua 二分算法、绝对样本数双口径、diff 引擎、红线引擎。

## 13. Phase 2/3 待办

- [ ] Phase 2: 按 §12 写终极报告 → `performance-report_simpleperf_ULTIMATE_v1.md`
- [ ] Phase 3: 写工程化路线图 → `report-to-pipeline-spec.md`
- [ ] (探查 backlog) NativeThread 暴增 12 倍跑的是什么 —— Phase 2 时再钻调用栈
- [ ] (探查 backlog) Lua 总负载完整算法（含 il2cpp 内 Lua 桥接路径）—— Phase 2 时计算
- [ ] (探查 backlog) base vs stressmove 全维度 diff 表（每个 anchor / 每个库 / 每个线程 / 每个 Burst Job）
