# 性能报告生成方法论：LLM 灵活参与 + 质量可控

> 沉淀自 simpleperf v4 差分报告流水线（commit `1faea84` / `c1d0d1b` / `22599c9` 阶段）
> 适用对象：perfetto / simpleperf / Unity Profiler 等性能数据源的报告 agent
> 目标：让 LLM 写出业务语境深的叙事，同时保证数字、表格、调用树**永不失真**

---

## 0. 目标矩阵

| 我们要的 | 我们怕的 |
|---|---|
| LLM 写出业务语境深的叙事（"为什么 cur 比 base 涨了 30%" / "ROI 排序" / "wrapper 与真热点的下钻关系"）| LLM 幻觉数字、改表格、丢调用栈节点 |
| 同份输入跑两次质量稳定（≥0.92× 金标准）| LLM 抽样导致质量大幅波动 |
| 新项目（换游戏 / 换中间件）能复用流水线 | 项目特化关键字到处硬编码 |
| 出错可降级（LLM 失败 → 仍交付报告）| 一旦 LLM 出问题整条链路死 |

---

## 1. 核心原则：分层契约

```
┌─────────────────────────────────────────────────┐
│ 数据层（perf.data / perfetto trace / proto）    │
└─────────────────────────────────────────────────┘
              ↓ 确定性 Python 解析
┌─────────────────────────────────────────────────┐
│ 结构化 JSON（数字 + 分类 + 调用链 + 反查）       │
└─────────────────────────────────────────────────┘
              ↓ 确定性 Markdown 骨架渲染
┌─────────────────────────────────────────────────┐
│ 带 <!-- LLM_FILL: ... --> 占位符的报告骨架      │
└─────────────────────────────────────────────────┘
              ↓ codebuddy / Claude CLI 填占位符
┌─────────────────────────────────────────────────┐
│ 最终交付报告                                     │
└─────────────────────────────────────────────────┘
              ↓ validate（数值）+ compare（结构 + 长度）
        ┌─────┴─────┐
   ≥0.95× 金标准   <0.82× 回退确定性模板
```

**关键划界**：哪些 LLM **永远不能**碰，哪些 **必须**接管。

| 章节类型 | 谁产出 | 理由 |
|---|---|---|
| 数字（探针值 / Top-N 表 / 调用栈样本数）| ❌ 永不 LLM | LLM 会幻觉数字 |
| 表格 / Mermaid 图 / 调用树（结构）| ❌ 永不 LLM | LLM 会改字段顺序、丢行 |
| 元信息 / 库分布表 / PlayerLoop phase 表 | ❌ 永不 LLM | 数据契约不能模糊 |
| 业务含义解读 / 优化建议 / ROI 排序 | ✅ 必须 LLM | 规则模板写不出业务语境 |
| wrapper-to-真热点桥接说明（1 句话）| ✅ LLM | 1-2 句业务连接，规则代码写不动 |
| 反查清单的"主要来源结论"句 | ✅ LLM | 总结性的，规则代码写不动 |

---

## 2. 七条工程经验（按重要性排序）

### 2.1 占位符模式：LLM_FILL 不是泛化指令

每个占位符都是一个**任务卡片**，必须写明四件事：

1. **段落类型**（1 句话 / 3-5 条 bullets / 80-150 字段落）
2. **数据来源限定**（"用 §10 反查表里的真实业务模块名" / "从模块表内出现的真实子函数名取"）
3. **死字符黑名单**（"禁用项目特化场景词如 ..."）
4. **禁止行为**（"不要预设业务模块名，必须从表格取"）

✅ 好的占位符：

```markdown
<!-- LLM_FILL: 1-2 句话总结 __memcpy 在哪些业务模块路径上集中
（基于上面表格中的 Caller 链 + 业务模块列）；不预设业务模块名，
必须从表格的 module 列取 -->
```

❌ 坏的占位符：

```markdown
<!-- LLM_FILL: 解读一下 __memcpy -->
```

LLM 写错的 #1 来源是**预设业务模块名**——它会按训练记忆造词。anti-example
（"不要预设 BattleUIManager / OutSideViewArmyLineMgr"）是最有效的约束。

### 2.2 五线防御幻觉

