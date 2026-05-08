# Unity Profiler CPU Performance Analysis Skill

## 概述

这是一个标准 AI Skill，用于分析 Unity Profiler 的 CPU 性能数据。输入解析后的 pdata 数据，**全自动**输出一份详尽的性能评估报告，包含：
- 性能问题定位（细化到调用链 + 源码位置）
- 问题根因分析（基于 Unity 性能知识 + 代码上下文）
- 优化方案建议（具体可操作）

**用户无需交互**，只需提供 pdata 数据，AI 自动完成全部分析。

---

## 目录结构

```
unity-profiler-analysis/
├── SKILL.md                        (必须) AI 行为指令，触发条件和分析 SOP
├── README.md                       (本文件) Skill 说明和分析流程文档
├── config.json                     可调参数（Jank 倍数、黑名单、目标帧率等）
├── scripts/
│   ├── preprocess.ts               数据预处理（统计聚合、Jank 检测、波动检测、调用链提取）
│   ├── query-frame.ts              按帧号查询详细调用树（AI 按需调用）
│   └── map-source.ts               Marker → 源码位置映射
├── references/
│   └── unity-cpu-knowledge.md      Unity CPU 性能知识参考
├── output/                         (自动生成) 中间产出和最终报告
│   ├── preprocess-result.json      预处理结果
│   ├── marker-source-map.json      Marker 与源码的缓存映射
│   └── performance-report.md       最终性能分析报告
└── config.json                     可调参数
```

---

## 使用方式

### 前提配置（一次性）

编辑 `config.json`，配置：
- `targetFps`: 目标帧率（默认 30）
- `projectPath`: Unity 项目源码根目录（用于代码关联）

### 在 Claude Code 命令行中使用

```bash
# 查看已注册的 skills
/skills

# 使用：提供 pdata 数据，AI 全自动分析
> 这是我的 pdata 解析后的数据（见 parsed-data.json），请做性能分析
```

AI 自动执行完整流程，无需人工交互。

### 脚本手动调用

```bash
# 数据预处理
npx tsx scripts/preprocess.ts --input ./parsed-pdata.json --target-fps 60

# 按帧查询详细调用树
npx tsx scripts/query-frame.ts --input ./parsed-pdata.json --frame 523 --depth 10

# Marker 源码映射
npx tsx scripts/map-source.ts --markers markers.json --project /path/to/unity-project
```

---

## 分步调试指南

每一步输入输出都是文件，步骤之间通过文件解耦。你可以在任意一步停下来检查中间产物，满意后再继续下一步。

### 只跑 Step 1: 预处理

**脚本方式**:
```bash
# 直接给 .pdata 文件（脚本内部自动解析）
npx tsx scripts/preprocess.ts --input ./recording.pdata --target-fps 60

# 或者给已解析的 json
npx tsx scripts/preprocess.ts --input ./parsed-data.json --target-fps 60

# 输出: output/preprocess-result.json
# 检查这个 json 看统计数据、Jank 帧列表、marker 排序是否正确
```

**说明**: preprocess.ts 自动检测输入文件格式：
- `.pdata` → 先调用 pdata-parser 解析为 ProfileData，再预处理
- `.json` → 直接作为 ProfileData 读取并预处理

**提示词方式** (在 Claude Code 中):
```
请只执行预处理步骤：运行 preprocess.ts 处理 recording.pdata（目标帧率 60），
把结果保存到 output/preprocess-result.json，不要做后续分析。
```

---

### 只跑 Step 2: 代码关联

**脚本方式**:
```bash
npx tsx scripts/map-source.ts \
  --input output/preprocess-result.json \
  --project /path/to/unity-project \
  --output output/marker-source-map.json
# 检查映射是否正确，手动修正错误的条目
```

**提示词方式**:
```
请只执行代码关联步骤：基于 output/preprocess-result.json 中的 marker 列表，
在 /path/to/unity-project 中搜索源码映射，输出到 output/marker-source-map.json。
不要做性能分析。
```

---

### 只跑 Step 3: AI 分析（基于已有的中间产物）

