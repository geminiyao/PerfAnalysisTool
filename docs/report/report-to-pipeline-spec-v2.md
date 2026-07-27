# simpleperf 单源 工程化路线图 v2 — 任务卡片

> **本文档目标**：把"AI 自动产出 v4.1 形态 simpleperf 性能分析报告"这件事拆解为可独立接手实现的工程任务卡片。每张卡片**自包含**：含目标、文件落点、输入输出、算法关键点、验收清单、依赖。
>
> **场景定义**：用户在 Web 端拖入两份 simpleperf 采集（`base.data` + `cur.data`）+ 对应符号表 → 后端 Provider 解析 → AI 基于结构化数据生成报告 → Web 渲染 → 全流程 5-10 分钟内完成。
>
> **目标产物形态**：[performance-report_simpleperf_ULTIMATE_v4.md](./performance-report_simpleperf_ULTIMATE_v4.md)（金标准参考）
>
> **配套**：
> - 知识库：[aoe-cpu-analysis-knowledge.md](../aoe-cpu-analysis-knowledge.md) v2.1
> - 现有 Provider：[simpleperf/simpleperf_analyzer/perf_provider.py](../../simpleperf/simpleperf_analyzer/perf_provider.py)
> - 现有 Web ingest：[web/server/services/run-ingest-service.ts](../../web/server/services/run-ingest-service.ts)
>
> **任务卡片格式**：`卡片 X.Y — 标题 [工作量天 | 依赖]`
>
> **总体分阶段**：Phase 0（必修 bug，0.5 周）→ Phase A（Provider 增强，2-3 周）→ Phase B（Web 接入，1-2 周）→ Phase C（AI 报告生成，1 周）。总计 **4-6 周**。

---

## 总览：卡片清单

| 卡片 | 标题 | Phase | 工作量 | 依赖 |
|---|---|---|---|---|
| 0.1 | threadCpuMs Provider bug 修复 | 0 | 0.5 天 | — |
| A.1 | 线程身份自动识别（thread_tagger）| A | 2 天 | 0.1 |
| A.2 | PlayerLoop 阶段自动展开 | A | 1 天 | — |
| A.3 | 业务模块归一表 | A | 2 天 | — |
| A.4 | 运行时函数反查引擎 | A | 2 天 | — |
| A.5 | probe 检测引擎 | A | 2 天 | A.3 |
| A.6 | base vs cur diff 引擎 | A | 2 天 | A.2/A.3/A.4/A.5 |
| A.7 | CLI --base 参数 + 一次双采集输出 | A | 0.5 天 | A.6 |
| A.8 | 业务函数 Top-N 算法（洋葱剥离 + 模块聚合）| A | 2 天 | A.3/A.6 |
| A.9 | 主线程完整调用树（带 PlayerLoop 阶段标注）| A | 1 天 | A.1/A.2 |
| B.1 | Web 上传接口扩展（双采集 + 符号表）| B | 2 天 | A.7 |
| B.2 | DB schema 扩展 | B | 1 天 | A.6 |
| B.3 | Web 报告渲染组件（11 个章节）| B | 5 天 | B.2 |
| B.4 | Web Mermaid 图表集成 | B | 0.5 天 | B.3 |
| C.1 | AI prompt 模板（v4.1 章节范式）| C | 3 天 | A.* 全部 |
| C.2 | AI 生成报告调用链 | C | 2 天 | B.1/C.1 |

---

## Phase 0 — 必修 Bug

### 卡片 0.1 — threadCpuMs Provider bug 修复 [0.5 天 | 无依赖]

#### 目标

当前 `simpleperf/simpleperf_analyzer/perf_provider.py` 的 `threadCpuMs` 字典用 `thread_name` 当 key，但实测一份采集中可能存在多条同名线程（如本项目中有 15 条线程 comm 都叫 `UnityMain`，分别是真主线程 tid 19292 + Lua MtGC worker tid 19816 + 13 条 C# 短生命周期子线程），同名覆盖导致只剩最后一条，数据失真。

#### 根因定位

`perf_provider.py:452-454`：

```python
thread_cpu_ms = {}
for _p, th in profile.iter_threads():
    thread_cpu_ms[th["thread_name"]] = round(th["event_count"] / SCALE, 1)
```

`th["thread_name"]` 在多条同名线程下会互相覆盖。

#### 修复方案

复合 key `{thread_name}#{tid}`：

```python
thread_cpu_ms = {}
for _p, th in profile.iter_threads():
    key = f"{th['thread_name']}#{th['tid']}"
    thread_cpu_ms[key] = round(th["event_count"] / SCALE, 1)
```

> **不要**单独修这一处后就交差。Provider 内其他用 `thread_name` 当 key 的地方（如 `_thread_call_trees` 中的 `t["thread"]`）都要复合 key 或确保按 tid 取数据。这是个工程清洁问题。

#### 文件落点

- `simpleperf/simpleperf_analyzer/perf_provider.py:452-454`（主要）
- `simpleperf/simpleperf_analyzer/perf_provider.py:282-285`（callTrees 输出，确认 `t["thread"]` 唯一性）

#### 输入

无新增输入。沿用现有 `profile` 对象（含 `tid` 字段，由 `loader.py` 加载）。

#### 输出

- `simpleperf-profile.json` 中 `detail.simpleperf.threadCpuMs` 字段必须包含所有非零线程，key 复合，互不覆盖。
- 数量应该 ≥ `cur.data` 实际线程数（参考实测：base 数据约 60 条，cur 数据约 80 条）。

#### 验收清单

1. ✅ 对本仓库 `D:/Android/.../perf_aoeyz_base.data` 重跑 `build_simpleperf_profile.py`，输出 `simpleperf-profile.json` 的 `threadCpuMs` key 数量 ≥ 50（避免覆盖）。
2. ✅ 在结果中 grep `UnityMain` 应出现 ≥ 2 条（真主线程 + Lua MtGC worker），证明同名不覆盖。
3. ✅ 真主线程 tid 19292 对应的 ms 值约 16,000-17,000（占 cpu-cycles event 的 44-46%），与 `cpu.thread.UnityMain.pct` metric 一致。
4. ✅ 既有单元测试通过（如有），无回归。

#### 工作量

0.5 天（含验证）。

---

## Phase A — Provider 层增强

### 卡片 A.1 — 线程身份自动识别（thread_tagger）[2 天 | 0.1]

#### 目标

为 Provider 输出的每条线程附加 `identity` 字段，自动识别真实身份（主线程 / Render / RHI / Job Worker / Wwise / Lua MtGC / 音频回调 / Choreographer / 未知）。这是后续 §3 线程对比表、§5 主线程树、§7 ECS 检测、§8 Wwise 章节、§9 Lua GC 章节的必要前提。

#### 文件落点

- 新增：`simpleperf/simpleperf_analyzer/thread_tagger.py`
- 修改：`simpleperf/simpleperf_analyzer/perf_provider.py`（在生成 `threadCpuMs` / `callTrees` 时调用 tagger）

#### 输入

每条线程的 `(name, tid, call_graph_root)`。`call_graph_root` 是 simpleperf RecordData 已生成的 callTree 根节点，含子节点和 `event_count`。

