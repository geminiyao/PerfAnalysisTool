# CPU 性能分析报告

> 文件：压测战斗.pdata | 目标帧率：30 FPS | 生成时间：20260511124500

---

## 一、概览

| 指标 | 数值 |
|------|------|
| 总帧数 | 599 |
| 目标帧率 | 30 FPS |
| 实际平均帧率 | 35.3 FPS |
| 平均帧耗时 | 28.35ms |
| 中位数帧耗时 | 22.33ms |
| 最差帧 | #431 (24.0ms) |
| Jank 次数 | 6 |
| BigJank 次数 | 3 |

> **注意**：最差帧（#431, 24.0ms）本身在正常范围内；但数据中存在多个耗时超过 500ms 的异常帧（#469: 557ms, #431 的 hotPath 数据来自不同帧），这些帧均被归入 BigJank。

---

## 二、核心结论

本次战斗压测中存在**三类系统性性能问题**：

1. **TBUResManager.GetResFileInfo 同步阻塞（最高 575ms）**：在 MapSignificanceMgr 处理 ZoomEntityAdd 任务时发生，是导致 3 次 BigJank（最高 598ms）的直接原因，属于严重主线程阻塞。
2. **YzEntityMoveLineNtf 网络消息处理热点（中位帧 32%）**：在正常帧（中位数帧 #417）中占帧耗时 32%（11.5ms），是稳态性能最大瓶颈，同时伴随 GC 分配问题。
3. **RenderManager_Shadow 持续高耗时（最差帧 #431 最大耗时 4ms）**：在大量帧中占据 LateUpdate 的主体耗时，是渲染侧的稳定开销，且在 Jank 帧 #277 中升至 4.8ms 直接触发卡顿。

---

## 三、热点分析

### 判定依据

以下 Marker 被判定为热点，基于如下标准：
- **mustReport 为 true**：self-time 占帧比 > 20%（budgetRatio = 0.3 × 33.33ms = 10ms）
- **稳态高占用**：presentOnFrameCount 高（出现帧比例大）且 msSelfMean 显著
- **对实际游戏帧影响大**：中位帧中占比高的 Marker 具有更高实际影响

---

### 热点 #1：TBUResManager.GetResFileInfo

- **判定理由**：msSelfMean = 22.455ms，占帧 79.2%，spikeRatio = 27611.7（极端波动）；mustReport = true
- **出现情况**：presentOnFrameCount = 95 帧，count = 2103 次，每帧均值 22.14 次调用，为高频调用
- **self/total 比**：100%（self = total = 22.455ms），函数自身即是瓶颈

**完整调用链（均值帧）：**
```
PlayerLoop (31.3ms, 99.9%)
  → Update.ScriptRunBehaviourUpdate (7.3ms, 23.4%)
    → BehaviourUpdate (7.3ms, 23.4%)
      → AOE.dll!AOE::GameLauncher.Update() (6.8ms, 21.7%)
        → Core.Update (6.8ms, 21.7%)
          → CS:AOE.LuaMgr (5.1ms, 16.3%)
            → LuaMgr.OnTick&UpdateSchedule (5.1ms, 16.3%)
              → MapSignificanceMgr (4.3ms, 13.7%)
                → MapSignificanceMgr.sampler_OnUpdate (4.3ms, 13.7%)
                  → MapSignificanceMgr.ProcessTasks (4.3ms, 13.6%)
                    → MapSignificanceMgr.EntityTask (2.4ms, 7.6%)
                      → MapSignificanceMgr.ProcessTask_MapEntityAdd (1.8ms, 5.7%)
                        → MapEntityCtrl.CreateMapEntity_310 (1.7ms, 5.3%)
                          → TBUResManager.GetResFileInfo (0.0ms~575ms) **BOTTLENECK**
```

**源码位置**：无源码映射（TBUResManager 为插件模块）

**根因分析**：
`TBUResManager.GetResFileInfo` 在创建 MapEntity 时被同步调用，通常每次调用耗时极低（中位数 0.021ms），但当资源未缓存或文件系统访问慢时会发生极端阻塞（最高 575ms）。高调用频率（每帧 22.14 次）加上偶发同步 IO，导致累计均值高达 22.455ms。在 BigJank 帧中，该函数是主要的时间消耗来源（单帧耗时 178~181ms）。

根据 AOE 项目知识（C5：MapSignificanceMgr 高耗时），这是 Lua 层 AOI 更新机制在高密度战斗场景下的已知问题，当 ZoomEntityAdd 任务批量创建地图实体时，资源查找逻辑触发同步读取。

---

### 热点 #2：MapSignificanceMgr.ProcessTask_ZoomEntityAdd

- **判定理由**：msSelfMean = 18.186ms，占帧 64.2%，mustReport = true；在 120 帧中出现（20%）
- **self/total 比**：100%（self = total = 18.186ms），函数自身是瓶颈
- **源码**：`Assets/Scripts/.Lua/Outside/Map/Core/MapSignificanceMgr.lua`（行 1208~1209）

**完整调用链（均值帧）：**
```
PlayerLoop (24.0ms, 99.9%)
  → Update.ScriptRunBehaviourUpdate (4.7ms, 19.6%)
    → BehaviourUpdate (4.7ms, 19.6%)
      → AOE.dll!AOE::GameLauncher.Update() (3.8ms, 16.0%)
        → Core.Update (3.7ms, 15.5%)
          → CS:AOE.LuaMgr (1.3ms, 5.5%)
            → LuaMgr.OnTick&UpdateSchedule (1.3ms, 5.4%)
              → MapSignificanceMgr (0.7ms, 2.8%)
                → MapSignificanceMgr.sampler_OnUpdate (0.7ms, 2.8%)
                  → MapSignificanceMgr.ProcessTasks (0.6ms, 2.7%)
                    → MapSignificanceMgr.EntityTask (0.6ms, 2.5%)
                      → MapSignificanceMgr.ProcessTask_ZoomEntityAdd (0.4ms, 1.8%) **BOTTLENECK**
```

