# CPU 性能分析报告 · simpleperf 单源

> **结论**: 本次 CPU 采样（220,237 samples，事件 `cpu-clock`，机型 PAL-AL00）显示 **CPU 高度集中在主线程 UnityMain（占全部 CPU 的 41.8%）**，是典型主线程瓶颈。按代码层归类：**噪音/内核 31.3%、运行时 23.8%、引擎 23.7%、业务 21.3%**。最值得动手的发现有三：
> ① **ATrace/systrace 埋点开销吃掉约 4–7% CPU**（`atrace_begin/end → snprintf → __vfprintf`），这是采集时 trace 处于开启状态导致的、**很可能是可直接去除的观测开销**；
> ② **Wwise 音频中间件（libAkSoundEngine）独占 8.0% CPU**，对一次普通战斗采样偏高；
> ③ **GC 活动（Boehm `GC_end_stubborn_change` 0.71% self）+ Lua VM（`luaV_execute` 1.8%）+ MUI 3D UI 布局（~1.6%）** 构成主线程业务侧的主要常驻开销，其中 GC 与 Unity Profiler 单源报告的"每帧 ~124 次 GC.Alloc"结论**互相印证**。
>
> 数据源：仅 `simpleperf`（CPU 采样视角，回答"CPU 花在哪个函数/库"）。**符号化质量 PASS（应用层 86%）**，函数/库/线程级结论可信；但 **anchor 子树维度本样本不可用（4 个仅 1 个命中且占比 0.005%）**，**帧级耗时、降频、GPU 是否瓶颈本源无法回答**（需 Unity Profiler / perfetto 补充）。相关处均已标注。

---

## 一、概览

| 维度 | 数值 | 证据 key / 出处 |
|------|------|----------------|
| 采样事件 | `cpu-clock` | `detail.simpleperf.event` |
| 总采样数 | 220,237 | `detail.simpleperf.totalSamples` |
| 机型 | PAL-AL00 (HUAWEI, aarch64) | `meta.device` |
| 符号化校验 | **PASS**（应用层 86.0%） | `detail.simpleperf.symbolCheck` |
| 内核占比（未符号化，预期） | 30.7% | `symbolCheck.kernelPct` |
| 总未符号化占比 | 37.0% | `symbolCheck.unknownPct` |
| anchor 命中 | **1 / 4** | `symbolCheck.anchorsResolved` |

### 代码层归类（CPU self 占比，结论先行用）

| 层 | 占比 | 含义 |
|---|---|---|
| 噪音（内核/未知/系统） | **31.3%** | 内核态 + 未还原地址，多为采样固有噪音，**不可直接优化** |
| 运行时（libc/libm/ART/GPU 驱动） | 23.8% | C/C++ 运行时 + 图形驱动 |
| 引擎（libunity/libAkSoundEngine） | 23.7% | Unity 引擎 + Wwise 音频中间件 |
| 业务（il2cpp/Lua/Burst/自研 native） | 21.3% | 游戏自身代码 |

> 证据：`detail.simpleperf.layerBreakdown = {business: 21.26, engine: 23.66, runtime: 23.81, noise: 31.27}`。
> **判定**：真正"应用可控"的 CPU（业务+引擎）约 45%，其余 55% 是运行时+内核。优化应聚焦这 45%，且优先主线程。

### 线程 CPU 分布（`cpu.thread.<t>.pct`）

| 线程 | 占比 | 说明 |
|------|------|------|
| **UnityMain** | **41.8%** | 主线程，绝对大头 → 主线程瓶颈 |
| Thread-110 | 11.0% | 匿名线程（[推断] job/native 工作线程，名字未还原） |
| NativeThread | 9.0% | 自研 native 线程 |
| UnityGfxRenderS | 8.2% | 渲染提交线程 |
| Thread-145/146/147/148 | 各 ~5.7% | 匿名线程组（[推断] Job worker 线程池，4 条均衡 → DOTS/JobSystem） |
| AAudio_10 | 1.7% | 音频回调线程 |

> **判定依据**：UnityMain 41.8% 远超其他线程之和的单项 → 优化主线程 ROI 最高。4 条 Thread-145~148 占比高度均衡（5.6–5.8%），符合 Job worker 线程池特征。

---

## 二、核心结论（问题先行）

**这是一份"主线程 CPU 偏重、且混入了可观测开销与中间件开销"的画像。**

simpleperf 的不可替代价值在本样本体现得很直接：它发现了 Unity Profiler **看不见**的两类开销——埋点指令开销（atrace）与音频中间件的 native CPU 占用。下面三个问题按可动手优先级排列。

---

## 三、热点分析（按 self CPU 占比）

