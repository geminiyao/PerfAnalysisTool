# Project Knowledge Pack — Schema 设计 v1

> 这份文档定义了"项目知识包"的目录结构和每个 YAML 的 schema。剥离后，所有
> 项目特化关键字/规则/标签从 .py 文件移到这里，代码侧只剩通用算法。

## 目录结构

```
projects/
├── _generic/                       # fallback 包（通用 Unity 项目兜底）
│   ├── pack.yaml                   # 元信息 + 通用 dispatcher 帧
│   ├── business-modules.yaml       # 通用 slot 模板（仅 wwise/ecs_burst/lua_vm/lua_gc 这些通用项）
│   ├── probes.yaml                 # 通用探针（仅 GPU bound / Boehm GC / Job worker balance 等通用项）
│   ├── annotations.yaml            # 通用调用栈节点重命名（FrameworkCore_OnUpdate 等通用 Unity 帧）
│   ├── caller-modules.yaml         # 反查上游业务模块归一规则（通用规则）
│   └── README.md
├── _template/                      # 新项目接入模板（带注释和占位符）
│   └── （同 _generic 但每个字段带"如何填"的注释）
└── aoeyz/                          # AOE 项目当前知识包
    ├── pack.yaml                   # name=aoeyz, identifySoNames=[libAOENative, libTBUNative, ...]
    ├── business-modules.yaml       # 替代 BUSINESS_MODULES_LEGACY
    ├── probes.yaml                 # 替代 probes.py 中 9 个项目特化探针
    ├── annotations.yaml            # 替代 narrative_tree._LABEL_REWRITES + _ANNOTATIONS + CHILD_FN_HINTS
    ├── slot-matchers.yaml          # 替代 SLOT_MATCHERS / SLOT_PROBE_MATCHERS
    ├── burst-jobs.yaml             # 替代 collect_burst_jobs.labels
    ├── caller-modules.yaml         # 替代 call_up_tracer.CALLER_MODULE_RULES
    ├── layer-tokens.yaml           # 替代 perf_provider._LAYER_TOKENS["business"] 项目自研 native 部分
    └── analyst-rules.yaml          # 替代 web/server/services/objective-report-utils.ts
```

## pack.yaml — 项目元信息

```yaml
# projects/aoeyz/pack.yaml
name: aoeyz
displayName: AOEYZ (Age of Empires Yz)
description: 腾讯 AOE 系列大世界手游

# 流水线启动时按这些标识符自动检测项目（在 binary_cache 里 grep）
identify:
  # binary_cache 中存在以下 .so 之一即认为是本项目
  selfDeveloperSoNames:
    - libAOENative
    - libTBUNative
    - libGameNative
  # 包名匹配（备用）
  androidPackages:
    - com.tencent.aoeyz

# 这个项目使用的渲染管线/UI 框架/脚本系统（用于通用模板 fallback 决策）
stack:
  renderPipeline: URP_Mobile
  uiFrameworks: [MeshUI, UGUI]    # 自定义动态 UI + Unity UGUI
  scriptingEngine: il2cpp_xlua
  ecs: enabled
  middleware: [Wwise]
```

## business-modules.yaml — slot 定义