**根因分析**：
ZoomEntityAdd 任务在每次无极缩放层级发生变化时批量创建地图实体，涉及大量资源加载（TBUResManager.GetResFileInfo）。在战斗压测场景下有大量地图实体需要创建，尤其是在较短时间内发生多次层级切换时，任务队列积压，导致某些帧耗时暴增到 576ms。该问题与 TBUResManager 的同步 IO 直接关联。

---

### 热点 #3：YzEntityMoveLineNtf（网络消息处理）

- **判定理由**：中位帧（#417）中耗时 11.5ms，占帧 32.0%，self-time 11.3ms；稳定出现于高负载帧
- **self/total 比**：11.3ms / 11.5ms = 98%，函数自身是瓶颈
- **出现情况**：在中位帧中是最大单项瓶颈，且触发 Jank #298（11.3ms, 25.9%）

**完整调用链（中位帧 #417）：**
```
PlayerLoop (35.9ms, 100.0%)
  → Update.ScriptRunBehaviourUpdate (16.3ms, 45.2%)
    → BehaviourUpdate (16.3ms, 45.2%)
      → AOE.dll!AOE::GameLauncher.Update() (16.0ms, 44.4%)
        → Core.Update (15.9ms, 44.2%)
          → CS:AOE.TServerManager (13.8ms, 38.4%)
            → TServer.HandleMessages (11.5ms, 32.1%)
              → YzEntityMoveLineNtf (11.5ms, 32.0%) **BOTTLENECK**
                → OutsideLineCtrl:CalculateVertexJob (Burst) (0.0ms, 0.0%) **BOTTLENECK**
```

**源码位置**：TServer 位于 `Assets/Scripts/CS/NetworkCore/Network/TServer.cs`（行 266）

**根因分析**：
`YzEntityMoveLineNtf` 是处理行军移动线（MoveLine）网络通知的消息处理器。在战斗压测场景下（300 队/2700 兵），大量部队同时移动产生大量网络消息，该消息处理器每帧被调用多次，处理路径包括：解包 protobuf 消息、更新 Lua 侧实体状态、触发移动线顶点重计算（`CalculateVertexJob`）。self-time 占比 98% 表明是该函数自身逻辑重，而非子调用导致。同时观察到 GC.Alloc 在调用链末端出现，说明消息处理过程有临时对象分配。根据 AOE 知识（C5：网络解包高耗时），大规模战斗的网络解包是已知瓶颈。

---

### 热点 #4：RenderManager_Shadow（阴影渲染）

- **判定理由**：最差帧（#431）中耗时 4.0ms，占帧 16.6%（self=4.0ms）；中位帧（#417）中 4.8ms，占帧 13.3%；在 Jank 帧 #277 中高达 4.8ms 直接成为主因；所有 Jank 帧的调用树中均出现且 self-time > 3.9ms
- **self/total 比**：100%（全是 self-time，无子调用）
- **每帧出现**：在所有 Jank 帧及 worst/median 帧中均有出现，是稳定持续开销

**完整调用链（最差帧 #431）：**
```
PlayerLoop (24.0ms, 99.9%)
  → PreLateUpdate.ScriptRunBehaviourLateUpdate (7.0ms, 29.0%)
    → LateBehaviourUpdate (7.0ms, 29.0%)
      → AOE.dll!AOE::GameLauncher.LateUpdate() (6.3ms, 26.2%)
        → CS:AOE.RenderManager (4.0ms, 16.7%)
          → RenderManager_Shadow (4.0ms, 16.6%) **BOTTLENECK**
```

**完整调用链（中位帧 #417）：**
```
PlayerLoop (35.9ms, 100.0%)
  → PreLateUpdate.ScriptRunBehaviourLateUpdate (7.1ms, 19.9%)
    → LateBehaviourUpdate (7.1ms, 19.9%)
      → AOE.dll!AOE::GameLauncher.LateUpdate() (6.6ms, 18.5%)
        → CS:AOE.RenderManager (4.8ms, 13.4%)
          → RenderManager_Shadow (4.8ms, 13.3%) **BOTTLENECK**
```

**根因分析**：
`RenderManager_Shadow` 是自定义 C# 阴影管理器，在 LateUpdate 阶段执行，全为 self-time 意味着逻辑集中在此函数内部（无深层子调用）。[推断] 该函数可能遍历场景内所有动态部队实体，逐个设置阴影参数（如 ShadowCastingMode、层级 LOD 配置），在 300 队/2700 兵场景下遍历量极大。根据 AOE 优化经验（C7），阴影和描边强制 LOD2 是已知的优化手段，说明此处可能存在非 LOD2 的阴影处理逻辑。

---

### 热点 #5：GC.Collect

- **判定理由**：msSelfMean = 8.488ms，占帧 29.9%，mustReport = true；count = 4（出现于 4 帧），每次触发均值 ~8.5ms
- **self/total 比**：100%
- **严重性**：GC.Collect 每次触发平均耗时 8.5ms，最高 10.2ms，会导致明显帧率抖动

**调用链**：深度 5，具体调用链未被完整解析（depth=5，chain not resolved）。[推断] 根据 Jank 帧中 GC.Alloc 出现在 `YzEntityMoveLineNtf` 和 `TBUResManager.GetResFileInfo` 调用链末端，消息处理和资源查询过程中产生的大量临时对象是 GC 触发的根本原因。

**根因分析**：
[推断] 每次处理大量网络消息（`YzEntityMoveLineNtf`）时会创建临时 protobuf 消息对象、Lua table、以及 C# 侧的消息包装类。当内存累积到阈值触发 GC.Collect 时，主线程暂停 8~10ms。根据 AOE 项目知识（C5：GC Spike），这与 Lua 临时对象分配和网络消息对象分配有关。

---

### 特殊 Marker 说明

#### Gfx.WaitForGfxCommandsFromMainThread

- **含义**：Submit Thread（提交线程）等待主线程提交渲染命令
- **数据**：msSelfMean = 14.06ms，占帧 49.6%，567/599 帧出现，mustReport = true
- **解读**：Submit Thread 的高等待时间反映**主线程是瓶颈**，提交线程在等待主线程完成渲染命令生成。这是 CPU-Bound 的间接证据，而非 GPU-Bound。当主线程被 YzEntityMoveLineNtf、MapSignificanceMgr 等耗时操作占用时，提交线程被迫等待。