**提示词方式**:
```
请基于以下已有数据做性能分析：
- 预处理结果: output/preprocess-result.json
- 源码映射: output/marker-source-map.json
按照性能分析 skill 的流程进行完整分析，输出报告到 output/performance-report.md。
```

---

### 只跑 Step 3 但重新分析（不满意上次报告）

**提示词方式**:
```
上次的分析报告不够好，请基于 output/preprocess-result.json 重新分析。
这次重点关注 YzEntityMoveLineNtf 的波动问题，分析它为什么在多帧 spike。
```

---

### 只查某一帧的详细调用树

**脚本方式**:
```bash
npx tsx scripts/query-frame.ts --input ./parsed-pdata.json --frame 173 --depth 12
# 输出到 stdout，查看第 173 帧的完整调用树
```

**提示词方式**:
```
请查看第 173 帧的详细调用树（展开 12 层），我想看 YzEntityMoveLineNtf 在这帧的完整调用链。
```

---

### 修正代码映射后重新生成报告

**操作步骤**:
```bash
# 1. 手动编辑 marker-source-map.json，修正错误的映射
# 2. 让 AI 基于修正后的映射重新分析
```

**提示词方式**:
```
我已经修正了 output/marker-source-map.json 中的映射关系，
请基于修正后的数据重新生成性能报告。
```

---

### 换参数重跑预处理

**脚本方式**:
```bash
# 换目标帧率
npx tsx scripts/preprocess.ts --input ./parsed-pdata.json --target-fps 30

# 换帧范围（V2 功能）
npx tsx scripts/preprocess.ts --input ./parsed-pdata.json --target-fps 60 --frame-range 100-400
```

**提示词方式**:
```
请用目标帧率 30FPS 重新跑预处理，然后基于新结果重新分析。
```

---

### 基于已有中间产物做完整分析（推荐在新会话中使用，节省 token）

当 Step 1 和 Step 2 已经跑过（output/ 下有 preprocess-result.json 和 marker-source-map.json），可以直接在新会话中用以下提示词，跳过脚本执行直接进入分析：

**提示词**:
```
请读取 .claude/skills/unity-profiler-analysis/SKILL.md，严格按流程分析 data/压测战斗-行军线优化.pdata，目标帧率 30，每步都执行不要跳过。

注意：
- Step 1 已完成，直接读取 output/preprocess-result.json（只读 frameSummary、markers 前 20 条的摘要行、jankFrames 的 hotPath 字段、markerSpikes）
- Step 2 已完成，直接读取 output/marker-source-map.json 中 source="grep" 的条目
- Step 3 分析时，对找到源码的热点 marker，Read 对应源码文件做结合代码的根因分析
- Step 4 按需 query-frame
- 每步报告 token 估算
```

**适用场景**:
- 上次分析的报告不满意，想重新生成
- 想结合源码做更深入的根因分析
- 当前会话 token 已接近上限，开新会话继续

---

## 配置文件 (config.json)

```json
{
  "targetFps": 30,
  "projectPath": "/path/to/unity-project",
  "jank": {
    "jankMultiplier": 2,
    "bigJankMultiplier": 3
  },
  "callTree": {
    "maxDepth": 8
  },
  "markerSpike": {
    "spikeRatioThreshold": 3,
    "minSpikeFrames": 2
  },
  "blacklist": [
    "Semaphore.WaitForSignal",
    "WaitForJobGroupID",
    "Idle",
    "EditorIdle",
    "Profiler.CollectGlobalStats",
    "Profiler.FlushData"
  ],
  "filter": {
    "minSelfTimeMs": 0.1
  }
}
```

| 参数 | 说明 | 可运行时覆盖 |
|------|------|-------------|
| `targetFps` | 目标帧率 | `--target-fps 60` |
| `projectPath` | 项目源码路径 | `--project /path` |
| `jank.jankMultiplier` | Jank 判定倍数（当前帧 > 前三帧均值 × N） | - |
| `jank.bigJankMultiplier` | BigJank 判定倍数 | - |
| `callTree.maxDepth` | 调用树最大展开深度 | `--depth N` |
| `markerSpike.spikeRatioThreshold` | Marker 波动检测阈值（max/median > N 才输出详细波动数据） | - |
| `markerSpike.minSpikeFrames` | 至少 N 帧有 spike 才输出 | - |
| `blacklist` | 排除的无分析价值 marker | - |
| `filter.minSelfTimeMs` | self-time 低于此值的 marker 过滤掉 | - |

