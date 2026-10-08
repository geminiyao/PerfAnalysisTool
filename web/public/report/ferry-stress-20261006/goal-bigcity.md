# 名城图标：减少重复显示判定，保留未完成队列并验证差分收益

在新会话中复制下面的任务正文；如要使用goal功能，可由你在正文前加 /goal。

```text
请完成以下局部优化，并用源码、正确性验证及对照结果验收。

目标：名城图标：减少重复显示判定，保留未完成队列并验证差分收益

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
  - marker：LUA:InfiniteZoomMapGoEffectCtrl.RefreshBigCityIconLegacy
  - 全程均3.016ms/帧；出现帧均3.423ms；474/538帧；全程503次调用
  - 单次max 27.741ms/F307；最大帧累计31.445ms（它可能来自另一帧，不能沿用单次峰值帧号）

源码输入：
- G:/AOEYZ_Trunk/AOE3D/Assets/Scripts/.Lua/Module/InfiniteZoom/Ctrl/InfiniteZoomMapGoEffectCtrl.lua:1386
  - 函数：OnOutsideCameraMove:335、RefreshBigCityIcon:1305、Legacy:1322、ScheduleBigCityIconRefreshTasks:1386、ProcessBigCityIconRefreshTasks:1412
  - 本次核查SHA256：edf0d06b0ade1a74c6bc7d54da2ac594c30a160d939fda5f24bd65914931ea02

实际入口：InfiniteZoomMapGoEffectCtrl.OnOutsideCameraMove / 切层 → RefreshBigCityIcon → Legacy 或 ScheduleBigCityIconRefreshTasks → ProcessBigCityIconRefreshTasks

已有实现：已有Legacy/差分开关与按个数处理的图标队列；Schedule 每次全表求差分并将任务位置重置到1，Process再次检查可见性。现有开关实验没有稳定正收益。

要核查并解决的步骤：求差分仍扫描全部名城，执行阶段重复判断；连续刷新重建队列可能使未完成尾部任务反复被替换。一次CreateMapEntityIcon也可能很长。

实施步骤：
1. 先量 IsBigCityIconVisible / CanShowMapEntityIcon、配置查询、差分准备和实际创建刷新；持续成本首先优化重复判定，不能只根据一次创建尖峰把全程问题归为实例化。
2. 按视口、层级、实体数据、关系和选城过滤的实际失效条件复用判定；合并同帧请求，缩小变化集合，不跨失效条件复用旧结果。
3. 修订Schedule与Process的队列覆盖关系；按实体ID/版本更新未完成请求，保留处理进度。连续移动时检验尾部图标能完成，不凭空新增一套防等待机制。
4. 只有创建/刷新确有长步骤时才拆初始化或评估对象池；差分模式先通过正确性与总CPU对照，再讨论是否统一调度。

验收与完成条件：
1. 相同轨迹3轮A/B/A，检查图标最终集合、显隐、尺度、选城过滤与脏数据刷新；连续移动及反复切层时没有长期缺失图标。
2. 比较可见性判断次数、差分准备CPU、有效创建/刷新数、总CPU和慢帧；分帧后FPS升高不等于重复工作减少。
3. 单次max27.741ms/F307与最大帧累计31.445ms分别列示；2.110ms/帧的显示判定成本只作为定位依据，不承诺全部回收。

跨模块关系：仅在差分刷新已证实有效后，考虑它的可暂停队列；不把现有开关等同于完成优化。

范围：只修改该路径已确认的业务步骤和必要计时，保持接口兼容；先保留现有预算与超时机制。报告提供的是方向，读取当前实现后选择具体改法，不能机械照抄过期行号。交付每个方案实际改变的工作量与等待时间，不把尚未实测的改善写成收益。
```
