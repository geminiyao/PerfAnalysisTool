---
id: lesson-bk26b-perfetto-triad-redline-parent-child-dup-1784204436496
category: lessons
createdAt: 2026-07-16T12:20:36.496Z
source: narrative-redteam/bk26b-perfetto-triad
title: "redline-parent-child-dup: DR-41 规则 2 子树归并（递归）+ v5.3 §5 红线清单"
dataSource: perfetto
---

runId=bk26b-perfetto-triad 的红线清单 visualAsset.table 父子节点同时出现：CS:AOE.LuaMgr → BattleHeadMgr.OnUpdate; CS:AOE.LuaMgr → MapSignificanceMgr.ProcessTasks。违反 DR-41 规则 2 子树归并——同一开销被计算两次。归并规则要递归应用每一层：Core.Update → LuaMgr（大头拆出）→ BattleHeadMgr/MapSignificanceMgr（LuaMgr 下子节点比较平均，统筹在 LuaMgr，hotspot 列子节点）。MapManager → OutSideViewArmyLineMgr（大头拆出，不列 MapManager）。修法：如果父模块下的子节点都比较平均 → 统筹在父模块，hotspot 列列前 2 个子节点；如果父模块下有明显大头子节点 → 拆分出大头子节点，不列父模块。递归应用——拆出来的大头子节点，如果它下面还有大头子节点，继续拆。