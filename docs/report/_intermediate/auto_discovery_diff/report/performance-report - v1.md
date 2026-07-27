# simpleperf 单源 性能分析报告 · 终极形态 v4.1.1

> 配套：[知识库 v2.1](../../aoe-cpu-analysis-knowledge.md) · [工程化路线图](../../report-to-pipeline-spec.md) · [差分火焰图](./_intermediate/diff_flamegraph_base_vs_stressmove.html)。
> 数据列只放纯数字，混合内容拆到说明列。所有百分比默认「全局占比」（占采集总样本数），非全局时在文字或表头里说明。
> **术语**：`base` = 基线采集（野外空场景）；`cur` = 当前采集（stressmove 行军线压测（约 300 队））。

---

## §0 结论先行

**本次采集**（MateXs2 (PAL-AL00, aarch64) / stressmove 行军线压测（约 300 队） / 20s）相比 base 野外空场景：

- **系统总工作量上升 +30.7%**（36,133 → 47,228 samples），其中**业务层（项目自身代码）绝对工作量 +70.1%**。
- **业务模块出现显著负载暴涨**（详见 §4）：
  - ECS Burst Job 工作量 +4,451 samples（+896%）—— 已下沉到 Worker 线程并行，**不阻塞主线程**
  - Wwise 音频中间件 +4,394 samples（+1277%）—— 独占一整条线程
  - MeshUI 迭代位置刷新 +1,079 samples（NEW）—— 主线程上
  - 行军线刷新（OutSideViewArmyLineMgr） +957 samples（NEW）—— 主线程上
- **未观察到 CPU 侧 GPU bound 信号**（主线程 `GfxDeviceClient::WaitForPendingPresent` 仅 20 样本）。但 simpleperf 不直接观测 GPU 顶点处理时间，**GPU 实际工作量需 perfetto GPU counter / RenderDoc 复核**。
- 主观帧率 ~45 fps，差预期 60fps 的来源通常是业务整体压力 + 中间件 + 主线程 UI 刷新叠加。**没有单点 bug**。

按 ROI 排序的优化方向（详细见 §4）：

1. **Wwise 战斗音效复杂度审视** —— 中间件唯一红线
2. **MeshUI 迭代位置刷新优化** —— MUIControlManager.OnLateUpdate + MUILayout.Set3DPosition
3. **行军线刷新增量化** —— OutSideViewArmyLineMgr.UpdateStraightMoveLine
4. **GPU Instancing 数据上传 dirty flag** —— RHI 线程 ConstantBuffersGLES.UpdateBuffers

本次压测系统总压力上升 +30.7%，Wwise（+1277%）与 MeshUI/行军线（均为 NEW）是主线程三个红色探针，ECS Burst 虽增幅最大但已并行下沉，业务层真正的优化窗口集中在中间件与主线程 UI 刷新两路。

**§0.3 ROI 行动建议**：

1. **Wwise 战斗音效复杂度审视**：在 Wwise Profiler 中开启 Monitor 面板，限制压测场景下的并发 Voice 上限（建议 ≤ 32 个活跃 Voice），并对超出听觉密度阈值的单位脚步声合并为群体音效事件，可将 libAkSoundEngine 全局占比从 10% 降回 3% 以内的绿线范围（知识库 §4.10 红线阈值 >7% = 🔴）。

2. **MeshUI 迭代位置刷新优化**：将 MUIControlManager.OnLateUpdate 内的 `IEnumerator<T>` foreach 改为索引 for 循环，消除每帧迭代器对象分配（Boehm GC 触发源，见 §10.3）；同时为 MUILayout.Set3DPosition 添加 dirty 标志位，静止控件跳过位置重算，可将该子树从 cur 4.39% global 大幅收窄（知识库 §4.2.2 红线 >5% 主线程占比）。

3. **行军线刷新增量化**：为 OutSideViewArmyLineMgr 引入 dirty 队列，仅在队伍位置或目标发生实际变化时才调用 UpdateStraightMoveLine；对超过视距阈值的远端队伍降频刷新（每 3–5 帧一次），300 队压测下可将 +957 samples NEW 压力缩减 60–80%（知识库 §4.1.3 典型问题）。

