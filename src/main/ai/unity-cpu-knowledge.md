# Unity CPU Performance Knowledge Base

> 本知识库作为 System Prompt 注入 AI，帮助 AI 理解 Unity 性能数据并给出专业分析。
> 分为两大部分：通用 Unity 知识 + AOE 项目专属知识。
> 维护方式：直接编辑此 md 文件，代码会自动读取。

---

## Part A: 通用 Unity CPU 性能知识

### A1. PlayerLoop 标准调用树

Unity 主线程每帧执行 PlayerLoop，按以下阶段顺序：

```
PlayerLoop (帧总耗时)
  Initialization (初始化)
  EarlyUpdate (早期更新)
  FixedUpdate (物理帧, 默认 50Hz, 每帧可能执行 0~N 次)
    Physics.Simulate
      Physics.SyncColliderTransform
      Physics.Broadphase
      Physics.Narrowphase
    Physics.UpdateBodies
  Update (逻辑帧)
    ScriptRunBehaviourUpdate (所有 MonoBehaviour.Update() 的总和)
    ScriptRunDelayedDynamicFrameRate
  PreLateUpdate
    AI.NavMeshUpdate
    Director.Update (Timeline, Animator)
    ParticleSystem.Update
  PostLateUpdate
    UpdateAllRenderers
    PlayerSendFrameComplete
    FinishFrameRendering
  Rendering
    Camera.Render -> Drawing -> Batching
    Gfx.WaitForPresent (CPU 等待 GPU 完成)
```

### A2. 常见性能问题模式

| 模式 | 关键指标 | 根因 | 优化方向 |
|------|---------|------|---------|
| GPU Bound | Gfx.WaitForPresent > 40% | DrawCall 过多/Shader 复杂/分辨率高 | 减少 DrawCall、简化 Shader、降分辨率 |
| Physics Heavy | FixedUpdate > 8ms 或 Physics.Simulate > 5ms | Collider 过多/FixedTimestep 过小/复杂碰撞 | 减少 Collider、增大 FixedTimestep、简化碰撞层 |
| Script Heavy | ScriptRunBehaviourUpdate > 5ms | Update() 逻辑过重/MonoBehaviour 过多 | 减少 Update 调用、用事件驱动替代轮询 |
| GC Spike | GC.Collect 出现在 spike 帧且耗时 > 2ms | 大量临时对象分配 | 对象池、减少装箱、缓存查询结果 |
| Loading Spike | 单帧 > 100ms + Resources.Load/AssetBundle.Load | 主线程同步加载资源 | 异步加载、预加载、分帧加载 |
| Animation Heavy | Director.Update/Animator.Update > 3ms | Animator 过多/状态机复杂 | LOD 动画、可见性剔除、简化状态机 |
| UI Heavy | UI.LayoutUpdate/Canvas.BuildBatch > 2ms | UI 层级复杂/频繁 Rebuild | 拆分 Canvas、减少 Layout 嵌套、静态缓存 |
| Particle Heavy | ParticleSystem.Update > 2ms | 粒子数过多/复杂粒子系统 | 减少粒子数、LOD、可见性剔除 |

### A3. 帧预算参考

| 目标 FPS | 帧预算 (ms) | 建议 Main Thread | 建议 Render Thread |
|---------|------------|-----------------|-------------------|
| 60 FPS | 16.67ms | < 12ms | < 14ms |
| 30 FPS | 33.33ms | < 28ms | < 30ms |

### A4. 分析规则

1. **对比 worst 和 median 帧**，区分"偶发 spike"和"持续性能问题"
2. **关注 self-time**（非 total time）来定位真正的工作，而非只是父级包装
3. **Spike 倍数** = 帧耗时 / median 耗时，>5x 严重，>10x 极端
4. **Physics 高时**检查 FixedUpdate 是否每帧执行多次（追帧问题）
5. **Gfx.WaitForPresent 高 + 帧耗时低** = GPU Bound（CPU 在等 GPU）
6. **GC.Collect 出现在 spike 帧** = 内存分配问题，看父 Marker 定位分配源
7. **多线程分析**：Main Thread 高不一定是瓶颈，需看是否在等其他线程