| 防线 | 干什么 |
|---|---|
| **数据源单一化** | 所有数字必须来自结构化 JSON；prompt 反复说"diff JSON 是唯一数字来源" |
| **死字符黑名单** | prompt 里列出"绝对不能写的词"（项目特化场景词 / 业务管理器名） |
| **结构化占位符** | LLM 只能填 `<!-- LLM_FILL -->` 标记的位置，禁动表格/Mermaid/调用树 |
| **后置校验** | `validate_v4_report.py` 比对关键数值；`compare_v4_report_quality.py` 验结构点 |
| **回退兜底** | LLM 失败 → 回退确定性 enrich 模板版（≥0.82× 金标准） |

### 2.3 质量门级联（不是 0/1）

```
LLM 输出
  → ≥0.95× 金标准 → 标记"金标准等价"，直接交付
  → ≥0.92× → 标记"交付质量"，可正式交付
  → ≥0.82× → 标记"基础合格"，可作监测
  → 否则 → 回退 Provider 模板版（不算失败，是降级）
```

行数比 + 结构 40 项打分 + 数值 10 项 PASS 是**组合门**，不是单一阈值。

| 维度 | 怎么算 |
|---|---|
| 长度比 | 报告行数 / 金标准行数 |
| 结构 | 40 个固定章节锚点检查（§0/§1/§4.x/§5.x/§10.x 标题、表头、Mermaid 块等）|
| 数值 | systemPressure / 关键模块 delta / 探针 verdict 与 diff JSON 比对 |

### 2.4 项目知识包（核心）

**代码里绝对不写项目特化关键字**。所有项目特化的东西全进 `projects/<name>/*.yaml`：

| YAML | 替代什么 |
|---|---|
| `pack.yaml` | 项目元信息 + 自研 .so 标识符（用于自动识别项目）|
| `business-modules.yaml` | 业务模块定义（id / 关键字 / scope / §章节槽位 / threadHint / topNRemark）|
| `probes.yaml` | 探针定义 + 阈值 + display + §5.3 主线程红线扫描表 |
| `annotations.yaml` | 调用栈节点重命名 / 旁注 / shortFn 重写 / 业务关键字白名单 |
| `slot-matchers.yaml` | 自动发现的模块归类到 fixed slot（meshui / army_line 等）|
| `caller-modules.yaml` | 反查归一规则（`__memcpy` 在哪个业务下）+ 反查目标列表 |
| `layer-tokens.yaml` | .so 分层（business / engine / runtime / noise）|
| `analyst-rules.yaml` | 业务观察提示（>warnAvgMs 时的 action 文案）|
| `burst-jobs.yaml` | Burst Job 友好名映射 |

加一个 `_generic` 兜底包；新项目复制 `_generic/` → 改 8 个 yaml 接入。

**自动检测项目**：扫 trace / diff JSON 里的 .so 名命中 `pack.yaml.identify.selfDeveloperSoNames` → 自动激活对应 pack。

ProjectPack 加载器解析顺序：

```
1. 显式参数 name → projects/<name>/
2. PERFTOOL_PROJECT 环境变量
3. out_dir 路径子串匹配（aoeyz_diff → aoeyz）
4. 扫 binary_cache / diff libs 自动识别
5. _generic fallback
```

### 2.5 Onion Peel 自动模块发现（替代硬编码业务模块清单）

不要写"`MUIControlManager` 是 MeshUI 模块的关键字"这种死表。改用：

```python
# 阈值
HOT_SELF_PCT_GLOBAL = 0.05    # 函数 self ≥ 0.05% global
MIN_HOTSPOT_ABS = 30          # 至少 30 samples
MERGE_RATIO = 1.2             # 公共祖先合并比例

# 排除的 dispatcher 帧（通用 Unity wrapper，不应作模块根）
DISPATCHER_FRAMES = {
    "ExecutePlayerLoop", "JobQueue::WorkLoop",
    "ComponentSystem_Update_", "MonoBehaviour::CallUpdateMethod", ...
}

# 排除的运行时符号（不应作模块根）
RUNTIME_SYMBOL_SUBSTRINGS = {
    "__memcpy", "__memset", "GC_*", "tlsf_*", "il2cpp_alloc", ...
}
```

算法：
1. 扫所有 self ≥ 0.05% global 的叶子节点
2. 找 K 个 hot leaf 共享的最近公共祖先
3. 公共祖先非 dispatcher 且非 runtime → 作为"模块根"
4. 输出 `auto_main_thread_<rootSym>_<id>` 形式的自动模块

