# 重构进度 · 单一入口（精简版）

> 更新: 2026-06-18  
> **读本文只需 3 分钟**：下面 §1 看现状，§2 看目标 UX，§3 看还剩什么，§6 看验收顺序与挂账汇总。

---

## 1. 一句话：做了什么 / 没做什么

### 已打通（CLI + 数据库，不靠 Web 上传）

| 能力 | 状态 | 怎么验 |
|------|------|--------|
| 三源 Provider → PerfProfile → `runs` 入库 | ✅ | `ingest-run.ts` + 样本 `run_*` |
| 单源报告（skill） | ✅ | `output/p1-unity/` `p1-simpleperf/` `p1-perfetto/` |
| 多源 merge + 交叉分析 | ✅ | `run_base_cross` + `output/p1-cross/` |
| insights 入库 | ✅ | `analysis_reports` |
| Web：Runs 列表 + 详情（概览/报告 Tab/各源分区） | ✅ | `/runs`, `/runs/:id` |
| Web：双 Run 对比（五步 + 差分火焰图） | ✅ | `/compare` |
| Web：侧栏 7 项 IA | ✅ | 见 v2 §4 |

### 未打通（你的终极需求卡在这里）

| 能力 | 状态 | 说明 |
|------|------|------|
| **Web 拖文件 → 新 `runs`** | ✅ | **统一入口** `/upload`：多文件/目录 → 识别 → 入库 → skill |
| **Web 拖/选多源 → 自动 merge** | ✅ | 同次拖入三源 → 单 Run `sources≥2` + 自动 cross 报告 |
| **Web 一键产厚交叉报告** | ✅ | 多源 ingest 后自动 cross builder；详情可重跑 |
| **Web Unity 单源 skill 报告** | ✅ | ingest 后自动 `unity-profiler-analysis` CLI skill |
| **对比回读 raw 全量 diff** | ❌ | P3-3（最后阶段） |
| **删旧页/旧表** | 🔄 | 旧路由已 redirect；旧页组件文件仍保留 |
| **simpleperf/perfetto 单源厚报告** | ❌ | **最后阶段**（加厚 quality） |

---

## 2. 目标 UX（产品共识 · 建议采纳）

### 2.1 三种分析，两种入口（不要混成三个页签）

```text
入口 A「新建 Run」— 一个页签、一个拖放区
  拖 1 个源（或识别到目录里只有 1 种源）→ 单源 Run → 单源分析
  拖 2~N 个源（或识别到同次采集目录）→ 多源 Run → 自动可做交叉分析
  将来第 4 源：同一套识别规则扩展，不加新 Tab

入口 B「对比分析」— 独立页签 /compare
  选 2 个已有 Run（base vs opt）→ 对比 + 差分火焰图 + 对比报告
  不是「拖 N 个文件」，而是「拖/选 2 次采集的结果」
```

**这样合不合理？——合理，且和 v2 需求一致。**

| 问题 | 建议 |
|------|------|
| 多源要不要单独 Tab？ | **不要**。多源 = 一次 ingest 识别出 ≥2 源 → `Run.sources.length > 1`，详情页自动显示交叉分析。 |
| 单源 vs 多源怎么分？ | **按识别结果分**，不是用户选手动 Tab。拖整个 `base_PAL-xxx/` 目录 → 三源 Run；只拖 `.pdata` → 单源 Run。 |
| 对比和交叉要不要合并？ | **不要**。交叉 = 1 个 Run 内多源印证；对比 = 2 个 Run 前后差分。心智模型不同。 |
| 旧「按源分 Tab 的上传页」 | **废弃方向**。源是 Run 详情里的分区，不是导航维度。 |

### 2.2 拖放区行为（建议实现规格）

1. **接受**：单文件、多文件、整个采集目录（含 `meta.json` 时优先读元数据对齐）。
2. **识别**：扩展名 / 文件名 → `unity_profiler` | `simpleperf` | `perfetto` | 未来源。
3. **分组**：同 `device + scene + mono_ns 窗口`（或目录路径）→ 视为同一次采集 → 一个 Run。
4. **入库**：每种源 Provider → `ingest-run`（多源时内部 merge）。
5. **跳转**：
   - `sources.length === 1` → `/runs/:id`（单源分析）
   - `sources.length >= 2` → `/runs/:id` + 提示「可生成交叉报告」
