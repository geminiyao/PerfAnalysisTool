# 重构进度 · 唯一进度源

> 更新: 2026-06-19  
> **本文是任务清单的唯一来源。** 其它对话里的 Phase 编号若与本文冲突，以本文为准。

---

## 0. 读法：三层 × 三源（避免「完成了什么」混乱）

每一项能力分 **三层**，状态独立，不要混为一谈：

| 层 | 含义 |
|----|------|
| **CLI** | 命令行 / CodeBuddy skill 离线跑通，样例在 `output/p1-*` |
| **Web 入库** | `/upload` 拖文件 → 识别 → Provider → `runs` 表 + metrics |
| **Web 报告** | 入库后自动（或一键）产出 **skill 级 Markdown**，Run 详情「完整报告」Tab |

### 三源现状矩阵（2026-06-19）

| 源 | CLI skill + 样例 | Web 入库 | Web 报告（executeCli / builder） | 备注 |
|----|------------------|----------|----------------------------------|------|
| **Unity** | ✅ `output/p1-unity/` | ✅ | ✅ CodeBuddy `unity-profiler-analysis` + 富 UI | **已验收** |
| **Perfetto** | ✅ `output/p1-perfetto/` | ✅ | 🔄 代码已接，**待验收** | `perfetto-trace-analysis` + executeCli |
| **Simpleperf** | ✅ `output/p1-simpleperf/` | ✅ | 🔄 代码已接，**待验收** | `simpleperf-native-analysis` + executeCli |
| **Cross（单 Run 多源）** | ✅ `output/p1-cross/` | ✅ merge 入库 | 🔄 **builder 已有**，验收应 **晚于三源单源 Web 报告** | 非 AI skill，确定性 builder |
| **Compare（两 Run）** | 🔄 样例待齐 | ✅ 选 Run | ✅ `compare-report-builder` + 差分火焰图 | P3-3 raw diff 未做 |

**当前主战场：Phase 1 — Perfetto / Simpleperf Web 报告验收（代码已接）。**

---

## 1. 目标 UX（不变）

```text
/upload（单拖放区）
  1 个源 → 单源 Run → 单源 skill 报告
  ≥2 源  → 多源 Run → cross 报告（在单源报告能力就绪后再验收）

/compare
  选 2 个已有 Run → 对比报告 + 差分火焰图
```

旧 4 Tab 上传 UI 已废弃；`/runs`、`/runs/:id`、`/compare` 为正式入口。

---

## 2. 阶段清单（Phase 0 → 4，顺序即优先级）

### Phase 0 — 平台骨架 ✅ 已完成

| 项 | 状态 |
|----|------|
| 统一上传 `/upload` + `POST /runs/ingest/unified` | ✅ |
| 三源识别 + merge 入库 + `runs` 模型 | ✅ |
| 入库 SSE 进度 / 日志 | ✅ |
| Runs 列表 / 详情 / 侧栏 IA | ✅ |
| 旧路由 redirect | ✅ |
| Windows CodeBuddy spawn（PATH / cli-resolver） | ✅ |

**本阶段不再加功能；后续只在此之上接报告层。**

---

### Phase 1 — 三源单源 Web 报告闭环 ← **当前**

| 源 | 入库 | Web 报告 | 验收标准 |
|----|------|----------|----------|
| Unity | ✅ | ✅ | `/upload` 拖 `.pdata` → 完整报告 Tab = CLI 同级 Markdown；对标 `output/p1-unity/` |
| Perfetto | ✅ | 🔄 待验收 | 接 `perfetto-trace-analysis` + `executeCli`；对标 `output/p1-perfetto/` |
| Simpleperf | ✅ | 🔄 待验收 | 接 `simpleperf-native-analysis` + `executeCli`；对标 `output/p1-simpleperf/` |

**开发任务（Phase 1 代码）：**

- [x] `run-analysis-service`: 三源统一 `runSingleSourceSkillAnalysis`
- [x] `skill-config` + `cli-executor`: 通用 prompt / Mock / 产出校验
- [x] `source-profile-runner`: profile 预构建 + Mock 报告匹配
- [x] 入库 seed `*-profile-summary.json` → `results/<runId>/`
- [ ] Run 详情 perfetto/simpleperf 富 UI（Markdown Tab 可用，可后移）

**验收任务（Phase 1 人工）：**

