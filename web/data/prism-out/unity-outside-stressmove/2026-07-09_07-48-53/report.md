# 性能分析报告 · 2026-07-09_07-48-53

## 总判定：🔴 不合格

> 几乎每一帧都超预算超过2倍，相机一动就卡出40~50毫秒的顿帧，外加两次GC同步卡顿把单帧拖到113毫秒——这不是某一个元凶，是好几股稳态开销叠加在一起，再被偶发尖峰反复捅刀子。

| 指标 | 数值 |
|------|------|
| 目标帧预算 | 16.7ms / 60fps |
| 实测中位（P50） | 41.9ms |
| P95 | 59.3ms |
| P99 | 95.5ms |
| 最差帧 | 113.3ms |
| 超预算帧占比 | 100.0% |

---

## §0 结论先行

**1. 相机移动必卡**

   【高频尖峰】19次相机移动100%命中">60ms极慢帧"，占全部27个极慢帧的70%，单次最高吃掉53.41ms（几乎半帧）

**2. 行军线管理每帧稳定2.3ms，全场sumSelfMs最高**

   【稳态开销】600帧每帧都出现，累计1381ms，是单个marker里吃掉总时间最多的一项，决定了帧率天花板

**3. MeshUIManager（UI）每帧稳定2.08ms**

   【稳态开销】600帧每帧都出现，累计1246ms，是第二大常驻税，但内部子系统分布看不到

**4. 两次GC.Collect同步卡顿（全场最慢帧的元凶）**

   【极端偶发尖峰】600帧仅出现2帧，但frame519单帧113.56ms（全场最慢），GC.Collect占其中61.8%；发生频率低所以排在稳态大头之后，但单次冲击是全场之最

**5. Lua多线程GC（ExecuteMtGc）偶发变慢并拖累主线程等待**

   【偶发尖峰（跨线程）】5帧突发，最高21.59ms，且证实会连带主线程WaitGCThread等待（100%重叠），是唯一被验证的跨线程因果链

**6. 网络消息YzEntityMoveLineNtf偶尔炸到14.9ms**

   【偶发尖峰】77帧里出现，9帧突发，frame273单帧占比33%，长尾分布(p99是p95的9倍)

**7. 资源卸载TryUnloadPending偶尔炸到14.6ms**

   【偶发尖峰】6帧突发，均值仅0.11ms，代码逻辑4行极简，贵在批量调用次数而非单次逻辑

---

## §1 详细发现（10 条）

### 🔴 发现1：两次同步GC.Collect把单帧直接拖到113ms和57ms，是全程最卡的两下

<sub>严重度：**严重** ｜ 置信度：**高置信**</sub>

整场600帧里最卡的一帧（frame519，113.56ms，接近预算的7倍）里，六成多的时间（70.2ms）都花在一次GC.Collect上，等于是游戏突然愣住70毫秒去清理内存，然后才继续跑逻辑。frame483也发生过一次类似但稍轻的版本（GC相关调用合计约18.84ms，占该帧三成）。这两帧都不是因为当时分配了很多内存（gc_allocated_in_frame在这两帧都处于全程正常偏低水平），更像是引擎自己按周期或按阈值主动触发的一次性大扫除，撞上了这一帧就变成了肉眼可见的顿一下。

**优化建议**

两次事件发生频率都很低（600帧仅各1次），说明这不是持续性泄漏问题，而是GC触发时机没有被主动管理。建议：(1) 排查GC.Collect是否被业务代码显式调用（比如场景切换、资源释放流程里手动Collect），如果是手动触发，考虑挪到加载界面/黑屏过场等不影响帧率感知的时机；(2) 如果是Unity自动触发的阈值型GC，考虑调整增量GC的时间片预算（Application.SetStackTraceLogType或Incremental GC的timeSlice设置），让清理更均匀地摊在多帧；(3) 由于当前采集的gc_allocated_in_frame只有整帧汇总粒度，无法定位是哪个系统在这次GC前持续攒了小对象，需要更细粒度的按marker分配统计才能进一步收窄（见data-requests）。

_标签：gc · frame-spike · main-thread-stall_

---