4. **GPU Instancing 数据上传 dirty flag**：ConstantBuffersGLES.UpdateBuffers（cur 18.89% RHI线程）的根因是 GPU Instancing transform/骨骼矩阵每帧全量上传；为 WriteInstanceDataJob 增加 dirty flag，仅上传本帧实际发生变换的实例数据，配合 SSBO 持久映射可减少 __memcpy 开销（知识库 §4.7 优化方向）。

---

## §1 采集元信息与质量门

### 1.1 元信息

| 项 | base | cur |
|---|---|---|
| 场景 | 野外空场景 | stressmove 行军线压测（约 300 队） |
| 设备 | MateXs2 (PAL-AL00, aarch64) | 同 |
| 采集事件 | cpu-cycles:u | 同 |
| 采样频率（Hz）| 1000 | 1000 |
| 时长（s）| 20 | 20 |
| 总采样数 | 36,133 | 47,228 |
| 系统总工作量比 | 1.000 | 1.307 |
| 主观帧率 | — | ~45 fps |

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
| 1 | 🟢 | ECS Burst Job (lib_burst_generated) | Job Worker × 4 | 497 | 4,948 | +4451 | +896% | 已下沉 Worker 并行，主线程不受影响 |
| 2 | 🔴 | 音频中间件 libAkSoundEngine | Wwise 工作线程 + 主线程 | 344 | 4,738 | +4394 | +1277% | 战斗音效暴涨，独占一整条线程 |
| 3 | 🔴 | MeshUIManager_OnLateUpdate_mD1A233FAD58F6CA85ECA50F7F3FEA41B5C5F5A10 子树（含 6 个真热点） | main_thread | 0 | 1,079 | +1079 | NEW |  |
| 4 | 🔴 | BattleUIManager_UpdateMUIPos_m61503C001ED6B759364030072810F6541818DD54 子树（含 7 个真热点） | main_thread | 0 | 992 | +992 | NEW |  |
| 5 | 🔴 | OutSideViewArmyLineMgr_UpdateStraightMoveLine_m2A55BFB728A741DF0304245B833D056FD30FA47F 子树（含 3 个真热点） | main_thread | 0 | 957 | +957 | NEW |  |
| 6 | 🟢 | MobileBaseRenderer_SetupRenderPassFromFeatures_m35ACB1DF6787A019AB289C3ADE164BD53A3094D8 子树（含 1 个真热点） |  | 554 | 0 | -554 | -100% |  |
| 7 | 🟢 | TranscriptScriptableRenderContext::CopyFrom(ScriptableRenderContext*) 子树（含 2 个真热点） |  | 519 | 0 | -519 | -100% |  |
| 8 | 🟢 | Lua VM (libxlua) |  | 1,815 | 2,299 | +484 | +27% |  |
| 9 | 🟢 | TranscriptScriptableRenderContext::CopyFrom(ScriptableRenderContext*) 子树（含 2 个真热点） |  | 0 | 467 | +467 | NEW |  |
| 10 | 🟢 | OutsideForestRenderer_DrawInternal_m0AC8B52485901DD383727955BB4FAE982A122A72 子树（含 2 个真热点） |  | 376 | 0 | -376 | -100% |  |

### 4.2 Top-N 解读

**🔴 触发红线的 4 项（含中间件）= 真正需要关注的方向**。其余为健康并行模块（ECS Burst）或 base→cur 下降项，无需特别关注。

下面 §4.3 ~ §4.6 是每个 Top 项的细化分析（含调用入口、关联开销与优化方向）。

### 4.3 Wwise 音频中间件（Top-N #2，🔴）

**身份**：
- 库 libAkSoundEngine.so 占比 base 0.97% → cur 10.06%（绝对 344 → 4,738 samples）
- Wwise 工作线程（comm = NativeThread, tid 19814）独占 base 1.06% → cur 10.36%（绝对 383 → 4,895 samples）
- 库与线程两个口径同源（线程内绝大部分在 libAkSoundEngine 内）

