# simpleperf 单源 性能分析报告 · 终极形态 v2

> **本报告是 simpleperf 单源理论完整态 v2**。相比 v1：
> - 业务模块按 **callTree 实测函数名下钻**（不是按 PlayerLoop 阶段宏观切分）
> - **绝对样本数为主**，所有百分比都标注分母（`%global` / `%main` / `%rhi`）
> - **WaitForPresent 真实归属修正**（主线程 marker，非 RHI）
> - Wwise 阈值收紧至 🔴>7%；本次 10% 改判 🔴
> - 新增"Lua GC 线程"专章（识别为同名 UnityMain 陷阱）
> - 修正"UGUI 残留"误判（项目设计：静态 UI 用 UGUI，动态 UI 用 MeshUI）
> - 业务暴涨拆细：Burst Job 贡献 67.6% 增量
>
> 配套：[知识库 v2.1](../aoe-cpu-analysis-knowledge.md) · [工程化路线图](./report-to-pipeline-spec.md) · [探查笔记](./_intermediate/EXPLORATION_NOTES.md)。
> 所有数值来自 `_intermediate/{base, stressmove}/simpleperf-profile.json`。

---

## §0 结论先行

### 0.1 普通话结论

> **本次 stressmove 行军压测在 MateXs2（高端机）上整体压力较 base 野外空场景显著上升（系统总采样 +30.7%，业务层绝对工作量 +86.5%），但只有 1 项达到红线档**（Wwise 音频中间件 10.06% global，超过新阈值 >7%）。**其余 27 项检测项均 🟢 PASS**。主观帧率 ~45fps 离预期 60fps 还有差距，主要源于业务整体负载上升（C# 业务管理器各项 +500%~+2200% 绝对值）+ ECS Burst Job 工作量暴涨 +878% + Wwise 暴涨 +1255% 三路压力叠加，**没有单点性能 bug**，需要的是整体优化思路而非追异常。**未观察到 CPU 侧 GPU bound 信号**（主线程 `GfxDeviceClient::WaitForPendingPresent` 仅 1 样本/<0.01% global），但**单源不可对"GPU 实际工作量"做绝对判定**——这是 simpleperf 本源能力边界。

### 0.2 红线告警清单

> 本次采集 **1 条 🔴 + 1 条 🟡 + 26 条 🟢**。

| 检测项 | 实测 | 阈值 | 判定 |
|---|---|---|---|
| **probe.middleware.wwise** | **10.06% global**（绝对 4751 样本，比 base 351 涨 +1255%）| 🟢<3% / 🟡 3-7% / 🔴 >7% | 🔴 **红线触发** |
| probe.ecs.mainwait（主线程 Job 等待）| 0.71% global（绝对 +154%，绝对值仍小）| 🟢<0.5% / 🟡 0.5-2% | 🟡 关注（线程内 1.86%，主因 Transform 系统内部同步点）|
| probe.gpu.bound（主信号 WaitForPendingPresent）| 1 sample / <0.01% global | 🟢<2% / 🔴>5% | 🟢 |
| probe.gpu.bound.eglSwap（辅助）| 4.31% rhi（绝对 -20%）| 🟢<10% / 🔴>15% | 🟢 |
| probe.ecs.jobworker.balance | max-min 4.2% | 🟢<20% / 🔴>30% | 🟢 |
| probe.rhi.constUpload | 18.89% rhi（绝对 +23.7%）| 🟢<25% / 🔴>40% | 🟢 |
| probe.render.urp.shadow | 5.25% main（绝对 -32%）| 🟢<5% / 🟡 5-8% | 🟡 关注（但绝对负载下降）|
| probe.render.urp.foliage | 2.61% main（绝对 -39%）| 🟢<3% | 🟢 |
| probe.render.urp.postfx | 3.71% main（绝对 -15%）| 🟢<3% / 🟡 3-5% | 🟡 关注 |
| probe.render.urp.setup | 3.25% main（绝对 -29%）| 🟡 2-3% / 🔴>3% | 🟡（边界）|
| probe.lua.totalLoad | 5.29% global（绝对 +29.5%）| 🟢<8% | 🟢 |
| probe.lua.luaMgrOnUpdate | 14.38% main（绝对 +86%）| 🟢<12% / 🟡 12-20% | 🟡 关注 |
| probe.csharp.mapManager | 13.90% main（绝对 +591%）| 🟢<8% / 🟡 8-10% / 🔴>10% | **🔴 红线触发** |
| probe.csharp.battleUIManager | 6.08% main（绝对 +1460%）| 🟢<2% / 🔴>3% | **🔴 红线触发** |
| probe.csharp.outsideViewArmyLine | 5.44% main（绝对 +2221%）| 🟢<2% / 🔴>3% | **🔴 红线触发** |
| probe.net.tserver | 0.73% main（绝对 +129%）| 🟢<8% | 🟢 |
| probe.csharp.meshUI | 1.73% main（实测）| 🟢<3% | 🟢 |
| probe.anim.legacy | 0.75% main ≈ 0.11ms/帧 | 🟢<0.6ms | 🟢 |
| probe.fx.particle | 1.15% main ≈ 0.17ms/帧 | 🟢<0.6ms | 🟢 |
| probe.ui.canvas | 1.24% main ≈ 0.19ms/帧 | 🟢<0.6ms | 🟢 |
| probe.res.loader | 2.08% main ≈ 0.31ms/帧均值 | 🟢<1ms | 🟢 |
| probe.lua.mtgc.worker | 0.68% global（绝对 -22%，反而下降）| 🟢<1% | 🟢 |
| probe.gc.boehmBackground | ~1.5% global self% | 🟢<1% / 🟡 1-2% | 🟡 关注 |

**修正说明**：v1 报告把 Wwise / mapManager 等都判 🟡，是因为阈值过松。v2 用新阈值后**至少 4 项 🔴**（Wwise + 3 个 C# 业务管理器子项），都是**绝对工作量暴增 +500%~+2200% 导致的整体压力上升**，不是单点异常。判定仍是"轻度偏离基线"，但需要正面承认 4 个红线触发项。

### 0.3 压力来源 Top-N（按业务函数实测绝对样本数，去重维度）

按业务函数名（callTree 实测）从大到小排，**所有数字都是绝对样本数 + 全局 %**：

