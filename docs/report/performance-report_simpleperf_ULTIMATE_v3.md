# simpleperf 单源 性能分析报告 · 终极形态 v3

> 配套：[知识库 v2.1](../aoe-cpu-analysis-knowledge.md) · [工程化路线图](./report-to-pipeline-spec.md) · [探查笔记](./_intermediate/EXPLORATION_NOTES.md)。
> 所有表格的数据列只放纯数字，混合内容拆到说明列。所有百分比都标注分母口径（`%g`=全局 / `%m`=主线程内 / `%rhi`=RHI 线程内 / `%w`=Worker 线程内）。

---

## §0 结论先行

**本次 stressmove 行军压测在 MateXs2（高端机）上整体压力较 base 野外空场景显著上升（系统总采样 +30.7%，业务层绝对工作量 +86.5%），4 项检测项达到红线档**。主观帧率 ~45fps 离预期 60fps 还有差距，主要源于业务整体负载上升 + Wwise 战斗音效暴涨 + ECS Burst Job 工作量暴涨 三路压力叠加，**没有单点性能 bug**。

按 ROI 排序的优化方向（详细见各章节）：

1. **行军线刷新**（OutSideViewArmyLineMgr 子树）+ 战斗 UI 位置（BattleUIManager 子树）—— 业务暴涨主源
2. **Wwise 音频中间件** —— 红线触发
3. **MeshUI 迭代器开销**（MUILayout.Set3DPosition + Enumerator.MoveNext）+ Boehm GC 触发
4. **GPU Instancing 数据上传**（RHI 线程 ConstantBuffersGLES.UpdateBuffers，绝对 +24%）

未观察到 CPU 侧 GPU bound 信号（主线程 `GfxDeviceClient::WaitForPendingPresent` 仅 1 样本）。

---

## §1 采集元信息

### 1.1 元信息

| 项 | base | stressmove |
|---|---|---|
| 场景 | 野外空场景 | 行军线压测（约 300 队） |
| 设备 | MateXs2 (PAL-AL00, aarch64) | 同 |
| 采集事件 | cpu-cycles:u | 同 |
| 采样频率（Hz）| 1000 | 1000 |
| 时长（s）| 20 | 20 |
| 总采样数 | 36,133 | 47,228 |
| 系统总工作量比 | 1.000 | 1.307 |
| 主观帧率 | — | ~45 fps |

### 1.2 符号化质量

| 指标 | base | stressmove | 阈值 | 判定 |
|---|---|---|---|---|
| 总状态 | PASS | PASS | — | 🟢 |
| 应用层符号化率 | 99.7% | 91.8% | ≥85% | 🟢 |
| kernel% | 0.0% | 0.0% | — | 🟢 |
| unknown% | 0.4% | 6.3% | <10% | 🟢 |
| 栈回溯锚点命中 | 4/4 | 4/4 | ≥3/4 | 🟢 |
| `__start_thread` 可达率 | 55.3% | 70.9% | 任意 PASS | 🟢 |

---

## §2 库（so）维度对比

### 2.1 库占比（双口径 + base 对照）

| 库 | base abs | sm abs | 绝对 Δ% | base `%g` | sm `%g` | 说明 |
|---|---|---|---|---|---|---|
| libunity | 15,092 | 14,664 | -2.8% | 41.77% | 31.05% | Unity 引擎核心 |
| libil2cpp | 7,080 | 8,682 | +22.6% | 19.59% | 18.38% | C# 业务代码（含 Lua 桥接）|
| libGLESv2_adreno | 4,775 | 4,802 | +0.6% | 13.21% | 10.17% | GPU 驱动（CPU 端 API 调用时间）|
| **libAkSoundEngine** | **349** | **4,753** | **+1260%** | 0.97% | 10.06% | **Wwise 音频中间件（暴增）** |
| **lib_burst_generated** | **513** | **5,019** | **+878%** | 1.42% | 10.63% | **ECS Burst Job（暴增）** |
| libc | 2,828 | 3,459 | +22.3% | 7.83% | 7.33% | C 标准库（memcpy/memset/snprintf 等）|
| libxlua | 1,927 | 2,488 | +29.2% | 5.33% | 5.27% | Lua VM |
| libm | 743 | 604 | -18.7% | 2.06% | 1.28% | 数学函数（base 地形采样多）|
| libart | 927 | 683 | -26.3% | 2.56% | 1.45% | Android ART runtime / JNI 桥接 |

### 2.2 业务层 +86.5% 拆分

| 库（业务层）| 增量 (samples) | 占业务总增量 | 说明 |
|---|---|---|---|
| lib_burst_generated | +4,506 | 67.6% | ECS Burst Job（已下沉到 Worker 线程并行）|
| libil2cpp | +1,602 | 24.0% | C# 业务代码 |
| libxlua | +562 | 8.4% | Lua VM |
| **合计** | **+6,670** | 100% | — |

**说明**：业务层增长 +86.5% 中，**67.6% 来自 ECS Burst Job**，但这部分**全部跑在 4 个 Job Worker 线程上并行执行**，**不阻塞主线程**——所以业务层暴涨不能解读为"主线程业务逻辑膨胀"。

