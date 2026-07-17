# TODO-WT-040 · prism-memory 加 dataSource 字段 + 按数据源筛选注入

> 状态：TODO ｜ 里程碑：M5 多源扩展 ｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：无（纯代码 + 批量补字段）
> 开工前必读：`docs/prism/memory/dev/conventions.md` + `web/server/prism/prism-memory/README.md`（记忆系统结构）

## 背景

当前 prism-memory 的 frontmatter 没有 dataSource 字段：
- `priors/unity-cpu-*.md`: `source: unity-cpu`（隐含在文件名，没有显式 dataSource 字段）
- `capabilities/dr-*.md`: `source: <runId>`（不是数据源类型）
- `lessons/lesson-*.md`: `source: narrative-redteam/<runId>`（runId，不是数据源类型）

**问题**：perfetto 缺的工具（如 sched_blocked_reason ftrace）和 unity 缺的工具（如 per-marker GC 分配）完全不同，不区分数据源注入时 explore-prompt 会拿到无关数据源的缺口。例如 unity explore 时注入了 perfetto 的 capabilities（如"sched_blocked_reason ftrace 缺失"），对 unity 无意义。

**来源**：backlog.md:209 BK-能力回路数据源区分。

## 必读文档

- `web/server/prism/prism-memory/README.md` — 记忆系统四类结构 + frontmatter 格式
- `web/server/prism/prism-memory.ts` — loadMemory/appendMemory 实现
- `web/server/prism/ingest-memory.ts` — 摄入层脚本

## 任务

### 需求 A：appendMemory 加 dataSource 参数

**文件**：`web/server/prism/prism-memory.ts`

当前 appendMemory 签名：
```ts
appendMemory(category: string, entry: MemoryEntry): void
```

改成：
```ts
appendMemory(category: string, entry: MemoryEntry & { dataSource?: string }): void
```

MemoryEntry 接口加可选 `dataSource?: string` 字段。dataSource 取值：
- `perfetto` — Perfetto trace 分析
- `unity` — Unity profiler 分析
- `simpleperf` — simpleperf 分析
- `cross-source` — 跨源通用（如"GC.Collect 卡顿判定"这种任何源都适用的）

### 需求 B：formatMemoryForPrompt 按数据源筛选

**文件**：`web/server/prism/prism-memory.ts`

当前 formatMemoryForPrompt 签名：
```ts
formatMemoryForPrompt(opts: { categories?: string[]; ... }): string
```

改成：
```ts
formatMemoryForPrompt(opts: { categories?: string[]; dataSource?: string; ... }): string
```

当 `dataSource` 给定时，只返回该数据源的条目 + `cross-source` 条目（跨源通用）。当 `dataSource` 未给定时，返回全部（兼容现有行为）。

筛选逻辑：
- 条目的 `dataSource` 字段等于给定 `dataSource` → 包含
- 条目的 `dataSource` 字段等于 `cross-source` → 包含（跨源通用）
- 条目的 `dataSource` 字段等于其它数据源 → 排除
- 条目没有 `dataSource` 字段（旧条目）→ 包含（兼容期，避免老条目被过滤）

### 需求 C：explore-service.ts 传 dataSource

**文件**：`web/server/prism/explore-service.ts`

当前 explore-service 调 formatMemoryForPrompt 时传 categories，但不传 dataSource。改成传 source 字段（已有 `source?: 'unity' | 'perfetto'`）作为 dataSource。

### 需求 D：ingest-memory.ts 加 --data-source 参数

**文件**：`web/server/prism/ingest-memory.ts`

当前命令：
```bash
npx tsx server/prism/ingest-memory.ts --source <path> --category priors
```

加 `--data-source` 参数：
```bash
npx tsx server/prism/ingest-memory.ts --source <path> --category priors --data-source unity
```

### 需求 E：批量给现有条目补 dataSource 字段

**文件**：`web/server/prism/prism-memory/**/*.md`（79 priors + 24 capabilities + 10 lessons）

