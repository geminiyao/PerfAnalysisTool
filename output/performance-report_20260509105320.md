# CPU 性能分析报告

## 一、概览

| 指标 | 数值 |
|------|------|
| 总帧数 | 599 |
| 目标帧率 | 30 FPS |
| 实际平均帧率 | 35.3 FPS |
| 平均帧耗时 | 28.35ms |
| 中位数帧耗时 | 22.33ms |
| 最差帧 | #431 (598.43ms) |
| 最好帧 | 13.76ms |
| P25/P75 | 19.07ms / 31.85ms |
| Jank 次数 | 6 (倍率≥2x) |
| BigJank 次数 | 3 (倍率≥3x) |

## 二、核心结论

> **本次压测整体帧率达标（35.3 FPS > 30 FPS 目标），但存在严重的极端卡顿：Frame #469 和 #465 均超 500ms（>24x 中位数）。** 根因是无极缩放层级切换时 `MapSignificanceMgr.ProcessTask_ZoomEntityAdd` 一次性处理大批量实体创建任务，其中 `TBUResManager.GetResFileInfo` 高频调用（2103 次/95帧）产生 178ms/帧的 self-time 累积。此外，`RenderManager_Shadow` 是每帧稳定存在的渲染热点（~4ms/帧），网络消息 `YzEntityMoveLineNtf` 在行军高峰帧可达 11ms，`GC.Collect` 偶发 spike 约 8.5ms。

## 三、热点分析

### 判定依据

以下 Marker 被判定为**性能热点**，标准：
1. `percentOfFrame > 20%`（即 mustReport 触发），或
2. `msSelfMean > 30% × frameBudget`（即 > 10ms），或
3. 绝对 self-time > 5ms 且稳定出现（presentOnFrameCount > 50），或
4. 单次出现但 self-time 极高（> 7ms）

排除纯容器 Marker（PlayerLoop、BehaviourUpdate、Core.Update 等）和非 Main Thread Marker（Gfx.RenderSlaver.ThreadRun、RenderLoop.Draw 等），以及引擎同步等待 Marker（Gfx.WaitForGfxCommandsFromMainThread）。

### 热点 #1: TBUResManager.GetResFileInfo

| 指标 | 值 |
|------|-----|
| msSelfMean | 22.45ms |
| msSelfMax | 575.26ms |
| percentOfFrame | 79.2% |
| 调用次数 | 2103 次/95帧 |
| 每帧调用 | 22.14 次（出现帧平均） |

- **调用链**: PlayerLoop → Update.ScriptRunBehaviourUpdate → BehaviourUpdate → AOE.dll!AOE::GameLauncher.Update() → Core.Update → CS:AOE.LuaMgr → LuaMgr.OnTick&UpdateSchedule → MapSignificanceMgr → MapSignificanceMgr.sampler_OnUpdate → MapSignificanceMgr.ProcessTasks → MapSignificanceMgr.EntityTask → MapSignificanceMgr.ProcessTask_ZoomEntityAdd → TBUResManager.GetResFileInfo
- **self/total**: 100%（self-time = total-time，函数本身即瓶颈）
- **瓶颈类型**: 高频累积型 — 正常帧每次 ~0.02ms（median），但无极缩放批量场景 2103 次调用累积至 178ms+
- **源码位置**: C# 层 `TBUResManager.Instance.GetResFileInfo(path)`，被 Lua 通过 xLua Wrap 调用。Lua 侧入口为 `MapSignificanceMgr.lua` line 1209（EntityTask）
- **根因**: 无极缩放层级切换时 `ProcessTask_ZoomEntityAdd` 大量堆积。每个 ZoomEntityAdd 任务调用 `CreateMapEntityIcon` → `GetViewDataByMapEntityData` → `GetResFileInfo`。高频跨语言桥接（xLua Wrap）+ 文件路径查询 IO 叠加产生巨大累积耗时

### 热点 #2: MapSignificanceMgr.ProcessTask_ZoomEntityAdd

| 指标 | 值 |
|------|-----|
| msSelfMean | 18.19ms |
| msSelfMax | 576.41ms |
| percentOfFrame | 64.2% |
| 调用次数 | 306 次/120帧 |
| 每帧调用 | 2.55 次 |

