# 性能数据 AI 分析设计文档

## 0. 整体开发流程节点图

> 最后更新: 2026-04-22

```
==============================================================================
                        PerfAnalysisTool 开发路线图
==============================================================================

Phase 1: 确定性分析引擎                          Phase 2: AI 分析流水线
(脚本层 -- 不依赖 LLM)                           (AI 层 -- 依赖 LLM)
-------------------------------------            ------------------------------------
[v] 1.1 pdata 解析                               [v] 2.1 基础 Prompt 构建
     binary-reader / pdata-parser                      帧摘要+Top10+线程
                                                  
[v] 1.2 统计分析引擎                              [v] 2.2 Agent SDK 集成
     profile-analyzer (帧/Marker/线程统计)              流式输出+abort+配置
                                                  
[v] 1.3 调用树重建 + 热路径                       [ ] 2.3 Prompt 增强 (Phase 1.5)  <-- [当前]
     call-tree (buildCallTree/findHotPath)             整合 call-tree/hotPath/spike
                                                  
[v] 1.4 Spike 检测                               [ ] 2.4 追问动态上下文 (方案 B)   <-- [当前]
     spike-detector (IQR+2x阈值)                      关键词提取+Marker搜索+动态构建
                                                  
[ ] 1.5 帧分类器                                  [v] 2.5 Unity CPU 知识库注入
     frame-classifier                                  unity-cpu-knowledge.md (已完成)
                                                  
                                                  [ ] 2.6 安全护栏 + 兜底输出
                                                       AI失败时确定性报告
                                                  
                                                  [ ] 2.7 场景路由
                                                       analysis-router (7类模板)
                                                  
                                                  [ ] 2.8 报告结构化
                                                       report-builder (标准Markdown)


Phase 3: Multi-Agent 调度                        Phase 4: 代码关联 + 经验沉淀
(进阶 -- Agent 协作)                              (远期 -- 深度集成)
-------------------------------------            ------------------------------------
[ ] 3.1 三角色拆分                                [ ] 4.1 Marker -> 代码映射
     调度/分析/报告 Agent                               Unity marker -> 源文件
                                                  
[ ] 3.2 分析模板                                  [ ] 4.2 Agent 工具调用 (Tool Use)
     7类场景模板                                        AI 主动搜索/读取代码
                                                  
[ ] 3.3 多轮对话                                  [ ] 4.3 版本 Diff
     短期记忆+上下文压缩                                两份 pdata 对比
                                                  
[ ] 3.4 安全护栏                                  [ ] 4.4 经验沉淀
     超时/循环/兜底/校验                                 结论归档+项目特征学习


==============================================================================
图例:  [v] = 已完成    [~] = 框架完成,待细化    [ ] = 未开始    <-- [当前] = 当前工作节点
==============================================================================

当前进度: Phase 1 基本完成(缺 1.5 帧分类器)
         Phase 2 已完成基础版(2.1 + 2.2)
         --> 正在推进 2.3(Prompt增强) + 2.4(追问动态上下文)
```

---

## 1. 目标

利用 AI 对 Unity Profiler 数据进行深度分析，自动识别性能瓶颈，给出优化建议。核心挑战是**如何从海量性能数据中提取最有价值的信息喂给 AI**。

---

## 2. 借鉴：NexRay AI 内存分析的关键设计

> 参考 NexRay Agent (AI 内存分析工具) 的 Harness Engineering 方法论，以下设计已验证有效。

### 2.1 三角色 Multi-Agent 协作（核心借鉴）

NexRay 用三个专业角色，**权限从代码层面强制隔离**（不是靠 Prompt）：

| 角色 | 职责 | 权限边界 |
|------|------|----------|
| 调度专家 | 理解问题 -> 决定策略 -> 编排流程 | 只能调度，不能直接操作分析工具 |
| 领域专家 | 数据分析、异常定位 | 只能读数据，不能写报告 |
| 报告专家 | 结构化输出 | 只能写报告，不能调用分析工具 |

**CPU 分析对应设计**：

| 角色 | 我们的实现 | 职责 |
|------|-----------|------|
| **调度 Agent** | `DispatchAgent` | 理解用户问题，路由到对应分析模板，编排多步分析 |
| **CPU 分析 Agent** | `CpuAnalysisAgent` | 调用链重建、热路径提取、Spike 检测、帧分类 |
| **报告 Agent** | `ReportAgent` | 生成结构化 Markdown 报告、风险分级、优化建议排序 |

### 2.2 两步法：确定性脚本 + AI 推理（核心借鉴）

NexRay 的核心方法论：

```
Step 1（确定性脚本）：原始数据 -> 结构化摘要 + 关键比率 + 异常标记
Step 2（AI 推理）：  结构化摘要 -> 深度分析 + 交叉验证 + 结论
```

**CPU 分析对应设计**：

| 步骤 | 实现 | 依赖 LLM? |
|------|------|-----------|
| Step 1a: 帧统计摘要 | `profile-analyzer.ts` (已有) | 否 |
| Step 1b: 调用链重建 | `call-tree.ts` (新增) | 否 |
| Step 1c: 热路径提取 | `findHotPath()` (新增) | 否 |
| Step 1d: Spike 检测 | `detectSpikes()` (新增) | 否 |
| Step 1e: 帧分类标记 | `classifyFrames()` (新增) | 否 |
| Step 2: AI 深度分析 | `prompt-builder.ts` -> Agent SDK | 是 |

关键原则：**Step 1 的输出是确定性的，不依赖 LLM，保证数据准确。AI 只负责基于结构化数据做推理判断。**

### 2.3 领域知识编码（借鉴 Skill 机制）

NexRay 将 iOS 内存模型知识**系统性编码到 Agent 行为模式中**，不是临时 Prompt 注入。

**CPU 分析对应设计**：

建立 Unity CPU 性能知识库（编码为 Skill 或 System Prompt 的一部分）：

