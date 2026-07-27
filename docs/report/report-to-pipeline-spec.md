# Report → Pipeline 工程化路线图

> **目的**：将「终极形态 simpleperf 报告」（`performance-report_simpleperf_ULTIMATE_v2.md`）从 AI 人肉撰写，反推为可自动产出的工程能力。本路线图按"报告章节 → 需要的工程能力 → 代码落点 → 验收口径"逐项展开。
>
> **设计哲学**：知识库 v2.1 是"规则源"，本路线图是"规则的工程实现"，最终目标是 **AI 写报告时 = 在已经结构化好的数据上做语言层组合**，而不是"在 callTree 海里捞针"。
>
> **配套文档**：
> - 终极报告骨架：`docs/report/performance-report_simpleperf_ULTIMATE_v2.md`
> - 知识库 v2.1：`docs/aoe-cpu-analysis-knowledge.md`
> - 探查笔记：`docs/report/_intermediate/EXPLORATION_NOTES.md`

---

## 0 总览：能力清单

按 ROI 排序的 14 项工程能力。每项都对应终极报告的某一章节，且能从知识库 v2.1 中找到规则源。

| # | 能力名称 | 报告章节 | 知识库节 | ROI | 复杂度 |
|---|---|---|---|---|---|
| 1 | **检测项（probe）引擎** | §0.2 红线清单 / §6 各检测项 | v2 §6 | ⭐⭐⭐⭐⭐ | 中 |
| 2 | **双口径与 base diff 引擎** | §2 库 / §3 线程 / §5 阶段 | v2 §0.1-§0.3 | ⭐⭐⭐⭐⭐ | 中 |
| 3 | **运行时函数反查引擎** | §11 反查清单 | v2 §5 | ⭐⭐⭐⭐⭐ | 中 |
| 4 | **业务函数 Top-N（按 callTree 实测）** | §0.3 / §4 主线程业务下钻 | v2 §0.8 | ⭐⭐⭐⭐⭐ | 低 |
| 5 | **线程身份自动识别 + 同名线程消歧** | §3 | v2 §2 | ⭐⭐⭐⭐⭐ | 低-中 |
| 6 | **threadCpuMs Provider bug 修复** | §3 | v2 §2 | ⭐⭐⭐⭐⭐ | 低（必修）|
| 7 | **PlayerLoop 阶段自动展开** | §5 | v2 §4 | ⭐⭐⭐⭐ | 低 |
| 8 | **业务检测项替换栈回溯锚点** | §1.2 | v2 §1 | ⭐⭐⭐⭐ | 低 |
| 9 | **Lua 总负载完整公式** | §4.3 | v2 §4.1.2 | ⭐⭐⭐ | 低 |
| 10 | **ECS 健康度检测** | §7 | v2 §4.5 | ⭐⭐⭐ | 低 |
| 11 | **GPU bound 判定算法（修正版）** | §6.3 | v2 §4.6 | ⭐⭐⭐⭐ | 低 |
| 12 | **下钻树执行器** | （报告示例 §4）| v2 §3 | ⭐⭐⭐ | 中-高 |
| 13 | **报告生成 prompt 模板重写** | 整体 | v2 全 | ⭐⭐⭐⭐ | 低（多轮）|
| 14 | **多次采集 baseline 数据库（历史趋势）** | 跨次对比 | — | ⭐⭐⭐ | 高 |

> **ROI 评估口径**：⭐ 数 = "对终极报告质量的杠杆 × 多少次未来采集会受益 ÷ 实现复杂度"。
> **新增 #4/#5/#6/#11**：来自第二轮探查发现的关键问题，部分（#6 / #11）是必须修复的 bug，不是"能力增强"。

---

## 1 检测项（probe）引擎

### 1.1 目标产物

ingest 阶段自动算 19 个 probe，每个 probe 输出：

```jsonc
{
  "probe": "probe.middleware.wwise",
  "value": 10.06,
  "unit": "%global",
  "abs_samples": 4751,
  "base_value": 0.97,
  "base_abs_samples": 351,
  "abs_delta_pct": 1255.0,
  "threshold": { "green": 5, "yellow": 15, "red": 100 },
  "verdict": "yellow",
  "evidence_key": "cpu.lib.libAkSoundEngine.pct",
  "narrative_hint": "战斗下 Wwise CPU 暴增 ~10 倍，可查并发 voice / DSP / 事件频率"
}
```

报告 §0.2 红线清单 = 把所有 `verdict in ('red', 'yellow')` 的 probe 列出来。

### 1.2 代码落点

**新增文件**：`simpleperf/simpleperf_analyzer/probes.py`

```python
PROBES = {
    "probe.middleware.wwise": {
        "kind": "lib_pct",
        "lib": "libAkSoundEngine",
        "unit": "%global",
        "threshold": {"green": 5, "yellow": 15, "red": 100},
        "narrative": "战斗下 Wwise CPU ...",
    },
    "probe.ecs.mainwait": {
        "kind": "main_subtree_pct",
        "symbols": ["WaitForJobGroupID", "JobHandle::Complete"],
        "scope": "UnityMain",
        "dedup": True,
        "unit": "%global",
        "threshold": {"green": 0.5, "yellow": 2, "red": 100},
    },
    "probe.ecs.jobworker.balance": {
        "kind": "thread_balance",
        "thread_pattern_fn": "is_job_worker",
        "unit": "%delta (max-min)/min",
        "threshold": {"green": 20, "yellow": 30, "red": 100},
    },
    # ... 共 19 个
}

def compute_probes(profile, base_profile=None):
    results = []
    for probe_id, spec in PROBES.items():
        v = _compute_probe(profile, spec)
        if base_profile:
            v['base_value'] = _compute_probe(base_profile, spec)['value']
            v['abs_delta_pct'] = ...
        v['verdict'] = _classify(v['value'], spec['threshold'])
        results.append({**v, 'probe': probe_id})
    return results
```

### 1.3 修改点