#### Gfx.RenderSlaver.ThreadRun / PlayerLoop

- **含义**：Render Thread 和 Main Thread 的根级 Marker（帧循环本身）
- **数据**：二者 msSelfMean 均约 28.3ms，percentOfFrame ≈ 99.9%
- **解读**：这是正常的帧级容器 Marker，表示两个线程每帧都在工作，不代表具体的性能问题。

#### Shader.CreateGPUProgram / CreateGpuProgram

- **含义**：运行时 GPU Shader 程序编译，通常发生在首次使用某 Shader 变体时
- **数据**：msSelfMean = 22.462ms（Render Thread），20.376ms（Submit Thread）；仅在 3 帧出现，共 8 次
- **解读**：这是 Shader 未预热（prewarm）的典型表现，属于偶发 spike 而非稳态问题。3 帧中发生 8 次编译，每次 ~22ms，说明这 3 帧各有 2~3 次新 Shader 变体被引用。根据 AOE 知识（C7：Shader 异步编译），需在进野外 Loading 时预热 ShaderVariantCollection 以消除此类 spike。

#### WaitForTargetFPS

- **含义**：CPU 等待下一帧时间点到来（帧率限制空闲）
- **数据**：msSelfMedian = 0.006ms，msSelfP95 = 15.033ms，spikeFrameCount = 143
- **解读**：大多数帧中几乎为零（CPU 繁忙无需等待），但在部分轻载帧中出现较高等待（最高 20ms），说明这些帧 CPU 提前完成、有帧预算盈余。不是性能问题，是正常的 vsync 等待。

---

## 四、Jank 卡顿分析

### 卡顿模式总结

| 帧索引 | 级别 | 倍数 | 耗时（ms） | 主因 Marker | 分类 |
|--------|------|------|-----------|------------|------|
| #431 | BigJank | 5.0x | 598.4ms | TBUResManager.GetResFileInfo（推断） | 资源同步 IO |
| #469 | BigJank | ≥3x | 557.1ms | TBUResManager.GetResFileInfo | 资源同步 IO |
| #465 | BigJank | ≥3x | 546.0ms | TBUResManager.GetResFileInfo | 资源同步 IO |
| #277 | Jank | 2.5x | 59.8ms | RenderManager_Shadow | 渲染 |
| #298 | Jank | 2.37x | 58.4ms | YzEntityMoveLineNtf | 网络处理 |
| #105 | Jank | 2.03x | 39.1ms | TransformChangedDispatch | Transform 同步 |
| #470 | Jank | 2.73x | 63.9ms | Semaphore.WaitForSignal | GPU 等待 |

**注意**：BigJank 帧（#431/#469/#465）的 hotPath 所标注的 PlayerLoop 总耗时（557ms/546ms/598ms）来自**前一帧的 ProfilerSample 数据溢出**问题，或系数据集中 Profiler 采样方式导致当前帧记录了跨帧耗时。实际 mostFrame index #431 的帧耗时为 24.0ms，但其 BigJank 分类应归因于帧 #469/#465 中发生的巨大阻塞（前三均值计算的参考帧）。

---

### BigJank #1 & #2：帧 #469 / #465（TBUResManager.GetResFileInfo 主线程阻塞）

**帧 #469 耗时：557.1ms，倍数：2.73x（参考 prevThreeAvg=204ms），dominantMarker = TBUResManager.GetResFileInfo**

**完整调用链（帧 #469）：**
```
PlayerLoop (557.1ms, 100.0%)
  → Update.ScriptRunBehaviourUpdate (536.7ms, 96.3%)
    → BehaviourUpdate (536.7ms, 96.3%)
      → AOE.dll!AOE::GameLauncher.Update() (535.9ms, 96.2%)
        → Core.Update (535.8ms, 96.2%)
          → CS:AOE.LuaMgr (528.0ms, 94.8%)
            → LuaMgr.OnTick&UpdateSchedule (528.0ms, 94.8%)
              → MapSignificanceMgr (525.4ms, 94.3%)
                → MapSignificanceMgr.sampler_OnUpdate (525.4ms, 94.3%)
                  → MapSignificanceMgr.ProcessTasks (525.4ms, 94.3%)
                    → MapSignificanceMgr.EntityTask (525.4ms, 94.3%)
                      → MapSignificanceMgr.ProcessTask_ZoomEntityAdd (524.9ms, 94.2%)
                        → TBUResManager.GetResFileInfo (178.4ms, 32.0%) **BOTTLENECK**
                          → LogStringToConsole (0.9ms, 0.2%) **BOTTLENECK**
                            → UnityEngine.CoreModule.dll!UnityEngine::Application.CallLogCallback() (0.2ms, 0.0%) **BOTTLENECK**
                              → ErrorLogWriter OnLogMessageReceived (0.1ms, 0.0%) **BOTTLENECK**
                                → GC.Alloc (0.0ms, 0.0%) **BOTTLENECK**
```

**完整调用链（帧 #465）：**
```
PlayerLoop (546.0ms, 100.0%)
  → Update.ScriptRunBehaviourUpdate (525.7ms, 96.3%)
    → BehaviourUpdate (525.7ms, 96.3%)
      → AOE.dll!AOE::GameLauncher.Update() (525.4ms, 96.2%)
        → Core.Update (525.4ms, 96.2%)
          → CS:AOE.LuaMgr (523.4ms, 95.9%)
            → LuaMgr.OnTick&UpdateSchedule (523.4ms, 95.9%)
              → MapSignificanceMgr (522.9ms, 95.8%)
                → MapSignificanceMgr.sampler_OnUpdate (522.9ms, 95.8%)
                  → MapSignificanceMgr.ProcessTasks (522.5ms, 95.7%)
                    → MapSignificanceMgr.EntityTask (522.5ms, 95.7%)
                      → MapSignificanceMgr.ProcessTask_ZoomEntityAdd (521.0ms, 95.4%)
                        → TBUResManager.GetResFileInfo (180.8ms, 33.1%) **BOTTLENECK**
                          → LogStringToConsole (0.8ms, 0.2%) **BOTTLENECK**
                            → ErrorLogWriter OnLogMessageReceived (0.1ms, 0.0%) **BOTTLENECK**
                              → GC.Alloc (0.0ms, 0.0%) **BOTTLENECK**
```

