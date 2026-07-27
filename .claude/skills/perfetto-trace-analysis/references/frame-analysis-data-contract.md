# 帧分析数据契约 · L1–L3 + Context + 机型分档

> 日期: 2026-06-19  
> 状态: **草案 v1**（ingest 数据结构；Provider 逐步实现）  
> 配套: [`aoe-watch-spec.yaml`](./aoe-watch-spec.yaml)（机器可读规则） · [`aoe-cpu-analysis-knowledge.md`](./aoe-cpu-analysis-knowledge.md)（人文原文，**附录 A 完整收录**）  
> 上级契约: [`report-spec-and-data-contract.md`](./report-spec-and-data-contract.md) §1 / §1.5 / §7

---

## 0. 目的

统一 **ingest 入库** 时各源（`unity_profiler` / `perfetto`）的 **帧级分析数据结构**，分三层：

| 层 | 名称 | 稳定性 | 内容 |
|----|------|--------|------|
| **L1** | 帧基础设施 | 高 | 帧边界、每帧 ms、慢帧索引、代表帧树 |
| **L1.5** | Context / 分段 | 中 | 按帧/按段：拖视野、网络压测、idle… |
| **L2** | 观察规格 watchSpec | **常变** | 盯哪些模块、规则模板、场景 preset、**机型分档** |
| **L3** | 派生结果 | 可重算 | `series[]`、`flags[]`、摘要 metrics |

**原则**: L2 不写死单一 ms 阈值；用 **规则 + context + frameLoad + deviceTier** 组合判定。

---

## 1. 后续独立需求（已登记，非本文实现范围）

> **REQ-FRAME-VIZ-001** · 编辑器 / 可视化视图（完整需求，Phase 5+）

- **目标**: Unity Editor 或 Web 富 UI：展示 **完整模块调用树** + 各节点 **上限阈值**（来自 `aoe-watch-spec.yaml`）+ 逐帧着色（超阈值标红）。
- **依赖**: 本文 L1–L3 契约落地；全量树仍 **按需** 从 raw 回读（不 600 帧全树入库）。
- **与当前关系**: 当前只做 **ingest 数据结构与契约**；可视化另立项，不阻塞 Provider。

已记入 [`refactor-progress.md`](./refactor-progress.md) § Phase 5。

---

## 2. 入库落点

```
Run.profile
├── core.frame[]              # 摘要：每源一条 FrameStat（playerloop / choreographer 分开）
├── core.metrics[]            # L3 摘要：marker.X.p95MsPerFrame、flags.count…
├── meta.deviceTier           # high | mid | low | unknown（新增）
└── detail.<source>
    └── frameAnalysis         # 本文主结构（unity / perfetto 共有）
        ├── L1  summary, timings, slowFrames, frameTrees, segments?
        ├── L1.5 contextByFrame[], contextSummary?
        ├── L2  watchSpec（快照：当时用的规则版本）
        └── L3  series[], flags[]
```

**存储**: `frameAnalysis` 整体写入 `runs.detail_json`（schemaless JSON）。  
**大数组**: `timings[]` / `series[].timings[]` 可入库；全量每帧全树 **不入库**（指针 + 代表帧树 + 按需 query）。

**与旧 Unity 字段关系**（迁移期并存）:

| 旧字段 (`detail.unity_profiler`) | 新字段 (`frameAnalysis`) |
|----------------------------------|--------------------------|
| `frameSummary` | `frameAnalysis.summary` |
| `frameTimings[]` | `frameAnalysis.timings[]` |
| `callTrees[]` (worst/median) | `frameAnalysis.frameTrees[]` |
| `jankFrames[]` | `frameAnalysis.flags[]` + 保留 jank 专段（可选） |

---

## 3. TypeScript 类型（`web/shared/perf-model.ts` 同步）

### 3.1 L1 — `FrameAnalysisBase`

