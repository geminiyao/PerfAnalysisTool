# Perfetto 报告生成流水线 · 中间形态改造方案

> 沉淀自一次审计讨论：把 simpleperf v4 报告流水线的方法论（`docs/report-generation-methodology.md`）拿来对照当前 perfetto-triad 流水线，找出风险，并取舍出一个**比当前更安全、比直接 v4 化更适合 perfetto 本质**的中间形态。
>
> 适用对象：perfetto 三态/差分版本对比分析的后续重构、以及未来扩展到通用版本对比时的形态参考。

---

## 0. TL;DR

- 当前 perfetto-triad 流水线是 **「LLM 一次性写完整篇 markdown」**，数字幻觉无机器兜底
- simpleperf v4 走 **「骨架 + LLM 填占位符」** 路线，所有数字焊死在 Python 渲染里
- 直接照搬 v4 不是最优：perfetto 报告「叙事跟数据走」的特性会被骨架式渲染削掉，§6.2 callTree 三态对齐这类「形态题」也会反噬工作量
- **本方案采用第三种形态**：
  - 保留 perfetto-report-template.md 这套软约束（结构/形式硬规则、内容/判断软规则）
  - Python 端预渲染所有「原子数字片段」（表格、ASCII 比例条、callTree 节点签名、统计行）→ `numeric-cells.json`
  - prompt 硬规则要求 LLM **粘贴**而非**复述**这些片段
  - 后置数值对账兜底
- 总工作量约 **7–9 个工作日**，覆盖骨架填空路线的核心安全收益，但保留 perfetto 的叙事灵活度

---

## 1. 背景：当前流水线 vs simpleperf v4 方法论

### 1.1 方法论要件对照表

| 方法论要件 | simpleperf v4 | perfetto-triad 当前 |
|---|---|---|
| 数据 → JSON → 骨架 → LLM 填空 → 校验 五段 | 完整 5 段 | 跳过「骨架渲染」这一段 —— 直接「JSON → LLM 写整篇」 |
| `<!-- LLM_FILL -->` 占位符模式 | 18 个 | 0 个，纯靠 prompt 引导 |
| 数字/表格永不交给 LLM | 强制 | 数字/表格全由 LLM 抄写，幻觉风险高 |
| 项目知识包 yaml 化 + auto-detect | `projects/aoeyz/` + `projects/_generic/` | 硬编码在 skill 内（`config.json`、`references/aoe-watch-spec.yaml`、`references/aoe-cpu-analysis-knowledge.md`），无 _generic 兜底，换项目要改 skill 文件 |
| 三档质量门（0.95/0.92/0.82×） + 回退 | 三档 + 回退 Provider 模板 | 单一阈值（行数 ≥ 0.65× 金标准 + 必备 marker 全有），且无回退 —— 失败直接抛错，用户拿不到任何报告 |
| Web 与 CLI 同一入口 | 早期不一致已踩坑修复（`cli_enrich_v4.py` 与 `simpleperf-diff-service.ts.buildDiffEnrichPrompt` 对齐） | 同坑结构再次出现：web 走 `perfetto-triad-service.ts.buildTriadPrompt()`，手工 CLI 走 `SKILL.md` 的执行步骤；两边章节要求/校验口径分别维护 |
| 共享 prompt 模板文件 | 老版分散，已知是反模式 | prompt 全在 TS 字符串里 inline，没有抽到 `prompt.txt` |
| Windows `.cmd` stdin 注入 | 已修 | `buildArgs` 仍用 `-p prompt`（`perfetto-triad-service.ts:58`）—— 长 prompt 经 `.cmd` 包装会被换行截断 |
| 「占位符必须填空」hard fail | `grep -c LLM_FILL == 0` | n/a（无占位符），但没有等价的 sanity check —— LLM 可能省略整章节，validate 只数行数和章节锚点 |

简言之：**perfetto 这条链的 AI 灵活度高，但刚性数据保护低**。「骨架 + LLM 填空 + 配置剥离」三个要件，当前一个都没做到位。