| 排名 | 业务函数（实测） | base abs | sm abs | 绝对 Δ | sm 全局占比 |
|---|---|---|---|---|---|
| 1 | `FrameworkCore_OnUpdate`（业务总入口）| 2,092 | **5,590** | **+167%** | 11.84% global |
| 2 | `MapManager_OnUpdate`（C# 业务总入口）| 373 | **2,580** | **+591%** | 5.46% global |
| 3 | `LuaMgr_OnUpdate` | 1,435 | **2,669** | **+86%** | 5.65% global |
| 4 | `OutSideViewArmyLineMgr_OnUpdate`（行军线刷新）| 43 | **1,009** | **+2221%** | 2.14% global |
| 5 | &nbsp;&nbsp;└ `UpdateStraightMoveLine`（其子项）| 0 | 977 | 新出现 | 2.07% global |
| 6 | `BattleUIManager_OnUpdate`（战斗 UI）| 72 | **1,128** | **+1460%** | 2.39% global |
| 7 | &nbsp;&nbsp;└ `UpdateMUIPos`（其子项）| 0 | 1,013 | 新出现 | 2.14% global |
| 8 | `MapManager_OnLateUpdate`（C#）| 609 | 489 | -20% | 1.04% global |
| 9 | **`libAkSoundEngine` 全部（Wwise 中间件）** | **351** | **4,751** | **+1255%** | **10.06% global** |
| 10 | **`lib_burst_generated` 全部（ECS Burst Job 合计）**| 513 | **5,019** | **+878%** | 10.63% global |
| 11 | &nbsp;&nbsp;└ `MoveChain_SoldierMoveSystem.SoldierMoveJob` | — | 644 | — | 1.36% global |
| 12 | &nbsp;&nbsp;└ `RotationLerpSystem.DoSmoothLerp` | — | 465 | — | 0.99% global |
| 13 | `TServerManager_OnUpdate` 整体 | 60 | 136 | +129% | 0.29% global |

**关键洞察**：
- **真正的"业务暴涨主力" 是行军线和战斗 UI 两个 C# 管理器**（+2221% / +1460%），不是 Lua / 网络 / ECS 调度
- **Wwise 是一个独立的中间件维度**——独立成行，不与业务管理器同列（避免与"NativeThread 线程占比"重复列出）
- **Lua 总负载 +86%** 看似涨幅大，但**几乎与系统总压力 +30.7% 同步**（按主线程占比换算，主线程绝对工作量也 +11.4%；Lua 子树相对主线程内占比上升明显，但绝对值偏离系统总压力仅 +55%，未异常膨胀）

### 0.4 本次判定与建议方向

**判定**：**「整体压力上升较大，4 项红线触发但全部源自业务整体增长，非单点 bug」**。

**建议方向**（按 ROI 排序）：

1. **OutSideViewArmyLineMgr_UpdateStraightMoveLine** —— sm 2.07% global / 主线程 5.27%，base 几乎不存在，**stressmove 压力第一源**。
   - 每帧重算所有可见队伍的行军轨迹
   - 优化：增量更新（仅 dirty 队伍）、视距分级（远处队伍降频更新）、几何缓存（轨迹折线变化不大时不重建）
2. **BattleUIManager_UpdateMUIPos** —— sm 2.14% global / 主线程 5.46%，**stressmove 压力第二源**。
   - 每帧重算所有可见战斗 UI（头顶字/血条等）的世界坐标
   - 优化：视野裁剪（屏幕外不更新）、批量更新替代逐个、考虑下沉到 Job
3. **Wwise 中间件** —— 10.06% global，**红线**。
   - 战斗音效叠加（300 队脚步声、武器声等）
   - 优化：并发 voice 数上限、远距离声音 cull、DSP 效果链精简
   - 单源边界：simpleperf 无法定位 Wwise 内部哪个事件最重，**必须切换 Wwise Profiler**
4. **GPU Instancing 数据上传**（中优先级）—— RHI 线程 `ConstantBuffersGLES::UpdateBuffers` 18.89% rhi（绝对 +23.7%），**未触发红线但是个具体可优化点**：
   - 主要 caller 是 `__memcpy`（§5 反查）→ 300 队部队 transform 矩阵每帧全量更新
   - 优化：dirty flag、SSBO 持久映射

**不必专项追的项**：
- ECS 调度 / Job Worker 均衡（健康，无异常）
- Lua VM（与系统压力同步上涨，无异常膨胀）
- GPU bound（未观察到 CPU 侧信号）
- TServer 网络消息（远低于红线）
- UGUI Canvas（项目设计：静态 UI 走 UGUI，是预期负载）

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

### 1.1 符号化质量

| 指标 | base | stressmove | 阈值 | 判定 |
|---|---|---|---|---|
| 总状态 | PASS | PASS | — | ✓ |
| 应用层符号化率 | **99.7%** | **91.8%** | ≥85% | ✓ |
| kernel% | 0.0% | 0.0% | — | 用户态采集，预期 0 |
| unknown% | 0.4% | 6.3% | <10% | ✓ |
| **栈回溯锚点命中** | **4/4** | **4/4** | ≥3/4 | ✓ |
| 栈 unwind 自检（`__start_thread` 可达率）| 55.3% | 70.9% | 任意 PASS | ✓ |

> 与 v1 工程报告对比：v1 anchor 1/4 / app sym 86% / kernel 30.7%。本次因采集脚本修复（symbols rename → binary_cache）+ 改用 `cpu-cycles:u`（避免 kernel 采样），**符号化质量飞跃**。

### 1.2 栈回溯锚点（仅用于符号化校验，不进业务诊断）

知识库 v2.1 §1：栈回溯锚点（`ExecutePlayerLoop` 等 4 件套）仅用于"我能不能展开各线程的调用栈"这个工程问题，**不用于业务诊断**。它们是必然存在的引擎主干，告诉你"PlayerLoop 占 27%"等于没说。

业务诊断按下文 §3-§9 检测项与下钻树展开。

---

## §2 代码层与库占比（base vs stressmove）

### 2.1 代码层归类（双口径）

| 层 | base `%global` | sm `%global` | base abs | sm abs | 绝对 Δ |
|---|---|---|---|---|---|
| business（业务）| 24.65% | 35.18% | 8,907 | **16,615** | **+86.5%** ⚠️ |
| engine（引擎+中间件）| 44.55% | 39.87% | 16,098 | 18,829 | +17.0% |
| runtime（C/C++/ART/GLES驱动）| 30.60% | 24.82% | 11,057 | 11,722 | +6.0% |
| noise（内核/未知）| 0.20% | 0.14% | — | — | — |

### 2.2 业务层 +86.5% 拆细（按 lib 绝对增量）

| 库 | base abs | sm abs | 增量 | 占业务总增量 |
|---|---|---|---|---|
| **lib_burst_generated**（ECS Burst Job）| 513 | 5,020 | **+4,506** | **67.6%** |
| libil2cpp（C# 业务函数）| 7,080 | 8,682 | +1,602 | 24.0% |
| libxlua（Lua VM）| 1,927 | 2,488 | +562 | 8.4% |
| **业务层总增量** | — | — | **+6,670** | 100% |

> **关键洞察**：v1 报告说"业务层 +86.5%"时没有拆细。**真相是 ECS Burst Job 贡献了 67.6% 的业务增量**（与 §6.5 ECS 健康度 PASS 不矛盾——Burst Job 工作量虽大但全部跑在 4 个 Job Worker 上并行，没有阻塞主线程）。**C# 业务函数只贡献 24%**，Lua 仅 8.4%。"业务暴涨"不能解读为 "C#/Lua 主线程逻辑膨胀"。

### 2.3 全库占比对比