```yaml
# projects/aoeyz/business-modules.yaml
# 替代 simpleperf/simpleperf_analyzer/business_modules.py BUSINESS_MODULES_LEGACY
# 以及 v4_report_renderer.py SLOT_MATCHERS

modules:
  # ========== 通用模块（项目无关，所有 Unity 项目都有）==========
  - id: wwise
    display: Wwise 音频中间件
    section: "4.3"           # 报告章节号
    sectionTitle: 音频中间件（Wwise）
    discoverMode: lib_match
    libMatch: libAkSoundEngine
    threadHint: wwise_worker
    probeId: probe.middleware.wwise

  - id: ecs_burst
    display: ECS Burst Job 工作量
    section: "4.6"
    sectionTitle: ECS Burst Job 工作量
    discoverMode: lib_match
    libMatch: lib_burst_generated
    threadHint: job_worker × 4
    probeId: null            # 不挂红线探针

  - id: lua_vm
    display: Lua VM 解释执行
    discoverMode: sum_self
    scope: all_threads
    keywords: [luaV_execute, luaD_call, lua_pcall, luaH_get, propagatemark, luaC_step]

  - id: lua_gc_worker
    display: Lua GC 工作线程
    section: "9"
    discoverMode: subtree_sum_self
    scope: lua_mtgc_worker
    keywords: [LuaMultiThreadGC_LuaGCThreadProc, lua_execute_mtgc, do_realgc]
    probeId: probe.lua.mtgc.worker

  # ========== 项目特化模块（aoeyz 业务）==========
  - id: meshui
    display: 动态 UI 子树（MeshUI 等）
    section: "4.4"
    sectionTitle: 动态 UI 子树（MeshUI 等）
    discoverMode: subtree_sum_self
    scope: main_thread
    keywords:
      - MUIControlManager
      - MUILayout
      - MUIRendererBase
      - MUIText
      - MUISprite
      - MeshUIManager
      - MUIRenderable
      - MUIDefaultRenderer
      - MUISpriteSliced
      - MUILayoutRoot
      - MUILayoutManager
    threadHint: main_thread
    probeId: probe.csharp.meshUI
    # slot 在 §0 / §4 中显示用的友好名（不带项目特化）
    friendlyName: MeshUI 迭代位置刷新
    # Top-N 章节自动加红的条件（覆盖 probe verdict）
    autoRedRules:
      - { when: "absDelta == NEW or absDelta >= 500", reason: "新增热点" }

  - id: army_line
    display: 行军线刷新（OutSideViewArmyLineMgr）
    section: "4.5"
    sectionTitle: C# 业务管理器（行军/路径刷新等）
    discoverMode: subtree_sum_self
    scope: main_thread
    keywords:
      - OutSideViewArmyLineMgr
      - OutsideLineCtrl
      - OutsideLineMesh
      - CalculateVertexJob
    threadHint: main_thread
    probeId: probe.csharp.outsideViewArmyLine
    friendlyName: 行军线刷新
    autoRedRules:
      - { when: "absDelta == NEW or absDelta >= 150", reason: "NEW 热点" }

  - id: urp_main_render
    display: URP 主线程渲染配置
    discoverMode: subtree_sum_self
    scope: main_thread
    keywords:
      - UniversalRenderPipeline
      - RenderCameraStack
      - ScriptableRenderer_Execute
      - ExecuteRenderPass
      - ShadowPass
      - PlanarShadow
      - DrawRendererPass
      - BloomPass
      - MobileBaseRenderer
      - DrawFoliageInstanceRenderers
      - OutsideForestRenderer
      - OutsideTreeTypeRenderer
      - TBUBaseFeature
      - TBURenderGraph

  - id: rhi_const_upload
    display: RHI 常量缓冲上传
    discoverMode: subtree_sum_self
    scope: rhi_thread
    keywords: [ConstantBuffersGLES]

  - id: rhi_drawcall
    display: RHI DrawCall 命令吞吐
    discoverMode: subtree_sum_self
    scope: rhi_thread
    keywords:
      - "GfxDeviceGLES::DrawBuffers"
      - DrawBuffersStereo
      - BeforeDrawCall
      - SetVertexStateGLES
      - ApplyGpuProgramGLES

  - id: network
    display: 网络消息处理
    discoverMode: subtree_sum_self
    scope: main_thread
    keywords:
      - TServerManager
      - TServer_Tick
      - TServer_DecodeMessages
      - TServer_RecvMessages
      - TServer_HandleMessages
    probeId: probe.net.tserver
```

## probes.yaml — 探针定义

