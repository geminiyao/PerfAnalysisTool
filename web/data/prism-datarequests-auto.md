# Prism 数据需求池（自动汇总）

> 由 `collect-datarequests.ts` 自动扫描所有探索 run 的 data-requests.json 生成（BK-3 能力回路自动化）。
> 按**跨 run 复现次数**降序——复现越多，越该优先固化为新工具/新采集字段（Charter F4）。
> 人工语义整理与实施路径见 `docs/prism/plan/datarequests.md`（本文件是原始自动汇总，不手改）。

共 67 条唯一需求，来自 17 次探索。

| 复现 | 需求 | 轴 | 状态 | 首见 |
|---|---|---|---|---|
| 3× | per-marker 的 GC 分配字节和分配调用栈，能回答哪个函数或 Lua marker 在持续分配。 | memory | open | unity-outside-stressmove\2026-07-11_14-55-28 |
| 2× | Per-allocation-site (or at least per-marker) breakdown of ma… | - | open | unity-outside-stressmove |
| 2× | Time series or event log of the LoaderManagerTryUnloadPendin… | - | open | unity-outside-stressmove |
| 2× | A cross-thread wait-dependency graph for frame 194 showing w… | - | open | unity-outside-stressmove |
| 2× | Per-camera (not just per-frame) breakdown of batches / set_p… | - | open | unity-outside-stressmove |
| 2× | Lua-side function-level profiling (call stack inside the Lua… | - | open | unity-outside-stressmove |
| 2× | OnCameraMove这个marker对应的真实业务函数体源码（C#或Lua均可），而不是同名Lua菜单类里的空函数体 | symbol-disambiguation | open | unity-outside-stressmove\2026-07-09_03-31-46 |
| 2× | frame519里GC.Collect的调用者信息——是LuaMgr.EndOfFrame流程里哪一行/哪个函数主动调用… | marker-caller-chain | open | unity-outside-stressmove\2026-07-09_03-31-46 |
| 2× | per-marker/per-function级别的GC分配字节数（哪个函数在分配内存），而非整帧总量 | memory | open | unity-outside-stressmove\2026-07-09_03-31-46 |
| 2× | per-marker 的 GC 分配字节和分配调用栈（哪个函数/Lua marker 在分配），不是整帧总量 | memory | open | udiff_1782983710451_be175ef1\2026-07-20_04-10-00 |
| 2× | TryUnloadPending.TryUnload 单帧内的调用次数（当帧同时卸载了多少个资源对象） | loading | open | udiff_1782983710451_be175ef1\2026-07-20_04-10-00 |
| 2× | 逐帧 GC 分配字节(gc_allocated_in_frame)/三角形面数(triangles)/批次(batche… | memory+render | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_07-48-14 |
| 1× | frames 462-481增量GC堆积窗口期间的按分配来源(marker/子系统级)内存分配字节明细，而非仅有全帧汇总… | - | open | unity-outside-stressmove\2026-07-07_12-08-59 |
| 1× | LoaderManagerTryUnloadPending对应的待卸载资源队列(pending-unload queue… | - | open | unity-outside-stressmove\2026-07-07_12-08-59 |
| 1× | YzEntityMoveLineNtf对应网络消息的实际条数与payload大小(而非仅执行耗时)，用于判断“批量到达”… | - | open | unity-outside-stressmove\2026-07-07_12-08-59 |
| 1× | Submit Thread的Gfx.PresentFrame耗时波动(mean=8.79ms, std=9.21ms)背… | - | open | unity-outside-stressmove\2026-07-07_12-08-59 |
| 1× | CS:AOE.LuaMgr的Update tick(F2中确认的6.82ms/帧持续成本，本次运行绝对量级最大的单一组件… | - | open | unity-outside-stressmove\2026-07-07_12-08-59 |
| 1× | CS:AOE.Outside.OutSideViewArmyLineMgr的OnUpdate方法真实逐帧代码体 | symbol-disambiguation | open | unity-outside-stressmove\2026-07-09_03-31-46 |
| 1× | CS:AOE.MeshUIManager每帧调度的Update/Tick方法真实代码体 | symbol-disambiguation | open | unity-outside-stressmove\2026-07-09_03-31-46 |
| 1× | CS:AOE.Outside.OutSideViewArmyLineMgr的逐帧更新方法真实代码体 | symbol-disambiguation | open | unity-outside-stressmove\2026-07-09_06-58-16 |
| 1× | LuaMtGc.ExecuteMtGc底层真正执行GC工作的Lua VM/native层实现代码（而非C#薄封装转发层） | codegraph-coverage | open | unity-outside-stressmove\2026-07-09_06-58-16 |
| 1× | BaseLoader.TryUnload内部调用的DoUnload()方法真实代码体 | symbol-disambiguation | open | unity-outside-stressmove\2026-07-09_06-58-16 |
| 1× | MeshUIManager.OnLateUpdate 内 camera、dynamicAtlas、eventSystem… | ui | open | unity-outside-stressmove\2026-07-11_14-55-28 |
| 1× | YzEntityMoveLineNtf 每次消息的 fullUpdateLine 数量、pathPoint 数量、coo… | network | open | unity-outside-stressmove\2026-07-11_14-55-28 |
| 1× | LoaderManagerTryUnloadPending 每帧处理的 pending unload 数量、每次 DoU… | resource | open | unity-outside-stressmove\2026-07-11_14-55-28 |
| 1× | OnCameraMove/OutsideEvt.CameraZoom 的监听者列表及每个监听者耗时，或 Infinite… | camera | open | unity-outside-stressmove\2026-07-11_14-55-28 |
| 1× | per-marker 的 GC 分配字节数（哪个函数在分配多少字节），不是分配次数。当前 queryGcAllocByM… | memory | open | bk26b-perfetto-triad\2026-07-15_10-36-27 |
| 1× | GC.Collect 触发前若干帧的按 marker/按调用来源的分配明细，判断是分配尖峰触发还是定时 GC。cur 有… | memory | open | bk26b-perfetto-triad\2026-07-15_10-36-27 |
| 1× | GPU busy/freq counter（GPU 占用率和频率），用于从间接强信号档升级到 confirmed GPU… | gpu | open | bk26b-perfetto-triad\2026-07-15_10-36-27 |
| 1× | URP.RenderCameraStack 每帧渲染的相机数量和每个相机的耗时。throttle 态 URP.Rende… | gpu | open | bk26b-perfetto-triad\2026-07-15_10-36-27 |
| 1× | OutSideViewArmyLineMgr 每帧处理的行军线数量、每条行军线的 vertex 计算量。throttle… | business | open | bk26b-perfetto-triad\2026-07-15_10-36-27 |
| 1× | 采集前后的 CPU/GPU 温度（thermal_before/after.txt）和 scaling_max_freq… | freq | open | bk26b-perfetto-triad\2026-07-16_wt031 |
| 1× | per-marker 的 GC 分配字节数（不是次数），用于判断哪个模块分配的内存量最大 | memory | open | bk26b-perfetto-triad\2026-07-16_wt031 |
| 1× | URP.AfterRendering 内部各 Pass（PostProcessing/Blit/FinalBlit 等）… | render | open | bk26b-perfetto-triad\2026-07-16_wt031 |
| 1× | OutSideViewArmyLineMgr 内部子模块的耗时 marker（顶点计算/线段更新/渲染提交），用于拆分 … | script | open | bk26b-perfetto-triad\2026-07-16_wt031 |
| 1× | YzEntityMoveLineNtf 等网络消息的 payload 大小/实体数量（消息体里有多少个实体的移动线更新数… | network | open | udiff_1782983710451_be175ef1\2026-07-20_04-10-00 |
| 1× | OnCameraMove 内部 buckets 数组的运行时大小（每个 bucket 有多少个 entity） | gameplay | open | udiff_1782983710451_be175ef1\2026-07-20_04-10-00 |
| 1× | LuaMtGc.ExecuteMtGc 的触发原因和 GC 工作量（是增量 GC 步进还是全量 GC，触发时 Lua 堆… | memory | open | udiff_1782983710451_be175ef1\2026-07-20_04-10-00 |
| 1× | per-marker 的 GC 分配字节（哪个函数/Lua marker在分配），不是整帧总量 | memory | open | udiff_1782983710451_be175ef1\2026-07-20_wt046 |
| 1× | YzEntityMoveLineNtf消息的payload大小/实体数量 | network | open | udiff_1782983710451_be175ef1\2026-07-20_wt046 |
| 1× | TryUnloadPending.TryUnload单帧内的调用次数（资源卸载数量） | resource | open | udiff_1782983710451_be175ef1\2026-07-20_wt046 |
| 1× | OnCameraMove执行时battleHeadQueue/waitShowEntityQueue的实体数量 | gameplay | open | udiff_1782983710451_be175ef1\2026-07-20_wt046 |
| 1× | Lua 端 marker（如 OnCameraMove、MapCameraCtrl、MapSignificanceMgr… | code | open | udiff_1782983710451_be175ef1\2026-07-20_wt046 |
| 1× | ECS 实体数量统计（军队/士兵/动画实体的具体数量），按帧或按 SystemGroup | scale | open | udiff_1782983710451_be175ef1\2026-07-20_wt046 |
| 1× | DrawCall 数量和按 pass/材质分组的明细 | render | open | udiff_1782983710451_be175ef1\2026-07-20_wt046 |
| 1× | 网络消息的 payload 大小/实体数量（如 YzEntityMoveLineNtf 携带多少个实体的移动线数据） | network | open | udiff_1782983710451_be175ef1\2026-07-20_wt046 |
| 1× | MeshUIManager 7 个子系统（camera/dynamicAtlas/eventSystem/animati… | ui | open | udiff_1782983710451_be175ef1\2026-07-20_wt046 |
| 1× | OnCameraMove 单次调用时遍历的 entity 总数 + RefreshDistancePriority 单次… | cpu | open | run_1781782881102_b35ee5a7\2026-07-23_03-26-20 |
| 1× | YzEntityMoveLineNtf 消息的 payload 大小/携带实体数量 | cpu | open | run_1781782881102_b35ee5a7\2026-07-23_03-26-20 |
| 1× | TryUnloadPending.TryUnload 单帧内的调用次数（当帧卸载了多少个资源对象） | cpu | open | run_1781782881102_b35ee5a7\2026-07-23_03-26-20 |
| 1× | per-marker 的 GC 分配字节和分配调用栈（哪个 C# 函数或 Lua marker 在持续分配），不是整帧总… | memory | open | camera_ab_24072PX77C_20260723_194703\2026-07-23_13-04-55 |
| 1× | Lua 侧 per-function 耗时下钻：LuaMgr.OnTick&UpdateSchedule 和 LuaMg… | cpu | open | camera_ab_24072PX77C_20260723_194703\2026-07-23_13-04-55 |
| 1× | OnCameraMove 事件分发的精确源码实现（相机移动事件向哪些系统/Lua 回调派发） | cpu | open | camera_ab_24072PX77C_20260723_194703\2026-07-23_13-04-55 |
| 1× | per-marker 的 GC 分配字节数（哪个函数/marker 在分配多少字节），而非整帧 gc_allocated… | memory | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_03-47-38 |
| 1× | GC.Collect 出现的确切帧号，以及这些帧的完整 per-frame 调用树 | memory | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_03-47-38 |
| 1× | 逐帧渲染负载计数（triangles 面数、batches、set_pass_calls）和 gc_allocated_… | render | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_03-47-38 |
| 1× | per-marker 的 GC 分配字节数(哪个函数/Lua marker 在分配),不是整帧总量 | memory | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_07-48-14 |
| 1× | RecycleGOTask 的源码实现(回收逻辑、批量触发条件、是否有分帧) | cpu | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_07-48-14 |
| 1× | CoroutinesDelayedCalls 内部具体是哪些协程在跑、各自耗时 | cpu | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_07-48-14 |
| 1× | frame552 三个同步加载 marker([res]entityLoader_sync 20.88ms / asse… | cpu | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_07-48-14 |
| 1× | per-marker 的 GC 分配字节和分配调用栈——具体哪个函数/Lua marker 在持续分配，而不是整帧 GC… | memory | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_09-22-28 |
| 1× | 本次采集的帧计数器数据（gc_allocated_in_frame / batches / triangles / se… | meta | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_09-22-28 |
| 1× | Loading.LockPersistentManager 的调用链和在 PlayerLoop 中的位置（或确认它运行在… | loading | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_09-22-28 |
| 1× | 帧 552 上 MapSignificanceMgr.ProcessTasks 的 22.69ms 落在 9 个 Con… | cpu | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_09-22-28 |
| 1× | Submit 线程 Semaphore.WaitForSignal 的等待归因——区分‘等主线程交付渲染命令’还是‘等 … | gpu | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_11-15-20 |
| 1× | frame 552 上 MapSignificanceMgr.ProcessTasks 内 11 个 ConsumeTa… | cpu | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_11-15-20 |
| 1× | WorldEnvironmentMeshItemMgr 类与 RecycleGOTask 方法的源码定位（getSour… | cpu | open | camera_ab_24072PX77C_20260723_194703\2026-07-24_11-15-20 |