### A5. 线程模型

| 线程 | 作用 | 常见瓶颈 |
|------|------|---------|
| Main Thread | 游戏逻辑、脚本、物理、UI | Script/Physics/UI/GC |
| Render Thread | 渲染命令提交 | DrawCall 过多、Shader 编译 |
| Job Worker | DOTS/Burst 并行任务 | 任务粒度不均、依赖等待 |
| Loading Thread | 异步资源加载 | IO 瓶颈、解压缩 |

---

## Part B: xLua 桥接专项知识

### B1. xLua 关键 Marker

| Marker | 含义 | 性能影响 |
|--------|------|---------|
| `xlua.access` | Lua 访问 C# 属性 | 高频调用时桥接开销大 |
| `xlua.call` | Lua 调用 C# 方法 | 每次调用有跨语言开销 |
| `LuaEnv.Tick` | Lua GC 周期 | 可能导致 spike |
| `Profiler.BeginSample("xxx")` | 项目自定义 Marker | 有业务语义，是分析重点 |

### B2. xLua 性能分析要点

1. `ScriptRunBehaviourUpdate` 高时，优先检查 `xlua.call` 子节点
2. `xlua.access` self-time 高 = 跨语言属性访问过于频繁，考虑缓存
3. `LuaEnv.Tick` spike = Lua 侧产生了大量临时 table/closure
4. 自定义 Marker `Profiler.BeginSample("BusinessName")` 是定位 Lua 业务瓶颈的关键

---

## Part C: AOE 项目专属知识

> **[维护说明]** 以下内容基于 AOE3D 项目实际性能采集数据提炼。
> 数据来源：iwiki/p/4014088013 下的 9 篇性能采集文档（2025.03 ~ 2026.03）。

### C1. AOE 架构概述

AOE3D 是一款 3D SLG 手游，使用 Unity 2019 + xLua 的双层架构：
- **C# 层**: 引擎集成、渲染、DOTS/ECS 部队模拟、平台 API
- **Lua 层**: 所有游戏逻辑（Manager/UI/网络/配置），通过 xLua 桥接
- **帧生命周期**: C# 每帧调用 Lua 的 `OnUpdateByCS -> OnLateUpdateByCS -> OnFrameEndByCS`
- **画质档位**: 5 档（省电/流畅/标准/高清/精致），默认第 2 档
- **渲染分辨率**: 移动端 900P，GM 包默认 2K（会导致 GPU Bound）

### C2. AOE 常见 Profiler Marker 及实测数据

> 以下 Marker 数据来自实机采集（小米14/8gen3、小米8SE/二档机、MateXs2/一档机、iPhone12/13PM）。

#### Lua 层 Marker（CustomSampler 插桩）

| Marker | 所属模块 | 功能 | PC 战斗压测 | 二档机 战斗压测 | PC 行军压测 | 二档机 行军压测 | 备注 |
|--------|---------|------|-----------|--------------|-----------|--------------|------|
| `MapSignificanceMgr.sampler_OnUpdate` | 地图重要性 | AOI 更新 | 3.65ms | 4.50ms | 3.41ms | 3.75ms | **Lua 层最大热点** |
| `MapSignificanceMgr.ProcessTasks` | 地图重要性 | 处理显著性任务 | 3.52ms | 4.04ms | 2.81ms | 3.51ms | 上者子项 |
| `BattleHeadMgr.OnUpdate` | 战斗头像 | 战斗 UI 头像更新 | 0.32ms | 2.91ms | 1.12ms | 1.06ms | 二档机上暴增 |
| `UIManager.OnUpdate` | UI 管理 | UI 统一更新 | 0.34ms | 0.13ms | 0.47ms | 0.16ms | |
| `MapCameraCtrl.OnLateUpdate` | 地图相机 | 相机控制 | 0.04ms | 0.08ms | 0.06ms | 0.07ms | 无极缩放时飙到 1.87ms |
| `Float_FieldEntityName.OnTick` | 浮动名牌 | 实体名称 UI | 0.01ms | 0.02ms | 0.01ms | 0.01ms | 攻城时 0.18ms |
| `SkillMgr.OnUpdate` | 技能系统 | 技能帧更新 | 0.07ms | 0.15ms | 0.06ms | 0.09ms | |
| `BattleEventMgr.OnUpdateNetEvent` | 战斗事件 | 网络战斗事件 | 0ms | 0.01ms | 0ms | 0ms | |
| `Hud_Common.OnTick` | HUD | 通用 HUD | 0.04ms | 0.06ms | 0.04ms | 0.04ms | |
| `ArmyEntityUIMgr.OnUpdate` | 部队 UI | 部队 UI 管理 | 0.01ms | 0.02ms | 0.01ms | 0.01ms | |

