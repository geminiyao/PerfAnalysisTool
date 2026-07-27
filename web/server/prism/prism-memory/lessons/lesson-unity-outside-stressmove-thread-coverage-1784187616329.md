---
id: lesson-unity-outside-stressmove-thread-coverage-1784187616329
category: lessons
createdAt: 2026-07-16T07:40:16.329Z
source: narrative-redteam/unity-outside-stressmove
title: "thread-coverage: v5.3 §3 多线程宏观 7 类线程"
dataSource: unity
---

runId=unity-outside-stressmove 的 narrative threadOverview 只覆盖 2 个线程（< 5，v5.3 标杆有 7 类：UnityMain/Render/RHI/LuaMtGC/ECSWorker/Audio/Choreographer）。修法：explore 阶段对 topN 榜里每个识别线程类型单独 querySchedState 查三态，narrative 的 threadOverview 必须覆盖 findings 里所有识别线程。