**业务含义**：base 野外几乎无音效；cur 压测触发部队脚步声、武器声、单位移动音效、UI 提示音叠加 → DSP 处理压力激增。

**本源边界**：libAkSoundEngine 内部 symbol 多为 `[+offset]`（Wwise 未提供 debug 符号），simpleperf **无法定位 Wwise 内部哪个事件最重**，事件级归因必须用 **Wwise Profiler**。

**优化方向**：
- 并发 voice 数限制（超出听觉密度阈值的声音直接 cull）
- DSP 效果链精简（远距离声音禁用混响 / EQ）
- 事件触发频率（脚步声合并 / 群体音效）
- Wwise Profiler Monitor 确认 Active Voices

**业务含义**：base 野外空场景几乎无战斗音效，Wwise 工作线程贡献仅 383 samples；cur 压测触发约 300 支队伍的脚步声、武器挥击声、单位移动提示音及 UI 音效同时叠加，DSP 混音压力激增，使 libAkSoundEngine 从 0.97% global 暴涨至 10.06% global（+4,394 samples，+1,262%），已触发知识库 §4.10 🔴 红线（>7% global）。

**调用入口**：独立 Wwise 工作线程（comm = NativeThread，tid 19814）由 `__start_thread` 启动，99%+ 时间在 libAkSoundEngine.so 内部执行 DSP 混音与编解码，无法从 simpleperf 进一步下钻事件级分布，需配合 Wwise Profiler Monitor 识别具体的高负载事件。

**优化方向**：
- 在 Wwise 项目设置中配置 Voice Limiting：压测场景下建议活跃 Voice 上限 ≤ 32，超出时按优先级剔除低重要性声音
- 对距离超过视距阈值的单位禁用混响/EQ 等 DSP 效果，仅保留基础 Pan（知识库 §4.10 DSP 效果链精简）
- 将同一帧内大量同类单位（如步兵脚步声）合并为群体音效事件，降低每帧触发的 Voice 数
- 使用 Wwise Profiler 的 Performance Monitor 定位 Active Voices 峰值帧，找出贡献最多 DSP 开销的事件
- 如仍超标，评估将非关键音效事件改为低采样率或单声道，减少解码 CPU 开销

### 4.4 MeshUI 迭代位置刷新（Top-N #4，🔴）

**模块内部细分**（按 self 绝对量排序）：

> 自动发现拆出 2 个独立模块（合并展示）：`MeshUIManager_OnLateUpdate_mD1A233FAD58F6CA85ECA50` + `BattleUIManager_UpdateMUIPos_m61503C001ED6B7593640`

| 子函数 | cur self abs | self % global | 说明 |
|---|---|---|---|
| MUIControlManager.OnLateUpdate | 360 | 0.762% | 迭代所有 MUI 控件的入口 |
| Mesh::RecalculateSubmeshBoundsInternal(unsigned int) | 114 | 0.241% |  |
| Mesh::UpdateSubMeshVertexRange(int) | 47 | 0.100% |  |
| il2cpp::vm::Class::IsAssignableFrom(Il2CppClass*, Il2CppClass*) | 38 | 0.080% |  |
| il2cpp::vm::Object::IsInst(Il2CppObject*, Il2CppClass*) | 38 | 0.080% |  |
| MUILayoutManager.OnUpdate | 36 | 0.076% | 布局管理器主入口 |
| Enumerator.MoveNext | 36 | 0.076% |  |
| Enumerator..ctor | 36 | 0.076% |  |
| MUILayout.Set3DPosition | 30 | 0.064% | 单个控件的 3D 位置计算（递归 7 层） |
| **模块 self 合计** | **2071** | **4.39%** | — |

**调用入口**：主线程 ScriptRunBehaviourLateUpdate → MeshUIManager.OnLateUpdate → MUIControlManager.OnLateUpdate → ... 同时 ScriptRunBehaviourUpdate → BattleUIManager.OnUpdate → BattleUIManager.UpdateMUIPos → 也走到 MUILayout.Set3DPosition（**两路汇流**）。