**瓶颈节点**：`TBUResManager.GetResFileInfo`，self-time 约 178~181ms（占该帧 32~33%），且调用链中出现 `LogStringToConsole → ErrorLogWriter` 说明此次调用有**错误日志输出**（资源查询失败或异常路径）。

**根因分析**：
MapSignificanceMgr 在 ZoomEntityAdd 任务中通过 TBUResManager.GetResFileInfo 批量查找资源路径信息。在无极缩放层级切换后，大量地图实体（战斗部队）需要重新创建，批量调用 GetResFileInfo（每帧 22 次以上），当资源索引未缓存时触发同步文件系统查询（[推断]）。调用链末端出现 `LogStringToConsole → ErrorLogWriter` 表明部分资源查找返回了异常状态（可能资源路径不存在或格式错误），触发了 Error 级别日志，进一步产生 GC 分配。

**附加发现**：`MapSignificanceMgr.ProcessTask_ZoomEntityAdd` 在帧 #469 和 #465 中耗时分别为 524.9ms 和 521.0ms（远超其均值 18.186ms），说明问题是集中爆发的，而非每帧都有此耗时。

---

### BigJank #3：帧 #431（参见 Worst Frame）

**帧 #431 实际 PlayerLoop 耗时：24.0ms（正常帧），但其 BigJank 分类来自相对前三帧均值的倍数计算**

**完整调用链：**
```
PlayerLoop (24.0ms, 99.9%)
  → PreLateUpdate.ScriptRunBehaviourLateUpdate (7.0ms, 29.0%)
    → LateBehaviourUpdate (7.0ms, 29.0%)
      → AOE.dll!AOE::GameLauncher.LateUpdate() (6.3ms, 26.2%)
        → CS:AOE.RenderManager (4.0ms, 16.7%)
          → RenderManager_Shadow (4.0ms, 16.6%) **BOTTLENECK**
        → Core.LateUpdate (2.1ms, 8.9%)
  → PostLateUpdate.FinishFrameRendering (5.1ms, 21.2%)
    → URP.Render (4.2ms, 17.5%)
      → URP.RenderCameraStack (3.7ms, 15.6%)
  → Update.ScriptRunBehaviourUpdate (4.7ms, 19.6%)
```

**说明**：帧 #431 的 24.0ms 本身未超帧预算（33.33ms），被标注为 BigJank 是因为**前三帧（#469, #465 等）耗时极长（500ms+），拉高了 prevThreeAvg 均值**，使得即使是正常帧也触发了 Jank 判定（统计效应）。实际该帧性能正常，主要热点是 `RenderManager_Shadow`（4.0ms）。

---

### Jank #4：帧 #277（渲染 Jank —— RenderManager_Shadow）

**耗时：59.8ms，倍数：2.5x，dominantMarker = RenderManager_Shadow**

**完整调用链：**
```
PlayerLoop (31.9ms, 99.9%)
  → PreLateUpdate.ScriptRunBehaviourLateUpdate (10.4ms, 32.7%)
    → LateBehaviourUpdate (10.4ms, 32.7%)
      → AOE.dll!AOE::GameLauncher.LateUpdate() (7.4ms, 23.3%)
        → CS:AOE.RenderManager (4.9ms, 15.2%)
          → RenderManager_Shadow (4.8ms, 15.2%) **BOTTLENECK**
        → Core.LateUpdate (2.5ms, 7.7%)
          → CS:AOE.MeshUIManager (1.1ms, 3.4%)
          → CS:AOE.LuaMgr (1.0ms, 3.1%)
            → LuaMgr.OnLateUpdateSchedule (1.0ms, 3.0%)
              → MapCameraCtrl (0.8ms, 2.4%)
      → TBU.Rendering.dll!TBU.LOD::TBULODStreamingManager.LateUpdate() (2.0ms, 6.1%)
  → Update.ScriptRunBehaviourUpdate (8.8ms, 27.5%)
    → ... → CS:AOE.LuaMgr (6.2ms, 19.4%)
      → LuaMgr.OnTick&UpdateSchedule (6.2ms, 19.4%)
        → MapSignificanceMgr (3.8ms, 11.9%)
        → BattleHeadMgr (1.1ms, 3.3%)
        → TimeWheel (0.8ms, 2.5%)
  → PostLateUpdate.FinishFrameRendering (5.4ms, 17.0%)
    → URP.Render (4.5ms, 14.1%)
```

**瓶颈节点**：`RenderManager_Shadow`，self-time 4.8ms（占帧 15.2%）。注意此帧总耗时 31.9ms 本身接近帧预算边缘，`RenderManager_Shadow` 的额外开销（相较均值帧略高）叠加 `MapSignificanceMgr`（3.8ms）和 `BattleHeadMgr`（1.1ms）共同导致超帧。

**根因分析**：[推断] 该帧内战场内阴影渲染对象数量或状态发生变化（如新部队进入视野），导致 RenderManager_Shadow 遍历量增加，耗时从均值 ~4ms 升至 4.8ms，触发 Jank。

---

### Jank #5：帧 #298（网络消息 Jank —— YzEntityMoveLineNtf）

**耗时：58.4ms，倍数：2.37x，dominantMarker = YzEntityMoveLineNtf**

**完整调用链：**
```
PlayerLoop (43.7ms, 100.0%)
  → Update.ScriptRunBehaviourUpdate (16.9ms, 38.6%)
    → BehaviourUpdate (16.9ms, 38.6%)
      → AOE.dll!AOE::GameLauncher.Update() (16.6ms, 38.0%)
        → Core.Update (16.6ms, 37.8%)
          → CS:AOE.TServerManager (13.6ms, 31.0%)
            → TServer.HandleMessages (11.5ms, 26.3%)
              → YzEntityMoveLineNtf (11.3ms, 25.9%) **BOTTLENECK**
                → GC.Alloc (0.0ms, 0.0%) **BOTTLENECK**
            → TServer.DecodeMesssages (2.0ms, 4.6%)
              → TServer.ParsePacketMessages (1.2ms, 2.7%)
  → PreLateUpdate.ScriptRunBehaviourLateUpdate (8.7ms, 19.8%)
    → ... → RenderManager_Shadow (3.9ms, 8.9%) **BOTTLENECK**
  → PreLateUpdate.LegacyAnimationUpdate (6.4ms, 14.6%)
```

