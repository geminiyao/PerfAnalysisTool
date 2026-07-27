---
id: unity-cpu-aoe-issue-attr-callback-spike
category: priors
createdAt: 2026-07-11T06:26:04.606Z
source: unity-cpu
title: "AOE 已知问题：属性系统回调 spike"
tags: ["aoe","已知问题","属性系统","回调"]
dataSource: unity
---

**触发场景**：非必现。
**现象**：单帧高耗时。
**根因**：PlayerBaseInfoMgr 属性回调风暴。
**状态**：偶发。