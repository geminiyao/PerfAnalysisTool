# CPU 性能分析报告 · UnityProfilerData 单源（叙事流样例）

> ⚠️ 本文件是「叙事流结构样例」：内容取自 2026-07-09 那次真实探索的 10 条 findings，
> 但由 Claude 手工按作文机式叙事重组（分主题群 / 问题先行 / 建议汇总 / 穿插调用树），
> 并顺带体现用户本轮指出的技术修正（严重度重排、present 定性、JobWorker 补充）。
> 用于验证"叙事流"结构是否对路——若认可，再做成自动 renderer。

---

## 一、概览

- **场景**：户外大地图压力移动（unity-outside-stressmove），600 帧，主线程视角
- **判定**：🔴 **不合格** —— 600 帧 100% 超 16.67ms(60fps) 预算，中位帧 41.9ms（≈24fps），P99 95.5ms，最差帧 113.6ms
- **一句话结论**：这不是单一元凶，是**一组稳态开销**（行军线 + UI + 渲染管线，每帧雷打不动地吃掉近 7ms）**打底**，
  再被**两类偶发尖峰**（相机移动、各类 GC/资源卸载）反复捅刀。稳态决定了"天花板本来就低"，尖峰决定了"还时不时更卡一下"。

---

## 二、核心结论（问题先行，按对整体帧率的实际贡献排序）

> 排序原则：**看"对整体帧率的贡献"，不看"单帧数字多吓人"**。一个每帧稳定吃 2.3ms 的开销，
> 600 帧累计 1.38 秒，比一次 70ms 但仅出现 1 次的 GC 对平均帧率的拖累大得多。

| # | 问题 | 类型 | 对整体的贡献 | 严重度 |
|---|------|------|------|------|
| 1 | **相机一移动就卡** OnCameraMove | 高频尖峰 | 19 次移动 100% 命中极慢帧，占全部极慢帧的 70%，单次均 43ms | 🔴 严重 |
| 2 | **行军线管理** OutSideViewArmyLineMgr | 稳态大头 | 每帧 2.3ms × 600 = 1381ms，全场 self 最高 | 🔴 严重 |
| 3 | **渲染管线整体** URP.Render 子树 | 稳态大头 | 子树每帧数 ms，RenderGraphSetup 单项 2.25ms/帧；且主线程被 GPU present 阻塞 | 🟠 高 |
| 4 | **UI 渲染** MeshUIManager | 稳态大头 | 每帧 2.08ms × 600 = 1246ms | 🟠 高 |
| 5 | **偶发尖峰群** GC.Collect / 资源卸载 / LuaMtGc / 网络消息 | 低频尖峰 | 各自 1~6 帧，单帧 14~70ms，偶发但影响帧稳定性 | 🟡 中 |

**已排除（查证后确认不是本次要解决的问题）**：Semaphore.WaitForSignal（Job 系统正常空闲等待）。

---

## 三、稳态开销分析（决定帧率天花板的"常驻税"）

> 这三项每帧都在，合计约 **6.6ms/帧** —— 已是 60fps 预算(16.67ms)的 40%。它们不解决，天花板就下不来。

### 3.1 行军线管理 OutSideViewArmyLineMgr（每帧 2.3ms，全场最大）

每帧稳定 2.30ms self，600 帧累计 **1381ms**，全场 sumSelfMs 最高——比任何单次尖峰加起来都多。
82% 是自身逻辑（子节点 CalculateVertexJob 仅 0.53ms）。

```
OutSideViewArmyLineMgr.OnUpdate  2.84ms/帧 (self 2.30ms, 82%)
└─ OutsideLineCtrl:CalculateVertexJob (Burst)  0.53ms/帧 (18%)
```

**源码归因**（读到真实 OnUpdate，OutSideViewArmyLineMgr.cs）：内部有三个 **每帧全量 foreach**
——`m_targetToEffectDict` / `m_armyPredictDict.Keys` / `m_armyPreviewDict`，且 foreach 内还调用
`GetEntity / SetPos / GetRelation`。

**优化建议**：
1. **改脏标记（dirty flag）**：只在行军线状态真正变化时处理对应 effect/预测/预览，而非每帧无条件全量遍历所有条目；
2. **缓存关系计算**：`GetRelation` 若对同一批实体每帧重复算出相同结果（relation 不常变），缓存之、仅状态变化时刷新；
3. 补采：这几个字典的运行时条目数（决定 foreach 规模），当前工具看不到。

### 3.2 UI 渲染 MeshUIManager（每帧 2.08ms）

每帧稳定 2.08ms，累计 1246ms，全程第三大稳态。**但它是叶子 marker——内部 camera/dynamicAtlas/
eventSystem/animation/layouts/controls/renderers 七个子系统各占多少，当前 Profiler 数据完全看不到。**

**优化建议**：先在 MeshUIManager.OnLateUpdate 内部给这 7 个子系统各加 CustomSampler.Begin/End，
下次采集才能定位大头。**在有证据前不猜具体是哪个子系统**（诚实边界）。

### 3.3 渲染管线 URP.Render 子树（父节点整体偏大 + 主线程被 GPU 阻塞）

URP.RenderGraphSetup 单项每帧 2.25ms（累计 1351ms，第二大稳态），且它是叶子（引擎内置渲染图搭建，
非业务代码）。**但更值得注意的是整个 URP.Render 子树本身就大、且子节点分摊平均**——这是"父节点大、
子节点平均"型成本，应把父节点整体作为一个优化单元看。