#### C# 层 Marker

| Marker | 所属模块 | PC 战斗 | 二档机战斗 | PC 行军 | 二档机行军 | 备注 |
|--------|---------|--------|----------|--------|----------|------|
| `CS.MapManager` | 地图管理总控 | 0.85ms | 2.14ms | 3.90ms | 3.16ms | 行军时最高 |
| `CS.MeshUIManager.OnLateUpdate` | MeshUI 渲染 | 1.39ms | 2.10ms | 0.58ms | 0.90ms | 战斗时高 |
| `CS.BattleUIManager.OnUpdate` | 战斗 UI | 0.33ms | 1.10ms | 0.68ms | 0.68ms | |
| `CS.OutsideViewTreeMgr` | 视野树管理 | 0.11ms | 0.44ms | 0.18ms | 0.34ms | |
| `CS.OutsideRoadsMgr` | 道路管理 | 0.08ms | 0.22ms | 0.12ms | 0.17ms | |
| `CS.MapEntityEffectMgr` | 地图特效 | 0.08ms | 0.30ms | 0.09ms | 0.24ms | |
| `CS.OutsideEnvEffectMgr` | 环境特效 | 0.06ms | 0.19ms | 0.10ms | 0.13ms | |

#### 渲染/引擎层 Marker

| Marker | 含义 | 典型场景 | 典型耗时 |
|--------|------|---------|---------|
| `TerrainVT.LateUpdate` | Virtual Texture 地形更新 | 滑动地图 | 0.8~5ms（攻城战 5ms） |
| `VT_RenderMask` | VT 遮罩渲染 | Android 全场景 | 偶发高耗时 |
| `Gfx.ReadBackImage` | GPU 数据回读 | Android VT | 已修复(AsyncReadBack) |
| `WorldTileStreaming` | 世界块流式加载 | 滑动视野 | 0.5~0.8ms |
| `Gfx.PresentFrame` | GPU 提交帧（Android GPU Bound 指标） | 缩放层滑动 | 峰值 372ms |
| `WaitForAvailableFrameBuffer` | iOS triple-buffer 等待 | iOS 60fps 模式 | 持续高耗时 |
| `ForwardRenderPass` | 前向渲染 | 滑动地图 | 偶发 junk |
| `CreateGpuProgram` | Shader 编译（未 prewarm） | 首次滑动 | spike |
| `UGUI.Canvas` | UGUI 画布重建 | 攻城战 | 6.5ms |

### C3. AOE 场景性能基线

> 基于多轮采集的实际帧率数据。

| 场景 | 配置 | 1档机(MateXs2) | 3档机(iQOO U3x) | iPhone12 | 关键瓶颈 |
|------|------|---------------|-----------------|----------|---------|
| 城内（默认画质） | -- | 40 FPS (GPU Bound) | 28 FPS (GPU Bound) | 60 FPS | GPU: 分辨率/面数 |
| 空旷野外-滑动 | 标准画质 | 60 FPS | 35 FPS | -- | TerrainVT/WorldTile |
| 名城场景 | 流畅画质 | -- | 29 FPS (GPU Bound) | -- | GPU: 城模面数高 |
| 战斗压测 | 300队/2700兵 | 58 FPS | 30~40 FPS | -- | MapSignificanceMgr/渲染面数 |
| 行军压测 | 300队/2700兵 | 60 FPS | 35~45 FPS | -- | MapSignificanceMgr/MapManager |
| 攻城压测 | 279队/1900兵 | 43 FPS | -- | -- | 渲染(100w面)+UGUI(6.5ms)+VT(5ms) |
| 战斗(带UI) | 300队/300兵 | -- | 10 FPS | -- | 战斗UI: 80ms（**Critical**） |
| 战斗(隐UI) | 300队/300兵 | -- | 23~27 FPS | -- | 渲染面数(300w)+网络解包 |
| 无极缩放-高650 | -- | -- | 30 FPS (GPU Bound) | -- | Gfx.PresentFrame |