### 🔴 发现2：相机一动就卡：19次相机移动，平均每次卡43毫秒，最长卡了53毫秒

<sub>严重度：**严重** ｜ 置信度：**高置信**</sub>

整场600帧里，只要触发相机移动（OnCameraMove），当帧几乎必卡：19次移动全部落在"超过60ms的极慢帧"名单里（100%命中），而这些极慢帧里有70%都是被相机移动带崩的。最严重的一次在frame144，相机移动这一步单独就吃了53.41ms，几乎是整帧96.47ms的一半以上。

**优化建议**

getSourceForSymbol未能精确解析到OnCameraMove函数体本身（返回ambiguous，5个候选），也未能定位cls:PostCameraMoveScale的确切Lua代码，只拿到了InfiniteZoomMgr.OnOutsideCameraMove附近代码，因此无法给出行级别的具体修改建议。但从行为模式看，这是相机移动触发的一次性重计算，建议：(1) 排查相机移动事件是否每次都触发了全量的视野裁剪/LOD切换/实体可见性重算，考虑改成增量更新（只处理新进入/离开视野的部分）；(2) 如果是无限缩放层级切换逻辑，考虑给切换动作加节流或异步分帧处理，避免单帧内做完所有工作；(3) 需要进一步定位OnCameraMove的精确源码位置才能给出更具体的修改点（见data-requests）。

_标签：camera · frame-spike · lua_

---

### 🟠 发现3：行军线管理每帧稳定吃掉2.3毫秒，600帧下来攒了1.38秒，是全程最大的持续性开销

<sub>严重度：**高** ｜ 置信度：**高置信**</sub>

CS:AOE.Outside.OutSideViewArmyLineMgr这个行军线管理器不是偶尔卡一下，而是每一帧都稳定花掉2.3毫秒左右自己的逻辑时间，600帧累计下来吃了1381毫秒，是全场sumSelfMs最高的marker——比任何一个偶发尖峰加起来都多。这些时间几乎全部是它自己的代码在跑（几乎没有分摊给子节点），源码显示它每帧都要完整遍历好几个字典（目标特效字典、预测行军线字典、预览行军线字典）。

**调用树摘要**

```
rootSelfMsPerFrame=2.3018,rootTotalMsPerFrame=2.8385，仅一个子节点OutsideLineCtrl:CalculateVertexJob(Burst) selfMsPerFrame=0.5323，占比18.75%，说明82%以上是自身逻辑而非子调用
```

**优化建议**

源码OnUpdate里的三个foreach（m_targetToEffectDict在223-297行区间内的一段、m_armyPredictDict.Keys、m_armyPreviewDict）都是每帧全量遍历，如果这些字典在大量行军线同时存在时条目数很多，建议：(1) 改成脏标记（dirty flag）机制，只在行军线状态真正变化时才处理对应的effect/预测/预览逻辑，而不是每帧无条件全量遍历所有条目；(2) m_targetToEffectDict这个foreach内部还调用了GetEntity/SetPos/GetRelation等函数，如果这些是每帧对同一批实体重复计算相同结果（比如relation关系不常变化），可以考虑缓存结果并仅在相关状态变化时刷新；(3) 由于工具未提供这些字典的运行时条目数量，无法确认具体是哪个字典条目多，建议后续采集时增加对象计数类的自定义Counter。

_标签：steady-cost · cpu-hotspot · gameplay_

---

### 🟠 发现4：网络消息YzEntityMoveLineNtf偶尔炸到14.9毫秒，压力测试下的实体同步消息处理不稳定

<sub>严重度：**高** ｜ 置信度：**中置信**</sub>

服务器推送的实体移动线消息（YzEntityMoveLineNtf）平时开销很小（只在77帧里出现过，稳态很轻），但frame273这一下单独处理这个消息就花了14.9毫秒，占那一帧总耗时的三分之一以上，是典型的"平时没事、偶尔爆炸"型问题，压测场景下服务器推送节奏或消息内容量可能出现突增。

**调用树摘要**

```
调用链CS:AOE.TServerManager→TServer.HandleMessages→YzEntityMoveLineNtf，稳态selfMsPerFrame约0.28ms左右
```