---

## 最终形态：完整性能分析流程

### 总览数据流

```
┌─────────────────────────────────────────────────────────────────────┐
│                  用户提供 .pdata 文件或已解析的 JSON                   │
└─────────────────────────────┬───────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1: preprocess.ts (确定性脚本)                                   │
│                                                                     │
│ 输入: .pdata 文件 或 parsed-data.json + config.json                 │
│      （自动检测格式：.pdata 先解析，.json 直接用）                   │
│ 处理: 统计聚合、Jank 检测、Marker 波动检测、调用链提取               │
│ 输出: output/preprocess-result.json                                 │
└─────────────────────────────┬───────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Step 2: map-source.ts (确定性脚本)                                   │
│                                                                     │
│ 输入: preprocess-result.json 中的 marker 列表 + 项目源码路径         │
│ 处理: grep 源码定位 marker 对应的代码                                │
│ 输出: output/marker-source-map.json (有缓存则增量更新)              │
└─────────────────────────────┬───────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Step 3: AI 综合分析                                                  │
│                                                                     │
│ 输入: preprocess-result.json + marker-source-map.json               │
│       + references/unity-cpu-knowledge.md                           │
│ 处理:                                                               │
│   3.1 Jank 卡顿分析 — 对每个 Jank 帧定位调用链瓶颈                  │
│   3.2 热点分析 — AI 判断哪些 marker 是热点(self-time维度)            │
│   3.3 波动分析 — AI 判断哪些 marker spike 是问题(波动维度)           │
│   3.4 根因推理 — 结合知识库 + 源码上下文                             │
│   [按需] 调用 query-frame.ts 获取特定帧详细调用树                    │
│   [按需] Read 源码文件获取更多代码上下文                             │
│                                                                     │
│ 输出: 分析结论（内部）                                               │
└─────────────────────────────┬───────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Step 4: AI 生成报告 + 自检                                           │
│                                                                     │
│ 输入: Step 3 分析结论                                                │
│ 处理: 按报告结构生成 → 自检清单校验 → 补充遗漏                       │
│ 输出: output/performance-report.md                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 各环节详细输入输出

#### Step 1: preprocess.ts

| | 说明 |
|------|------|
| **输入文件** | `parsed-pdata.json` (解析后的 pdata), `config.json` |
| **输出文件** | `output/preprocess-result.json` |
| **耗时** | 毫秒级（600帧 × 200 marker = 12万数据点，纯数学计算） |

**输出结构**:

```json
{
  "config": {
    "targetFps": 60,
    "frameBudgetMs": 16.67
  },

  "frameSummary": {
    "count": 600,
    "actualFps": 45.2,
    "mean": 22.12,
    "median": 20.85,
    "min": 14.2,
    "max": 89.5,
    "q1": 18.3,
    "q3": 24.1,
    "worstFrameIndex": 523,
    "medianFrameIndex": 302
  },

  "markers": [
    {
      "name": "YourBusinessLogic",
      "msSelfMean": 10.0,
      "msSelfMedian": 9.8,
      "msSelfMax": 15.2,
      "msTotalMean": 10.5,
      "percentOfFrame": 47.8,
      "count": 600,
      "presentOnFrameCount": 600,
      "callsPerFrame": 1.0,
      "depth": 5,
      "thread": "1:Main Thread",
      "callChain": "PlayerLoop → Update → ScriptRunBehaviourUpdate → xlua.call → YourBusinessLogic",
      "spikeRatio": 1.5,
      "mustReport": true,
      "mustReportReason": "self-time 占帧 47.8% > 20%"
    }
  ],

  "markerSpikes": [
    {
      "name": "YzEntityMoveLineNtf",
      "msSelfMean": 1.2,
      "msSelfMedian": 0.5,
      "msSelfMax": 8.15,
      "msSelfP95": 6.8,
      "spikeRatio": 16.3,
      "spikeFrameCount": 45,
      "totalFrameCount": 600,
      "spikeFrameIndices": [173, 201, 245, 310]
    }
  ],

  "jankFrames": [
    {
      "frameIndex": 523,
      "msFrame": 89.5,
      "prevThreeAvg": 20.8,
      "ratio": 4.3,
      "jankLevel": "BigJank",
      "category": "gc",
      "dominantMarker": "GC.Collect",
      "hotPath": "PlayerLoop → Update → ScriptRunBehaviourUpdate → GC.Collect **BOTTLENECK**",
      "callTreeSummary": "PlayerLoop: 89.5ms (100%)\n  Update: 78.2ms (87.4%) [self=0.3ms]\n    ...",
      "mustReport": true,
      "mustReportReason": "BigJank"
    }
  ],

  "frameTrees": [
    {
      "frameIndex": 523,
      "label": "Worst Frame",
      "msFrame": 89.5,
      "treeText": "...",
      "hotPathText": "..."
    },
    {
      "frameIndex": 302,
      "label": "Median Frame",
      "msFrame": 20.85,
      "treeText": "...",
      "hotPathText": "..."
    }
  ],

  "threads": [
    { "name": "Main Thread", "msMedian": 20.85, "msMax": 89.5 },
    { "name": "Render Thread", "msMedian": 8.2, "msMax": 15.3 }
  ]
}
```

**数据量估算**: 约 50-80KB，占 AI 上下文 ~20%，无溢出风险。

**AI 读取策略（分层按需，节省 token）**:

preprocess-result.json 不需要全量读入 AI 上下文。采用分层策略：

| 数据项 | 是否全量读取 | 理由 |
|--------|-------------|------|
| frameSummary | ✅ 全读 | 很小（几行），帧率/Jank 总览 |
| markers（一行摘要/marker） | ✅ 全读 | 发现热点的关键依据 |
| jankFrames 的 `hotPath` | ✅ 全读 | 每帧一行，定位瓶颈节点 |
| jankFrames 的 `callTreeSummary` | ❌ 按需 | 几百行/帧，只在深入分析时读特定帧的 |
| markerSpikes | ✅ 全读 | 每条一行，发现波动问题 |
| threads | ✅ 全读 | 几行 |

**不会漏掉问题**：发现问题靠 `hotPath`（一行）和 `markers`（排序列表），不靠 callTree 全文。callTree 是"解释为什么"的辅助信息，确认根因时再按需读取。

**token 消耗控制**:
- Step 1-2: 脚本执行，几乎 0 token（只看 stderr 进度）
- Step 3 读取: 控制在 ~30K token（frameSummary + markers 摘要 + hotPath + spikes）
- Step 4 按需: 每次 query-frame ~1.5K token，最多 3-5 次
- Step 5 报告生成: ~5K token
- 总计目标: < 50K token（而非之前的 200K+）

**关键设计**:

| 数据项 | 覆盖范围 | 输出策略 |
|--------|---------|---------|
| frameSummary | 全部 600 帧 | 聚合为几个数字 |
| markers | 全部 marker（过滤黑名单 + minSelfTime） | 每个一行摘要，按 self-time 降序 |
| markerSpikes | 只输出 spikeRatio > 阈值 且 > N 帧有 spike 的 | 详细波动数据（约 20-30 个） |
| jankFrames | 只有 Jank/BigJank 帧（约 10-30 个） | 含调用树 + 热路径 |
| frameTrees | 只有最差帧 + 中位帧（2 个） | 含完整调用树 |
| threads | 全部活跃线程 | 每个一行 |

**数据不输出的帧**: 560+ 个正常帧只贡献统计数字，不输出调用树。

---

#### Step 2: map-source.ts

| | 说明 |
|------|------|
| **输入文件** | `output/preprocess-result.json` 中的 marker 名列表, `config.json` 中的 projectPath |
| **输出文件** | `output/marker-source-map.json` |
| **耗时** | 首次几秒（grep 全项目），后续增量很快 |

**输出结构**:

```json
{
  "_meta": { "lastUpdated": "2026-05-08", "projectPath": "/path/to/project" },
  "YzEntityMoveLineNtf": {
    "source": "grep",
    "files": [{ "path": "Assets/Scripts/Net/YzEntityMoveLineNtf.cs", "line": 42 }],
    "snippet": "Profiler.BeginSample(\"YzEntityMoveLineNtf\");\nforeach (var entity in entities) {\n    entity.UpdateMoveLine(msg);\n}\nProfiler.EndSample();"
  },
  "Physics.Simulate": {
    "source": "engine",
    "note": "Unity 物理引擎内部"
  }
}
```

**缓存机制**:
- 首次: 全量搜索
- 后续: 只搜缺失的 marker（新增的或被用户删掉的）
- 代码片段: 5-10 行，AI 需要更多时自己 Read 文件

---

#### Step 3: AI 综合分析

| | 说明 |
|------|------|
| **输入** | `output/preprocess-result.json` + `output/marker-source-map.json` + `references/unity-cpu-knowledge.md` |
| **AI 上下文占用** | preprocess ~30K token + map ~5K token + knowledge ~5K token = ~40K token (占 200K 的 20%) |
| **按需追加** | `query-frame.ts` 输出 ~1.5K token/次，最多追问 3-5 帧 |

**AI 分析三个维度**:

| 维度 | 数据来源 | 回答的问题 |
|------|---------|-----------|
| Jank 卡顿 | `jankFrames` | 为什么会突然卡一下？ |
| 热点 (稳定高耗) | `markers`（按 self-time 排序） | 哪些函数持续消耗 CPU 最多？ |
| Marker 波动 | `markerSpikes` | 哪些函数时高时低，是潜在隐患？ |

---

#### Step 4: AI 生成报告 + 自检

| | 说明 |
|------|------|
| **输出文件** | `output/performance-report.md` |
| **报告长度** | 约 3000-5000 字 |

---

### 产出文件总览

| 文件 | 类型 | 生成者 | 用途 |
|------|------|--------|------|
| `output/parsed-data.json` | 中间产出 | preprocess.ts (当输入为 .pdata 时) | pdata 解析后的原始结构化数据，可复用避免重复解析 |
| `output/preprocess-result.json` | 中间产出 | preprocess.ts | 结构化统计摘要，供 AI 分析 + 供用户查看 |
| `output/marker-source-map.json` | 中间产出(缓存) | map-source.ts | Marker → 源码映射，后续复用 |
| `output/performance-report.md` | 最终产出 | AI | 完整性能分析报告 |

---

## 分析流程详解

### Step 1 详细逻辑: preprocess.ts

#### 1.1 帧统计

遍历全部 600 帧，计算 mean/median/min/max/Q1/Q3。

#### 1.2 Marker 聚合（按 self-time 排序）

对每个 unique marker（排除黑名单），聚合统计后按 **self-time 均值降序**排列。

**排序选择 self-time 而非 total-time 的原因**: 避免 PlayerLoop 等纯包装层占位，直接找到真正消耗 CPU 的执行者。

#### 1.3 Jank 检测

```
对每一帧 i (i >= 3):
  prevThreeAvg = (frame[i-1] + frame[i-2] + frame[i-3]) / 3
  if frame[i].ms > prevThreeAvg × bigJankMultiplier → BigJank
  elif frame[i].ms > prevThreeAvg × jankMultiplier → Jank
  else → 正常帧