```yaml
# projects/aoeyz/probes.yaml
# 替代 simpleperf/simpleperf_analyzer/probes.py PROBE_DEFS

probes:
  # 通用探针（所有 Unity 项目都装）
  - id: probe.gpu.bound
    display: GPU bound 主信号
    kind: keywords_global_dedup
    keywords:
      - "GfxDeviceClient::WaitForPendingPresent"
      - "GfxDeviceClient::PresentFrame"
    scope: main_thread
    thresholds: { green: 2, yellow: 5, red: 100 }
    knowledgeRef: "v2.1 §4.6"

  - id: probe.gpu.bound.eglSwap
    display: eglSwapBuffers (辅助)
    kind: keywords_rhi
    keywords: [eglSwapBuffers]
    thresholds: { green: 10, yellow: 15, red: 100 }
    knowledgeRef: "v2.1 §4.7"

  - id: probe.ecs.mainwait
    display: 主线程 Job 等待
    kind: keywords_global_dedup
    keywords:
      - WaitForJobGroupID
      - "JobHandle::Complete"
      - JobHandle_Complete
      - ScheduleBatchedJobsAndComplete
      - CombineDependenciesInternalPtr
    scope: main_thread
    thresholds: { green: 0.5, yellow: 2, red: 100 }
    knowledgeRef: "v2.1 §4.5"

  - id: probe.ecs.jobworker.balance
    display: Job Worker 均衡度
    kind: thread_balance
    threadIdentity: job_worker
    thresholds: { green: 20, yellow: 30, red: 100 }
    knowledgeRef: "v2.1 §4.5"

  - id: probe.middleware.wwise
    display: Wwise 音频中间件
    kind: module
    module: wwise
    thresholds: { green: 3, yellow: 7, red: 100 }
    knowledgeRef: "v2.1 §4.10"

  - id: probe.gc.boehmBackground
    display: Boehm GC 后台
    kind: keywords_global_self
    keywords: [GC_end_stubborn_change, GC_mark_from, GC_push_all]
    thresholds: { green: 1, yellow: 2, red: 100 }
    knowledgeRef: "v2.1 §4.11"

  - id: probe.lua.totalLoad
    display: Lua 总负载
    kind: keywords_global
    keywords: [luaV_execute, luaD_call, lua_pcall, LuaMgr, XLua]
    thresholds: { green: 8, yellow: 10, red: 100 }
    knowledgeRef: "v2.1 §4.1.2"

  - id: probe.lua.mtgc.worker
    display: Lua GC worker
    kind: module
    module: lua_gc_worker
    thresholds: { green: 1, yellow: 2, red: 100 }
    knowledgeRef: "v2.1 §4.9"

  - id: probe.anim.legacy
    display: LegacyAnimationUpdate
    kind: phase_ms
    phaseLabel: PreLateUpdate.LegacyAnimationUpdate
    thresholds: { green: 0.6, yellow: 1.0, red: 100 }
    knowledgeRef: "v2.1 §4.3"

  - id: probe.fx.particle
    display: ParticleSystem 合计
    kind: phase_ms_combined
    phaseLabels:
      - PreLateUpdate.ParticleSystemBeginUpdateAll
      - PostLateUpdate.ParticleSystemEndUpdateAll
    thresholds: { green: 0.6, yellow: 1.0, red: 100 }
    knowledgeRef: "v2.1 §4.3"

  - id: probe.ui.canvas
    display: PlayerUpdateCanvases
    kind: phase_ms
    phaseLabel: PostLateUpdate.PlayerUpdateCanvases
    thresholds: { green: 0.6, yellow: 1.0, red: 100 }
    knowledgeRef: "v2.1 §4.4"

  - id: probe.render.urp.shadow
    display: URP ShadowPass
    kind: keywords_main
    keywords: [ShadowPass, PlanarShadow]
    thresholds: { green: 5, yellow: 8, red: 100 }
    knowledgeRef: "v2.1 §4.6"

  - id: probe.render.urp.foliage
    display: URP Foliage/Tree
    kind: keywords_main
    keywords: [DrawFoliage, OutsideForestRenderer]
    thresholds: { green: 3, yellow: 5, red: 100 }
    knowledgeRef: "v2.1 §4.6"

  - id: probe.render.urp.postfx
    display: URP 后处理
    kind: keywords_main
    keywords: [BloomPass, PostProcessPass]
    thresholds: { green: 3, yellow: 5, red: 100 }
    knowledgeRef: "v2.1 §4.6"

  - id: probe.render.urp.setup
    display: MobileBaseRenderer Setup
    kind: keywords_main
    keywords: [MobileBaseRenderer]
    thresholds: { green: 2, yellow: 3, red: 100 }
    knowledgeRef: "v2.1 §4.6"

  - id: probe.rhi.constUpload
    display: RHI 常量缓冲上传
    kind: keywords_rhi
    keywords: [ConstantBuffersGLES]
    thresholds: { green: 25, yellow: 40, red: 100 }
    knowledgeRef: "v2.1 §4.7"

  - id: probe.rhi.drawcall
    display: RHI DrawCall (仅观测)
    kind: keywords_rhi_observe
    keywords: ["GfxDeviceGLES::DrawBuffers"]
    thresholds: { green: 999, yellow: 999, red: 100 }
    knowledgeRef: "v2.1 §4.7"

  - id: probe.res.loader
    display: 资源加载平均
    kind: keywords_main_ms
    keywords: [LoaderManagerTickLoadOnFrameEnd]
    thresholds: { green: 1, yellow: 2, red: 100 }
    knowledgeRef: "v2.1 §4.8"

  # ===== 项目特化探针（aoeyz 业务管理器红线）=====
  - id: probe.net.tserver
    display: 网络消息（TServerManager 子树）
    kind: module_main
    module: network
    thresholds: { green: 8, yellow: 15, red: 100 }
    knowledgeRef: "v2.1 §4.1.1"

  - id: probe.lua.luaMgrOnUpdate
    display: LuaMgr OnUpdate
    kind: keywords_main
    keywords: [LuaMgr_OnUpdate, "LuaMgr.OnUpdate"]
    thresholds: { green: 12, yellow: 20, red: 100 }
    knowledgeRef: "v2.1 §4.1.2"

  - id: probe.csharp.mapManager
    display: MapManager OnUpdate
    kind: keywords_main
    keywords: [MapManager_OnUpdate]
    thresholds: { green: 8, yellow: 10, red: 100 }
    knowledgeRef: "v2.1 §4.1.3"

  - id: probe.csharp.battleUIManager
    display: BattleUIManager OnUpdate
    kind: keywords_main
    keywords: [BattleUIManager_OnUpdate]
    thresholds: { green: 2, yellow: 3, red: 100 }
    knowledgeRef: "v2.1 §4.1.3"

  - id: probe.csharp.outsideViewArmyLine
    display: OutSideViewArmyLineMgr
    kind: keywords_main
    keywords: [OutSideViewArmyLineMgr]
    thresholds: { green: 2, yellow: 3, red: 100 }
    knowledgeRef: "v2.1 §4.1.3"

  - id: probe.csharp.mapManager.lateUpdate
    display: MapManager LateUpdate
    kind: keywords_main
    keywords: [MapManager_OnLateUpdate, "Outside.MapManager.LateUpdate"]
    thresholds: { green: 5, yellow: 8, red: 100 }
    knowledgeRef: "v2.1 §4.2.1"

  - id: probe.lua.luaMgrOnLateUpdate
    display: LuaMgr OnLateUpdate
    kind: keywords_main
    keywords: [LuaMgr_OnLateUpdate]
    thresholds: { green: 5, yellow: 8, red: 100 }
    knowledgeRef: "v2.1 §4.2.1"

  - id: probe.csharp.meshUI
    display: MeshUI 子树
    kind: module_main
    module: meshui
    thresholds: { green: 3, yellow: 5, red: 100 }
    knowledgeRef: "v2.1 §4.2.2"
```