- `perf_provider.py.build_profile_dict`：调用 `compute_probes`，把结果写入 `detail.simpleperf.probes`
- `core.metrics`：每个 probe 同时写一条 metric `probe.<id>` 入库

### 1.4 验收口径

跑 `python build_simpleperf_profile.py --perf perf_aoeyz_stressmove.data --base perf_aoeyz_base.data --out ...`，输出的 `simpleperf-profile.json` 包含完整 `probes[]`，且与终极报告 §0.2 红线清单的实测值完全对得上。

---

## 2 双口径与 base diff 引擎

### 2.1 现状问题

当前 `build_simpleperf_profile.py` 单次跑一份数据，输出百分比为主。**没有 base 对照**、**没有绝对样本数**、**没有 diff 视图**。

终极报告 §3 / §4 / §5 / §6.2 等多处依赖"base 对照 + 绝对值 + 偏离系统总压力"，全是人肉计算。

### 2.2 目标产物

CLI 接受 `--base` 参数，输出 diff 视图：

```bash
python build_simpleperf_profile.py \
    --perf perf_aoeyz_stressmove.data \
    --base perf_aoeyz_base.data \
    --out output/stressmove_vs_base
```

产出多一份 `simpleperf-profile-diff.json`：

```jsonc
{
  "base": { "label": "base", "totalSamples": 36133, "durationSec": 20 },
  "current": { "label": "stressmove", "totalSamples": 47228, "durationSec": 20 },
  "systemPressure": { "totalSamplesDeltaPct": 30.7 },
  "libs": [
    {
      "lib": "libAkSoundEngine",
      "base_pct": 0.97, "base_abs": 351,
      "current_pct": 10.06, "current_abs": 4751,
      "abs_delta_pct": 1255.0,
      "excess_vs_system": 1224.3  // 偏离系统总压力
    },
    ...
  ],
  "threads": [...],
  "playerLoopStages": [...],
  "renderPasses": [...],
  "rhiSubtree": [...],
}
```

### 2.3 代码落点

**新增文件**：`simpleperf/simpleperf_analyzer/diff_engine.py`

```python
def build_diff(current_profile, base_profile):
    """每个维度的 base vs current 对比 + 绝对样本数 + 偏离系统压力。"""
    base_total = base_profile.total_samples
    cur_total = current_profile.total_samples
    sys_delta = cur_total / base_total - 1.0
    
    def _diff_libs():
        ...
    def _diff_threads():
        ...
    def _diff_anchors():  # PlayerLoop 阶段
        ...
    def _diff_subtree(symbol, scope):  # 通用子树定位
        ...
    
    return {
        "base": {...},
        "current": {...},
        "systemPressure": {"totalSamplesDeltaPct": sys_delta * 100},
        "libs": _diff_libs(),
        "threads": _diff_threads(),
        "playerLoopStages": _diff_anchors(),
        "renderPasses": [...],
        "rhiSubtree": [...],
    }
```

### 2.4 验收口径

`docs/report/_intermediate/compute_v2.txt` 里所有 base vs sm diff 数值，必须可以直接从 `simpleperf-profile-diff.json` 中读出（不再依赖人肉脚本）。

---

## 3 运行时函数反查引擎

### 3.1 目标产物

对一份 callTree 自动产出"每个运行时函数 → top-N 业务 caller 路径"。

```jsonc
{
  "callUpTracing": [
    {
      "runtime": "__memcpy",
      "globalSelfPct": 5.143,
      "hits": [
        {
          "callerChain": "ConstantBuffersGLES::UpdateCB ← GfxDeviceWorker::RunCommand",
          "thread": "Thread-102",
          "globalPct": 0.85,
          "businessModule": "RHI / GPU Instancing 常量缓冲"
        },
        {
          "callerChain": "InstancingBatcher::RenderInstancesWithBuffer",
          "thread": "UnityGfxRenderS",
          "globalPct": 0.55,
          "businessModule": "Render / GPU Instancing"
        },
        ...
      ]
    },
    {
      "runtime": "__ieee754_powf",
      ...
    },
    ...
  ]
}
```

报告 §9 反查清单 = 直接渲染这个数据。

### 3.2 反查规则定义

```python
CALL_UP_TARGETS = [
    {"symbol": "__memcpy", "max_hits": 8},
    {"symbol": "__memset", "max_hits": 5},
    {"symbol": "memmove", "max_hits": 5},
    {"symbol": "__ieee754_powf", "max_hits": 8},
    {"symbol": "__ieee754_sqrtf", "max_hits": 5},
    {"symbol": "__ieee754_atan2f", "max_hits": 5},
    {"symbol": "GC_end_stubborn_change", "max_hits": 10},
    {"symbol": "GC_mark_from", "max_hits": 5},
    {"symbol": "tlsf_memalign", "max_hits": 5},
    {"symbol": "tlsf_malloc", "max_hits": 5},
    {"symbol": "ThreadsafeLinearAllocator::Allocate", "max_hits": 8},
    {"symbol": "je_malloc", "max_hits": 5},
    {"symbol": "je_free", "max_hits": 5},
    {"symbol": "il2cpp::vm::Object::NewAllocSpecific", "max_hits": 8},
    {"symbol": "MemoryManager::Allocate", "max_hits": 8},
    {"symbol": "BucketAllocator::Allocate", "max_hits": 5},
    {"symbol": "XXH32", "max_hits": 3},
]
```

### 3.3 实现算法