#### 输出

每条线程附加：

```jsonc
{
  "tid": 19816,
  "comm": "UnityMain",
  "identity": "lua_mtgc_worker",       // 规范化身份名
  "identity_evidence": "entry=LuaMultiThreadGC_LuaGCThreadProc"
}
```

`identity` 取值集合（按优先级降序）：

| identity | 识别条件 |
|---|---|
| `main_thread` | comm == "UnityMain" **且** call_graph 内出现 `ExecutePlayerLoop` / `nativeRender` / `UnityPlayerLoop` 节点 totalPct ≥ 30 |
| `lua_mtgc_worker` | call_graph 入口（深度 5-10）出现 `LuaMultiThreadGC_LuaGCThreadProc` / `lua_execute_mtgc` / `do_realgc` |
| `render_thread` | comm 含 `UnityGfxRenderS` **或** call_graph 出现 `ScriptableRenderContext::ExtractAndExecute` / `ExecuteScriptableRenderLoop` ≥ 30 |
| `rhi_thread` | call_graph 出现 `GfxDeviceWorker::RunCommand` / `RunGfxDeviceWorker` ≥ 50 |
| `wwise_worker` | call_graph 内 `libAkSoundEngine.so` 库占比 ≥ 80 |
| `job_worker` | call_graph 出现 `JobQueue::WorkLoop` ≥ 50 |
| `audio_callback` | comm 以 `AAudio_` 开头或含 `AudioTrack` |
| `choreographer` | comm 含 `Choreograp` |
| `main_subthread` | comm == "UnityMain" 但前面所有规则都未命中（短生命周期 C# 子线程，单条占比通常 < 0.2% global）|
| `unidentified` | 都不命中 |

#### 算法关键点

1. **优先级顺序固定**：先匹配 `lua_mtgc_worker`（因为它 comm 也是 UnityMain，需要在 `main_thread` 之前判定），再匹配 `main_thread`。
2. **入口 symbol 检测**（lua_mtgc_worker 用）：从 root 一路下钻深度 5-10 层，找第一个含 `LuaMultiThreadGC_LuaGCThreadProc` 关键字的节点。
3. **call_graph 占比检测**（其他规则用）：遍历整棵树，找所有匹配 keyword 的节点，取最大 totalPct（线程内占比）。
4. `identity_evidence` 字段必须填实，方便人肉复核。

#### 验收清单

1. ✅ 跑两份采集 base / cur：
   - tid 19292 → `main_thread`
   - tid 19816 → `lua_mtgc_worker`，evidence = `entry=LuaMultiThreadGC_LuaGCThreadProc`
   - tid 19471 → `rhi_thread`
   - tid 19814 → `wwise_worker`
   - tid 19459/19460/19461/19462 → `job_worker`
   - tid 19472 → `render_thread`
2. ✅ 其余 13 条同名 `UnityMain` 子线程 → `main_subthread`
3. ✅ `unidentified` 比例 < 10%（按线程数算）
4. ✅ 单元测试：用 mock 的 call_graph 验证每条规则单独生效。

#### 工作量

2 天。

---

### 卡片 A.2 — PlayerLoop 阶段自动展开 [1 天 | 无依赖]

#### 目标

在主线程 callTree 内自动识别 13 个 PlayerLoop 阶段（`Update.ScriptRunBehaviourUpdate` / `PreLateUpdate.LegacyAnimationUpdate` / ...），输出每阶段的 totalPct + abs samples，并配合 A.6 base diff 给出 base→cur 变化。

#### 文件落点

- 新增：`simpleperf/simpleperf_analyzer/playerloop_phases.py`
- 修改：`simpleperf/simpleperf_analyzer/perf_provider.py`（输出 `detail.simpleperf.playerLoopStages[]`）

#### 阶段关键字表

```python
PHASE_KEYWORDS = [
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
    ("LuaMultiThreadGC.main", "LuaMultiThreadGC"),
]
```

每个 tuple 为 (label, keyword)。算法：扫描主线程 callTree，找含 keyword 的最大 totalPct 节点，记录其 totalPct + abs samples。

#### 输出

```jsonc
"playerLoopStages": [
  {
    "label": "Update.ScriptRunBehaviourUpdate",
    "totalPctMain": 32.74,
    "totalPctGlobal": 12.86,
    "absSamples": 6075
  },
  ...
]
```

#### 验收清单

1. ✅ 对 cur 数据，输出 13 个阶段中至少 11 个被命中（base 数据中 ParticleSystemEnd / LuaMultiThreadGC 可能 0 命中）。
2. ✅ `Update.ScriptRunBehaviourUpdate` 在 cur 中 absSamples ≈ 6075 ± 5%，totalPctMain ≈ 32.74% ± 0.5%。
3. ✅ 阶段间的 abs samples 之和 ≤ 主线程总 abs（因为有重叠子节点，不强制求和等于）。

#### 工作量

1 天。

---

### 卡片 A.3 — 业务模块归一表 [2 天 | 无依赖]

#### 目标

按知识库 v2.1 §4 中列出的业务模块定义，把零散的业务函数聚合成模块（如 `MUIControlManager` + `MUILayout` + `MUIRendererBase` + `MUIText` + `MUISprite` 都归到 `meshui` 模块），输出每个模块的 self 合计 + 内部子函数 self 拆细。这是 §4 Top-N 和 §4.3-§4.6 各项细化的基础。

#### 文件落点

- 新增：`simpleperf/simpleperf_analyzer/business_modules.py`
- 修改：`simpleperf/simpleperf_analyzer/perf_provider.py`（输出 `detail.simpleperf.businessModules[]`）

#### 模块定义

