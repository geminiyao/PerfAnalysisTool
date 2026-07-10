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

1. **验证迁移无损**：跑一次 collect-datarequests.ts 确认写到新路径没断；确认老 docs/PRISM-*.md 可安全删（先留着）。
2. **补 roadmap 映射表零遗漏**：把 BK-6/7/8/12b/14 补进里程碑映射（Task #1）。
3. **改主 agent 的 memory 路径**：`.tclaude/memory/` 里 2 处指向旧 docs/PRISM- 路径，主 agent 自己改。
4. **出 M1 第一张工单**：候选 BK-15（线程/URP偏见，命门）——但验收贵(40min探索)。待与用户敲定 M1 内部开发顺序后出单。

## 待用户拍板

- M1 内部第一个开发哪个需求（BK-15 命门但验收贵 / BK-20 较轻）+ 验收节奏（小成本验证 vs 直接完整探索）。

## 最近关键决策（防重新拉锯）

- 开发协作模式：主agent出工单 → 用户搬 Cursor(免费)施工 → 主agent验收。迁移/文档整理是主agent自己的活，不走工单。
- 目录按四维度分（memory/plan/state/process），不按 00-99 编号平铺（不同维度不该同串号）。
- docs/ 只放人/agent 读写文档；运行时产物一律进 web/data/。
- 三回路现状=经验坟场（沉淀是死的），BK-LOOP(M3)通电才活；BK-LOOP必要非充分，M4才填料。
