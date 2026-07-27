# COLLECTOR — 总待办表（BACKLOG）· 唯一需求真相源

> **这是 Collector 所有需求的唯一总表。** 任何新需求立即入表，不靠脑子记。
> 状态图例：✅完成　🔄进行中　⬜待办　⏸暂缓
> 坐标系：[路线图](roadmap.md)｜设计哲学：[philosophy.md](../philosophy.md)

---

## 北极星（不变）

造一个越用越会采对数据的采集 agent：说人话→自动操作设备→记住结果→对比历史发现回归→喂给 Prism 分析。先跑通最小循环，再逐个加厚。

---

## C0 · 最小循环（起点·1-2 天）

> **核心认知**：maple_sample.py 已能完整采集。C0 只包一层薄壳让"说需求"能触发它，不重构。

| ID | 需求 | 描述 | 状态 |
|----|------|------|------|
| **CL-1 collect.py 通用采集脚本** | 写 `scripts/auto_collector/collect.py`，接受简化指令（`collect.py "VG对比 60s"`）或结构化参数（`--label --duration --scene --tools`）。**参考 maple_sample.py 逻辑重写通用版，不 import 它**。项目参数从 `config.json` 读，代码不出现项目特化词 | ✅ 代码完成 |
| **CL-2 需求解析（关键词匹配）** | 最简解析：关键词匹配（"VG对比" → label=vg_compare, scene=StressTestBattleSimpleMode；"60s" → duration=60；"simpleperf" → tools 含 simpleperf）。**不用 LLM**，纯规则。后续 C4-D 升级为 LLM | ✅ 代码完成 |
| **CL-3 端到端验证** | 手机插电脑 + adb 连通 + 游戏前台 → `collect.py "VG对比 60s"` → 采集完成 → 文件产出 + meta.json + web 上传。C0 验收门 | ✅ 真机验证通过 |

**前置要求**：
- 手机插电脑，`adb devices` 能看到设备
- 游戏已安装并能启动
- simpleperf 二进制（maple_sample.py 会自动 push）
- 符号文件 `output/maple/symbols/libil2cpp.dbg.so`
- perfetto 脚本 `g:\AOEYZ_Trunk\Tools\AndroidPerfettoScripts\record_android_trace.py`

---

## C1 · 配置化（3-5 天）

> 把 maple_sample.py 硬编码常量抽成 YAML，换项目/场景改配置不改代码。

| ID | 需求 | 描述 | 状态 |
|----|------|------|------|
| **CL-4 采集配置 YAML Schema** | 定义采集 YAML 格式：scene / action（duration + profile_name）/ tools / output / meta。先只做参数配置化，不搞 Primitive 组合 | ✅ 完成 |
| **CL-5 Orchestrator 读 YAML 执行** | collect.py 改为读 YAML → 填参数 → 调用 maple_sample 函数。maple_sample 硬编码常量（PACKAGE_NAME/PROFILE_ACTIVITY/INTENT_ACTION/设备路径/perfetto 事件）从 YAML 读 | ✅ 完成 |
| **CL-6 项目级配置** | 项目特化常量放进 `projects/aoeyz/collect.yaml`，和现有 `pack.yaml` 并列。换项目只改 `projects/<name>/collect.yaml` | ✅ 完成 |

**C1 交付物**：
- Schema 文档：`docs/collector/plan/collect-yaml-schema.md`
- 项目配置：`projects/aoeyz/collect.yaml` + `projects/_generic/collect.yaml`
- 脚本改造：`scripts/auto_collector/collect.py`（新增 `--project` 参数，YAML 加载 + JSON 向后兼容）
- 验证：YAML 加载、键映射对账、NL 解析、JSON 向后兼容 — 全部通过

---

## C2 · 可组合（1-2 周）

> 拆 collect.py 成 Driver + Primitive，YAML 声明"用什么工具+做什么动作"。

| ID | 需求 | 描述 | 状态 |
|----|------|------|------|
| **CL-7 Driver 热插拔** | simpleperf/perfetto/unity-profiler 封装成统一 Driver 接口（start/stop/pull），YAML 声明 `tools: [simpleperf, perfetto]` → 对应 driver 按序启停 | ✅ 完成 |
| **CL-8 Primitive 框架 + 首批** | 定义 Primitive 接口（Lua 函数签名 + ADB intent 调用）。首批：`enter_scene` / `camera_sweep` / `wait_duration`。**游戏侧 Lua 不支持时用 ADB input 降级** | ✅ 完成 |
| **CL-9 runs/runMetrics 写入** | Orchestrator 收尾写 runs + runMetrics 表（run_id/时间/版本/场景/文件路径/指标）。复用现有 schema.ts 的 Run/runMetrics 模型 | ✅ 完成 |
| **CL-10 端到端验证** | 手写 YAML（场景+动作+工具）→ Orchestrator 执行 → 文件 + runs 写入。C2 验收门 | ✅ 完成 |

