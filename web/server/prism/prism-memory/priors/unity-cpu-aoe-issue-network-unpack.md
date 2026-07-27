---
id: unity-cpu-aoe-issue-network-unpack
category: priors
createdAt: 2026-07-11T06:26:04.561Z
source: unity-cpu
title: "AOE 已知问题：网络解包高耗时"
tags: ["aoe","已知问题","网络","protobuf"]
dataSource: unity
---

**触发场景**：大规模战斗。
**现象**：网络解包 1.66ms。
**根因**：protobuf 解包 + 对象创建。
**状态**：待解包池方案。