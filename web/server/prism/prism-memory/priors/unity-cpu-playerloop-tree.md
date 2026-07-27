---
id: unity-cpu-playerloop-tree
category: priors
createdAt: 2026-07-11T06:26:04.184Z
source: unity-cpu
title: "Unity 主线程 PlayerLoop 标准调用树与各阶段职责"
tags: ["unity","playerloop","调用树","帧生命周期"]
dataSource: unity
---

Unity 主线程每帧按顺序执行 PlayerLoop，标准调用树如下：

```
PlayerLoop (帧总耗时)
  Initialization (初始化)
  EarlyUpdate (早期更新)
  FixedUpdate (物理帧, 默认 50Hz, 每帧可能执行 0~N 次)
    Physics.Simulate
      Physics.SyncColliderTransform
      Physics.Broadphase
      Physics.Narrowphase
    Physics.UpdateBodies
  Update (逻辑帧)
    ScriptRunBehaviourUpdate (所有 MonoBehaviour.Update() 的总和)
    ScriptRunDelayedDynamicFrameRate
  PreLateUpdate
    AI.NavMeshUpdate
    Director.Update (Timeline, Animator)
    ParticleSystem.Update
  PostLateUpdate
    UpdateAllRenderers
    PlayerSendFrameComplete
    FinishFrameRendering
  Rendering
    Camera.Render -> Drawing -> Batching
    Gfx.WaitForPresent (CPU 等待 GPU 完成)
```