```python
BUSINESS_MODULES = {
    'wwise': {
        'mode': 'lib_match',
        'lib': 'libAkSoundEngine',
        'display': 'Wwise 音频中间件',
    },
    'ecs_burst': {
        'mode': 'lib_match',
        'lib': 'lib_burst_generated',
        'display': 'ECS Burst Job 工作量',
    },
    'meshui': {
        'mode': 'subtree_sum_self',
        'scope': 'main_thread',
        'keywords': ['MUIControlManager', 'MUILayout', 'MUIRendererBase',
                     'MUIText', 'MUISprite', 'MeshUIManager', 'MUIRenderable',
                     'MUIDefaultRenderer', 'MUISpriteSliced', 'MUILayoutRoot',
                     'MUILayoutManager'],
        'display': 'MeshUI 迭代位置刷新',
    },
    'army_line': {
        'mode': 'subtree_sum_self',
        'scope': 'main_thread',
        'keywords': ['OutSideViewArmyLineMgr', 'OutsideLineCtrl',
                     'OutsideLineMesh', 'CalculateVertexJob'],
        'display': '行军线刷新（OutSideViewArmyLineMgr）',
    },
    'urp_main_render': {
        'mode': 'subtree_sum_self',
        'scope': 'main_thread',
        'keywords': ['UniversalRenderPipeline', 'RenderCameraStack',
                     'RenderSingleCamera', 'ScriptableRenderer_Execute',
                     'ExecuteRenderPass', 'ShadowPass', 'PlanarShadow',
                     'DrawRendererPass', 'BloomPass', 'MobileBaseRenderer',
                     'DrawFoliageInstanceRenderers', 'OutsideForestRenderer',
                     'OutsideTreeTypeRenderer', 'TBUBaseFeature', 'TBURenderGraph'],
        'display': 'URP 主线程渲染配置',
    },
    'rhi_const_upload': {
        'mode': 'subtree_sum_self',
        'scope': 'rhi_thread',
        'keywords': ['ConstantBuffersGLES'],
        'display': 'RHI 常量缓冲上传',
    },
    'rhi_drawcall': {
        'mode': 'subtree_sum_self',
        'scope': 'rhi_thread',
        'keywords': ['GfxDeviceGLES::DrawBuffers', 'DrawBuffersStereo',
                     'BeforeDrawCall', 'SetVertexStateGLES',
                     'ApplyGpuProgramGLES'],
        'display': 'RHI DrawCall 提交',
    },
    'lua_vm': {
        'mode': 'sum_self',
        'scope': 'all_threads',
        'keywords': ['luaV_execute', 'luaD_call', 'lua_pcall',
                     'luaH_get', 'propagatemark', 'luaC_step'],
        'display': 'Lua VM 解释执行',
    },
    'lua_gc_worker': {
        'mode': 'subtree_sum_self',
        'scope': 'lua_mtgc_worker',  # 依赖 A.1 thread_tagger
        'keywords': ['LuaMultiThreadGC_LuaGCThreadProc', 'lua_execute_mtgc',
                     'do_realgc'],
        'display': 'Lua GC 工作线程',
    },
    'network': {
        'mode': 'subtree_sum_self',
        'scope': 'main_thread',
        'keywords': ['TServerManager', 'TServer_Tick', 'TServer_DecodeMessages',
                     'TServer_RecvMessages', 'TServer_HandleMessages'],
        'display': '网络消息处理',
    },
}
```

> **模块定义来源**：知识库 v2.1 §4.x 各小节列出的业务函数名。

#### 三种聚合模式

| mode | 算法 |
|---|---|
| `lib_match` | 取 `cpu.lib.<libname>.pct` 直接作为模块占比 |
| `subtree_sum_self` | 在指定线程内（`scope`）扫描 callTree，匹配任一 keyword 的节点累加 selfPct × thread_global_pct / 100 |
| `sum_self` | 跨所有线程，同上算法 |

#### 输出

```jsonc
"businessModules": [
  {
    "id": "wwise",
    "display": "Wwise 音频中间件",
    "globalPct": 10.06,
    "absSamples": 4753,
    "children": []   // lib_match 模式无子拆细
  },
  {
    "id": "meshui",
    "display": "MeshUI 迭代位置刷新",
    "globalPct": 1.83,
    "absSamples": 866,
    "children": [
      {"function": "MUIControlManager.OnLateUpdate", "selfPctGlobal": 0.763, "absSelf": 360},
      {"function": "MUILayout.Set3DPosition", "selfPctGlobal": 0.702, "absSelf": 332},
      // ... top 10 子函数
    ]
  }
]
```

#### 验收清单

1. ✅ 对 cur 数据，输出至少 10 个业务模块。
2. ✅ `wwise` 模块 absSamples ≈ 4,753 ± 50（与 lib 占比一致）。
3. ✅ `meshui` 模块 absSamples 在 800-900 区间，children 至少 10 条且第一条是 `MUIControlManager.OnLateUpdate`，selfPctGlobal ≈ 0.763 ± 0.02。
4. ✅ `lua_gc_worker` 在 cur 中 absSamples ≈ 165 ± 5（验证 scope 用 thread_tagger 正确）。
5. ✅ 单元测试：mock 一棵 callTree，确认 keyword 匹配 + 跨线程累加正确。

#### 工作量

2 天。

---

### 卡片 A.4 — 运行时函数反查引擎 [2 天 | 无依赖]

#### 目标

实现知识库 v2.1 §5 反查清单：扫描全部 callTree 中运行时函数（`__memcpy` / `__memset` / `__ieee754_powf` / `GC_end_stubborn_change` / `tlsf_memalign` / `je_malloc` / 等）的出现位置，记录每个 hit 的 caller-3-hop 路径，按 caller 路径去重 + 业务模块归一。这是 §10 反查清单章节的数据源。

#### 文件落点

- 新增：`simpleperf/simpleperf_analyzer/call_up_tracer.py`
- 修改：`simpleperf/simpleperf_analyzer/perf_provider.py`（输出 `detail.simpleperf.callUpTracing[]`）

#### 反查目标列表

```python
CALL_UP_TARGETS = [
    '__memcpy', '__memset', 'memmove',
    '__ieee754_powf', '__ieee754_sqrtf', '__ieee754_atan2f',
    'GC_end_stubborn_change', 'GC_mark_from', 'GC_push_all',
    'tlsf_memalign', 'tlsf_malloc', 'tlsf_free',
    'je_malloc', 'je_free',
    'il2cpp::vm::Object::NewAllocSpecific', 'il2cpp_alloc',
    'ThreadsafeLinearAllocator::Allocate',
    'MemoryManager::Allocate', 'BucketAllocator::Allocate',
    'XXH32', 'XXH64',
]
```

#### Caller 归一表（业务模块映射）

```python
CALLER_MODULE_RULES = [
    (['ConstantBuffersGLES', 'InstancingBatcher', 'MapConstantBuffers'], 'RHI / GPU Instancing'),
    (['Mesh::SetVertexData', 'MUIRendererBase', 'MUIDefaultRenderer'], 'MeshUI 顶点上传'),
    (['MUIControlManager', 'MUILayout', 'MUIText', 'MUISprite', 'MUIRenderable'], 'MeshUI'),
    (['PlanarShadow', 'ShadowPass'], 'URP / 阴影'),
    (['BloomPass', 'PostProcess'], 'URP / 后处理'),
    (['OutsideForestRenderer', 'DrawFoliage', 'OutsideTreeTypeRenderer'], 'URP / 树木 Instancing'),
    (['RenderingCommandBuffer', 'ScriptableRenderContext', 'TranscriptScriptableRenderContext'], 'URP / 命令缓冲'),
    (['TServer', 'TServerManager'], '网络消息处理'),
    (['LuaMgr', 'XLua', 'luaV_execute', 'lua_pcall'], 'Lua'),
    (['UIGeometryJob'], 'UGUI 几何 Job'),
    (['Adreno'], 'GPU 驱动黑盒'),
    (['libAkSoundEngine'], 'Wwise'),
    (['Enumerator', 'MoveNext'], 'C# 迭代器'),
    (['OutSideViewArmyLineMgr', 'OutsideLineCtrl'], '行军线'),
    (['BattleUIManager'], '战斗 UI'),
]
```

#### 算法