```

只看相对突变，不设绝对阈值。参考 PerfDog 标准。

对每个 Jank 帧：构建调用树 + 提取热路径 + 标注瓶颈节点。

#### 1.4 Marker 波动检测

```
对每个 marker:
  spikeRatio = msSelfMax / msSelfMedian
  spikeFrameCount = 该 marker 超过 median × spikeRatioThreshold 的帧数

  if spikeRatio > config.markerSpike.spikeRatioThreshold
     AND spikeFrameCount >= config.markerSpike.minSpikeFrames:
    → 输出到 markerSpikes（含详细波动数据）
```

**作用**: 捕获"整帧不 Jank 但某个 marker 自身异常"的情况（如 YzEntityMoveLineNtf 那种场景）。

#### 1.5 关键帧调用树

只对以下帧构建完整调用树（控制数据量）：
- 所有 Jank/BigJank 帧
- 最差帧（耗时最高）
- 中位帧（作为正常帧参照）

其余 560+ 帧只贡献统计聚合。

#### 1.6 [MUST_REPORT] 标注

脚本自动标注以下项，AI 不可跳过：

| 条件 | 标注理由 |
|------|---------|
| BigJank 帧 | 严重卡顿 |
| self-time 占帧 > 20% 的 marker | 绝对热点 |
| Gfx.WaitForPresent self 占帧 > 30% | GPU Bound 必须告知 |
| WaitForTargetFPS self 占帧 > 30% | CPU 轻松必须告知 |
| FixedUpdate 相关 marker 每帧调用 > 1 次 | 物理追帧必须指出 |
| GC.Collect 出现在 Jank 帧 | GC 问题必须追溯 |

---

### Step 2 详细逻辑: map-source.ts

#### 搜索策略

```
对每个需要定位的 marker name:
  1. 检查 marker-source-map.json 是否已有缓存 → 有则跳过
  2. grep "BeginSample.*{markerName}" --include="*.cs" 项目目录
  3. grep "BeginSample.*{markerName}" --include="*.lua" 项目目录
  4. 如果 marker 名像 "ClassName.MethodName":
     → 搜 "void MethodName" 或 "function MethodName"
  5. 都找不到 → 标记为 "engine"（引擎内部 marker）