### 1.2 高风险问题

| ID | 危害 | 描述 |
|---|---|---|
| **B1** | 高 | **没有「骨架」**：数字、表格、调用树全都 LLM 抄写。`validateTriadReportQuality` 只在写完之后比对个别帧数（`if (count && !markdown.includes(count))`），不能检出「表格里某行数字编错」。18 个 hot marker 里只要 65% 出现就过，剩下 35% 可被 LLM 静默丢失。后果：base/cur/throttle 三列数字写错位 / `Gfx.WaitForPresent` 单次 avg 抄成 totalMs 这类隐性幻觉，质量门检不出。 |
| **B2** | 高 | **prompt 硬编码 AOE 业务结构假设**：`buildTriadPrompt()` 写死要求 LLM 必须覆盖 §3 / §4.5 / §5.2 / §5.4 / §6.2 / §6.3 / §7.3；`validateTriadReportQuality` 还硬编码 `Gfx.WaitForPresent` / `GC.Alloc` / `binder` / `off-CPU` 这些 Unity 专属 marker。换游戏（非 Unity / 非 AOE）这条链直接报错 fail。 |
| **B3** | 高 | **项目知识全在 skill 内，没有项目包剥离**：`config.json` 写死 `gameProcess: com.tencent.aoeyz`、线程名 `UnityMain` / `UnityGfxRenderS`；`aoe-watch-spec.yaml` / `aoe-cpu-analysis-knowledge.md` / 报告模板里的「凉机野外 / 行军压测 / MapSignificanceMgr / BattleHeadMgr / OutSideViewArmyLineMgr」全是 AOE 死字符。换项目 = 改 skill 仓库。模板里的项目特化场景词出现在金标准里，按 v4 §7 反模式 LLM 会模仿照抄到不该出现的场景。 |
| **B4** | 高 | **没有降级回退**：`perfetto-triad-service.ts:519-521` 质量门失败 → 抛 `Error`。perfetto 这边没有 Provider 直出 markdown 这一层，所以失败 = 用户什么都没得到。 |
| **B5** | 高 | **Windows `-p prompt` 历史坑没修**：`CLI_PROVIDERS.codebuddy.buildArgs(prompt) = ['-p', prompt, ...]`。simpleperf v4 §8.2 Bug 3 已经详细描述过这是高危组合。 |
| **B6** | 中 | **Web prompt 与 SKILL.md 各维护一份**：`SKILL.md` 升级 v5.4 但 TS 不动必然飘逸。simpleperf §8.2 Bug 2 等价场景。 |
| **B7** | 中 | **质量门把项目特化金标准当通用基准**：`goldenReportPath()` 直接指向 `performance-report_perfetto_ULTIMATE_v5.3.md`。换项目时，质量门以它为标尺等于「必须长得像 AOE 报告」。 |
| **B8** | 中 | **hot marker 抽取本身有上游 bug**：依赖 `summary.aoeHotSlices`（已知口径错），导致质量门基准跑偏。 |

---

## 2. 三种形态对比