- [x] Unity 单源 Web 全流程
- [ ] Perfetto 单源 Web 全流程（CodeBuddy，非 Mock）
- [ ] Simpleperf 单源 Web 全流程（CodeBuddy；Upload 填好 binary_cache 路径）

---

### Phase 2 — 单次多源 Cross（依赖 Phase 1 验收）

| 项 | 状态 |
|----|------|
| `cross-source-report-builder` 十节 Markdown | ✅ 代码已有 |
| 入库后多源自动 cross | ✅ 代码已有 |
| **人工验收**：拖三源目录 + 与 `output/p1-cross` 对齐 | ❌ 待 Phase 1 后做 |

**为何排在 Phase 1 后：** cross 各节引用 unity / simpleperf / perfetto 单源结论；单源 Web 报告未通时，无法判断 cross 对不对。

---

### Phase 3 — 双 Run 对比（依赖 Phase 1；可与 Phase 2 部分并行）

| 项 | 状态 |
|----|------|
| `/compare` 页面 + `compare-report-builder` | ✅ |
| 差分火焰图 | ✅ |
| **P3-3** 对比回读 raw（`func_compare` 等全量 diff） | ❌ 加厚项 |
| P3-5/6 层级差分树、jank/可比性加厚 | ❌ 加厚项 |

---

### Phase 4 — 体验加厚 + 工程清理

| 项 | 状态 |
|----|------|
| jank 列表、单源火焰图入口 | ❌ |
| P6 删 legacy 页（`Compare.tsx` 等）+ 旧 `sessions` 表 | ❌ |
| git 停止跟踪 `db.sqlite` / `output/preprocess-result.json` | ❌ |
| 复用 `vendor/agent-sdk` ProcessTransport（可选） | ❌ |
| CI `npm run build` 检查 | ❌ |
| P5 新源（FrameTimeline / Thermal） | ❌ 远期 |

---

## 3. 推荐验收顺序（与 Phase 对齐，无歧义）

| 顺序 | Phase | 做什么 | 通过标准 |
|------|-------|--------|----------|
| 1 | 1 | 拖 **单个 .pdata** | Unity 完整报告 Tab；对标 `output/p1-unity/` |
| 2 | 1 | 拖 **单个 .pftrace** | Perfetto skill Markdown；对标 `output/p1-perfetto/` |
| 3 | 1 | 拖 **单个 perf.data** | Simpleperf skill Markdown；对标 `output/p1-simpleperf/` |
| 4 | 2 | 拖 **三源目录**（含 meta.json） | cross 十节；对标 `output/p1-cross/` |
| 5 | 3 | `/compare` 选 base/opt | 五步 + 差分火焰图 + Markdown |
| 6 | 3+ | P3-3 raw diff 等 | 加厚，非 blocker |

---

## 4. 已锁定决策

1. 新模型：`runs` / `run_metrics` / `analyses` / `analysis_reports`；旧 `sessions` 只读，P6 再删。
2. 源 id：`unity_profiler` / `simpleperf` / `perfetto`。
3. 单源报告 = 各源 **CLI skill**；cross = **确定性 builder**（非 CodeBuddy）；compare = report-spec §5。
4. 帧口径：Unity = playerloop；Perfetto = choreographer；禁止 cross 里直比帧时长。

---

## 5. Unity Web 报告（Phase 1 唯一已闭环源）

- **预处理**：`unity-preprocess-runner` → `build-profile.ts`
- **报告**：`executeCli` → `unity-profiler-analysis` → `web/data/results/<runId>/performance-report.md`
- **Mock**：复制 `output/` 下帧数匹配报告
- **启动**：改 server 后 `npm run build`；推荐 `.\scripts\rebuild-and-start-web.ps1`

---

## 6. 文档索引

| 文档 | 用途 |
|------|------|
| `report-spec-and-data-contract.md` | 报告字段 / 验收 |
| `analysis-framework-design.md` | 架构 / PerfProfile |
| **本文** | 进度与优先级 |

---

## 附录 · 关键路径

- CLI 样例：`output/p1-unity/` `p1-simpleperf/` `p1-perfetto/` `p1-cross/`
- Web 分析入口：`web/server/services/run-analysis-service.ts` → `runPostIngestAnalysis`
- 启动：`.\scripts\rebuild-and-start-web.ps1`