```markdown
# Unity CPU 性能知识库

## PlayerLoop 调用树标准结构
- PlayerLoop（帧总耗时）
  - Initialization（初始化阶段）
  - EarlyUpdate（早期更新）
  - FixedUpdate（物理帧，默认 50Hz）
  - Update（逻辑帧）
    - ScriptRunBehaviourUpdate（所有 MonoBehaviour.Update）
    - ScriptRunDelayedDynamicFrameRate
  - PreLateUpdate
    - AI.NavMeshUpdate
    - Director.Update（Timeline/Animator）
  - PostLateUpdate
    - UpdateAllRenderers
    - PlayerSendFrameComplete
  - Rendering
    - Camera.Render -> Drawing -> Batching
    - Gfx.WaitForPresent（GPU 等待）

## 常见性能问题模式
| 模式 | 特征 | 根因 |
|------|------|------|
| GPU Bound | Gfx.WaitForPresent 占比 > 40% | DrawCall过多/Shader复杂/分辨率高 |
| Physics Heavy | FixedUpdate > 8ms | Collider过多/FixedTimestep过小 |
| Script Heavy | ScriptRunBehaviourUpdate > 5ms | Lua/C# Update逻辑过重 |
| GC Spike | GC.Collect 出现在 spike 帧 | 大量临时对象分配 |
| Loading Spike | 单帧 > 100ms + Resources.Load | 同步加载资源 |
| Animation Heavy | Director.Update > 3ms | Animator过多/状态机复杂 |

## xLua 特殊分析
- xlua.access / xlua.call -> xLua 桥接开销
- LuaEnv.Tick -> Lua GC
- ScriptRunBehaviourUpdate 高 -> 检查 xLua 层
- Profiler.BeginSample("xxx") -> 项目自定义 Marker

## 帧预算参考
| 目标 FPS | 帧预算 (ms) | Main Thread | Render Thread |
|---------|------------|-------------|---------------|
| 60 FPS  | 16.67ms    | < 12ms      | < 14ms        |
| 30 FPS  | 33.33ms    | < 28ms      | < 30ms        |
```

### 2.4 场景路由 + 分析模板（借鉴 Quick Analysis）

NexRay 根据输入特征自动匹配分析模板。CPU 分析同理：

| 输入特征 | 匹配场景 | 分析策略 |
|---------|---------|---------|
| 全量数据，无特定问题 | **全量概览** | 帧摘要 + Top Markers + 热路径 + Spike 检测 |
| 选中帧范围 | **范围聚焦** | 该范围内的调用树 + 与全量对比 |
| 选中单帧 | **单帧深入** | 完整调用树 + 逐层耗时百分比 |
| 选中 Marker | **Marker 专项** | 调用链上下文 + 时间线模式 + 代码关联 |
| 含 "卡顿/spike" 关键词 | **卡顿分析** | 异常帧识别 + worst frame 调用树 |
| 含 "GC/内存" 关键词 | **GC 专项** | GC.Collect/GC.Alloc 帧分析 |
| 含 "渲染/DrawCall" 关键词 | **渲染专项** | Camera.Render 子树 + GPU 等待 |
| 两份 pdata 文件 | **版本对比** | Marker 级别 Diff |

### 2.5 报告结构标准化（借鉴 NexRay 报告格式）

NexRay 的报告分层：Summary -> 构成 -> 分区 -> 堆栈 -> 风险 -> 建议

**CPU 分析报告结构**：

```markdown
# Performance Analysis Report

## Executive Summary
一句话结论 + 3 个关键指标
例: "Main Thread 平均 18.2ms (55 FPS)，超出 16.67ms 预算。
主要瓶颈：Physics.Simulate (4.2ms, 23%) 和 ScriptRunBehaviourUpdate (3.8ms, 21%)。
检测到 12 个异常帧 (spike > 30ms)。"

## 1. 帧耗时概览
- 帧率分布图/统计
- 帧预算达标率

## 2. 热路径分析（最耗时帧）
- 完整调用树（Top 3 worst frames）
- 瓶颈标记

## 3. Top Markers 排行
- 按 median self time 排序
- 包含 spike 检测结果

## 4. 异常帧分析
- Spike 帧列表 + 原因分类（GC/加载/物理/渲染）
- 与正常帧的调用树对比

## 5. 线程分析
- Main Thread vs Render Thread vs Job Workers 负载分布
- 线程间等待关系

## 6. 风险评估与优化建议
- 🔴 Critical: 立即需要修复（如帧率 < 30 FPS）
- 🟡 Warning: 建议优化（如某 Marker spike > 5x median）
- 🟢 Info: 可选优化空间
- 每条建议精确到模块/函数级别，附预期收益
```

### 2.6 安全护栏（借鉴）

| 护栏 | CPU 分析实现 |
|------|-------------|
| **超时保护** | 单次 AI 分析 30s 上限，调用链重建 10s 上限 |
| **循环检测** | Agent 重复调用相同工具 3 次自动中止 |
| **报告兜底** | 即使 AI 失败，也输出 Step 1 的确定性分析结果 |
| **数值校验** | 热路径耗时百分比之和校验（应 <= 100%） |
| **Token 控制** | Prompt 严格控制在 4K tokens 内 |

### 2.7 经验沉淀（借鉴记忆机制）

| 记忆类型 | 实现 |
|---------|------|
| **短期记忆** | 当前会话的多轮对话上下文 |
| **长期记忆** | 每次分析结论归档，同一项目可参考历史 |
| **知识积累** | 从多次分析中提取"项目性能特征"（如哪些 Marker 是常见热点） |

---

## 3. 可用数据分析

### 3.1 pdata 中包含的原始数据

| 数据 | 字段 | 分析价值 |
|------|------|----------|
| 每帧总耗时 | `frame.msFrame` | 对应 PlayerLoop 总耗时，识别卡顿帧 |
| 每个 Marker 耗时 | `marker.msMarkerTotal` | 知道每个函数每帧耗了多少 |
| 调用深度 | `marker.depth` | **可重建调用栈树** |
| 子 Marker 耗时 | `marker.msChildren` | Self 时间 = total - children |
| 线程归属 | `thread.threadIndex` | 区分 Main Thread / Job Worker |
| Marker 时序 | markers 数组顺序 | 同帧同线程内按深度优先遍历序排列 |

### 3.2 已有的统计分析（profile-analyzer.ts）

- 帧摘要：min/max/mean/median/分位数
- 每个 Marker 的聚合统计：median/mean/min/max/出现帧数/调用次数
- 每个线程的帧耗时统计
- 每个 Marker 的每帧耗时明细 (`frames[]`)

### 3.3 当前缺失的能力（需要新增）

| 能力 | 说明 | 优先级 |
|------|------|--------|
| **调用链重建** | 从 depth 序列重建调用栈树 | P0 - 核心 |
| **热路径分析** | 自动找出最耗时的调用链路径 | P0 - 核心 |
| **Spike 检测** | 某 Marker 在特定帧突然飙升 | P0 - 核心 |
| **帧分类** | 按耗时模式分类帧（正常/GC/加载/战斗等） | P1 |
| **调用链上下文** | 选中 Marker 时，展示它在调用树中的位置 | P1 |
| **版本 Diff** | 两份 pdata 的 Marker 级别对比 | P2 |