然后 `slot-matchers.yaml` 用语义子串把"auto_xxx"模块对回固定 slot（meshui / army_line 等）。

**好处**：新项目**不用预先列业务关键字**，模块从数据里浮现。固定 slot 的 §章节槽位（4.3-4.6）由 yaml 定，叙事质量不掉。

### 2.6 byte-equal 验证只能证 Provider 层

⚠️ **不要拿"byte-equal"当 LLM 流程的验收**。LLM 输出永远不字节稳定。

| 用途 | 验收口径 |
|---|---|
| 证明配置剥离没破坏渲染逻辑 | byte-equal（同输入→同输出）|
| 证明升级算法没回归 | byte-equal（重要：先备份 baseline）|
| 证明 LLM 通路质量 | 质量门 PASS（0.95×/0.92×/0.82× 三档）|
| 证明 LLM 通路稳定性 | 重复跑 N 次，统计 PASS 率（≥80%）|

跑 LLM 重复实验时**关键变量**：
- 同一份 diff JSON
- 同一份 prompt
- 同一个 LLM 提供商
- 输出报告每次内容会变，但**质量分布**应稳定

### 2.7 wrapper vs 真热点的下钻渲染

调用树渲染是 LLM 写不出的 1000 行手工策展替代品。金标准做法：

| 节点类型 | 处理 |
|---|---|
| 非热点 phase | 折叠成一行（`PlayerSendFrameComplete (124 / 0.7%)`）|
| 热点 phase | 强制深挖到 self ≥ 0.05% global 的叶子 |
| wrapper 节点（self < 0.05% but total ≥ 1%）| 标 `[wrapper]` |
| 真热点 | 标 📈🔴 / 🟡 / 🟢 + self 绝对样本数 |
| 跨章节引用 | 加 `see §4.4` / `[详见 §6.1]` 等旁注 |
| 通用 dispatcher 帧 | 折叠为单行 `MonoBehaviour.CallUpdateMethod → il2cpp Runtime.Invoke` |

输出形态（节选）：

```
UnityMain (47,228 / 100% / cur 全局 99.34%)
├─ ExecutePlayerLoop (47,065 / 99.65%)
│  │
│  ├─ Update.ScriptRunBehaviourUpdate (12,341 / 26.13%) 📈🟡 业务主入口
│  │   └─ MonoBehaviour.CallUpdateMethod → il2cpp Runtime.Invoke
│  │       └─ Core.Update → FrameworkCore_OnUpdate (11,234 / ...) [wrapper]
│  │           ├─ MapManager_OnUpdate (8,901 / ...) [wrapper]
│  │           │   ├─ BattleUIManager_OnUpdate (3,453 / ...) [wrapper]
│  │           │   │   └─ BattleUIManager.UpdateMUIPos (2,978 / ...) 🟡
│  │           │   │       └─ MUILayout.Set3DPosition × 8 层递归   see §4.4
│  │           │   │           ├─ MUILayout.Set3DPosition self (332 self)  📈🔴
│  │           │   │           ├─ MUIControlManager.OnLateUpdate (360 self) 📈🔴
...
```

---

## 3. perfetto 适配建议

perfetto 与 simpleperf 的核心差异影响实现：

| 维度 | simpleperf | perfetto |
|---|---|---|
| 数据粒度 | 采样栈（callstack hit count） | 完整 trace（slices / counters / threads / sched） |
| 数字来源 | self_ec / total_ec | dur_ns / wall-clock / cpu-time |
| 业务模块归一 | 按 .so + 函数名 | 按 atrace tag / slice category / 进程线程 identity |
| 可观测维度 | CPU 占比 | + 调度（Running/Runnable/Sleep）+ frame 边界 + GPU counter |
| 时间精度 | 周期采样 | 事件级别 |

### 3.1 perfetto agent 应该比 simpleperf 多做的事

| 维度 | 价值 | simpleperf 没有 |
|---|---|---|
| **frame 边界** | 以 vsync slice 为单位算 ms/frame；比 ms/秒 更可读 | ✓ |
| **调度分析** | Running / Runnable / Sleep 三态比例 → 区分等 CPU vs 等 I/O vs 真干活 | ✓ |
| **跨线程关联** | main thread 等 worker thread 的 join 链路 | ✓ |
| **counter 关联** | mem / gpu_freq / temperature 与 CPU spike 时序对齐 | ✓ |
| **slice 嵌套** | atrace 业务自打点的层级结构 | ✓ |