```
形态 A — perfetto 现状（"全 LLM 写整篇"）
─────────────────────────────────────
LLM 读 facts.json
LLM 读 perfetto-report-template.md（结构指引）
LLM 读金标准 v5.3（风格参考）
LLM 一次性写完 887 行 markdown（含所有数字、表格、ASCII、callTrees）

数字幻觉风险: 高（无机器兜底）
LLM 灵活度:   高
工作量已投入: 0


形态 B — simpleperf v4（"骨架 + 占位符填空"）
─────────────────────────────────────
Python: diff JSON → 渲染整篇骨架 markdown（含表格、Mermaid、调用树）
        在 18 个叙事位置留 <!-- LLM_FILL: ... --> 注释
LLM:    替换 18 个占位符为业务叙事段落
        物理上够不到表格/数字/调用树
后置:   grep -c LLM_FILL == 0 + 数值对账 + 结构 40 项

数字幻觉风险: 0（物理隔离）
LLM 灵活度:   中（18 个明确口子内全权决定）
工作量已投入: ~1500 行 Python renderer


形态 C — 本方案中间形态（"模板 + 数字材料包"）
─────────────────────────────────────
Python: facts.json → 只渲染"原子数字片段"
        ↓
        numeric-cells.json
        {
          "§2-元信息表":         <整张已渲染好的 markdown 表格字符串>,
          "§0-running-bar-base":  "███... Run 86.94% / Sleep 12.04%",
          "§3.1-binder-base":     "pid=1873(system_server)×11 totalMs=2.73ms 占比<0.03%",
          "§6.2-Core.Update":     "[base 1.72 / cur 7.32 / throttle 8.04 ms/帧] 📈+426% / +467%",
          ...
        }

LLM:    读 perfetto-report-template.md（保留全部软规则）
        读 numeric-cells.json（数字材料包）
        读 facts.json（备用原始事实）
        按 template 自由组织全文 + 在每个数字位置粘贴对应片段
后置:   数值对账（扫报告所有数字 vs numeric-cells）+ 必备 marker + 三档质量门

数字幻觉风险: 接近 0（前提：LLM 遵守"粘贴而非复述"）
LLM 灵活度:   高（叙事 + 全文组织全部保留）
工作量已投入: ~300-500 行 Python renderer
```

| 维度 | A 现状 | B v4 骨架 | **C 中间形态** |
|---|---|---|---|
| 表格单元格抄错列 | 可能 | 不可能 | 不可能（粘贴整张表） |
| 单个数字编错 | 可能 | 不可能 | 不可能（粘贴片段） |
| 把 totalMs 当 ms/帧 | 可能 | 不可能 | 不可能 |
| 漏掉某个热点模块 | 可能 | 物理不可能 | 可能（用必备 marker 兜底） |
| 业务因果说错 | 可能 | 可能 | 可能（任何 LLM 叙事都有此风险） |
| 全文组织自由度 | 高 | 中 | 高 |
| Python 工作量 | 0 | 大（~1500 行，含 §6.2 callTree 三态对齐 / 剪枝 / wrapper 检测） | 中（~300-500 行，仅渲染数字单元） |
| §6.2 callTree 整体形状 | LLM 写 | Python 写 | LLM 按 template 写、节点签名查表 |
| 跨数据源复用 | 不易 | 较难（renderer schema 跨源不通） | 易（数字片段表 schema 简单，跨源易抽象） |
| 换项目 | 改 skill | 改 yaml 包 | 改 yaml 包 |
| L1 兜底 | 无 | 骨架本身就是 L1 | 数字材料包 + template 可机械拼装一个简版（见 §4.4） |

---

## 3. 为什么中间形态更适合 perfetto

### 3.1 perfetto 报告本质就是「叙事跟数据走」

simpleperf 的报告结构很「刚」：
- 探针红线扫描表是固定 N 列
- Top-N 表是 self_ec 排序前 N
- 调用栈样本数表是固定字段

把这些用 Python 渲染 + 留 18 个口子给 LLM 写业务解读，是合身的。

perfetto 报告每一节的形态都跟着本次数据走：

| 章节 | 形态由谁决定 |
|---|---|
| §0 三大独立结论 | 看本次哪三个最强 → LLM 判 |
| §3 写哪几条线程 | 看实际 trace 出现哪些 → LLM 挑 |
| §4.5 因果链 ASCII 怎么画 | 跟本次瓶颈形态走 → LLM 编排 |
| §6.2 callTree 缩进树画到哪一层 / 哪些节点折叠 | 看本次热点分布 → LLM 判断 |
| §6.3 Top 红线下钻几个、每个写什么 | 看本次热点排序 → LLM 决 |
| §10 工程化建议四档怎么填 | 看本次能力边界 → LLM 写 |

强行让 Python 把这些"形态题"也死渲染，等于把 perfetto 的灵活性削掉。

### 3.2 §6.2 callTree 是单点最大省力点

