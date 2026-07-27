# 性能分析报告 · 2026-07-11_14-55-28

## 总判定：🔴 不合格

> 这次采集不满足 60fps，也没守住 30fps：600/600 帧都超过 33.33ms，中位帧 41.90ms，是脚本/地图逻辑与 URP 渲染基线共同过重，并叠加相机、GC、网络消息等尖峰。

| 指标 | 数值 |
|------|------|
| 目标帧预算 | 16.7ms / 60fps |
| 实测中位（P50） | 41.9ms |
| P95 | —ms |
| P99 | 95.4ms |
| 最差帧 | —ms |
| 超预算帧占比 | 100.0% |

---

## §0 结论先行

**1. 全程基线超预算**

   【整体帧率失败】600/600 帧超过 16.67ms，且 600/600 帧也超过 33.33ms；PlayerLoop p50=41.90ms、p95=59.31ms、p99=95.45ms，说明不是偶发卡顿，而是整段采集都跑不进 30fps。

**2. URP.RenderSingleCamera 主线程渲染基线过高**

   【稳态大头】URP.RenderSingleCamera 每帧平均 10.64ms，单项就吃掉 60fps 预算的 64%；成本分散在透明渲染、AfterRendering、RendererSetup/RenderGraphSetup、BeforeRendering，不是单个 pass 可解释。

**3. Lua MapSignificanceMgr 常驻重**

   【稳态大头 + 局部尖峰】MapSignificanceMgr 600/600 帧出现，平均 3.99ms/帧、p95=6.18ms，最坏 frame321 达 22.49ms；其 EntityTask 平均 3.57ms/帧，是 Lua 更新中最明确的稳定业务大头。

**4. 地图行军线 + MeshUI 每帧常驻税**

   【稳态开销群】OutSideViewArmyLineMgr 平均 2.30ms/帧，MeshUIManager 平均 2.08ms/帧，二者都 600/600 帧出现，合计约 4.38ms/帧；单看不像爆点，但持续压低帧率天花板。

**5. 相机移动交互尖峰**

   【低频高冲击交互尖峰】OnCameraMove 只出现 19 帧，但出现时平均自耗时 43.14ms，最重 frame144 把整帧推到 96.47ms；它不是全程基线主因，却是玩家拖动/缩放地图时最容易感知的一类顿挫。

**6. 同步 GC 单帧炸帧**

   【低频极端尖峰】GC.Collect 只出现 3 帧，但 frame519 单次 self=70.20ms，占整帧 61.82%；frame483 也有 15.33ms GC.Collect。频率低于稳态项，但单次冲击极端。

**7. YzEntityMoveLineNtf 移动线消息长尾**

   【网络消息尖峰】YzEntityMoveLineNtf present 77 帧，p95 仅 1.05ms，但 p99 到 9.61ms、max 14.90ms；frame273 下 TServerManager 路径 total 22.31ms，像批量移动线更新没分帧消化。

**8. 资源卸载偶发尖峰**

   【资源管理尖峰】TryUnloadPending.TryUnload p50 只有 0.01ms，但 frame80 峰值 14.59ms，LoaderManagerTryUnloadPending total 21.34ms；源码显示 TryUnload 本身很薄，更像当帧处理数量/DoUnload 类型导致。

**9. Present/Gfx 等待叠加**

   【渲染等待尖峰】Semaphore.WaitForSignal 主线程 p95=7.50ms，frame22 达 20.68ms；同帧 URP.WaitForPresent/Gfx.WaitForPresentOnGfxThread 约 19.8ms。它不是全程最差帧主因，但会叠加在已超预算的渲染基线上。

---

## §1 详细发现（9 条）

### 🔴 发现1：全程基线超预算

<sub>严重度：**严重** ｜ 置信度：**高置信**</sub>

这次采集不是偶尔卡一下，而是每一帧都跑不进 60fps 预算：中位帧已经 41.90ms，连 30fps 线也全程没守住。主要问题是脚本更新、地图/行军线、MeshUI 和 URP 渲染管线一起把基线垫高。

**优化建议**

优先按稳定基线拆账，而不是先追单个最大尖峰：先压 LuaMgr/MapSignificanceMgr、MapManager/OutSideViewArmyLineMgr/MUI_UpdateUIPos、MeshUIManager 和 URP.RenderSingleCamera。已经对这些主因做了 drillDown；URP.RenderGraphSetup 源码无法通过 getSourceForSymbol 锚定，建议先用渲染特性/相机栈/RenderGraph pass 开关做 A/B 验证，避免直接猜是 GPU 或 drawcall。

_标签：baseline · over-budget · spread-cost_

---

### 🟠 发现2：重要性任务常驻重

<sub>严重度：**高** ｜ 置信度：**高置信**</sub>

MapSignificanceMgr 是 Lua 更新里的稳定大头：平均每帧 3.99ms，p95 到 6.18ms，最坏一帧 22.49ms。它主要花在实体 add/refresh/cleanup 任务上，不是一个空壳父节点。

**优化建议**

优先检查 MapEntityAdd 和 MapObjRefresh 的任务预算与合并策略。源码附近已经有动态模式和队列长度阈值判断，应验证 PrepareTaskDuraion、headUITaskCount/localResTaskCount 阈值是否在压测下允许单帧过量消化；优化方向应是控制每帧任务预算、合并同实体重复刷新，而不是只减少 Profiler marker。

_标签：lua · spread-cost · baseline · spike_

---

### 🟠 发现3：URP主线程过重

<sub>严重度：**高** ｜ 置信度：**高置信**</sub>