**⚠️ 跨线程关联（本次修正的重点）**：URP.AfterRendering 下主线程的 `Gfx.WaitForPresentOnGfxThread`
在等 Submit 线程的 `Gfx.PresentFrame`——而后者**均 8.82ms/帧、累计 5282ms**，是持续性的高开销，
**不是偶发尖峰**。主线程被 present 阻塞 → 说明**渲染/GPU 压力本身就大**，不是纯 CPU 逻辑问题。

**优化建议**：
1. 审查 URP Renderer Feature 配置（多余的后处理 pass？多余的相机 RenderGraph 重建？）；
2. present 持续 8.82ms/帧提示 GPU 侧压力，需配合 GPU Profiler（RenderDoc/Nsight）看具体哪个 pass 慢；
3. 降整体渲染负载（overdraw / 批次 / 分辨率）比抠单个 stage 更有效。

---

## 四、偶发尖峰分析（不决定天花板，但制造肉眼可见的顿挫）

### 4.1 相机移动 OnCameraMove（高频尖峰之王，19 次必卡）

只要相机移动，当帧几乎必卡：19 次移动 **100% 落在 >60ms 极慢帧**，且极慢帧里 **70% 由它带崩**。
最狠一次 frame144 单这一步吃 53.4ms（占该帧 96.5ms 的一半以上）。

**源码归因（诚实：未能精确定位）**：getSourceForSymbol 对 `OnCameraMove` 返回 ambiguous（5 个同名候选），
`cls:PostCameraMoveScale` 也未能定位到确切 Lua 代码，只拿到 InfiniteZoomMgr.OnOutsideCameraMove 附近代码。
**因此给不出行级建议**，只能给方向。

**优化建议（方向性）**：
1. 排查相机移动是否每次都触发**全量**视野裁剪/LOD 切换/实体可见性重算 → 改**增量**（只处理进/出视野的部分）；
2. 无限缩放层级切换加节流或异步分帧；
3. 补采/补映射以定位 OnCameraMove 精确源码（见 data-requests）。

### 4.2 GC / 资源 / Lua 尖峰群（低频但影响帧稳定性）

> 这几项**单帧数字大、但出现次数极少**，对平均帧率贡献小——所以排在稳态开销之后，
> 但它们制造的瞬时顿挫仍影响体验，值得治理触发时机。

- **GC.Collect 同步阻塞**：frame519 一次 70.2ms（占该帧 62%）、frame483 一次 18.8ms。**全程仅 3 帧**。
  两帧 gc_allocated_in_frame 都正常偏低 → 不是分配尖峰触发，像是**引擎周期/阈值型主动 GC** 撞上这帧。
  建议：排查是否业务代码手动 Collect（挪到黑屏过场）；或调增量 GC 时间片让清理摊匀。
- **资源卸载 TryUnloadPending**：均值 0.11ms，6 次突发最高 14.6ms(frame80)。**读源码确认方法体极简**——
  贵在"当帧同时卸载的资源量多"，不是逻辑复杂。建议：给单帧卸载数量加上限（节流），积压分摊到多帧。
- **Lua 多线程 GC（LuaMtGc.ExecuteMtGc）**：5 帧突发最高 21.6ms(frame194)，且主线程有 `LuaMtGc.WaitGCThread`
  等待点——**GC 慢时主线程真被拖着等**。建议：排查 194 / 343-352 窗口的 Lua 密集建对象，分帧创建削峰。
- **网络消息 YzEntityMoveLineNtf**：稳态很轻(77帧)，frame273 单次 14.9ms（占该帧 1/3）。
  调用链 `TServerManager→TServer.HandleMessages→YzEntityMoveLineNtf`。压测下服务器推送节奏/消息量突增。
  建议：服务器侧合并/限流移动线更新；客户端超量时分帧处理。

---

## 五、工作线程补充（本次修正补上的盲区）

> ⚠️ 之前的报告只盯主线程。实际上 **4 条 Job.Worker 线程各累计 ~24600ms self——是全场最大的 CPU 消耗**。

- 4 条 Job.Worker 各约 24.6 秒 self，远超主线程任何单一 marker。多 worker 并行，单帧摊下来不一定是瓶颈，
  **但完全不看是盲区**。需进一步查：这些 Job 是什么（Burst 编译的 ECS/移动/动画 Job？）、单帧关键路径上主线程
  是否在等某个大 Job（结合 Semaphore.WaitForSignal 的等待对象）。
- **这也回扣 §3.3**：主线程 Semaphore/present 等待，本质是"主线程在等这些 worker/GPU 完成"——
  CPU-bound 的锅有一部分在 worker 线程和渲染,不全在主线程脚本。

---

## 六、优化优先级汇总

| 优先级 | 动作 | 预期收益 |
|--------|------|---------|
| **P0** | 行军线 OnUpdate 三个 foreach 改脏标记 + 缓存 relation | 稳态省最多，全场第一大 self |
| **P0** | 相机移动改增量视野更新 + 缩放切换分帧 | 消除 70% 的极慢帧来源 |
| **P1** | URP 渲染负载 + present GPU 压力（需 GPU Profiler 配合） | 降稳态天花板 + 解主线程阻塞 |
| **P1** | MeshUIManager 补细粒度采样后再定位 | 稳态第三大，先补采样 |
| **P2** | GC.Collect 触发时机管理 / 资源卸载节流 / Lua GC 削峰 | 消除偶发顿挫 |
| **补采** | per-marker GC 分配、字典条目数、消息 payload、单帧卸载数、Job 明细 | 让上面几条能给到行级建议 |

---

_数据来源：Prism 分析师探索 2026-07-09（73 次查询，证据核对见 report-audit.md）。
本样例为叙事结构演示，技术数字取自真实 findings，叙事组织与严重度重排为手工。_