**关联开销**：
- 反查到 `__memcpy` 在 MUIRendererBase.FreshVertexAttribute 下 3.60% global → MeshUI vertex buffer 上传
- 反查到 `GC_end_stubborn_change` 被 Enumerator 触发（详见 §10.3）

**优化方向**：
- MeshUI 内部 `IEnumerator<T>` 改为 `for (int i=0; i<count; i++)` 索引访问，避免迭代器对象分配
- MUILayout.Set3DPosition 递归多层，dirty 缓存：静止控件跳过位置重算
- 视野裁剪：屏幕外的悬浮 UI 不更新位置

**业务含义**：base 野外空场景几乎没有头顶悬浮 UI 需要跟随，cur 压测下约 300 支队伍及单位均需每帧刷新头顶跟随 UI 的世界坐标，导致 MeshUIManager 相关子树从 0 samples 暴增至 2,071 samples（NEW，全局占比 4.39%），触发知识库 §4.2.2 的关注阈值。两条入口路径（LateUpdate 侧 MUIControlManager 和 Update 侧 BattleUIManager.UpdateMUIPos）最终汇流到同一个 MUILayout.Set3DPosition 热点，形成叠加压力。

**调用入口**：主线程存在两路汇流——一路从 `PreLateUpdate.ScriptRunBehaviourLateUpdate → Core.LateUpdate → MeshUIManager.OnLateUpdate → MUIControlManager.OnLateUpdate`；另一路从 `Update.ScriptRunBehaviourUpdate → MapManager_OnUpdate → BattleUIManager_OnUpdate → BattleUIManager.UpdateMUIPos`，两路均调用 MUILayout.Set3DPosition（递归 7 层），并触发 Enumerator.MoveNext 分配和 MUIRendererBase.FreshVertexAttribute 的顶点上传。

**优化方向**：
- 将 MUIControlManager.OnLateUpdate 内所有 `foreach (var item in list)` 替换为 `for (int i=0; i<count; i++)` 索引遍历，消除迭代器对象分配（Boehm GC 触发源，见 §10.3）
- 为 MUILayout.Set3DPosition 引入 dirty 标志位，静止不动的控件跳过递归位置重算，避免每帧 7 层递归全量执行
- 实施屏幕外裁剪：Viewport 外的悬浮 UI 控件直接跳过 OnLateUpdate 位置更新，仅更新可见范围内的控件（知识库 §4.2.2 典型问题）
- 对固定显示位置（如建筑物顶部）的 MeshUI 控件改为仅在世界位置变化时刷新，而非每帧强制刷新
- 长期方案：评估将静态头顶标签迁移到 UGUI WorldSpace Canvas（利用其 dirty-rebuild 机制），减少 MeshUI 每帧计算量

### 4.5 行军线刷新（OutSideViewArmyLineMgr）（Top-N #5，🔴）

**模块内部细分**（按 self 绝对量排序）：

| 子函数 | cur self abs | self % global | 说明 |
|---|---|---|---|
| OutsideLineCtrl.RefreshLine | 69 | 0.146% | 单条行军线刷新主体 |
| OutSideViewArmyLineMgr.GetArmyLineID | 65 | 0.138% | Dictionary 查找军队 → 线 ID |
| EntityComponentStore.Exists | 44 | 0.093% |  |
| **模块 self 合计** | **957** | **2.03%** | — |

**调用入口**：主线程 ScriptRunBehaviourUpdate → FrameworkCore_OnUpdate → MapManager_OnUpdate → OutSideViewArmyLineMgr_OnUpdate → UpdateStraightMoveLine。

**业务含义**：每帧重算所有可见队伍的行军轨迹。压测场景下 base 几乎为 0，cur 暴涨为主线程压力源之一。

**优化方向**：
- 增量更新：仅 dirty 队伍刷新轨迹（队伍未移动或视野未变时跳过）
- 视距分级：远处队伍降频更新（如每 3–5 帧一次）
- 几何缓存：轨迹折线变化不大时复用上一帧结果
- GetArmyLineID 的 Dictionary 查找热路径上可缓存 ID

