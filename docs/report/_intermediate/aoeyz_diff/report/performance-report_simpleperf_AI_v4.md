# simpleperf 单源 性能分析报告 · 终极形态 v4.1.1

> 配套：[知识库 v2.1](../../aoe-cpu-analysis-knowledge.md) · [工程化路线图](../../report-to-pipeline-spec.md) · [差分火焰图](./_intermediate/diff_flamegraph_base_vs_stressmove.html)。
> 数据列只放纯数字，混合内容拆到说明列。所有百分比默认「全局占比」（占采集总样本数），非全局时在文字或表头里说明。
> **术语**：`base` = 基线采集（base 采集）；`cur` = 当前采集（cur 采集）。

---

## §0 结论先行

**本次采集**（PAL-AL00 (PAL-AL00) by HUAWEI, arch aarch64 / cur 采集 / 20s）相比 base base 采集：

- **系统总工作量上升 +30.7%**（36,133 → 47,228 samples），其中**业务层（项目自身代码）绝对工作量 +70.1%**。
- **业务模块出现显著负载暴涨**（详见 §4）：
  - ECS Burst Job 工作量 +4,506 samples（+878%）—— 已下沉到 Worker 线程并行，**不阻塞主线程**
  - Wwise 音频中间件 +4,404 samples（+1262%）—— 独占一整条线程
  - MeshUI 迭代位置刷新 +931 samples（NEW）—— 主线程上
  - 行军线刷新（OutSideViewArmyLineMgr） +224 samples（NEW）—— 主线程上
- **未观察到 CPU 侧 GPU bound 信号**（主线程 `GfxDeviceClient::WaitForPendingPresent` 仅 20 样本）。但 simpleperf 不直接观测 GPU 顶点处理时间，**GPU 实际工作量需 perfetto GPU counter / RenderDoc 复核**。

按 ROI 排序的优化方向（详细见 §4）：

<!-- LLM_FILL_ROI: 为下方每个红线模块各写 1 段「行动建议」（每段 80-150 字），引用知识库相应章节；禁用项目特化死字符；用模块表内出现的真实子函数名 -->

1. **Wwise 音频中间件审视** —— Top-N #2（增量 +4,404 samples）
2. **MeshUI 子树优化** —— Top-N #3（增量 +931 samples）
3. **行军线/路径刷新增量化** —— Top-N #6（增量 +224 samples）

---

## §1 采集元信息与质量门

### 1.1 元信息

| 项 | base | cur |
|---|---|---|
| 场景 | base 采集 | cur 采集 |
| 设备 | PAL-AL00 (PAL-AL00) by HUAWEI, arch aarch64 | 同 |
| 采集事件 | cpu-cycles:u | 同 |
| 采样频率（Hz）| 1000 | 1000 |
| 时长（s）| 20 | 20 |
| 总采样数 | 36,133 | 47,228 |
| 系统总工作量比 | 1.000 | 1.307 |
| 主观帧率 | — | None |

### 1.2 符号化质量

| 指标 | base | cur | 阈值 | 判定 |
|---|---|---|---|---|
| 总状态 | PASS | PASS | — | 🟢 |
| 应用层符号化率 | 99.7% | 91.8% | ≥85% | 🟢 |
| kernel% | 0.0% | 0.0% | — | 🟢 |
| unknown% | 0.4% | 6.3% | <10% | 🟢 |
| 栈回溯锚点命中 | — | — | ≥3/4 | 🟢 |
| `__start_thread` 可达率 | 0.0% | 0.0% | 任意 PASS | 🟢 |

---

## §2 库（so）维度对比

### 2.1 库占比（按绝对增量降序）

| 库 | 绝对增量 | 增量% | cur abs | base abs | 占比 cur % | 说明 |
|---|---|---|---|---|---|---|
| **lib_burst_generated** | +4506 | +878% | 5,019 | 513 | 10.63% | ECS Burst Job 工作量暴涨，已下沉 Worker 并行 |
| **libAkSoundEngine** | +4404 | +1262% | 4,753 | 349 | 10.06% | Wwise 音频中间件 |
| **libil2cpp** | +1602 | +23% | 8,682 | 7,080 | 18.38% | C# 业务代码（含 Lua 桥接 IL2CPP） |
| **libc** | +631 | +22% | 3,459 | 2,828 | 7.33% |  |
| **libxlua** | +561 | +29% | 2,488 | 1,927 | 5.27% | Lua VM |
| **libunity** | -428 | -2.8% | 14,664 | 15,092 | 31.05% | Unity 引擎核心 |
| **libart** | -244 | -26% | 683 | 927 | 1.45% |  |
| **libgui** | -188 | -100% | 0 | 188 | 0.00% |  |
| **linker64** | +186 | +87% | 400 | 214 | 0.85% |  |

#### 库占比绝对增量柱状图

```mermaid
xychart-beta
    title "库占比 base→cur 绝对增量 (samples)"
    x-axis ["Burst", "AkSnd", "il2cpp", "libc", "xlua", "unity", "libart", "libgui", "linker"]
    y-axis "样本数增量" -528 --> 4706
    bar [4506, 4404, 1602, 631, 561, -428, -244, -188, 186]
```

### 2.2 业务层 +70.1% 拆分

**业务层定义**：libil2cpp + libxlua + lib_burst_generated + 项目 native（不含 Wwise/Unity 引擎/中间件）。

| 子项 | 增量 abs | 占业务总增量 | 说明 |
|---|---|---|---|
| lib_burst_generated | +4506 | 67.6% | ECS Burst Job（已下沉 Worker 并行） |
| libil2cpp | +1602 | 24.0% | C# 业务代码（主线程） |
| libxlua | +561 | 8.4% | Lua VM |
| **合计** | **+6669** | 100% | — |