```python
def trace_call_up(profile, targets):
    """
    Walk every callTree forest. For each occurrence of a target symbol,
    record its 3-hop ancestor chain. Dedup by chain. Sort by global pct.
    """
    for tgt in targets:
        hits_by_chain = {}  # key = ancestor_chain_hash, value = {pct, chain, thread}
        for tree in profile.callTrees:
            thread_pct = tree.root.totalPct
            _walk(tree.root, [], tgt, hits_by_chain, thread_pct, tree.thread)
        sorted_hits = sorted(hits_by_chain.values(), key=lambda x: -x['globalPct'])
        yield {"runtime": tgt['symbol'], "hits": sorted_hits[:tgt['max_hits']]}

def _walk(node, ancestor_chain, target, hits, thread_pct, thread_name):
    if target['symbol'] in node.name:
        chain = ancestor_chain[-3:]  # 3-hop
        chain_key = '>'.join(c.name[:50] for c in chain)
        if chain_key not in hits:
            hits[chain_key] = {
                'callerChain': ' ← '.join(reversed([c.name[:60] for c in chain])),
                'thread': thread_name,
                'globalPct': node.totalPct * thread_pct / 100,
                'businessModule': _classify_module(chain),
            }
    new_chain = ancestor_chain + [node]
    for c in node.children:
        _walk(c, new_chain, target, hits, thread_pct, thread_name)
```

### 3.4 业务模块分类规则（关键）

把 caller chain 中关键标识符映射到业务模块：

```python
MODULE_RULES = [
    (["ConstantBuffersGLES", "InstancingBatcher", "MapConstantBuffers"], "RHI / GPU Instancing"),
    (["Mesh::SetVertexData", "MUIRendererBase", "MUIDefaultRenderer"], "MeshUI 顶点上传"),
    (["MUI", "MeshUI"], "MeshUI"),
    (["PlanarShadow", "ShadowPass"], "URP / 阴影"),
    (["BloomPass", "PostProcess"], "URP / 后处理"),
    (["OutsideForestRenderer", "DrawFoliage"], "URP / 树木 Instancing"),
    (["RenderingCommandBuffer", "ScriptableRenderContext"], "URP / 命令缓冲"),
    (["TServer", "TServerManager"], "网络消息处理"),
    (["LuaMgr", "LuaCall", "XLua"], "Lua"),
    (["UIGeometryJob"], "UGUI（应该已迁移到 MeshUI）"),
    (["Adreno"], "GPU 驱动（不可优化）"),
    (["libAkSoundEngine"], "Wwise"),
    (["Enumerator", "MoveNext"], "C# 迭代器"),
]

def _classify_module(chain):
    for keywords, module in MODULE_RULES:
        for c in chain:
            if any(kw in c.name for kw in keywords):
                return module
    return "未分类"
```

### 3.5 验收口径

终极报告 §9.1 / §9.2 / §9.3 / §9.4 表格能直接从 `callUpTracing` 渲染，不再人肉。

---

## 4 业务模块归一表

### 4.1 目标产物

把 §3 反查里的 `MODULE_RULES` 推广到**所有 callTree 节点**，输出一份"业务模块总占比"：

```jsonc
{
  "businessModules": [
    {
      "module": "ECS 移动系统",
      "globalPct": 3.49,
      "constituents": [
        {"func": "MoveChain_SoldierMoveSystem.SoldierMoveJob", "selfPct": 1.36},
        {"func": "MoveChain_ArmyMoveSystem.ArmyMoveJob", "selfPct": 0.49},
        ...
      ]
    },
    {
      "module": "Wwise 音频",
      "globalPct": 10.06,
      "constituents": [...]
    },
    ...
  ]
}
```

报告 §8 业务模块归一 + §0.3 压力来源 Top-N = 渲染这个数据。

### 4.2 代码落点

`simpleperf/simpleperf_analyzer/module_aggregator.py` 接受 MODULE_RULES + callTree，输出聚合后的模块占比。

### 4.3 验收口径

终极报告 §8 表能直接从 `businessModules[]` 读出。

---

## 5 线程身份自动识别（auto-thread-tagger）

### 5.1 目标产物

每条线程除了原始名外，附加 `identity` 字段：

```jsonc
{
  "threadCpuMs": {
    "UnityMain":       { "ms": 16657, "identity": "main_thread" },
    "Thread-102":      { "ms": 9712,  "identity": "rhi_thread", "evidence": "GfxDeviceWorker::RunCommand 99.36%" },
    "NativeThread":    { "ms": 4893,  "identity": "wwise_worker", "evidence": "libAkSoundEngine.so 99.81%" },
    "Thread-129":      { "ms": 1936,  "identity": "job_worker" },
    "Thread-135":      { "ms": 1889,  "identity": "job_worker" },
    ...
  }
}
```

### 5.2 识别规则

```python
THREAD_IDENTITY_RULES = [
    # (priority, identity, fn)
    (10, "main_thread", lambda t: t.name == "UnityMain" or _has_in_stack(t, "ExecutePlayerLoop", min_pct=30)),
    (20, "render_thread", lambda t: t.name.startswith("UnityGfxRenderS") or _has_in_stack(t, "ScriptableRenderContext::ExtractAndExecute", min_pct=30)),
    (30, "rhi_thread", lambda t: _has_in_stack(t, "GfxDeviceWorker::RunCommand", min_pct=50) or _has_in_stack(t, "RunGfxDeviceWorker", min_pct=50)),
    (40, "wwise_worker", lambda t: _has_in_stack(t, "libAkSoundEngine", min_pct=80, by="lib")),
    (50, "lua_mtgc", lambda t: _has_in_stack(t, "lua_gc", min_pct=30) or _has_in_stack(t, "LuaMtGc", min_pct=30)),
    (60, "job_worker", lambda t: _has_in_stack(t, "JobQueue::WorkLoop", min_pct=50)),
    (70, "audio_callback", lambda t: t.name.startswith("AAudio") or "AudioTrack" in t.name),
    (80, "choreographer", lambda t: "Choreograp" in t.name),
    (99, "unidentified", lambda t: True),
]

def identify(thread):
    for prio, identity, fn in sorted(THREAD_IDENTITY_RULES, key=lambda x: x[0]):
        if fn(thread):
            return identity
    return "unidentified"
```

### 5.3 验收口径

终极报告 §4 线程分布表中"真实身份"列，必须能从 `threadCpuMs.<name>.identity` 直接读出。`unidentified` 数量 ≤ 总线程数的 10%。

---

## 6 PlayerLoop 阶段自动展开

