---
id: unity-cpu-aoe-issue-battleheadmgr-lowend
category: priors
createdAt: 2026-07-11T06:26:04.547Z
source: unity-cpu
title: "AOE 已知问题：BattleHeadMgr 低端机暴增"
tags: ["aoe","已知问题","battleheadmgr","低端机","meshui"]
---

**触发场景**：战斗压测。
**现象**：PC 0.32ms -> 二档机 2.91ms。
**根因**：MeshUI 头像渲染 + 跨语言调用。
**状态**：优化中。