6. **对比**：在 Runs 列表勾选 2 个 Run →「去对比」，或 `/compare` 下拉选择（不做进拖放区）。

---

## 3. 还剩什么（按优先级，只做这一份清单）

### Phase 0 — 统一采集上传 → runs + skill（替代 4 Tab）

- [x] **统一入口** `POST /runs/ingest/unified` + Upload 单页拖放（多文件 + 选目录）
- [x] 识别 `.pdata` / `perf.data` / `.pftrace` / `meta.json` → 自动 merge 入库
- [x] 入库 SSE 进度 + 实时日志
- [x] **入库后自动分析**：Unity 单源 → `unity-profiler-analysis` skill；多源 → cross builder
- [x] Perfetto 剪枝参数仍可在 Upload 表单调
- [x] Runs 列表勾选 2 个 →「去对比」
- [x] **你** 用样例 `.pdata` 验收 Unity 报告与 CLI 一致（同输入同 skill → 同输出）
- [ ] **你** 拖三源目录验收多源 Run + 交叉报告

**验收**：`/upload` 拖文件 → 进度条走完 → 跳转 `/runs/:id` 完整报告 Tab 有 Markdown。

### Phase 0 (legacy) — 分 Tab 验收（已废弃 UI，API 仍保留）

- [x] 旧 4 Tab 已移除；`POST /runs/ingest/{unity,simpleperf,perfetto,merge}` 仍可用

### Phase 1 — 单次 / 交叉报告 Web 闭环

- [x] **WEB-CROSS**：生成报告 → `cross-source-report-builder` 十节 Markdown (非 fallback stub)
- [ ] P2 余量：jank 列表、单源火焰图入口（可后移）

### Phase 2 — 对比报告 Web 闭环

- [x] **P3-2**：`compare-report-builder` + `/compare` 页面 Markdown 渲染
- [ ] **P3-3**：对比回读 raw（`func_compare` 等）
- [ ] P3-5/6：unity/perfetto 层级差分树；jank/可比性加厚

### Phase 3 — 清理与扩展（**最后阶段 = 报告加厚 + P3-3 + P6 删文件**）

- [ ] **最后阶段**：simpleperf / perfetto 单源厚报告 skill 接入
- [ ] **P3-3**：对比回读 raw（`func_compare` 等）
- [ ] **P3-5/6**：unity/perfetto 层级差分树；jank/可比性加厚
- [ ] **P6**：删 `Compare.tsx`、`MapleComparePage` 等 legacy 源文件 + 旧 session 表
- [ ] **P5**：FrameTimeline / Thermal 等新源

---

## 4. 已锁定决策（勿重开）

1. 新模型表：`runs` / `run_metrics` / `analyses` / `analysis_reports`；旧表只读不删（P6 再删）。
2. 源 id：`unity_profiler` / `simpleperf` / `perfetto`；去 Maple 命名。
3. 报告结构：单源 skill 报告；多源交叉 `p1-cross` 级；对比 report-spec §5 五步 + simpleperf 差分火焰图。
4. `p1-cross` 是**单次多源**报告，不是对比报告；对比对标 `p3-compare`（待建）。
5. core/detail 分离；callTree 在 detail；深层 diff 回读 raw，不指望剪枝树（CT3）。

---

## 5. 文档阅读顺序

| 文档 | 何时读 |
|------|--------|
| `performance-platform-requirements-v2.md` | 需求争论时 |
| `report-spec-and-data-contract.md` | 报告字段/验收 |
| `analysis-framework-design.md` | 架构/data 模型 |
| **本文** | 每次开工前：§1 §3 |

---

## 6. 建议验收顺序 & 遗留需求汇总

> 对齐「一个个 Tab 来」；**上传后不会自动跑 skill**，需 Run 详情页手动「生成报告」（或 CLI）。

### 6.1 建议验收顺序（2026-06-18 更新）