### 6.1 目标产物

对主线程 callTree 内的 `ExecutePlayerLoop` 子树，自动拆解为各 PlayerLoop 阶段：

```jsonc
{
  "playerLoopStages": [
    {
      "stage": "ScriptRunBehaviourUpdate",
      "phase": "Update",
      "totalPctMain": 32.74,
      "globalPct": 12.86,
      "absSamples": 5948,
      "baseAbsSamples": 2624,
      "absDeltaPct": 126.7
    },
    {"stage": "ScriptRunBehaviourLateUpdate", ...},
    {"stage": "FinishFrameRendering", ...},
    ...
  ]
}
```

### 6.2 阶段关键字表

```python
PLAYERLOOP_STAGES = [
    ("Update.ScriptRunBehaviourUpdate", "UpdateScriptRunBehaviourUpdate"),
    ("PreLateUpdate.ScriptRunBehaviourLateUpdate", "PreLateUpdateScriptRunBehaviourLateUpdate"),
    ("PostLateUpdate.PlayerSendFrameComplete", "PostLateUpdatePlayerSendFrameComplete"),
    ("PostLateUpdate.PlayerUpdateCanvases", "PostLateUpdatePlayerUpdateCanvases"),
    ("PreLateUpdate.ParticleSystemBeginUpdateAll", "PreLateUpdateParticleSystemBeginUpdateAll"),
    ("PostLateUpdate.ParticleSystemEndUpdateAll", "PostLateUpdateParticleSystemEndUpdateAll"),
    ("PreLateUpdate.LegacyAnimationUpdate", "PreLateUpdateLegacyAnimationUpdate"),
    ("PostLateUpdate.FinishFrameRendering", "PostLateUpdateFinishFrameRendering"),
    ("EarlyUpdate.UpdateTextureStreamingManager", "EarlyUpdateUpdateTextureStreamingManager"),
    ("PostLateUpdate.PlayerEmitCanvasGeometry", "PostLateUpdatePlayerEmitCanvasGeometry"),
    ("PostLateUpdate.UpdateAllRenderers", "PostLateUpdateUpdateAllRenderers"),
    ("PreUpdate.SendMouseEvents", "PreUpdateSendMouseEvents"),
    ("LuaMultiThreadGC", "LuaMultiThreadGC"),
    ("Init/Sim/PresentationSystemGroup", ["InitializationSystemGroup", "SimulationSystemGroup", "PresentationSystemGroup"]),
]
```

### 6.3 验收口径

终极报告 §5 表能直接从 `playerLoopStages[]` 读出，无需人肉。

---

## 7 业务检测项替换栈回溯锚点

### 7.1 现状问题

`simpleperf_analyzer/config.py` 的 `DEFAULT_ANCHOR_FUNCS` = `[ExecutePlayerLoop, ScriptRunBehaviourUpdate, GfxDeviceWorker::RunCommand, TranscriptScriptableRenderContext::ExecuteScriptableRenderLoop]`。

这些是"必然存在的引擎主干"，告诉你"主循环占 27%"完全没诊断价值。

### 7.2 修改方案

**保留 `DEFAULT_ANCHOR_FUNCS`，仅用于"符号化质量校验"**（检验栈展开能不能到引擎深处）。终极报告 §1.2 已经把这点说清楚了。

**新增 `BUSINESS_PROBES`**：用于报告业务诊断。这些 probe 已在 §1.2 列出。

### 7.3 代码落点

`simpleperf_analyzer/config.py`：

```python
# 仅用于符号化校验（不进报告主体）
DEFAULT_ANCHOR_FUNCS = [
    "ExecutePlayerLoop",
    "ScriptRunBehaviourUpdate",
    "GfxDeviceWorker::RunCommand",
    "TranscriptScriptableRenderContext::ExecuteScriptableRenderLoop",
]

# 业务检测项（替代 v1 中把 anchor 当业务诊断用的错误做法）
BUSINESS_PROBE_REGISTRY = "simpleperf_analyzer.probes:PROBES"
```

---

## 8 Lua 总负载完整公式

### 8.1 当前不足

`build_simpleperf_profile.py` 输出 `cpu.lib.libxlua.pct`，但**没有把 libil2cpp 中 XLua 桥接路径加进来**。

### 8.2 完整公式实现

```python
def compute_lua_total_load(profile):
    """libxlua.so 占比 + libil2cpp 中所有 XLua 桥接路径 self% 之和。"""
    libxlua_pct = profile.lib_pct("libxlua")
    
    bridge_keywords = ["XLua", "xluaL_", "xlua_", "CSLua", "LuaCS", "LuaCallBack", "pin_invoke"]
    bridge_pct = 0.0
    
    for tree in profile.callTrees:
        thread_pct = tree.root.totalPct
        def walk(node):
            nonlocal bridge_pct
            if any(kw in node.name for kw in bridge_keywords):
                bridge_pct += node.selfPct * thread_pct / 100
            for c in node.children:
                walk(c)
        walk(tree.root)
    
    return {
        "libxlua_pct": libxlua_pct,
        "bridge_pct": bridge_pct,
        "total_pct": libxlua_pct + bridge_pct,
    }
```

### 8.3 验收口径

终极报告 §6.2 Lua 总负载表中三个数值（5.27% + 0.023% = 5.29%）能直接读出。

---

## 9 ECS 健康度检测

### 9.1 目标产物

```jsonc
{
  "ecsHealth": {
    "mainThreadWait": {
      "globalPct": 0.714,
      "inThreadPct": 1.856,
      "verdict": "yellow",
      "topPaths": [
        {"pct": 0.362, "path": "System.UpdateNewParents → JobHandle.ScheduleBatchedJobsAndComplete → WaitForJobGroupID"},
        ...
      ]
    },
    "workerBalance": {
      "workers": [
        {"thread": "Thread-129", "identity": "job_worker", "pct": 4.10},
        ...
      ],
      "maxMinDelta": 4.2,
      "verdict": "green"
    },
    "topBurstJobs": [
      {"func": "MoveChain_SoldierMoveSystem.SoldierMoveJob", "selfPct": 1.36, "module": "ECS 移动"},
      ...
    ]
  }
}
```

