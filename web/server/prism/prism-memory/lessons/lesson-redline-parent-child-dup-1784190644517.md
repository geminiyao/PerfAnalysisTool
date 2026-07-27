---
id: lesson-redline-parent-child-dup-1784190644517
category: lessons
createdAt: 2026-07-16T08:30:44.598Z
source: manual-sediment/2026-07-16-wt030-035-review
title: "redline-parent-child-dup: 红线清单父子节点同时列（Core.Update + CS:AOE.LuaMgr + CS:AOE.Outside.MapManager）"
dataSource: cross-source
---

runId=bk26b-perfetto-triad/2026-07-16_wt030-035 的 redlineMatrix 父子节点同时出现：Core.Update（父）+ CS:AOE.LuaMgr（子）+ CS:AOE.Outside.MapManager（子）+ OutSideViewArmyLineMgr（孙）+ BattleHeadMgr（孙）都列了。违反 DR-41 规则 2 子树归并——同一开销被计算两次，读者困惑"到底谁是大头"。修法：如果父模块下的子节点都比较平均（没有绝对大头）→ 统筹在父模块，hotspot 列列前 2 个子节点；如果父模块下有明显大头子节点 → 拆分出大头子节点，不列父模块。不许父子都列。narrative-prompt 已加子树归并原则引导，v2 的 redlineMatrix 已修好（只有 5 行无父子重复）。