URP.RenderSingleCamera 每帧平均 10.64ms，单它就吃掉了 60fps 预算的大半。成本分散在 RenderGraphSetup、透明主渲染、AfterRendering 和 BeforeRendering，不是一个单独 pass 能解释完。

**优化建议**

先从可开关的渲染特性、透明队列、相机栈和 RenderGraph setup 做 A/B；每次改动用 URP.RenderSingleCamera、URP.RenderGraphSetup、URP.MainRenderingTransparent 复测。getSourceForSymbol 无法锚定 URP.RenderGraphSetup 源码，因此这里不对具体代码做函数级建议。

_标签：rendering · urp · baseline · spread-cost_

---

### 🟠 发现4：相机移动巨型尖峰

<sub>严重度：**高** ｜ 置信度：**高置信**</sub>

相机移动是最明显的交互型卡顿源：OnCameraMove 只出现 19 帧，但每次出现平均自耗时 43.14ms，最重一帧把整帧推到 96.47ms。玩家拖动或缩放地图时会直接感到顿一下。

**优化建议**

源码显示 UpdateCameraPos 已有 hasCameraMoved、CheckCameraMoveInterval 和 zoomMoveDirty 逻辑，但 zoomMoveDirty 时仍会调用 infiniteZoomMgr:OnOutsideCameraMove 并广播 OutsideEvt.CameraZoom。不要简单再包一层粗暴降频；应先把 OnCameraMove 下的监听者或 InfiniteZoomMgr.PostCameraMoveScale 子任务补采样拆开，然后把只受缩放层级变化影响的工作从每次 camera move 中拆出来，只在层级/可见性真正变化时执行。

_标签：spike · camera · tail-latency · lua_

---

### 🟠 发现5：同步GC炸帧

<sub>严重度：**高** ｜ 置信度：**高置信**</sub>

采集中出现了同步 GC 的硬卡：最差一帧 GC.Collect 单独吃掉 70.20ms，占整帧 61.82%。这不是当帧突然大量分配触发的，更像累计到阈值或主动触发的回收。

**优化建议**

先查 EndOfFrame/LuaMgr 是否存在主动 GC 或 Lua/C# 桥接触发的回收策略；再补 per-marker 分配归因，定位长期累积分配源。现有数据只能证明同步 GC 是卡顿直接原因，不能证明具体哪个业务函数在分配。

_标签：gc · spike · tail-latency · memory_

---

### 🟠 发现6：移动线消息尖峰

<sub>严重度：**高** ｜ 置信度：**高置信**</sub>

网络消息 YzEntityMoveLineNtf 偶发把主线程打穿：最重一帧消息处理自耗时 14.90ms，整条 TServerManager 路径吃掉 22.31ms。它像是一次批量移动线更新，没有分帧消化。

**优化建议**

把 YzEntityMoveLineNtf 从“收到即全量处理”改成可限额的队列处理，至少对 fullUpdateLine 按条数或路径点数分帧；同时审查 TblUtil.Clone(coordPath.xArray/yArray) 是否必须复制，若只是格式化后读用，应减少数组克隆或复用缓冲。需要补消息 payload 大小，才能给出每帧处理上限。

_标签：network · spike · lua · message_

---

### 🟡 发现7：行军线和MeshUI常驻

<sub>严重度：**中** ｜ 置信度：**高置信**</sub>

地图侧还有两个常驻成本：行军线管理自耗时平均 2.30ms/帧，MeshUIManager 平均 2.08ms/帧。它们单看不像尖峰，但每帧都在吃预算。

**优化建议**

行军线方向：源码已有 pendingCreateQueue/pendingDeleteQueue 和 pendingEntityIds，建议验证压测下这些队列是否真的限制每帧创建/删除量，并把每帧固定自耗时拆到更细 marker。MeshUI 方向：源码 OnLateUpdate 连续跑 camera、dynamicAtlas、eventSystem、animation、layouts、controls、renderers、keywords；应打开或补充这些子系统采样，否则只能知道 MeshUI 贵，无法知道是布局、动态图集还是渲染器在贵。

_标签：baseline · map · meshui · spread-cost_

---

### 🟡 发现8：资源卸载单帧尖峰

<sub>严重度：**中** ｜ 置信度：**高置信**</sub>

资源卸载平时很轻，但 frame80 突然把 LoaderManagerTryUnloadPending 拉到 21.34ms，其中 TryUnloadPending.TryUnload 自耗时峰值 14.59ms。这类尖峰会造成偶发顿挫。

**优化建议**

给 LoaderManagerTryUnloadPending 增加每帧卸载数量或耗时预算，超过预算延后；同时补记录单帧 TryUnload 调用次数和 DoUnload 类型分布。当前源码只能确认 TryUnload 是薄封装，不能从现有数据判断具体卸了多少资源。

_标签：resource · spike · loading · end-of-frame_

---

### 🟡 发现9：偶发Present等待

<sub>严重度：**中** ｜ 置信度：**中置信**</sub>

主线程有一类等待型卡顿：frame22 在 Present/Gfx 等待上卡了约 20ms。它不是最差帧主因，但会叠加到本来已经超预算的渲染基线上。

**优化建议**

把它作为渲染链路的次级问题验证：在降低 URP.RenderSingleCamera、透明 pass 和 RenderGraphSetup 后复查 frame22 类等待是否下降。当前证据只能说明主线程在等 Present/Gfx，不能单独证明 GPU、Render Thread 或垂直同步哪一个是根因。

_标签：thread-wait · gpu-present · rendering · spike_

---

_Prism 探索：33 次查询　证据核对：42/42 通过　｜ 技术论证/证据链见 report-audit.md_