---

## 4. 调用链重建算法

### 4.1 原理

pdata 中 markers 按**深度优先遍历顺序**存储。利用 depth 递增/递减关系可重建完整调用栈树：

```
输入（同一帧同一线程的 markers 序列）：
  depth=1  PlayerLoop         15.2ms
  depth=2  Update              8.3ms
  depth=3  ScriptRunBehav      7.1ms
  depth=4  MyScript.Update     5.2ms
  depth=3  Physics.Process     0.8ms
  depth=2  PreLateUpdate       3.1ms
  depth=3  AnimatorUpdate      2.5ms

输出（调用栈树）：
  PlayerLoop (15.2ms, self=3.8ms)
  +-- Update (8.3ms, self=0.4ms)
  |   +-- ScriptRunBehav (7.1ms, self=1.1ms)
  |   |   +-- MyScript.Update (5.2ms, self=5.2ms)  <-- 叶子节点
  |   +-- Physics.Process (0.8ms, self=0.8ms)
  +-- PreLateUpdate (3.1ms, self=0.6ms)
      +-- AnimatorUpdate (2.5ms, self=2.5ms)
```

### 4.2 算法伪代码

```typescript
interface CallTreeNode {
  name: string
  depth: number
  msTotal: number
  msSelf: number
  percentOfFrame: number    // 占帧总耗时百分比
  children: CallTreeNode[]
  parent: CallTreeNode | null
}

function buildCallTree(markers: ProfileMarker[], markerNames: string[], msFrame: number): CallTreeNode {
  const root: CallTreeNode = { name: 'Root', depth: 0, msTotal: msFrame, msSelf: 0, percentOfFrame: 100, children: [], parent: null }
  const stack: CallTreeNode[] = [root]

  for (const marker of markers) {
    const node: CallTreeNode = {
      name: markerNames[marker.nameIndex],
      depth: marker.depth,
      msTotal: marker.msMarkerTotal,
      msSelf: marker.msMarkerTotal,
      percentOfFrame: (marker.msMarkerTotal / msFrame) * 100,
      children: [],
      parent: null
    }

    while (stack.length > marker.depth) {
      stack.pop()
    }

    const parent = stack[stack.length - 1]
    parent.children.push(node)
    parent.msSelf -= marker.msMarkerTotal
    node.parent = parent
    stack.push(node)
  }

  return root
}
```

### 4.3 热路径提取

```typescript
function findHotPath(root: CallTreeNode): CallTreeNode[] {
  const path: CallTreeNode[] = []
  let current = root
  while (current.children.length > 0) {
    const hottest = current.children.reduce((a, b) => a.msTotal > b.msTotal ? a : b)
    path.push(hottest)
    current = hottest
  }
  return path
}
```

### 4.4 调用树文本化（喂给 AI）

```typescript
function formatCallTree(node: CallTreeNode, indent: number = 0, minMs: number = 0.5): string {
  if (node.msTotal < minMs) return ''
  const prefix = '  '.repeat(indent)
  const selfStr = node.msSelf > 0.1 ? ` (self=${node.msSelf.toFixed(1)}ms)` : ''
  let line = `${prefix}${node.name}: ${node.msTotal.toFixed(1)}ms (${node.percentOfFrame.toFixed(1)}%)${selfStr}\n`
  for (const child of node.children.sort((a, b) => b.msTotal - a.msTotal)) {
    line += formatCallTree(child, indent + 1, minMs)
  }
  return line
}
```

---

## 5. AI Prompt 分层策略

### 5.1 核心原则（借鉴 NexRay 两步法）

```
确定性脚本输出（Step 1）          AI 推理输入（Step 2）
========================          ========================
帧统计摘要 ─────────────────────> 性能等级判断
调用链重建 ─────────────────────> 瓶颈定位推理
热路径提取 ─────────────────────> 优化方向建议
Spike 检测 + 异常标记 ──────────> 根因分析
帧分类标签 ─────────────────────> 场景关联分析
```

**不发原始数据，只发结构化摘要 + 异常特征 + 关键调用链。**

### 5.2 分层 Prompt

#### Layer 1: 全量概览分析（默认）

```
## Performance Overview
Frames: 600, Mean: 18.2ms (55 FPS), Median: 16.7ms
Budget: 16.67ms (60 FPS), Over-budget rate: 62%
Worst frame: #342 (45.3ms), Best frame: #12 (8.1ms)

## Hot Path (worst frame #342, Main Thread)
PlayerLoop (45.3ms, 100%)
  FixedUpdate (22.1ms, 48.8%)
    Physics.Simulate (18.3ms, 40.4%)  <-- BOTTLENECK
      Physics.SyncColliderTransform (15.2ms, 33.6%)
  Update (12.8ms, 28.3%)
    ScriptRunBehaviourUpdate (11.2ms, 24.7%)

## Top 10 Markers (by median self-time, Main Thread)
1. Physics.SyncColliderTransform: median=2.8ms, mean=3.2ms, max=15.2ms, spike_frames=5
2. ScriptRunBehaviourUpdate: median=2.1ms, mean=2.5ms, max=11.2ms
...

## Detected Spikes (> 3x median)
- Frame #342: Physics.Simulate 18.3ms (median=3.2ms, 5.7x) -- correlates with battle spawn
- Frame #289: GC.Collect 8.5ms -- GC spike

## Frame Classification
- Normal (< 20ms): 380 frames (63%)
- Warning (20-33ms): 150 frames (25%)
- Critical (> 33ms): 70 frames (12%)
- GC frames: 23 frames
```

#### Layer 2: 选中 Marker 深入分析

```
## Selected Marker: "Physics.Simulate"
Stats: median=3.2ms, mean=4.1ms, max=18.3ms, present=598/600 frames
Thread: Main Thread, Depth: 2-3

## Call Context (worst frame #342)
FixedUpdate -> Physics.Simulate (18.3ms)
  Children:
    Physics.SyncColliderTransform: 15.2ms (83%) <-- dominant child
    Physics.Broadphase: 2.1ms (11%)
    Physics.Narrowphase: 1.0ms (5%)

## Timeline Pattern
- Frame 1-280: stable 2.5-3.5ms
- Frame 281-350: spike to 8-18ms (battle scene)
- Frame 351-600: returns to 3-4ms

## Cross-validation
- Physics spike correlates with frame time spike (r=0.94)
- No GC correlation (r=0.12)
```