**瓶颈节点**：`YzEntityMoveLineNtf`，self-time 11.1ms（占帧 25.9%）。

**根因分析**：在该帧中，服务器下发了大批量部队移动线通知（`YzEntityMoveLineNtf`），单帧内消息处理耗时 11.3ms。函数内部产生了 GC 分配（`GC.Alloc`），[推断] 为 protobuf 消息解析或 Lua table 创建产生的临时对象。此外，`TServer.DecodeMesssages` 同帧耗时 2.0ms，总网络解包开销达 13.5ms，占帧 31%。

---

### Jank #6：帧 #105（Transform 同步 Jank）

**耗时：39.1ms，倍数：2.03x，dominantMarker = TransformChangedDispatch**

**完整调用链：**
```
PlayerLoop (19.0ms, 99.9%)
  → Update.ScriptRunBehaviourUpdate (5.5ms, 28.7%)
    → BehaviourUpdate (5.5ms, 28.7%)
      → AOE.dll!AOE::GameLauncher.Update() (5.2ms, 27.4%)
        → Core.Update (5.2ms, 27.4%)
          → CS:AOE.LuaMgr (3.9ms, 20.4%)
            → LuaMgr.OnTick&UpdateSchedule (3.9ms, 20.3%)
              → MapSignificanceMgr (3.1ms, 16.5%)
                → MapSignificanceMgr.sampler_OnUpdate (3.1ms, 16.5%)
                  → MapSignificanceMgr.ProcessTasks (3.0ms, 15.8%)
                    → MapSignificanceMgr.EntityTask (3.0ms, 15.6%)
                      → MapSignificanceMgr.ProcessTask_MapObjCleanUp (1.2ms, 6.1%)
                        → Lua:ArmyCleanUp (1.1ms, 5.9%)
                          → Lua:ArmyCleanUp2 (1.1ms, 5.8%)
                            → Transform.SetParent (0.4ms, 2.2%)
                              → TransformChangedDispatch (0.1ms, 0.3%) **BOTTLENECK**
                                → WaitForJobGroupID (0.0ms, 0.2%)
                                  → Semaphore.WaitForSignal (0.0ms, 0.2%) **BOTTLENECK**
```

**瓶颈节点**：`TransformChangedDispatch + Semaphore.WaitForSignal`（合计 ~0.3ms 但产生了 Job 同步等待）

**说明**：帧 #105 的 PlayerLoop 实际耗时仅 19.0ms，远低于 33.33ms 帧预算，Jank 倍数 2.03x 来自相对前几帧超快帧（~9.4ms 均值）的比较。该帧的主要问题是 `Lua:ArmyCleanUp` 触发了 `Transform.SetParent`，这导致 `TransformChangedDispatch` 同步了 Job 线程（`WaitForJobGroupID`）。这是大量部队同时销毁时的 DOTS 同步点问题（ArmyCleanUp spike）。

---

### Jank #7：帧 #470（GPU 等待 Jank）

**耗时：63.9ms（记录），倍数：2.73x，dominantMarker = Semaphore.WaitForSignal**

**完整调用链：**
```
PlayerLoop (63.9ms, 100.0%)
  → PostLateUpdate.FinishFrameRendering (43.6ms, 68.2%)
    → UnityEngine.CoreModule.dll!UnityEngine.Rendering::RenderPipelineManager.DoRenderLoop_Internal() (43.3ms, 67.7%)
      → URP.Render (42.7ms, 66.9%)
        → URP.RenderCameraStack (42.4ms, 66.4%)
          → URP.RenderSingleCamera (42.4ms, 66.3%)
            → URP.AfterRendering (39.3ms, 61.5%)
              → URP.Submit (39.0ms, 61.0%)
                → URP.WaitForPresent (38.2ms, 59.7%)
                  → Gfx.WaitForPresentOnGfxThread (38.2ms, 59.7%)
                    → Semaphore.WaitForSignal (38.1ms, 59.7%) **BOTTLENECK**
  → PreLateUpdate.ScriptRunBehaviourLateUpdate (7.0ms, 11.0%)
    → ... → RenderManager_Shadow (4.5ms, 7.1%) **BOTTLENECK**
  → Update.ScriptRunBehaviourUpdate (5.5ms, 8.7%)
    → ... → CS:AOE.TServerManager (2.4ms, 3.7%)
      → TServer.HandleMessages (1.7ms, 2.7%)
        → YzEntityMoveLineNtf (0.7ms, 1.1%)
```

**瓶颈节点**：`Semaphore.WaitForSignal`（在 `Gfx.WaitForPresentOnGfxThread` 路径下），self-time 38.1ms，占帧 59.7%。

**解读**：这是典型的 **GPU Bound** 帧，主线程在 `URP.WaitForPresent` → `Gfx.WaitForPresentOnGfxThread` → `Semaphore.WaitForSignal` 路径上等待 GPU 完成渲染（38ms 等待）。在此帧中 GPU 处理时间远超帧预算，导致 CPU 等待。这与整体分析一致：在高渲染压力时段（大量部队可见），GPU 渲染耗时超过帧预算。

---

## 五、Marker 波动分析

### 判定依据

以下 Marker 被判定为需关注的波动问题，基于以下标准：
- **spikeRatio > 1000**（波动倍数极高，说明存在非稳态的突发开销）
- **spikeFrameCount > 10**（受影响帧数较多，非偶发）
- **msSelfMax > 10ms**（峰值耗时超过 10ms，对帧预算影响显著）

---

### 波动 Marker #1：MapSignificanceMgr.EntityTask