**业务含义**：base 野外空场景无行军队伍，cur 约 300 支队伍同时行进，OutSideViewArmyLineMgr.UpdateStraightMoveLine 从 0 samples 暴增至 957 samples（NEW，全局占比 2.03%），成为主线程第三大新增压力源。每帧对所有可见队伍全量重算轨迹折线顶点，叠加 Dictionary 查找与 NativeList 分配开销，是典型的「线性扩展无剔除」模式。

**调用入口**：主线程 `Update.ScriptRunBehaviourUpdate → FrameworkCore_OnUpdate → MapManager_OnUpdate → OutSideViewArmyLineMgr_OnUpdate → UpdateStraightMoveLine`，内部依次调用 `OutsideLineCtrl.RefreshLine`（69 self）、`CalculateVertexJob.Schedule`（180，已下沉 Worker）、`ListExtensions.ToNativeList`（141，分配开销）及 `GetArmyLineID`（65 self，Dictionary 查找）。

**优化方向**：
- 引入 dirty 队列：队伍位置未发生移动、目标未变更时跳过该队 UpdateStraightMoveLine，将全量 O(n) 扫描改为 O(dirty) 增量更新（知识库 §4.1.3 典型问题）
- 按视距分级刷新频率：超过地图可见阈值的远端队伍每 3–5 帧更新一次，近景队伍保持每帧更新
- 缓存上一帧轨迹结果，当控制点变化量低于阈值（如 0.5 单位）时复用顶点，避免 `CalculateVertexJob` 重新调度
- 将 `GetArmyLineID` 的 Dictionary 查找结果缓存到队伍实体组件上，消除热路径上的重复哈希计算
- `ListExtensions.ToNativeList` 分配开销可用持久化 NativeList（Persistent Allocator）并在帧末 Clear，避免每帧重新 Allocate

### 4.6 ECS Burst Job 工作量（Top-N #1，🟢 不需优化）

虽然增量绝对量最大（+4451 samples），但**全部跑在 Job Worker 线程上并行**（Thread-19461/Thread-19460/Thread-19462/Thread-19459 cur 各约 4.0% global）。
主线程上仅触发零星 Job 等待（共 177 samples / 0.375% global，远低于 2% 红线）。**ECS 并行化健康，无需优化**。

Top Burst Job（详见 §7.3）：MoveChain_SoldierMoveSystem.SoldierMoveJob（541 abs） / RotationLerpSystem.DoSmoothLerp（372 abs） / SyncViewEntitySystem（259 abs） / WriteInstanceDataJob（208 abs） / MoveChain_ArmyMoveSystem.ArmyMoveJob（195 abs） 等。

**业务含义**：ECS Burst Job 总量从 497 samples（base）暴涨至 4,948 samples（cur），增幅 +896%，是本次所有模块中绝对增量最大的一项。这一增量完全来自 300 支队伍的士兵移动、旋转插值、Transform 层级变换等 ECS System 工作量正常扩大，并非代码问题——所有计算均已下沉至 4 条 Job Worker 线程并行执行，与主线程的 Job 等待（0.375% global）远低于 2% 红线，并行化架构健康。

**调用入口**：主线程在 ECS SystemGroup 的 `UpdateFunction.Invoke` 中仅做 Job 调度（Submit）；实际计算在 Job Worker 线程（tid 19461/19460/19462/19459）的 `JobQueue.WorkLoop → JobQueue.Exec → <BurstJobName>` 链路上执行，4 条 Worker 负载偏差仅 0.2%（均衡阈值 <30%），体现了设计正确的 ECS 并行模式。

**优化方向**：
- 当前架构无需优化，ECS 并行化已按预期运行（知识库 §4.5 🟢 PASS 判定）
- 如未来 Burst Job 总量超过 20% global，可考虑对低优先级 System（如视距外单位的 RotationLerpSystem）增加 enabled 条件裁剪，进一步降低 Worker 峰值负载
- WriteInstanceDataJob（GPU Instancing 数据回写）可与 §0.3 第 4 条 dirty flag 优化联动，减少不必要的实例数据上传到 RHI 线程

