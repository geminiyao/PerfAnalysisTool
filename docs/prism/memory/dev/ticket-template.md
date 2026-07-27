# Prism 工单模板（所有新工单必须用这个结构）

> **用途**：主 agent 开工单时复制这个结构填。开发 agent 接工单时，"验收 harness"字段必填，不填 = 工单不完整。
>
> **为什么强制**：DR-45 教训——工单验收只看"合规性标记"（provenance=LLM/无审计字段/无套话），没验"产出物结构完整性"，导致模板注入断链漏网。harness 字段逼开发 agent 把契约翻译成可执行命令，不是写"对照标杆核结构"这种模糊话。

---

## 工单标题：`<简要描述>`

### 背景

<2-3 句话说清为什么开这个工单。关联哪个 DR / 哪个用户反馈 / 哪个标杆。>

### 必读文档

<开发 agent 开工前必读的文档列表，通常 2-3 个。不读会踩坑的才列，不列无关文档。>

### 任务

<具体要改什么。按需求拆分（A/B/C...），每个需求指明文件 + 验收标准。>

### 硬约束

<不能违反的底线。通常 3-5 条。比如：三段管线硬契约 / render 层不写判定逻辑 / 不硬编码业务名 / 修完 harness 必须 FAIL=0。>

### 验收 harness（必填，开发 agent 完成前自己跑通，不丢给主 agent 验收）

**通用 harness（所有报告类工单都跑）**：
```
cd web && npx tsx server/prism/harness.ts --source <perfetto|unity|simpleperf> --dir <run-dir>
```

**工单特定断言**（开发 agent 填，把本工单的契约翻译成可执行检查）：
<比如：narrative.json 的 sections 数量 >= 7 / report.html 包含 threadOverview 表格 / drillDownMarker 对 Gfx.WaitForPresent 返回非空树。写可执行命令，不写"对照 v5.3 核结构"这种模糊话。>

**端到端冒烟**（开发 agent 完成前跑，确认产出物结构完整）：
```
cd web && npx tsx server/prism/run-perfetto-pipeline.ts --skip-explore --out <run-dir>
```
<或对应数据源的 pipeline 脚本。跑通后把 report.html 路径告诉主 agent。>

### 完成标准

1. 通用 harness FAIL=0
2. 工单特定断言全 PASS
3. 端到端冒烟成功，report.html 产出
4. 把 report.html 路径 + 改动清单告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做（不只信开发 agent 报告的 PASS）：

1. 独立跑一遍通用 harness + 工单特定断言
2. 打开 report.html 看结构（harness 验不了"叙事可读性"，要人看）
3. 对照标杆报告逐项核（如果工单要求对齐标杆）
4. 任一不通过 = 打回，不在错误基座上继续堆功能

---

## 注意事项

- **harness 是底线不是上限**：harness 全 PASS 不等于报告质量达标。主 agent 验收时还要看叙事可读性（人话先行/图文穿插/调用树有焦点），这是 harness 机器检查不到的。
- **工单特定断言必须可执行**：写 `npx tsx ...` 或 `node ...` 命令，不写"检查 X 是否 Y"这种需要人理解的指令。开发 agent 理解模糊指令会跑偏（DR-36）。
- **新数据源接入时**：harness.ts 的 [1] 节会自动检查对应模板文件，不用改 harness。但如果新数据源有特殊结构契约，要在 harness.ts 加 [2]/[3] 节的断言。

---

## 附录：Prism 五层 harness 体系（按层分建，不建超级 harness）

Prism 不只是报告生成，是"数据入口 → 三段管线 → 三条回路"的完整 agent。报告只是单次管线末端产物。harness 按层分建，每个工单跑对应层的 harness，**不建一个"验所有工单的超级 harness"**。

| 层 | harness 文件 | 验什么 | 适用工单 | 现状 |
|---|---|---|---|---|
| **工具层** | `tools-harness.ts`（待建） | 新查询工具返回结构 / provenance / 边界处理（空结果/超大结果/非法参数） | 加 queryXxx 工具、改 tools.ts | ❌ 待建（BK-HARNESS-TOOLS） |
| **ingest 层** | `ingest-harness.ts`（待建） | 新数据源灌库后 schema 完整 / 行数合理 / 字段非空 / 索引建对 | 接新数据源、改 schema.sql | ❌ 待建（BK-HARNESS-INGEST） |
| **explore 层** | `explore-harness.ts`（待建） | findings.json 结构 / conclusion 人话风 / 证据验证 / 账本对齐 / 候选清单覆盖 | 改 explore-prompt、调判定逻辑 | ❌ 待建（BK-HARNESS-EXPLORE） |
| **报告管线层** | `harness.ts`（已建） | 占位符注入 / narrative schema / report.html 视觉资产 | 改 narrative/render/模板 | ✅ 已建 |
| **回路层** | `loop-harness.ts`（待建） | 知识/能力/质量回路的注入与沉淀闭环（开局注入非空 / 收尾沉淀写盘 / 跨run 可读回） | BK-LOOP 相关 | ❌ 待建（BK-HARNESS-LOOP，等回路建设时一起建） |

### 开工单时怎么选 harness

- **报告类工单**（改 narrative/render/模板）：跑 `harness.ts`
- **工具类工单**（加查询工具/改 tools.ts）：跑 `tools-harness.ts`（建好后）
- **ingest 类工单**（接新数据源/改 schema）：跑 `ingest-harness.ts`（建好后）
- **explore 类工单**（改判定逻辑/调 prompt）：跑 `explore-harness.ts`（建好后）
- **回路类工单**（BK-LOOP）：跑 `loop-harness.ts`（建好后）
- **跨层工单**（比如"接新数据源"涉及 ingest + explore + 报告）：跑涉及的每一层 harness

### 建设原则

1. **跟着工单走，不超前建空壳**：哪层有工单就建哪层 harness。回路层连代码都没有，建了也是空的（DR-32：先确认单次质量 → 再搭回路）。
2. **每层 harness 自包含**：单独可跑，不依赖其它层。报告层 harness 不关心工具层，工具层 harness 不关心报告层。
3. **harness 文件命名统一**：`<层>-harness.ts`，放 `web/server/prism/` 下。已建的 `harness.ts` 是报告层的，后续可重命名为 `report-harness.ts` 保持一致（但当前工单还在用它，先不动）。
4. **工单模板的"验收 harness"字段不限定跑哪个**：填对应层的 harness 命令。模板是通用的，harness 按层分建。

### 待建 harness 工单（记入 backlog）

| 编号 | harness | 触发条件 | 依赖 |
|---|---|---|---|
| BK-HARNESS-TOOLS | 工具层 harness | 下次有加查询工具的工单 | 无 |
| BK-HARNESS-INGEST | ingest 层 harness | 下次接新数据源 | 无 |
| BK-HARNESS-EXPLORE | explore 层 harness | 下次改 explore 判定逻辑 | 无 |
| BK-HARNESS-LOOP | 回路层 harness | BK-LOOP 建设时 | BK-LOOP 代码先建 |