**关键解读**：业务层增幅中 Burst 占比高时，**不等于主线程膨胀**（Burst 在 Worker 并行）。

### 2.3 libc +22.3% 是否反查

libc 增量与系统总压力同步时无需单独反查；`__memcpy` 等主要贡献者见 §10 反查清单。

---

## §3 线程维度对比

### 3.1 线程占比 + 身份识别（按绝对增量降序）

| 真实身份 | 绝对增量 | 增量% | cur abs | base abs | cur % | 线程代号 (comm) | 说明 |
|---|---|---|---|---|---|---|---|
| **Wwise 工作线程** | +4512 | +1178% | 4,895 | 383 | 10.36% | NativeThread | tid 19814，99%+ 在 libAkSoundEngine 内 |
| **主线程** | +2045 | +13% | 18,167 | 16,122 | 38.47% | UnityMain | tid 19292，ExecutePlayerLoop 入口 |
| **Job Worker #1** | +1035 | +115% | 1,937 | 902 | 4.10% | Thread-129 | tid 19461 |
| **Job Worker #2** | +1000 | +113% | 1,888 | 888 | 4.00% | Thread-135 | tid 19460 |
| **Job Worker #3** | +975 | +110% | 1,858 | 883 | 3.94% | Thread-158 | tid 19459 |
| **Job Worker #4** | +972 | +109% | 1,864 | 892 | 3.95% | Thread-136 | tid 19462 |
| **RHI 线程** | +303 | +3.1% | 10,017 | 9,714 | 21.21% | Thread-102 | tid 19471，GfxDeviceWorker→GLES |
| **音频回调（系统）** | +217 | +64% | 555 | 338 | 1.18% | AAudio_1 | tid 19826 |
| **Render 线程** | +189 | +4.5% | 4,410 | 4,221 | 9.34% | UnityGfxRenderS | tid 19472，URP 渲染管线脚本调度 |
| **Choreographer** | +20 | +4.0% | 520 | 500 | 1.10% | UnityChoreograp | tid 19559，VSync 回调 |
| **Lua MtGC 工作线程** | -141 | -31% | 320 | 461 | 0.68% | UnityMain | tid 19816，入口 `LuaMultiThreadGC_LuaGCThreadProc`，comm 误名 UnityMain |

#### 线程绝对增量柱状图

```mermaid
xychart-beta
    title "线程占比 base→cur 绝对增量 (samples)"
    x-axis ["Wwise", "UnityMain", "JW#1", "JW#2", "JW#3", "JW#4", "RHI", "AAudio", "Render", "Chrgr", "LuaMtGc"]
    y-axis "样本数增量" -191 --> 4712
    bar [4512, 2045, 1035, 1000, 975, 972, 303, 217, 189, 20, -141]
```

### 3.2 同名 UnityMain 陷阱

多条线程 comm 可能都叫 `UnityMain`。**tid 19292** 是真主线程，**tid 19816** 是 Lua MtGC 工作线程。Provider 已用 `{comm}#{tid}` 复合 key + identity 消歧。

### 3.3 关键判定

- **CPU 端 GPU 命令吞吐量基本不变**（libGLESv2 +0.6% / RHI 线程 +3.1%）。这只说明 CPU 端调驱动 API 的时间不变，**不等于 GPU 工作量不变**——需 perfetto GPU counter / RenderDoc 复核。
- **ECS 并行化健康**：Job Worker 均衡探针 🟢（偏差阈值 20%）。
- **Wwise 独占一整条工作线程**（10.36% global）+ 库占比 10.06% global，两个角度同源。

### 3.4 对照差分火焰图

可视化验证：[`./_intermediate/diff_flamegraph_base_vs_stressmove.html`](./_intermediate/diff_flamegraph_base_vs_stressmove.html)。红色 = cur 变重 / 蓝色 = base 变重 / 白色 = 不变。重点关注：
- UnityMain → ScriptRunBehaviourUpdate 子树（红色，业务上涨）
- UnityMain → RenderManager::RenderCameras 子树（蓝/白，URP 主线程配置）
- Thread-102 → DrawBuffers 子树（近白色，命令吞吐量）
- Wwise / NativeThread 工作线程（红色时，中间件暴涨）

---

## §4 全局性能热点 Top-N

> 跨线程视角，按「业务模块」聚合，按 base→cur **绝对增量**排序。运行时函数归 §10。

### 4.1 Top-N 总表

口径说明：`base abs` / `cur abs` 为模块内相关函数 **self 累加**（避免父子重复）。Wwise / ECS Burst / Lua GC 等若内部 symbol 不可细分，用库或线程级累加。

| # | 判定 | 业务模块 | 所在线程 | base abs | cur abs | 增量 abs | 增量% | 说明 |
|---|---|---|---|---|---|---|---|---|
| 1 | 🟢 | ECS Burst Job 工作量 | Job Worker × 4 | 513 | 5,019 | +4506 | +878% | 已下沉 Worker 并行，主线程不受影响 |
| 2 | 🔴 | Wwise 音频中间件 | Wwise 工作线程 + 主线程 | 349 | 4,753 | +4404 | +1262% | 战斗音效暴涨，独占一整条线程 |
| 3 | 🔴 | MeshUI 迭代位置刷新 | 主线程（LateUpdate） | 0 | 931 | +931 | NEW | MUIControlManager + MUILayout.Set3DPosition 等 |
| 4 | 🟢 | Lua VM 解释执行 | 主线程 + Lua GC | 1,435 | 1,780 | +345 | +24% | Lua VM 解释执行 |
| 5 | 🟢 | URP 主线程渲染配置 | 主线程 | 0 | 299 | +299 | NEW | URP 主线程渲染配置 |
| 6 | 🔴 | 行军线刷新（OutSideViewArmyLineMgr） | 主线程（Update） | 0 | 224 | +224 | NEW | OutsideLineCtrl.RefreshLine / GetArmyLineID 等 |
| 7 | 🟢 | RHI DrawCall 提交 | RHI 线程 | 742 | 652 | -90 | -12% | RHI DrawCall 命令吞吐 |
| 8 | 🟢 | RHI 常量缓冲上传 | RHI 线程 | 244 | 263 | +19 | +7.8% | RHI 常量缓冲上传 |
| 9 | 🟢 | 网络消息处理 | 主线程 | 0 | 13 | +13 | NEW | 网络消息处理 |
| 10 | 🟢 | Lua GC 工作线程 | LuaMtGc Worker | 2 | 7 | +5 | +250% | Lua GC 工作线程 |