如果走 v4 全骨架路线，§6.2 callTree 三态对齐 + 剪枝 + wrapper 标记 + 跨章节引用渲染算法，估约 300-500 行 Python，是 renderer 一半的复杂度。

中间形态的做法：
- Python 把每个 callTree 节点的「数字签名」`[base 1.72 / cur 7.32 / throttle 8.04 ms/帧] 📈+426%` 做成查表
- LLM 按 template 决定缩进树长什么样、画到哪一层、哪些标 wrapper、哪些跨章节引用
- 每个节点描述在该出数字的位置，从查表粘贴对应签名

**节省 3-4 天工作量，同时 §6.2 整体形态保留 perfetto 的灵活度。**

### 3.3 中间形态消减的幻觉风险已经够用

| 幻觉类型 | 是否消除 | 兜底机制 |
|---|---|---|
| 表格单元格抄错列 | 是 | 粘贴整张表，单元格物理隔离 |
| 单个数字编错 | 是 | 粘贴预渲染片段 |
| 把 totalMs 当 ms/帧 | 是 | numeric-cells 已经按正确口径渲染 |
| ASCII 比例条画错比例 | 是 | Python 算好后整段粘贴 |
| 漏掉某个热点模块 | 否 | 必备 marker 集合 + 数值对账（v4 同款）|
| 业务因果说错 | 否 | 任何 LLM 叙事都有，靠 prompt + anti-example + 评审 |

剩余两类风险是 LLM 叙事固有的，和「骨架 vs 模板」选型无关。

---

## 4. 改造思路

### 4.1 数字材料包 numeric-cells.json

#### 4.1.1 schema 草案

```json
{
  "schemaVersion": "1.0",
  "source": "perfetto-triad",
  "samples": ["base", "cur", "throttle"],

  "tables": {
    "§2-元信息": {
      "format": "markdown",
      "content": "| 项 | base | cur | throttle |\n|---|---|---|---|\n| 场景推断 | 凉机/低压测 | ... |\n..."
    },
    "§3.1-UnityMain-三态": { "format": "markdown", "content": "..." },
    "§6.1-PlayerLoop-分位": { "format": "markdown", "content": "..." },
    ...
  },

  "asciiBlocks": {
    "§0-running-bar-base":     "████████████████████████████████████░░░░░  Run 86.94% / Sleep 12.04%",
    "§0-running-bar-cur":      "████████████████████████████░░░░░░░░░░░░░  Run 77.82% / Sleep 20.40%",
    "§0-running-bar-throttle": "██████████████████████░░░░░░░░░░░░░░░░░░░  Run 56.99% / Sleep 38.99%",
    "§4.4-state-bar-base":     "...",
    ...
  },

  "callTreeSignatures": {
    "Core.Update":                            "[base 1.72 / cur 7.32 / throttle 8.04 ms/帧] 📈+426% / +467%",
    "Core.Update > CS:AOE.LuaMgr":            "[base 0.99 / cur 3.80 / throttle 3.47 ms/帧] 📈",
    "Core.Update > CS:AOE.LuaMgr > LuaMgr.OnTick&UpdateSchedule > BattleHeadMgr":
                                              "[base 0.20 / cur 1.51 / throttle 1.10 ms/帧] 📈🔴 cur 单次 avg 1.48ms 超红线",
    ...
  },

  "stats": {
    "§3.1-binder-base":        "pid=1873(system_server)×11 totalMs=2.73ms 占比<0.03% trace",
    "§3.1-binder-cur":         "...",
    "§5-thermal-base":         "soc_thermal 65.6°C → 77.3°C  Δ +11.7°C  bigCoreReach 74.9%",
    ...
  },

  "ledger": {
    "§2.PlayerLoop帧数.base":  680,
    "§2.PlayerLoop帧数.cur":   483,
    "§2.PlayerLoop帧数.throttle": 427,
    "§3.1.UnityMainRunningPct.base":   86.94,
    "§3.1.GfxWaitForPresentAvgMs.cur": 5.83,
    ...
  }
}
```