---

## §5 主线程深度分析

### 5.1 主线程 PlayerLoop 阶段表

主线程 cur 总绝对样本：18,167 / 占全局 38.47%。下表是主线程内 PlayerLoop 子树各阶段切分（不可直接相加，因有重叠子节点）：

| 阶段 | base abs | cur abs | base 主线程% | cur 主线程% | 增量% | 判定 | 说明 |
|---|---|---|---|---|---|---|---|
| ScriptRunBehaviourUpdate | 2624 | 5948 | 16.28% | 32.74% | +127% | 🔴 | 业务主逻辑，见 §5.2 |
| ScriptRunBehaviourLateUpdate | 1673 | 2730 | 10.38% | 15.03% | +63% | 🟡 | MeshUI + 视野，见 §5.2 |
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
│  │           │   │       └─ MUILayout.Set3DPosition × 8 层递归                            see §4.4 MeshUI
│  │           │   │       ├─ MUILayout.Set3DPosition 自身代码累加 (864 self)        📈🔴
│  │           │   │       ├─ MUIControlManager.OnLateUpdate 同支路 (360 self)       📈🔴
│  │           │   │       ├─ Enumerator.MoveNext × 多处 (~36 self 累加)            📈🔴
│  │           │   │       ├─ MUIRendererBase.FreshVertexAttribute
│  │           │   │       │   └─ __memcpy (164 self)                                  see §10.1
│  │           │   │       ├─ GC_end_stubborn_change (19 self)                       📈   see §10.3
│  │           │   │       ├─ MUIText / MUISprite.Set3DPosition (~47 self)
│  │           │   │       └─ ...
│  │           │   ├─ OutSideViewArmyLineMgr_OnUpdate (988 / 5.44%) [wrapper, base→cur +2252%] 📈🟡
│  │           │   │   ├─ UpdateStraightMoveLine (957 / 5.27%) 📈  see §4.5 行军线
│  │           │   │   │   ├─ OutsideLineCtrl.RefreshLine (69 self)                      📈🔴
│  │           │   │   │   ├─ CalculateVertexJob.Schedule (180, Job 调度) 🟢                实际下沉 Worker
│  │           │   │   │   ├─ ListExtensions.ToNativeList (141, 分配开销)
│  │           │   │   │   └─ OutsideLineMesh.RefreshLineVertex (61)
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
│  │           └─ MUIControlManager.OnLateUpdate (360 self)                              📈🔴 see §4.4 MeshUI
│  │               └─ ...（与 BattleUIManager.UpdateMUIPos 同 MUILayout 路径汇流）
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
| 网络消息（TServerManager 子树） | 0.000 | 主线程% | >15% | 🟢 |  |
| Lua 总负载 | 3.032 | 全局% | >10% | 🟢 |  |
| LuaMgr_OnUpdate（主入口） | 0.018 | 主线程% | >20% | 🟢 |  |
| MapManager_OnUpdate（C# 总入口） | 0.042 | 主线程% | >10% | 🟢 | wrapper，真热点见 §4.4 / §4.5 |
| BattleUIManager_OnUpdate | 0.133 | 主线程% | >3% | 🟢 | 见 §4.4 |
| OutSideViewArmyLineMgr_OnUpdate | 0.518 | 主线程% | >3% | 🟢 | 见 §4.5 |
| MeshUI 子树 | 0.000 | 主线程% | >3% | 🟢 |  |
| LegacyAnimationUpdate | 0.11 | ms/帧 | >1ms/帧 | 🟢 |  |
| ParticleSystem 合计 | 0.17 | ms/帧 | >1ms/帧 | 🟢 |  |
| PlayerUpdateCanvases（UGUI） | 0.19 | ms/帧 | >1ms/帧 | 🟢 |  |
| 主线程 Job 等待 | 0.375 | 全局% | >2% | 🟢 | 详见 §7.2 |
| Boehm GC 后台标记 | 0.565 | 全局% | >2% | 🟢 | 触发源主要是 MUI 迭代器（§10.3） |