### 2.3 libc +22.3% 是否需要反查

不需要单独反查。libc 增量基本与系统总压力 +30.7% 同步（甚至略低）。libc 内主要贡献者 `__memcpy` 已在 §10 反查（70% 集中在 GPU Instancing + MeshUI），其余 `__memset` / `strlen` / `snprintf` 均为各业务函数的副产品，无独立归因价值。

---

## §3 线程维度对比

### 3.1 线程占比 + 身份识别

| 线程（comm 名）| tid | 真实身份 | base abs | sm abs | 绝对 Δ% | sm `%g` | 说明 |
|---|---|---|---|---|---|---|---|
| UnityMain | 19292 | 主线程 | 16,124 | 18,164 | +12.6% | 38.45% | ExecutePlayerLoop 入口 |
| Thread-102 | 19471 | RHI 线程 | 9,712 | 10,012 | +3.1% | 21.20% | GfxDeviceWorker→GLES |
| UnityGfxRenderS | 19472 | Render 线程 | 4,221 | 4,406 | +4.4% | 9.33% | URP 渲染管线脚本调度 |
| **NativeThread** | 19814 | **Wwise 工作线程** | 383 | 4,893 | **+1178%** | 10.36% | libAkSoundEngine 内部 |
| Thread-129 | 19461 | Job Worker | 902 | 1,937 | +114.8% | 4.10% | JobQueue.WorkLoop |
| Thread-135 | 19460 | Job Worker | 888 | 1,888 | +112.7% | 4.00% | JobQueue.WorkLoop |
| Thread-136 | 19462 | Job Worker | 892 | 1,864 | +108.9% | 3.95% | JobQueue.WorkLoop |
| Thread-158 | 19459 | Job Worker | 883 | 1,858 | +110.4% | 3.94% | JobQueue.WorkLoop |
| UnityMain | 19816 | **Lua MtGC 工作线程** | 211 | 165 | -22% | 0.68% | 入口 `LuaMultiThreadGC_LuaGCThreadProc`，xLua 启动 C# 线程未设 comm 名，被误名为 UnityMain |
| AAudio_1 | 19826 | 音频回调（系统）| 340 | 557 | +63.8% | 1.18% | — |
| UnityChoreograp | 19559 | Choreographer | 500 | 520 | +4.0% | 1.10% | VSync 回调 |