### C4. AOE DOTS/ECS 部队系统

AOE 使用 Unity DOTS (ECS + Burst) 进行大规模部队模拟：

- **核心功能**: 部队行军、战斗士兵动画、弹道特效（弓箭/火箭/火把）
- **性能关注点**:
  - **Job 同步点**: 中大核越少的设备，Job 阻塞越严重（低端机问题尤为突出）
  - **DOTS 弹道特效面数**: 火把 366 面、弓箭 67 面、火箭 227 面，数量失控时面数爆炸
  - **弹道特效上限控制**: ParallelJob 控制上限逻辑曾有 bug，已重构，默认上限=100
  - **LOD 与画质联动**: 精致以上用 LOD0，标准用 LOD1，标准以下用 LOD2；阴影和描边改为 LOD2
  - **ArmyCleanUp**: 大量部队同时销毁时 spike（攻城战 50 队场景复现）

### C5. AOE 已知性能问题模式

> 基于 9 篇性能采集文档提炼的实际问题。

| 问题模式 | 触发场景 | 现象 | 根因 | 状态 |
|---------|---------|------|------|------|
| TerrainVT 回读卡顿 | Android 滑动地图 | Gfx.ReadBackImage spike | Android 用 GetPixel 同步回读 | 已修复(AsyncReadBack) |
| TerrainVT 重绘 spike | 大面积跳变/滑动 | VT_RenderMask 高耗时 6ms+ | VT 页面大面积失效需重建 | 已优化(分帧) |
| iOS triple-buffer 死锁 | 60fps+静止10s后 | WaitForAvailableFrameBuffer 每帧高耗时 | 一帧 GPU Bound 导致后续所有帧阻塞 | 切30fps恢复 |
| 渲染面数波动 | 轻微拖动地图 | 面数 33w->67w | Foliage 阴影/白模导致 | 已修复 |
| 战斗 UI 极端耗时 | 300部队带 UI | 战斗 UI 80ms，帧率 10FPS | UGUI 大量实例化+Canvas 重建 | 优化中 |
| 攻城 UGUI | 攻城战滑视野 | UGUI 6.5ms | 头像/名牌 UI 数量多 | 优化中 |
| GPU Bound-城内 | 城内默认高清画质 | 1档机仅 40FPS | 2k 分辨率+OpacityBake+面数超标 | 降分辨率900P |
| GPU Bound-名城 | 名城场景 | 3档机流畅画质仅 29FPS | 城模面数高+贴图超标 | 优化中 |
| MapSignificanceMgr 高耗时 | 战斗/行军压测 | 3.5~4.5ms (Lua 层最大热点) | AOI 更新+ProcessTasks 遍历开销 | 优化中 |
| BattleHeadMgr 低端机暴增 | 战斗压测 | PC 0.32ms -> 二档机 2.91ms | MeshUI 头像渲染+跨语言调用 | 优化中 |
| 网络解包高耗时 | 大规模战斗 | 网络解包 1.66ms | protobuf 解包+对象创建 | 待解包池方案 |
| 行军移出视野卡顿 | 滑动视野 | 部队移出时 spike | 部队延迟销毁+MapEntity 销毁 | 优化中 |
| WorldTile 加载卡顿 | PC 无极缩放抬高 | 3s 级卡顿 | WorldTile 资源同步加载 | 仅 PC |
| 属性系统回调 spike | 非必现 | 单帧高耗时 | PlayerBaseInfoMgr 属性回调风暴 | 偶发 |
| 火把特效面数爆炸 | 大规模战斗 | 特效 13w 面 | 每士兵一个火把(366面) | 上限控制(max=100) |
| Shader 未 prewarm | 首次滑动地图 | CreateGpuProgram spike | 运行时编译 shader | 需 prewarm |
| Wwise 死锁崩溃 | 切后台再恢复 | 高频崩溃 | WakeupFromSuspend 触发音频重初始化死锁 | 排查中 |
| 华为 GPU Bug | MateXs2 | Gfx.PresentFrame 每帧高耗时 | 华为 GPU 驱动 bug，非必现 | 无法修复 |
| LuaGC spike | 战斗+同步点 | LuaGC 高耗时 | Lua 临时对象+同步点叠加 | 已解决 |
| SMAA 负载高 | 全场景 | GPU 渲染负载占 7% | SMAA 抗锯齿开销 | 低端机可关闭 |
| DECAL 渲染 bug | 全场景 | GPU 渲染负载占 7% | DECAL 渲染 bug | 已修复 |
| 高度图 Hash 热点 | 大地图移动 | CPU 采样耗时高 | Hash 方式采样高度图 | 已优化(线性采样,降至1/10) |
| RefreshLayerLevel spike | 无极缩放层级切换 | iPhone14Pro 大地图卡顿 | 缩放层级切换逻辑重 | 优化中 |
| LodStreamingManager spike | LOD 流式加载 | 大地图卡顿 | LOD 资源加载未分帧 | 优化中 |
| ECB Complete 阻塞 | 士兵 VT 场景 | Job 同步点阻塞 main thread | EntityCommandBuffer 完成等待 | 优化中 |
| 士兵 VT Crash | 攻城战 | 必现 Crash | VT 二级 Native 容器嵌套扩容 | 已修复(改一级平铺) |