#### Layer 3: 结合代码分析（Agent 工具调用）

```
## Code Search Hints
Based on Physics.SyncColliderTransform bottleneck:
- Search for: AddComponent<Collider>, Collider.enabled, Physics.OverlapSphere
- Related systems: DOTS ArmyEntity, BattleManager
- Lua: search for physics-related calls in Outside/Army/

Agent can use tools to:
1. search_code("Collider", "Assets/Scripts/CS/Battle/")
2. read_file("Assets/Scripts/CS/DOTS/DotsArmy/ArmyEntityConst.cs")
```

### 5.3 Prompt Token 控制

| 场景 | 内容 | 预计 tokens |
|------|------|-------------|
| 全量概览 | 帧摘要 + Top 10 + 热路径 + Spike + 帧分类 | ~800 |
| Marker 深入 | + 调用上下文 + 时间线模式 + 交叉验证 | ~1200 |
| 结合代码 | + 代码搜索提示 + 文件路径 | ~1500 |
| 知识库 (System Prompt) | Unity CPU 性能知识 | ~1000 |
| **总计上限** | | **< 4000** |

---

## 6. Spike 检测算法

```typescript
interface SpikeInfo {
  frameIndex: number
  ms: number
  ratio: number           // 相对于 median 的倍数
  category: 'gc' | 'physics' | 'rendering' | 'script' | 'loading' | 'unknown'
}

function detectSpikes(marker: MarkerDataResult): SpikeInfo[] {
  const threshold = marker.msMedian + 3 * (marker.msUpperQuartile - marker.msLowerQuartile)
  const spikes: SpikeInfo[] = []

  for (const frame of marker.frames) {
    if (frame.ms > threshold && frame.ms > marker.msMedian * 2) {
      spikes.push({
        frameIndex: frame.frameIndex,
        ms: frame.ms,
        ratio: frame.ms / marker.msMedian,
        category: categorizeSpike(marker.name, frame)
      })
    }
  }

  return spikes.sort((a, b) => b.ms - a.ms).slice(0, 10)
}

function categorizeSpike(markerName: string, frame: FrameTime): SpikeInfo['category'] {
  if (markerName.includes('GC')) return 'gc'
  if (markerName.includes('Physics')) return 'physics'
  if (markerName.includes('Camera') || markerName.includes('Render')) return 'rendering'
  if (markerName.includes('Script') || markerName.includes('Lua')) return 'script'
  if (markerName.includes('Load') || markerName.includes('Resource')) return 'loading'
  return 'unknown'
}
```

---

## 7. 帧分类算法

```typescript
type FrameCategory = 'normal' | 'warning' | 'critical' | 'gc_spike' | 'loading' | 'gpu_bound'

function classifyFrame(frameIndex: number, msFrame: number, callTree: CallTreeNode, budget: number = 16.67): FrameCategory {
  // Check for GC
  const gcNode = findMarkerInTree(callTree, 'GC.Collect')
  if (gcNode && gcNode.msTotal > 2) return 'gc_spike'

  // Check for loading
  const loadNode = findMarkerInTree(callTree, 'Loading')
  if (loadNode && loadNode.msTotal > budget * 0.5) return 'loading'

  // Check for GPU bound
  const gpuWait = findMarkerInTree(callTree, 'Gfx.WaitForPresent')
  if (gpuWait && gpuWait.msTotal > msFrame * 0.4) return 'gpu_bound'

  // Frame time thresholds
  if (msFrame > budget * 2) return 'critical'
  if (msFrame > budget * 1.2) return 'warning'
  return 'normal'
}
```

---

## 8. 实现路线图

### Phase 1: 确定性分析引擎 (P0) -- 对应 NexRay Step 1

| 任务 | 文件 | 说明 | 状态 |
|------|------|------|------|
| `buildCallTree()` | `src/main/profiler/call-tree.ts` | 从 markers 重建调用栈树 | **已完成** |
| `findHotPath()` | 同上 | 从树中提取最热路径 | **已完成** |
| `formatCallTree()` | 同上 (`treeToFlatRows()`) | 调用树文本化（供 AI 消费） | **已完成** |
| `getCallContext()` | 同上 (`getFrameCallTree()`) | 获取指定 Marker 在调用树中的上下文 | **已完成** |
| `detectSpikes()` | `src/main/profiler/spike-detector.ts` | 异常帧检测 + 分类 | **已完成** |
| `classifyFrames()` | `src/main/profiler/frame-classifier.ts` | 帧分类标签 | 未开始 |
| IPC: `profiler:getCallTree` | `ipc-handlers.ts` | 前端可请求指定帧的调用树 | **已完成** |
| IPC: `profiler:getSpikes` | `ipc-handlers.ts` | 前端可请求 spike 检测结果 | **已完成** |

### Phase 2: AI 分析流水线 (P0) -- 对应 NexRay Step 2

| 任务 | 文件 | 说明 | 状态 |
|------|------|------|------|
| Prompt 基础构建 | `src/main/ai/prompt-builder.ts` | 帧摘要 + Top10 Markers + 内联 Spike + 线程信息 | **已完成(基础版)** |
| Agent SDK 集成 | `src/main/ai/agent-service.ts` | 流式输出 + abort + 配置管理 | **已完成** |
| Prompt 增强 | `prompt-builder.ts` | 整合 call-tree/hotPath/spike-detector 深度数据到 prompt | 未开始 |
| 场景路由 | `analysis-router.ts` | 根据输入特征自动选择分析模板 | 未开始 |
| 报告结构化 | `report-builder.ts` | 标准化报告生成（Markdown） | 未开始 |
| 知识库注入 | `unity-cpu-knowledge.md` | Unity CPU 性能知识 System Prompt | 未开始 |
| 安全护栏 + 兜底 | - | AI 失败时用确定性结果生成报告 | 未开始 |

### Phase 3: Multi-Agent 调度 (P1) -- 全部未开始

| 任务 | 说明 | 状态 |
|------|------|------|
| Agent 角色定义 | 调度/分析/报告三角色，代码级权限隔离 | 未开始 |
| 分析模板 | 全量/范围/单帧/Marker/卡顿/GC/渲染 七类模板 | 未开始 |
| 多轮对话 | 短期记忆 + 上下文压缩 | 未开始 |
| 安全护栏 | 超时/循环检测/兜底报告/数值校验 | 未开始 |