### 判定依据
按 `cpu.func.<f>.selfPct`（每个函数自身采样占比，已过滤未还原地址）排序，并回读 `foldedPath`（folded stacks）确认调用链。self 占比 = 该函数自身被 CPU 执行的采样比例，是定位"时间真正花在哪"的正确指标。

### 热点 #1：ATrace/systrace 埋点开销（最高优先级，疑似观测开销）⭐
- **自占比**：`__vfprintf` 4.34% + `__sfvwrite` 0.87% + `write` 1.39% + `strlen` 0.87% ≈ **合计约 7%**（`cpu.func.vfprintf/sfvwrite/write/strlen.selfPct`）。
- **调用链（来自 folded stacks，实证非推断）**：
  ```
  SpriteRendererDataAccessExtensions_CUSTOM_SetLocalAABB_Injected
      → atrace_end_body → snprintf → __vsnprintf_chk → vsnprintf → __vfprintf
  SpriteDataAccessExtensions_CUSTOM_GetBindPoseInfo_Injected
      → atrace_begin_body → snprintf → __vsnprintf_chk → vsnprintf → __vfprintf
  ```
- **根因**：采集时 **ATrace（Android systrace）埋点处于开启状态**。Unity 在 Sprite/SkinnedMesh 数据访问路径上发射 `atrace_begin/end` trace 段，每个段都要 `snprintf` 格式化字符串，`__vfprintf` 是格式化的实际开销。
- **结论**：这 ~7% 中**很大一部分是观测开销，不是游戏逻辑本身**。
  - **建议 1（立即）**：在正式构建/正式采样中关闭 ATrace（移除 `-funwind-tables`/profiler trace、或用非 trace 构建），预计直接回收数个百分点 CPU。
  - **建议 2（重要警示）**：**本次 simpleperf 采样混入了 atrace 开销，意味着各业务函数的绝对占比被整体抬高了**；与 Unity Profiler 对比帧耗时时需扣除这部分观测偏差。
- **[推断]**：是否为 Development/Profile 构建需结合构建配置确认；但调用链 `atrace_*→snprintf→vfprintf` 是确凿证据，指向 trace 埋点而非业务 printf 日志。

### 热点 #2：Wwise 音频中间件 8.0%（libAkSoundEngine）
- **库占比**：`cpu.lib.libAkSoundEngine.pct = 7.955%`，是第 4 大库（仅次于 kernel/libunity/libil2cpp）。
- **判定**：一次普通战斗采样中音频中间件占 8% CPU 偏高。[推断] 可能与同时播放语音/音效数量、DSP 效果链、或音频线程与主线程的交互有关。
- **建议**：核查并发 voice 数、DSP 总线效果、音频事件触发频率；用 Wwise Profiler 交叉确认。**本源只能定位到"libAkSoundEngine 占 8%"，更细的事件级归因需 Wwise 侧工具。**

### 热点 #3：业务侧主线程常驻开销
| 函数 | self% | 子系统 | key |
|------|-------|--------|-----|
| `luaV_execute` | 1.80% | Lua VM 解释执行（libxlua 共 2.82%） | `cpu.func.luaV_execute.selfPct` |
| `RenderShadowMaps / ShadowMapJob` | 1.06% | 阴影渲染 | `cpu.func.RenderShadowMaps_...selfPct` |
| `MUIControlManager.OnLateUpdate` | 0.90% | MUI 框架 UI 后期更新 | `cpu.func.MUIControlManager_OnLateUpdate_...` |
| `MUILayout.Set3DPosition` | 0.69% | MUI 3D 空间 UI 布局 | `cpu.func.MUILayout_Set3DPosition_...` |
| `SoldierMoveJob`（DOTS） | 0.75% | ECS 士兵移动 | `cpu.func.Unity_Entities_..._SoldierM...` |
| `GC_end_stubborn_change` | 0.71% | Boehm GC（il2cpp 托管堆回收） | `cpu.func.GC_end_stubborn_change.selfPct` |

- **MUI（OnLateUpdate 0.90% + Set3DPosition 0.69% ≈ 1.6%）**：3D 空间 UI 每帧重算布局。**与 Unity Profiler 报告里 `OutSideViewArmyLineMgr` / `MeshUIManager` 热点同源**（都是 3D 跟随式 UI）。建议：对静止/未变化的 3D UI 跳过 Set3DPosition 重算、做脏标记缓存。
- **`luaV_execute` 1.8%**：Lua 逻辑解释开销。建议定位高频 Lua 调用，热点逻辑下沉到 C#/native。
- **`GC_end_stubborn_change` 0.71%**：**与 Unity Profiler 单源报告"每帧约 124 次 GC.Alloc → GC 触发"形成跨源印证**——simpleperf 从 native 侧确认了 Boehm GC 的常驻 CPU 开销。建议同前：削减每帧托管堆分配。