```python
def trace_call_up(profile, targets, rules):
    """
    Walk every callTree forest. For each occurrence of a target symbol,
    record its 3-hop ancestor chain. Dedup by chain hash. Sort by global pct.
    """
    results = {}  # target -> list of {chain, thread, globalPct, module}
    for tree in profile.callTrees:
        thread_global_pct = tree.root.totalPct
        _walk(tree.root, [], tree.thread, targets, rules, results, thread_global_pct)
    output = []
    for target, hits in results.items():
        # dedup by chain hash, sort by globalPct desc
        deduped = _dedup_by_chain(hits)
        deduped.sort(key=lambda x: -x['globalPct'])
        output.append({
            'runtime': target,
            'totalGlobalPct': sum(h['globalPct'] for h in deduped),
            'topCallers': deduped[:10],
        })
    return output


def _walk(node, ancestor_chain, thread, targets, rules, results, thread_global_pct):
    name = node.name
    if name in targets:
        chain = ancestor_chain[-3:]  # 取最近 3 层父
        chain_key = ' < '.join(reversed([c.name[:60] for c in chain]))
        global_pct = node.totalPct * thread_global_pct / 100  # 用 line pct 还是 selfPct？算法 §3 注意
        module = _classify_module(chain, rules)
        results.setdefault(name, []).append({
            'callerChain': chain_key,
            'thread': thread,
            'globalPct': global_pct,
            'module': module,
        })
    new_chain = ancestor_chain + [node]
    for c in node.children:
        _walk(c, new_chain, thread, targets, rules, results, thread_global_pct)


def _classify_module(chain, rules):
    for keywords, module in rules:
        for c in chain:
            if any(kw in c.name for kw in keywords):
                return module
    return '未分类'
```

> **算法注**：`globalPct` 应该用 `node.totalPct`（line %）还是 `selfPct`？看每个反查目标：
> - `__memcpy` self 占比有意义（实际 cycles 都在它自己上） → 用 totalPct（约等于 selfPct，因为它是叶子）
> - `GC_end_stubborn_change` self ≈ totalPct（叶子）→ 同上
> - `ThreadsafeLinearAllocator::Allocate` 有可能再调子函数，应该用 line pct（totalPct）

实现时统一用 `totalPct`，叶子节点等价 selfPct。

#### 输出

```jsonc
"callUpTracing": [
  {
    "runtime": "__memcpy",
    "totalGlobalPct": 5.143,
    "topCallers": [
      {
        "callerChain": "ConstantBuffersGLES::UpdateCB < GfxDeviceWorker::RunCommand < ...",
        "thread": "rhi_thread",
        "globalPct": 0.85,
        "module": "RHI / GPU Instancing"
      },
      // ...
    ]
  },
  // ...
]
```

#### 验收清单

1. ✅ 对 cur 数据，`__memcpy` 反查输出 top callers ≥ 5 条。
2. ✅ 第一条 caller module 是 `RHI / GPU Instancing`，globalPct ≈ 0.85 ± 0.05。
3. ✅ `__ieee754_powf` 反查的 top 5 caller 全部 module = `UGUI 几何 Job`（业务设计如此）。
4. ✅ `GC_end_stubborn_change` 反查的 top caller 第一条 module 含 `MeshUI`。
5. ✅ 反查清单总条目数 = 反查目标数（约 21 条）。
6. ✅ 单元测试：mock callTree 验证 caller 链 3 hop 抓取正确 + dedup 正确。

#### 工作量

2 天。

---

### 卡片 A.5 — probe 检测引擎 [2 天 | A.3]

#### 目标

实现知识库 v2.1 §6 红线阈值表，为 19 个 probe 自动算实测值 + 判定 verdict。这是 §0 结论先行 + §5.3 红线扫描 章节的数据源。

#### 文件落点

- 新增：`simpleperf/simpleperf_analyzer/probes.py`
- 修改：`simpleperf/simpleperf_analyzer/perf_provider.py`（输出 `detail.simpleperf.probes[]`）

#### probe 定义表

> 完整 19 个 probe 见知识库 v2.1 §6。这里给出 schema 和 5 个示例：

```python
PROBES = {
    "probe.net.tserver": {
        "display": "网络消息（TServerManager 子树）",
        "kind": "module_subtree",
        "module": "network",  # 引用 A.3 BUSINESS_MODULES
        "unit": "%main",
        "thresholds": {"green": 8, "yellow": 15, "red": 100},
        "knowledge_ref": "v2.1 §4.1.1",
    },
    "probe.middleware.wwise": {
        "display": "Wwise 音频中间件",
        "kind": "module_lib",
        "module": "wwise",
        "unit": "%global",
        "thresholds": {"green": 3, "yellow": 7, "red": 100},
        "knowledge_ref": "v2.1 §4.10",
    },
    "probe.ecs.mainwait": {
        "display": "主线程 Job 等待",
        "kind": "subtree_in_thread",
        "thread": "main_thread",
        "keywords": ["WaitForJobGroupID", "JobHandle::Complete"],
        "dedup_by_path": True,
        "unit": "%global",
        "thresholds": {"green": 0.5, "yellow": 2, "red": 100},
        "knowledge_ref": "v2.1 §4.5",
    },
    "probe.ecs.jobworker.balance": {
        "display": "Job Worker 均衡度",
        "kind": "thread_balance",
        "thread_identities": ["job_worker"],  # 依赖 A.1
        "metric": "max_min_delta_pct",
        "thresholds": {"green": 20, "yellow": 30, "red": 100},
        "knowledge_ref": "v2.1 §4.5",
    },
    "probe.gpu.bound": {
        "display": "GPU bound 主信号",
        "kind": "subtree_in_thread",
        "thread": "main_thread",
        "keywords": ["GfxDeviceClient::WaitForPendingPresent", "GfxDeviceClient::PresentFrame"],
        "unit": "%global",
        "thresholds": {"green": 2, "yellow": 5, "red": 100},
        "knowledge_ref": "v2.1 §4.6",
    },
    # ... 其余 14 个 probe，按知识库 v2.1 §6 表逐条定义
}
```

#### 6 种 kind 实现

| kind | 算法 |
|---|---|
| `module_lib` | 取 `business_modules[<module>].globalPct` |
| `module_subtree` | 取 `business_modules[<module>].globalPct` 或 mainThreadPct（按 unit） |
| `subtree_in_thread` | 在指定 thread 的 callTree 内搜 keyword，去重路径后累加 totalPct |
| `thread_balance` | 取 thread_tagger 标的所有 `<identity>` 线程，算 (max-min)/min × 100 |
| `function_self_global` | 取某个 function 的全局 self% |
| `subtree_sum_self` | 在指定 scope 内累加多个 keyword 的 selfPct |

#### 输出

```jsonc
"probes": [
  {
    "id": "probe.middleware.wwise",
    "display": "Wwise 音频中间件",
    "value": 10.06,
    "unit": "%global",
    "absSamples": 4753,
    "thresholds": {"green": 3, "yellow": 7, "red": 100},
    "verdict": "red",
    "knowledge_ref": "v2.1 §4.10"
  },
  // ...
]
```

#### 验收清单

1. ✅ 对 cur 数据，输出 19 个 probe（与知识库 v2.1 §6 表一致）。
2. ✅ `probe.middleware.wwise` verdict = `red`，value ≈ 10.06 ± 0.1。
3. ✅ `probe.ecs.jobworker.balance` verdict = `green`，value ≈ 4.2 ± 0.5。
4. ✅ `probe.gpu.bound` verdict = `green`，value 接近 0（< 0.1）。
5. ✅ `probe.ecs.mainwait` verdict = `green`，value ≈ 0.71 ± 0.1。
6. ✅ 单元测试：每种 kind 至少 1 个 case。