### 4.2 Top-N 解读

**🔴 触发红线的 3 项（含中间件）= 真正需要关注的方向**。其余为健康并行模块（ECS Burst）或 base→cur 下降项，无需特别关注。

下面 §4.3 ~ §4.6 是每个 Top 项的细化分析（含调用入口、关联开销与优化方向）。

### 4.3 音频中间件（Wwise）（Top-N #2，🔴）

**身份**：
- 库 libAkSoundEngine.so 占比 base 0.97% → cur 10.06%（绝对 349 → 4,753 samples）
- Wwise 工作线程（comm = NativeThread, tid 19814）独占 base 1.06% → cur 10.36%（绝对 383 → 4,895 samples）
- 库与线程两个口径同源（线程内绝大部分在 libAkSoundEngine 内）

**业务含义**：<!-- LLM_FILL: 解读 base→cur 数字变化（用本节表格中的数据），结合采集场景 meta.sceneCur 说明音效负载激增的业务原因；60-120 字 -->

**本源边界**：libAkSoundEngine 内部 symbol 多为 `[+offset]`（Wwise 未提供 debug 符号），simpleperf **无法定位 Wwise 内部哪个事件最重**，事件级归因必须用 **Wwise Profiler**。

**调用入口**：<!-- LLM_FILL: 1 句话描述 Wwise 工作线程的执行入口 -->

**优化方向**：<!-- LLM_FILL: 3-5 条具体优化建议，参考知识库 §4.10 (Wwise 中间件)；不要用项目特化场景词，用 sceneCur 实际场景 -->

### 4.4 动态 UI 子树（MeshUI 等）（Top-N #3，🔴）

**模块内部细分**（按 self 绝对量排序）：

| 子函数 | cur self abs | self % global | 说明 |
|---|---|---|---|
| MUIControlManager.OnLateUpdate | 360 | 0.762% |  |
| MUILayout.Set3DPosition | 332 | 0.703% |  |
| MUIRenderable.get | 38 | 0.080% |  |
| MUILayoutManager.OnUpdate | 36 | 0.076% |  |
| AOEMeshUIMUITextWrap. | 26 | 0.055% |  |
| MUILayoutRoot.UpdateDirtyNodes | 24 | 0.051% |  |
| MUIText.Set3DPosition | 20 | 0.042% |  |
| MUIRendererBase.FreshVertexAttribute | 17 | 0.036% |  |
| MUISprite.Set3DPosition | 11 | 0.023% |  |
| MeshUIManager.OnLateUpdate | 7 | 0.015% |  |
| **模块 self 合计** | **931** | **1.97%** | — |

**业务含义**：<!-- LLM_FILL: 基于上面表格的 base→cur 数字变化解读业务负载来源；用 meta.sceneCur 实际场景，禁用项目特化死字符；60-120 字 -->

**调用入口**：<!-- LLM_FILL: 用 §5.2 主线程调用树中实际出现的节点串成 1 句调用链描述 -->

**关联开销**：<!-- LLM_FILL: 列出本模块内的运行时反查开销（如 __memcpy / GC_end_stubborn_change 等），从 §10 反查表里取数；2-4 条 bullet -->

**优化方向**：<!-- LLM_FILL: 3-5 条优化建议，参考知识库相应章节（§4.2.2 MeshUI 或 §4.1.3 / §4.6 行军线相关业务管理器）；用模块表内出现的真实子函数名，禁止编造未出现的函数名 -->

### 4.5 C# 业务管理器（行军/路径刷新等）（Top-N #6，🔴）

**模块内部细分**（按 self 绝对量排序）：