写一个脚本（或手动）批量补 dataSource frontmatter：
- 文件名含 `unity` / `aoe` / `csharp` / `lua` → `dataSource: unity`
- 文件名含 `perfetto` / `bk26b` → `dataSource: perfetto`
- 文件名含 `simpleperf` → `dataSource: simpleperf`
- 无法判断的 → `dataSource: cross-source`（保守标注）

**注意**：不要改条目正文，只加 frontmatter 字段。

## 硬约束

1. **向后兼容**：旧条目没有 dataSource 字段时，formatMemoryForPrompt 包含它（不排除），避免老条目被过滤
2. **cross-source 通用**：跨源通用的条目（如"GC.Collect 尖见尖峰不是稳态主因"这种判定逻辑）标 `cross-source`，所有数据源都能注入
3. **不破坏现有 explore**：改完重跑 unity explore（或 perfetto explore），注入的 memory 内容不空
4. **dataSource 取值固定**：`perfetto` / `unity` / `simpleperf` / `cross-source`，不许自创

## 验收 harness（必填，开发 agent 完成前自己跑通）

**通用 harness**（prism-memory 单元测试）：
```
cd web && npx tsx server/prism/prism-memory.test.ts
```
期望：全 PASS

**工单特定断言**：
```bash
# 1. prism-memory.ts 含 dataSource 参数
grep -c "dataSource" web/server/prism/prism-memory.ts
# 期望 ≥3（接口定义 + appendMemory + formatMemoryForPrompt）

# 2. formatMemoryForPrompt 支持按 dataSource 筛选
grep -c "dataSource" web/server/prism/prism-memory.ts
# 期望 ≥3

# 3. explore-service.ts 传 dataSource
grep -c "dataSource" web/server/prism/explore-service.ts
# 期望 ≥1

# 4. ingest-memory.ts 支持 --data-source 参数
grep -c "data-source\|dataSource" web/server/prism/ingest-memory.ts
# 期望 ≥1

# 5. 现有条目有 dataSource 字段（抽样检查）
grep -l "dataSource" web/server/prism/prism-memory/priors/unity-cpu-playerloop-tree.md
# 期望文件存在且含 dataSource

# 6. 现有条目覆盖率（≥80% 的条目有 dataSource 字段）
# 用脚本统计：有 dataSource 的条目数 / 总条目数 ≥ 0.8
```

**端到端冒烟**（重跑 unity explore，确认 memory 注入非空）：
```
cd web && npx tsx server/prism/explore.cli.ts --source unity --runId unity-outside-stressmove --output-dir data/prism-out/wt040-verify --dry-run
```
或用 explore-service 的 dry-run 模式，检查 prompt 里的 {{MEMORY_INJECTION}} 内容非空且只含 unity + cross-source 条目。

## 完成标准

1. 通用 harness（prism-memory.test.ts）全 PASS
2. 工单特定断言全 PASS
3. 端到端冒烟成功，unity explore 注入的 memory 非空且不含 perfetto 特定条目
4. 现有条目 ≥80% 有 dataSource 字段
5. 把改动清单告诉主 agent

---

## 主 agent 验收清单

1. 独立跑一遍通用 harness + 工单特定断言
2. 检查 unity explore 的 {{MEMORY_INJECTION}} 内容（不含 perfetto 特定的 capabilities，如 sched_blocked_reason）
3. 抽样检查现有条目的 dataSource 标注是否合理
4. 任一不通过 = 打回

## 注意事项

- **本工单是 unity 多态接入的前置**：不修的话 unity explore 会注入 perfetto 的 capabilities（如 sched_blocked_reason ftrace 缺失），噪音大
- **向后兼容是关键**：旧条目没 dataSource 字段时不能被过滤，否则现有 explore 会退化
- **cross-source 是逃生口**：不确定数据源的条目标 cross-source，所有数据源都能注入，保守标注
