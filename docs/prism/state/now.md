# 当前战线（NOW）— 此刻在哪、下一步干嘛

> **新会话第一个读这个。** 永远保持最新。主 agent 每做完一件事 / 快切会话前必更新本文。
> 坐标系见 `../plan/roadmap.md`（里程碑）和 `../plan/backlog.md`（需求）。
> 最后更新：2026-07-10

---

## 当前里程碑

**M1 单次质量收尾**（报告强于作文机）+ **M2 开发操作系统**（并行基建，刚基本搭完）

## 刚做完什么（本次会话）

- ✅ 设计哲学彻底对齐：建 `memory/philosophy.md`（含全景图/引擎内部循环图/作文机对比图/三回路形态/认识论两问题/热插拔降级链/LangGraph定位/坟场vs活系统）
- ✅ 脑图重构为三回路骨架 + 补全所有 BK + 带状态图标（`plan/backlog.smm`）
- ✅ 新增需求：BK-18(自动采集)/19(run内实时自举)/20(三维热点判定)/21(回归哨兵)/22(清prompt业务词)
- ✅ 建整体路线图 `plan/roadmap.md`（M1-M5）
- ✅ **docs/prism/ 四维度目录归位**（memory/plan/state/process/archive）+ 运行时产物 AUTO.md 挪进 web/data/ + 改 collect-datarequests.ts 路径 + 改交叉引用
- ✅ 建开发操作系统 `process/harness.md` + 本文 + README

## 下一步具体动作

1. **WT-001 已出**（`process/worktickets/TODO-WT-001-bk17-html-polish.md`）：BK-17 HTML目录导航+主题群上色 + md版§0空正文修复。**等用户搬给 Cursor 施工 → 完工后主 agent 验收**。
2. WT-002（BK-16 源码归因·实测最硬真缺）待 WT-001 流程跑顺后出。
3. 改主 agent memory 路径 ✅ 已做。

## 待用户拍板 / 进行中

- **WT-001 在途**：用户把工单丢给 Cursor，Cursor 完工回填「完工报告」后，主 agent 按工单验收标准逐条核（跑渲染命令+开浏览器+看md）。

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