#### 工作量

2 天。

---

### 卡片 A.6 — base vs cur diff 引擎 [2 天 | A.2/A.3/A.4/A.5]

#### 目标

对每个维度（库 / 线程 / PlayerLoop 阶段 / 业务模块 / 反查目标 / probe）计算 base→cur 的绝对增量 + 增量百分比 + 偏离系统总压力。这是报告每张表"绝对 Δ"列的数据源。

#### 文件落点

- 新增：`simpleperf/simpleperf_analyzer/diff_engine.py`

#### 输入

`base_profile_dict` 和 `cur_profile_dict`（两次 Provider 输出的 JSON）。

#### 输出

```jsonc
{
  "base": {"label": "base", "totalSamples": 36133, "durationSec": 20},
  "cur": {"label": "cur", "totalSamples": 47228, "durationSec": 20},
  "systemPressure": {"totalSamplesDeltaPct": 30.7},

  "libs": [
    {
      "lib": "libAkSoundEngine",
      "basePct": 0.97, "baseAbs": 349,
      "curPct": 10.06, "curAbs": 4753,
      "absDelta": 4404, "absDeltaPct": 1260.0,
      "excessVsSystem": 1229.3
    },
    // ...
  ],
  "threads": [...],                    // 含 identity
  "playerLoopStages": [...],
  "businessModules": [...],            // 含 children diff（子函数 self 也 diff）
  "callUpTracing": [...],              // 每个 runtime 函数的总 globalPct diff
  "probes": [...]                      // 每个 probe 的 cur value + base value + 判定
}
```

#### 算法关键点

- 所有维度统一公式：`absDeltaPct = (curAbs / baseAbs - 1) × 100`，若 baseAbs == 0 用字符串 `"NEW"`
- `excessVsSystem = absDeltaPct - systemPressure.totalSamplesDeltaPct`，正值=异常膨胀 / 负值=被挤掉
- diff 数据按 `|absDelta|` 降序排序（最大变化在前）
- businessModules 的 children 也要做 diff，base 没有的子函数标 NEW

#### 验收清单

1. ✅ 跑 base + cur 两份采集，输出完整 diff JSON。
2. ✅ `systemPressure.totalSamplesDeltaPct` ≈ 30.7 ± 0.1。
3. ✅ libs[] 第一条（按 |absDelta| 降序）是 `lib_burst_generated` 或 `libAkSoundEngine`。
4. ✅ businessModules[] 第一条按 absDelta 排是 `ecs_burst`（+4506）或 `wwise`（+4404）。
5. ✅ threads[] 中 Wwise 工作线程的 identity = `wwise_worker`，absDelta ≈ 4510。

#### 工作量

2 天。

---

### 卡片 A.7 — CLI --base 参数 + 一次双采集输出 [0.5 天 | A.6]

#### 目标

让 `build_simpleperf_profile.py` 同时接受 `--base` 和 `--perf`（cur），一次产出 3 个 JSON：base profile / cur profile / diff。

#### 文件落点

- 修改：`simpleperf/build_simpleperf_profile.py`

#### 命令行

```bash
python build_simpleperf_profile.py \
    --base D:/.../perf_aoeyz_base.data \
    --perf D:/.../perf_aoeyz_cur.data \
    --binary-cache D:/.../binary_cache \
    --out output/aoeyz_diff/
```

输出文件：

- `<out>/base/simpleperf-profile.json`
- `<out>/cur/simpleperf-profile.json`
- `<out>/diff/simpleperf-diff.json`

兼容旧用法：不传 `--base` 时只跑 cur，行为不变。

#### 验收清单

1. ✅ 双采集 CLI 一次跑完输出 3 个 JSON。
2. ✅ diff JSON 的内容与 A.6 单测一致。
3. ✅ 不传 `--base` 时单采集行为不变。

#### 工作量

0.5 天。

---

### 卡片 A.8 — 业务函数 Top-N 算法（洋葱剥离 + 模块聚合）[2 天 | A.3/A.6]

#### 目标

实现 v4.1 §4 全局 Top-N 列表：按"业务模块"聚合，按"绝对增量"降序，排除运行时函数（已归到 §10 反查清单）。

#### 文件落点

- 新增：`simpleperf/simpleperf_analyzer/top_n_engine.py`
- 修改：`simpleperf/simpleperf_analyzer/perf_provider.py`（输出 `detail.simpleperf.topN[]`）

#### 算法（洋葱剥离 + 模块聚合）

```python
def compute_top_n(business_modules_diff, exclude_runtime=True, top_k=12):
    """
    Input: A.6 diff 引擎产出的 businessModules diff（每模块含 baseAbs / curAbs / absDelta）。
    Output: Top-N list, sorted by absDelta desc.
    """
    candidates = list(business_modules_diff)

    # 过滤：可选移除运行时反查目标（如 __memcpy 这种不应该出现在 Top-N，它们归 §10）
    if exclude_runtime:
        runtime_module_ids = {'memcpy_caller', 'powf_caller', ...}
        candidates = [c for c in candidates if c['id'] not in runtime_module_ids]

    # 按绝对增量降序
    candidates.sort(key=lambda x: -x['absDelta'])

    return candidates[:top_k]
```

> **洋葱剥离**实际上已经在 A.3 业务模块归一里完成了——模块定义本身就是"剥洋葱后的真热点"。A.8 只需要按 absDelta 排序即可。

#### 输出

```jsonc
"topN": [
  {
    "rank": 1,
    "verdict": "green",                    // 与 probe 联动；若该模块对应 probe 触发红线则 red
    "moduleId": "ecs_burst",
    "display": "ECS Burst Job 工作量",
    "thread": "job_worker × 4",
    "baseAbs": 513, "curAbs": 5019,
    "absDelta": 4506, "absDeltaPct": 878.0,
    "remark": "已下沉 Worker 并行，不阻塞主线程"  // 自由文字，AI 在 prompt 里补
  },
  // ...
]
```

#### 验收清单

1. ✅ cur Top-N 第一条按 absDelta 排是 ecs_burst（+4506）或 wwise（+4404）。
2. ✅ Top-N 列表至少 8 条，至多 12 条。
3. ✅ MeshUI 模块 absDelta ≈ 842，行军线 absDelta ≈ 214。
4. ✅ 不出现单一函数（如 __memcpy）作为 Top-N 项。
5. ✅ verdict 列与 probe 引擎联动（如 wwise → red）。

#### 工作量

2 天。

---

### 卡片 A.9 — 主线程完整调用树（带 PlayerLoop 阶段标注）[1 天 | A.1/A.2]

#### 目标

输出适合 §5.2 渲染的完整主线程调用树 JSON，按 `totalPct` 剪枝到合理深度，节点附加：
- abs samples
- selfPct global
- 阶段 banner（顶层节点）
- markers（📈 / 🔴 / 🟡 / 🟢 / [wrapper]）

#### 文件落点

- 新增：`simpleperf/simpleperf_analyzer/main_thread_tree.py`
- 修改：`simpleperf/simpleperf_analyzer/perf_provider.py`（输出 `detail.simpleperf.mainThreadTree`）