| 子函数 | cur self abs | self % global | 说明 |
|---|---|---|---|
| OutsideLineCtrl.RefreshLine | 69 | 0.146% |  |
| OutSideViewArmyLineMgr.GetArmyLineID | 65 | 0.138% |  |
| OutSideViewArmyLineMgr.UpdateStraightMoveLine | 21 | 0.044% |  |
| AOE.Outside.OutsideLineCtrl.CalculateVertexJob.CalculateVertex(A | 16 | 0.034% |  |
| OutsideLineMesh.RefreshLineVertex | 13 | 0.028% |  |
| Unity.Jobs.IJobExtensions.JobStruct`1<AOE.Outside.OutsideLineCtr | 12 | 0.025% |  |
| OutsideLineMesh.RefreshMesh | 9 | 0.019% |  |
| AOE.Outside.OutsideLineCtrl.CalculateVertexJob.SamplePathPointTe | 6 | 0.013% |  |
| OutSideViewArmyLineMgr.OnUpdate | 4 | 0.008% |  |
| OutSideViewArmyLineMgr.RefreshArmyLine | 4 | 0.008% |  |
| **模块 self 合计** | **224** | **0.47%** | — |

**业务含义**：<!-- LLM_FILL: 基于上面表格的 base→cur 数字变化解读业务负载来源；用 meta.sceneCur 实际场景，禁用项目特化死字符；60-120 字 -->

**调用入口**：<!-- LLM_FILL: 用 §5.2 主线程调用树中实际出现的节点串成 1 句调用链描述 -->

**关联开销**：<!-- LLM_FILL: 列出本模块内的运行时反查开销（如 __memcpy / GC_end_stubborn_change 等），从 §10 反查表里取数；2-4 条 bullet -->

**优化方向**：<!-- LLM_FILL: 3-5 条优化建议，参考知识库相应章节（§4.2.2 MeshUI 或 §4.1.3 / §4.6 行军线相关业务管理器）；用模块表内出现的真实子函数名，禁止编造未出现的函数名 -->

### 4.6 ECS Burst Job 工作量（Top-N #1，🟢 不需优化）

虽然增量绝对量最大（+4506 samples），但**全部跑在 Job Worker 线程上并行**（Thread-19461/Thread-19460/Thread-19462/Thread-19459 cur 各约 4.0% global）。
主线程上仅触发零星 Job 等待（共 66 samples / 0.139% global，远低于 2% 红线）。**ECS 并行化健康，无需优化**。

Top Burst Job（详见 §7.3）：MoveChain_SoldierMoveSystem.SoldierMoveJob（541 abs） / RotationLerpSystem.DoSmoothLerp（372 abs） / SyncViewEntitySystem（259 abs） / WriteInstanceDataJob（208 abs） / MoveChain_ArmyMoveSystem.ArmyMoveJob（195 abs） 等。

---

## §5 主线程深度分析

### 5.1 主线程 PlayerLoop 阶段表

主线程 cur 总绝对样本：18,167 / 占全局 38.47%。下表是主线程内 PlayerLoop 子树各阶段切分（不可直接相加，因有重叠子节点）：

| 阶段 | base abs | cur abs | base 主线程% | cur 主线程% | 增量% | 判定 | 说明 |
|---|---|---|---|---|---|---|---|
| ScriptRunBehaviourUpdate | 2624 | 5948 | 16.28% | 32.74% | +127% | 🔴 | 业务主逻辑，见 §5.2 |
| ScriptRunBehaviourLateUpdate | 1673 | 2730 | 10.38% | 15.03% | +63% | 🟡 | 见 §5.2 LateUpdate 子段 |
| UpdateTextureStreamingManager | 450 | 289 | 2.79% | 1.59% | -36% | 🟢 | 纹理 streaming |
| ParticleSystemBeginUpdateAll | 26 | 166 | 0.16% | 0.91% | +538% | 🟢 | 粒子开始 |
| PlayerSendFrameComplete | 500 | 377 | 3.1% | 2.08% | -25% | 🟢 | 资源加载尾部 |
| PlayerUpdateCanvases | 326 | 224 | 2.02% | 1.24% | -31% | 🟢 | UGUI Canvas |
| LegacyAnimationUpdate | 45 | 137 | 0.28% | 0.75% | +204% | 🟢 | Legacy 动画 |
| UpdateAllRenderers | 39 | 100 | 0.24% | 0.55% | +156% | 🟢 | 渲染器列表 |
| PlayerEmitCanvasGeometry | 172 | 120 | 1.07% | 0.66% | -30% | 🟢 | UGUI 几何提交 |
| FinishFrameRendering | 165 | 122 | 1.02% | 0.67% | -26% | 🟢 | 帧渲染收尾 |
| ParticleSystemEndUpdateAll | 4 | 43 | 0.02% | 0.24% | +975% | 🟢 | 粒子结束 |
| LuaMultiThreadGC.main | 23 | 10 | 0.14% | 0.05% | -56% | 🟢 | 主线程同步开销 |
| PreSendMouseEvents | 61 | 64 | 0.38% | 0.35% | +4.9% | 🟢 | 输入 |

**主线程 PlayerLoop 之外入口**：
- `RenderManager::RenderCameras`（URP 主线程侧）：4,828 samples / 26.57% 主线程，详见 §6.1

---

### 5.2 主线程完整调用树

按 `%` 表示主线程内占比；abs = 绝对样本数；self = 节点自身 self%（global）。

**标记图例**：
- 📈 **新增压力源**：base→cur 增量 abs ≥ 100 samples，表示压力上涨明显
- 🔴 **高 self 真热点**：节点 self ≥ 0.05% global 且 abs ≥ 100 samples，表示自身代码就重
- 🟡 **次级关注**：self ≥ 0.05% global 但 abs 较小，或 totalPct 高但 self 接近 0（wrapper）
- 🟢 **健康**：未触发任何阈值
- 📈🔴 可叠加；`[wrapper]` 表示节点自身 self 接近 0，热点在子节点

```
UnityMain (18,167 / 100% / cur 全局 38.47%)
├─ ExecutePlayerLoop (12,521 / 68.92%)
│  │
│  ├─ EarlyUpdate.UpdateTextureStreamingManager (289 / 1.59%) 🟢 , base→cur -36%
│  │   └─ TextureStreamingManager.Update (289 / 1.59%) (self 0.39% global)
│  ├─ Update.ScriptRunBehaviourUpdate (5,948 / 32.74%) 📈🟡 业务主入口, base→cur +127%
│  │   └─ MonoBehaviour.CallUpdateMethod → il2cpp Runtime.Invoke
│  │       └─ Core.Update → FrameworkCore_OnUpdate (5,472 / 30.12%) [wrapper, self 0.00% global] 📈🟡
│  │           │
│  │           ├─ LuaMgr_OnUpdate → BaseLuaMgr_OnUpdate (2,613 / 14.38%) [wrapper, base→cur +88%] 📈🟡
│  │           │   └─ ⚠️ Lua 内部管理器名 simpleperf 不可见
│  │           │       需 Unity Profiler 看 MapSignificanceMgr / BattleHeadMgr / Hud_Common 等
│  │           ├─ MapManager_OnUpdate (2,526 / 13.90%) [wrapper, self 0.00% global] 📈🟡
│  │           │   ├─ BattleUIManager_OnUpdate (1,104 / 6.08%) [wrapper, self 0.00% global, base→cur +1477%] 📈🟡
│  │           │   │   └─ BattleUIManager.UpdateMUIPos (992 / 5.46%) [wrapper] 🟡
│  │           │   │       └─ MUILayout.Set3DPosition × 8 层递归                            see §4.4
│  │           │   │       ├─ MUILayout.Set3DPosition 自身代码累加 (864 self)        📈🔴
│  │           │   │       ├─ MUIControlManager.OnLateUpdate 同支路 (360 self)       📈🔴
│  │           │   │       ├─ Enumerator.MoveNext × 多处 (~19 self 累加)            📈🔴
│  │           │   │       ├─ MUIRendererBase.FreshVertexAttribute
│  │           │   │       │   └─ __memcpy (164 self)                                  see §10.1
│  │           │   │       ├─ GC_end_stubborn_change (19 self)                       📈   see §10.3
│  │           │   │       ├─ MUIText / MUISprite.Set3DPosition (~47 self)
│  │           │   │       └─ ...
│  │           │   ├─ OutSideViewArmyLineMgr_OnUpdate (988 / 5.44%) [wrapper, base→cur +2252%] 📈🟡
│  │           │   │   ├─ UpdateStraightMoveLine (957 / 5.27%) 📈  see §4.5
│  │           │   │   │   ├─ OutsideLineCtrl.RefreshLine (69 self)                      📈🔴
│  │           │   │   │   ├─ CalculateVertexJob.Schedule (180, Job 调度) 🟢                实际下沉 Worker
│  │           │   │   │   ├─ ListExtensions.ToNativeList (141, 分配开销)
│  │           │   │   │   └─ OutsideLineMesh.RefreshLineVertex (13)
│  │           │   │   ├─ RefreshArmyLine (95 / 0.52%) [wrapper] 🟡
│  │           │   │   │   └─ GetArmyLineID (65, self 65)                                📈🔴 Dictionary 查找
│  │           │   │   ├─ MapEntityManager.GetEntity (46 / 0.25%) 🟢
│  │           │   │   └─ EntityComponentStore.Exists (44 / 0.24%) (self 114) 🟡
│  │           └─ TServerManager_OnUpdate (134 / 0.73%) 🟢
│  ├─ PreLateUpdate.LegacyAnimationUpdate (137 / 0.75%) 🟢 , base→cur +204%
│  │   └─ AnimationManager.Update (135 / 0.75%)
│  │       └─ Animation.UpdateAnimation (127 / 0.70%) (self 0.14% global)
│  ├─ PreLateUpdate.ParticleSystemBeginUpdateAll (166 / 0.91%) 📈🟢 self 见子节点, base→cur +538%
│  │   └─ ParticleSystem.BeginUpdate (166 / 0.91%)
│  │       ├─ ParticleSystem.Update1a (56 / 0.31%) (self 0.30% global)
│  │       └─ ParticleSystemRenderer.CalculateWorldMatrixAndBoundsJob (63 / 0.35%) (self 0.18% global)
│  ├─ PreLateUpdate.ScriptRunBehaviourLateUpdate (2,730 / 15.03%) 📈🟡 , base→cur +63%
│  │   └─ Core.LateUpdate (2,101 / 11.56%) 🟡
│  │       ├─ LuaMgr.OnLateUpdate (含 MapCameraCtrl, 视野/无极缩放)
│  │       │   └─ ⚠️ Lua 内部管理器名 simpleperf 不可见
│  │       │       需 Unity Profiler 看 MapSignificanceMgr / BattleHeadMgr / Hud_Common 等
│  │       ├─ MapManager.OnLateUpdate (478 / 2.63%) 🟢
│  │       └─ MeshUIManager.OnLateUpdate (1,079 / 5.94%) 📈🟡
│  │           └─ MUIControlManager.OnLateUpdate (360 self)                              📈🔴 see §4.4
│  │               └─ ...（更深层位置计算细节见 §4.4）
│  ├─ PostLateUpdate.FinishFrameRendering (122 / 0.67%) 🟢 , base→cur -26%
│  ├─ PostLateUpdate.PlayerEmitCanvasGeometry (120 / 0.66%) 🟢 , base→cur -30%
│  │   └─ UI.Canvas.EmitWorldGeometry (117 / 0.65%) (self 0.06% global)
│  ├─ PostLateUpdate.PlayerUpdateCanvases (224 / 1.24%) 🟢 , base→cur -31%
│  │   └─ UI.Canvas.UpdateBatches (83 / 0.46%)
│  ├─ PostLateUpdate.UpdateAllRenderers (100 / 0.55%) 🟢 , base→cur +156%
│  └─ PostLateUpdate.PlayerSendFrameComplete (377 / 2.08%) 🟢 , base→cur -25%
└─ RenderManager::RenderCameras (4,828 / 26.57%)                                        [详见 §6.1]
    └─ UniversalRenderPipeline.Render → RenderCameraStack → RenderSingleCamera
```

---

### 5.3 主线程红线扫描结果

按知识库 v2.1 §6 阈值表自动扫描结果：

| 检测项 | 实测 | 单位 | 阈值（红线）| 判定 | 说明 |
|---|---|---|---|---|---|
| MeshUI 子树 | 5.124 | 主线程% | >3% | 🔴 |  |
| _其余 11 项探针_ | — | — | — | 🟢 | 全部 PASS |

**注**：<!-- LLM_FILL: 1 句话解释 wrapper 高占比但 self 接近 0 的下钻关系（基于 §4 Top-N 与本表的实测模块），不要预设 BattleUIManager / OutSideViewArmyLineMgr 等模块名 -->

---

## §6 渲染相关线程

### 6.1 主线程上的 URP 渲染管线下钻

调用入口：UnityMain → `RenderManager::RenderCameras`（不在 PlayerLoop 子树内）。

```
RenderManager::RenderCameras (4,828 / 26.57% 主线程)
└─ UniversalRenderPipeline.Render (4,663 / 25.67%) 🟡
   └─ RenderCameraStack (4,282 / 23.57%) 🟡
      └─ RenderSingleCamera (4,177 / 22.99%) 🟡
         ├─ ScriptableRenderer.Execute → ExecuteRenderPass (3,053 / 16.80%) 🟡
         │  ├─ DrawRendererPass (969 / 5.34%) (self 0.10% global) 🔴
         │  │  ├─ DrawFoliageInstanceRenderers (474 / 2.61%) (self 0.06% global) 🔴
         │  │  │  └─ OutsideForestRenderer.DrawInternal (207 / 1.14%) 🟡
         │  │  │     └─ OutsideTreeTypeRenderer.DrawForestCell (193 / 1.06%) 🟡
         │  │  └─ RenderMeshSystemV2.DrawRenderers (113 / 0.62%) (self 0.06% global) 🔴
         │  ├─ ShadowPass.ProcessShadow (953 / 5.25%) 🟡
         │  │  ├─ PlanarShadow.RenderShadow (718 / 3.95%) 🟡
         │  │  └─ PlanarShadow.BeginProcessShadow (209 / 1.15%) 🟡
         │  │     └─ CalculateTerrainHeight (97 / 0.53%) 🟢
         │  ├─ BloomPass.Execute (674 / 3.71%) 🟡
         │  │  └─ ScriptableRenderContext.Submit (628 / 3.45%) 🟡
         │  │     └─ TranscriptScriptableRenderContext.CopyFrom (467 / 2.57%) 🟡
         └─ MobileBaseRenderer.Setup (591 / 3.25%) 🟡
            └─ SetupRenderPassFromFeatures (388 / 2.13%) (self 0.10% global) 🔴
               └─ TBUBaseFeature.AddRenderPasses (350 / 1.93%) (self 0.11% global) 🔴
```

**反直觉发现**：URP 主线程渲染配置 base→cur 绝对变化约 -44.5%（8,700 → 4,828 samples）。这只表示主线程 URP 配置代码变化，**不等于 GPU 实际渲染压力变化**（详见 §6.3）。

### 6.2 RHI 线程下钻（Thread-102 / GfxDeviceWorker）

调用入口：独立线程，`GfxDeviceWorker::RunGfxDeviceWorker → RunCommand`。

```
Thread-102 / RHI (10,017 / 21.21% global)
└─ GfxDeviceWorker.RunCommand (10,017 / 99.00% RHI)
   ├─ DrawBuffers (5,353 / 53.44%) (self 2.17% global) 🔴
   │  ├─ DrawBuffersStereo (2,426 / 24.22%) (self 0.10% global) 🔴
   │  │  └─ DrawBufferRanges → Adreno driver internal (黑盒)
   │  ├─ BeforeDrawCall (2,337 / 23.33%) (self 0.31% global) 🔴
   │  │  └─ ConstantBuffersGLES.UpdateBuffers (1,892 / 18.89%) (self 2.08% global) 🔴
   │  │     └─ DataBufferGLES.Upload (1,328 / 13.25%) (self 0.88% global) 🔴
   │  │        └─ __memcpy (400 / 4.00%) (self 4.00% global) 🔴  see §10
   │  ├─ SetVertexStateGLES (372 / 3.71%) (self 1.25% global) 🔴
   │  └─ ApplyGpuProgramGLES (661 / 6.60%) (self 1.95% global) 🔴
   ├─ PresentFrame (705 / 7.04%) 🟡
   │  └─ eglSwapBuffers (432 / 4.31%) 🟡
   ├─ JobQueue.WaitForJobGroupID (385 / 3.85%) 🟡
   │  [等 GeometryJob 完成，压测下偶发]
   ├─ SetShadersThreadable (750 / 7.49%) (self 0.89% global) 🔴
   ├─ ConstantBuffersGLES.UpdateCB (446 / 4.46%) (self 0.45% global) 🔴
   │  └─ __memcpy (401 / 4.00%) (self 4.00% global) 🔴  see §10
   └─ DynamicVBO.DrawChunk (274 / 2.74%) 🟡
```

**关键变化**：
- 命令吞吐量（DrawBuffers）CPU 端变化见上表
- 常量缓冲上传（UpdateBuffers）见 ConstantBuffersGLES 子树
- GeometryJob 等待见 JobQueue::WaitForJobGroupID（若有）

### 6.3 GPU bound 判定（修正自 v1/v2/v3 误判）

**正确的 GPU bound 信号在主线程，不是 RHI 线程**：

| symbol | 真实线程 | base | cur | 含义 |
|---|---|---|---|---|
| GfxDeviceClient::WaitForPendingPresent | 主线程 | 49 | 3 | 主信号：主线程等 RHI Present |
| GfxDeviceClient::PresentFrame | 主线程 | 0 | 0 | 主线程发起 Present |
| GfxDeviceGLES::PresentFrame | RHI 线程 | 3477 | 5 | RHI 实际执行 Present |
| eglSwapBuffers | RHI | 2627 | 2035 | 辅助参考，不能单独判定 |

**判定**：🟢 **未观察到 CPU 侧 GPU bound 信号**。

**边界说明**：
- ✅ 可以说「本次未观察到 CPU 侧 GPU bound 信号」
- ❌ 不能说「GPU 不是瓶颈」——simpleperf 看的是 CPU 调 driver API 的时间
- ❌ 不能仅凭 libGLESv2 占比推断 GPU 工作量不变
- 真实 GPU 工作量需 perfetto GPU counter / RenderDoc

**Unity Profiler marker 对照**：

| Unity Profiler | simpleperf C++ symbol | 真实线程 | 含义 |
|---|---|---|---|
| Gfx.PresentFrame（主线程）| GfxDeviceClient::WaitForPendingPresent | 主线程 | 主线程等 GPU |
| Gfx.PresentFrame（Render）| GfxDeviceGLES::PresentFrame | RHI | RHI 执行 Present |

eglSwapBuffers 探针：base 5.562% → cur 4.309% RHI（🟢）。

---

## §7 ECS / Worker 线程

### 7.1 Job Worker 均衡度

| Worker | base % global | cur % global | base abs | cur abs |
|---|---|---|---|---|
| Thread-129 | 2.50% | 4.10% | 902 | 1,937 |
| Thread-135 | 2.46% | 4.00% | 888 | 1,888 |
| Thread-136 | 2.47% | 3.95% | 892 | 1,864 |
| Thread-158 | 2.44% | 3.94% | 883 | 1,858 |
| **max-min 偏差** | **0.1%** | **0.2%** | — | — |

🟢 PASS（红线 >30%）。均衡探针偏差 4.219%。

### 7.2 主线程 Job Wait 检测

| 指标 | base abs | cur abs | base % global | cur % global | 红线 | 判定 |
|---|---|---|---|---|---|---|
| 主线程 WaitForJobGroupID/Complete 子树合计 | 0 | 66 | 0.000% | 0.139% | >2% | 🟢 green |

cur 主要 Wait 路径（去重）：

| 主线程% | 路径 |
|---|---|
| 0.36% | ParentSystem_OnUpdate → ParentSystem_UpdateNewParents → JobHandle_CUSTOM_ScheduleBatchedJobsAndComplete(JobFence&) |
| 0.36% | ParentSystem_UpdateNewParents → JobHandle_CUSTOM_ScheduleBatchedJobsAndComplete(JobFence&) → JobQueue::WaitForJobGroupID |
| 0.24% | InitPlayerLoopCallbacks → ParticleSystem::SyncPostSimulationJobs → JobQueue::WaitForJobGroupID |
| 0.21% | RendererUpdateManager::UpdateAll → TransformChangeDispatch::GetAndClearChangedAsBatchedJobs_Internal → JobQueue::WaitForJobGroupID |
| 0.13% | PlanarShadow → RenderMeshSystemV2_DrawStaticShadowsInternal → JobHandle_CUSTOM_ScheduleBatchedJobsAndComplete(JobFence&) |
| 0.12% | TransformChangeDispatch::GetAndClearChangedTransforms → TransformChangeDispatch::GetAndClearChangedAsBatchedJobs_Internal → JobQueue::WaitForJobGroupID |

来源：Unity ECS Transform 同步点（设计内固有），**不是业务 Job 互等**。详见 §4.6 / §5.3。

### 7.3 Top Burst Job 列表

按 self 全局% 排序（cur 数据）：

| # | Burst Job | cur abs | self % global | 业务模块 |
|---|---|---|---|---|
| 1 | MoveChain_SoldierMoveSystem.SoldierMoveJob | 644 | 1.36% | ECS 士兵移动 |
| 2 | RotationLerpSystem.DoSmoothLerp | 465 | 0.98% | ECS 旋转插值 |
| 3 | WriteInstanceDataJob | 402 | 0.85% | GPU Instancing 数据回写 |
| 4 | UtilHeightMapBurst.GetSamplerHeights | 331 | 0.70% | 地形高度采样 |
| 5 | SyncViewEntitySystem | 328 | 0.69% | ECS → 显示同步 |
| 6 | LocalToParentSystem.ChildLocalToWorld | 302 | 0.64% | Transform 层级变换 |

合计约 **5.2% global**，与 lib_burst_generated（5,019 samples）一致。**ECS 健康度 🟢 PASS**。

---

## §8 中间件 — Wwise 专章

**线程**：tid 19814 / comm NativeThread / identity `wwise_worker`

| 指标 | base | cur | Δ |
|---|---|---|---|
| 库绝对样本 | 349 | 4,753 | +4404 |
| 全局占比 | 0.967% | 10.063% | 🔴 |

**优化建议**：Voice Limiting、MixBus 链深度检查、Wwise Profiler Monitor 确认 Active Voices。

---

## §9 Lua GC 工作线程专章

**tid 19816**，comm = `UnityMain`（**误名**），identity = `lua_mtgc_worker`。
入口 `LuaMultiThreadGC_LuaGCThreadProc`。**勿与主线程 UnityMain 混淆。**

| 指标 | base | cur |
|---|---|---|
| 绝对样本 | 461 | 320 |
| Δ | — | -141 |

探针 `probe.lua.mtgc.worker`：0.014% global，🟢。

**变化解读**：cur 下 Lua GC 工作线程负载相对 base **下降**（绝对 -141）。
<!-- LLM_FILL: 用 1-2 句话解释 base→cur Lua GC 负载变化的可能业务原因（基于本次 Top-N 中 Lua / ECS Burst / 中间件等模块的相对增量），结合知识库 §4.9 多线程 GC 一节；不要预设场景词 -->

**对 Unity Profiler 用户的提示**：Profiler 中的 Lua GC 线程即 tid 19816；simpleperf 因 xLua 启动 C# GC 线程未设 comm 名，会显示为 `UnityMain`。Provider 已通过入口 symbol `LuaMultiThreadGC_LuaGCThreadProc` 反查 tid 完成消歧，与主线程严格分离，数据无漏采。

判定：🟢 PASS（<1% global 红线）。

---

## §10 反查清单（运行时函数 → 业务模块）

> simpleperf 单源核心独有能力：把「看似分散的运行时开销」反查到业务调用源。

### 10.1 `__memcpy` 反查（全局 3.14% / 0 处命中）

| 全局% | Caller 链 | 业务模块 |
|---|---|---|
| 0.85 | ConstantBuffersGLES::UpdateCB(CbKey, void const*, unsigned l < GfxDeviceWorker:: | RHI / GPU Instancing |
| 0.85 | !!!0000!e9a0267a4c3f12c4fb16e257d3a26e!272cf717f5! < !!!0000!9c0715a0352375a9ec2 | 未分类 |
| 0.55 | InstancingBatcher::RenderInstancesWithBuffer(TranscriptRende < TranscriptRenderi | RHI / GPU Instancing |
| 0.32 | Mesh::SetVertexData(void const*, unsigned long, unsigned lon < Mesh_CUSTOM_Inter | MeshUI 顶点上传 |
| 0.21 | !!!0000!f56be09eb88f86833124f1df42e945!272cf717f5! < !!!0000!6b200851123c7898055 | 未分类 |
| 0.13 | MUIRendererBase_FreshVertexAttribute_TisVector3_tDCF05E21F63 < MUIRendererBase_S | MeshUI 顶点上传 |

**结论**：<!-- LLM_FILL: 1-2 句话总结 __memcpy 在哪些业务模块路径上集中（基于上面表格中的 Caller 链 + 业务模块列）；不预设业务模块名，必须从表格的 module 列里取真实模块名 -->

### 10.2 `__ieee754_powf` 反查

| 全局% | Caller 链 | 业务模块 |
|---|---|---|
| 0.49 | UI::UIGeometryJob(UI::UIGeometryJobData*) < JobQueue::Exec(JobInfo*, long long,  | UGUI 几何 Job |
| 0.19 | UI::UIGeometryJob(UI::UIGeometryJobData*) < JobQueue::Exec(JobInfo*, long long,  | UGUI 几何 Job |
| 0.02 | UI::UIGeometryJob(UI::UIGeometryJobData*) < Thread-102 | UGUI 几何 Job |
| 0.01 | UI::UIGeometryJob(UI::UIGeometryJobData*) < Thread-158 | UGUI 几何 Job |
| 0.01 | UI::UIGeometryJob(UI::UIGeometryJobData*) < Thread-129 | UGUI 几何 Job |

**结论**：<!-- LLM_FILL: 1 句话总结 powf 的主要 caller 来源；不预设 UGUI/MeshUI 等业务模块名，从上表里取 -->

### 10.3 `GC_end_stubborn_change` 反查（Boehm GC 触发源）

| 全局% | Caller |
|---|---|
| 0.25 | Enumerator_MoveNext_m04F91EFB2C11DE1ED39627288DD2CF031EC8819 < MUICont |

**结论**：<!-- LLM_FILL: 1-2 句话总结 GC 后台标记的主要触发路径（基于上表 Caller 列），并给出 1 条优化建议；不要预设业务模块名 -->

### 10.4 `tlsf_memalign` / `ThreadsafeLinearAllocator::Allocate` 反查

| Caller | 业务模块 |
|---|---|
| MemoryManager::Allocate(unsigned long, unsigned long, MemLab < GfxDevi | RHI / GPU Instancing |
| DynamicHeapAllocator::Allocate(unsigned long, int) < MemoryManager::Al | URP / 命令缓冲 |

**结论**：<!-- LLM_FILL: 1 句话总结 TLSF / ThreadsafeLinearAllocator 分配集中在哪些路径；从上表 module 列取名，不预设 -->

---

## §11 本源能力边界

| 想回答 | 本源能/否 | 替代源 |
|---|---|---|
| 帧级耗时（哪帧卡）| ❌ | Unity Profiler |
| Lua 内部管理器名 | ❌ | Unity Profiler / perfetto |
| GC.Collect 单次 STW 耗时 | ❌ | Unity Profiler |
| 主线程 off-CPU（在算 vs 在等）| ❌ | perfetto sched |
| 降频 / 热限频 | ❌ | perfetto sysfs |
| **GPU 实际工作量** | ❌ | perfetto GPU counter / RenderDoc |
| Wwise 内部事件级归因 | ❌ | Wwise Profiler |
| 资源加载 spike | ❌ | Unity Profiler |

**本源独有能力**：
1. native 中间件真实 CPU 占用（Wwise / Burst / 自研 native）
2. 运行时函数反查到业务模块（memcpy / powf / GC_* 等）
3. C# 业务管理器函数级 self%（libil2cpp 符号化良好时）
4. Lua 宏观总负载（含 XLua 桥接路径）
5. 线程身份反推 + 同名线程消歧
6. GPU Instancing / 常量缓冲上传等 RHI 层细节
7. Boehm GC 后台开销（区别于 GC.Collect STW）

**工程化建议**：simpleperf + perfetto 互补采数；维护 binary_cache；对 wwise/meshUI 探针设 CI 回归阈值。
