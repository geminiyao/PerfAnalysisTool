# 当前战线（NOW）— 此刻在哪、下一步干嘛

> **新会话第一个读这个。** 永远保持最新。主 agent 每做完一件事 / 快切会话前必更新本文。
> 坐标系见 `../plan/roadmap.md`（里程碑）和 `../plan/backlog.md`（需求）。
> 最后更新：2026-07-10（WT-001 机制验通，产物为网页微调·用户未正式验收）

---

## 当前里程碑

**M1 单次质量收尾**（报告强于作文机）+ **M2 开发操作系统**（并行基建，刚基本搭完）

## 刚做完什么（本次会话）

- ✅ **WT-001 = M2 试跑轨道，机制验通（这才是重点）**：BK-17 HTML目录导航+主题群上色 + md版§0空正文修复。**产物只是网页样式微调，用户觉得不重要、未正式验收**——它的真价值是**验证了派发脚本能用、编码坑绕过、验收协议能对工单逐条核、断线也能兜住**。主 agent 独立核过：重跑两 renderer、6锚点一一对应、§0每条含实在描述、tsc改动文件零新增错误、无回归。工单已 `DONE-`。**结论：流程这条轨道通了，可正常出下一单；产物质量待日后随报告整体再评。**
  - ⚠️ 派发进程收尾阶段遇 `node.exe: Connection lost`（网络断，退出码1），Cursor 代码写完但没走完收尾（未改名/未填完工报告）——主 agent 读 diff 确认成果完整后代填并验收。**教训：断线不等于施工失败，先读 diff 判成果，再决定重发还是直接验收。**
- ✅ **派发脚本升级（其它 agent 改）**：`dispatch-ticket.ps1` 现在 agent 启动前先设 UTF-8（`format-agent-stream.lib.ps1` + `Initialize-AgentStreamConsole`），用 `--output-format stream-json` 拿流式输出，一边写 `.jsonl` 原始流一边转可读 `.log`。新增 `run-readable-agent.ps1` / `format-agent-stream.ps1` / `.lib.ps1`。**编码必须在 agent 启动前设**（跑完再设=乱码）。
- ✅ 消化用户两条模式确认进 auto-memory：中文推理偏好、开发 agent loop 模式（含并行派发规则）。

## 上一批会话做完什么

- ✅ 设计哲学彻底对齐：建 `memory/philosophy.md`（含全景图/引擎内部循环图/作文机对比图/三回路形态/认识论两问题/热插拔降级链/LangGraph定位/坟场vs活系统）
- ✅ 脑图重构为三回路骨架 + 补全所有 BK + 带状态图标（`plan/backlog.smm`）
- ✅ 新增需求：BK-18(自动采集)/19(run内实时自举)/20(三维热点判定)/21(回归哨兵)/22(清prompt业务词)
- ✅ 建整体路线图 `plan/roadmap.md`（M1-M5）
- ✅ **docs/prism/ 四维度目录归位**（memory/plan/state/process/archive）+ 运行时产物 AUTO.md 挪进 web/data/ + 改 collect-datarequests.ts 路径 + 改交叉引用
- ✅ 建开发操作系统 `process/harness.md` + 本文 + README

## 下一步具体动作

1. **WT-001 已 DONE**（`process/worktickets/DONE-WT-001-bk17-html-polish.md`）。闭环已验证，派发脚本+验收协议均可用。
2. **WT-002 待出**（BK-16 源码归因·实测最硬真缺，见 `m1-gap-analysis.md`）：Lua 裸名消歧 + 调用栈辅助，让建议落到代码行。文件占用预计在 `tools.ts`/`explore` 逻辑层，与 renderer 类工单不冲突。
3. 用户已认可**并行派发**（文件不冲突时）——出 WT-002 前顺手把 M1 剩余需求按"文件占用"分组，标出可并行/须串行。

## 待用户拍板 / 进行中

- **等用户说"继续 M1"** → 主 agent 自主出 WT-002 → 派发 → 验收，连轴转直到 M1 所有工单完成，才回来做里程碑验收。

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