### 9.2 实现关键

- 主线程 Wait 检测必须**按调用栈路径去重**（同一路径出现多次只算一次）
- Worker 均衡度需要先用 §5 的 `auto-thread-tagger` 把 worker 识别出来再算
- topBurstJobs 直接从 lib_burst_generated.so 取 self% top-N

### 9.3 验收口径

终极报告 §6.7 三段表（mainwait + balance + topBurst）能直接渲染。

---

## 10 下钻树执行器

### 10.1 目标产物

按知识库 v2 §4 的下钻树定义，自动走访 callTree 输出"走过的路径 + 实测值"。

```jsonc
{
  "drilldownTraces": [
    {
      "trigger": "UnityMain libil2cpp pct = 18.38%",
      "tree": "tree.4.1",
      "path": [
        {"node": "Q1: ScriptRunBehaviourUpdate (32.74% main)", "type": "entry", "branch_taken": "ScriptRunBehaviourUpdate"},
        {"node": "Q1.1: 含 Lua/XLua?", "result": "yes (5.29% global)", "verdict": "green", "ref": "§6.2"},
        {"node": "Q1.2: 含 TServer*?", "result": "未独立成块", "verdict": "green", "ref": "§6.1"},
        ...
      ],
      "conclusion": "下钻无异常分支"
    }
  ]
}
```

### 10.2 下钻树定义格式

```yaml
# drilldown_trees.yaml
trees:
  - id: tree.4.1
    name: "UnityMain libil2cpp 占比偏高"
    trigger:
      check: "main_thread.lib.libil2cpp.pct > 30"  # 触发条件
    nodes:
      - id: Q1
        question: "进入 il2cpp 的入口在哪？"
        branches:
          - if: "child.name contains 'ScriptRunBehaviourUpdate'"
            then:
              - id: Q1.1
                question: "子节点含 'Lua' / 'XLua' / 'luaV_execute'?"
                action: "compute probe.lua.totalLoad, output verdict"
                ref: "§6.2"
              - id: Q1.2
                question: "子节点含 'TServer*'?"
                action: "compute probe.net.tserver, output verdict"
                ref: "§6.1"
              ...
```

### 10.3 复杂度评估

这一项**复杂度较高**（设计 DSL + 执行器），可以作为 **第二阶段产物**——先把 §1-§9 实现好，再做这个。短期内人肉跑下钻树也能满足报告需求。

---

## 11 报告生成 prompt 模板重写

### 11.1 当前情况

`.claude/skills/perfetto-trace-analysis/`、`.claude/skills/unity-profiler-analysis/`、`scripts/perfetto_provider.py` 等都用 AI 写报告，但 prompt 模板是"罗列经验"形态，不是"按检测项 + 下钻树"形态。

### 11.2 新 prompt 模板骨架

```markdown
# simpleperf 报告生成 prompt（v2）

## 输入
- simpleperf-profile.json
- simpleperf-profile-diff.json（base 对照）
- knowledge: docs/aoe-cpu-analysis-knowledge.md（v2）

## 输出结构（严格按章节）

### §0 结论先行
- §0.1 普通话结论：1-2 句话总体判定
- §0.2 红线告警清单：把 `probes[]` 里 verdict in ('red', 'yellow') 的列出来，0 条则明确标"0 条触发"
- §0.3 压力来源 Top-N：按 `businessModules[]` 的 abs_delta 排序，取前 5-9 名
- §0.4 本次判定与建议方向

### §1 采集元信息与质量门
- 直接读 meta + symbolCheck
- 锚点章节：明确说"仅用于符号化校验，不进业务诊断"

### §2-§4 代码层 / 库 / 线程分布
- 全部双口径（pct + absSamples + delta_pct）
- 线程身份直接读 `identity` 字段

### §5 PlayerLoop 阶段
- 直接渲染 `playerLoopStages[]`

### §6 业务检测项（按 §3 § 知识库 v2 §6 逐条）
- 每个 probe 独立成节
- 每节四段：本节回答的问题 / 数据来源方法 / 本次观察 / 红线门槛

### §7 下钻演示
- 选 1-2 个最突出的症状走 §4 下钻树

### §8 业务模块归一汇总
- 直接渲染 `businessModules[]`

### §9 反查清单
- 直接渲染 `callUpTracing[]`

### §10 本源能力边界
- 直接复用知识库 v2 §9

### §11 工程化建议
- 用 <!-- TOOL: --> 注释标 caller 路径（如果还有需要的工程能力补充）

## 硬性规则

1. 0 红线触发也要写报告——结论是"轻度偏离 / 符合预期"
2. 正常项也要展开，标 🟢 + 实测值 + 红线参考
3. 反查类章节禁止写"分散在各处"
4. 所有数值附 evidence_key（probes[*].evidence_key）
5. 双口径不可省略
```

### 11.3 落点

`.claude/skills/simpleperf-analysis/SKILL.md` （新建）。

---

## 12 多次采集 baseline 数据库（长期趋势）

### 12.1 远期目标

不只是 "base vs current" 单次对比，而是**版本质量长期看板**：

- 每次采集入库
- 每次都和"近 3 次同设备/同场景"的均值做对比
- 出现"连续 3 次同方向偏离"时告警
- web 端可视化趋势线

### 12.2 复杂度高，最后做

需要 web 端配合（DB schema、UI、查询接口）。属于 Phase 4 远期能力。

---

## 13 实施路线（按 ROI 排序）