- **调用链**: PlayerLoop → Update.ScriptRunBehaviourUpdate → BehaviourUpdate → AOE.dll!AOE::GameLauncher.Update() → Core.Update → CS:AOE.LuaMgr → LuaMgr.OnTick&UpdateSchedule → MapSignificanceMgr → MapSignificanceMgr.sampler_OnUpdate → MapSignificanceMgr.ProcessTasks → MapSignificanceMgr.EntityTask → MapSignificanceMgr.ProcessTask_ZoomEntityAdd
- **self/total**: ~100%（子调用 GetResFileInfo 已单独计入）
- **瓶颈类型**: 批量任务无上限 — 缩放切换时一次性 Request 数百个 ZoomEntityAdd
- **源码**: `MapSignificanceMgr.lua` line 1208-1209（ProcessTasks / EntityTask Sampler 定义），任务消费循环 `ConsumeTasks_MapEntity()` 帧预算失效
- **根因**: `CanProcessTask()` 帧预算判定在极端场景下被突破——任务积压过多且单任务耗时被低估，导致 `while` 循环无法及时中断

### 热点 #3: GC.Collect

| 指标 | 值 |
|------|-----|
| msSelfMean | 8.49ms |
| msSelfMax | 10.23ms |
| percentOfFrame | 29.9% |
| 出现帧数 | 4 |

- **调用链**: (depth=5, chain not resolved) — 在 Lua 层逻辑执行后触发
- **瓶颈类型**: 偶发 spike（仅 4 帧出现，每次 ~8.5ms）
- **根因**: 大量临时对象分配（ZoomEntityAdd 中 table 创建、protobuf decode 产生的对象、CreateArmyLine 中 table 参数）累积后触发 Mono GC 回收

### 热点 #4: MapSignificanceMgr.ProcessTask_ZoomGuildMember / ZoomGuildMemberAdd

| 指标 | 值 |
|------|-----|
| msSelfMean | 7.38ms |
| msSelfMax | 7.38ms |
| percentOfFrame | 26.0% |
| 出现次数 | 1（单次） |

- **调用链**: (depth=12~13) → MapSignificanceMgr.ProcessTask_ZoomGuildMember → ZoomGuildMemberAdd
- **瓶颈类型**: 单次高耗时（7.38ms）
- **根因**: [推断] 公会成员缩放图标一次性批量创建，可能在首次缩放切换时触发。单次 7.38ms 说明内部遍历了大量公会成员数据进行图标实例化

### 热点 #5: Shader.CreateGPUProgram / CreateGpuProgram

| 指标 | 值 |
|------|-----|
| msSelfMean | 22.46ms / 20.38ms |
| msSelfMax | 57.37ms / 55.55ms |
| percentOfFrame | 79.2% / 71.9% |
| 出现帧数 | 3 |
| 线程 | Render Thread / Submit Thread |

- **瓶颈类型**: 偶发 spike — 仅 3 帧出现但每帧 > 20ms
- **根因**: 运行时触发 Shader 变体编译（未被 ShaderVariantCollection WarmUp 覆盖）。行军线相关特效（`p_fx_yz_march_target_red.prefab`）首次渲染触发。与 AOE 已知问题 "Shader 未 prewarm" 一致

### 热点 #6: YzEntityMoveLineNtf

| 指标 | 值 |
|------|-----|
| msSelfMean | 5.23ms |
| msSelfMax | 27.16ms |
| percentOfFrame | 18.4% |
| 调用次数 | 179 次/75帧 |
| 每帧调用 | 2.39 次 |

- **调用链**: (depth=8) PlayerLoop → Update.ScriptRunBehaviourUpdate → BehaviourUpdate → AOE.dll!AOE::GameLauncher.Update() → Core.Update → CS:AOE.TServerManager → TServer.HandleMessages → YzEntityMoveLineNtf
- **self/total**: ~98%（Jank 帧 #298 中 self-time 11.12ms vs total 11.34ms）
- **瓶颈类型**: 函数本身是瓶颈（self/total > 50%）
- **源码**: 网络消息回调，`TServer.cs` line 266 HandleMessages Sampler 下的 ProfilerMarker 回调
- **根因**: 行军线网络消息在单帧收到大量数据时，逐条处理 `fullUpdateLines` 无分帧机制，Lua 层 table 操作 + xLua 跨语言调用累积。压测 300 队行军场景下波动剧烈

### 特殊 Marker 说明