四类内容：

| 类型 | 用途 | LLM 怎么用 |
|---|---|---|
| `tables` | 整张已渲染好的 markdown 表格 | 在对应章节直接粘贴 |
| `asciiBlocks` | ASCII 比例条 / 因果链 / 状态分布图等已渲染好的 ASCII | 直接粘贴到对应位置 |
| `callTreeSignatures` | callTree 节点路径 → 数字签名映射表 | LLM 自己组织缩进树形态，每个节点的数字签名查表粘贴 |
| `stats` | 散落在各章节的"统计行" | 直接粘贴 |
| `ledger` | 后置数值对账用的"账本" | LLM 不用，validate 脚本扫报告时拿来比对 |

#### 4.1.2 渲染器 `scripts/render_perfetto_numeric_cells.py`

输入：三份 `perfetto-profile-summary.json`（或一份 `triad-report-facts-compact.json`）
输出：`numeric-cells.json`

代码量估算：~300-500 行
- `tables`: 模板字符串 + 简单循环，每个表 5-15 行
- `asciiBlocks`: 比例条算法 + 状态分布算法，~50 行通用工具
- `callTreeSignatures`: 遍历三棵 callTree，按节点路径做合并 key，每个节点输出一个签名字符串。这里**不需要 v4 那套剪枝/wrapper 标记/跨章节引用算法**，只输出"节点名 → 数字" 的扁平映射，由 LLM 决定要不要展开/折叠/标记
- `ledger`: 抽关键字段，给 validate 用

#### 4.1.3 三态对齐的简化处理

v4 难点是"画一棵合并后的三态 callTree"，本方案 sidestep 这点：
- `callTreeSignatures` 的 key 用 **节点路径字符串**（如 `"Core.Update > CS:AOE.LuaMgr > BattleHeadMgr"`）
- 三份 callTree 各遍历一次，相同路径节点的数字 merge 进同一个签名
- 某份缺失就在签名里写 `0` 或 `n/a`
- 不需要画"对齐后的合并树"，那是 LLM 在 §6.2 自己做的

### 4.2 prompt 硬规则

把现有 `perfetto-triad-service.ts.buildTriadPrompt()` 的指令抽到 `.claude/skills/perfetto-trace-analysis/prompts/triad-prompt.txt`，TS 和 SKILL.md 共用同一份。

新增硬规则（按 v4 §2.1 的"任务卡片"风格）：

```
## 数字片段使用规则（HARD）

输入材料中包含 numeric-cells.json，含 4 类预渲染数字资产：
- tables.<id>           整张 markdown 表格字符串
- asciiBlocks.<id>      整段 ASCII 字符串
- callTreeSignatures    callTree 节点路径 → 数字签名映射
- stats.<id>            统计行字符串

写报告时：

✅ MUST
- 在对应章节出现表格时，必须粘贴 tables.<id>.content 的整段，**逐字符不变**
- 出现 ASCII 元素时，必须粘贴 asciiBlocks.<id>，**逐字符不变**
- §6.2 callTree 缩进树的每个节点，**必须**通过节点路径在 callTreeSignatures 查表，
  把对应签名"[base X / cur Y / throttle Z]"原样粘贴
- 每出现一个数字（百分比、ms、帧数、温度等），都必须能在 numeric-cells 里找到来源；
  叙事中复述数字时，复述的值必须等于 numeric-cells 中的值

❌ MUST NOT
- 不要修改 tables / asciiBlocks 的任何字符（含空格、对齐、表头）
- 不要从 facts.json 里"自己换算"出新数字。如果某个想用的数字不在 numeric-cells 里，
  不要写它，改成定性叙事
- 不要创造新的数字（"涨了 30%" 这种百分比也必须来自 numeric-cells.ledger 或 callTreeSignatures）

## Self-check
- 报告里所有数字 token，必须能通过 grep 在 numeric-cells.json 里找到
- §6.2 缩进树每个节点必须含 "[base ... / cur ... / throttle ...]" 形式的签名
```