| 步骤 | 做什么 | 通过标准 |
|------|--------|----------|
| 1 | `/upload` 拖 **单个 .pdata** → 解析入库并分析 | Run 详情「完整报告」有 Unity skill Markdown；对标 CLI `output/p1-unity/` |
| 2 | 拖 **perf.data**（可含 binary_cache 路径） | 详情页 simpleperf 分区；报告 Tab 为占位说明 |
| 3 | 拖 **.pftrace** + 剪枝 0.1% | perfetto 分区；OnTick 下 Mgr 完整度符合预期 |
| 4 | 拖 **整个采集目录**（三源 + meta.json） | `sources≥2`；自动 cross 报告十节结构 |
| 5 | `/compare` 选 base/opt Run | 五步 + 差分火焰图 + 厚 Markdown |

### 6.1.1 Unity 同输出保证

- **预处理**：`build-profile.ts`（与 skill preprocess 同源）
- **报告**：`unity-profiler-analysis` CLI skill → `performance-report.md`（与旧 session 分析相同 `executeCli` 路径）
- **Mock 模式**：复制 `output/` 下帧数匹配的已有报告，不消耗 token；真实对比请用 **CodeBuddy** CLI
- **Windows 后台服务**：改 server 代码后须 `npm run build`；推荐 `.\scripts\rebuild-and-start-web.ps1` 启动（补 System32/PowerShell PATH；`buildCliSpawnEnv` 在 spawn 时兜底）

### 6.1.2 已知限制（验收时知悉，非 blocker）

| 项 | 说明 |
|----|------|
| 统一拖放入口 | ✅ `POST /runs/ingest/unified` + Upload 单页 |
| AI skill 全文 | Unity 单源走 **真实 CLI skill**；多源 Web 为 **确定性 builder** |
| simpleperf/perfetto 厚报告 | **最后阶段** |

### 6.2 近几轮对话挂账（未做 / 待你定优先级）

| 项 | 说明 | 优先级建议 |
|----|------|------------|
| **WEB-CROSS** | Web「生成报告」→ 十节 Markdown (`cross-source-report-builder`) | ✅ 已实现 |
| **P3-2** | `/compare` 厚 Markdown (`compare-report-builder`) | ✅ 已实现 |
| **P3-3 raw 回读** | 对比时 `func_compare` 等全量 diff | Phase 2 |
| **P6 删 legacy** | `Compare.tsx`、Maple 页、旧 session 表 | Phase 3 |
| **CT1–CT3** | 定制下钻、剪枝树局限说明 | 按需 |
| **S*/PF*** | 采集/Provider 质量 backlog | 按需 |

### 6.3 若要做「上传完自动跑 skill」

请拍板一种（或组合）：

1. **单源**：每个 Tab ingest 成功后自动 invoke 对应单源 skill → 写 `analysis_reports`
2. **多源**：merge 成功后自动 invoke cross-source skill
3. **都不自动**：维持现状，详情页手动「生成报告」（当前行为）

---

## 附录 A · 挂账 backlog（细节，需要时再查）

| ID | 摘要 | 阶段 |
|----|------|------|
| WEB-INGEST | 统一拖放入口 → runs + skill | ✅ |
| WEB-CROSS | skill 厚交叉报告 | ✅ cross-source-report-builder |
| P3-2 | compare skill + p3-compare md | ✅ compare-report-builder (Web/API) |
| P3-3 | raw 回读 func_compare | Phase 2 |
| P3-5/6 | 层级差分树、jank 对比 | Phase 2 |
| P3-7 / U4 | 删 legacy 页表 | Phase 3 |
| U1/XS1 | 报告 Tab / 全文 | Phase 1 |
| S1–S4, PF1–PF4 | 采集/Provider 质量 | 按需 |
| CT1–CT3 | 定制下钻、剪枝树 | 按需；Perfetto 剪枝参数已可在 Upload Tab 调 |
| XS2/XS3 | asset 去重、单源/多源 Run 并存 | Phase 3 低优 |
| U3 | 源码映射 | ✅ 已完成 |

## 附录 B · 关键样本与 URL

- 多源 Run：`run_base_cross` → `/runs/run_base_cross`
- 对比：`/compare?base=run_base_cross&current=run_opt_cross`
- 交叉报告样例 (CLI skill)：`output/p1-cross/performance-report_20260618120000.md`
- 交叉报告落盘 (Web)：`output/p-web-cross/performance-report_*.md`
- 对比报告落盘 (Web)：`output/p3-compare/compare_*_vs_*.md`
- 启动：`.\scripts\rebuild-and-start-web.ps1`（Node 20）