### 3.2 perfetto 可以直接复用的部分

✅ 整套方法论完全可复用：

- 分层契约（数据 → JSON → 骨架 → LLM → 质量门）
- 占位符模式（任务卡片 + 黑名单 + anti-example）
- 五线防御幻觉
- 质量门级联（0.95×/0.92×/0.82×）
- 项目知识包（yaml 化）
- byte-equal 与质量门两种验收分用
- wrapper-vs-真热点下钻渲染逻辑

### 3.3 perfetto 项目知识包扩展字段建议

```yaml
# projects/<name>/perfetto-extra.yaml
atraceCategories:
  - { tag: "Choreographer#doFrame", display: "VSync 帧边界" }
  - { tag: "performTraversals", display: "View 树遍历" }

threadIdentityRules:
  - { commPattern: "^UnityMain$", identity: "main_thread" }
  - { commPattern: "^Thread-129$", identity: "job_worker" }

frameBudget:
  targetFps: 60
  redLineMs: 16.7
  yellowLineMs: 12.0

schedAnalysis:
  runnableRedPctMs: 30   # >30% 时间在 Runnable = 等 CPU
  sleepRedPctMs: 20      # >20% 时间在 Sleep（非主动 wait）= 等锁/IO
```

### 3.4 perfetto 探针建议

| 探针 | 信号 | 阈值参考 |
|---|---|---|
| `probe.frame.budget` | ms/frame 过红线 | >16.7ms |
| `probe.sched.runnable` | 主线程 Runnable 比例 | >30% |
| `probe.sched.sleep_uninterruptible` | 主线程 D-state 等 I/O | >5% |
| `probe.gpu.freq` | GPU 频率掉落（thermal throttle）| <80% peak |
| `probe.mem.thrash` | mmap_lock / migrate_pages slice | >2/s |
| `probe.choreographer.miss` | doFrame 超 vsync | >5/s |

---

## 4. 反模式（不要做）

❌ **直接给 LLM 看 raw trace 让它写报告** — 数字必幻觉，调用栈必丢。

❌ **用 prompt 列出"项目业务模块名"让 LLM 选** — 把项目特化注入 prompt，复用难。

❌ **不分骨架 / 内容，整个报告交给 LLM 重写** — 表格结构每次都不一样，质量门没法验收。

❌ **质量门用单一阈值 0/1 PASS** — LLM 抽样波动大，会大量误判。

❌ **byte-equal 当 LLM 验收口径** — LLM 永远不字节稳定。

❌ **看到 LLM 一次输出对就发布** — 必须重复 N 次跑统计 PASS 率。

❌ **金标准报告里写死项目特化场景词（"野外几乎无音效""300 队部队"）** — LLM 会模仿照抄到不该出现的场景。

---

## 5. 落地清单（按顺序）

新项目 / 新数据源接入这套方法论的步骤：

| 步骤 | 干什么 | 产出 |
|---|---|---|
| 1 | 写 1 份金标准手工报告（人工策展 600+ 行） | `gold/<source>_<scenario>.md` |
| 2 | 拆出 5 个固定章节槽位（§0 结论 / §4 模块 / §5 调用树 / §10 反查 / 元信息）| 章节锚点表 |
| 3 | 设计结构化 JSON contract（一份 schema，所有数字必须从这里来）| `data-contract.yaml` |
| 4 | 写确定性 Markdown 骨架渲染器（Python，输出带 LLM_FILL 占位符）| `render_v4_report.py` |
| 5 | 设计项目知识包（8 个 yaml + 加载器 + auto-detect）| `projects/_generic/` + `project_pack.py` |
| 6 | 写 prompt 模板 + 五线防御 | `cli_enrich.py` |
| 7 | 写 validate（数值 10 项）+ compare（结构 40 项 + 长度比）| `validate.py` / `compare.py` |
| 8 | 写质量门级联（0.95×/0.92×/0.82× 三档 + 回退）| pipeline 脚本 |
| 9 | 跑 5-10 次 LLM 端到端，统计 PASS 率 | 验收数据 |
| 10 | byte-equal 跑 baseline，确认确定性层稳定 | 回归基线 |