### 4.3 质量门

按 v4 §2.3 三档级联，本方案的实现：

| 档位 | 触发条件 | 可信度 |
|---|---|---|
| L3 金标准等价 | 数值对账 100% PASS + 必备 marker 全部出现 + 行数 ≥ 0.95× 金标准 | 团队评审 / 对外报告 |
| L2 交付质量 | 数值对账 ≥ 95% PASS + 必备 marker ≥ 90% + 行数 ≥ 0.92× | 日常交付 |
| L1 基础合格 | 数值对账 ≥ 90% PASS + 必备 marker ≥ 80% + 行数 ≥ 0.82× | CI 监测 |
| 回退 | 任何档都 fail | 输出 numeric-cells 拼装版（见 §4.4） |

#### 4.3.1 数值对账 `scripts/validate_perfetto_report.py`

```python
def validate(report_md, numeric_cells):
    ledger = numeric_cells["ledger"]
    failures = []

    # 1. tables / asciiBlocks 必须逐字符存在于报告
    for tid, table in numeric_cells["tables"].items():
        if table["content"] not in report_md:
            failures.append(("missing-table", tid))

    for aid, block in numeric_cells["asciiBlocks"].items():
        if block not in report_md:
            failures.append(("missing-ascii", aid))

    # 2. ledger 关键数字必须在报告里能找到
    for k, v in ledger.items():
        if str(v) not in report_md:
            failures.append(("missing-number", k, v))

    # 3. callTree 签名必须出现
    for path, sig in numeric_cells["callTreeSignatures"].items():
        leaf = path.split(" > ")[-1]
        # 报告中出现这个叶子节点时，紧跟其后必须有签名
        # 用正则 leaf .* signature
        if leaf in report_md and sig not in report_md:
            failures.append(("calltree-signature-missing", path))

    return failures
```

#### 4.3.2 必备 marker

通用化（剥离 AOE 死字符）：从 `numeric-cells.callTreeSignatures` 取 top-N hot 节点路径，由 Python 而非 TS 决定，避免 `validateTriadReportQuality` 硬编码 `Gfx.WaitForPresent` / `GC.Alloc`。

#### 4.3.3 hard-fail sanity check

```python
# 必须为 0 否则直接 FAIL
assert "<!-- LLM_FILL" not in report_md
assert no_repeated_section_within_3_paragraphs(report_md)
# 数字 token 命中率必须 ≥ 阈值
assert numeric_hit_rate >= 0.90
```

### 4.4 L1 回退兜底

当 LLM 全 fail 时，不抛错，输出一份「numeric-cells 拼装版」：

- Python 拿 `numeric-cells.json` + `perfetto-report-template.md` 的章节顺序
- 每个章节标题下，依次拼接：表格 / ASCII / 节点签名清单
- 叙事位置全部用 `<!-- 本节叙事缺失，CLI/LLM 未生成 -->` 占位

这样用户至少能拿到所有数字、所有表格、所有调用树签名 —— 跟 v4 §6.1 的"L1 不跑 LLM"形态对齐。

### 4.5 项目包剥离（与中间形态正交但需配合）

为了让"通用版本对比分析"成立，必须做：

#### 4.5.1 目录结构

```
projects/
├─ _generic/              # 兜底包，无项目特化死字符
│  ├─ pack.yaml
│  ├─ business-modules.yaml
│  ├─ probes.yaml
│  ├─ slot-matchers.yaml
│  ├─ caller-modules.yaml
│  └─ frame-budget.yaml
└─ aoeyz/                 # AOE 项目包
   ├─ pack.yaml
   ├─ business-modules.yaml  # ← aoe-cpu-analysis-knowledge.md 结构化
   ├─ probes.yaml            # ← aoe-watch-spec.yaml 的 ruleTemplates
   ├─ slot-matchers.yaml     # ← LuaMgr/MapManager/MeshUI/OutsideArmy → §6.x slot
   ├─ caller-modules.yaml    # ← atrace slice → 业务子模块归一
   └─ frame-budget.yaml      # ← targetFps 30 / vsync 周期 / red/yellow line ms
```