## annotations.yaml — 调用栈节点重命名 + 子函数说明

```yaml
# projects/aoeyz/annotations.yaml
# 替代 narrative_tree.py _LABEL_REWRITES + _ANNOTATIONS
# 也替代 v4_report_renderer.py CHILD_FN_HINTS（已清空，迁回这里）

# 把符号化后的函数名重命名为友好显示名（剥离 _m{hash} 后缀已在 norm_symbol 完成）
labelRewrites:
  - { match: "FrameworkCore_OnUpdate_m", display: "Core.Update → FrameworkCore_OnUpdate" }
  - { match: "MapManager_OnUpdate_m", display: "MapManager_OnUpdate" }
  - { match: "BattleUIManager_OnUpdate_m", display: "BattleUIManager_OnUpdate" }
  - { match: "OutSideViewArmyLineMgr_OnUpdate_m", display: "OutSideViewArmyLineMgr_OnUpdate" }
  - { match: "OutSideViewArmyLineMgr_UpdateStraightMoveLine_m", display: "UpdateStraightMoveLine" }
  - { match: "OutsideLineCtrl_RefreshLine_m", display: "OutsideLineCtrl.RefreshLine" }
  - { match: "OutSideViewArmyLineMgr_GetArmyLineID_m", display: "GetArmyLineID" }
  - { match: "MUIControlManager_OnLateUpdate_m", display: "MUIControlManager.OnLateUpdate" }
  - { match: "MUILayout_Set3DPosition_m", display: "MUILayout.Set3DPosition" }
  # ... 项目特化函数名重命名（约 20 条）

# 调用栈节点旁的章节引用注释
annotations:
  - { keys: [MUILayout_Set3DPosition], note: "see §4.4" }
  - { keys: [MUIControlManager_OnLateUpdate], note: "see §4.4" }
  - { keys: [MeshUIManager_OnLateUpdate], note: "see §4.4" }
  - { keys: [OutSideViewArmyLineMgr, UpdateStraightMoveLine], note: "see §4.5" }
  - { keys: [OutsideLineCtrl_RefreshLine], note: "see §4.5" }
  - { keys: [GetArmyLineID], note: "see §4.5" }
  - { keys: [__memcpy], note: "see §10" }
  - { keys: [GC_end_stubborn_change], note: "see §10" }
  - { keys: ["RenderManager::RenderCameras"], note: "[详见 §6.1]" }

# 子函数表「说明」列的友好释义（之前在 CHILD_FN_HINTS）
childHints:
  "MUIControlManager.OnLateUpdate": "迭代所有 MUI 控件的入口"
  "MUILayout.Set3DPosition": "单个控件的 3D 位置计算（递归 7 层）"
  "MUIRendererBase.FreshVertexAttribute": "顶点属性刷新"
  "OutsideLineCtrl.RefreshLine": "单条行军线刷新主体"
  "OutSideViewArmyLineMgr.GetArmyLineID": "Dictionary 查找军队 → 线 ID"
  # ... 约 17 条
```