#### Marker 规则

```python
def assign_marker(node, base_node, total_samples, system_pressure):
    """
    📈 新增压力源: absDelta >= 100 samples
    🔴 高 self 真热点: selfPct >= 0.05% global AND absSelf >= 100
    🟡 次级关注: selfPct >= 0.05% AND absSelf < 100  OR  totalPct >= 5% AND selfPct < 0.05% (wrapper but big)
    🟢 健康: 都不满足
    [wrapper]: selfPct < 0.05% global AND has child > 90% totalPct of self
    """
    markers = []
    abs_delta = node.curAbs - (base_node.curAbs if base_node else 0)
    if abs_delta >= 100:
        markers.append('📈')
    if node.selfPctGlobal >= 0.05 and node.absSelf >= 100:
        markers.append('🔴')
    elif node.selfPctGlobal >= 0.05:
        markers.append('🟡')
    elif node.totalPct >= 5 and node.selfPctGlobal < 0.05:
        markers.append('🟡')  # big wrapper
    else:
        markers.append('🟢')

    is_wrapper = (node.selfPctGlobal < 0.05 and any(
        c.totalPct / node.totalPct >= 0.9 for c in node.children
    ))
    return markers, is_wrapper
```

#### 输出

```jsonc
"mainThreadTree": {
  "thread": "main_thread",
  "absSamples": 18556,
  "globalPct": 39.29,
  "root": {
    "name": "ExecutePlayerLoop",
    "absSamples": 12808,
    "mainThreadPct": 68.88,
    "selfPctGlobal": 0.01,
    "markers": ["🟢"],
    "isWrapper": true,
    "phaseLabel": null,
    "children": [
      {
        "name": "Update.ScriptRunBehaviourUpdate",
        "phaseLabel": "Update.ScriptRunBehaviourUpdate",
        "absSamples": 6075,
        "mainThreadPct": 32.74,
        "markers": ["📈"],
        "isWrapper": false,
        "absDelta": 3364,
        "children": [/* 下钻 */]
      },
      // ...
    ]
  }
}
```

#### 验收清单

1. ✅ 主线程树根节点 absSamples ≈ 18,556 ± 50。
2. ✅ ExecutePlayerLoop 节点有 13 个阶段子节点（与 A.2 PlayerLoop 阶段对应）。
3. ✅ `Update.ScriptRunBehaviourUpdate` 节点 markers 含 📈，absDelta ≈ 3364。
4. ✅ `BattleUIManager.UpdateMUIPos` 节点 markers 含 📈，isWrapper = true。
5. ✅ `MUIControlManager.OnLateUpdate` 节点 markers 含 📈🔴。
6. ✅ 树深度合理（剪枝后单分支不超过 15 层），节点总数 < 200。

#### 工作量

1 天。

---

## Phase B — Web 接入

### 卡片 B.1 — Web 上传接口扩展（双采集 + 符号表）[2 天 | A.7]

#### 目标

让 Web 前端能上传两份 `.data` 文件 + 符号表压缩包，后端自动调用 A.7 CLI，存储产物。

#### 文件落点

- 修改：`web/server/services/run-ingest-service.ts`（新增 simpleperf diff 入库逻辑）
- 修改：`web/server/services/source-profile-runner.ts`（调用 `build_simpleperf_profile.py --base ... --perf ...`）
- 新增（如有必要）：`web/src/pages/UploadDiff.tsx`（双文件上传 UI）

#### 输入（前端 → 后端）

```typescript
interface SimpleperfDiffUploadRequest {
  baseFile: File;           // base perf.data
  curFile: File;            // cur perf.data
  symbolsArchive?: File;    // 可选：符号表 zip (.dbg.so 集合)
  meta: {
    device: string;
    sceneBase: string;      // "野外空场景"
    sceneCur: string;       // "stressmove"
    durationSec: number;
  };
}
```

#### 流程

```
upload → 保存到 storage → 调 buildSimpleperfProfile(--base --perf --binary-cache --out)
       → 等待返回 3 个 JSON 路径
       → 入库（详见 B.2 schema）
       → 创建 run record，返回 runId
       → 前端跳转 /runs/<runId>
```

#### 验收清单

1. ✅ 前端能拖入 2 个 `.data` 文件 + 1 个可选符号表 zip。
2. ✅ 后端能调通 CLI 并存储 3 个 JSON 到 `web/server/storage/runs/<runId>/`。
3. ✅ 入库后能通过 `GET /api/runs/<runId>` 返回 diff JSON 数据。
4. ✅ 错误处理：CLI 失败 / 符号化质量 FAIL / 文件大小超限。

#### 工作量

2 天。

---

### 卡片 B.2 — DB schema 扩展 [1 天 | A.6]

#### 目标

DB 新增表 / 字段，支持双采集对比和 v4.1 全部数据维度。

#### 文件落点

- 修改：`web/data/db.sqlite`（schema migration）
- 修改：`web/server/services/run-store.ts`

#### Schema 变化

新增表 `run_pairs`：

```sql
CREATE TABLE run_pairs (
  id TEXT PRIMARY KEY,
  base_run_id TEXT NOT NULL,
  cur_run_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  diff_json_path TEXT NOT NULL,
  FOREIGN KEY (base_run_id) REFERENCES runs(id),
  FOREIGN KEY (cur_run_id) REFERENCES runs(id)
);
```

新增字段（`runs` 表）：
- `scene_label TEXT`（如 "stressmove" 或 "野外空场景"）

新增表 `run_probes`（存 A.5 输出）：

```sql
CREATE TABLE run_probes (
  run_id TEXT NOT NULL,
  probe_id TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  abs_samples INTEGER,
  verdict TEXT CHECK(verdict IN ('green', 'yellow', 'red')),
  threshold_green REAL,
  threshold_yellow REAL,
  threshold_red REAL,
  knowledge_ref TEXT,
  PRIMARY KEY (run_id, probe_id)
);
```

新增表 `run_business_modules`（存 A.3 输出）：

```sql
CREATE TABLE run_business_modules (
  run_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  display TEXT,
  global_pct REAL,
  abs_samples INTEGER,
  children_json TEXT,  -- JSON array of {function, selfPctGlobal, absSelf}
  PRIMARY KEY (run_id, module_id)
);
```

新增表 `run_call_up_tracing`（存 A.4 输出）：

```sql
CREATE TABLE run_call_up_tracing (
  run_id TEXT NOT NULL,
  runtime_func TEXT NOT NULL,
  total_global_pct REAL,
  top_callers_json TEXT,
  PRIMARY KEY (run_id, runtime_func)
);
```

#### 验收清单

1. ✅ 新表创建成功，旧 runs 数据不受影响。
2. ✅ 跑 B.1 上传后能从 DB 查到 run_pairs / run_probes / run_business_modules / run_call_up_tracing。
3. ✅ migration 脚本可回滚。

#### 工作量

1 天。

---

### 卡片 B.3 — Web 报告渲染组件（11 个章节）[5 天 | B.2]

#### 目标

新建 React 组件渲染 v4.1 形态的报告页面。组件按章节切分，每个章节是独立组件，从 DB / JSON 读数据。