---

## 6. 三档交付（向使用者提供伸缩性）

| 档位 | 用途 | LLM | 质量门 |
|---|---|---|---|
| **L1 监测** | CI / 日常回归 / Web 快速分析 | 无（确定性模板） | validate + compare ≥0.82× |
| **L2 标准** | 团队评审 / 策划对接 | LLM 只 patch §0 + §4.3-§4.6 | ≥0.92×；失败回退 L1 |
| **L3 深度** | 重大版本 / 对外报告 | L2 + 人工对照金标准 | ≥0.95× + 人审 |

Web 应有显式 `reportTier: L1 | L2` 开关，不要默认 L2 而隐式调 LLM。

### 6.1 LLM 不参与时报告长什么样

很多人以为"不跑 LLM = 报告不完整不能看"，**错**。骨架渲染（Provider/enrich 模板）已经包含：

- ✅ 所有数字（systemPressure / 探针值 / Top-N 表 / 反查表）
- ✅ 所有表格 + Mermaid 图
- ✅ 主线程 / URP / RHI 调用树（带 wrapper 标记 / 颜色标记 / 跨章节引用）
- ✅ §5.3 红线扫描表
- ❌ **业务语境解读段落**（"为什么 cur 比 base 涨了 30%" / "建议..."）
  — 这些位置在不跑 LLM 时是 `<!-- LLM_FILL: ... -->` HTML 注释

**关键设计**：HTML 注释在 markdown 渲染层（GitHub / VSCode 预览 / web 前端 markdown 组件）
**不可见**——肉眼看不出来叙事是空的。这是把"灵活叙事"和"刚性数据"完美解耦的工程技巧：

```markdown
### 4.4 动态 UI 子树（MeshUI 等）（Top-N #4，🔴）

[这里是规则渲染的表格 + 数字]
| 函数 | self | global% |
|---|---|---|
| MUIControlManager.OnLateUpdate | 360 | 0.76% |
| ...                            | ... | ... |

**业务含义**：<!-- LLM_FILL: 解读 base→cur 数字变化（用本节表格中的数据），结合采集场景说明业务原因；60-120 字 -->

**调用入口**：<!-- LLM_FILL: 用 §5.2 主线程调用树中实际出现的节点串成 1 句调用链描述 -->

**优化方向**：<!-- LLM_FILL: 3-5 条具体优化建议 -->
```

跑 LLM（L2）：3 个占位符被填成实际段落。
不跑 LLM（L1）：3 个占位符仍是 HTML 注释，渲染时不可见，**用户只看到表格/数字+空标题**，
够 CI 监测，但不够给人深度解读。

### 6.2 控制开关 `skipAiEnrich` 的语义

| 字段值 | 骨架渲染（确定性）| codebuddy CLI（LLM）|
|---|---|---|
| `skipAiEnrich=true`（web 默认）| ✅ 总是跑 | ❌ 跳过 |
| `skipAiEnrich=false`（要 LLM 时显式传）| ✅ 总是跑 | ✅ 跑（填占位符）|

变量命名有点歧义——叫 "AiEnrich" 但实际控制的只是 codebuddy CLI 那一段。骨架渲染（包括
`enrich_v4_report.py`）**永远跑**，因为表/数字/树没它就没了。

---

## 7. 参考实现

- 加载器：`simpleperf/simpleperf_analyzer/project_pack.py`
- 骨架渲染：`simpleperf/simpleperf_analyzer/v4_report_renderer.py`
- LLM 触发：`scripts/cli_enrich_v4.py` / `web/server/services/simpleperf-diff-service.ts`
- 快速回归测试：`web/server/scripts/quick-cli-test.mjs`（仅 LLM 阶段）
- 完整 E2E：`web/server/scripts/e2e-simpleperf-diff.ts`
- 质量门：`scripts/validate_v4_report.py` / `scripts/compare_v4_report_quality.py`
- 项目知识包样例：`projects/aoeyz/*.yaml` / `projects/_generic/*.yaml`

---

## 8. 血的教训：从 simpleperf 项目学到的事故

> 这一节记录实际开发中踩的坑。看完能少走半天弯路。

### 8.1 "我能跑通" ≠ "正式流程能跑通"