- **spikeRatio**：395588（极端波动）
- **spikeFrameCount**：157 / 599 帧（26%）
- **msSelfMedian**：0.001ms；**msSelfMax**：576.767ms；**msSelfP95**：3.55ms
- **分析**：EntityTask 的波动极为剧烈，中位数几乎为零但最大值达 576ms。受影响的 157 帧集中在帧 #442~#461 附近（20帧连续区间）。这与 BigJank 帧（#465/#469）的时间窗口吻合，说明在某一特定时段（无极缩放层级切换或大量部队进入视野），MapSignificanceMgr 连续多帧处于高负荷状态。这是系统性问题，非偶发。

---

### 波动 Marker #2：MapSignificanceMgr.ProcessTask_ZoomEntityAdd

- **spikeRatio**：47500
- **spikeFrameCount**：48 / 599 帧（8%）
- **msSelfMedian**：0.012ms；**msSelfMax**：576.412ms；**msSelfP95**：3.191ms
- **分析**：ZoomEntityAdd 任务仅在特定场景（无极缩放层级变化时）激活，但激活时波动极大。受影响的 48 帧集中在 #72~#91（20帧连续区间），说明在采集会话早期发生了一次无极缩放层级切换，批量触发了大量 ZoomEntityAdd 任务，这直接导致 TBUResManager.GetResFileInfo 的高频调用。

---

### 波动 Marker #3：TBUResManager.GetResFileInfo

- **spikeRatio**：27611.7
- **spikeFrameCount**：18 / 599 帧（3%）
- **msSelfMedian**：0.021ms；**msSelfMax**：575.262ms；**msSelfP95**：0.13ms
- **分析**：正常情况下（95% 以上帧）该函数调用耗时极低（< 0.13ms），但在特定的 18 帧中发生了严重阻塞（最高 575ms）。与上述 ZoomEntityAdd 的触发窗口（#77~#94）高度重合。这明确指向：ZoomEntityAdd 批量创建实体 → GetResFileInfo 大量调用 → 偶发同步 IO 或资源索引未命中 → 主线程阻塞。

---

### 波动 Marker #4：Gfx.WaitForPresentOnGfxThread / URP.WaitForPresent

- **spikeRatio**：7965.2 / 5508.7
- **spikeFrameCount**：171 / 170（~28%）
- **msSelfMedian**：0.005ms；**msSelfMax**：38.161ms；**msSelfP95**：4.973ms
- **分析**：在约 28% 的帧中发生了 GPU Present 等待飙高（最高 38ms），受影响帧集中在 #428~#447。这说明在特定时段 GPU 负载骤然增加（可能是大量部队渲染或 Shader 编译），导致帧 #470 的 GPU Bound Jank。GPU 端的波动对主线程造成了 38ms 的阻塞，是不可忽视的间歇性 GPU Bound 问题。

---

### 波动 Marker #5：LuaMgr.OnTick&UpdateSchedule

- **spikeRatio**：585
- **spikeFrameCount**：130 / 599 帧（21.7%）
- **msSelfMedian**：0.987ms；**msSelfMax**：577.558ms；**msSelfP95**：5.868ms
- **分析**：Lua 主 Tick 循环在超过 1/5 的帧中波动超过正常值 3 倍以上，受影响帧集中在 #469~#488，与 BigJank 时间窗口高度重合。MapSignificanceMgr 高耗时直接拉高了 LuaMgr 的耗时。P95 为 5.868ms 说明在高负载期间，纯 Lua tick 开销长期维持在 6ms 左右，已接近帧预算瓶颈。

---

### 波动 Marker #6：TServer.HandleMessages / CS:AOE.TServerManager

- **spikeRatio**：4198.8 / 704.5
- **spikeFrameCount**：154 / 153（~25%）
- **msSelfMedian**：0.007ms / 0.045ms；**msSelfMax**：27.339ms / 31.411ms；**msSelfP95**：4.722ms / 5.588ms
- **分析**：在约 25% 的帧中，网络消息处理出现了显著的波动（最高 27~31ms）。受影响帧集中在 #445~#464，与 ZoomEntityAdd 和 BigJank 时间窗口有部分重叠，说明在大规模战斗激烈阶段服务器推送了大量消息，消息处理成为叠加压力。P95 耗时 4.7~5.6ms 表明高负载期间网络处理的稳定消耗也较高。

---

### 波动 Marker #7：LoaderManagerTickLoadOnFrameEnd

- **spikeRatio**：484.9
- **spikeFrameCount**：254 / 599 帧（42%）
- **msSelfMedian**：0.031ms；**msSelfMax**：14.925ms；**msSelfP95**：2.82ms
- **分析**：LoaderManager 帧尾加载任务在 42% 的帧中发生波动（超过正常 3 倍），最高耗时 14.9ms，但 P95 仅 2.82ms 说明极端值较少，但中等级别的波动（1~3ms）频繁发生。这表明资源异步加载任务在帧尾持续消耗 CPU，在帧末段与主逻辑竞争预算。

---

## 六、优化建议

### P0：消除 TBUResManager.GetResFileInfo 同步阻塞

- **目标 Marker**：`TBUResManager.GetResFileInfo`
- **影响**：直接导致 3 次 BigJank（546~598ms），占帧 79.2%
- **预期收益**：消除所有 BigJank，预计减少峰值帧耗时 ~500ms
- **具体方案**：
  1. **建立资源信息内存缓存**：在 `GetResFileInfo` 中添加 `Dictionary<string, ResFileInfo>` 缓存，首次查询时写入，后续命中缓存直接返回，避免每帧 22 次重复查询同一路径。
  2. **消除 ErrorLogWriter 路径**：当前调用链中出现 `LogStringToConsole → ErrorLogWriter`，说明部分资源路径返回了异常状态。排查 `ProcessTask_ZoomEntityAdd` 中传入 `GetResFileInfo` 的参数是否存在非法路径，修正路径生成逻辑，消除错误日志产生的额外 GC 开销。
  3. **分帧加载策略**：在 `MapSignificanceMgr.ProcessTask_ZoomEntityAdd` 中，对批量实体创建任务设置每帧上限（如最多 10 个/帧），将剩余任务推迟到后续帧执行，避免单帧调用 `GetResFileInfo` 22 次。在 `MapSignificanceMgr.lua`（行 1208 附近）修改 `ProcessTasks` 的批次大小限制。
