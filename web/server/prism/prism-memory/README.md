# Prism 持久大脑（prism-memory）

Prism 跨 run 的持久记忆存储区。每次探索 run 不再"空白投胎"——M3-B 开局从此加载注入 prompt，M3-C 收尾往此写回。

## 四类内容

| 分类 | 目录 | 装什么 |
|------|------|--------|
| **priors** | `priors/` | 先验知识：人工种的种子（Unity CPU 通用 + AOE 业务专属等） |
| **knowledge** | `knowledge/` | 知识回路：run 确认的业务归因（来自 `findings.json`） |
| **capabilities** | `capabilities/` | 能力回路：DataRequest 池高频项（缺什么工具/采集） |
| **lessons** | `lessons/` | 质量回路：对错教训（依赖金标 BK-4 验收） |

`index.json` 记录各分类条目数与最后更新时间，供 `loadMemory` 快速概览。

## 条目格式

每条记忆是一个 `.md` 文件，YAML frontmatter + 正文：

```markdown
---
id: k1
category: knowledge
createdAt: 2026-07-11T05:00:00.000Z
source: run-20260711-120000
---

GC.Collect 70ms 卡顿由 LuaMgr 帧尾触发
```

## 手工增删（先全存、事后人工删错）

**新增**：在对应分类目录下新建 `{id}.md`，按上述格式填写；或调用 `appendMemory(category, entry)`。

**查看**：直接打开 `.md` 阅读，或 `loadMemory({ categories: ['knowledge'] })`。

**删错**：删除对应 `.md` 文件即可；`index.json` 会在下次 `appendMemory` 时自动重建。删后无需改代码。

**禁用某类注入**：在 `prism-memory.ts` 的 `MEMORY_CATEGORIES` 里把该类的 `enabled` 设为 `false`（M3-B 注入时只加载 enabled 类）。

## 扩展新分类

在 `MEMORY_CATEGORIES` 注册表加一项（`name` / `dir` / `enabled` / `description`），在此目录下建对应子文件夹，无需改读写核心逻辑。

## 知识摄入（ingest-memory）

原始 md / 未来 findings 等**不能原样入库**，需经摄入层清洗：脚本调度 + LLM 切条剔冗余 → `appendMemory` 落盘。

```bash
cd web
npx tsx server/prism/ingest-memory.ts --source <path-to.md> --category priors
# 可选：--label <稳定源标签>  --hints "额外上下文"
```

- **同 id 覆盖**：重跑同一源不会重复堆积条目。
- **分类参数化**：`--category` 不限于 priors，未来 knowledge / lessons 等走同一脚本。
- **人工反馈闭环**：尚未实现；接入点见 `ingest-memory.ts` 中 `HumanFeedbackIngestHook` / `applyHumanFeedback` TODO。