```

#### 代码片段

- 存简短片段（BeginSample 前后 5-10 行）
- AI 需要更多上下文时，自己用 Read 工具读源文件

---

### Step 3 详细逻辑: AI 综合分析

#### 3.1 Jank 卡顿分析

```
对每个 Jank/BigJank 帧：
  1. 查看该帧的调用树和热路径
  2. 定位瓶颈节点：
     - self-time > 30% of parent → BOTTLENECK
     - 如果无明显 BOTTLENECK → 找 self-time 最大的叶子节点
     - 如果 self-time 都低但 total 高 → 广度问题（子调用太多）
  3. 结合 marker-source-map 关联到源码
  4. 推断根因

聚合分析：
  - 按 category 分类 (gc/physics/script/rendering/loading/animation)
  - 同 category 反复出现 → 系统性问题（高优先级）
  - 只出现一次 → 偶发问题（低优先级）
```

#### 3.2 热点分析（稳定高耗型）

```
从 markers 列表（已按 self-time 排序）中：
  AI 自行判断哪些是真正的热点（不硬限 Top N）
  对每个热点做深度拆解：
    - 完整调用链
    - self-time vs total-time 比例 → 判断瓶颈类型
    - 每帧调用频次
    - 关联源码
    - 推断根因

  瓶颈类型判断：
    self/total > 50%         → "自身是瓶颈"（函数自身逻辑太重）
    self/total < 20%         → "瓶颈在更深的子调用"（需展开调用树）
    count/frame > 5 且单次低 → "高频累积"（单次不慢但调用太多）