### 噪音/运行时（不作为优化目标，仅说明）
- `__memcpy 3.01%` + `__ieee754_powf 1.42%`：分散在各处的内存拷贝与 `pow()` 数学运算，无单一调用源主导，归因价值低。
- 内核 30.7%（`[kernel.kallsyms]` 多为未符号化地址）：设备无内核符号表，**属采样固有噪音，不可直接优化**，也无法细分到具体 syscall。

---

## 四、anchor 子树分析 —— 本样本不可用（诚实标注）

| anchor | 子树占比 | 状态 |
|--------|---------|------|
| `ExecutePlayerLoop` | 0% | 未命中 |
| `ScriptRunBehaviourUpdate` | 0% | 未命中 |
| `GfxDeviceWorker::RunCommand` | 0% | 未命中 |
| `TranscriptScriptableRenderContext::ExecuteScriptableRenderLoop` | 0.005% | 命中但占比极低 |

- **根因**：simpleperf 的调用栈回溯（callchain unwinding）在本样本**未能稳定回溯到 libunity.so 内部的引擎入口帧**（栈深受限 / 引擎部分内联帧丢失）。`symbolCheck.anchorsResolved = 1/4`。
- **结论**：**本次无法给出"主循环各阶段子树占比"这一维度**。所有 `cpu.anchor.*` 结论不可用。
- **不影响**：函数级（self）/ 库级 / 线程级占比仍然 PASS 可信——它们不依赖深层栈回溯。

---

## 五、本源能力边界（单源局限，需补采才能回答）

| 想回答的问题 | simpleperf 能否回答 | 需要的源 |
|------------|-------------------|---------|
| CPU 花在哪个函数/库/线程 | ✅ 可（本报告主体） | — |
| 每帧耗时多少、哪帧卡 | ❌ 不能（采样是全程聚合，无帧概念） | Unity Profiler |
| 主线程是在算还是在等（Running/Sleeping） | ❌ 不能 | perfetto |
| GPU 是否瓶颈、是否降频 | ❌ 不能 | perfetto |
| 主循环各阶段子树占比 | ⚠️ 本样本不可用（anchor 未命中） | 改善栈回溯后重采 |
| 匿名线程 Thread-110/145~148 是什么 | ⚠️ 名字未还原，仅能推断 | perfetto 线程名 / 采集侧补充 |

> **采样观测偏差提醒**：本次采集 atrace 开启，业务函数绝对占比被整体抬高（见热点 #1）。与其他源做帧耗时对比时须扣除此偏差。

---

## 六、优化建议汇总（按 ROI 排序）

1. **关闭正式采样/构建中的 ATrace 埋点**（预计回收数个百分点 CPU，且消除观测偏差）—— 最高 ROI，近乎零风险。
2. **核查 Wwise 音频负载**（8% CPU）：并发 voice / DSP 效果链 / 事件频率。
3. **MUI 3D UI 布局缓存**（~1.6%）：静止 UI 跳过 `Set3DPosition` 重算（与 Unity 报告 3D 跟随 UI 热点同源）。
4. **削减托管堆分配抑制 GC**（与 Unity 报告跨源印证）。
5. **Lua 热点逻辑下沉**（`luaV_execute` 1.8%）。

---

## 七、自检（质量门 §6）
- [x] 问题导向（主线：3 个问题 → 根因 → 建议）
- [x] 结论先行（顶部普通话结论 + 代码层归类）
- [x] 完整证据链（每个热点挂 `cpu.func.*` key + folded stacks 调用链）
- [x] 判定依据透明（self 占比/库占比/线程占比均引具体数值）
- [x] 可执行建议（关 atrace / 查 Wwise / UI 缓存 / 减分配 / Lua 下沉）
- [x] `[推断]` 标注（构建类型、匿名线程身份、音频细分）
- [x] 不编造（所有函数名/占比来自 `simpleperf-profile.json`）
- [x] 降频/可信度：anchor 维度显式标"不可用"；atrace 观测偏差显式提醒；符号化 PASS 但内核 30.7% 不可细分已说明

---

> 数据产物：`output/p1-simpleperf/simpleperf-profile.json`（38 指标 + detail.callTrees）、`simpleperf-profile-summary.json`（AI 摘要）、`simpleperf-folded.txt`（folded stacks，9.8MB，flamegraph 输入）。入库：`runs` 1 行（sources=["simpleperf"]）+ `run_metrics` 38 行（全 `cpu.*` 命名空间）。raw `perf.data`（34.4MB）已登记为 Asset。