### Phase 4: 代码关联 + 经验沉淀 (P2) -- 全部未开始

| 任务 | 说明 | 状态 |
|------|------|------|
| Marker -> 代码映射 | Unity marker 名到源文件的映射规则 | 未开始 |
| Agent 工具调用 | 让 AI 主动搜索/读取代码 | 未开始 |
| 版本 Diff | 两份 pdata 的 Marker 级别对比 | 未开始 |
| 经验沉淀 | 分析结论归档 + 项目特征学习 | 未开始 |
| Skill 提取 | 从成功分析中提取可复用分析模板 | 未开始 |

---

## 9. Marker 名称 -> 代码映射规则

| Marker 模式 | 代码来源 | 映射方法 |
|-------------|----------|----------|
| `ClassName.MethodName` | C# MonoBehaviour | 直接搜索 `ClassName` 类的 `MethodName` 方法 |
| `ScriptRunBehaviourUpdate` | 所有 MonoBehaviour.Update() 的总和 | 看子 Marker |
| `Camera.Render` | Unity 内部渲染 | 看子 Marker 定位具体 pass |
| `Physics.Simulate` | Unity 物理引擎 | 关注 collider 数量和配置 |
| `GC.Alloc` / `GC.Collect` | 内存分配/回收 | 看父 Marker 定位分配来源 |
| `Lua:funcName` | xLua 调用 | 搜索 Lua 文件中的函数名 |
| `DOTS.*` | ECS 系统 | 搜索对应的 System 类 |
| `xlua.access` / `xlua.call` | xLua 桥接 | C#<->Lua 交互开销 |
| `LuaEnv.Tick` | Lua GC | xLua 垃圾回收 |

---

## 10. AI 交互设计

### 10.1 自动分析流程（借鉴 NexRay 多 Agent 流水线）

```
用户点击 [AI Analyze]
    |
    v
[调度 Agent] 分析当前上下文
    |-- 有 selectedMarker? -> Marker 专项模板
    |-- 有 selectedFrameRange? -> 范围聚焦模板
    |-- 用户输入含关键词? -> 匹配对应模板
    |-- 否则 -> 全量概览模板
    |
    v
[CPU 分析 Agent] 执行确定性分析（Step 1）
    |-- buildCallTree (worst frames)
    |-- findHotPath
    |-- detectSpikes
    |-- classifyFrames
    |
    v
[CPU 分析 Agent] AI 推理（Step 2）
    |-- 基于 Step 1 结构化数据做深度分析
    |
    v
[报告 Agent] 生成结构化报告
    |-- Executive Summary
    |-- 分层展开
    |-- 风险评估 + 优化建议
    |
    v
流式输出到 AI 侧边栏
```

### 10.2 截图参考（NexRay 报告格式）

从 NexRay 的分析截图可以看到报告是分阶段输出的：

1. **启动初始化** -- 显示分析计划和工具调用序列
2. **宏观构成** -- Executive Summary + 关键指标
3. **关键调用堆栈** -- 完整调用链 + 耗时百分比 + 异常标记
4. **优化建议** -- 分级建议（Critical/Warning/Info）+ 预期收益

CPU 分析报告也应遵循这个**渐进式输出**模式，让用户在分析过程中就能看到中间结果。

### 10.3 多轮对话

支持追问：
- "展开 Camera.Render 的完整调用树"
- "frame 342 为什么这么慢？"
- "哪些代码可能导致 Physics.Simulate 耗时高？"
- "对比前 300 帧和后 300 帧的性能差异"

追问时携带之前的分析结论 + 当前选中上下文（短期记忆）。

---

## 11. Phase 1.5 增强 Prompt 样例

> 以下是 Phase 1.5 完成后，prompt-builder 实际喂给 AI Agent 的完整 prompt 样例。

### 11.1 数据流

```
用户加载 .pdata
    |
    v
ipc-handlers.ts (已有 currentProfileData + currentAnalysis)
    |
    |-- getFrameCallTree(worst frame)  -> 调用树 + 热路径
    |-- getFrameCallTree(median frame) -> 调用树 + 热路径
    |-- detectAllSpikes(markers)       -> spike 详情列表
    |
    v  打包为 DeepAnalysisContext
    |
prompt-builder.ts: buildAnalysisPrompt(analysis, deepContext)
    |
    v  生成完整 prompt 文本
    |
agent-service.ts: 发送给 AI（system prompt 含 Unity 知识库）
```

### 11.2 DeepAnalysisContext 类型

```typescript
interface DeepAnalysisContext {
  // worst frame 调用树（文本化）
  worstFrameTree: string
  worstFrameHotPath: string
  worstFrameIndex: number
  worstFrameMs: number
  // median frame 调用树
  medianFrameTree: string
  medianFrameHotPath: string
  medianFrameIndex: number
  medianFrameMs: number
  // spike 详情（来自 spike-detector.ts）
  spikes: SpikeInfo[]
}
```

### 11.3 增强后的 User Prompt 样例