### C6. AOE Lua 层热点函数

> 来自 LuaProfiler 采集，按场景排序。

| 函数 | 战斗压测(二档机) | 行军压测(二档机) | 无极缩放(二档机) | 攻城压测(二档机) |
|------|----------------|----------------|----------------|----------------|
| `MapSignificanceMgr.OnUpdate` | **4.50ms** | **3.75ms** | 0.15ms | 0.19ms |
| `MapSignificanceMgr.ProcessTasks` | **4.04ms** | **3.51ms** | 0.11ms | 0.14ms |
| `BattleHeadMgr.OnUpdate` | **2.91ms** | 1.06ms | 0.16ms | 1.10ms |
| `MapCameraCtrl.OnLateUpdate` | 0.08ms | 0.07ms | **1.87ms** | 0.07ms |
| `Float_FieldEntityName.OnTick` | 0.02ms | 0.01ms | 0.01ms | 0.18ms |
| `UIManager.OnUpdate` | 0.13ms | 0.16ms | 0.14ms | 0.17ms |
| `SkillMgr.OnUpdate` | 0.15ms | 0.09ms | 0.08ms | 0.10ms |

**关键发现**:
- `MapSignificanceMgr` 是 Lua 层最大热点（战斗/行军场景 3.5~4.5ms）
- `BattleHeadMgr` 在低端机上性能退化严重（PC 0.32ms -> 二档机 2.91ms，9x 退化）
- `MapCameraCtrl` 在无极缩放场景独有的热点（1.87ms）

### C7. AOE 性能优化经验

> 基于项目实际优化案例沉淀。

#### 渲染优化（GPU Bound）
- 移动端渲染分辨率从 2K 降至 900P，大幅减轻 GPU 负载
- 描边 PostOutline 耗时优化
- 阴影和描边 Pass 强制使用 LOD2，减少面数
- DOTS 弹道特效（火把/弓箭/火箭）设置数量上限（默认 100）
- 玩家城堡 OpacityBake 渲染优化
- 地形渲染占比 35%，是 GPU 端主要开销
- **SMAA 抗锯齿**渲染负载占比 7%，低端机可考虑关闭
- **DECAL** 渲染负载 7%（曾有 bug 已修复）
- 面数裁剪效果实测（350队/4000兵场景）：
  - 未裁剪: 500w面
  - 关阴影: 320~400w面
  - 关阴影+关描边: 170~190w面
  - 关阴影+关描边+简化模式: 80w面（帧率平稳、不发热）

