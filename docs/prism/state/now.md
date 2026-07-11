# 当前战线（NOW）— 此刻在哪、下一步干嘛

> **新会话第一个读这个。** 永远保持最新。主 agent 每做完一件事 / 快切会话前必更新本文。
> 坐标系见 `../plan/roadmap.md`（里程碑）和 `../plan/backlog.md`（需求）。
> 最后更新：2026-07-11（M3推进：WT-005持久大脑✅ + WT-006摄入层✅先验知识79条入库；下一步M3-B注入）

---

## 当前里程碑

**M1 单次质量收尾 ✅ 基本收官** → **M3 持久大脑通电（BK-LOOP）进行中·转折点** + M2 开发OS（已搭完·持续用）

## 刚做完什么（本次会话）

- ✅ **WT-002 = BK-16 源码归因·调用栈辅助消歧（验收PASS）**：给 `getSourceForSymbol`（tools.ts）加可选入参 `callStack`，当裸名符号在 codegraph 命中多个同名候选时，用调用栈祖先去 `edges(kind='calls')` 反查调用者、取交集，**恰好唯一候选才收敛**（否则保持 ambiguous 诚实放弃，护栏不破）。新增 `resolvedVia:'callstack-disambiguated'`。主 agent 独立验收（DR-36 亲自跑）：tsc 零新增错误；tools.cli 三场景实测——`GetRootPanel`(1688候选)无栈→ambiguous、给有效祖先`FindComplexPathToLastContainer`→唯一定位真实文件、给无效祖先→仍ambiguous；单测 66 PASS/0 FAIL。工单 `DONE-`。
  - ⚠️ **同款断线**：派发进程 2 分钟超时中断（Cursor 施工机 shell 故障、命令全空返回、无法自测），代码写完没走收尾。主 agent 读 diff 确认成果完整（Cursor 还自修了 cgDb 提前关闭 bug）后代填完工报告并验收。
  - ⚠️ **验收中主 agent 微调测试**：施工方原用 `OnCameraMove` 作消歧正例，但实测其 5 候选在 codegraph **全无调用边**、注定 FAIL。主 agent 查实后换成已验证可消歧的 `GetRootPanel`。仅换测试数据符号，未动产品逻辑。
  - 🔑 **暴露真缺口（待里程碑讨论）**：codegraph 的 **Lua 调用边覆盖率仅 4.9%**（67917 method 仅 3323 有 caller 边）。调用栈消歧功能成立，但对大量无调用边的 Lua 裸名实际救不回。要真正提升 BK-16 对 Lua 命中率，需补 Lua 调用边数据 或 叠加运行时调用树——方向问题，M1 收尾时定。
- ✅ **WT-001 = M2 试跑轨道，机制验通**：BK-17 HTML目录导航+主题群上色 + md版§0空正文修复。产物只是网页样式微调、用户未正式验收，真价值是验证派发+验收闭环。工单已 `DONE-`。

## 上一批会话做完什么

- ✅ 设计哲学彻底对齐：建 `memory/philosophy.md`（含全景图/引擎内部循环图/作文机对比图/三回路形态/认识论两问题/热插拔降级链/LangGraph定位/坟场vs活系统）
- ✅ 脑图重构为三回路骨架 + 补全所有 BK + 带状态图标（`plan/backlog.smm`）
- ✅ 新增需求：BK-18(自动采集)/19(run内实时自举)/20(三维热点判定)/21(回归哨兵)/22(清prompt业务词)
- ✅ 建整体路线图 `plan/roadmap.md`（M1-M5）
- ✅ **docs/prism/ 四维度目录归位**（memory/plan/state/process/archive）+ 运行时产物 AUTO.md 挪进 web/data/ + 改 collect-datarequests.ts 路径 + 改交叉引用
- ✅ 建开发操作系统 `process/harness.md` + 本文 + README

## 下一步具体动作