```markdown
Analyze this Unity Profiler data. Respond in Chinese, Markdown format.

## Frame Summary
- Frames: 600, FPS: 55.0, Mean: 18.20ms, Median: 16.70ms
- Range: 8.10ms ~ 45.30ms (worst: frame #342)
- Quartiles: Q1=14.20ms, Q3=21.30ms
- Spike threshold: 31.95ms, Spikes: 12/600 (2.0%)

## Top 10 Bottleneck Markers
1. `Physics.Simulate` median=3.20ms mean=4.10ms max=18.30ms count=598 depth=2 thread=Main
2. `ScriptRunBehaviourUpdate` median=2.10ms mean=2.50ms max=11.20ms count=600 depth=3 thread=Main
3. `Gfx.WaitForPresent` median=1.80ms mean=2.30ms max=8.50ms count=600 depth=2 thread=Main
4. `Camera.Render` median=1.50ms mean=1.80ms max=6.20ms count=600 depth=2 thread=Main
5. `UI.LayoutUpdate` median=0.90ms mean=1.20ms max=4.80ms count=580 depth=4 thread=Main
...

## Call Tree - Worst Frame #342 (45.30ms, Main Thread)
PlayerLoop: 45.3ms (100%)
  FixedUpdate: 22.1ms (48.8%) [self=0.2ms]
    Physics.Simulate: 18.3ms (40.4%) [self=3.1ms]
      Physics.SyncColliderTransform: 15.2ms (33.6%) [self=15.2ms]
    Physics.UpdateBodies: 3.6ms (7.9%) [self=3.6ms]
  Update: 12.8ms (28.3%) [self=0.3ms]
    ScriptRunBehaviourUpdate: 11.2ms (24.7%) [self=1.3ms]
      xlua.call: 8.5ms (18.8%) [self=8.5ms]
    ScriptRunDelayedDynamic: 1.3ms (2.9%) [self=1.3ms]
  PostLateUpdate: 8.2ms (18.1%) [self=0.5ms]
    PlayerSendFrameComplete: 4.1ms (9.1%) [self=4.1ms]
    UpdateAllRenderers: 3.6ms (7.9%) [self=3.6ms]

## Hot Path (Worst Frame)
PlayerLoop -> FixedUpdate -> Physics.Simulate -> Physics.SyncColliderTransform (15.2ms, 33.6%) **BOTTLENECK**

## Call Tree - Median Frame #285 (16.70ms, Main Thread)
PlayerLoop: 16.7ms (100%)
  Update: 6.8ms (40.7%) [self=0.2ms]
    ScriptRunBehaviourUpdate: 5.9ms (35.3%) [self=0.8ms]
      xlua.call: 4.2ms (25.1%) [self=4.2ms]
  PostLateUpdate: 5.1ms (30.5%) [self=0.4ms]
    UpdateAllRenderers: 2.8ms (16.8%) [self=2.8ms]
  FixedUpdate: 3.5ms (21.0%) [self=0.1ms]
    Physics.Simulate: 3.2ms (19.2%) [self=1.1ms]

## Hot Path (Median Frame)
PlayerLoop -> Update -> ScriptRunBehaviourUpdate -> xlua.call (4.2ms, 25.1%) **BOTTLENECK**

## Spike Analysis (top 10, sorted by severity)
- Frame #342: `Physics.Simulate` 18.30ms (median=3.20ms, 5.7x) [physics]
- Frame #289: `GC.Collect` 8.50ms (median=0.10ms, 85.0x) [gc]
- Frame #301: `ScriptRunBehaviourUpdate` 11.20ms (median=2.10ms, 5.3x) [script]
- Frame #155: `Resources.Load` 25.30ms (median=0.00ms, first seen) [loading]
- Frame #412: `Camera.Render` 6.20ms (median=1.50ms, 4.1x) [rendering]

## Active Threads
- 1:Main Thread: median=16.70ms max=45.30ms
- 2:Render Thread: median=8.20ms max=15.10ms
- 3:Job.Worker 0: median=2.10ms max=8.30ms

## Required Analysis
1. Compare worst frame vs median frame call trees, identify what caused the spike
2. Identify top 3 performance bottlenecks with root cause analysis
3. Analyze spike patterns and categorize by type (GC/physics/script/loading/rendering)
4. Provide 3-5 concrete Unity optimization suggestions with expected impact
```

### 11.4 System Prompt（Unity CPU 知识库摘要）

```
你是一个Unity游戏性能分析专家。基于以下知识进行分析：

[PlayerLoop 标准调用树结构]
[常见性能问题模式: GPU Bound / Physics Heavy / Script Heavy / GC Spike / Loading Spike]
[xLua 特殊分析: xlua.access / xlua.call / LuaEnv.Tick]
[帧预算参考: 60FPS=16.67ms, 30FPS=33.33ms]
[分析规则: 对比 worst 和 median 帧、关注 self time 占比、spike 倍数越大越严重]

请用中文回答，使用 Markdown 格式。聚焦瓶颈定位和可操作的优化建议。
```

### 11.5 兜底输出（AI 失败时）

当 AI Agent 调用失败（超时/502/其他错误）时，直接用确定性分析结果生成兜底报告：

```markdown
# 性能分析报告（自动生成）

> AI 分析服务暂时不可用，以下为确定性分析结果。

## 帧耗时概览
- 总帧数: 600, 平均: 18.20ms (55 FPS), 中位数: 16.70ms
- 最差帧: #342 (45.30ms), 最佳帧: #12 (8.10ms)

## 最耗时调用链（最差帧 #342）
PlayerLoop -> FixedUpdate -> Physics.Simulate -> Physics.SyncColliderTransform (15.2ms, 33.6%)

## Top 5 瓶颈 Markers
1. Physics.Simulate: median=3.20ms, max=18.30ms
2. ScriptRunBehaviourUpdate: median=2.10ms, max=11.20ms
...

## 检测到的异常帧
- Frame #342: Physics.Simulate 18.30ms (正常值 3.20ms, 偏离 5.7 倍) [物理]
- Frame #289: GC.Collect 8.50ms (正常值 0.10ms, 偏离 85.0 倍) [GC]
...
```

---

## 12. 实施进度跟踪

> 最后更新: 2026-04-22

### 11.1 已实现文件清单

#### 确定性分析引擎 (`src/main/profiler/`)

| 文件 | 大小 | 功能 |
|------|------|------|
| `types.ts` | 3.3 KB | 数据类型定义（镜像 Unity C# 数据结构） |
| `binary-reader.ts` | 2.5 KB | 二进制读取器（镜像 C# BinaryReader） |
| `pdata-parser.ts` | 5.5 KB | .pdata 文件解析（严格移植 ProfileData.cs） |
| `profile-analyzer.ts` | 16.4 KB | 统计分析引擎（移植 ProfileAnalyzer.cs） |
| `call-tree.ts` | 7.7 KB | 调用树重建 + 热路径提取 + 文本化输出 |
| `spike-detector.ts` | 3.1 KB | 异常帧检测（IQR + 2x median 阈值） |

#### AI 分析 (`src/main/ai/`)

| 文件 | 大小 | 功能 |
|------|------|------|
| `prompt-builder.ts` | 2.9 KB | 基础 Prompt 构建（帧摘要 + Top10 + 内联 Spike + 线程） |
| `agent-service.ts` | 9.8 KB | Agent SDK 集成（流式输出 + abort + 配置） |

#### IPC 通道 (`src/main/ipc-handlers.ts`, 213 行)

| Handler | 功能 |
|---------|------|
| `profiler:openFile` | 打开文件对话框 + 解析 |
| `profiler:loadFile` | 按路径加载 |
| `profiler:reanalyze` | 使用新选项重新分析 |
| `profiler:getCurrentAnalysis` | 获取当前分析结果 |
| `profiler:exportCsv` | 导出 CSV |
| `profiler:getCallTree` | 获取指定帧的调用树 + hotPath |
| `profiler:getSpikes` | 检测所有 Marker 的 spike |
| `ai:analyze` | AI 分析（流式） |
| `ai:abort` | 终止 AI 分析 |
| `ai:setConfig` / `ai:getConfig` | AI 配置管理 |