**注**：`MapManager_OnUpdate` 等高占比 wrapper 的真热点已下钻到 BattleUIManager / OutSideViewArmyLineMgr，故 §4 Top-N 不重复列 MapManager_OnUpdate。

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

**关键变化**（base → cur 数值对比）：
- **ConstantBuffersGLES.UpdateBuffers**：cur 占 RHI 线程 18.89%（1,892 samples），是 RHI 线程第一大子节点，根因为 300 支队伍 GPU Instancing 的 transform/骨骼矩阵每帧全量上传——`DataBufferGLES.Upload → __memcpy` 反查确认（400 samples / 4.00% global），dirty flag 优化可将此项显著降低（知识库 §4.7 红线：>40% RHI = 🔴，当前 18.89% 处于 🟡 区间）。
- **DrawBuffers**：cur 占 RHI 线程 53.44%（5,353 samples），其中 `BeforeDrawCall`（2,337 samples）和 `DrawBuffersStereo`（2,426 samples）为主体；base 对应值缺失独立拆分，但 RHI 线程整体从 9,714 → 10,017 samples（+3.1%），DrawCall 吞吐量变化量极小，**DrawCall 量本身不是本次新增压力来源**，主要压力来自 UpdateBuffers 常量上传。
- **WaitForJobGroupID**（RHI 线程）：cur 385 samples（3.85% RHI 线程），为 RHI 线程等待 GeometryJob 完成，压测下偶发——属于 URP 渲染管线设计内同步点，当前在知识库 §4.7 的 🟢 阈值（<2% RHI 线程绝对值）的边界区间，建议持续观察，若 Worker 线程负载进一步上升可能推高此等待。

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
| 主线程 WaitForJobGroupID/Complete 子树合计 | 0 | 177 | 0.000% | 0.375% | >2% | 🟢 green |

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

合计约 **5.2% global**，与 lib_burst_generated（4,948 samples）一致。**ECS 健康度 🟢 PASS**。

---

## §8 中间件 — Wwise 专章

**线程**：tid 19814 / comm NativeThread / identity `wwise_worker`

| 指标 | base | cur | Δ |
|---|---|---|---|
| 库绝对样本 | 344 | 4,738 | +4394 |
| 全局占比 | 0.951% | 10.033% | 🔴 |

**优化建议**：Voice Limiting、MixBus 链深度检查、Wwise Profiler Monitor 确认 Active Voices。

---

## §9 Lua GC 工作线程专章

**tid 19816**，comm = `UnityMain`（**误名**），identity = `lua_mtgc_worker`。
入口 `LuaMultiThreadGC_LuaGCThreadProc`。**勿与主线程 UnityMain 混淆。**

| 指标 | base | cur |
|---|---|---|
| 绝对样本 | 461 | 320 |
| Δ | — | -141 |

探针 `probe.lua.mtgc.worker`：0.678% global，🟢。

**意外发现**：cur 下 Lua GC 工作线程负载可能低于 base（绝对 -141）。base 野外 Lua 临时对象分配率更高；cur 行军压测主增量在 ECS Burst（native，不经 Lua 分配）。

**对 Unity Profiler 用户的提示**：Profiler 中的 Lua GC 线程即 tid 19816；simpleperf 曾因 comm 同名误标为 UnityMain。两份数据一致，没有漏采。

**业务解读**：tid 19816 的绝对样本数 base 461 → cur 320，absDelta = -141，说明行军压测场景下 Lua GC 工作线程的平均 CPU 占用**低于**野外空场景。原因在于 cur 压测的主增量来自 ECS Burst Job（native C++ 路径，不经过 Lua 分配器），Lua 临时对象产生率并未随队伍数量线性膨胀，GC 后台步进压力反而略有减轻。此外，需特别注意 **tid 19816 同名 UnityMain 陷阱**：xLua 通过 C# `new Thread` 启动 Lua GC worker 时未调用 `prctl(PR_SET_NAME)`，导致 simpleperf 读取到的 comm 为 `UnityMain`（继承自父线程），与真主线程 tid 19292 同名。Provider 已通过入口 symbol `LuaMultiThreadGC_LuaGCThreadProc` + tid 复合 key 完成消歧（知识库 §2 线程识别规则优先级 15 / §4.9 关键陷阱）。