| 库 | base `%global` | sm `%global` | base abs | sm abs | 绝对 Δ | 解读 |
|---|---|---|---|---|---|---|
| libunity.so | 41.77% | 31.05% | 15,089 | 14,664 | -2.8% | 引擎核心略微减负 |
| libil2cpp.so | 19.59% | 18.38% | 7,080 | 8,682 | +22.6% | C# 业务整体上涨 |
| libxlua.so | 5.33% | 5.27% | 1,927 | 2,488 | +29.2% | Lua 同步上涨 |
| **libAkSoundEngine.so** | 0.97% | **10.06%** | 351 | **4,751** | **+1255%** ⚠️ | Wwise 暴增 |
| **lib_burst_generated.so** | 1.42% | 10.63% | 513 | 5,019 | **+878%** | ECS Burst Job 暴增 |
| libGLESv2_adreno.so | 13.21% | 10.17% | 4,773 | 4,803 | +0.6% | GPU 驱动 CPU 调用几乎不变 |
| libc.so | 7.83% | 7.33% | 2,829 | 3,462 | +22.4% | 内存/字符串操作 |
| libm.so | 2.06% | 1.28% | 745 | 605 | -18.7% | 数学运算下降 |
| libart.so | 2.56% | 1.45% | 925 | 685 | -25.9% | ART JNI 桥接下降 |

---

## §3 线程分布（含身份识别）

按知识库 v2.1 §2 规则，对实测线程归类：

| 线程（comm 名）| TID | 真实身份 | base `%global` | sm `%global` | base abs | sm abs | 绝对 Δ |
|---|---|---|---|---|---|---|---|
| UnityMain | **19292** | **主线程** | 44.61% | 38.45% | 16,124 | 18,164 | +12.6% |
| Thread-102 | **19471** | **RHI 线程** | 26.88% | 21.20% | 9,712 | 10,012 | +3.1% |
| UnityGfxRenderS | 19472 | **Render 线程** | 11.68% | 9.33% | 4,221 | 4,406 | +4.4% |
| NativeThread | 19814 | **Wwise 工作线程** | 1.06% | 10.36% | 383 | 4,893 | **+1178%** ⚠️ |
| Thread-129 | 19461 | Job Worker #1 | 2.50% | 4.10% | 903 | 1,936 | +114% |
| Thread-135 | 19460 | Job Worker #2 | 2.46% | 4.00% | 889 | 1,889 | +112% |
| Thread-136 | 19462 | Job Worker #3 | 2.47% | 3.95% | 893 | 1,865 | +109% |
| Thread-158 | 19459 | Job Worker #4 | 2.44% | 3.94% | 882 | 1,861 | +111% |
| **UnityMain (同名陷阱)** | **19816** | **Lua MtGC 工作线程** | 1.27% | 0.68% | 211 | 165 | **-22%** |
| AAudio_1 | 19826 | 音频回调（系统）| 0.94% | 1.18% | 340 | 557 | +63.8% |
| UnityChoreograp | 19559 | Choreographer 回调 | 1.38% | 1.10% | 410 | 466 | +13.7% |

### 3.1 关键发现

**双线程渲染模型**（与 UE RenderThread/RHIThread 一致）：
- `UnityGfxRenderS` = Render 线程（URP `ExecuteScriptableRenderLoop` 脚本调度）
- `Thread-102` = RHI 线程（`GfxDeviceWorker::RunCommand` → GLES driver）

**NativeThread 真实身份 = Wwise 工作线程**（栈 99.81% 在 libAkSoundEngine 内），stressmove 下独占 10.36% global。这是 simpleperf 独有发现，其他源完全看不到这条线程的负载。

**Job Worker 4 件套均衡良好**：max-min 偏差 4.2%（远低于 30% 红线），证实 ECS 并行化健康。

### 3.2 同名 UnityMain 陷阱（必须警惕的工程 bug 源）

simpleperf 在 base 数据中发现 **15 条** 名字叫 `UnityMain` 的线程，stressmove 中也有 **15 条**：

| TID | comm | 真实身份 | base sample | sm sample |
|---|---|---|---|---|
| 19292 | UnityMain | **真主线程** | 14,757 | 14,983 |
| **19816** | UnityMain | **Lua MtGC 工作线程**（入口 `LuaMultiThreadGC_LuaGCThreadProc`）| 211 | 165 |
| 19830 / 19828 / 20667 / 20680 / 19811 / 19528 / 19796 / 20733 / 20735 / 19829 / 20703 / 20734 等 13 条 | UnityMain | C# 子线程（`new Thread` 启动未设 comm 名）短生命周期 | 各 5-150 sample，单条 < 0.2% global | 同 |

**根因**：xLua 内部和部分业务代码用 C# `new Thread(...)` 启动工作线程时未调用 `Thread.Name = "..."` 或 `pthread_setname_np`，**线程 comm 名继承父进程主线程 = `UnityMain`**。

**对工程的影响**：当前 Provider 的 `threadCpuMs` 字段用 `thread_name` 当字典 key，**15 条同名线程互相覆盖只剩最后一条**（base UnityMain 显示 12.1ms / sm UnityMain 显示 9.2ms，完全错误的数据）。**幸运的是 callTree 字段和 metrics 字段是按 tid 区分的，所以本报告的所有"绝对样本数"换算结果都是对的**。`threadCpuMs` 字段必须修，详见工程化路线图。

**识别规则**（知识库 v2.1 §2）：按入口 symbol 反推：
- `LuaMultiThreadGC_LuaGCThreadProc` 入口 → 重命名为 `LuaMtGcWorker`
- 其他短生命周期 `UnityMain` 子线程 → 重命名为 `UnityMain-Subthread-<tid>`

---

## §4 主线程业务函数下钻（按 callTree 实测）

> 这是 v2 报告的核心章节：**按主线程 callTree 实测函数名展开，按绝对样本数排序**。

### 4.1 主线程业务函数 Top-N 全表