| 顺序 | 阶段 | 工作量 | 产出 |
|---|---|---|---|
| 1 | §1 probe 引擎 + §2 双口径 diff | 1-2 周 | ingest 阶段自动算所有 probe + base diff，报告 §0/§3/§4/§5 数据全部不再人肉 |
| 2 | §3 反查引擎 + §4 业务模块归一 | 1 周 | 报告 §8/§9 自动产出 |
| 3 | §5 线程身份识别 + §6 PlayerLoop 自动展开 + §8 Lua 总负载 + §9 ECS 健康度 | 1 周 | 报告 §4/§5/§6.2/§6.7 全部自动 |
| 4 | §7 业务 probe 替换锚点 + §11 prompt 模板重写 | 半周 | AI 写报告"按结构化数据组合"，不再人肉捞针 |
| 5 | §10 下钻树执行器 | 1-2 周 | §7 章节自动产出 |
| 6 | §12 长期趋势看板 | 2-4 周 | 版本质量长期对比 |

**总计**：**6-12 周（不含 web 端长期看板）**，可分阶段产出。

---

## 14 验收最终态

完成 §1-§9 后，重新跑一次 stressmove 数据，**AI 写出的报告应该与人肉写出的 `performance-report_simpleperf_ULTIMATE_v1.md` 内容 80%+ 一致**——所有数值表格、检测项判定、反查清单、模块归一全部由结构化数据驱动；AI 只负责"语言层面的组织和叙述"。

**只剩这两件事是 AI 自由发挥**：
1. §0.1 普通话结论（基于 probe 整体形势的提炼）
2. §0.4 建议方向（基于 top-N 压力来源的工程判断）

其他全部用代码确定性产出。

---

## 15 知识库 v2 的工程化映射

知识库 v2 中的每条规则都对应一个工程落点：

| v2 节 | 工程落点 |
|---|---|
| §0 方法论 | §1 probe + §2 diff 引擎实现强制双口径 |
| §1 术语 | §7 概念分离（unwind anchor vs business probe） |
| §2 线程身份识别 | §5 auto-thread-tagger |
| §3 业务检测项 | §1 probe 引擎 |
| §4 主线程分诊下钻树 | §10 下钻树执行器 |
| §5 PlayerLoop 检测项 | §6 PlayerLoop 自动展开 |
| §6 业务模块知识 | §1 probe + §4 模块归一 |
| §6.12 Wwise / §6.13 Boehm GC | §1 probe + §5 线程身份 |
| §7 运行时函数反查 | §3 反查引擎 |
| §8 红线阈值 | §1 probe 引擎 threshold |
| §9 本源能力边界 | 在 prompt 模板中固定输出 |

**意义**：知识库 v2 = 工程规则的"源"，工程能力 = 这些规则的"可执行实现"，AI 报告 = 在工程产出基础上的"叙述层"。**三层各司其职**。

---

## 15 threadCpuMs Provider bug 修复（#6, 必修）

### 15.1 现状 bug

`simpleperf/simpleperf_analyzer/perf_provider.py` 在 `build_profile_dict` 中：

```python
thread_cpu_ms = {}
for _p, th in profile.iter_threads():
    thread_cpu_ms[th["thread_name"]] = round(th["event_count"] / SCALE, 1)
```

`thread_name` 当字典 key。在本次 base 数据中有 **15 条**线程名都叫 `UnityMain`（tid 19292 真主线程 + tid 19816 LuaMtGc + 13 条短生命周期 C# 子线程），全部覆盖只剩最后一条（base UnityMain=12.1ms / sm UnityMain=9.2ms，错得离谱）。

### 15.2 修复方案

**方案 A（最小改动）**：复合 key

```python
thread_cpu_ms = {}
for _p, th in profile.iter_threads():
    key = f"{th['thread_name']}#{th['tid']}" if th['thread_name'] in thread_cpu_ms else th['thread_name']
    # 或者直接全部用复合 key
    key = f"{th['thread_name']}#{th['tid']}"
    thread_cpu_ms[key] = round(th["event_count"] / SCALE, 1)
```

**方案 B（治本）**：先按 §16 auto-thread-tagger 识别真实身份后再聚合

```python
threads_tagged = []
for _p, th in profile.iter_threads():
    identity = identify_thread(th)  # 见 §16
    canonical_name = f"{identity}#{th['tid']}" if identity == "unidentified" else identity
    threads_tagged.append((canonical_name, th['tid'], identity, th['event_count']))
# 然后再聚合
```

推荐 **方案 B**，一并解决同名问题和身份识别问题。

### 15.3 验收口径

修完后，对本次 base / stressmove 两份数据重跑 Provider，预期：
- `threadCpuMs.main_thread#19292`（或 `UnityMain#19292`）= 与 metrics 中 `cpu.thread.UnityMain.pct` 一致
- `threadCpuMs.lua_mtgc_worker#19816` 出现且约 211 / 165 sample
- 不再出现单一 `UnityMain` 仅 12ms 的错误

---

## 16 线程身份自动识别 + 同名线程消歧（#5）

### 16.1 现状问题

当前 `_thread_call_trees` 按 `(event_count, pname, thread)` 排序取 top N，仅按线程名展示。没有：
1. 同名线程 (tid 19292 vs 19816 同名 UnityMain) 区分
2. 身份识别（Thread-102 → RHI / NativeThread → Wwise 等）

### 16.2 识别规则

按知识库 v2.1 §2 表实施：