#### 4.5.2 自动检测

`pack.yaml.identify` 用 perfetto trace 里的：
- process name（如 `com.tencent.aoeyz`）
- atrace tag 子串（如 `CS:AOE`、`LuaMgr.OnTick`）
- thread comm 模式

任一匹配命中就激活对应包；都不命中就走 `_generic`。

#### 4.5.3 skill 文件 100% 中性

- `.claude/skills/perfetto-trace-analysis/config.json` 移除 `gameProcess`、保留通用阈值
- `references/aoe-cpu-analysis-knowledge.md` → 整篇移到 `projects/aoeyz/business-modules.yaml`
- `references/aoe-watch-spec.yaml` → 整篇移到 `projects/aoeyz/probes.yaml`
- `references/perfetto-report-template.md` → 把"凉机野外/行军压测/MapSignificanceMgr"等死词替换成 `<场景描述>` `<业务模块名>` 等参数化占位符；项目包里再提供"参数化占位符 → 实际词"的填充表
- 金标准 `performance-report_perfetto_ULTIMATE_v5.3.md` 留作 AOE 验收基准；额外手工策展一份「通用形态金标准」（用 _generic 数据，纯用占位词）作为通用质量门基准

### 4.6 Web/CLI/SKILL 一致性

| 项 | 现状 | 改造 |
|---|---|---|
| Prompt | TS inline 一份 + SKILL.md 描述一份 | 抽到 `.claude/skills/perfetto-trace-analysis/prompts/triad-prompt.txt`，两边 readFileSync 同一份 |
| Args | `-p prompt`（Windows .cmd 截断风险） | 改成 stdin 注入：`buildArgs` 只传 `-p`，`child.stdin.write(prompt)` |
| reportTier | 隐式（默认调 LLM） | Web 加显式开关 `reportTier: L1 \| L2`，L1 = 仅骨架拼装版，L2 = LLM 填空 |

---

## 5. 落地路线（Sprint 计划）

### Sprint 1（第 1 周，半 ROI 立刻拿到）

| 工作项 | 估时 | 依赖 |
|---|---|---|
| C4 stdin 注入修 Windows .cmd 截断 | 0.5 天 | — |
| C9 修上游 provider bug（aoeHotSlices 口径 / cpu offline / threadsSched 清单） | 1 天 | — |
| C3 共享 prompt 模板抽到 `triad-prompt.txt` | 0.5 天 | — |
| **C1-MVP** `render_perfetto_numeric_cells.py`：渲染 70% 章节的纯表格 / 统计行 / ASCII 块（§-1 / §1 / §2 / §3 / §5.1 / §5.3 / §6.1 / §6.4 / §7） | 2 天 | — |
| Prompt 加"必须粘贴 numeric-cells 对应片段"硬规则 + 5 个 anti-example | 0.5 天 | numeric-cells |
| Web 接入：Provider 跑完 → 生成 numeric-cells.json → 喂给 CLI prompt | 0.5 天 | numeric-cells |

**Sprint 1 末产出**：70% 章节的数字幻觉物理消除，剩余 30% 仍由 LLM 写。预计能砍掉 60% 数字风险。

### Sprint 2（第 2 周，主菜）

| 工作项 | 估时 |
|---|---|
| C1 完整版：补 §0 ASCII 比例条 / §4.4 状态分布 / §4.5 因果链 ASCII / §6.2 callTreeSignatures 三态合并查表 | 3 天 |
| C5 三档质量门 + L1 回退（Python 把 numeric-cells + template 机械拼装） | 1 天 |
| C6 数值对账 `validate_perfetto_report.py` | 1 天 |

**Sprint 2 末产出**：单元格级数字幻觉物理消除，质量门级联完整，失败有兜底。

### Sprint 3（第 3-4 周，通用化改造，需要产品决策配合）