1. **M3 加载端+写回端全通**：A(大脑)✅ 摄入✅ B(开局注入)✅ C(收尾沉淀)✅。**大脑能存、能摄入、开局注入、收尾沉淀，四条神经全接通。**
2. **M3-D 连跑验证·数据流闭环已验通(2026-07-11)**：主 agent 用真实 stressmove data-requests.json 跑轻量闭环——run1沉淀6条DataRequest→run2开局注入真的带上(+79条先验)、重跑不堆积。**"越用越强"最小实证成立**。过程揪出并修复 WT-008 两个"单测过但真实数据崩"的bug(字段错位topic/description vs want/rationale + 注入被79条先验饿死)，详见 DONE-WT-008 返工记录。**仅剩"重量层"**：真跑一次完整 explore(~40min)看注入知识是否改变分析行为——建议清了cursor僵尸终端后由主agent直接跑，是M3真正毕业照。
3. **DataRequest schema 脱节**：types.ts 定义(want/rationale)与真实产物(topic/description/reasonMissing)不一致——persist已做字段自适应绕过，但根上types与产物对齐值得单独清理(可归BK-24附近)。
4. **已知深水区 BK-24**：记忆语义去重(跨run同需求措辞变化仍可能算不同id)——留 M4。
5. **环境·Cursor shell 故障根因修正(2026-07-11)**：此前误判为"僵尸终端 pid 25280 / 陈旧会话文件 805916.txt"。用户关 Cursor 后进程已清、主 agent 也删了陈旧 terminal 文件，**但探针重测 shell 仍空返回**（cmd/bash/写文件多法皆空、terminals 目录已空）。故根因**不是僵尸进程/文件**，而是 **Cursor Agent CLI 在 dispatch 脚本的 headless 非交互模式(`-p --output-format stream-json`)下，shell 工具子系统本身就不工作**——属该调用模式的固有限制，清进程/文件修不好。**结论：继续用"Cursor 写代码 + 主 agent 补跑验证"模式**(一直有效)；不再尝试修 Cursor shell。若要 Cursor 能自测，需换 Cursor 的启动方式(非本 harness 范畴)。

## 工单台账

- ✅ `DONE-WT-001` BK-17 HTML美化（M2试跑轨道）
- ✅ `DONE-WT-002` BK-16 源码归因·调用栈消歧
- ⏸ `DEFER-WT-003` BK-16续·profiler父链消歧——代码正确但当前数据零命中，待 **BK-23**（标签名↔函数名映射）激活
- ✅ `DONE-WT-004` BK-20 三维热点判定 + 诚实边界（M1 收官单）
- ✅ `DONE-WT-005` M3-A 持久大脑结构+存取接口（可扩展可插拔，22测试PASS）
- ✅ `DONE-WT-006` M3-摄入层 脚本+LLM二合一（先验知识79条入库，--replace-source防堆积，20测试PASS）
- ✅ `DONE-WT-007` M3-B 开局注入（先验知识注入explore-prompt，守F2免责，10测试PASS）
- ✅ `DONE-WT-008` M3-C 收尾沉淀（DataRequest用稳定id沉淀capabilities，增量不清空，24测试PASS）

## 待用户拍板 / 进行中

- **下一单 M3-B 开局注入**：主 agent 可继续自主出单派发（先验知识注入 explore-prompt）。
- **M3-D 连跑两次验证** = M3 里程碑验收门，到那步回来找用户做阶段验收。

## M1 Gap 分析关键结论（2026-07-10，详见 m1-gap-analysis.md）

- **报告实测比 backlog 旧描述好很多**，DR-39 八项已达标6项。
- **BK-15 降级**：线程/URP 分群已兑现，不再是P0命门。
- **BK-16 升为首要真缺**：报告自认"OnCameraMove定位不到无法给行级建议"。
- **开工顺序**：先 BK-17+bug修复(WT-001,跑顺流程) → 再 BK-16(WT-002,最硬)。

## 最近关键决策（防重新拉锯）

- 开发协作模式：主agent出工单 → 用户搬 Cursor(免费)施工 → 主agent验收。迁移/文档整理是主agent自己的活，不走工单。
- 目录按四维度分（memory/plan/state/process），不按 00-99 编号平铺（不同维度不该同串号）。
- docs/ 只放人/agent 读写文档；运行时产物一律进 web/data/。
- 三回路现状=经验坟场（沉淀是死的），BK-LOOP(M3)通电才活；BK-LOOP必要非充分，M4才填料。