```

#### 3.3 波动分析（时高时低型）

```
从 markerSpikes 列表中：
  AI 判断哪些波动是真正的问题：
    - spikeRatio 多高？
    - spike 帧占比多少？
    - 是否在某些特定场景集中出现？
    - 这个 marker spike 时占当前帧多少比例？

  AI 在报告中写明判断依据。
```

#### 3.4 特殊 Marker 解读

| Marker | AI 应输出的结论 |
|--------|----------------|
| `Gfx.WaitForPresent` self 高 | GPU Bound，CPU 在等 GPU |
| `WaitForTargetFPS` self 高 | CPU 负载轻松，帧率有余量 |
| `WaitForRenderThread` self 高 | 渲染线程是瓶颈 |

#### 3.5 按需追问

AI 如果需要更深的信息：
- 调用 `query-frame.ts --frame X --depth 10` → 获取某帧更深调用树
- 调用 Read 工具 → 读取源码文件获取更多代码上下文

---

### Step 4 详细逻辑: 生成报告 + 自检

#### 报告结构

```markdown
# CPU 性能分析报告

## 一、概览
帧率/Jank 统计表格

## 二、核心结论
2-3 句话给决策者看的摘要

## 三、Jank 卡顿分析
  ### 卡顿模式总结（聚合表格）
  ### 逐个 Jank/BigJank 详细分析（调用链 + 源码 + 根因）