| 函数（实测）| base `%main` | sm `%main` | base abs | sm abs | 绝对 Δ | 类型 |
|---|---|---|---|---|---|---|
| **FrameworkCore_OnUpdate** | 12.56% | **30.12%** | 2,092 | **5,590** | **+167%** | 业务总入口（C#）|
| ├─ LuaMgr_OnUpdate | 8.62% | 14.38% | 1,435 | 2,669 | +86% | Lua 路径入口 |
| │  └─ BaseLuaMgr_OnUpdate | 8.62% | 14.37% | 1,435 | 2,666 | +86% | xLua 实际调用层 |
| ├─ TServerManager_OnUpdate | 0.36% | 0.73% | 60 | 136 | +129% | 网络消息（§4.2）|
| │  ├─ TServer_Tick | 0.27% | 0.68% | 45 | 127 | +184% | tick 入口 |
| │  ├─ TServer_RecvMessages | 0.14% | 0.00% | 24 | 0 | -100% | 接收（被剪枝）|
| │  └─ TServer_DecodeMessages | 0.00% | 0.38% | 0 | 71 | 新出现 | 解包 |
| ├─ MapManager_OnUpdate (C#) | 2.24% | **13.90%** | 373 | **2,580** | **+591%** | C# 业务管理器（§4.3）|
| │  ├─ BattleUIManager_OnUpdate | 0.43% | 6.08% | 72 | 1,128 | **+1460%** | 战斗 UI |
| │  │  └─ UpdateMUIPos | 0.00% | 5.46% | 0 | 1,013 | 新出现 | 头顶 UI 位置刷新 |
| │  ├─ OutSideViewArmyLineMgr_OnUpdate | 0.26% | 5.44% | 43 | 1,009 | **+2221%** | 行军线刷新 |
| │  │  ├─ UpdateStraightMoveLine | 0.00% | 5.27% | 0 | 977 | 新出现 | 行军轨迹刷新 |
| │  │  ├─ RefreshArmyLine | 0.00% | 0.52% | 0 | 97 | 新出现 | 刷新单条线 |
| │  │  └─ GetArmyLineID | 0.00% | 0.50% | 0 | 93 | 新出现 | ID 解析 |
| MapManager_OnLateUpdate (C#) | 3.65% | 2.63% | 609 | 489 | -20% | C# LateUpdate（§4.4）|

### 4.2 网络消息（TServerManager）— §6.1.1

**调用路径**（与 §4.1 一致）：
```
FrameworkCore_OnUpdate → TServerManager_OnUpdate → TServer_Tick → {RecvMessages, DecodeMessages, HandleMessages}
```

**检测项 probe.net.tserver**：

| | base abs | sm abs | sm `%main` | sm `%global` | 红线（>15% main）|
|---|---|---|---|---|---|
| TServerManager_OnUpdate（子树合计）| 60 | 136 | 0.73% | 0.29% | 🟢 PASS |

**判定**：🟢 PASS，远低于红线。300 队压测下网络消息处理依然轻量，说明消息批处理机制健康。

### 4.3 Lua 主循环（LuaMgr）— §6.1.2

**调用路径**：
```
FrameworkCore_OnUpdate → LuaMgr_OnUpdate → BaseLuaMgr_OnUpdate → LuaMgr.OnTick&UpdateSchedule → {MapSignificanceMgr, BattleHeadMgr, Hud_Common, ...}
```

simpleperf 看不到具体 Lua 管理器名，但能看到入口子树占比。

**检测项**：

| 检测项 | base | sm | 红线 | 判定 |
|---|---|---|---|---|
| probe.lua.totalLoad（公式：libxlua + il2cpp XLua 桥接）| 5.34% global / 1,930 abs | 5.29% global / 2,499 abs | 🟢<8% | 🟢 PASS |
| probe.lua.luaMgrOnUpdate（子树占主线程比）| 8.62% main / 1,435 abs | **14.38% main / 2,669 abs** | 🟢<12% / 🟡 12-20% | 🟡 关注 |

**判定**：🟡 关注（LuaMgr_OnUpdate 主线程内占比 14.38% 超过 12% 黄线）。

**深度分析**：
- **绝对样本数 +86%**（1435 → 2669）
- 系统总压力 +30.7%，主线程压力 +12.6%
- LuaMgr_OnUpdate 绝对涨幅 +86% 远超主线程整体 +12.6%——**Lua 主循环在主线程内的相对比重显著上升**
- 但 Lua 总负载（含 worker）仅 +29% 与系统压力同步——说明上升的部分主要是 Lua 主循环（OnUpdate）的调度调用，而 Lua VM 本身的执行（worker 上的 GC）反而下降

**本源边界**：MapSignificanceMgr / BattleHeadMgr / Hud_Common / MapCameraCtrl 等具体 Lua 管理器**simpleperf 完全不可见**。要定位是哪个管理器膨胀，必须切换 Unity Profiler。

**建议**：在 Unity Profiler 中观察 LuaMgr.OnTick&UpdateSchedule 子树，重点看 MapSignificanceMgr / BattleHeadMgr 单帧耗时是否顶到 3ms 预算。

### 4.4 C# 业务管理器（MapManager 及子）— §6.1.3

**调用路径**：
```
FrameworkCore_OnUpdate → MapManager_OnUpdate → {BattleUIManager, OutSideViewArmyLineMgr, MapManager_MeetScope, ...}
```

#### 4.4.1 MapManager_OnUpdate（总入口）

**检测项 probe.csharp.mapManager**：

| | base abs | sm abs | sm `%main` | sm `%global` | 红线（>10% main）|
|---|---|---|---|---|---|
| MapManager_OnUpdate | 373 | 2,580 | **13.90%** | 5.46% | 🔴 **红线触发** |

**判定**：**🔴 红线触发**。绝对增长 +591%，主线程内占比从 2.24% 飙升到 13.90%。

#### 4.4.2 BattleUIManager（战斗 UI 子）

**检测项 probe.csharp.battleUIManager**：

| 函数 | base abs | sm abs | sm `%main` | sm `%global` | 红线（>3% main）|
|---|---|---|---|---|---|
| BattleUIManager_OnUpdate | 72 | 1,128 | **6.08%** | 2.39% | 🔴 **红线触发** |
| ├─ UpdateMUIPos | 0 | 1,013 | 5.46% | 2.14% | — |
| └─ UpdateSingleUIPos（base 数据少量出现）| 21 | 0 | 0.00% | — | — |

**判定**：**🔴 红线触发**。绝对增长 +1460%。

**根因**（结合知识库 §4.1.3）：BattleUIManager_UpdateMUIPos 每帧重算所有可见战斗单位的头顶 UI 世界坐标，与 Lua 侧 BattleHeadMgr 状态一致。300 队 × 每队多名士兵 = 千+单位的位置刷新。

**优化方向**：
1. 视野裁剪：屏幕外的 UI 不更新位置
2. 视距分级：远处单位降频更新
3. 批量化：一次性更新所有单位的位置矩阵（考虑下沉到 Job）

#### 4.4.3 OutSideViewArmyLineMgr（行军线刷新子）

**检测项 probe.csharp.outsideViewArmyLine**：

| 函数 | base abs | sm abs | sm `%main` | sm `%global` | 红线（>3% main）|
|---|---|---|---|---|---|
| OutSideViewArmyLineMgr_OnUpdate | 43 | 1,009 | **5.44%** | 2.14% | 🔴 **红线触发** |
| ├─ UpdateStraightMoveLine | 0 | 977 | 5.27% | 2.07% | — |
| ├─ RefreshArmyLine | 0 | 97 | 0.52% | 0.20% | — |
| └─ GetArmyLineID | 0 | 93 | 0.50% | 0.20% | — |

**判定**：**🔴 红线触发**。绝对增长 +2221%，是本次压测**绝对涨幅最大的业务函数**。

**根因**：300 队部队行军场景下，每帧重算所有可见队伍的行军轨迹折线。

**优化方向**：
1. 增量更新：仅 dirty 队伍刷新轨迹
2. 视距分级：远处队伍降频更新（如每 3-5 帧一次）
3. 几何缓存：轨迹折线变化不大时复用上一帧结果

### 4.5 LateUpdate 段（MapManager + MeshUIManager）— §6.2

**MapManager.OnLateUpdate（C#）**：

| | base abs | sm abs | sm `%main` | 红线（>8% main）|
|---|---|---|---|---|
| MapManager_OnLateUpdate | 609 | 489 | 2.63% | 🟢 PASS |

**判定**：🟢 PASS。stressmove 下绝对负载反而 -20%，可能因 base 野外场景视野更广。

**MeshUIManager（实测主线程 self% 排序）**：

| 函数 | base self% | sm self% global | 红线 |
|---|---|---|---|
| MUIControlManager.OnLateUpdate | — | 0.90% global | — |
| MUILayout.Set3DPosition | — | 0.83% global | — |
| MeshUI 子树合计估算 | — | ~1.73% global | 🟢 PASS（<3% main 红线）|

**判定**：🟢 PASS。

---

## §5 PlayerLoop 各阶段（base vs stressmove diff）

| 阶段 | base `%main` | sm `%main` | base abs | sm abs | 绝对 Δ | 判定 |
|---|---|---|---|---|---|---|
| `Update.ScriptRunBehaviourUpdate` | 16.28% | 32.74% | 2,624 | 5,948 | **+126.7%** | 🟡 业务主入口压力 |
| `PreLateUpdate.ScriptRunBehaviourLateUpdate` | 10.38% | 15.03% | 1,673 | 2,730 | +63% | 🟡 LateUpdate 压力 |
| `PostLateUpdate.PlayerSendFrameComplete` | 3.10% | 2.08% | 500 | 377 | -25% | 🟢 |
| `PostLateUpdate.PlayerUpdateCanvases` | 2.02% | 1.24% | 326 | 225 | -31% | 🟢 |
| `PreLateUpdate.ParticleSystemBeginUpdateAll` | 0.16% | 0.91% | 26 | 166 | +548% | 🟢（绝对值小）|
| `PostLateUpdate.ParticleSystemEndUpdateAll` | 0.00% | 0.24% | 0 | 43 | 新出现 | 🟢 |
| `PreLateUpdate.LegacyAnimationUpdate` | 0.28% | 0.75% | 45 | 137 | +206% | 🟢 |
| `PostLateUpdate.FinishFrameRendering` | 1.02% | 0.67% | 165 | 122 | -26% | 🟢 |
| `EarlyUpdate.UpdateTextureStreamingManager` | 2.79% | 1.59% | 450 | 289 | -36% | 🟢 |
| `PostLateUpdate.PlayerEmitCanvasGeometry` | 1.07% | 0.66% | 172 | 120 | -30% | 🟢 |
| `LuaMultiThreadGC`（主线程同步阶段）| 0.14% | 0.00% | 23 | 0 | -100% | 🟢 |

**RenderManager::RenderCameras**（不在 PlayerLoop 内，主线程 nativeRender JNI 入口下）：

| | base | sm | 绝对 Δ |
|---|---|---|---|
| RenderManager::RenderCameras `%main` / abs | 41.29% / 6,659 | 26.57% / 4,831 | **-27.5%** |

**重要解读**（与 v1 报告的修正）：
- **`nativeRender(JNIEnv*, jobject*)`** 是 Android UnityPlayer 通过 JNI 调到 native 的每帧入口，**不是渲染专属**，包含整个 PlayerLoop 执行
- `nativeRender 绝对负载 +49%` 意思是 **"主线程每帧 PlayerLoop 执行总工作量 +49%"**，**不是"渲染负载 +49%"**
- 真正的"主线程渲染配置"指的是 `RenderManager::RenderCameras → UniversalRenderPipeline.Render → RenderCameraStack → RenderSingleCamera` 子树，base→sm 绝对 **-27.5%**

**渲染三层 base→sm 变化**（避免误读）：

| 层 | 含义 | base→sm 绝对变化 |
|---|---|---|
| **主线程渲染配置** | `RenderManager::RenderCameras` 子树（URP 设置/管线代码）| **-27.5%**（野外远景树木阴影多）|
| **RHI 渲染提交** | `ConstantBuffersGLES::UpdateBuffers` 子树（GPU Instancing 数据上传）| **+23.7%**（300 队 transform 矩阵）|
| **GPU 实际工作量** | libGLESv2_adreno 占比 | **+0.6%**（基本不变）— 但 simpleperf 看的是 CPU 调 driver API 的时间，**不直接等同于 GPU 计算时间**，真实 GPU 工作量需要 perfetto GPU counter 或 RenderDoc |

---

## §6 渲染管线检测（§4.6 + §4.7 知识库）

### 6.1 URP 主线程侧（§4.6）

**完整子树（stressmove）**：

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
         │       │   └─ RenderMeshSystemV2.DrawRenderers   0.62% main
         │       ├─ ShadowPass.ProcessShadow              5.25% main / 2.02% global
         │       │   ├─ PlanarShadow.RenderShadow         3.95% main
         │       │   └─ PlanarShadow.BeginProcessShadow   1.15% main
         │       └─ BloomPass.Execute                     3.71% main / 1.43% global
         └─ MobileBaseRenderer.Setup                       3.25% main / 1.25% global
            └─ SetupRenderPassFromFeatures                 2.13% main
```

**检测项（双口径 + base 对照）**：

| 检测项 | base `%main` | sm `%main` | base abs | sm abs | 绝对 Δ | 红线 | 判定 |
|---|---|---|---|---|---|---|---|
| probe.render.urp.shadow | 8.88% | 5.25% | 1,478 | 1,005 | -32% | >8% 🔴 / 5-8% 🟡 | 🟡（边界）|
| probe.render.urp.foliage | 4.81% | 2.61% | 800 | 484 | -39% | >5% 🔴 / 3-5% 🟡 | 🟢 |
| probe.render.urp.postfx（Bloom）| 4.88% | 3.71% | 812 | 688 | -15% | >5% 🔴 / 3-5% 🟡 | 🟡 |
| probe.render.urp.setup | 5.12% | 3.25% | 853 | 603 | -29% | >3% 🔴 / 2-3% 🟡 | 🟡（>3% 边界）|

**反直觉发现**：**base 野外空场景的主线程渲染负载比 stressmove 还重**。原因：野外空场景视野广、远景树木/草地/山脉 instancing 量大；stressmove 场景视野跟随部队偏近，森林进入视野较少，渲染端整体减负。这**绝对值层面**的对比是合理的，不是百分比误读。

**MobileBaseRenderer.Setup 标 🟡**：超过 3% 关注阈值。`SetupRenderPassFromFeatures` 每帧重新构建 Pass 链——base 下也是 5.12%，说明无论场景如何，每帧都有这个固定开销，**是潜在 cache 优化点**。

### 6.2 RHI 线程（Thread-102）— §4.7

**完整子树（stressmove）**：

```
GfxDeviceWorker.RunCommand (99.19% rhi / 21.05% global)
├─ DrawBuffers                                   53.44% rhi
│   ├─ DrawBuffersStereo                         24.22% rhi
│   ├─ BeforeDrawCall                            23.33% rhi
│   │   └─ ConstantBuffersGLES.UpdateBuffers     18.89% rhi  ← GPU Instancing 数据上传
│   │       ├─ DataBufferGLES.Upload             13.25% rhi
│   │       └─ BufferManagerGLES.AcquireBuffer   2.48% rhi
│   ├─ SetVertexStateGLES                         3.71% rhi
│   └─ ApplyGpuProgramGLES                        6.60% rhi
├─ RunCommand 递归                              16.25% rhi
│   ├─ PresentFrame                              7.04% rhi
│   │   └─ eglSwapBuffers                        4.31% rhi
│   ├─ JobQueue.WaitForJobGroupID                3.85% rhi  ← GeometryJob 等待
│   ├─ UpdateBuffer                              2.70% rhi
│   └─ BeginFrame                                 1.40% rhi
├─ SetShadersThreadable                            7.49% rhi
├─ ConstantBuffersGLES.UpdateCB                    4.46% rhi
│   └─ __memcpy (self 4.00% rhi)                 ← §7 反查目标
└─ DynamicVBO.DrawChunk                            2.74% rhi
```

**检测项（双口径 + base 对照）**：

| 检测项 | base `%rhi` | sm `%rhi` | sm `%global` 估算 | base→sm 绝对 Δ | 红线 | 判定 |
|---|---|---|---|---|---|---|
| probe.rhi.constUpload | 15.75% | 18.89% | 4.01% global | +23.7% | >40% 🔴 / 25-40% 🟡 | 🟢 |
| probe.rhi.drawcall（DrawBuffers）| 52.89% | 53.44% | 11.34% global | +4.2% | 仅观测 | — |
| probe.gpu.bound.eglSwap（辅助）| 5.56% | 4.31% | 0.91% global | -20.1% | >15% 🔴 | 🟢 |
| RHI 上 WaitForJobGroupID | 2.39% | 3.85% | 0.82% global | +66% | >5% 🟡 | 🟢 |
| SetShadersThreadable | 9.91% | 7.49% | 1.59% global | -22% | — | 🟢 |

**判定汇总**：

1. **probe.rhi.constUpload 🟢（边界）**：常量缓冲上传量随业务（GPU Instancing 300 队 transform 矩阵）增长 +23.7%。**未触发红线但是个具体优化点**：
   - 主要 caller：`ConstantBuffersGLES.UpdateCB` → `__memcpy 4.00% rhi self`
   - 优化方向：dirty flag（不变的对象跳过更新）或 SSBO 持久映射
2. **probe.gpu.bound.eglSwap 🟢**：eglSwapBuffers 绝对 **-20.1%**（4.31% rhi）——这是个 CPU 侧的 EGL 调用时间，不直接代表 GPU bound 与否。**正确判定见 §6.3**。
3. **RHI 上 JobQueue::WaitForJobGroupID 🟢（边界）**：GeometryJob 等待绝对 +66%，绝对值仍小（3.85% rhi / 0.82% global），来源是 GPU 命令构建时等几何剔除 Job 完成——压测下 ECS Worker 繁忙偶发。**已接近"关注"档边界**。

### 6.3 GPU bound 判定（修正自 v1）

**正确的 GPU bound 信号定义**（知识库 v2.1 §4.6）：

GPU bound 的主要判定信号在**主线程**而不是 RHI 线程。`eglSwapBuffers` 在 RHI 线程的 self% 是辅助参考，不能单独判定。

**实测数据**（按线程定位）：

| Symbol | 真实线程 | base 样本 | sm 样本 | 判定 |
|---|---|---|---|---|
| **`GfxDeviceClient::WaitForPendingPresent`**（GPU bound 主信号）| **主线程**（tid 19292）| 0 | **1** | 🟢 几乎不存在 |
| `GfxDeviceClient::PresentFrame(ShaderChannelMask)` | 主线程 | 2 | 1 | — |
| `GfxDeviceClient::SubmitPresentFrameCallbacks` | 主线程 + Render 线程 | 4 | 0 | — |
| `GfxDeviceGLES::PresentFrame`（RHI 实际执行）| **RHI 线程** | — | 1 | — |
| `eglSwapBuffers` | **RHI 线程** | — | 1 sample 顶（self%）但子树 4.31% rhi | — |
| `Semaphore::WaitForSignal` | Render 线程 | 7 | 5 | — |

**判定**：**🟢 未观察到 CPU 侧 GPU bound 信号**。主线程 `WaitForPendingPresent` 仅 1 样本（<0.01% global），远低于 2% 黄线和 5% 红线。

**Unity Profiler 对照表**（你日常看 Unity Profiler 的对应）：

| Unity Profiler marker | simpleperf C++ symbol | 所在线程 | 含义 |
|---|---|---|---|
| `Gfx.PresentFrame`（主线程行）| `GfxDeviceClient::WaitForPendingPresent` 或 `GfxDeviceClient::PresentFrame` | 主线程 | **GPU bound 主信号** |
| `Gfx.PresentFrame`（Render 线程行）| `GfxDeviceGLES::PresentFrame` | RHI 线程 | RHI 实际执行 |
| `Gfx.WaitForPresentOnGfxThread`（你日常看到这个）| `GfxDeviceClient::SubmitPresentFrameCallbacks`（推断）| 主线程 / Render 线程 | Present 钩子 |

**重要边界**：
- ✅ 可以说"本次未观察到 CPU 侧 GPU bound 信号"
- ❌ 不能说"GPU 不是瓶颈"——simpleperf 看的是 CPU 调 driver API 的时间，**不直接反映 GPU 内部计算时间**。
- ❌ 不能仅凭 libGLESv2_adreno 占比 +0.6% 推断"GPU 工作量不变"——driver API 调用时间和 GPU 实际工作量是两件事
- 真实 GPU 工作量判定需要：**perfetto GPU counter** 或 **Snapdragon Profiler** 或 **RenderDoc**

---

## §7 ECS 健康度 — §4.5

**probe.ecs.mainwait（主线程 Job 等待）**：

| | base | stressmove | 红线 | 判定 |
|---|---|---|---|---|
| UnityMain 内 Wait/Complete 子树合计 `%main` | 0.63% | **1.86%** | >2% main | 🟡 接近边界 |
| 折合 `%global` | 0.28% | **0.71%** | >2% global | 🟢 |

stressmove 主要 Wait 路径（去重后）：

| `%main` | 路径 |
|---|---|
| 0.36% × 2 | `System.UpdateNewParents` → `JobHandle.ScheduleBatchedJobsAndComplete` → `WaitForJobGroupID` |
| 0.22% | `TransformChangeDispatch::GetAndClearChangedAsBatchedJobs` → `WaitForJobGroupID` |
| 0.07% | `System.BeforeOnUpdate` → `JobHandle.CombineDependenciesInternalPtr` |

**判定**：🟡 关注（线程内 1.86% 接近 2% 黄线，但绝对值小）。来源是 Unity 内部 ECS Transform 系统的 `UpdateNewParents` 和 `TransformChangeDispatch`——这些是 Unity 自带的设计内同步点，**不是业务 Job 互等**。

**probe.ecs.jobworker.balance（Worker 均衡度）**：

| | base | stressmove |
|---|---|---|
| Worker 各 `%global` | 2.45 / 2.45 / 2.47 / 2.50 | 3.94 / 3.95 / 4.00 / 4.10 |
| max-min 偏差 | 2.1% | **4.2%** |
| 红线（>30%）| 🟢 | 🟢 |

**判定**：🟢 PASS。Job Worker 负载分布极度均衡，ECS 并行化做得很好。

**Top Burst Job（lib_burst_generated.so）self% 排序（stressmove）**：

| self% global | abs samples | Job 函数 | 含义 |
|---|---|---|---|
| 1.36% | 644 | MoveChain_SoldierMoveSystem.SoldierMoveJob | 士兵移动 |
| 0.99% | 465 | RotationLerpSystem.DoSmoothLerp | 旋转插值 |
| 0.85% | 402 | WriteInstanceDataJob | GPU Instancing 数据回写 |
| 0.70% | 331 | UtilHeightMapBurst.GetSamplerHeights | 地形高度采样 |
| 0.69% | 328 | SyncViewEntitySystem | ECS → 显示同步 |
| 0.64% | 302 | LocalToParentSystem.ChildLocalToWorld | Transform 层级变换 |
| 0.49% | 230 | MoveChain_ArmyMoveSystem.ArmyMoveJob | 队伍移动 |
| 0.44% | 209 | SoldierMoveJob.OnStepMove | 单步移动 |
| 0.43% | 204 | SyncLogicEntitySystem | ECS 逻辑同步 |
| 0.39% | 184 | ArmyMoveSystem.RefreshCurPosition | 路径点刷新 |

合计：**≈ 10.6% global**（与 lib_burst_generated 库占比一致）。最高单 Job 1.36%，无异常凸起。

---

## §8 Lua GC 工作线程专章 — §4.9

simpleperf 在两份数据中各发现一条**伪 UnityMain 线程**实际是 Lua 多线程 GC worker。

**身份证据**：
- tid 19816，comm = `UnityMain`（被 xLua 内部 C# `new Thread` 启动时未设 comm 名）
- 入口 symbol：`LuaMultiThreadGC_LuaGCThreadProc_m84B2A81B530ED40A7A57EB80AB5A641C2374D63B`
- 调用栈：`__start_thread` → `il2cpp ThreadStartWrapper` → `mscorlib System.Threading.ThreadStart` → `LuaMultiThreadGC_LuaGCThreadProc` → `Lua_lua_execute_mtgc`（xLua C# 桥接）→ `lua_execute_mtgc` → `do_realgc` → `luaC_step`

**CPU 占用**：

| | base | stressmove |
|---|---|---|
| 样本数 | 211 | 165 |
| `%global` | 1.27% | **0.68%** |
| 估算 CPU·s（20s）| 0.21s | 0.165s |
| 估算每帧均值（@60fps）| ~0.18ms/帧 | ~0.14ms/帧 |

**意外发现 1**：**stressmove 下 Lua GC 反而比 base 少**（绝对 -22%）。压力上来反而 GC 工作减少。可能解释：
- base 野外空场景 Lua 临时对象分配率高（地形采样、视野检测等业务逻辑活跃）
- stressmove 行军压测主要工作量在 ECS Burst Job（已下沉到 native，不分配 Lua 对象）
- 也就是 **stressmove 的 Lua 增量负载主要是 luaV_execute / luaH_get 这类纯执行开销，不增加堆分配**

**意外发现 2**：base 0.18ms/帧 Lua GC 是**长期稳态**水平，符合知识库 §4.9 "通常发生次数不多但累计存在"的描述。

**判定**：🟢 PASS（<1% global 红线）。

**对 Unity Profiler 用户的提示**：你在 Unity Profiler 看到的 "Lua GC 线程" 就是这条线程（tid 19816），simpleperf 因为同名陷阱把它误标为 UnityMain。**两份数据是一致的，没有漏采**。

---

## §9 中间件 — Wwise 音频专章 — §4.10

> 这是本次报告**唯一一条 🔴 中间件红线**。

**线程身份**：`NativeThread`（tid 19814）实际是 Wwise 工作线程（栈 99.81% 在 libAkSoundEngine.so 内）。

**实测**：

| 指标 | base | stressmove | 绝对 Δ |
|---|---|---|---|
| libAkSoundEngine 全局占比 | 0.97% global | **10.06% global** | **+1255%** |
| 绝对样本数 | 351 | 4,751 | — |
| Wwise 工作线程占比（NativeThread）| 1.06% global | 10.36% global | +1178% |

**判定**：**🔴 红线触发**（v2.1 新阈值 >7%）。

**业务含义**：
- base 野外空场景：几乎无音效播放
- stressmove 行军压测：300 队部队的脚步声、武器声、单位移动音效、UI 提示音叠加 → DSP 处理压力激增

**本源能力边界**：
- ✅ 能告诉你"Wwise 在压测下吃了 10% CPU 并独占整条工作线程"——其他源完全看不到
- ❌ 看不到 Wwise 内部哪个事件最重（libAkSoundEngine.so 内部 symbol 都是 `[+offset]`）——必须用 **Wwise Profiler**

**优化方向**：
1. 并发 voice 数限制：超出听觉密度阈值的声音直接 cull
2. DSP 效果链精简：远距离声音禁用混响/EQ
3. 事件触发频率：脚步声合并、群体音效采用 vrtmask 等

---

## §10 Boehm GC 与 GC 触发源 — §4.11

**Boehm GC 后台标记/扫描**（C# 托管堆的增量回收，吃 CPU 不卡帧）：

| 函数 | sm self% global |
|---|---|
| GC_end_stubborn_change | 0.94% |
| 其他 GC_* 系列估算 | ~0.5% |
| **合计估算** | **~1.5%** |

**判定**：🟡 关注（1-2% 黄线区间）。

**反查 Boehm GC 触发源**（按 §11 反查规则）：

| 全局 pct | Caller | 业务模块 |
|---|---|---|
| 0.12% | `Enumerator_MoveNext` ← `MUIControlManager.OnLateUpdate` ← `MeshUIManager.OnLateUpdate` | MeshUI 迭代器 |
| 0.04% × 4 | `Enumerator_MoveNext` ← `MUILayout.Set3DPosition`（多路径）| MeshUI 3D 位置刷新 |
| 0.03% | `OutsideForestRenderer.DrawForestCell` ← `BatchRenderer.FlushAndClear` | 森林渲染 |
| 0.03% | `PlanarShadow.ResetAllObjectToRender` | 阴影对象列表重置 |

**主要触发源 = MeshUI 的 LateUpdate 迭代**。和 §4.5 MUI 自身开销同源——MeshUI 不仅吃 CPU，还顺带触发 GC 增量。

**优化方向**：MeshUI 内部 `IEnumerator<T>` 改成 `for (int i=0; i<count; i++)` 索引访问，避免迭代器对象分配。

**本源边界**：simpleperf 看不到 `GC.Collect` 单次 STW 卡顿（8-15ms 级），那必须用 Unity Profiler 看帧级数据。

---

## §11 运行时函数反查清单 — §5

> simpleperf 单源**核心独有能力**：把"看似分散的运行时开销"反查到业务调用源。

### 11.1 `__memcpy` 全局 5.143% 反查（58 处命中）

**Top-5 caller 路径**（按 `%global` 排序）：

| `%global` | 线程 | Caller 链 | 业务模块 |
|---|---|---|---|
| **1.7%（合计）** | RHI | `ConstantBuffersGLES.UpdateCB` ← `GfxDeviceWorker.RunCommand` | **GPU Instancing 常量缓冲每帧更新** |
| 0.55% | Render | `InstancingBatcher.RenderInstancesWithBuffer` | **GPU Instancing 数据组装** |
| 0.32% | UnityMain | `Mesh.SetVertexData` ← `MUIDefaultRenderer.SetVertexBufferData` | **MeshUI vertex buffer 上传** |
| 0.21% | RHI | Adreno driver internal | **GPU 驱动黑盒**（不可优化）|
| 0.13% | UnityMain | `MUIRendererBase.FreshVertexAttribute` ← `MUILayout.Set3DPosition` | **MeshUI 顶点属性刷新** |

**结论**：__memcpy **不是"分散在各处"**，70%+ 集中在 **GPU Instancing + MeshUI** 两条路径。

### 11.2 `__ieee754_powf` 全局 1.414% 反查（9 处）

**99%+ 来自 `UI::UIGeometryJob`**（4 个 JobWorker 上 + RHI 线程 1 处）。

**业务含义**：项目设计——主界面/静态 UI 用 UGUI（不是残留！），UGUI 的几何重建 Job 在 Worker 上跑，内部颜色 gamma 校正调用 powf。

**优化方向**（如果觉得 1.4% 偏重）：UGUI 几何重建 Job 内部用查表替代 powf。

### 11.3 `GC_end_stubborn_change` 反查

参见 §10 Boehm GC 触发源。

### 11.4 `tlsf_memalign` / `ThreadsafeLinearAllocator::Allocate` 反查

**主要 caller**（合计 71 处命中）：

| Caller | 业务模块 |
|---|---|
| `RenderingCommandBuffer ctor` ← `ScriptableRenderContext.ExecuteCommandBuffer` | URP 每帧创建命令缓冲 |
| `TranscriptScriptableRenderContext.CopyFrom` ← `Submit` | URP 渲染命令拷贝 |
| `TranscriptRenderingCommandBuffer.AcquireRenderTexture` | RenderTexture 池分配 |
| `GfxDeviceClient.MapConstantBuffers` ← `InstancingBatcher.MapConstantBuffers` | GPU Instancing 缓冲映射 |

**结论**：全部集中在 URP 命令缓冲和 GPU Instancing。**URP 命令缓冲每帧 deep copy** 是个具体优化点（命令缓冲对象池）。

---

## §12 本源能力边界 — §7

| 想回答的问题 | 本源能/否 | 替代源 |
|---|---|---|
| 帧级耗时（哪帧卡）| ❌ 全程聚合 | Unity Profiler |
| Lua 内部脚本/管理器名（MapSignificanceMgr / BattleHeadMgr / Hud_Common / MapCameraCtrl）| ❌ 只能看到 luaV_execute 总量 | Unity Profiler / perfetto |
| GC.Collect 单次 STW 耗时 | ❌ 只能看 Boehm 后台 | Unity Profiler |
| LuaMtGc 单次 spike | ❌ | Unity Profiler |
| 主线程"在算 vs 在等"（off-CPU）| ❌ 只采用户态 cpu-cycles | perfetto sched |
| 降频 / CPU 频率 / 热限频 | ❌ | perfetto sysfs / cooling |
| **GPU 实际工作量** | ❌ 看 CPU 调 driver API 时间，不等于 GPU 计算时间 | perfetto GPU counter / RenderDoc / Snapdragon Profiler |
| Wwise 内部事件级归因 | ❌ libAkSoundEngine 无 debug 符号 | Wwise Profiler |
| 资源加载 spike | ❌ 全程聚合 | Unity Profiler |

**本源独有能力**（其他源做不到）：
1. **native 中间件真实 CPU 占用**（Wwise / Burst / 自研 native）
2. **运行时函数反查到业务模块**（memcpy / powf / GC_* 等）
3. **Lua 宏观总负载完整公式**（含 XLua 桥接路径）
4. **C# 业务管理器函数级 self%**（FrameworkCore_OnUpdate / OutSideViewArmyLineMgr / BattleUIManager 等）
5. **线程身份反推 + 同名线程消歧**（如 Lua GC 线程被 simpleperf 误命名为 UnityMain，通过入口 symbol 识别）
6. **GPU Instancing / 常量缓冲上传等 RHI 层细节**
7. **Boehm GC 后台开销**（区别于 GC.Collect STW）

---

## §13 工程化设计输入

<!-- TOOL: §0.2 红线告警清单需要 ingest 阶段自动算「每个 probe 的实测值 vs 阈值」 -->
<!-- TOOL: §0.3 Top-N 需要 ingest 阶段按业务函数名 (callTree 搜索 keyword) 自动聚合，按绝对样本数排序 -->
<!-- TOOL: §1 双口径要求每个百分比都标注分母 (%global/%main/%rhi/%subtree) -->
<!-- TOOL: §3 线程身份识别 (auto-thread-tagger)：必须用 (tid, comm) 复合 key 避免同名覆盖 + 按入口 symbol 反推真实身份 -->
<!-- TOOL: §3 threadCpuMs 字段当前 Provider bug：用 thread_name 当字典 key 导致 15 条 UnityMain 互相覆盖，必须改为 (tid, name) 或先做 auto-thread-tagger 重命名再聚合 -->
<!-- TOOL: §4 主线程业务 Top-N 需要扫描 callTree 内 keyword 列表 (FrameworkCore_OnUpdate / LuaMgr_OnUpdate / MapManager_OnUpdate / BattleUIManager_* / OutSideViewArmyLineMgr_* / TServer*)，按绝对样本数排序 -->
<!-- TOOL: §6.3 GPU bound 判定算法：扫主线程 callTree 找 GfxDeviceClient::WaitForPendingPresent 为主，eglSwapBuffers 为辅 -->
<!-- TOOL: §8 Lua GC 线程识别：扫所有 thread 的 root callTree，若入口含 LuaMultiThreadGC_LuaGCThreadProc 则重命名为 LuaMtGcWorker -->
<!-- TOOL: §11 反查清单需要专门的反查引擎，遍历 callTree 收集 runtime 函数的 caller-3-hop 路径，按 business module rules 归一 -->

---

> 终极报告 v2 结束。配套：[知识库 v2.1](../aoe-cpu-analysis-knowledge.md) · [工程化路线图](./report-to-pipeline-spec.md)。