| 工作项 | 估时 | 依赖 |
|---|---|---|
| C2 项目包目录搭起 + AOE 知识结构化（`aoe-cpu-analysis-knowledge.md` → yaml） | 2 天 | 业务方 review |
| C2 auto-detect 加载器（pack.yaml.identify） | 1 天 | C2 目录 |
| C7 skill 文件去 AOE 死字符（template 参数化、references 移走） | 1 天 | C2 |
| C7 写「通用形态金标准」（人工策展 ~600 行） | 3-4 天 | 业务方协助选样本 |
| Web `reportTier: L1 \| L2` 显式开关 | 0.5 天 | Sprint 2 完 |

### 后续（按需，不阻塞主路径）

| 工作项 | 性质 |
|---|---|
| C8 跨数据源 data-contract.yaml | 远期。需要 schema 设计 spike，把 simpleperf hit-count 和 perfetto dur_ns 抽到同一层。**做不好反而把两条流水线焊死，慎重** |
| 重复 e2e 跑 N 次统计 PASS 率（标定阈值） | 跟 Sprint 2 末同步做 |
| 视觉化：质量门生成 `quality-report.html` | 锦上添花 |

---

## 6. 风险点 & 仍待验证的假设

| 风险 | 影响 | 缓解 |
|---|---|---|
| **R1 LLM 是否能稳守"粘贴而非复述"** | 高 | prompt + 5-10 次 e2e 跑 PASS 率验证；不达标考虑改"骨架填空"形态 |
| **R2 §6.2 callTreeSignatures 节点路径 key 设计** | 中 | 用 `parent > child` 拼接；考虑 collisions（同名子节点出现在不同父下）→ 加 disambiguator |
| **R3 facts.json 字段是否够 renderer 用** | 中 | 第一版直接读 summary 全集，确认 renderer 算法稳了再考虑是否扩 facts.json schema |
| **R4 通用形态金标准谁来写** | 高 | 这是 Sprint 3 的人力瓶颈，不是技术问题。需要业务方 + 性能 oncall 协作 |
| **R5 _generic 兜底包能不能真的通用** | 中 | 第二个项目接入时（不是 AOE）才能验证。在那之前 `_generic` 只是「中性版 AOE」，未必真通用 |
| **R6 跨 skill 数据契约（C8）值不值得做** | 低 | 不阻塞。先把 perfetto 这条链按本方案做完，看它和 simpleperf 实际有多少能复用，再决定 |

---

## 7. 与现有文档的关系

- **`docs/report-generation-methodology.md`** —— v4 方法论原文，本方案的"思想来源"。第 §3 节专门讨论了 perfetto 应该比 simpleperf 多做什么、能直接复用什么；本方案是其在 perfetto 维度的具体落地建议
- **`docs/perfetto-engineering-roadmap-v5.2.md`** —— perfetto 流水线工程演进 roadmap，本方案的 Sprint 1/2 工作项可作为下一步追加
- **`docs/perfetto-skill-web-integration-spec.md`** —— web ↔ skill 集成规范，本方案 §4.6（Web/CLI/SKILL 一致性）是其细化
- **`docs/perfetto-triad-delivery.md`** —— 三态对比产品需求，本方案是其报告生成层的实现选择
- **`.claude/skills/perfetto-trace-analysis/SKILL.md`** —— skill 入口文档，Sprint 3 末需要随 C7 同步更新

---

## 8. 一句话总结

不是「直接照搬 simpleperf v4 骨架」，也不是「保持 perfetto 现状全 LLM 写」，而是 **「保留 perfetto template 的形态灵活度 + Python 渲染所有数字单元 + LLM 强制粘贴片段 + 后置数值对账」**。这个第三种形态在 ~7-9 个工作日内拿到 v4 方法论 80% 的安全收益，同时保留 perfetto 报告"叙事跟数据走"的本质优势。

---

*版本：v1.0 · 2026-06-30*
*作者：审计讨论沉淀（Claude Code Internal × 项目 owner）*
