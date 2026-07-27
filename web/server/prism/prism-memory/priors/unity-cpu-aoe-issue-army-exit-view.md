---
id: unity-cpu-aoe-issue-army-exit-view
category: priors
createdAt: 2026-07-11T06:26:04.575Z
source: unity-cpu
title: "AOE 已知问题：行军移出视野卡顿"
tags: ["aoe","已知问题","行军","视野"]
dataSource: unity
---

**触发场景**：滑动视野。
**现象**：部队移出时 spike。
**根因**：部队延迟销毁 + MapEntity 销毁。
**状态**：优化中。