## slot-matchers.yaml — 自动模块归类匹配规则

```yaml
# projects/aoeyz/slot-matchers.yaml
# 替代 v4_report_renderer.py SLOT_MATCHERS + top_n_engine.py SLOT_PROBE_MATCHERS

# 自动发现的模块 id 是 "auto_main_thread_BattleUIManager_UpdateMUIPos_xxx"，
# 通过下面的语义匹配把它归到 slot（slot 见 business-modules.yaml）
slotMatchers:
  wwise:
    - { kind: id, value: wwise }
    - { kind: rootSymbol, value: libAkSoundEngine }
    - { kind: displayContains, value: Wwise }
    - { kind: displayContains, value: AkSoundEngine }
  ecs_burst:
    - { kind: id, value: ecs_burst }
    - { kind: rootSymbol, value: lib_burst_generated }
    - { kind: displayContains, value: Burst }
  meshui:
    - { kind: id, value: meshui }
    - { kind: displayContains, value: MeshUI }
    - { kind: displayContains, value: MUI }
    - { kind: displayContains, value: BattleUIManager_UpdateMUIPos }
  army_line:
    - { kind: id, value: army_line }
    - { kind: displayContains, value: OutSideViewArmyLineMgr }
    - { kind: displayContains, value: OutsideLineCtrl }
    - { kind: displayContains, value: OutsideLineMesh }
  network:
    - { kind: displayContains, value: TServer }
    - { kind: id, value: network }
  lua_gc_worker:
    - { kind: id, value: lua_gc_worker }
    - { kind: rootSymbol, value: lua_mtgc_worker }
  lua_vm:
    - { kind: id, value: lua_vm }
    - { kind: id, value: lua_vm_lib }
    - { kind: rootSymbol, value: libxlua }
```

