---
id: unity-cpu-aoe-issue-soldier-vt-crash
category: priors
createdAt: 2026-07-11T06:26:04.814Z
source: unity-cpu
title: "AOE 已知问题：士兵 VT Crash"
tags: ["aoe","已知问题","vt","crash","攻城"]
dataSource: unity
---

**触发场景**：攻城战。
**现象**：必现 Crash。
**根因**：VT 二级 Native 容器嵌套扩容。
**状态**：已修复（改一级平铺）。