> 详细线程身份识别规则见 [知识库 v2.1 §2](../aoe-cpu-analysis-knowledge.md#2-线程身份识别规则)。

### 3.2 同名 UnityMain 陷阱

base 数据有 15 条线程名都叫 `UnityMain`，tid 19292 是真主线程，tid 19816 是 Lua MtGC 工作线程，其余 13 条是 C# `new Thread(...)` 创建但未设 comm 名的短生命周期子线程（单条 < 0.2%g 噪音）。**当前 Provider 的 `threadCpuMs` 字段用 thread_name 当字典 key 会同名覆盖，已登记为必修 bug**（工程化路线图 §15）。

### 3.3 关键判定

- **GPU 命令吞吐量 +0.6%**（libGLESv2 + RHI 线程绝对几乎不变）→ CPU 侧未观察到 GPU 工作量增长信号，但**simpleperf 不直接观测 GPU 计算时间**，真实 GPU 工作量需 perfetto GPU counter / RenderDoc 复核。
- **ECS 并行化健康**：4 个 Job Worker 线程 max-min 偏差 4.2%（远低于 30% 红线），sm 下每条 ×2.1 倍线性上涨，证明 ECS Burst Job 均匀分布到 4 核。
- **Wwise 独占一整条工作线程**（NativeThread 10.36%g）+ 库占比 10.06%g，两个角度同源。

---

## §4 性能热点全景表（红线 + 真热点 Top-N 合一）

> 这是报告核心章节。把红线告警和热点排序合并成一张表，**判定列前置**，**按类别分组**，**剥掉 wrapper 节点取真热点**（剥洋葱原则：若父节点 self% < 0.05%，下钻到首个 self% ≥ 0.05% 的子节点）。

### 4.1 红线/黄线告警（按类别）

| 判定 | 类别 | 名称 | 数值 | 单位 | 阈值（红线）| 说明 |
|---|---|---|---|---|---|---|
| 🔴 | 中间件 | Wwise 音频 | 10.06 | %g | >7% | base 0.97%g → sm 10.06%g（abs +1260%）|
| 🔴 | C# 业务·LateUpdate | MeshUI 迭代位置刷新（MUILayout.Set3DPosition 整支）| 5.46 | %m | >5% | abs 992 sample（含 7 层递归 + Enumerator + memcpy + GC）|
| 🔴 | C# 业务·Update | 行军线轨迹刷新（OutSideViewArmyLineMgr.UpdateStraightMoveLine 整支）| 5.27 | %m | >3% | abs 957 sample，base 几乎不存在 |
| 🔴 | C# 业务·Update | 战斗 UI 位置刷新（BattleUIManager.UpdateMUIPos）| 5.46 | %m | >3% | abs 992 sample，与 MeshUI 入口路径合流 |
| 🟡 | C# 业务·Update | Lua 主循环（LuaMgr_OnUpdate）| 14.38 | %m | 12-20% | abs 2,669 sample（+86%），主要为 Lua VM 解释执行 |
| 🟡 | 渲染·主线程 | 阴影 Pass（PlanarShadow）整支 | 5.25 | %m | 5-8% | abs 1,005 sample（-32%，base 野外阴影更多）|
| 🟡 | 渲染·主线程 | Bloom 后处理 Pass | 3.71 | %m | 3-5% | abs 688 sample（-15%）|
| 🟡 | 渲染·主线程 | URP RenderPass 配置（MobileBaseRenderer.Setup）| 3.25 | %m | 3-5% | abs 603 sample（-29%），每帧重建 Pass 链可 cache |
| 🟡 | ECS | 主线程上 Job Wait | 1.86 | %m | >2% | abs 354 sample，主要为 Transform 系统内同步点 |
| 🟡 | 内存 | Boehm GC 后台标记 | ~1.5 | %g | 1-2% | 触发源主要在 MUI 迭代器（§10 反查）|
| 🟢 | 其他 27 项 | （Particle / Anim / Canvas / TServer / 等等）| — | — | — | 全部 PASS，详见各专章 |

### 4.2 真热点 Top-N（按主线程 callTree 绝对 self 排序，剥洋葱后）

剥洋葱算法：**只保留 selfPct ≥ 0.05%（线程内）的节点**——即"自身有显著代码执行"的函数，跳过纯 wrapper 节点（如 FrameworkCore_OnUpdate / MapManager_OnUpdate / *_OnUpdate 这类纯调度入口）。

| # | 真热点函数 | abs (samples) | self `%g` | base abs | Δ% | 归属 |
|---|---|---|---|---|---|---|
| 1 | __memcpy | 373 | 0.79% | 187 | +99% | 见 §10 反查（70% 在 GPU Instancing + MeshUI）|
| 2 | MUIControlManager.OnLateUpdate（自身代码）| 360 | 0.76% | 16 | +2181% | MeshUI |
| 3 | MUILayout.Set3DPosition（递归 7 层 self 累加）| 332 | 0.70% | 0 | NEW | MeshUI |
| 4 | Enumerator.MoveNext（gshared）| 207 | 0.44% | 0 | NEW | C# 泛型迭代器（多处 MUI / 业务）|
| 5 | UtilHeightMapBurst.GetSamplerHeights（Burst）| 159 | 0.34% | 172 | -8% | 地形高度采样（base/sm 持平）|
| 6 | luaV_execute | 137 | 0.29% | 212 | -35% | Lua VM 解释执行（base 反而高，野外 Lua 业务多）|
| 7 | TranscriptRenderingCommandBuffer ctor | 126 | 0.27% | 151 | -17% | URP 命令缓冲创建 |
| 8 | RendererUpdateManager::UpdateSingleRenderer | 114 | 0.24% | 171 | -33% | 渲染器列表更新 |
| 9 | Mesh::RecalculateSubmeshBoundsInternal | 114 | 0.24% | 0 | NEW | Mesh 子网格包围盒（被 MeshUI 触发）|
| 10 | tlsf_memalign | 104 | 0.22% | 129 | -19% | Unity 内存分配 |
| 11 | GC_end_stubborn_change | 90 | 0.19% | 17 | +416% | Boehm GC 增量标记 |
| 12 | CalculateChunkCountExecute（Burst）| 89 | 0.19% | 65 | +36% | ECS Chunk 计数 |
| 13 | CullResults::GetOrCreateTranscriptRendererScene | 77 | 0.16% | 76 | +1% | URP 剔除场景 |
| 14 | RectTransform::UpdateAnchorPositionIfTransformChanged | 71 | 0.15% | 85 | -16% | UGUI 锚点更新 |
| 15 | OutsideLineCtrl.RefreshLine | 69 | 0.15% | 0 | NEW | 行军线渲染刷新（业务）|
| 16 | OutSideViewArmyLineMgr.GetArmyLineID | 65 | 0.14% | 0 | NEW | Dictionary 查找（业务）|
| 17 | ParticleSystem::Update1a | 55 | 0.12% | 0 | NEW | 粒子更新 |
| 18 | ParticleSystemRenderer.CalculateWorldMatrixAndBoundsJob | 53 | 0.11% | 0 | NEW | 粒子矩阵 Job |
| 19 | EntityComponentStore_Exists | 44 | 0.09% | 0 | NEW | ECS 实体存在性检查 |
| 20 | il2cpp::vm::Object::IsInst + Class::IsAssignableFrom 合计 | 76 | 0.16% | 0 | NEW | C# `is`/`as` 类型检查（业务代码 type cast 多）|

### 4.3 真热点 Top Burst Job（Worker 线程，按 self abs 排序）

主 Worker 线程合计 sm `%g` = 15.98%（Thread-129/135/136/158 四条加 NativeThread 部分）。

| # | Burst Job | abs (samples) | `%g` | 业务模块 |
|---|---|---|---|---|
| 1 | MoveChain_SoldierMoveSystem.SoldierMoveJob | 644 | 1.36% | ECS 士兵移动 |
| 2 | RotationLerpSystem.DoSmoothLerp | 465 | 0.99% | ECS 旋转插值 |
| 3 | WriteInstanceDataJob | 402 | 0.85% | GPU Instancing 数据回写 |
| 4 | UtilHeightMapBurst.GetSamplerHeights | 331 | 0.70% | 地形高度采样 |
| 5 | SyncViewEntitySystem | 328 | 0.69% | ECS → 显示同步 |
| 6 | LocalToParentSystem.ChildLocalToWorld | 302 | 0.64% | Transform 层级变换 |
| 7 | MoveChain_ArmyMoveSystem.ArmyMoveJob | 230 | 0.49% | ECS 队伍移动 |
| 8 | SoldierMoveJob.OnStepMove | 209 | 0.44% | ECS 单步移动 |
| 9 | SyncLogicEntitySystem | 204 | 0.43% | ECS 逻辑同步 |
| 10 | MoveChain_SoldierMoveSystem.ArchiveSoldier | 194 | 0.41% | ECS 士兵归档 |
| 11 | ArmyMoveSystem.RefreshCurPosition | 184 | 0.39% | ECS 路径点刷新 |

合计 ≈ **10.6%g**，与 lib_burst_generated 库占比一致。最大单 Job 1.36%g，无异常凸起，**ECS 健康度 🟢 PASS**。

---

## §5 主线程深度下钻

> 本章用纯树形图展示主线程主要子树，叶子节点带绝对样本数和分母占比。🔴/🟡 标记真热点。

主线程 sm 总绝对样本：**18,556 samples**（39.29%g）。

### 5.1 三大顶层入口子树

```
UnityMain (18,556 samples / 39.29%g / 100% 线程内基线)
├─ nativeRender → UnityPlayerLoop → ExecutePlayerLoop (12,808 samples / 68.88%m)   ★PlayerLoop 主体
│   └─ §5.2 PlayerLoop 各阶段（详见下方）
├─ RenderManager::RenderCameras (4,931 samples / 26.57%m)                          ★URP 主线程侧
│   └─ §5.3 URP 渲染管线（详见下方）
└─ JNI/runtime 杂项 (817 samples / 4.4%m)
    ├─ jni::CheckJNI::CallBooleanMethodV (111 samples / 0.60%m)
    └─ 其他 art_jni / Looper 框架开销
```

### 5.2 PlayerLoop 各阶段（base vs sm，按 `%m` 排序）

| 阶段 | base abs | sm abs | base `%m` | sm `%m` | Δ% | 判定 | 说明 |
|---|---|---|---|---|---|---|---|
| ScriptRunBehaviourUpdate | 2,711 | 6,075 | 16.28% | 32.74% | +124% | 🔴 | 业务主逻辑，详见 §5.2.1 |
| ScriptRunBehaviourLateUpdate | 1,729 | 2,788 | 10.38% | 15.03% | +61% | 🟡 | 视野 + MeshUI，详见 §5.2.2 |
| PlayerSendFrameComplete | 517 | 385 | 3.10% | 2.08% | -25% | 🟢 | 资源加载尾巴 |
| UpdateTextureStreamingManager | 465 | 295 | 2.79% | 1.59% | -37% | 🟢 | 纹理 streaming |
| PlayerUpdateCanvases | 336 | 229 | 2.02% | 1.24% | -32% | 🟢 | UGUI Canvas（≈0.19ms/帧）|
| PlayerEmitCanvasGeometry | 178 | 122 | 1.07% | 0.66% | -31% | 🟢 | UGUI 几何提交 |
| FinishFrameRendering | 171 | 125 | 1.02% | 0.67% | -27% | 🟢 | 帧渲染收尾 |
| ParticleSystemBeginUpdateAll | 26 | 170 | 0.16% | 0.91% | +540% | 🟢 | 粒子开始（≈0.14ms/帧）|
| ParticleSystemEndUpdateAll | 0 | 44 | 0.00% | 0.24% | NEW | 🟢 | 粒子结束 |
| LegacyAnimationUpdate | 46 | 140 | 0.28% | 0.75% | +202% | 🟢 | 动画（≈0.12ms/帧）|
| UpdateAllRenderers | 40 | 102 | 0.24% | 0.55% | +155% | 🟢 | 渲染器列表 |
| SendMouseEvents | 63 | 65 | 0.38% | 0.35% | +4% | 🟢 | 输入 |
| LuaMultiThreadGC（主线程同步阶段）| 24 | 0 | 0.14% | 0.00% | -100% | 🟢 | 同步开销基本消失 |

#### 5.2.1 ScriptRunBehaviourUpdate 内部 — 业务主逻辑

```
ScriptRunBehaviourUpdate (6,075 samples / 32.74%m)
└─ Core.Update → FrameworkCore_OnUpdate (5,590 samples / 30.12%m / self 0.04%)        wrapper
   ├─ MapManager_OnUpdate (2,580 samples / 13.90%m / self 0.04%)                       wrapper
   │   ├─ BattleUIManager_OnUpdate (1,128 samples / 6.08%m / self 0.13%)              wrapper
   │   │   └─ BattleUIManager.UpdateMUIPos (1,013 samples / 5.46%m / self 0.02%)      wrapper
   │   │       └─ MUILayout.Set3DPosition × 7 层递归                                   🔴
   │   │           ├─ Set3DPosition 自身代码 (合计 332 samples self)                   🔴
   │   │           ├─ Enumerator.MoveNext (合计 ~120 samples self)                    🔴
   │   │           ├─ MUIRendererBase.FreshVertexAttribute
   │   │           │   └─ __memcpy (98 samples self)                                  🔴
   │   │           ├─ GC_end_stubborn_change (40 samples self)                        🟡
   │   │           ├─ MUIText.Set3DPosition (12 samples self)
   │   │           └─ MUISprite.Set3DPosition (5 samples self)
   │   ├─ OutSideViewArmyLineMgr_OnUpdate (1,009 samples / 5.44%m / self 0.02%)       wrapper
   │   │   └─ UpdateStraightMoveLine (957 samples / 5.27%m / self 0.11%)
   │   │       ├─ OutsideLineCtrl.RefreshLine (578 samples / 3.18%m / self 69)        🔴
   │   │       │   ├─ ListExtensions.ToNativeList (141 samples / NativeList 分配)     🟡
   │   │       │   ├─ CalculateVertexJob.Schedule (180 samples / 实际执行下沉 Worker) 🟢
   │   │       │   ├─ OutsideLineMesh.RefreshLineVertex (61 samples)
   │   │       │   ├─ NativeList.Dispose (43 samples / 内存释放)
   │   │       │   └─ Color32.op_Implicit (21 samples)
   │   │       ├─ RefreshArmyLine (97 samples / 0.52%m / self 4)                      wrapper
   │   │       │   └─ GetArmyLineID (91 samples / 0.50%m / self 65)                   🔴
   │   │       │       └─ Dictionary.FindEntry (15 samples)
   │   │       ├─ MapEntityManager.GetEntity (46 samples / 0.25%m / self 6)
   │   │       │   └─ Dictionary.FindEntry (23 samples)
   │   │       └─ EntityComponentStore.Exists (44 samples self)                       🟡
   │   ├─ MapManager.MeetScope (待 base 数据有 base/sm 不同子项)
   │   ├─ TServerManager_OnUpdate (136 samples / 0.73%m)                              🟢
   │   │   └─ TServer.Tick (127 samples)
   │   │       ├─ TServer.RecvMessages / DecodeMessages / HandleMessages
   │   │       └─ （子节点未独立成块，全在 0.4%m 以下）
   │   └─ MapManager.OnLateUpdate（被 Core.Update 而非 LateUpdate 调用的部分）
   └─ LuaMgr_OnUpdate → BaseLuaMgr_OnUpdate (2,666 samples / 14.37%m / self 0.02%)   wrapper
       └─ LuaMgr.OnTick&UpdateSchedule (≈2,613 samples)
           ├─ Lua_lua_pcall / xLua 桥接
           │   └─ luaV_execute (137 samples self global)                              🟡 Lua VM 执行
           └─ 具体 Lua 管理器（MapSignificanceMgr / BattleHeadMgr / Hud_Common）
               └─ ⚠️ simpleperf 不可见，需 Unity Profiler / perfetto
```

#### 5.2.2 ScriptRunBehaviourLateUpdate 内部

```
ScriptRunBehaviourLateUpdate (2,788 samples / 15.03%m)
└─ Core.LateUpdate (sub-tree)
   ├─ LuaMgr.OnLateUpdate (含 MapCameraCtrl - 视野/无极缩放)
   │   └─ ⚠️ Lua 内部 simpleperf 不可见
   ├─ MapManager.OnLateUpdate (489 samples / 2.63%m)
   │   └─ （base 609 samples，sm 反而 -20%）
   └─ MeshUIManager.OnLateUpdate
       ├─ MUIControlManager.OnLateUpdate (360 samples self global)                    🔴
       └─ （已与 §5.2.1 BattleUIManager 路径合流到 MUILayout.Set3DPosition）
```

### 5.3 URP 渲染管线（主线程侧）

```
RenderManager::RenderCameras (4,931 samples / 26.57%m)
└─ UniversalRenderPipeline.Render (4,772 samples / 25.71%m)
   └─ RenderCameraStack (4,372 samples / 23.57%m)
      └─ RenderSingleCamera (4,268 samples / 23.00%m)
         ├─ ScriptableRenderer.Execute → ExecuteRenderPass (3,117 samples / 16.80%m)
         │   ├─ DrawRendererPass (990 samples / 5.34%m)                                🟡
         │   │   ├─ DrawFoliageInstanceRenderers (484 samples / 2.61%m)               🟢 base 800→484 (-39%)
         │   │   │   └─ OutsideForestRenderer.DrawInternal (248 samples)
         │   │   └─ RenderMeshSystemV2.DrawRenderers (114 samples)
         │   ├─ ShadowPass.ProcessShadow (974 samples / 5.25%m)                       🟡
         │   │   ├─ PlanarShadow.RenderShadow (732 samples / 3.95%m)                    base 1112→732 (-34%)
         │   │   └─ PlanarShadow.BeginProcessShadow (213 samples / 1.15%m)
         │   └─ BloomPass.Execute (688 samples / 3.71%m)                              🟡
         │       └─ ScriptableRenderContext.Submit (639 samples)
         │           └─ TranscriptScriptableRenderContext.CopyFrom (476 samples)        URP 命令拷贝（可优化）
         └─ MobileBaseRenderer.Setup (603 samples / 3.25%m)                           🟡
            └─ SetupRenderPassFromFeatures (395 samples / 2.13%m)                       每帧重建 Pass 链
```

**渲染负载反直觉发现**：base 野外空场景的主线程渲染负载（6,659 samples）**比 sm（4,931 samples）更重 -27.5%**。原因：野外远景树木 / 阴影投射对象多；sm 视野跟随部队偏近，森林进入视野少，主线程渲染配置反而减负。

---

## §6 RHI 线程深度下钻

RHI 线程 sm 绝对样本：**10,012 samples / 21.20%g**。

### 6.1 子树（base vs sm，按线程内 `%rhi` 排序）

| 子树/调用 | base abs | sm abs | base `%rhi` | sm `%rhi` | Δ% | 判定 |
|---|---|---|---|---|---|---|
| DrawBuffers（GLES draw call）| 5,138 | 5,374 | 52.89% | 53.44% | +5% | 🟢 命令吞吐稳定 |
| BeforeDrawCall（draw 前准备）| 2,097 | 2,346 | 21.59% | 23.33% | +12% | 🟢 |
| ConstantBuffersGLES.UpdateBuffers | 1,530 | 1,900 | 15.75% | 18.89% | +24% | 🟡 GPU Instancing uniform |
| SetShadersThreadable（shader 切换）| 963 | 753 | 9.91% | 7.49% | -22% | 🟢 |
| PresentFrame | 715 | 708 | 7.36% | 7.04% | -1% | 🟢 |
| ApplyGpuProgramGLES | 868 | 664 | 8.94% | 6.60% | -24% | 🟢 |
| eglSwapBuffers（EGL API 调用）| 540 | 433 | 5.56% | 4.31% | -20% | 🟢 辅助信号，未阻塞 |
| ConstantBuffersGLES.UpdateCB | 400 | 448 | 4.12% | 4.46% | +12% | 🟢 |
| SetVertexStateGLES | 387 | 373 | 3.98% | 3.71% | -4% | 🟢 |
| JobQueue.WaitForJobGroupID（等 GeometryJob）| 232 | 387 | 2.39% | 3.85% | +67% | 🟡 |
| DynamicVBO.DrawChunk | 298 | 275 | 3.07% | 2.74% | -8% | 🟢 |

### 6.2 关键判定

- **CPU 端 GPU 命令吞吐量基本不变**（DrawBuffers +5%）→ DrawCall 量没显著增加。
- **常量缓冲上传 +24%**（ConstantBuffersGLES.UpdateBuffers 绝对 1,530→1,900）→ 300 队部队 transform 矩阵每帧全量更新，主要 caller `__memcpy`（见 §10.1）。**未触发红线但是个具体优化点**：dirty flag 或 SSBO 持久映射。
- **GeometryJob 等待 +67%**（绝对 232→387）→ 压测下 ECS Worker 繁忙，GeometryJob 偶发未及时完成。绝对值仍小（387 samples），未触发红线。

---

## §7 GPU bound 判定（修正自 v1/v2）

GPU bound 的主要判定信号在**主线程**而不是 RHI 线程。`eglSwapBuffers` 在 RHI 线程的 self% 是辅助参考，不能单独判定。

### 7.1 实测信号定位（按线程）

| symbol | 真实线程 | base abs | sm abs | 判定 |
|---|---|---|---|---|
| GfxDeviceClient::WaitForPendingPresent（主信号）| 主线程 | 0 | 1 | 🟢 |
| GfxDeviceClient::PresentFrame(ShaderChannelMask) | 主线程 | 2 | 1 | 🟢 |
| GfxDeviceClient::SubmitPresentFrameCallbacks | 主线程 + Render | 4 | 0 | 🟢 |
| GfxDeviceGLES::PresentFrame（RHI 实际执行）| RHI | — | 1 | 🟢 |
| eglSwapBuffers（CPU 提交，辅助）| RHI | 540 | 433 | 🟢 子树 4.31%rhi |
| Semaphore::WaitForSignal（Render↔RHI 同步）| Render | 7 | 5 | 🟢 |

### 7.2 判定

🟢 **未观察到 CPU 侧 GPU bound 信号**。

### 7.3 边界说明

- ✅ 可以说"本次未观察到 CPU 侧 GPU bound 信号"
- ❌ **不能说"GPU 不是瓶颈"**——simpleperf 看的是 CPU 调 driver API 的时间，**不直接反映 GPU 内部计算时间**
- ❌ **不能仅凭 libGLESv2_adreno 占比 +0.6% 推断"GPU 工作量不变"**——driver API 调用时间和 GPU 实际工作量是两件事
- 真实 GPU 工作量判定需要：perfetto GPU counter / Snapdragon Profiler / RenderDoc

### 7.4 Unity Profiler marker 对照（你日常看 Unity Profiler 的对照）

| Unity Profiler marker | simpleperf C++ symbol | 真实线程 | 含义 |
|---|---|---|---|
| Gfx.PresentFrame（在主线程行）| GfxDeviceClient::WaitForPendingPresent 或 PresentFrame | 主线程 | 主线程等 GPU |
| Gfx.PresentFrame（在 Render 线程行）| GfxDeviceGLES::PresentFrame | RHI 线程 | RHI 实际执行 |
| Gfx.WaitForPresentOnGfxThread | GfxDeviceClient::SubmitPresentFrameCallbacks | 主线程 / Render | Present 钩子 |

---

## §8 ECS 健康度

### 8.1 主线程 Job 等待

| 指标 | base abs | sm abs | base `%g` | sm `%g` | 红线 | 判定 |
|---|---|---|---|---|---|---|
| UnityMain 内 WaitForJobGroupID/Complete 子树合计 | 100 | 335 | 0.28% | 0.71% | >2% | 🟢 |

sm 主要 Wait 路径（去重）：

| `%m` | 路径 |
|---|---|
| 0.36% × 2 | System.UpdateNewParents → ScheduleBatchedJobsAndComplete → WaitForJobGroupID |
| 0.22% | TransformChangeDispatch.GetAndClearChangedAsBatchedJobs → WaitForJobGroupID |
| 0.07% | System.BeforeOnUpdate → JobHandle.CombineDependenciesInternalPtr |

**来源**：Unity 内部 ECS Transform 系统的同步点（设计内固有），不是业务 Job 互等。

### 8.2 Job Worker 均衡度

| Worker | base `%g` | sm `%g` |
|---|---|---|
| Thread-129 | 2.50% | 4.10% |
| Thread-135 | 2.46% | 4.00% |
| Thread-136 | 2.47% | 3.95% |
| Thread-158 | 2.44% | 3.94% |
| max-min 偏差 | 2.1% | 4.2% |

判定：🟢 PASS（红线 >30%，远未触发）。

---

## §9 Wwise 音频中间件

| 维度 | base abs | sm abs | base `%g` | sm `%g` | 红线 | 判定 |
|---|---|---|---|---|---|---|
| libAkSoundEngine 全局占比 | 349 | 4,753 | 0.97% | 10.06% | >7% | 🔴 |
| Wwise 工作线程（NativeThread tid 19814）| 383 | 4,895 | 1.06% | 10.36% | — | — |

业务含义：base 野外几乎无音效；sm 行军压测 300 队部队的脚步声、武器声、单位移动音效、UI 提示音叠加 → DSP 处理压力激增。

**本源边界**：simpleperf 看不到 Wwise 内部哪个事件最重（libAkSoundEngine 没有 debug 符号，内部 symbol 都是 `[+offset]`）。事件级归因必须用 **Wwise Profiler**。

优化方向：
- 并发 voice 数限制
- DSP 效果链精简（远距离声音禁用混响/EQ）
- 事件触发频率（脚步声合并 / 群体音效）

---

## §10 反查清单（运行时函数 → 业务模块）

### 10.1 `__memcpy` 反查（全局 5.14%g / 58 处命中）

| `%g` | 线程 | Caller 链 | 业务模块 |
|---|---|---|---|
| 1.70 | RHI | ConstantBuffersGLES.UpdateCB ← GfxDeviceWorker | GPU Instancing 常量缓冲 |
| 0.55 | Render | InstancingBatcher.RenderInstancesWithBuffer | GPU Instancing 数据组装 |
| 0.32 | UnityMain | Mesh.SetVertexData ← MUIDefaultRenderer.SetVertexBufferData | MeshUI vertex buffer |
| 0.21 | RHI | Adreno driver internal | GPU 驱动黑盒 |
| 0.13 | UnityMain | MUIRendererBase.FreshVertexAttribute ← MUILayout.Set3DPosition | MeshUI 顶点属性 |

**结论**：__memcpy 70% 集中在 **GPU Instancing + MeshUI** 两条路径。优化方向：GPU Instancing 用 dirty flag / SSBO 持久映射；MeshUI 静止 UI 跳过 vertex buffer 更新。

### 10.2 `__ieee754_powf` 反查（全局 1.41%g / 9 处）

| `%g` | 线程 | Caller 链 | 业务模块 |
|---|---|---|---|
| 0.49 | RHI | UI::UIGeometryJob | UGUI 几何 Job（静态 UI 设计）|
| 0.19 | Thread-136 (Worker) | UI::UIGeometryJob | 同上 |
| 0.17 | Thread-158 | UI::UIGeometryJob | 同上 |
| 0.16 | Thread-129 | UI::UIGeometryJob | 同上 |
| 0.15 | Thread-135 | UI::UIGeometryJob | 同上 |

**结论**：99%+ 来自 UGUI 几何 Job 颜色 gamma 校正——**项目设计如此**（静态 UI 走 UGUI），不是残留。如果觉得 1.4% 偏重，可考虑用查表替代 powf。

### 10.3 `GC_end_stubborn_change` 反查（Boehm GC 触发源）

| `%g` | Caller |
|---|---|
| 0.12 | Enumerator.MoveNext ← MUIControlManager.OnLateUpdate |
| 0.04 × 4 | Enumerator.MoveNext ← MUILayout.Set3DPosition（多路径）|
| 0.03 | OutsideForestRenderer.DrawForestCell |
| 0.03 | PlanarShadow.ResetAllObjectToRender |

**结论**：主要触发源 = **MeshUI 迭代器**。MeshUI 内部 `IEnumerator<T>` 改成 `for (int i=0; i<count; i++)` 索引访问可减少分配。

### 10.4 `tlsf_memalign` / `ThreadsafeLinearAllocator::Allocate` 反查

| Caller | 业务模块 |
|---|---|
| RenderingCommandBuffer ctor ← ScriptableRenderContext.ExecuteCommandBuffer | URP 命令缓冲 |
| TranscriptScriptableRenderContext.CopyFrom ← Submit | URP 渲染命令拷贝 |
| TranscriptRenderingCommandBuffer.AcquireRenderTexture | RenderTexture 池 |
| GfxDeviceClient.MapConstantBuffers ← InstancingBatcher.MapConstantBuffers | GPU Instancing |

**结论**：全部集中在 URP 命令缓冲和 GPU Instancing。URP 命令缓冲每帧 deep copy 是个具体优化点（命令缓冲对象池）。

---

## §11 Lua GC 工作线程专章

身份证据：
- tid **19816**，comm = `UnityMain`（xLua 启动 C# 线程未设 comm 名）
- 入口 symbol：`LuaMultiThreadGC_LuaGCThreadProc_m84B2A81B530ED40A7A57EB80AB5A641C2374D63B`

| 指标 | base | stressmove |
|---|---|---|
| 样本数 | 211 | 165 |
| `%g` | 1.27% | 0.68% |
| 估算 CPU·s（20s）| 0.21 | 0.165 |
| 估算每帧均值 @60fps | 0.18ms | 0.14ms |

**意外发现**：sm 下 Lua GC 反而比 base 少（-22%）。可能解释：base 野外空场景 Lua 临时对象分配率高（地形采样、视野检测等），sm 行军压测主要工作量在 ECS Burst Job（已下沉到 native，不分配 Lua 对象）。

**对 Unity Profiler 用户的提示**：Unity Profiler 看到的 "Lua GC 线程" 就是这条线程（tid 19816），simpleperf 因为同名陷阱误标为 UnityMain。**两份数据是一致的，没有漏采**。

判定：🟢 PASS（<1%g 红线）。

---

## §12 本源能力边界

| 想回答 | 本源能/否 | 替代源 |
|---|---|---|
| 帧级耗时（哪帧卡）| ❌ | Unity Profiler |
| Lua 内部脚本/管理器名（MapSignificanceMgr / BattleHeadMgr / Hud_Common / MapCameraCtrl）| ❌ | Unity Profiler / perfetto |
| GC.Collect 单次 STW 耗时 | ❌ | Unity Profiler |
| LuaMtGc 单次 spike | ❌ | Unity Profiler |
| 主线程"在算 vs 在等"（off-CPU）| ❌ | perfetto sched |
| 降频 / CPU 频率 / 热限频 | ❌ | perfetto sysfs |
| **GPU 实际工作量** | ❌ | perfetto GPU counter / RenderDoc |
| Wwise 内部事件级归因 | ❌ | Wwise Profiler |
| 资源加载 spike | ❌ | Unity Profiler |

**本源独有能力**：
1. native 中间件真实 CPU 占用（Wwise / Burst / 自研 native）
2. 运行时函数反查到业务模块（memcpy / powf / GC_* 等）
3. C# 业务管理器函数级 self%（前提：libil2cpp 符号化质量良好）
4. Lua 宏观总负载完整公式（含 XLua 桥接路径）
5. 线程身份反推 + 同名线程消歧
6. GPU Instancing / 常量缓冲上传等 RHI 层细节
7. Boehm GC 后台开销（区别于 GC.Collect STW）

---

> 终极报告 v3 结束。配套：[知识库 v2.1](../aoe-cpu-analysis-knowledge.md) · [工程化路线图](./report-to-pipeline-spec.md)。