## burst-jobs.yaml — Burst Job 标签

```yaml
# projects/aoeyz/burst-jobs.yaml
# 替代 narrative_tree.py collect_burst_jobs.label_specs

# 一行 = (callTree 中的子串匹配, 友好显示名, 业务模块)
burstJobs:
  - keyword: SoldierMoveJob
    display: MoveChain_SoldierMoveSystem.SoldierMoveJob
    module: ECS 士兵移动
  - keyword: ArmyMoveJob
    display: MoveChain_ArmyMoveSystem.ArmyMoveJob
    module: ECS 队伍移动
  - keyword: RotationLerpSystem
    display: RotationLerpSystem.DoSmoothLerp
    module: ECS 旋转插值
  - keyword: WriteInstanceDataJob
    display: WriteInstanceDataJob
    module: GPU Instancing 数据回写
  - keyword: UtilHeightMapBurst
    display: UtilHeightMapBurst.GetSamplerHeights
    module: 地形高度采样
  - keyword: SyncViewEntitySystem
    display: SyncViewEntitySystem
    module: ECS → 显示同步
  - keyword: LocalToParentSystem
    display: LocalToParentSystem.ChildLocalToWorld
    module: Transform 层级变换
  - keyword: OnStepMove
    display: SoldierMoveJob.OnStepMove
    module: ECS 单步移动
  - keyword: SyncLogicEntitySystem
    display: SyncLogicEntitySystem
    module: ECS 逻辑同步
  - keyword: ArchiveSoldier
    display: MoveChain_SoldierMoveSystem.ArchiveSoldier
    module: ECS 士兵归档
  - keyword: RefreshCurPosition
    display: ArmyMoveSystem.RefreshCurPosition
    module: ECS 路径点刷新
```

## caller-modules.yaml — 反查上游归一规则

```yaml
# projects/aoeyz/caller-modules.yaml
# 替代 simpleperf/simpleperf_analyzer/call_up_tracer.py CALLER_MODULE_RULES

# 反查时，看运行时函数（如 __memcpy）的 caller 链，按 keyword 分类到业务模块
callerModuleRules:
  # 通用规则
  - { keywords: [ConstantBuffersGLES, InstancingBatcher, MapConstantBuffers], module: "RHI / GPU Instancing" }
  - { keywords: [PlanarShadow, ShadowPass], module: "URP / 阴影" }
  - { keywords: [BloomPass, PostProcess], module: "URP / 后处理" }
  - { keywords: [OutsideForestRenderer, DrawFoliage, OutsideTreeTypeRenderer], module: "URP / 树木 Instancing" }
  - { keywords: [RenderingCommandBuffer, ScriptableRenderContext, TranscriptScriptableRenderContext], module: "URP / 命令缓冲" }
  - { keywords: [UIGeometryJob], module: "UGUI 几何 Job" }
  - { keywords: [Adreno], module: "GPU 驱动黑盒" }
  - { keywords: [libAkSoundEngine], module: "Wwise" }
  - { keywords: [Enumerator, MoveNext], module: "C# 迭代器" }
  # 项目特化规则
  - { keywords: ["Mesh::SetVertexData", MUIRendererBase, MUIDefaultRenderer], module: "MeshUI 顶点上传" }
  - { keywords: [MUIControlManager, MUILayout, MUIText, MUISprite, MUIRenderable], module: "MeshUI" }
  - { keywords: [TServer, TServerManager], module: "网络消息处理" }
  - { keywords: [LuaMgr, XLua, luaV_execute, lua_pcall], module: "Lua" }
  - { keywords: [OutSideViewArmyLineMgr, OutsideLineCtrl], module: "行军线" }
  - { keywords: [BattleUIManager], module: "战斗 UI" }
```