#### 文件落点

- 新增：`web/src/pages/SimpleperfDiffReport.tsx`（顶层页面）
- 新增：`web/src/components/simpleperf-report/`
  - `ConclusionPanel.tsx` — §0
  - `MetaPanel.tsx` — §1
  - `LibComparisonPanel.tsx` — §2（含 Mermaid 图表组件）
  - `ThreadComparisonPanel.tsx` — §3（含 Mermaid 图表组件）
  - `TopNPanel.tsx` — §4（卡片列表 + 内部子函数折叠展开）
  - `MainThreadTreePanel.tsx` — §5（递归树形组件，节点带 marker）
  - `RenderingPanel.tsx` — §6
  - `EcsPanel.tsx` — §7
  - `WwisePanel.tsx` — §8
  - `LuaGcPanel.tsx` — §9
  - `CallUpTracingPanel.tsx` — §10
  - `CapabilityBoundaryPanel.tsx` — §11

#### 数据来源

每个组件通过 `useRunPair(runPairId)` hook 拿到对应章节的数据：

```typescript
const { meta, libs, threads, playerLoopStages, businessModules,
        callUpTracing, probes, mainThreadTree, topN } = useRunPair(runPairId);
```

#### 关键交互

- §5 主线程树：可折叠展开，节点 hover 显示完整 caller path
- §4 Top-N：每项可展开看内部子函数表
- §10 反查清单：可按 runtime func / module 过滤
- §2 / §3 Mermaid 图：响应式，宽度跟容器
- 全报告：右侧固定章节导航锚点，可一键跳转

#### 验收清单

1. ✅ 11 个组件 + 顶层页面都能渲染，数据正确。
2. ✅ §0 结论先行展示 普通话 + 优化方向 4 条 + 红线告警卡片（与 probes 联动）。
3. ✅ §2 库占比表按 absDelta 降序，Mermaid 柱状图渲染正确。
4. ✅ §3 线程占比表同上，Wwise 工作线程标 identity = `wwise_worker`。
5. ✅ §4 Top-N 至少 8 张卡片，第一张是 ECS Burst Job。
6. ✅ §5 主线程树递归渲染，节点 markers 含 📈/🔴/🟡/🟢 + abs / mainThreadPct / selfPct。
7. ✅ §10 反查清单展示 21 个 runtime func，每个含 top callers。
8. ✅ §11 本源能力边界静态文本。

#### 工作量

5 天。

---

### 卡片 B.4 — Web Mermaid 图表集成 [0.5 天 | B.3]

#### 目标

集成 mermaid npm 包，让 §2 / §3 的柱状图正常渲染。

#### 文件落点

- 修改：`web/package.json`（加 `mermaid` 依赖）
- 新增：`web/src/components/MermaidChart.tsx`

#### 实现

```typescript
import mermaid from 'mermaid';
import { useEffect, useRef } from 'react';

export function MermaidChart({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      mermaid.run({ nodes: [ref.current] });
    }
  }, [chart]);
  return <div ref={ref} className="mermaid">{chart}</div>;
}
```

#### 验收清单

1. ✅ 装好 mermaid 包后 §2 / §3 的图表正常显示为柱状图。
2. ✅ 暗色/亮色主题切换图表样式同步。

#### 工作量

0.5 天。

---

## Phase C — AI 报告生成

### 卡片 C.1 — AI prompt 模板（v4.1 章节范式）[3 天 | A.* 全部]

#### 目标

写一份 prompt 模板，让 AI 拿到 Phase A 算好的结构化 JSON 后，能按 v4.1 形态生成报告。AI 只负责"叙述层"（§0 普通话结论、§4.x 业务含义和优化方向、章节衔接句），其余 95% 内容由数据驱动直接渲染。

#### 文件落点

- 新增：`.claude/skills/simpleperf-analysis-v2/SKILL.md`
- 新增：`.claude/skills/simpleperf-analysis-v2/template/section_templates.md`
- 新增：`.claude/skills/simpleperf-analysis-v2/references/knowledge_v2.1.md`（软链接到知识库）

#### Prompt 模板骨架（伪代码）

```
你是 simpleperf 性能分析专家。基于结构化数据生成 v4.1 形态报告。

【输入】
- profile_cur.json: meta, symbolCheck, libs, threads (含 identity), 
                    playerLoopStages, businessModules, callUpTracing,
                    probes, mainThreadTree, topN
- profile_base.json: 同上结构
- diff.json: 每个维度的 base→cur diff
- knowledge: docs/aoe-cpu-analysis-knowledge.md (v2.1)

【硬性输出规则】
1. 严格按 §0-§11 章节顺序产出
2. 每个表格的数据列只放纯数字，混合内容拆到说明列
3. 所有百分比标注分母（默认全局占比，非全局时在文字或表头里说明）
4. 主对比口径用"绝对样本数增量"（baseAbs vs curAbs vs absDelta）
5. 调用树用 ASCII 缩进 + 📈🔴🟡🟢 标记（按 mainThreadTree.markers 字段渲染）
6. Top-N 按 absDelta 降序，从 topN[] 字段直接取
7. 反查清单从 callUpTracing[] 字段直接渲染，不再"分散在各处"
8. 术语：cur 不写 stressmove，与场景解耦

【AI 自由发挥的边界】
仅以下内容 AI 生成：
- §0 普通话结论（基于 probes 整体形势 + topN 提炼出 1 段 + 优化方向 4 条）
- §4.x 各 Top-N 项的"业务含义"和"优化方向"（基于知识库 v2.1 §4.x 中的"典型问题"和"优化方向"段落）
- 各章节间的过渡句（不超过 1 句）

其余全部从结构化数据直接渲染。

【各章节模板】
§0: 见 section_templates/00_conclusion.md
§1: 见 section_templates/01_meta.md
...
```

#### section_templates 示例（`02_libs.md`）