我（Claude）在做剥离重构时用 `python scripts/cli_enrich_v4.py` 跑出 0.98× 金标准就报告成功，
直到用户坚持跑 web e2e 才发现 web 流程**完全跑不通**——虽然两边"理论上调同一个 codebuddy CLI"。

实际差异：

| 阶段 | CLI 直跑 | Web e2e |
|---|---|---|
| perf.data 解析 | ❌ 跳过（用现成 diff JSON）| ✅ 从零跑 |
| Provider 渲染 | ❌ 跳过 | ✅ 跑（这里漏了项目识别）|
| Prompt 来源 | `cli_enrich_v4.py`（新格式带占位符）| `simpleperf-diff-service.ts`（**老格式**）|
| Prompt 传输 | stdin pipe | `-p prompt` 位置参数（**Windows .cmd 截断**）|

**教训**：流程有两个入口（CLI / Web）就一定有两套独立踩坑路径。**唯一验收口径**应是用户实际用的入口
（这里是 web），不是研发图省事的 CLI。

### 8.2 三个独立 bug 同时爆破

剥离配置后，web 第一次跑出来的报告**所有 18 个 LLM_FILL 占位符原样保留**，但质量门 0.92× PASS。
拆解三个 bug：

**Bug 1 — pack.yaml 缺字段**
- 现象：web 跑 488 行 / 0.74× FAIL，§4.4 / §4.5 章节缺失
- 根因：`projects/aoeyz/pack.yaml` 没写 `androidPackages: [com.tencent.aoeyz]`
- binary_cache 里**没有** libAOENative（自研 native 通常只在 /data/data/<pkg>，simpleperf 不会拷出来），
  但路径段里包含 `com.tencent.aoeyz`。靠 selfDeveloperSoNames 检测自研 .so 走不通；必须额外用
  androidPackages 匹配路径段。
- 教训：**项目识别必须有多重信号**（自研 .so + 包名 + 库名子串），任何单一信号都可能在某些环境下扑空。

**Bug 2 — Prompt 形态不一致**
- 现象：LLM 跑了 8 分钟，输出报告里占位符原样保留，但行数撑住质量门 PASS
- 根因：`simpleperf-diff-service.ts:buildDiffEnrichPrompt` 是老格式（"在 §0 加段落"），
  跟 `scripts/cli_enrich_v4.py` 的新格式（"替换每个 LLM_FILL 占位符"）不一致。
  LLM 看老 prompt → 不知道该填占位符 → 新增了段落但占位符没动。
- 教训：**同一 LLM 任务的 prompt 不能在两个地方维护两份**。要么提取到共享 .txt 模板文件，
  要么 web 直接调 cli_enrich_v4.py 而不是自己再实现一遍。
- 隐藏陷阱：质量门只数行数 + 结构锚点，**HTML 注释行也算行**——所以占位符没填的报告
  仍能 0.92× PASS。质量门检查必须加上"`grep -c LLM_FILL` 必须为 0"这条。

**Bug 3 — Windows .cmd stdin pipe**
- 现象：codebuddy 进程启动了，但 LLM 回复 "No task content was provided after the colon"
- 根因：args 写 `'-p', longMultiLinePrompt` 在 Windows 通过 .cmd 包装层时，cmd.exe 把 prompt
  截断在第一个换行字符。LLM 收到空 prompt 自然不知道该干什么。
- 修复：args 只传 `'-p'`，prompt 通过 `child.stdin.write(prompt); child.stdin.end()` 注入。
  匹配 `cli_enrich_v4.py` 的方案。
- 教训：**Windows + 多行字符串 + .cmd 包装** 是一个高危组合。任何长 prompt（>80 字符 或 含换行）
  都用 stdin。不要图方便 `-p prompt` 直接拼。

### 8.3 验收顺序教训

错误顺序：byte-equal Provider → 自我感觉良好 → 报告 LLM 也跑通 → commit & push

正确顺序：
1. **byte-equal Provider 层**（证规则没坏）
2. **CLI 端到端跑 LLM**（证 prompt 能填占位符）
3. **完整 web e2e 跑一遍**（证 web 集成层没踩 .cmd / stdin / 检测时机的坑）
4. **重复 N 次 web e2e 看 PASS 率**（证 LLM 抽样波动可控）
5. **commit & push**

