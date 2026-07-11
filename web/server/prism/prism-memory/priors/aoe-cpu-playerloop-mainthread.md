---
id: aoe-cpu-playerloop-mainthread
category: priors
createdAt: 2026-07-11T06:29:27.224Z
source: aoe-cpu
title: "MainThread 中的 PlayerLoop 是游戏主循环，网络消息收发是常见压测热点"
tags: ["PlayerLoop","主循环","网络"]
---

AOEYZ 项目中，MainThread 的 PlayerLoop 是游戏主循环。压测时常见的性能热点包括网络消息收发。