```typescript
/** 帧口径 — 禁止跨口径直比 */
type FrameDefinition = 'playerloop' | 'choreographer' | 'frametimeline' | string;

interface FrameAnalysisSummary {
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  fps: number;
  slowFrameRate33?: number;   // >33.3ms 占比
  slowFrameRate50?: number;
  worstFrameIndex?: number;
  medianFrameIndex?: number;
  p95FrameIndex?: number;
  /** perfetto 可选：与 mono_ns 对齐 */
  frameIndexOffset?: number;
}

interface SlowFrameEntry {
  frameIndex: number;
  ms: number;
  rank: number;               // 1 = 最慢
}

interface TraceSegment {
  startFrame: number;
  endFrame: number;
  label: string;              // camera-drag | battle-stress | ...
  source: 'marker' | 'meta' | 'inferred' | 'manual' | 'combined-profile';
  confidence?: 'high' | 'medium' | 'low';
}
```

### 3.2 L1.5 — Context

```typescript
/** 单帧 context 标签；键为 domain，值为状态 */
interface FrameContext {
  frameIndex: number;
  labels: Record<string, string>;   // e.g. camera: dragging | idle
  evidence?: Array<{
    classifierId: string;
    markers?: string[];
    confidence?: 'high' | 'inferred';
  }>;
}

interface ContextSummary {
  /** 各 classifier 命中帧数 */
  byClassifier: Record<string, number>;
  segments?: TraceSegment[];
}
```

### 3.3 L2 — 机型分档 + watchSpec

```typescript
type DeviceTier = 'high' | 'mid' | 'low' | 'unknown';

/** 写入 Run.meta.deviceTier；规则表达式可引用 deviceTier */
interface DeviceTierMeta {
  tier: DeviceTier;
  device?: string;            // 原始型号
  frameBudgetMs?: number;     // 默认 1000/targetFps
  matchedBy?: 'config' | 'meta' | 'default';
}

interface WatchTargetMatch {
  type: 'marker' | 'slice';
  patterns: string[];
}

interface WatchRule {
  id?: string;
  ref?: string;               // ruleTemplates 中的模板 id
  when?: string;              // 表达式：context.camera == idle && deviceTier != low
  expr?: string;              // 或直接写表达式
  params?: Record<string, number>;
  severity?: 'warn' | 'critical';
  message?: string;
}

interface WatchTarget {
  id: string;
  knowledgeRef?: string;
  match: {
    unity?: WatchTargetMatch;
    perfetto?: WatchTargetMatch;
  };
  playerLoopPhase?: string[];
  callPath?: string[];
  notes?: string;
  rules: WatchRule[];
}

interface WatchSpec {
  version: number;
  schemaRef: string;
  preset?: string;
  deviceTier?: DeviceTier;
  frameBudgetMs: number;
  targets: WatchTarget[];
  /** 完整 YAML 路径，便于重算 L3 */
  specPath?: string;
}
```

### 3.4 L3 — series & flags

```typescript
interface MarkerFrameSeries {
  targetId: string;
  /** 与 frameAnalysis.timings 等长；该帧未出现 = null */
  timings: (number | null)[];
  presentCount: number;
  summary?: {
    medianMs: number;
    p95Ms: number;
    maxMs: number;
  };
}

interface FlaggedFrame {
  frameIndex: number;
  targetId: string;
  ruleId: string;
  severity: 'warn' | 'critical';
  actualMs: number;
  frameMs?: number;
  context?: Record<string, string>;
  deviceTier?: DeviceTier;
  message: string;
}
```

### 3.5 合包 — `FrameAnalysis`

```typescript
interface FrameAnalysis {
  frameDefinition: FrameDefinition;
  thread?: string;            // UnityMain | UnityGfxRenderS | JobWorker pool id

  // L1
  summary: FrameAnalysisSummary;
  timings: number[];
  slowFrames?: SlowFrameEntry[];
  frameTrees?: CallTree[];    // worst | median | p95 | topSlow — label 区分
  segments?: TraceSegment[];

  // L1.5
  contextByFrame?: FrameContext[];
  contextSummary?: ContextSummary;

  // L2（ingest 时快照）
  watchSpec?: WatchSpec;

  // L3
  series?: MarkerFrameSeries[];
  flags?: FlaggedFrame[];
}
```