**优化建议**

由于工具未能获取单次YzEntityMoveLineNtf消息的payload大小或包含的实体数量，无法确认是否是消息包过大或包含实体数过多导致的处理耗时上升（已记入data-requests）。基于现有证据，建议：(1) 检查服务器侧是否可以对移动线更新做合并/限流，避免短时间内推送大量独立的移动线变更消息；(2) 客户端处理该消息时是否有可以分帧处理的空间（比如超过一定数量的实体更新时，分散到接下来几帧处理而不是一帧内处理完）。

_标签：network · frame-spike · stress-test_

---

### 🟡 发现5：MeshUIManager每帧稳定吃2.08毫秒，但已经是数据能看到的最细粒度，看不到内部子系统的分布

<sub>严重度：**中** ｜ 置信度：**高置信**</sub>

MeshUIManager（UI渲染管理）每帧稳定花2.08毫秒，600帧累计1245.7毫秒，是全程第三大稳态开销。但这个marker本身就是叶子级——没有任何子节点，即它内部调用的camera/dynamicAtlas/eventSystem/animation/layouts/controls/renderers等子系统各自花了多少时间，现有的Profiler采样数据里完全看不到，只能看到一个总数。

**调用树摘要**

```
leaves只有MeshUIManager自身一项，children=[]，selfMsPerFrame(2.0762)几乎等于totalMsPerFrame(2.0762*1251.48/1245.70≈同值)，即已经是数据能给出的最底层
```

**优化建议**

如果要进一步优化，建议先在MeshUIManager.OnLateUpdate内部给camera/dynamicAtlas/eventSystem/animation/layouts/controls/renderers这7个子系统各自加上CustomSampler.Begin/End，下次采集时就能看到具体是哪个子系统占大头，再决定优化方向。在当前证据下，只能确认这是一个值得关注的持续性开销，但不能给出比"加细粒度采样"更具体的代码级建议，避免在没有证据支撑的情况下猜测具体是哪个子系统的问题。

_标签：steady-cost · ui · data-limitation_

---

### 🟡 发现6：资源卸载TryUnloadPending偶尔卡14.6毫秒，逻辑本身很简单，问题在于同时卸载的资源量

<sub>严重度：**中** ｜ 置信度：**中置信**</sub>

资源卸载检查（TryUnloadPending.TryUnload）平时几乎不花时间（均值仅0.11ms），但6次突发里最高炸到14.59ms（frame80），相对均值放大了近1400倍。查看真实源码后发现TryUnload方法体本身逻辑非常简单（就是判断能不能卸载，能卸载就卸载），说明贵的不是这段代码逻辑复杂，而是当帧同时触发卸载检查/执行的资源数量多。

**调用树摘要**

```
调用链CS:AOE.ResManager→LoaderManagerOnFrameEnd→LoaderManagerTickUnload→LoaderManagerTryUnloadPending→TryUnloadPending.TryUnload
```

**优化建议**

由于当前工具无法获取TryUnload在某一帧被调用的具体次数（只能看到marker总selfMs），无法确认frame80到底卸载了多少个资源对象，这一点已记入data-requests。基于"逻辑简单但批量调用"的判断，建议：(1) 检查LoaderManagerTickUnload是否有单帧卸载数量上限（节流），如果没有，考虑加一个每帧最多处理N个卸载请求的限制，把积压的卸载任务分散到多帧；(2) 排查这6个burst帧前后是否有资源集中释放的业务时机（比如场景切换、大批量对象销毁），如果是，可以考虑延后卸载时机或异步化。

_标签：resource-loading · frame-spike · throttling_

---

### 🟡 发现7：Lua多线程GC（LuaMtGc.ExecuteMtGc）5次突发到21.6毫秒，会连带主线程等待GC线程完成

<sub>严重度：**中** ｜ 置信度：**高置信**</sub>

Lua侧的多线程垫圾回收（LuaMtGc.ExecuteMtGc）平时也不重，但有5帧出现明显突发，最高frame194炸到21.59ms。同一批帧里还能看到主线程有一个专门等这个GC线程的等待点（LuaMtGc.WaitGCThread），说明这次GC执行慢了之后，主线程确实会被拖着等，不是纯粹的后台异步无感操作。