## 四、热点分析
  ### 判定依据（AI 写明为什么判定/不判定为热点）
  ### 逐个热点详细分析（调用链 + self/total + 源码 + 根因）
  ### 特殊 Marker 说明（GPU Bound / CPU 轻松等）

## 五、Marker 波动分析
  ### 波动明显的 marker 列表
  ### AI 判定哪些是问题 + 依据
  ### 详细分析（哪些帧、什么模式、根因）

## 六、优化建议
  按优先级 P0/P1/P2 排列，每条含：
  - 目标 Marker + 源码位置
  - 预期收益
  - 具体可操作方案
  - 风险/副作用

## 七、补充说明
  数据局限性、建议下一步
```

#### AI 自检清单

生成报告后，AI 逐项校验：

```
□ 所有 mustReport: true 的项是否已覆盖？
□ 每个性能问题是否有完整调用链？
□ 优化建议是否有具体可执行步骤？
□ 判定依据是否都写明了？
□ 引用的数据是否与 preprocess-result.json 一致？
□ 不确定的结论是否标注了 [推断]？

任一项未通过 → 补充修正后输出最终版本
```

---

## AI 输出质量保障

三层保障机制：

### 保障 1: 脚本标注 [MUST_REPORT]

preprocess.ts 自动标注，AI 物理上看到标记不可跳过。

### 保障 2: SKILL.md 硬规则

```
1. mustReport: true 的项必须逐一分析，漏掉 = 不合格
2. 每个性能问题必须有完整调用链（从顶层到瓶颈节点），只写 marker 名 = 不合格
3. 每条优化建议必须有具体可执行步骤，空话 = 不合格
4. 热点/波动判定必须写明依据（引用具体数值）
5. 不确定的结论标注 [推断]，禁止无数据支撑的确定性表述
6. 引用的数据必须来自输入，禁止编造
```

### 保障 3: AI 自检

生成报告后执行自检清单，有遗漏则补充。用户看到的是自检通过后的最终版本。

---

## 设计决策总结

| 项目 | 决策 | 理由 |
|------|------|------|
| Jank 判定 | 当前帧 > 前三帧均值 × N 倍（可配置） | 参考 PerfDog，只看相对突变，适配任何帧率 |
| 绝对阈值 | 不设 | 不同项目/场景差异太大 |
| 分析维度 | 三维度同时做（Jank + 热点 + 波动） | 不割裂，覆盖不同类型的问题 |
| 热点排序 | 按 self-time 降序 | 避免 PlayerLoop 等包装层占位 |
| 热点/波动判定 | 脚本不做判定，AI 判断 | 避免硬阈值约束太强漏掉问题 |
| AI 判定依据 | 必须在报告中写明 | 结论可追溯、可质疑 |
| Marker 波动 | spikeRatio > 阈值的才输出详细数据 | 降噪，减少上下文占用 |
| 黑名单 | 可配置 | Idle/Semaphore 等无分析价值 |
| 保留有诊断价值 | Gfx.WaitForPresent, WaitForTargetFPS | 不是 CPU 瓶颈但能诊断系统状态 |
| 代码关联 | 缓存映射，首次 grep 后续增量 | 不用每次都搜 |
| 代码片段 | 存 5-10 行 + AI 按需读更多 | 平衡 context 长度和信息量 |
| 数据量控制 | 只对 Jank 帧 + 关键帧输出调用树 | 600 帧只输出 ~15 帧调用树，其余只贡献统计 |
| 上下文占用 | ~40K token（200K 的 20%） | 宽裕，无溢出风险 |
| 中间产出 | 保存到 output/ 目录 | 用户可查看、调试、对比 |
| 用户交互 | 无 | 配好 config 后全自动 |

---

## 问题定位层级模型

| 层级 | 定位什么 | 谁做 | 方法 |
|------|----------|------|------|
| 帧级别 | 哪些帧 Jank？ | 脚本 | 前三帧均值 × N 倍 |
| Marker 级别(稳定) | 哪些函数 self-time 持续高？ | 脚本排序 + AI 判断 | self-time 降序列表 |
| Marker 级别(波动) | 哪些函数时高时低？ | 脚本检测 + AI 判断 | spikeRatio + spike 帧数 |
| 调用链级别 | 瓶颈在链的哪一层？ | 脚本(数据) + AI(判断) | self/total 比例 + 调用树展开 |
| 源码级别 | 对应哪段代码？ | 脚本(grep) + AI(按需读) | marker → 源码映射 |
| 根因 | 为什么慢？ | AI | 知识库 + 代码上下文 |
| 优化方案 | 怎么改？ | AI | 知识库 + 代码片段 |

---

## 特殊规则

- `Gfx.WaitForPresent` self 高 + 帧耗时 < 预算 → **GPU Bound**
- `WaitForTargetFPS` self 高 → **CPU 轻松**，帧率有余量
- `GC.Collect` 出现在 Jank 帧 → 向上追溯找内存分配源
- FixedUpdate 相关 marker 每帧 > 1 次 → **物理追帧问题**
- 缺少调用树数据时 → 降低置信度表述，标注为"推断"
- 缺少源码映射时 → 只给方向性建议，不具体到代码行

---

## 后续迭代方向（V2）

以下功能在基础流程跑通后逐步迭代加入：

### 1. 多线程分析

**当前**: 主要关注 Main Thread

**目标**: 支持跨线程瓶颈定位

```
如果 Main Thread 上 WaitForRenderThread / Gfx.WaitForPresent 高：
  → 去看 Render Thread 的热点是什么
  → 真正瓶颈可能不在 Main Thread