#### 前端 UI (`src/renderer/`)

| 模块 | 状态 |
|------|------|
| Profiler 主界面 (`ProfilerModule/index.tsx`) | 已完成 |
| 帧时间图 (`FrameTimeGraph.tsx`) | 已完成 |
| Marker 表格 (`MarkerTable.tsx`) | 已完成 |
| AI 分析面板 (`AiAnalysisPanel.tsx`) | 已完成（基础流式输出） |
| 帧摘要 / 线程摘要 / Top Markers / Marker 直方图 | 已完成 |

### 11.2 关键集成缺口

当前最大问题：**已实现的深度分析模块没有喂给 AI**。

| 已实现的模块 | 是否被 AI Prompt 使用 | 说明 |
|---|---|---|
| `call-tree.ts` - 调用树/热路径 | **未使用** | IPC handler 已注册，但 prompt-builder 未引用 |
| `spike-detector.ts` - Spike 检测 | **未使用** | prompt-builder 内联了简化版 spike 检测，未用 spike-detector 的完整结果 |
| `profile-analyzer.ts` - 帧统计 | **已使用** | prompt-builder 基于其输出构建摘要 |

### 11.3 尚未创建的文件

| 计划文件 | 所属 Phase | 优先级 |
|---------|-----------|--------|
| `src/main/profiler/frame-classifier.ts` | Phase 1 | P0 |
| `src/main/ai/unity-cpu-knowledge.md` | Phase 2 | P0 |
| `src/main/ai/analysis-router.ts` | Phase 2 | P1 |
| `src/main/ai/report-builder.ts` | Phase 2 | P1 |
| Multi-Agent 调度器 / 分析器 / 报告器 | Phase 3 | P1 |

### 11.4 待做事项（按优先级排序）

#### P0 -- Phase 1.5（效果最大，改动最小）

1. **prompt-builder 增强**：把 call-tree/hotPath/spike-detector 的深度结果整合进 AI Prompt
2. **Unity CPU 知识库**：创建 `unity-cpu-knowledge.md`，注入 System Prompt
3. **安全护栏 + 兜底输出**：AI 失败时用确定性分析结果生成兜底报告

#### P0 -- Phase 1 收尾

4. **frame-classifier.ts**：帧分类器（normal/warning/critical/gc_spike/loading/gpu_bound）

#### P1 -- Phase 2 完善

5. **场景路由** `analysis-router.ts`：根据上下文（全量/选中帧/选中 Marker/用户关键词）自动匹配分析模板
6. **报告结构化** `report-builder.ts`：标准化 Markdown 报告生成（Summary + 分层展开 + 风险评估）
7. **7 类分析模板**：全量概览/范围聚焦/单帧深入/Marker 专项/卡顿分析/GC 专项/渲染专项

#### P1 -- Phase 3 架构升级

8. **三角色拆分**：Dispatcher Agent / CPU Analysis Agent / Report Agent，代码级权限隔离
9. **多轮对话**：短期记忆 + 上下文压缩，支持追问

#### P2 -- Phase 4

10. **Marker -> 代码映射**：Unity marker 名到源文件的映射规则
11. **版本 Diff**：两份 pdata 的 Marker 级别对比
12. **经验沉淀**：分析结论归档 + 项目特征学习

### 11.5 阻塞项

- **Agent SDK 服务状态**：上次测试遇到 502 错误。确定性分析部分（Phase 1）不受影响，Phase 1.5 的 prompt 增强也可以先做好等 SDK 恢复后验证。

---

## 13. 方案 B：追问动态上下文构建

> 对应路线图节点 2.4，解决追问时 AI 缺失相关 Marker 上下文的问题。

### 13.1 问题描述

当用户追问 "分析下 LuaMgr 下有哪些热点方法" 时，AI 回复 "并未包含 LuaMgr 相关的调用栈信息"。

**根因**：追问走 `buildFollowUpPrompt()`，只带一行帧摘要 + worst frame 热路径文本，没有 LuaMgr 相关数据。即使走完整 prompt，调用树也只包含 worst/median 两帧且有 `maxDepth=6` + `minMs=0.5` 截断，LuaMgr 可能被过滤掉。

### 13.2 现有追问数据流（改前）

```
用户追问: "分析下LuaMgr的热点方法"
    |
    v
ipc-handlers.ts: prompt 非空 -> 走追问分支
    |
    v
agent-service.ts: buildFollowUpPrompt(userQuestion, analysis, deep)
    |
    v
prompt-builder.ts buildFollowUpPrompt():
    只输出:
    - "Context: 600 frames, 55 FPS avg, 18.20ms mean"
    - "Worst frame hot path: PlayerLoop -> FixedUpdate -> ..."
    - "Question: 分析下LuaMgr的热点方法"
    |
    v
AI: "数据中并未包含 LuaMgr 相关的调用栈信息"  <-- 无法回答
```

### 13.3 核心思路

追问时，根据用户问题**动态构建相关 Marker 的上下文数据**：

1. 从用户问题中提取关键词（如 "LuaMgr"）
2. 在 `currentAnalysis.markers` 中模糊搜索匹配的 marker
3. 取这些 marker 的统计数据（median/mean/max/count）
4. 找到这些 marker 最耗时的帧，构建该帧中目标 marker 的调用子树
5. 用 `findCallChain()` 找调用链上下文
6. 拼进追问 prompt

### 13.4 改后数据流

```
用户追问: "分析下LuaMgr的热点方法"
    |
    v
ipc-handlers.ts: prompt 非空 -> 走追问分支
    |
    +-- [新增] extractKeywords("分析下LuaMgr的热点方法")
    |   -> 提取: ["LuaMgr"]
    |
    +-- [新增] searchRelatedMarkers("LuaMgr", currentAnalysis.markers)
    |   -> 匹配: [LuaMgr.OnUpdate, LuaMgr.ProcessQueue, LuaMgr.TickTimers, ...]
    |
    +-- [新增] 取匹配 marker 的最耗时帧 maxFrameIndex
    |
    +-- [新增] getFrameCallTree(maxFrameIndex) + findCallChain("LuaMgr.*")
    |   -> 构建该帧中 LuaMgr 相关调用子树
    |
    v
agent-service.ts: buildFollowUpPrompt(userQuestion, analysis, deep, followUpContext)
    |
    v
prompt-builder.ts buildFollowUpPrompt():
    输出:
    - 帧摘要上下文
    - Worst frame hot path
    - [新增] Related Markers for "LuaMgr" (5 found, sorted by median ms)
    - [新增] Call Tree - LuaMgr Peak Frame #289
    - [新增] Call Chain for LuaMgr.OnUpdate
    - "Question: 分析下LuaMgr的热点方法"
    |
    v
AI: 能看到完整的 LuaMgr 子树，给出具体分析
```