**`detail.unity_profiler.frameAnalysis`** / **`detail.perfetto.frameAnalysis`** 各一份（主线程 PlayerLoop 必选）。  
渲染线程 / JobWorker: 可选 **`detail.perfetto.threadAnalysis[]`**，结构同上但 `frameDefinition` 可为 `worker-busy-segment`（无 PlayerLoop 时用 busy 段代替帧）。

---

## 4. 上下文变量（规则引擎可用）

| 变量 | 说明 |
|------|------|
| `frameMs[i]` | 第 i 帧 PlayerLoop（或线程段）总 ms |
| `frameBudgetMs` | 目标帧预算（来自 deviceTier / meta.targetFps） |
| `frameP50` / `frameP95` | 本 Run 帧耗时分布 |
| `frameLoadTier[i]` | 可选：`low` / `mid` / `high`（按分位数） |
| `seriesMs[i]` | watchTarget 在第 i 帧耗时 |
| `seriesMedian` / `seriesP95` | 本 Run 该模块分布 |
| `context.<domain>` | 如 `context.camera` = dragging \| idle |
| `deviceTier` | high \| mid \| low \| unknown |

---

## 5. 各源 Provider 职责（ingest 阶段）

### 5.1 Unity (`unity_profiler`)

| 步骤 | 产出 |
|------|------|
| L1 | 从 pdata 逐帧 → `timings[]`、`summary`、slowFrames、frameTrees（worst/median/p95/top3） |
| L1.5 | 按帧查 marker 是否存在 → `contextByFrame`（如 OnCameraGestureMove） |
| L2 | 读 `aoe-watch-spec.yaml` + `meta.scene` + `meta.device` → 快照 `watchSpec` |
| L3 | 对 watchTargets 生成 `series[]`；跑规则 → `flags[]` |
| core | 追加 `core.frame[]`（playerloop）；metrics: `marker.<id>.p95MsPerFrame` 等 |

### 5.2 Perfetto (`perfetto`)

| 步骤 | 产出 |
|------|------|
| L1 | 枚举 UnityMain 上 **PlayerLoop** slice → `timings[]`（应用帧，与 unity 可比）；**另保留** choreographer → `core.frame[choreographer]` |
| L1.5 | 每 PlayerLoop 窗口内 slice/marker 匹配 → context |
| L2 | 同 Unity |
| L3 | slice 归属第 i 个 PlayerLoop → `series[]`；规则 → `flags[]` |
| 渲染 / JobWorker | `threadAnalysis[]`：调度 + busy 段 + 窗口 slice 树（无 PlayerLoop 时不硬造帧） |

### 5.3 机型分档

1. 维护 `docs/device-tier-map.json`（device 型号 → tier），ingest 时解析 `meta.device`。  
2. 写入 `Run.meta.deviceTier`（扩展 RunMeta）。  
3. `watchSpec` 快照记录当时 tier；规则 `when` 可含 `deviceTier == low`。  
4. **首版 map 可为空**，默认 `unknown`，仅启用与档位无关规则。

---

## 6. L3 重算（不重新 ingest）

知识库 / `aoe-watch-spec.yaml` 版本更新后：

```
POST /runs/:id/recompute-frame-flags
  输入: 新 watchSpec 或 spec 版本号
  读取: detail.*.frameAnalysis.timings + series（或 raw 按需补 series）
  输出: 更新 flags[] + metrics 摘要
```

---

## 7. 与报告 / skill 的关系

- **skill 读**: `frameAnalysis.summary` + `flags[]` + `contextSummary` + 知识库人文附录。  
- **报告必写**: 每条 flag 带 `ruleId`、`context`、`deviceTier` 快照，避免「3ms 超标」无上下文。  
- **Choreographer 帧**: 仅系统节拍段落；**禁止**与 PlayerLoop 帧时长直比（report-spec §4）。

---

## 8. 实现顺序（建议）

1. ✅ 本文 + `aoe-watch-spec.yaml` v1  
2. `perf-model.ts` 类型 + `Run.meta.deviceTier`  
3. Perfetto Provider：L1 PlayerLoop `timings[]`  
4. Unity Provider：`frameAnalysis` 与旧字段对齐迁移  
5. L1.5 context classifiers（OnCameraGestureMove 等）  
6. L3 规则引擎（读 YAML）  
7. `device-tier-map.json` + ingest 解析  
8. Web：读 `detail.frameAnalysis`（替代仅读 preprocess 文件）  
9. **REQ-FRAME-VIZ-001** 可视化（独立需求）