```python
def identify_thread(profile, thread, top_subtree_threshold=30):
    """
    返回 (identity_canonical_name, evidence_str)
    """
    name = thread['thread_name']
    tid = thread['tid']

    # 优先级 1-2: 主线程 / Lua MtGC 工作线程（特殊：name 同样是 UnityMain，要区分）
    if name == 'UnityMain':
        # 检查 root callTree 入口
        cg = thread['call_graph']
        top_entry = _find_top_entry_symbol(cg)
        if 'LuaMultiThreadGC_LuaGCThreadProc' in top_entry:
            return ('lua_mtgc_worker', f'entry={top_entry}')
        if _has_in_callgraph(cg, ['ExecutePlayerLoop', 'nativeRender', 'UnityPlayerLoop'], min_pct=30):
            return ('main_thread', 'ExecutePlayerLoop reached')
        # 其余短生命周期 C# 子线程
        return (f'main_subthread_{tid}', f'unidentified UnityMain subthread')

    # 优先级 3: Render / RHI 线程
    if name.startswith('UnityGfxRenderS') or _has_in_callgraph(thread['call_graph'], ['ScriptableRenderContext::ExtractAndExecute', 'ExecuteScriptableRenderLoop'], min_pct=30):
        return ('render_thread', 'URP scheduler')
    if _has_in_callgraph(thread['call_graph'], ['GfxDeviceWorker::RunCommand', 'RunGfxDeviceWorker'], min_pct=50):
        return ('rhi_thread', 'GfxDeviceWorker')

    # 优先级 4: Wwise / Lua / Audio / Choreographer / Job Worker / Audio
    if _has_in_callgraph_by_lib(thread['call_graph'], 'libAkSoundEngine', min_pct=80):
        return ('wwise_worker', 'libAkSoundEngine dominates')
    if _has_in_callgraph(thread['call_graph'], ['JobQueue::WorkLoop'], min_pct=50):
        return ('job_worker', 'JobQueue.WorkLoop')
    if name.startswith('AAudio') or 'AudioTrack' in name:
        return ('audio_callback', 'system audio')
    if 'Choreograp' in name:
        return ('choreographer', '')

    return (f'unidentified_{name}_{tid}', 'no rules matched')


def _find_top_entry_symbol(callgraph):
    """从 root 一路下钻找到第一个非框架入口（如 LuaMultiThreadGC_LuaGCThreadProc）。"""
    # 入口序列: __start_thread → __pthread_start → ThreadStartWrapper → ...
    # 找深度 >= 5 的第一个含业务语义的 symbol
    pass


def _has_in_callgraph(cg, keywords, min_pct=30):
    """callTree 内任一节点 totalPct >= min_pct 且 name 含 keywords 之一。"""
    pass
```

### 16.3 输出 schema

```jsonc
{
  "threads": [
    {
      "tid": 19292,
      "comm": "UnityMain",
      "identity": "main_thread",
      "identity_evidence": "ExecutePlayerLoop reached",
      "globalPct": 44.61,
      "absSamples": 16124
    },
    {
      "tid": 19816,
      "comm": "UnityMain",      // 同名陷阱
      "identity": "lua_mtgc_worker",
      "identity_evidence": "entry=LuaMultiThreadGC_LuaGCThreadProc",
      "globalPct": 1.27,
      "absSamples": 211
    },
    {
      "tid": 19471,
      "comm": "Thread-102",
      "identity": "rhi_thread",
      "identity_evidence": "GfxDeviceWorker",
      "globalPct": 26.88,
      "absSamples": 9712
    },
    ...
  ]
}
```

### 16.4 验收口径

跑本次两份数据，预期识别表与终极报告 v2 §3 表完全一致：
- tid 19292 → main_thread
- tid 19816 → lua_mtgc_worker（**关键**：必须识别出来而不是当作 UnityMain）
- tid 19471 → rhi_thread
- tid 19814 → wwise_worker
- tid 19459/19460/19461/19462 → job_worker

---

## 17 GPU bound 判定算法（修正版，#11）

### 17.1 v1 错误判定

终极报告 v1 把"eglSwapBuffers 绝对负载 -20%"和"libGLESv2 占比 +0.6%"当成"GPU 不是瓶颈"的证据 —— 错误。

### 17.2 正确判定

按知识库 v2.1 §4.6 / §4.7 修正：

```python
def detect_gpu_bound(profile):
    """返回 (verdict, evidence_dict)。
    verdict: green / yellow / red
    """
    # 1. 主信号：主线程 GfxDeviceClient::WaitForPendingPresent
    main_wait_pct = _find_symbol_pct_in_thread(profile, 'main_thread',
        ['GfxDeviceClient::WaitForPendingPresent', 'GfxDeviceClient::PresentFrame'])
    # 2. 辅助信号：RHI 线程 eglSwapBuffers 子树
    rhi_egl_pct = _find_symbol_pct_in_thread(profile, 'rhi_thread',
        ['eglSwapBuffers', 'eglSwapBuffersWithDamageKHRImpl'], use_subtree=True)
    # 3. 辅助信号：是否出现 glClientWaitSync / glFinish
    has_hard_sync = _any_symbol_in_callgraphs(profile,
        ['glClientWaitSync', 'glFinish'])

    main_wait_global = main_wait_pct * thread_globalpct('main_thread') / 100

    if main_wait_global >= 5:
        return ('red', {'main_wait': main_wait_global, 'reason': 'GPU bound'})
    if main_wait_global >= 2:
        return ('yellow', {'main_wait': main_wait_global, 'reason': 'mild GPU pressure'})
    if rhi_egl_pct >= 15 or has_hard_sync:
        return ('yellow', {'rhi_egl': rhi_egl_pct, 'hard_sync': has_hard_sync,
                           'reason': 'RHI 信号偏高，主线程未阻塞，需配合 GPU counter 复核'})
    return ('green', {'main_wait': main_wait_global, 'rhi_egl': rhi_egl_pct})
```

### 17.3 报告中的措辞要求

**禁止**写"GPU 不是瓶颈"——这是绝对结论，simpleperf 单源无法支撑。

**允许**写："本次未观察到 CPU 侧 GPU bound 信号（主线程 WaitForPendingPresent <0.01% global）。simpleperf 本源不直接观测 GPU 计算时间，真实 GPU 工作量需 perfetto GPU counter 或 RenderDoc 复核。"

---

## 18 业务函数 Top-N (按 callTree 实测，#4)

### 18.1 目标

按主线程 callTree 实测的业务函数名做 Top-N，**不依赖 lib 维度也不依赖 PlayerLoop 阶段维度**。

### 18.2 关键字列表（按知识库 v2.1 §4 整理）