### 13.5 改动文件清单

| 文件 | 改动内容 |
|------|---------|
| `src/main/ai/prompt-builder.ts` | `buildFollowUpPrompt()` 增加 `followUpContext` 参数，拼接动态 marker 上下文 |
| `src/main/ipc-handlers.ts` | 追问分支中提取关键词 + 搜索 marker + 构建动态上下文 |
| `src/main/profiler/call-tree.ts` | 新增 `getSubtreeForMarker()` 从调用树中截取目标 marker 的子树 |

### 13.6 关键函数设计

#### extractKeywords(question: string): string[]

从用户问题中提取可能的 Marker 关键词。策略：

```typescript
function extractKeywords(question: string): string[] {
  // 1. 按常见分隔符拆分: 空格/逗号/的/下/里/中
  // 2. 过滤掉常见中文虚词: 分析/帮我/下/有哪些/方法/函数/热点 等
  // 3. 保留看起来像 Marker 名的词: 含大写字母、含 . 的、含 _ 的
  // 4. 也保留完整的 "ClassName.MethodName" 形式
  // 例: "分析下LuaMgr下有哪些热点方法" -> ["LuaMgr"]
  // 例: "Physics.Simulate为什么这么慢" -> ["Physics.Simulate"]
  // 例: "Camera.Render和ScriptRunBehaviourUpdate对比" -> ["Camera.Render", "ScriptRunBehaviourUpdate"]
}
```

#### searchRelatedMarkers(keyword: string, markers: MarkerDataResult[]): MarkerDataResult[]

在已有 marker 统计列表中模糊匹配：

```typescript
function searchRelatedMarkers(keyword: string, markers: MarkerDataResult[]): MarkerDataResult[] {
  const lowerKw = keyword.toLowerCase()
  return markers
    .filter(m => m.name.toLowerCase().includes(lowerKw))
    .sort((a, b) => b.msMedian - a.msMedian)  // 按 median 耗时降序
    .slice(0, 20)  // 最多 20 个
}
```

#### getSubtreeForMarker(tree: CallTreeNode, markerName: string): CallTreeNode | null

从完整调用树中截取包含目标 marker 的子树（含其所有子节点）：

```typescript
function getSubtreeForMarker(node: CallTreeNode, keyword: string): CallTreeNode | null {
  if (node.name.toLowerCase().includes(keyword.toLowerCase())) {
    return node  // 返回整个子树（包含所有 children）
  }
  for (const child of node.children) {
    const found = getSubtreeForMarker(child, keyword)
    if (found) return found
  }
  return null
}
```

### 13.7 追问 Prompt 样例（改后）

```markdown
Context: Unity Profiler data with 600 frames, 55.0 FPS avg, 18.20ms mean frame time.
Worst frame hot path: PlayerLoop -> FixedUpdate -> Physics.Simulate -> ... **BOTTLENECK**

## Related Markers for "LuaMgr" (5 found, sorted by median ms)
1. `LuaMgr.OnUpdate` median=1.20ms mean=1.50ms max=8.30ms count=600 depth=4
2. `LuaMgr.ProcessQueue` median=0.80ms mean=0.95ms max=5.10ms count=598 depth=5
3. `LuaMgr.TickTimers` median=0.35ms mean=0.40ms max=2.80ms count=600 depth=5
4. `LuaMgr.GC` median=0.10ms mean=0.30ms max=4.50ms count=580 depth=5
5. `LuaMgr.CallbackDispatch` median=0.08ms mean=0.12ms max=1.20ms count=450 depth=5

## Call Tree - LuaMgr Peak Frame #289 (38.7ms)
PlayerLoop: 38.7ms (100%)
  Update: 18.5ms (47.8%)
    ScriptRunBehaviourUpdate: 16.2ms (41.9%)
      xlua.call: 14.8ms (38.2%)
        LuaMgr.OnUpdate: 8.30ms (21.4%) [self=0.5ms]
          LuaMgr.ProcessQueue: 5.10ms (13.2%) [self=5.10ms] **BOTTLENECK**
          LuaMgr.TickTimers: 2.80ms (7.2%) [self=2.80ms]
          LuaMgr.GC: 0.40ms (1.0%) [self=0.40ms]

## Call Chain for LuaMgr.OnUpdate (peak frame)
PlayerLoop -> Update -> ScriptRunBehaviourUpdate -> xlua.call -> LuaMgr.OnUpdate (8.30ms, 21.4%)

Question: 你能帮我分析下LuaMgr下有哪些热点方法吗？

Respond in Chinese with specific, actionable advice.
```

### 13.8 边界情况处理

| 情况 | 处理策略 |
|------|---------|
| 关键词提取为空 | 退回到原有的 `buildFollowUpPrompt()`，只带摘要 |
| 关键词匹配不到任何 marker | prompt 中说明 "未找到名为 xxx 的 Marker"，让 AI 给出替代建议 |
| 匹配到太多 marker (>20) | 只取 top 20（按 median 降序），并告知 AI 还有更多 |
| 目标 marker 在调用树中深度 >6 | 构建追问上下文时使用更大的 maxDepth（如 12）和更小的 minMs（如 0.1） |
| 多个关键词 | 分别搜索，合并结果，去重 |

### 13.9 与方案 A/C 的关系

| 方案 | 适用场景 | 当前状态 |
|------|---------|---------|
| A: 追问带完整 prompt | 追问涉及 worst/median 帧已有数据 | 被方案 B 覆盖 |
| **B: 动态上下文构建** | **追问涉及特定 Marker / 特定帧** | **当前实施** |
| C: Agent Tool Use | AI 自主查询任意数据 | Phase 4 远期目标 (4.2) |

方案 B 是方案 A 的超集（如果提取不到关键词，退回方案 A 的行为），也是方案 C 的过渡（方案 C 把 B 的逻辑暴露为 AI 可调用的工具）。