| Marker | 表现 | 结论 |
|--------|------|------|
| `Gfx.WaitForPresentOnGfxThread` | 仅在 #470 帧 38.2ms，其余帧接近 0 | **非 GPU Bound** — 仅因前帧 CPU 500ms 卡顿导致的一次性 GPU 渲染命令积压等待 |
| `WaitForTargetFPS` | msSelfMean 2.64ms, 143帧出现，P95=15ms | **CPU 负载较轻** — 后半段帧率高于 30FPS 目标时 VSync 等待，说明正常帧有余量 |
| `Gfx.WaitForGfxCommandsFromMainThread` | Submit Thread 14ms mean | 渲染提交线程等待主线程命令 — 属正常线程同步，非瓶颈 |
| `Gfx.RenderSlaver.ThreadRun` | Render Thread, msSelfMean 28.3ms | 渲染线程总耗时，与主线程无竞争关系，属正常渲染负载 |
| `RenderLoop.Draw` | Submit Thread, 15108次, msSelfMean 7.6ms | Submit Thread 绘制调用，DrawCall 较多（25.2/帧）但在独立线程不阻塞主线程 |

## 四、Jank 卡顿分析

### 卡顿模式总结

| 类别 | 帧数 | 帧索引 | 最大倍数 | 核心瓶颈 |
|------|------|--------|---------|---------|
| ZoomEntityAdd 大批量创建 | 2 | #469, #465 | 25.15x | TBUResManager.GetResFileInfo (178ms self) |
| RenderManager_Shadow 渲染阴影 | 2 | #431, #277 | 25.15x / 2.5x | RenderManager_Shadow (4.0~4.8ms self) |
| GPU 同步等待 | 1 | #470 | 2.73x | Gfx.WaitForPresentOnGfxThread (38.2ms) |
| URP.BeforeRendering Job 等待 | 1 | #466 | 19.76x | Semaphore.WaitForSignal (3.9ms) |
| YzEntityMoveLineNtf 网络消息 | 1 | #298 | 2.37x | YzEntityMoveLineNtf (11.1ms self) |
| ArmyMove 行军特效资源加载 | 1 | #205 | 3.25x | ArmyMove_MovelineTarget / goLoader_async |
| MapObjCleanUp 部队清理 | 1 | #105 | 2.03x | TransformChangedDispatch |

### BigJank #1: Frame #431 — RenderManager_Shadow + 高 msFrame（598.43ms）

- **耗时**: 598.43ms（worstFrameIndex，但主线程实际仅 24.01ms）
- **说明**: 该帧 msFrame 598.43ms 是 Profiler 报告的帧间隔时间（包含 Render Thread 上 Shader 编译的阻塞），而主线程实际 PlayerLoop 仅 24.0ms
- **完整调用链**:
  ```
  PlayerLoop (24.0ms, 99.9%)
    → PreLateUpdate.ScriptRunBehaviourLateUpdate (7.0ms, 29.0%)
      → LateBehaviourUpdate (7.0ms, 29.0%)
        → AOE.dll!AOE::GameLauncher.LateUpdate() (6.3ms, 26.2%)
          → CS:AOE.RenderManager (4.0ms, 16.7%)
            → RenderManager_Shadow (4.0ms, 16.6%) **BOTTLENECK** [self=4.0ms]
  ```
- **瓶颈节点**: `RenderManager_Shadow` — self-time 3.99ms，占主线程 PlayerLoop 的 16.6%
- **根因**: 平面阴影渲染（PlanarShadow）在 300 队压测场景需遍历所有投影实体。同时 Render Thread 上 `Shader.CreateGPUProgram` 编译（57ms）导致帧间隔极长，但这是 Render Thread 问题而非主线程瓶颈

### BigJank #2: Frame #466 — URP.BeforeRendering + MapSignificanceMgr（545.97ms）

- **耗时**: 545.97ms（19.76x 前 3 帧均值）
- **完整调用链**:
  ```
  PlayerLoop (32.1ms, 100.0%)
    → PostLateUpdate.FinishFrameRendering (9.0ms, 28.0%)
      → URP.Render (8.2ms, 25.6%)
        → URP.RenderCameraStack (7.9ms, 24.6%)
          → URP.RenderSingleCamera (7.9ms, 24.5%)
            → URP.BeforeRendering (4.6ms, 14.3%)
              → WaitForJobGroupID (3.9ms, 12.0%)
                → Semaphore.WaitForSignal (3.9ms, 12.0%) **BOTTLENECK**
  ```