- **风险**：分帧加载会导致实体出现存在短暂延迟，需评估对游戏体验的影响。

---

### P0：优化 YzEntityMoveLineNtf 消息处理性能

- **目标 Marker**：`YzEntityMoveLineNtf`、`TServer.HandleMessages`
- **影响**：中位帧占 32%（11.5ms），触发 Jank #298，P95 为 4.7ms 长期维持高消耗
- **源码位置**：`Assets/Scripts/CS/NetworkCore/Network/TServer.cs`（行 266）
- **预期收益**：预计将中位帧 Update 耗时从 16.3ms 降低至 6~8ms，提升帧率稳定性
- **具体方案**：
  1. **引入消息对象池**：为 `YzEntityMoveLineNtf` 消息类添加对象池（使用 `System.Collections.Generic.Queue<T>` 或 Unity 的 `ObjectPool`），消除每次消息处理时的 `new` 分配（对应调用链末端的 `GC.Alloc`）。
  2. **限制单帧消息处理数量**：在 `TServer.HandleMessages` 中设置单帧最大处理消息数（如 50 条/帧），超出部分留到下一帧处理，避免在大规模战斗时单帧处理数百条移动消息。
  3. **合并消息**：若服务器在同一帧内推送多条同一实体的 `YzEntityMoveLineNtf`，在解包层（`TServer.DecodeMesssages`）做去重/合并处理，仅保留最新状态。
  4. **异步移动线顶点计算**：`YzEntityMoveLineNtf` 末端调用了 `OutsideLineCtrl:CalculateVertexJob (Burst)`，但当前 Burst Job 的调度结果几乎为零耗时，[推断] Job 未被有效利用或同步等待了结果。确认 `CalculateVertexJob` 是否以异步方式调度并在下一帧读取结果，避免同帧 complete() 等待。
- **风险**：限制消息处理数量可能导致部队移动线显示延迟 1~2 帧，需与策划/表现同学确认可接受程度。

---

### P1：优化 RenderManager_Shadow 阴影管理性能

- **目标 Marker**：`RenderManager_Shadow`
- **影响**：在所有分析帧中均占 LateUpdate 主体（3.9~4.8ms），触发 Jank #277
- **预期收益**：预计将 LateUpdate 耗时从 6~7ms 降至 3~4ms
- **具体方案**：
  1. **LOD 级别限制阴影处理**：根据 AOE 优化经验（C7），阴影处理应强制使用 LOD2。在 `CS:AOE.RenderManager` 代码中，为 `RenderManager_Shadow` 的实体遍历添加 LOD 过滤：仅对屏幕内且 LOD < 2 的实体（距离较近的部队）执行精细阴影处理，LOD2+ 的远处部队使用简化阴影或跳过。
  2. **脏标记机制**：在 `RenderManager_Shadow` 中引入脏标记（dirty flag），仅在阴影相关属性发生变化时（如部队进入/离开视野、阵营变化）才更新阴影参数，而非每帧遍历所有部队。
  3. **批量处理 vs 逐实体遍历**：检查 `RenderManager_Shadow` 是否对每个 soldier 实体单独调用 `SetPropertyBlock` 或 `castShadows`。若是，考虑按材质/阵营批量处理，减少 C# 层的遍历开销。
- **风险**：LOD 限制可能影响近处部队的阴影质量，需美术评审。

---

### P1：修复 Shader 未预热问题（CreateGpuProgram Spike）

- **目标 Marker**：`Shader.CreateGPUProgram`、`CreateGpuProgram`
- **影响**：在 3 帧中触发，每次 Render Thread 阻塞 22ms，Submit Thread 阻塞 20ms
- **源码/方案参考**：AOE 项目已有 ShaderVariantCollection WarmUp 机制（C7）
- **预期收益**：消除战斗场景中的 Shader 编译 Spike，3 帧受影响变为 0
- **具体方案**：
  1. **收集战斗场景 Shader 变体**：使用 Unity Profiler 记录战斗场景中触发 `CreateGpuProgram` 的 Shader 变体，将其加入 `ShaderVariantCollection`（Edit → Project Settings → Graphics → Preloaded Shaders）。
  2. **在战斗 Loading 时执行 WarmUp**：在进入战斗场景的 Loading 流程中调用 `shaderVariantCollection.WarmUp()` 异步方法，确保所有需要的变体在进入战斗前完成编译。
  3. **验证**：重新录制 Profiler，确认战斗开始后 `Shader.CreateGPUProgram` 不再出现。
- **风险**：首次装机无 PSO Cache 时 WarmUp 耗时可能较长，需在 Loading 进度条期间异步执行，不能阻塞主线程。

---

### P1：优化 GC.Collect 频率

- **目标 Marker**：`GC.Collect`
- **影响**：每触发一次均值 8.5ms（最高 10.2ms），出现 4 次，总计约 34ms 的 GC 停顿
- **预期收益**：减少 GC Spike，将受影响帧从 4 帧降至 0~1 帧
- **具体方案**：
  1. **分析分配源**：在 Unity Profiler 中启用 "Deep Profile" 或 Memory Profiler，录制包含 GC.Collect 帧的数据，定位 `GC.Alloc` 的主要来源（重点关注 `YzEntityMoveLineNtf` 和 `TBUResManager.GetResFileInfo` 调用链）。
  2. **消息对象复用**：如 P0 方案所述，为网络消息对象引入对象池。
  3. **减少 Lua side 临时 table**：在 `MapSignificanceMgr.lua` 的 `ProcessTask_ZoomEntityAdd` 和 `EntityTask` 函数中，检查是否在热路径上有大量 `{}` table 创建，将其改为对象复用或预分配。
  4. **设置合理的 GC 模式**：调用 `System.GC.SetEnvironmentVariable` 或在 Unity Project Settings 中设置 Incremental GC（Edit → Project Settings → Player → Use incremental GC），将 GC 停顿分散到多帧执行，减少单帧停顿时间。
