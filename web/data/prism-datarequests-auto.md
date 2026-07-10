# Prism 数据需求池（自动汇总）

> 由 `collect-datarequests.ts` 自动扫描所有探索 run 的 data-requests.json 生成（BK-3 能力回路自动化）。
> 按**跨 run 复现次数**降序——复现越多，越该优先固化为新工具/新采集字段（Charter F4）。
> 人工语义整理与实施路径见 `docs/prism/plan/datarequests.md`（本文件是原始自动汇总，不手改）。

共 18 条唯一需求，来自 6 次探索。

| 复现 | 需求 | 轴 | 状态 | 首见 |
|---|---|---|---|---|
| 2× | Per-allocation-site (or at least per-marker) breakdown of ma… | - | open | unity-outside-stressmove |
| 2× | Time series or event log of the LoaderManagerTryUnloadPendin… | - | open | unity-outside-stressmove |
| 2× | A cross-thread wait-dependency graph for frame 194 showing w… | - | open | unity-outside-stressmove |
| 2× | Per-camera (not just per-frame) breakdown of batches / set_p… | - | open | unity-outside-stressmove |
| 2× | Lua-side function-level profiling (call stack inside the Lua… | - | open | unity-outside-stressmove |
| 2× | OnCameraMove这个marker对应的真实业务函数体源码（C#或Lua均可），而不是同名Lua菜单类里的空函数体 | symbol-disambiguation | open | unity-outside-stressmove\2026-07-09_03-31-46 |
| 2× | frame519里GC.Collect的调用者信息——是LuaMgr.EndOfFrame流程里哪一行/哪个函数主动调用… | marker-caller-chain | open | unity-outside-stressmove\2026-07-09_03-31-46 |
| 2× | per-marker/per-function级别的GC分配字节数（哪个函数在分配内存），而非整帧总量 | memory | open | unity-outside-stressmove\2026-07-09_03-31-46 |
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