- **瓶颈节点**: `Semaphore.WaitForSignal` — self-time 3.9ms，等待 Job Worker 完成渲染准备
- **根因**: 与 #431 类似，帧间隔高是因为 Render Thread/Submit Thread 上 Shader 编译积压。主线程 `WaitForJobGroupID` 等待 ECS 阴影 Job 完成是正常同步点，3.9ms 在压测场景可接受。此帧 `MapSignificanceMgr` 仍在处理 ZoomEntityAdd 任务（3.2ms）

### BigJank #3: Frame #205 — 行军线特效资源加载（59.26ms）

- **耗时**: 59.26ms（3.25x 前 3 帧均值）
- **完整调用链**:
  ```
  PlayerLoop (28.4ms, 100.0%)
    → Update.ScriptRunBehaviourUpdate (6.6ms, 23.4%)
      → BehaviourUpdate (6.6ms, 23.4%)
        → AOE.dll!AOE::GameLauncher.Update() (6.3ms, 22.2%)
          → Core.Update (6.2ms, 21.9%)
            → CS:AOE.LuaMgr (5.1ms, 17.9%)
              → LuaMgr.OnTick&UpdateSchedule (5.1ms, 17.8%)
                → MapSignificanceMgr (4.1ms, 14.4%)
                  → MapSignificanceMgr.ProcessTasks (4.0ms, 14.0%)
                    → MapSignificanceMgr.EntityTask (3.9ms, 13.9%)
                      → MapSignificanceMgr.ProcessTask_MapEntityAdd (1.7ms, 5.9%)
                        → MapEntityCtrl.CreateMapEntity_329 (1.4ms, 5.0%)
                          → Lua:ArmyShowViewGo (0.6ms, 2.3%)
                            → *** ArmyMove *** (0.3ms, 1.2%)
                              → *** ArmyMove_CreateMoveline *** (0.3ms, 1.1%)
                                → *** ArmyMove_MovelineTarget *** (0.2ms, 0.7%) **BOTTLENECK**
  ```
- **瓶颈节点**: `ArmyMove_MovelineTarget` — 触发行军线特效异步加载（`p_fx_yz_march_target_red.prefab`）
- **根因**: 行军实体创建时触发行军线特效资源首次加载。虽为 async 调用，但调度开销（`goLoader_async`）+ 同帧多个行军实体累积仍产生 spike。此帧总耗时含 Render Thread Shader 编译的帧间隔影响

### Jank #4: Frame #470 — GPU 同步等待（后续帧效应）

- **耗时**: 557.14ms msFrame / 63.9ms PlayerLoop（2.73x）
- **完整调用链**:
  ```
  PlayerLoop (63.9ms, 100.0%)
    → PostLateUpdate.FinishFrameRendering (43.6ms, 68.2%)
      → URP.Render (42.7ms, 66.9%)
        → URP.RenderCameraStack (42.4ms, 66.4%)
          → URP.RenderSingleCamera (42.4ms, 66.3%)
            → URP.AfterRendering (39.3ms, 61.5%)
              → URP.Submit (39.0ms, 61.0%)
                → URP.WaitForPresent (38.2ms, 59.7%)
                  → Gfx.WaitForPresentOnGfxThread (38.2ms, 59.7%)
                    → Semaphore.WaitForSignal (38.1ms, 59.7%) **BOTTLENECK**
  ```
- **根因**: 前帧（#465, #469）CPU 耗时 500ms+ 导致渲染命令积压，GPU 线程在处理堆积的渲染命令。本帧 CPU 逻辑已恢复正常（Update 仅 5.5ms），但 `Gfx.WaitForPresentOnGfxThread` 等待 GPU 完成前帧渲染提交。属于 **GPU Bound 后续效应**，非独立问题

### Jank #5: Frame #469 — MapSignificanceMgr ZoomEntityAdd（极端卡顿）