---

## 附录 A · AOE CPU 分析知识库（原文完整，未裁剪）

以下为 [`aoe-cpu-analysis-knowledge.md`](./aoe-cpu-analysis-knowledge.md) **全文**，与仓库内源文件保持一致。

---

为了更好分析AOEYZ项目CPU性能，我做成一些相关说明：
1.MainThread中的PlayerLoop是游戏主循环，一些压测常出现的性能热点有网络消息收发、

2.网络消息收发调用栈：PlayerLoop -> Update.ScriptRunBehaviourUpdate -> BehaviourUpdate -> GameLauncher.Update -> Core.Update -> CS:AOE.TServerManager。这个栈下面会有TServer.RecvMessages, Tserver.DecodeMessages, TServer.HandleMessages。

3.我们游戏比较重度使用Lua脚本，所以Lua的一些主循环调用也特别值得关注。其中PlayerLoop -> Update.ScriptRunBehaviourUpdate -> BehaviourUpdate -> GameLauncher.Update() -> Core.Update -> CS:AOE.LuaMgr -> LuaMgr.OnTick&UpdateSchedule下各个Lua主要管理器的调用。在压测场景中可能出现的有MapSignificanceMgr(重要度管理器) 、BattleHeadMgr(头像管理器)。特别是重要度任务管理器，从网络消息接收到对应服务器数据后，会驱动这个管理器增删改游戏内实体对象(各种类型的MapEntity)，然后驱动后续各种资源数据的加载卸载。当前会预留给这个管理器最多3ms的每帧耗时，以防出现卡顿，但如果任务太多，会造成这个管理器一直处于3ms的顶格消耗，所以这个管理器的性能指标某种程度上反应了当前游戏的整体负载状况，这个管理器值得作为每次性能分析的重点考察对象。除此之外，LuaMgr下可能还会出现其它管理器或者主界面(Hud_Common)等的tick消耗，虽然耗时补偿，但每隔数帧如果有1~2ms的消耗也会显得不合理。

4.C#的负载消耗: PlayerLoop -> Update.ScriptRunBehaviourUpdate -> BehaviourUpdate -> GameLauncher.Update -> Core.Update -> CS:AOE.Outside.MapManager。其下有 CS:AOE.Battle.BattleUIManager, CS:AOE.Outside.OutSideViewArmyLineMgr等几个主要管理器，其中BattleUIManager往往会跟上述Lua中的、BattleHeadMgr热点呈现一致的状态。OutSideViewArmyLineMgr则主要是场景中行军线的刷新负载，在压测场景中往往也表现出高负载。

5.以上第3点和第4点中细说了主循环 Core.Update 中Lua和C#的主要负责，其实在 LateUpdate (PlayerLoop -> Update.ScriptRunBehaviourLateUpdate -> LateBehaviourUpdate -> GameLauncher.LateUpdate() -> Core.LateUpdate) 中也有对应的一组消耗 CS:AOE.LuaMgr、CS:AOE.Outside.MapManager，其中这里 LuaMgr 下经常会出现 MapCameraCtrl 的高负载，因为这里是滑动摄像机后视野更新的入口，所以经常在拖动视野、无极缩放等场景下出现高负载。 C#则主要是 CS:AOE.Outside.MapManager 下的各个自管理器，以及跟CS:AOE.Outside.MapManager平行的 CS:AOE.MeshUIManager，这个是MeshUI的C#管理器，往往在压测场景下，悬浮UI（使用MeshUI制作方案）等较多的情况下，这个管理器负载会上升。

6.PlayerLoop -> PreLateUpdate.LeagcyAnimationUpdate 反映的游戏内 GameObject身上动画数量的整体负载，也就是如果这个消耗高，表明当前的 animation 组件过多（变相说明带Animation组件的GameObject数量过多）。同理，PlayerLoop - > PreLateUpdate.ParticleSystemBeginUpdateAll 和 PlayerLoop -> PostLateUpdate.ParticleSystemEndUpdateAll 消耗高表明游戏内的例子特效过多。