## layer-tokens.yaml — 业务层 .so 归类

```yaml
# projects/aoeyz/layer-tokens.yaml
# 替代 simpleperf/simpleperf_analyzer/perf_provider.py _LAYER_TOKENS["business"]
# 项目自研 native 部分（其他通用业务 .so 在 _generic 包里）

# 项目自研 native 库（属于"业务层"，参与 §2.2 业务层 +xx% 计算）
selfDevelopedNatives:
  - libAOENative
  - libTBUNative
  - libGameNative

# 项目用的 DEX/AOT 文件（通常通用，但留白允许覆盖）
dexAotFiles:
  - base.odex
  - base.vdex
  - base.oat
  - classes
```

## analyst-rules.yaml — 业务分析规则（替代 objective-report-utils.ts）

```yaml
# projects/aoeyz/analyst-rules.yaml
# 替代 web/server/services/objective-report-utils.ts

analystRules:
  - id: MapSignificanceMgr
    patterns: [MapSignificanceMgr]
    knowledgeRef: "§3 LuaMgr 子管理器 - MapSignificanceMgr"
    redLineMs: 3
    threadHint: lua_mgr
    action: "若 MapSignificanceMgr 顶到 3ms 预算红线，需查地图实体增删频率与 InfiniteZoom 切换"
  - id: OutSideViewArmyLineMgr
    patterns: [OutSideViewArmyLineMgr]
    knowledgeRef: "§4 行军线"
    threadHint: main_thread
    action: "检查行军线刷新频率与 Burst Job（CalculateVertexJob）规模；静止场景应明显降低"
  - id: BattleHeadMgr
    patterns: [BattleHeadMgr]
    knowledgeRef: "§4 战斗头像"
    threadHint: lua_mgr
    action: "检查战斗中头像数量与刷新频率"
```

---

## 加载器：simpleperf/simpleperf_analyzer/project_pack.py