```python
BUSINESS_FUNC_KEYWORDS = [
    # 业务总入口
    ('FrameworkCore_OnUpdate', 'business_entry'),
    # Lua 路径
    ('LuaMgr_OnUpdate', 'lua'),
    ('BaseLuaMgr_OnUpdate', 'lua'),
    # 网络
    ('TServerManager_OnUpdate', 'network'),
    ('TServer_Tick', 'network'),
    ('TServer_DecodeMessages', 'network'),
    ('TServer_HandleMessages', 'network'),
    ('TServer_RecvMessages', 'network'),
    # C# 业务管理器
    ('MapManager_OnUpdate', 'csharp_mgr'),
    ('MapManager_OnLateUpdate', 'csharp_mgr'),
    ('MapManager_MeetScope', 'csharp_mgr'),
    ('BattleUIManager_OnUpdate', 'csharp_mgr'),
    ('BattleUIManager_UpdateMUIPos', 'csharp_mgr'),
    ('BattleUIManager_UpdateSingleUIPos', 'csharp_mgr'),
    ('OutSideViewArmyLineMgr_OnUpdate', 'csharp_mgr'),
    ('OutSideViewArmyLineMgr_UpdateStraightMoveLine', 'csharp_mgr'),
    ('OutSideViewArmyLineMgr_RefreshArmyLine', 'csharp_mgr'),
    ('OutSideViewArmyLineMgr_GetArmyLineID', 'csharp_mgr'),
    ('OutSideViewArmyLineMgr_OnUpdateLineEffect', 'csharp_mgr'),
    # MeshUI
    ('MUIControlManager_OnLateUpdate', 'meshui'),
    ('MUILayout_Set3DPosition', 'meshui'),
    ('MeshUIManager_OnLateUpdate', 'meshui'),
    # GC
    ('GC_end_stubborn_change', 'gc_boehm'),
    # Lua GC worker (按入口 symbol)
    ('LuaMultiThreadGC_LuaGCThreadProc', 'lua_gc_worker'),
]
```

### 18.3 实现

```python
def find_business_top_n(profile, base_profile=None, top_n=15):
    """在主线程 callTree 内扫描每个 BUSINESS_FUNC_KEYWORD，
    取最大 totalPct 节点，输出按绝对样本数排序的 Top-N。"""
    results = []
    main = profile.find_thread_by_identity('main_thread')
    sm_total = profile.total_samples
    main_pct = main.global_pct

    for kw, category in BUSINESS_FUNC_KEYWORDS:
        max_pct_in_thread = _max_subtree_pct(main.callgraph, kw)
        abs_samples = max_pct_in_thread / 100 * main_pct / 100 * sm_total
        if abs_samples < 50:  # 过滤噪音
            continue
        entry = {'function': kw, 'category': category,
                 'pct_main': max_pct_in_thread,
                 'pct_global': max_pct_in_thread * main_pct / 100,
                 'absSamples': abs_samples}
        if base_profile:
            base_pct = _max_subtree_pct_in_base(base_profile, kw)
            base_abs = base_pct / 100 * base_main_pct / 100 * base_total
            entry['baseAbs'] = base_abs
            entry['absDeltaPct'] = (abs_samples / base_abs - 1) * 100 if base_abs > 0 else None
        results.append(entry)
    return sorted(results, key=lambda x: -x['absSamples'])[:top_n]
```

### 18.4 验收口径

终极报告 v2 §0.3 Top-N 表 + §4.1 主线程业务函数 Top-N 全表必须能从此输出直接渲染。

---

## 19 阈值表更新（针对 v2.1）

| 检测项 | v1 阈值 | v2.1 阈值（修正后）| 说明 |
|---|---|---|---|
| probe.middleware.wwise | 🟢<5% / 🔴>15% | **🟢<3% / 🟡 3-7% / 🔴>7%** | v1 过松，单一中间件 10% 不可接受 |
| probe.gpu.bound 主信号 | （未定义清楚）| **主信号：UnityMain.WaitForPendingPresent，🟢<2% / 🟡 2-5% / 🔴>5%** | v1 错误地用 RHI eglSwap 当主信号 |
| probe.gpu.bound.eglSwap | （未拆分）| **辅助：🟢<10% / 🟡 10-15% / 🔴>15% rhi** | 仅作辅助，不单独判定 |
| probe.csharp.battleUIManager | （未定义）| **🟢<2% / 🟡 2-3% / 🔴>3% main** | 新增 |
| probe.csharp.outsideViewArmyLine | （未定义）| **🟢<2% / 🟡 2-3% / 🔴>3% main** | 新增 |

更新代码落点：`simpleperf/simpleperf_analyzer/probes.py:PROBES` 字典 + 报告生成 prompt 模板。

---

## 20 实施路线（v2 调整后）

| 顺序 | 阶段 | 工作量 | 产出 |
|---|---|---|---|
| 1 | **#6 threadCpuMs bug 修 + #5 线程身份识别**（合并做）| 2-3 天 | 同名线程问题彻底解决，Lua GC worker 自动识别 |
| 2 | #1 probe 引擎 + #11 GPU bound 算法 + #19 阈值更新 | 1-2 周 | 红线告警清单自动产出 |
| 3 | #2 双口径 diff 引擎 + #4 业务函数 Top-N | 1 周 | §0.3 Top-N / §3 / §4 / §5 自动产出 |
| 4 | #3 反查引擎 + #9 Lua 总负载 + #10 ECS 健康度 | 1 周 | §7 / §10 / §11 自动产出 |
| 5 | #8 业务 probe 替换锚点 + #7 PlayerLoop 自动展开 | 3-5 天 | §5 自动产出 |
| 6 | #13 prompt 模板重写 | 3-5 天 | AI 写报告 = 在结构化数据上做语言层组合 |
| 7 | #12 下钻树执行器（可延后）| 1-2 周 | §4 下钻演示自动产出 |
| 8 | #14 长期趋势看板（可延后）| 2-4 周 | 版本质量长期对比 |

**总计**：6-12 周可分阶段产出。**前 2 项（#5/#6）是必修 bug，必须最先做**。

---

> 工程化路线图 v2 结束。