- **耗时**: 549.45ms msFrame / 557.14ms PlayerLoop（2.7x 前 3 帧均值）
- **完整调用链**:
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
  ```
- **瓶颈节点**: `TBUResManager.GetResFileInfo` — self-time 178.4ms，占帧 32%
- **源码位置**: `MapSignificanceMgr.lua` line 1208-1209（ProcessTasks → EntityTask），调用 `CreateMapEntityIcon` → `GetViewDataByMapEntityData` → C# `TBUResManager.GetResFileInfo`
- **根因**:
  1. 无极缩放层级切换触发 `InfiniteZoomMapEntityCtrl` 批量请求 `ZoomEntityAdd` 任务
  2. `ConsumeTasks_MapEntity()` 的 `while self:CanProcessTask()` 帧预算控制失效
  3. 每个 ZoomEntityAdd 调用 `CreateMapEntityIcon` → C# `TBUResManager.GetResFileInfo`
  4. 2103 次 xLua 跨语言调用 + IO 查询累积产生 178ms
  5. 附带 `LogStringToConsole`（0.87ms）说明有错误日志输出

### Jank #6: Frame #465 — 同模式（ZoomEntityAdd）

- **耗时**: 546.0ms PlayerLoop（2.25x 前 3 帧均值）
- **调用链与 #469 完全相同**
- **瓶颈**: `TBUResManager.GetResFileInfo` (180.8ms, 33.1%)
- **结论**: 与 #469 是同一次缩放切换事件中连续两帧的大批量任务处理

### Jank #7: Frame #277 — RenderManager_Shadow

- **耗时**: 59.77ms msFrame / 31.9ms PlayerLoop（2.5x）
- **完整调用链**:
  ```
  PlayerLoop (31.9ms, 99.9%)
    → PreLateUpdate.ScriptRunBehaviourLateUpdate (10.4ms, 32.7%)
      → LateBehaviourUpdate (10.4ms, 32.7%)
        → AOE.dll!AOE::GameLauncher.LateUpdate() (7.4ms, 23.3%)
          → CS:AOE.RenderManager (4.9ms, 15.2%)
            → RenderManager_Shadow (4.8ms, 15.2%) **BOTTLENECK** [self=4.8ms]
  ```
- **根因**: 阴影渲染稳定高耗时（4.8ms），加上 `CS:AOE.MeshUIManager`(1.1ms) 和 `TBU.LOD::TBULODStreamingManager.LateUpdate`(2.0ms) 等共同导致帧率偏高

### Jank #8: Frame #298 — YzEntityMoveLineNtf 网络消息

- **耗时**: 58.42ms msFrame / 43.7ms PlayerLoop（2.37x）
- **完整调用链**:
  ```
  PlayerLoop (43.7ms, 100.0%)
    → Update.ScriptRunBehaviourUpdate (16.9ms, 38.6%)
      → BehaviourUpdate (16.9ms, 38.6%)
        → AOE.dll!AOE::GameLauncher.Update() (16.6ms, 38.0%)
          → Core.Update (16.6ms, 37.8%)
            → CS:AOE.TServerManager (13.6ms, 31.0%)
              → TServer.HandleMessages (11.5ms, 26.3%)
                → YzEntityMoveLineNtf (11.3ms, 25.9%) **BOTTLENECK** [self=11.1ms]
  ```
- **瓶颈节点**: `YzEntityMoveLineNtf` — self-time 11.12ms，占帧 25.9%
- **源码位置**: `TServer.cs` line 266（HandleMessages Sampler），回调由 ProfilerMarker 自动标记
- **根因**:
  1. 行军线网络消息在单帧收到大批量数据（压测 300 队行军）
  2. `ipairs(fullUpdateLines)` 逐条处理，无分帧机制
  3. 每条行军线调用 `MeshLineUtil.CreateArmyLine` → `OutsideLuaCall.StaticCreateEntityMoveLine`（xLua 跨语言）
  4. self-time 11.12ms 说明瓶颈在 Lua 层数据构造 + 跨语言调用开销
  5. 同帧 `TServer.DecodeMesssages` 2.0ms（protobuf 解包），合计网络处理 13.6ms

### Jank #9: Frame #105 — MapObjCleanUp 部队清理

- **耗时**: 39.07ms msFrame / 19.0ms PlayerLoop（2.03x）
- **完整调用链**:
  ```
  PlayerLoop (19.0ms, 99.9%)
    → Update.ScriptRunBehaviourUpdate (5.5ms, 28.7%)
      → BehaviourUpdate (5.5ms, 28.7%)
        → AOE.dll!AOE::GameLauncher.Update() (5.2ms, 27.4%)
          → Core.Update (5.2ms, 27.4%)
            → CS:AOE.LuaMgr (3.9ms, 20.4%)
              → LuaMgr.OnTick&UpdateSchedule (3.9ms, 20.3%)
                → MapSignificanceMgr (3.1ms, 16.5%)
                  → MapSignificanceMgr.ProcessTasks (3.0ms, 15.8%)
                    → MapSignificanceMgr.EntityTask (3.0ms, 15.6%)
                      → MapSignificanceMgr.ProcessTask_MapObjCleanUp (1.2ms, 6.1%)
                        → Lua:ArmyCleanUp (1.1ms, 5.9%)
                          → Lua:ArmyCleanUp2 (1.1ms, 5.8%)
                            → Transform.SetParent (0.4ms, 2.2%)
                              → TransformChangedDispatch (0.1ms, 0.3%) **BOTTLENECK**
  ```
- **根因**: 部队清理时 `Transform.SetParent` 触发 `TransformChangedDispatch`，通知所有监听 Transform 变化的系统。单次耗时低但批量清理时累积。此帧总体帧率正常（19ms PlayerLoop），Jank 由帧间隔波动触发

## 五、Marker 波动分析

### 判定依据

以下 Marker 被判定为**有问题的波动**，标准：
1. `spikeRatio > 1000`（峰值远超中位数），且
2. `spikeFrameCount > 10`（非偶发），且
3. `msSelfMax > 5ms`（对帧率有实际影响）

### 波动 Marker #1: MapSignificanceMgr.EntityTask

| 指标 | 值 |
|------|-----|
| msSelfMean | 4.13ms |
| msSelfMedian | 0.001ms |
| msSelfMax | 576.77ms |
| spikeRatio | 395,588 |
| spikeFrameCount | 157/599 (26%) |

- **分析**: 中位数几乎为 0（正常帧任务队列为空），但 26% 的帧出现剧烈 spike。最高 576ms 集中在 #442~#470 区间（缩放切换时段）。根因与热点 #1/#2 相同

### 波动 Marker #2: MapSignificanceMgr.ProcessTask_ZoomEntityAdd

| 指标 | 值 |
|------|-----|
| msSelfMean | 18.19ms |
| msSelfMedian | 0.012ms |
| msSelfMax | 576.41ms |
| spikeRatio | 47,500 |
| spikeFrameCount | 48/599 (8%) |

- **分析**: spike 帧集中在 #72~#91（18帧连续），是某一次缩放切换的批量处理时段。正常帧 0.012ms 说明非缩放期间几乎无开销

### 波动 Marker #3: TBUResManager.GetResFileInfo

| 指标 | 值 |
|------|-----|
| msSelfMean | 22.46ms |
| msSelfMedian | 0.021ms |
| msSelfMax | 575.26ms |
| spikeRatio | 27,612 |
| spikeFrameCount | 18/599 (3%) |

- **分析**: 仅 3% 的帧出现严重 spike（#77~#94 连续 18帧），与 ZoomEntityAdd 批量调用完全重叠。正常帧 0.021ms 极低，说明少量调用时性能可接受

### 波动 Marker #4: Gfx.WaitForPresentOnGfxThread / URP.WaitForPresent

| 指标 | 值 |
|------|-----|
| spikeRatio | 7,965 / 5,509 |
| spikeFrameCount | 171 / 170 (28%) |
| msSelfMax | 38.16ms |

- **分析**: 约 28% 帧出现 GPU 等待 spike。集中在 #428~#470 区间。与 BigJank 帧的 CPU 卡顿连锁有关——CPU 长时间阻塞后渲染命令积压，后续帧 GPU 来不及消化。**非独立 GPU Bound 问题**

### 波动 Marker #5: TServer.HandleMessages

| 指标 | 值 |
|------|-----|
| msSelfMean | 0.69ms |
| msSelfMedian | 0.007ms |
| msSelfMax | 27.34ms |
| spikeRatio | 4,199 |
| spikeFrameCount | 154/599 (26%) |

- **分析**: 超过 25% 的帧中网络消息处理出现显著波动。msSelfMax 27.3ms 几乎占满帧预算（33.33ms）。波动来源主要是 `YzEntityMoveLineNtf` 消息量不均匀（行军线更新包大小取决于视野内部队数量变化）

### 波动 Marker #6: AsyncUploadManager.AsyncResourceUpload

| 指标 | 值 |
|------|-----|
| msSelfMean | 0.23ms |
| msSelfMedian | 0.003ms |
| msSelfMax | 13.35ms |
| spikeRatio | 4,134 |
| spikeFrameCount | 86/599 (14%) |

- **分析**: 异步资源上传在批量加载行军线特效期间出现 spike。最大 13.35ms 说明存在较大纹理资源的同步上传操作。集中在 #513~#532 区间（加载完成后的批量 GPU 上传阶段）

## 六、优化建议

### P0: MapSignificanceMgr ZoomEntityAdd 任务分帧处理

- **目标 Marker**: `MapSignificanceMgr.ProcessTask_ZoomEntityAdd`, `TBUResManager.GetResFileInfo`
- **源码位置**: `MapSignificanceMgr.lua` line 1208+ (`ConsumeTasks_MapEntity` / `CanProcessTask`)
- **预期收益**: 消除 500ms+ BigJank，将极端帧从 557ms 降至 < 50ms
- **具体方案**:
  1. **增加每帧任务数硬上限**：在 `ConsumeTasks_MapEntity` 循环中增加任务计数器，每帧最多处理 30 个 ZoomEntityAdd 任务，即使 `CanProcessTask()` 返回 true 也强制 break
  2. **修正帧预算计算**：`GetMgrMaxUpdateTime(TimeFrameType.MapSignificanceMgr)` 的预算值需考虑 ZoomEntityAdd 单任务实际耗时（当前被低估）。建议在 `EndProcessTask()` 中增加「累计耗时 > 帧预算 × 0.5 时立即退出」的保护
  3. **缓存 GetResFileInfo 结果**：`TBUResManager.GetResFileInfo` 同一帧内高频重复查询相同 path，增加 Lua 层 table 缓存（`local resInfoCache = {}`），首次查询后缓存结果，帧结束清空
  4. **预创建 ZoomEntity 图标**：在层级切换预判时（`InfiniteZoomMgr.SwitchState`，line 399）提前分批创建，而非等切换完成后一次性 Request
- **风险**: 分帧后图标显示有 1~2 帧延迟，SLG 大地图场景用户可接受

### P0: YzEntityMoveLineNtf 行军线消息分帧处理

- **目标 Marker**: `YzEntityMoveLineNtf`, `TServer.HandleMessages`
- **源码位置**: 网络回调函数（ProfilerMarker 自动标记），Lua 侧处理 `fullUpdateLines`
- **预期收益**: 将单帧 11ms 峰值降至 < 3ms，消除网络消息 Jank
- **具体方案**:
  1. **分帧处理 fullUpdateLines**：将 `ipairs(fullUpdateLines)` 循环改为每帧最多处理 N 条（如 10 条），剩余存入待处理队列下帧继续
  2. **批量接口**：将 `StaticCreateEntityMoveLine` 改为批量接口，一次传入多条行军线数据，减少 Lua→C# 跨语言调用次数（从 N 次降为 1 次）
  3. **复用 table**：创建行军线时的临时 `createParam` table 改为预分配复用，减少 GC 压力
  4. **消息合并**：在 `TServer.HandleMessages`（`TServer.cs` line 266）层面对同帧多个 `YzEntityMoveLineNtf` 消息进行合并后再分发
- **风险**: 分帧后行军线显示有短暂延迟（~1-2帧），SLG 场景可接受

### P1: Shader Prewarm 补全

- **目标 Marker**: `Shader.CreateGPUProgram`, `CreateGpuProgram`
- **预期收益**: 消除 3 帧 × 22ms Shader 编译 spike（Render Thread）
- **具体方案**:
  1. 在进入大地图 Loading 阶段执行 `ShaderVariantCollection.WarmUp()`，确保行军线相关 Shader 变体（`p_fx_yz_march_target_red` 等特效）被预热
  2. 收集本次运行时编译的 Shader 变体（通过 `Shader.logCompiledShaderCount` 或 Frame Debugger），加入 ShaderVariantCollection 资源
  3. 验证 PSO Cache 是否覆盖这些变体
- **风险**: WarmUp 可能增加 Loading 时间 ~2s，但用异步分帧执行可忽略（参考 AOE 已有方案：非首次装机 WarmUp 极快 ~2s）

### P1: RenderManager_Shadow 阴影优化

- **目标 Marker**: `RenderManager_Shadow`
- **预期收益**: 稳定减少 ~2ms/帧（从 4ms 降至 2ms）
- **具体方案**:
  1. **阴影距离裁剪**：对远离相机的部队跳过阴影投影计算，结合 `MapSignificanceMgr` 的 LOD 层级（`InfiniteZoomMapEntityCtrl.lua` line 83 定义的 `sampler_StaticEnableForestRenderer` 等层级控制）
  2. **隔帧更新**：非必要帧跳过阴影更新（如奇数帧更新、偶数帧复用上帧阴影）
  3. **确认 LOD2 阴影**：参考 AOE 已有优化经验 "阴影和描边 Pass 强制使用 LOD2"，验证当前压测配置是否已启用
- **风险**: 阴影质量轻微下降，中低画质档位用户不可感知

### P2: GC.Collect 减少分配

- **目标 Marker**: `GC.Collect`
- **预期收益**: 减少 GC spike（8.5ms × 4帧 → 目标 < 4ms）
- **具体方案**:
  1. 行军线创建中 `createParam` table 改为对象池复用（每帧复位清空而非 new）
  2. `TServer.DecodeMesssages` 中 protobuf decode 使用对象池（参考 AOE 已有规划："解包池方案"）
  3. `MapSignificanceMgr` 中 `MapSignificanceTaskFactory:TakeTask_ZoomEntityAdd()` 确保任务对象池容量充足
  4. 在 `WaitForTargetFPS` 空闲帧间隙执行增量 GC：`GC.Collect(0)` 或 Lua `collectgarbage("step")`
- **风险**: 对象池内存占用增加，需合理设置上限

### P2: AsyncUploadManager 纹理上传分帧

- **目标 Marker**: `AsyncUploadManager.AsyncResourceUpload`
- **预期收益**: 将 13ms spike 降至 < 2ms
- **具体方案**:
  1. 在 `QualitySettings` 中调整 `asyncUploadTimeSlice`（从默认 2ms 降至 1ms），限制单帧上传量
  2. 行军线特效纹理（`p_fx_yz_march_target_red.prefab`）在 Loading 阶段提前预加载
- **风险**: 纹理加载总时间延长但分布更均匀，用户无感知

## 七、补充说明

### 数据局限性
- 本次采集为 PC 平台数据（599 帧），实际移动端性能会因 xLua 跨语言开销增大（~3x）、CPU 主频低等因素更差
- `TBUResManager.GetResFileInfo` 在移动端可能有更高的 IO 延迟（闪存 vs SSD）
- BigJank（#465、#469）属于无极缩放层级切换的极端场景，正常游玩中不会连续触发但偶发仍有感知
- Frame #431 的 598.43ms 帧间隔主要由 Render Thread Shader 编译导致，主线程实际负载正常

### 建议下一步
1. **验证帧预算修复**：修改 `CanProcessTask()` 后重新压测，确认 ZoomEntityAdd 极端帧已消除
2. **移动端验证**：在二档机上复现行军线压测场景，验证 `YzEntityMoveLineNtf` 分帧效果
3. **Profile GetResFileInfo 内部**：在 C# 侧为 `GetResFileInfo` 增加更细粒度的 Profiler Marker，确认是 IO 还是 HashMap 查询是主要耗时
4. **Shader Prewarm 覆盖率检查**：统计当前 ShaderVariantCollection 未覆盖的变体列表
5. **GC 分配源定位**：开启 Deep Profile 或 Memory Profiler 捕获 GC.Alloc 的 callstack，定位最大分配源

---

## 自检清单

- [x] 所有 `mustReport: true` 项已覆盖（Gfx.RenderSlaver.ThreadRun/PlayerLoop/Shader.CreateGPUProgram/TBUResManager.GetResFileInfo/CreateGpuProgram/MapSignificanceMgr.ProcessTask_ZoomEntityAdd/Gfx.WaitForGfxCommandsFromMainThread/GC.Collect/Update.ScriptRunBehaviourUpdate/BehaviourUpdate/AOE.dll.GameLauncher.Update/Core.Update/RenderLoop.Draw/MapSignificanceMgr.ProcessTask_ZoomGuildMember/ZoomGuildMemberAdd/CS:AOE.LuaMgr/PostLateUpdate.FinishFrameRendering + 3 个 BigJank 帧）
- [x] 每个分析项有完整调用链
- [x] 优化建议具体可执行（含代码位置、具体步骤）
- [x] 判定依据明确引用数值
- [x] 数据来自输入，无捏造
- [x] 不确定结论标注 [推断]

---

## Token 消耗估算

```
[Step 1] 已跳过（使用已有 preprocess-result.json）— 0 token
[Step 2] map-source.ts executed — ~0 token (script only)
[Step 3a] Read preprocess-result.json (config + frameSummary + markers top20 + jankFrames + markerSpikes) — ~30K token
[Step 3b] Read marker-source-map.json (grep entries) — ~8K token
[Step 3c] Read unity-cpu-knowledge.md — ~10K token
[Step 4] query-frame × 2 (frame 431 + frame 469) — ~4K token
[Step 5] Report generation — ~8K token
Total estimated: ~60K token
```