**优化建议**

由于burstFrames集中在194和343-352这两个时间段（后者是连续4帧343/350/351/352，说明是一段持续几帧的Lua内存压力窗口），建议排查这两个时间点前后Lua侧是否有密集的表/对象创建行为（比如批量生成AI逻辑对象、批量创建UI节点等），如果能定位到具体的Lua分配来源，可以考虑把这部分创建工作分帧处理，减少Lua GC需要一次性处理的对象数量峰值。

_标签：lua · gc · multi-thread_

---

### 🟢 发现8：URP渲染管线RenderGraphSetup每帧稳定2.25毫秒，检查后是正常渲染负载，不是bug

<sub>严重度：**低** ｜ 置信度：**高置信**</sub>

URP.RenderGraphSetup（渲染图搭建）每帧稳定吃掉2.25毫秒，600帧总量1351.49毫秒，是全程第二大稳态marker。下钻确认它就是叶子级本身（没有可再分摊的子节点），且渲染几何负载（三角形数、批次数）全程波动不算剧烈，说明这就是当前渲染管线配置下的正常固定成本，不是异常。

**调用树摘要**

```
rootTotalMsPerFrame=2.2735,rootSelfMsPerFrame=2.2525,children=[]，已是叶子级，无法进一步分摊
```

**优化建议**

这不是本次分析中需要优先处理的问题——如果确实希望压缩这部分固定成本，方向应该是审查URP渲染管线的Renderer Feature配置（比如是否启用了不必要的后处理pass、是否有多余的相机渲染RenderGraph重建），而不是从游戏逻辑代码入手。由于本次未进一步下钻渲染管线内部配置，此处只做归类确认，不作为主要优化目标。

_标签：rendering · baseline · ruled-out_

---

### 🟢 发现9：GPU呈现尖峰（Gfx.PresentFrame炸到40ms）是显卡/present层面的独立问题，与CPU逻辑无关

<sub>严重度：**低** ｜ 置信度：**中置信**</sub>

在Submit Thread上，Gfx.PresentFrame（画面提交呈现）出现过2次明显突发，最高frame184炸到40.17ms。但验证后发现，这一帧CPU主线程本身只花了47.9ms（属于正常范围），且这类GPU呈现尖峰帧与CPU侧识别出的">60ms极慢帧"完全不重叠，说明这是显卡驱动/vsync/呈现管线层面的独立抖动，不是本次分析要解决的CPU逐帧脚本问题。

**优化建议**

不建议在本次CPU侧性能分析框架下处理这个问题，因为证据显示它与游戏逻辑代码无关。如果需要专项排查，应该用GPU Profiler（如RenderDoc、PIX、Nsight）而不是CPU侧的Timeline/CallTree工具，去看具体是哪个GPU pass或者present同步机制在这两帧慢了。

_标签：gpu · present · ruled-out_

---

### ℹ️ 发现10：Semaphore.WaitForSignal总量看起来很大（1042ms），但这是Job System的正常空闲等待，不是真热点

<sub>严重度：**信息** ｜ 置信度：**高置信**</sub>

Semaphore.WaitForSignal在主线程上sumSelfMs高达1042.46ms，乍一看像个大热点，但它的本质是主线程在等待其他Worker线程完成Job任务，是Unity Job System调度的正常空闲等待时间，不是主线程自己在做无效计算。这条不构成真实的优化点，特此记录以免被误判为热点。

**调用树摘要**

```
主线程上rootSelfMsPerFrame=1.7374ms/帧，是叶子级marker，本身就是"等待"这个动作
```

**优化建议**

不建议针对这个marker本身做优化，它是Job System正常调度的表现。如果要减少主线程等待时间，应该去看它在等待的那个Job具体是什么（比如是否是某个可以进一步并行化拆分的大Job），而不是直接对着WaitForSignal这个等待动作下手。

_标签：job-system · idle-wait · ruled-out_

---

_Prism 探索：73 次查询　证据核对：29/31 通过　｜ 技术论证/证据链见 report-audit.md_