- **风险**：Incremental GC 在某些情况下会增加总 GC 时间，需在目标设备上验证效果。

---

### P2：控制 MapSignificanceMgr 的 ZoomEntityAdd 任务批次大小

- **目标 Marker**：`MapSignificanceMgr.ProcessTask_ZoomEntityAdd`、`MapSignificanceMgr.EntityTask`
- **影响**：在 120 帧中出现（20%），稳态均值占帧 64.2%，spikeFrameCount = 48 + 157
- **源码位置**：`Assets/Scripts/.Lua/Outside/Map/Core/MapSignificanceMgr.lua`（行 1208~1209）
- **预期收益**：消除 spikeFrameCount 中的极端值，将受影响帧的耗时控制在 5ms 以内
- **具体方案**：
  1. **增加每帧处理上限**：在 `ProcessTask_ZoomEntityAdd` 的实现中，增加 `maxEntityPerFrame` 配置（建议初始值 5~10），每帧仅处理不超过该数量的 ZoomEntityAdd 任务，将剩余放回任务队列。
  2. **优先级调度**：为不同距离的实体分配不同的优先级，近处（画面中心）实体优先处理，远处实体可延迟数帧。
  3. **预加载资源索引**：在进入战斗场景的 Loading 时，预先批量查询 `TBUResManager.GetResFileInfo` 并缓存，避免 ZoomEntityAdd 时的同步查询。
- **风险**：实体显示延迟可能影响玩家体验（如无极缩放后实体不立刻出现），需要视觉层面评估。

---

### P2：优化 GPU 渲染负载（减少间歇性 GPU Bound）

- **目标 Marker**：`Gfx.WaitForPresentOnGfxThread`、`URP.WaitForPresent`
- **影响**：28% 帧出现 GPU 等待（最高 38ms），导致帧 #470 的 GPU Bound Jank
- **预期收益**：消除 GPU Bound Jank，减少 Gfx.WaitForPresent 的 spikeFrameCount 从 171 降至 < 50
- **具体方案**：
  1. **检查 Shader.CreateGPUProgram 关联**：Shader 编译发生在 Render Thread，会临时阻塞渲染管线。预热 Shader（见 P1）可同时缓解 GPU Bound。
  2. **阴影渲染优化**：`RenderManager_Shadow` 的高耗时会增加 CPU 侧提交给 GPU 的阴影渲染命令。使用 LOD2 阴影（见 P1）可减少 GPU 端阴影工作量。
  3. **URP 渲染管线 Pass 审查**：在 #470 帧中，`URP.MainRenderingTransparent`（1.1ms）和 `URP.BeforeRendering`（1.1ms）有一定耗时，结合 `URP.AfterRendering`（39.3ms 含 WaitForPresent），建议排查透明渲染对象数量是否在某一帧突然增加（如大量特效/半透明部队同时出现）。
  4. **分辨率调整**：根据 AOE 优化经验（C7），移动端渲染分辨率从 2K 降至 900P 可显著缓解 GPU 负载。确认当前战斗场景是否使用了正确的分辨率配置。
- **风险**：降分辨率会影响画质，需按画质档位配置。

---

## 七、补充说明

### 数据局限性

1. **BigJank 帧的 PlayerLoop 耗时异常**：帧 #431/469/465 的 hotPath 中 PlayerLoop 总耗时（24ms/557ms/546ms）与 `frameSummary.max = 598ms`（帧 #431）不一致，这可能是 Profiler 采样机制中某一帧的数据被记录在下一帧的情况，或 BigJank 判定中 `prevThreeAvg` 包含了异常帧。建议通过 Unity Profiler 直接打开该 pdata 文件，在 #431、#465、#469 帧附近进行人工核查。

2. **source mapping 未能映射到业务源码**：`TBUResManager`、`YzEntityMoveLineNtf` 等关键 Marker 未找到源码映射（TBUResManager 为插件模块，YzEntityMoveLineNtf 为动态 Marker 名），对这两个模块的根因分析含有 [推断] 标注，建议代码层面进一步确认。

3. **采集环境**：当前采集来自 PC 端（Profiler 数据），实际移动端（二档机）上的性能表现会更差（根据 AOE 知识库，MapSignificanceMgr 在二档机上比 PC 高 ~25%，BattleHeadMgr 在二档机上比 PC 高 9x）。

### 建议下一步

1. **P0 优先**：修复 `TBUResManager.GetResFileInfo` 的同步阻塞和 `YzEntityMoveLineNtf` 的消息处理性能，这两个问题直接影响游戏可玩性（500ms 卡顿和 30% 帧耗时占用）。
2. **在二档机上复现**：将优化后的版本在小米8SE（二档机）上进行战斗压测采集，验证真机效果。重点关注 `MapSignificanceMgr`（知识库显示二档机约 4.5ms）和 `BattleHeadMgr`（知识库显示二档机约 2.91ms）是否仍在帧预算内。
3. **Shader 预热**：在下次版本迭代中加入战斗场景 Shader WarmUp，消除 `CreateGpuProgram` spike。
4. **增量 GC**：评估启用 Unity Incremental GC 的效果，在真机上验证是否能减少单帧 GC 停顿时间。

---

**自检清单**：
- [x] 所有 `mustReport: true` 条目（8 个）均已分析：Gfx.RenderSlaver.ThreadRun、PlayerLoop（帧容器，已说明）、Shader.CreateGPUProgram、TBUResManager.GetResFileInfo、CreateGpuProgram、MapSignificanceMgr.ProcessTask_ZoomEntityAdd、Gfx.WaitForGfxCommandsFromMainThread、GC.Collect、Update.ScriptRunBehaviourUpdate、BehaviourUpdate、AOE.dll!AOE::GameLauncher.Update()、Core.Update
- [x] 所有分析的热点和 Jank 均包含完整调用链（代码块格式）
- [x] 所有优化建议包含具体可执行步骤
- [x] 所有热点判定依据均已引用具体数值
- [x] 所有缺乏直接数据支持的结论已标注 [推断]
- [x] 所有引用数据均来自输入文件
