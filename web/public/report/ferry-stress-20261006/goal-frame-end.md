# LoaderManager：定位具体资源与完成回调，完善已有帧末时间片

在新会话中复制下面的任务正文；如要使用goal功能，可由你在正文前加 /goal。

```text
请完成以下局部优化，并用源码、正确性验证及对照结果验收。

目标：LoaderManager：定位具体资源与完成回调，完善已有帧末时间片

采样条件：抢渡口，24072PX77C，游戏版本0.0.999.1020，精致画质。报告部署地址：https://aoeyz-perf.devcloud.woa.com/cpu/report/ferry-stress-20261006/report.html 。本地报告目录：K:/AI/PerfAnalysisTool_Codebuddy/web/public/report/ferry-stress-20261006/。

证据状态：工作区源码核查与后续实施任务；未修改游戏、未新增采样、未验证优化收益。工作区源码与采样包逐行一致性尚未证实。

共同要求：
1. 先检查当前工作区改动、代码版本、手机包版本及相关开关；保留已有实现与他人改动。旧采样只能说明当时的成本，不能证明当前代码仍走同一路径。
2. 目标是减少必要工作之外的重复CPU，并降低集中执行造成的慢帧；不得通过丢任务、漏显示、无限延迟或改变结算结果取得好帧率。
3. 先读源码和已有pdata定位具体子项，形成局部改动，再完成有意义的正确性验证。只有确认需要实机验证时才执行该任务明确涉及的采集；相同画质、负载和轨迹分别比较基线与改后，至少3轮，未达到统计覆盖则说明局限。
4. 分别记录全程均、真实业务发生帧均、逐帧累计P95/max、调用次数、必要工作完成数及总CPU。父子耗时不能相加，最大单次与最大帧累计分别列出。
5. 为等待执行的工作记录提交时间、开始时间、实际完成时间，以及用户可见的对象何时完成显示。按业务定义允许延迟，再设验收值；报告原先的100/250ms没有体验或实测依据，不作为验收标准。
6. 完成条件：交付可审阅代码差异、正确性验证、对照证据和收益边界。不能实施或缺少包/负载时，给出具体阻塞条件与已完成结果，不宣称优化已完成。

已有采样基线（定位依据，不是当前代码的保证）：
- 用例：recheck_A_move_r3；原采样：K:/AI/PerfAnalysisTool_Codebuddy/output/map_recheck_20261006_213000/captures/recheck_A_move_r3.pdata
  - marker：LoaderManagerOnFrameEnd
  - 全程均0.504ms/帧；出现帧均0.504ms；375/375帧；全程375次调用
  - 单次max 36.710ms/F34；最大帧累计36.710ms（它可能来自另一帧，不能沿用单次峰值帧号）

源码输入：
- G:/AOEYZ_Trunk/AOE3D/Assets/Framework/com.tencent.timitbu.res/Runtime/V3/Core/LoaderManager.cs:844
  - 函数：OnFrameEnd:830、TickLoadOnFrameEnd:844、loader.OnFrameEnd:876、时间片检查:898
  - 本次核查SHA256：ddbc8fac72b0bc2488bfe60735d6d1a3a632a6de49ba60800591be34d1a62bb1
- G:/AOEYZ_Trunk/AOE3D/Assets/Framework/com.tencent.timitbu.res/Runtime/V3/Core/Loader/GameObjectLoader.cs:109
  - 函数：OnFrameEnd:109、InstantiateAndFinish:142
  - 本次核查SHA256：5c22e31934d94912cc679c9ba019584426f323f68cd4839be98e91fa5aa0c31c

实际入口：LoaderManager.OnFrameEnd → TickLoadOnFrameEnd → loader.OnFrameEnd → GameObjectLoader.InstantiateAndFinish → InvokeOnGameObjectLoaderFinished及业务回调

已有实现：已有 OnFrameEndTimeSlice；在loader.OnFrameEnd及完成回调之后才检查。GameObjectLoader 会调用 Instantiate、注册释放句柄并置完成。属性默认0，ResMgr初始化中的赋值被注释；手机运行值仍须读取确认。

要核查并解决的步骤：一个Instantiate、AddComponent或业务回调可能独占较长时间；列表复制在计时开始前，超时处理/卸载是另一段。仅缩小时间片无法打断这些步骤。

实施步骤：
1. 关联每个loader的资源URL、版本、加载类型、Instantiate耗时、完成回调名和耗时；沿F34日志内容找到具体触发条件。先归因到业务对象，不先重写整个通用资源框架。
2. 对已确认的重对象评估Prefab预配置组件、对象池和初始化早退出；修复重复错误日志根因。关日志本身不能代表修复。
3. 确需分步完成的业务回调保存对象/loader版本、取消状态和初始化进度；完整初始化后才通知业务可用。单次Unity Instantiate不能假装能在函数中途暂停。
4. 核验实际 OnFrameEndTimeSlice 及单位秒，分别量列表复制、TickLoad、超时清理和卸载。候选共享额度只限制可延后的加载集成；不能随意延迟释放与超时语义。

验收与完成条件：
1. 采到相同资源完成事件，比较具体资源/回调的次数、最长单项、总CPU、同帧累计及资源完整就绪延迟。长尾多轮覆盖不足时保留不确定性。
2. 覆盖加载中取消、释放后完成、对象复用重置、切图和失败重试；没有回调已释放对象、半初始化可见或句柄泄漏。
3. 均值0.504ms与F34单次36.710ms分开验收；不能把一次36.710ms当成持续可省成本。优先级还需结合重事件频次及可重复性。

跨模块关系：只接入可延后的加载完成集成/业务初始化阶段；先验证已有帧末时间片，避免新增另一套相互抢额度的循环。

范围：只修改该路径已确认的业务步骤和必要计时，保持接口兼容；先保留现有预算与超时机制。报告提供的是方向，读取当前实现后选择具体改法，不能机械照抄过期行号。交付每个方案实际改变的工作量与等待时间，不把尚未实测的改善写成收益。
```