```markdown
## §2 库（so）维度对比

### 2.1 库占比（按绝对增量降序）

{{# render table from diff.libs sorted by abs(absDelta) desc }}
| 库 | 绝对增量 | 增量% | cur abs | base abs | 占比 cur % | 说明 |
|---|---|---|---|---|---|---|
{{# for lib in diff.libs }}
| {{lib.name}} | {{lib.absDelta:+d}} | {{lib.absDeltaPct:+.1f}}% | {{lib.curAbs}} | {{lib.baseAbs}} | {{lib.curPct:.2f}}% | {{lib.remark or "AI 补 1 句业务含义"}} |
{{/ for }}

### 2.2 业务层 +{{businessLayerDeltaPct}}% 拆分

业务层定义：{{businessLayerDefinition}}

{{# render table from businessLayerBreakdown }}

#### 库占比绝对增量柱状图

```mermaid
xychart-beta
    title "库占比 base→cur 绝对增量 (samples)"
    x-axis [{{# join lib short-names }}]
    y-axis "样本数增量" {{minDelta}} --> {{maxDelta}}
    bar [{{# join lib absDeltas }}]
```
```

> **模板渲染器**实现可选：手写 Python / Jinja2 / 让 AI 自己按模板生成。推荐让 AI 按 system prompt 中的章节模板生成，避免引入额外渲染层。

#### 验收清单

1. ✅ prompt 模板能被 Claude / GPT 解析，单次调用不超 context 限制（数据 JSON 总量 < 100KB）。
2. ✅ 给 AI 喂本仓库 base + cur 数据，AI 产出报告与 v4.1 金标准在以下方面一致性 ≥ 80%：
   - §0 结论先行的 4 条优化方向命中（Wwise / MeshUI / 行军线 / GPU Instancing）
   - §2 库表第一条是 lib_burst_generated 或 libAkSoundEngine
   - §4 Top-N 第一条 absDelta = 4506 或 4404
   - §5 主线程树包含至少 10 个 PlayerLoop 阶段子节点
   - §10 反查清单的 __memcpy 第一 caller 是 ConstantBuffersGLES
3. ✅ AI 在以下数据驱动的字段上零幻觉：数字、verdict、identity、module display 名

#### 工作量

3 天（含 prompt 多轮迭代）。

---

### 卡片 C.2 — AI 生成报告调用链 [2 天 | B.1/C.1]

#### 目标

Web 后端在 ingest 完成后自动调用 AI 生成报告，存储为 markdown，前端可下载或在 Web 上以章节组件形式呈现。

#### 文件落点

- 修改：`web/server/services/run-analysis-service.ts`
- 修改：`web/server/services/ai-agent-session.ts`（或新建 `simpleperf-report-generator.ts`）

#### 流程

```
B.1 ingest 完成
  ↓
触发 AI 报告生成 task（异步）
  ↓
读 profile/diff JSON + knowledge 文件
  ↓
按 C.1 模板构造 system prompt + user message
  ↓
调 Claude/GPT API（推荐 Claude Sonnet 4.7，长 context）
  ↓
收到 markdown 报告
  ↓
存到 storage/runs/<runPairId>/report.md
  ↓
Web 前端拉 report.md 渲染或下载
```

#### 验收清单

1. ✅ 上传 base + cur 后 5-10 分钟内能拿到 report.md。
2. ✅ report.md 包含 §0-§11 全部章节。
3. ✅ Web 前端能切换"结构化 UI 视图"（用 B.3 组件）和"原始 markdown 视图"（report.md 渲染）。
4. ✅ AI 调用失败时有合理的 fallback（用结构化数据填模板的纯数据版，不带"业务含义"和"优化方向"）。

#### 工作量

2 天。

---

## 整体验收：端到端测试

完成所有卡片后，做一次端到端验收：

1. ✅ **测试场景 1（本仓库现有数据）**：上传 `perf_aoeyz_base.data` + `perf_aoeyz_stressmove.data` + 符号表，5-10 分钟内能在 Web 上看到完整报告。报告内容与 [performance-report_simpleperf_ULTIMATE_v4.md](./performance-report_simpleperf_ULTIMATE_v4.md) 在数据维度上完全一致，AI 生成段落语义相似度 ≥ 80%。
2. ✅ **测试场景 2（新数据）**：换一份其他场景的双采集（比如战斗 vs 主城），全流程跑通无报错，识别出对应场景的真热点（不应该把 stressmove 的结论硬套）。
3. ✅ **threadCpuMs 修复**：cur 数据的 threadCpuMs 键值 ≥ 50，不再出现 UnityMain 只有 12ms 的错误。
4. ✅ **线程身份识别**：tid 19816 在 Web 报告中正确显示为 `lua_mtgc_worker`，而不是误以为是主线程。
5. ✅ **GPU bound 判定**：probe.gpu.bound = green，且文字描述用"未观察到 CPU 侧 GPU bound 信号"而不是"GPU 不是瓶颈"。

---

## 接手前置说明

### 必读文档

接手开发前，请按顺序读：

1. [performance-report_simpleperf_ULTIMATE_v4.md](./performance-report_simpleperf_ULTIMATE_v4.md) — 目标产物，所有任务卡片都是为了产出这种形态的报告
2. [aoe-cpu-analysis-knowledge.md](../aoe-cpu-analysis-knowledge.md) v2.1 — 知识库，是所有 probe / 业务模块定义的来源
3. `simpleperf/simpleperf_analyzer/perf_provider.py` — 现有 Provider，所有 Phase A 卡片都在它基础上扩展
4. `web/server/services/run-ingest-service.ts` — 现有 Web ingest，Phase B 卡片在它基础上扩展

### 开发环境

- Python 3.13+（Provider）
- Node.js 20+（Web）
- Windows 11 / MSYS2 + Git Bash
- Android NDK r21e 路径：`D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/`
- 实测数据：`D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_base.data` 和 `perf_aoeyz_stressmove.data`
- 符号表：`D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/symbols/`

### 现有命令

```bash
# 单采集（现有，作为新 CLI 的兼容基线）
python simpleperf/build_simpleperf_profile.py \
    --perf D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_stressmove.data \
    --binary-cache D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/binary_cache \
    --out docs/report/_intermediate/stressmove

# 双采集（A.7 实现后，新 CLI）
python simpleperf/build_simpleperf_profile.py \
    --base D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_base.data \
    --perf D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_stressmove.data \
    --binary-cache D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/binary_cache \
    --out docs/report/_intermediate/aoeyz_diff
```

### 中间产物路径约定

所有产物放在 `docs/report/_intermediate/` 下，按 `<runPairId>/{base,cur,diff}` 结构组织。

### 注意事项

- **不要用 `/tmp` 或 `/dev/stdin`**：Windows 不支持。
- **不要把符号表打包进 Web 上传请求**：超过 1GB，应该提前上传到 storage / 配置 binary_cache 路径。
- **测试时优先用现有 base + cur 数据**：避免重新采集。
- **Phase A 各卡片可并行**：A.1/A.2/A.3/A.4 都不互相依赖，可分配给多人。

---

## 总时间线（推荐顺序）

| 周次 | 重点 | 验收点 |
|---|---|---|
| 第 1 周 | 0.1 + A.1 + A.2 + A.3 | 跑两份数据能输出 threads 含 identity / playerLoopStages / businessModules |
| 第 2 周 | A.4 + A.5 + A.8 + A.9 | 输出 callUpTracing / probes / topN / mainThreadTree |
| 第 3 周 | A.6 + A.7 + B.1 + B.2 | CLI 双采集跑通，Web 能上传并入库 |
| 第 4 周 | B.3（拆 5 个组件） | §0/§1/§2/§3/§4 章节渲染 |
| 第 5 周 | B.3（剩 6 个组件）+ B.4 | §5-§11 章节渲染 + Mermaid 图 |
| 第 6 周 | C.1 + C.2 + 端到端验收 | AI 自动产出报告，与金标准 v4.1 一致性 ≥ 80% |

总计 **4-6 周**，可分阶段交付：第 3 周末有"双采集后端跑通"里程碑，第 5 周末有"Web 可看报告（无 AI）"里程碑，第 6 周末有"AI 自动产出报告"完整里程碑。

---

> 工程化路线图 v2 结束。配套金标准：[performance-report_simpleperf_ULTIMATE_v4.md](./performance-report_simpleperf_ULTIMATE_v4.md)。配套知识库：[aoe-cpu-analysis-knowledge.md](../aoe-cpu-analysis-knowledge.md) v2.1。