如果 Job Worker 有大量 Idle：
  → 并行化不足，可以把更多工作移到 Job System
```

需要做的：
- preprocess 对**每个活跃线程**都输出 marker 列表和调用链
- 标注线程间等待 marker（WaitForRenderThread、Gfx.WaitForPresent 等）
- AI 分析时跨线程追踪瓶颈
- config.json 增加 `threads.analyze` 配置项

### 2. 帧区间选择

**当前**: 全量分析

**目标**: 支持只分析某段帧范围（如只看战斗阶段）

```bash
npx tsx preprocess.ts --input data.json --frame-range 500-1500
```

需要做的：
- preprocess 支持 `--frame-range` 参数
- config.json 增加 `frameRange` 配置项（默认 null = 全量）
- AI 如果发现帧率有明显分段，报告中主动建议分段分析

### 3. 对比分析

**当前**: 只支持单份数据

**目标**: 优化前后两份 pdata 对比，验证优化效果

新增脚本 `scripts/compare.ts`:

```bash
npx tsx compare.ts --before before.json --after after.json --target-fps 60
```

输出：
```json
{
  "summary": {
    "before": { "fps": 45.2, "jankCount": 12 },
    "after": { "fps": 55.8, "jankCount": 3 },
    "improvement": { "fps": "+10.6", "jankReduction": "-75%" }
  },
  "improved": [
    { "name": "Physics.Broadphase", "before": 3.1, "after": 1.2, "change": "-61%" }
  ],
  "regressed": [
    { "name": "Canvas.BuildBatch", "before": 0.4, "after": 1.8, "change": "+350%" }
  ]
}
```

报告增加"对比分析"章节：改善了什么、退化了什么、净收益。

### 4. Jank 前后帧上下文

**当前**: 只看 Jank 帧本身

**目标**: 同时输出 Jank 帧前 N 帧的信息，帮助 AI 推断累积性根因

```json
{
  "frameIndex": 523,
  "jankLevel": "BigJank",
  "context": {
    "prevFrames": [
      { "frameIndex": 520, "msFrame": 18.2, "topSelfMarker": "ScriptRunBehaviour (8.1ms)" },
      { "frameIndex": 521, "msFrame": 19.5, "topSelfMarker": "ScriptRunBehaviour (9.2ms)" },
      { "frameIndex": 522, "msFrame": 21.1, "topSelfMarker": "ScriptRunBehaviour (10.8ms)" }
    ]
  }
}
```

AI 看到前三帧 ScriptRunBehaviour 逐帧递增 → 推断前几帧持续分配内存 → 累积到第 523 帧触发 GC。

需要做的：
- preprocess 对每个 Jank 帧额外输出前 N 帧摘要
- config.json 增加 `jank.contextFrameCount`（默认 3）