7.PlayerLoop -> PostLateUpdate.PlayerUpdateCanvases 是UGUI的消耗，但目前游戏内压测场景或者主要热点场景下的消耗大的UI（比如头顶字、伤害跳字等悬浮UI）已经全部改为上面第5点介绍的MeshUI方案，这个消耗不应该大，如果每帧都出现1ms的消耗是极不合理的。

8.关于ECS，这是我们游戏处理大量部队士兵逻辑的重点模块，但我们之前已经做了很好的并行化处理，将所有的负载都放在了JobWorker上，主线程上的两个主力调用栈 PlayerLoop -> InitializationSystemGroup -> UpdateFunction.Invoke() -> Default World Unity.Entities.InitializationSystemGroup, PlayerLoop -> SimulationSystemGroup -> UpdateFunction.Invoke() -> Default World Unity.Entities.SimulationSystemGroup 和 PlayerLoop -> PresentationSystemGroup -> UpdateFunction.Invoke() -> Default World Unity.Entities.PresentationSystemGroup 只负责分发调度job，并不参与实际run job的工作。 所以变相的，如果这两个时间片消耗大于1ms，或者其下叶子节点有等待job完成的时间片（我记得是叫Complete.Job之类的名字，我现在有点不确定），则都不是合理状况。另外 K:\AOEYZ_Trunk\AOE3D\Assets\Editor\AoE\Tools\ECSDependencyVisualizer是之前写的检测ECS依赖关系的离线工具，你可以参考这个依赖工具了解这块机制，目的就是让job无阻塞的并发，不会在Main Thread以及Job Worker线程上出现job互相等的情况。

9.主线程渲染相关时间片， PlayerLoop -> PostLateUpdate.FinishFrameRendering -> RenderPipelineManager.DoRenderLoop_Internal() -> URP.Render -> URP.RenderCameraStack 这是我们游戏主线程跑URP渲染管线的负载，不负责真实的GPU渲染，但其中也有很多能反映出当前渲染压力的时间片，比如其下的 URP.RenderSingleCamera -> URP.AfterRendering -> URP.Submit -> URP.WaitForPresent -> Gfx.WaitForPresentOnGfxThread，如果这个时间片出现，说明当前游戏内的渲染负载很高，一直在等前一帧的GPU渲染工作完毕，才提交本帧的渲染任务。

10.资源加载，比如在上面提到的压测或者滑动视野场景中，游戏内实体对象发生大量增删的情况，伴随着经常会出现大量的资源加载，这块负载在主线程的时间片是在 PlayerLoop -> PostLateUpdate.PlayerSendFrameComplete -> PlayerEndOfFrame -> CoroutinesDelayedCalls -> GameLauncher.EndOfFrame() -> Core.PostEndOfFrame -> CS.AOE:ResManager -> LoaderManagerdOnFrameEnd 下。

11.Lua多线程GC，主线程时间片 PlayerLoop -> LuaMultiThreadGC -> UpdateFunction.Invoke -> LuaMtGc.WaitGCThread，对应的线程 Lua -> GC线程。 往往发生的次数不多，但如果一次消耗很高比如 3~10ms或以上，都表明当前lua的gc压力很大。

---

## 附录 B · 知识库 → watchTarget 索引

| 知识库 § | watchTarget id | 关键 context |
|----------|----------------|--------------|
| §2 | TServer | battle-network-active |
| §3 | MapSignificanceMgr, BattleHeadMgr | load high |
| §4 | OutSideViewArmyLineMgr | stress |
| §5 | MapCameraCtrl, MeshUIManager | camera-dragging / camera-idle |
| §6 | LegacyAnimationUpdate, ParticleSystemUpdate | — |
| §7 | PlayerUpdateCanvases | — |
| §8 | ECS_*SystemGroup | — |
| §9 | URP_WaitForPresent | — |
| §10 | ResManager_Load | camera-dragging, stress |
| §11 | LuaMultiThreadGC | — |

完整规则见 [`aoe-watch-spec.yaml`](./aoe-watch-spec.yaml)。