**任一阶段跳过都可能导致"我以为跑通了"，实际上有 3 个独立 bug 等着用户发现**。

### 8.4 质量门必加的 sanity check

原版 compare_v4_report_quality.py 只数行数 + 结构锚点。**少这两条会放走假 PASS**：

```python
# Hard fail 条件（不计入分数，直接 FAIL）
assert grep_count("LLM_FILL", report) == 0, "占位符未全部填空"
assert grep_count("<!--", report) <= 5, "HTML 注释残留过多"
assert "**业务含义**" not in 同一段落两次, "重复段落 bug 征兆"
```

行数撑住 + 结构锚点对 ≠ 报告内容真有叙事；这三条加上后才挡得住 LLM 没跑 / prompt 错的情况。

### 8.5 对 perfetto agent 的具体提醒

| simpleperf 踩的坑 | perfetto 等价场景 |
|---|---|
| binary_cache 自研 .so 不在 → 用包名匹配 | trace 里如果没自研 atrace tag → 用 process name / package name 兜底 |
| Web prompt 跟 CLI prompt 维护两份不一致 | 务必把 prompt 提取成 `prompt.txt` 文件，所有入口 readFileSync 同一份 |
| Windows .cmd 多行 prompt 截断 | 跑 codebuddy CLI 时无脑用 stdin pipe，不用 `-p prompt` |
| 质量门只数行 / 结构 → LLM 没跑也 PASS | 加 `grep -c LLM_FILL == 0` hard fail |
| 我以为 byte-equal 就 OK → 没跑 web | 一定要跑用户实际用的入口的 e2e |

---

## 附录 A：占位符 prompt 模板（实战版）

```
TASK (non-interactive, execute immediately, do NOT ask back):
Read the file at the absolute path below and replace every <!-- LLM_FILL... -->
placeholder with project-aware Chinese narrative grounded in the structured
diff JSON + knowledge base.
All numbers, tables, mermaid charts, code blocks must be preserved verbatim.

FILE TO EDIT: {ai_report}

REFERENCE FILES (read-only, for facts/style):
- Numbers source: {diff_json}
- Summary metadata: {summary}
- Knowledge base: {knowledge}
- Gold style reference (DO NOT copy verbatim — emulate tone/depth only): {golden}

## How placeholders work
Every <!-- LLM_FILL: <instruction> --> in the file marks a slot you must replace.
The instruction tells you what kind of paragraph/list to write.
After replacement, the comment marker should be GONE.

## Hard rules
- 禁改：所有 Markdown 表格、Mermaid 块、调用树代码块（```...```）、章节标题
- 禁造数字：所有数值必须来自 diff JSON。如果想加新数字，先查 diff JSON 确认。
- 禁用项目特化死字符（如"野外几乎无音效""300 队部队"等只对当前数据有意义的词）
- 不要保留 <!-- LLM_FILL: ... --> 占位符在最终输出中
- 不要在已经填好的段落旁追加同名段落（防止重复）

## Self-check
- After all edits, run: grep -c LLM_FILL {ai_report} — must return 0
- File should be >= {min_lines} lines
- 不允许出现两个连续的 **业务含义**: 段落（这是重复 bug 的征兆）
```

---

## 附录 B：质量门评分细则（结构 40 项）

| 类别 | 检查点数 | 例 |
|---|---|---|
| 章节标题 | 12 | §0 结论先行 / §1 元信息 / §2 总压力 / §4.3-§4.6 模块 / §10 反查 |
| 表格 | 8 | §3 线程表 / §4 Top-N 表 / §5.3 红线扫描 / §10.x 反查表 |
| Mermaid | 2 | §3 线程柱状图 / §4 Top-N 柱状图 |
| 调用树代码块 | 4 | §5.2 主线程 / §6.1 URP / §6.2 RHI / §9 Lua GC |
| 关键标记 | 6 | 🔴 / 🟡 / 🟢 / 📈 / [wrapper] / NEW |
| 跨章节引用 | 4 | see §4.4 / [详见 §6.1] / 见 §10.x |
| 业务子函数列 | 4 | §4.x 模块的子函数表必须列出 self 排序前 N |

每项 1 分，满分 40。≥38 视为结构合格。

---

*版本：v1.0 · 适用 simpleperf 差分分析 + perfetto 通用分析*
*维护人：根据各数据源 agent 的实战补充更新*