```python
"""ProjectPack — 加载项目知识包 (projects/<name>/*.yaml)。

启动流程：
1. 调用方传入 project_name（来自 web 上传时的 form 字段）或 None
2. 若 None，按 binary_cache 中的 .so 名自动检测
3. 没匹配到 → 加载 _generic 包（通用 fallback，跳过项目特化部分）

每个 .yaml 缓存为 dict；多次调用同一项目零 I/O 开销。
"""

import os
import yaml

PROJECTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "projects")


class ProjectPack:
    def __init__(self, name: str):
        self.name = name
        self.dir = os.path.normpath(os.path.join(PROJECTS_DIR, name))
        self.pack = self._load_yaml("pack.yaml")
        self.business_modules = self._load_yaml("business-modules.yaml").get("modules", [])
        self.probes = self._load_yaml("probes.yaml").get("probes", [])
        self.annotations = self._load_yaml("annotations.yaml")
        self.slot_matchers = self._load_yaml("slot-matchers.yaml").get("slotMatchers", {})
        self.burst_jobs = self._load_yaml("burst-jobs.yaml").get("burstJobs", [])
        self.caller_modules = self._load_yaml("caller-modules.yaml").get("callerModuleRules", [])
        self.layer_tokens = self._load_yaml("layer-tokens.yaml")

    def _load_yaml(self, fn):
        fp = os.path.join(self.dir, fn)
        if not os.path.isfile(fp):
            return {}
        with open(fp, encoding="utf-8") as f:
            return yaml.safe_load(f) or {}


def load_project_pack(name: str = None, binary_cache: str = None) -> ProjectPack:
    """Load by explicit name, auto-detect from binary_cache, or fall back to _generic."""
    if name:
        pack_dir = os.path.join(PROJECTS_DIR, name)
        if os.path.isdir(pack_dir):
            return ProjectPack(name)
    # Auto-detect by scanning binary_cache for self-developed natives
    if binary_cache and os.path.isdir(binary_cache):
        for project in os.listdir(PROJECTS_DIR):
            if project.startswith("_"):
                continue
            try:
                p = ProjectPack(project)
                tokens = p.layer_tokens.get("selfDevelopedNatives", [])
                for token in tokens:
                    if _bcache_contains(binary_cache, token):
                        return p
            except Exception:
                continue
    # Fallback
    return ProjectPack("_generic")


def _bcache_contains(binary_cache: str, lib_substr: str) -> bool:
    for root, _, files in os.walk(binary_cache):
        for fn in files:
            if lib_substr in fn:
                return True
    return False
```

---

## 改动清单（每个 .py 文件如何接 YAML）

| 文件 | 当前硬编码 | 剥离后改动 |
|---|---|---|
| `business_modules.py` | `BUSINESS_MODULES_LEGACY` 全字典 | 改用 `pack.business_modules` 列表，按 mode/scope/keywords 字段分发 |
| `top_n_engine.py` | `SLOT_PROBE_MATCHERS` + `_effective_verdict` | 用 `pack.slot_matchers` 匹配；`autoRedRules` 移到 YAML（DSL 简单 eval） |
| `probes.py` | `PROBE_DEFS` 列表 | 改用 `pack.probes` 列表，按 kind 字段分发 |
| `narrative_tree.py` | `_LABEL_REWRITES` / `_ANNOTATIONS` / `collect_burst_jobs.labels` | `pack.annotations.labelRewrites/annotations/childHints` + `pack.burst_jobs` |
| `v4_report_renderer.py` | `MODULE_SECTIONS` / `SLOT_MATCHERS` / `CHILD_FN_HINTS` / `_LABEL_REWRITES` (line 33-42) | 全部从 `pack.business_modules`（含 section/sectionTitle）+ `pack.slot_matchers` + `pack.annotations.childHints` 派生 |
| `call_up_tracer.py` | `CALLER_MODULE_RULES` | `pack.caller_modules` |
| `perf_provider.py` | `_LAYER_TOKENS["business"]` 中的 libAOENative 等 | `pack.layer_tokens.selfDevelopedNatives` |
| `objective-report-utils.ts` | 14 处业务规则映射 | `pack.analyst_rules.yaml`（TS 侧加载器） |

---

## 工作量估算

- **schema 设计 + 写 YAML（aoeyz / _generic / _template）**：0.5 天
- **写 ProjectPack 加载器**：0.3 天
- **迁移 7 个 .py 文件接 YAML**：0.7 天
- **objective-report-utils.ts 迁移**：0.3 天
- **跑端到端验证 + diff 对账**：0.2 天

**合计 2 天**

---

## 风险与回退

- **风险 1**：YAML 字段拼写错误导致加载失败 → 加 schema 校验（jsonschema），启动时报错。
- **风险 2**：迁移过程报告内容偏离 → 用 `compare_v4_report_quality.py` 跑 diff，任何变差立即修复或回退。
- **风险 3**：YAML 序列化不支持的特殊字符（如 `::`）→ 用引号包起来。
- **回退**：所有改动在 git 单独 branch，验收前不合 master；验收失败可丢弃 branch。