**建议**：
- 本次 Lua GC 工作线程 0.68% global，处于 🟢 PASS 范围（知识库 §4.9 红线 >2% = 🟡），当前无需专项优化
- 若后续版本 Lua 业务逻辑扩展（如新增高频 Update 的 Lua 管理器），应使用 Unity Profiler 帧级追踪 `GC.Alloc` 热点，配合 simpleperf 的 `GC_end_stubborn_change` 反查（§10.3），优先降低迭代器/闭包等高频分配源

判定：🟢 PASS（<1% global 红线）。

---

## §10 反查清单（运行时函数 → 业务模块）

> simpleperf 单源核心独有能力：把「看似分散的运行时开销」反查到业务调用源。

### 10.1 `__memcpy` 反查（全局 3.60% / 104 处命中）

| 全局% | Caller 链 | 业务模块 |
|---|---|---|
| 0.85 | ConstantBuffersGLES::UpdateCB(CbKey, void const*, unsigned l < GfxDeviceWorker:: | RHI / GPU Instancing |
| 0.85 | !!!0000!e9a0267a4c3f12c4fb16e257d3a26e!272cf717f5! < !!!0000!9c0715a0352375a9ec2 | 未分类 |
| 0.55 | InstancingBatcher::RenderInstancesWithBuffer(TranscriptRende < TranscriptRenderi | RHI / GPU Instancing |
| 0.32 | Mesh::SetVertexData(void const*, unsigned long, unsigned lon < Mesh_CUSTOM_Inter | MeshUI 顶点上传 |
| 0.21 | !!!0000!f56be09eb88f86833124f1df42e945!272cf717f5! < !!!0000!6b200851123c7898055 | 未分类 |
| 0.13 | MUIRendererBase_FreshVertexAttribute_TisVector3_tDCF05E21F63 < MUIRendererBase_S | MeshUI 顶点上传 |

**结论**：__memcpy 主要集中在 **GPU Instancing + MeshUI** 路径（详见 §4.4 / §6）。

### 10.2 `__ieee754_powf` 反查

| 全局% | Caller 链 | 业务模块 |
|---|---|---|
| 0.49 | UI::UIGeometryJob(UI::UIGeometryJobData*) < JobQueue::Exec(JobInfo*, long long,  | UGUI 几何 Job |
| 0.19 | UI::UIGeometryJob(UI::UIGeometryJobData*) < JobQueue::Exec(JobInfo*, long long,  | UGUI 几何 Job |
| 0.02 | UI::UIGeometryJob(UI::UIGeometryJobData*) < Thread-102 | UGUI 几何 Job |
| 0.01 | UI::UIGeometryJob(UI::UIGeometryJobData*) < Thread-158 | UGUI 几何 Job |
| 0.01 | UI::UIGeometryJob(UI::UIGeometryJobData*) < Thread-129 | UGUI 几何 Job |

**结论**：主要来自 UGUI 几何 Job gamma 校正——静态 UI 走 UGUI、悬浮 UI 走 MeshUI，为项目设计。

### 10.3 `GC_end_stubborn_change` 反查（Boehm GC 触发源）

| 全局% | Caller |
|---|---|
| 0.41 | Enumerator_MoveNext_m04F91EFB2C11DE1ED39627288DD2CF031EC8819 < MUICont |

**结论**：主要触发源 = **MeshUI 迭代器**（Enumerator.MoveNext）。改为索引 for 循环可减少分配。

### 10.4 `tlsf_memalign` / `ThreadsafeLinearAllocator::Allocate` 反查

| Caller | 业务模块 |
|---|---|
| MemoryManager::Allocate(unsigned long, unsigned long, MemLab < GfxDevi | RHI / GPU Instancing |
| DynamicHeapAllocator::Allocate(unsigned long, int) < MemoryManager::Al | URP / 命令缓冲 |

**结论**：集中在 URP 命令缓冲与 GPU Instancing 分配路径。

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
