以上是完整的性能分析报告。关键发现总结如下：

**Critical 问题（立即修复）**
1. `TBUResManager.GetResFileInfo` — 主线程同步 IO，触发时单帧 178~575ms 卡顿。注意：hotPath 中显示该函数调用时有 `LogStringToConsole → ErrorLogWriter` 链，**建议先关闭调试 Log**，可能立即减少大量耗时。
2. `Shader.CreateGPUProgram` — 运行时 Shader 编译，叠加 GPU 等待导致 BigJank #1（598ms）。

**Warning 问题（本迭代优化）**
3. `YzEntityMoveLineNtf` — 中位帧占 32%（11.5ms），网络消息量过大 + 有 GC.Alloc，需消息池方案。
4. `RenderManager_Shadow` — 稳定 4.25ms（53.9% 帧），战场简化模式下应关闭或降 LOD。
5. `MapSignificanceMgr.ProcessTask_ZoomEntityAdd` — 无极缩放触发实体添加无时间片限制，峰值 576ms。