#### TerrainVT 优化
- VT 分帧处理：由 6ms 降至 1ms
- Android AsyncReadBack 替代 GetPixel（8gen3 机器需正确判定为 Arm 设备）
- 大面积跳变时的 VT 重建需分帧

#### 士兵 VT 渲染方案
- 用 Virtual Texture 替代传统 3D 渲染士兵，减少 GPU Draw 开销
- CPU 开销: 1档机(888) 0.76ms, 3档机(480) 2.36ms
- GPU 优化效果(iPhone12PM): 传统非简化 17ms -> VT 12ms（节省 ~2ms）
- VT 模式下简化参数需与 3D 简化模式保持一致（关 ghosting、切 LOD3、圆片阴影）
- 已知问题: 攻城车不走 VT（贴图过大）、ECB Complete 阻塞点需优化

#### 战场简化模式
- 自动检测机制：监听外部事件(帧率/温度)，动态变更性能设置项 & 显隐 UI
- 控制选项主要集中在 GPU 负载参数：阴影/描边/特效/LOD 等
- 简化模式 vs 非简化模式帧率差异: 3档机战斗 40FPS vs 30FPS

#### Shader 异步编译
- ShaderVariantCollection WarmUp 在进野外 Loading 时异步执行
- 首次装机无 PSO Cache，WarmUp 耗时极高，需跳过分帧预热
- 非首次装机有 Cache，WarmUp 极快（~2s 异步不阻塞主线程）
- 运行时触发 CreateGpuProgram = Shader 未 prewarm，产生 spike
- **风险**: 异步编译未完成时主线程引用变体会触发同步 fallback 卡顿

#### 高度图数据优化
- 原方案 Hash 采样 CPU 热点高，新方案 block 划分+线性编码
- iPhone12PM: CPU 优化至原热点的 **1/10**
- 内存从 30M GC + 16M 常驻 降至 6.4M NativeArray

#### DOTS/部队优化
- ParallelJob 弹道特效上限控制逻辑重构
- Job 同步点在低端机（中大核少的设备）问题尤为突出
- 部队延迟销毁避免同帧大量 ArmyCleanUp
- ECB Complete 阻塞点需优化（士兵 VT 场景）

#### 网络优化
- 大规模战斗网络解包 1.66ms，计划引入解包池方案
- pb decode 在大地图卡顿场景中也是热点之一

#### 大地图卡顿专项（iPhone14Pro 实测）
- **Shader Compile**: 运行时编译导致 spike
- **RefreshLayerLevel**: 无极缩放层级切换时高耗时
- **LodStreamingManager**: LOD 流式加载卡顿
- **WorldTileStreaming**: 世界块加载 spike
- **UGUI**: 大地图 UI 重建
- **pb decode**: protobuf 解包

#### 平台差异注意
- iOS 60fps triple-buffer 问题：一帧 GPU Bound 会导致后续每帧阻塞（30fps 正常）
- Android Gfx.PresentFrame 是 GPU Bound 指标（iOS 对应 WaitForAvailableFrameBuffer）
- 华为 GPU 有非必现的驱动 bug，Gfx.PresentFrame 莫名高耗时
- iPhone12 城内高清画质 60FPS，优于 Android 1档机默认设置
- 3档机(骁龙480)全场景帧率偏低，流畅/省电画质均难达 60FPS

---

## Part D: 分析输出规范

### D1. AI 分析输出要求

1. **使用中文**回答
2. 使用 **Markdown** 格式
3. 聚焦**瓶颈定位**和**可操作的优化建议**
4. 每条优化建议需要：
   - 精确到模块/函数级别
   - 说明预期收益（减少 Xms / 降低 Y%）
   - 标注优先级（Critical / Warning / Info）
5. 对比 worst frame 和 median frame 时，明确指出差异原因
6. 遇到 AOE 项目特有的 Marker 时，结合 Part C 的知识给出更具针对性的建议

### D2. 风险评级标准

| 级别 | 条件 | 说明 |
|------|------|------|
| Critical | 帧率 < 20 FPS 或 spike > 10x median | 立即需要修复 |
| Warning | 帧率 < 目标帧率 或 spike > 5x median | 建议优化 |
| Info | 有优化空间但不影响体验 | 可选优化 |
