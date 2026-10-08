# MapSignificanceMgr：先减少重复增删改，再拆预处理整批与单实体重操作

在新会话中复制下面的任务正文；如要使用goal功能，可由你在正文前加 /goal。

```text
请完成以下局部优化，并用源码、正确性验证及对照结果验收。

目标：MapSignificanceMgr：先减少重复增删改，再拆预处理整批与单实体重操作

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
- 用例：recheck_A_zoom_r1；原采样：K:/AI/PerfAnalysisTool_Codebuddy/output/map_recheck_20261006_213000/captures/recheck_A_zoom_r1.pdata
  - marker：MapSignificanceMgr.UpdatePrepareTask
  - 全程均1.476ms/帧；出现帧均1.476ms；538/538帧；全程538次调用
  - 单次max 50.972ms/F415；最大帧累计50.972ms（它可能来自另一帧，不能沿用单次峰值帧号）
- 用例：recheck_A_zoom_r1；原采样：K:/AI/PerfAnalysisTool_Codebuddy/output/map_recheck_20261006_213000/captures/recheck_A_zoom_r1.pdata
  - marker：LUA:MapSignificanceMgr.ConsumeTasks_MapEntity
  - 全程均4.546ms/帧；出现帧均4.546ms；538/538帧；全程538次调用
  - 单次max 8.890ms/F351；最大帧累计8.890ms（它可能来自另一帧，不能沿用单次峰值帧号）

源码输入：
- G:/AOEYZ_Trunk/AOE3D/Assets/Scripts/.Lua/Outside/Map/Core/MapSignificanceMgr.lua:550
  - 函数：OnUpdate:550、UpdatePrepareTask:684、ReadyForProcessTask:1445、CanProcessTask:1508、ProcessSignificanceTasks:1583、ConsumeTasks_MapEntity:1745
  - 本次核查SHA256：50d0a310f47c7483bff3d02117c4588965ed41c2de607c4e6976f7d1fedbb987

实际入口：Core.Update → MapSignificanceMgr.OnUpdate → UpdatePrepareTask / ProcessSignificanceTasks → ConsumeTasks_MapEntity

已有实现：ReadyForProcessTask 已将 PrepareTaskDuraion 放入 totalTaskDuration，CanProcessTask 检查消费时间。HeadUI、LocalRes 等已有超时调整和轮转处理。不是重新添加一套预处理/消费共享计时。

要核查并解决的步骤：UpdatePrepareTask 先遍历全部 _flatPrepareData，整批结束后才记录时间；消费侧在执行一个任务之前判断余量，无法中断一次很长的创建、刷新或删除。

实施步骤：
1. 按 entityId、数据版本和操作顺序分析同批重复刷新/重复查询及可安全合并的增删改；涉及删除后重建、回调副作用的操作不得凭ID直接抵消。先量合并前后的请求数和总CPU。
2. 把预处理输入移交给自己持有的待处理批次，保存处理位置；新帧追加的新请求不能覆盖尚未处理的数据。沿 CreateMapObject、RefreshMapObject、ProcessDeleteInfo 分别找可暂停位置；只有完成一致性所需步骤后才能停止。
3. 沿 ProcessSignificanceTask 按 entityType 记录一次实际业务耗时，定位重复创建、配置查询和绑定。先优化重步骤，再拆可恢复的初始化阶段；直接限制出队数量不能替代这一步。
4. 继续使用已有 PrepareTaskDuraion → totalTaskDuration 计时，核对 UpdateHighFreqPrepareData、ProcessTaskOrder 是否需要单独纳入。审查已有超时轮转是否覆盖持续缩放下的积压，记录各类最老未完成任务等待多久。

验收与完成条件：
1. 覆盖新增→刷新→删除、删除→重建、同ID换版本、回调重入和持续缩放；最终实体/视图集合、删除顺序与必要完成数一致。
2. 分别比较预处理集中帧和 ConsumeTasks_MapEntity 持续成本；合并冗余要求总CPU下降，跨帧处理要求慢帧下降且显示完成延迟满足业务标准。
3. 先记录当前实际配置额度；一次业务操作超出额度时标明实体类型、步骤、耗时。队列结束后必须清空应完成工作，持续输入时老任务不能一直等不到处理。

跨模块关系：先完善本模块已有预处理＋消费计时。是否与切层/帧末共用全帧额度，留到各模块可暂停且同帧证据成立之后。

范围：只修改该路径已确认的业务步骤和必要计时，保持接口兼容；先保留现有预算与超时机制。报告提供的是方向，读取当前实现后选择具体改法，不能机械照抄过期行号。交付每个方案实际改变的工作量与等待时间，不把尚未实测的改善写成收益。
```