**C2 交付物**：
- `scripts/auto_collector/core.py` — 共享函数（从 collect.py 抽出，drivers/orchestrator 共用）
- `scripts/auto_collector/drivers/` — Driver 包（base + simpleperf + perfetto + unity_profiler + registry）
- `scripts/auto_collector/primitives/` — Primitive 包（base + enter_scene + camera_sweep + wait_duration + registry）
- `scripts/auto_collector/orchestrator.py` — Orchestrator（协调 Drivers + Primitives）
- `scripts/auto_collector/runs_writer.py` — runs/runMetrics 写入器（直接写 web/data/db.sqlite）
- `scripts/auto_collector/collect.py` — 重构为委托 Orchestrator，向后兼容 C0/C1
- `projects/aoeyz/collect-c2-demo.yaml` — C2 端到端验证 YAML（含 action.steps）
- Schema 文档更新：`docs/collector/plan/collect-yaml-schema.md`（C2 action.steps + Driver + runs 写入）
- 验证：Driver 注册表、Primitive 注册表、Orchestrator action.steps 检测、RunsWriter db 写入 — 全部通过

---

## C3 · 记忆回路（3-5 天）

> 建 collector-memory，Agent 唤醒时读记忆，干完写回。

| ID | 需求 | 描述 | 状态 |
|----|------|------|------|
| **CL-11 collector-memory 存取** | 复制 prism-memory.ts 读写逻辑，改分类（collect_plans/history/lessons）和根目录。**不动 prism-memory.ts**（零侵入） | ⬜ |
| **CL-12 采集历史沉淀** | Orchestrator 收尾自动写 collect_history（run_id/场景/参数/结果摘要/质量评分） | ⬜ |
| **CL-13 采集教训沉淀** | 采集失败/异常时写 collect_lessons（primitive 组合问题/设备异常/数据不可信） | ⬜ |
| **CL-14 采集计划管理** | 周期采集计划（场景/频率/版本）存入 collect_plans，CLI `--plan` 触发 | ⬜ |

---

## C4 · Agent 规划 + 回归告警（1-2 周）

> 加 Agent 规划层 + 回归告警 + Web UI + LLM 解析。

| ID | 需求 | 描述 | 状态 |
|----|------|------|------|
| **CL-15 Agent 规划 prompt** | Collector Agent 规划 prompt（读 collect_plans/history/lessons → 产出 YAML）。复用 ai-agent-session | ⬜ |
| **CL-16 回归告警** | 采集后查 trends 路由对比历史，P95 涨幅超阈值 → 告警 + 触发 Prism 分析 | ⬜ |
| **CL-17 Web UI 采集模式** | AI Workbench 加"采集模式"，复用 /ai/chat SSE，后端路由到 Collector Agent | ⬜ |
| **CL-18 LLM 需求解析** | C0-B 关键词匹配升级为 LLM 翻译（自然语言 → 采集参数/YAML） | ⬜ |

---

## C5 · DataRequest 闭环 + 完全自然语言（1 周）

> 分析缺口驱动补采 + 自然语言到顶。

| ID | 需求 | 描述 | 状态 |
|----|------|------|------|
| **CL-19 DataRequest 消费** | Agent 唤醒时读 DataRequest 池 open 项，映射成采集计划 | ⬜ |
| **CL-20 闭环验证** | Prism 产出 DataRequest → Collector 补采 → Prism 能用新数据 | ⬜ |
| **CL-21 完全自然语言** | 支持模糊需求（"测最近版本野外战斗有没有变卡"），Agent 自主规划全流程 | ⬜ |

---

## 硬边界与已知风险

- **Lua Primitive 依赖游戏侧**：C2 的 Primitive 需游戏内 Lua 接口。降级：ADB input，精度差但不阻塞。
- **零侵入 Prism**：C3 的 collector-memory 不动 prism-memory.ts，复制不抽取。等 Prism 稳定后再去重。
- **设备状态**：采集依赖设备在线、游戏前台、存储充足。Orchestrator 需预检逻辑。
- **C0 是快速胜利**：1-2 天跑通最小循环，后续都是加厚。

---

_本表是 Collector 唯一需求真相源。新需求立即入表，不靠脑子记。_
