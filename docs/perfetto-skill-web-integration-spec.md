# Perfetto v5.2 Skill 接入 Web 平台 · 工程交付包

> **目标**:把当前已沉淀的 perfetto-trace-analysis skill (v5.2 终极形态报告) 接入 web 服务,让用户上传 perfetto trace 后,平台自动产出 v5.2 格式报告 (而不是当前 web 内置的 v3 简单报告)。
>
> **本文档可直接交给其他 agent 完成**。包含:背景、需求、当前状态、实施步骤、API 契约、验收清单。
>
> **当前状态(2026-06-24)**: skill 已沉淀完毕(SKILL.md M1-M4 + 报告模板 + 阈值表 + 历史教训),CLI 端 (`scripts/build_perfetto_profile.py`) 已经能产 v5.2 富化 summary。Web 端仍用 v3 简单报告,需要升级到 v5.2 形态。

---

## §1 背景与现状

### 1.1 用户使用流程(目标态)

```
1. 主美 / 性能优化人员把手机插上电脑
2. 双击 `record_aoeyz.bat` 三次,采 base / cur / throttle 三段
   → 三份 sample_<stamp>/ 目录(含 .pftrace + collection-manifest.json + thermal_before/after.txt + cpuinfo_max_freq.txt)
3. 在 web UI 上传三个目录(或单个 .pftrace + 旁路文件作为 ZIP)
4. 后端自动:
   a. 跑 build_perfetto_profile.py × 3 出三份富化 summary
   b. 套 v5.2 模板生成 markdown 报告(含三态对比 / callTrees 缩进树 / GPU-bound 判定 / 降频判定)
5. 前端 render markdown,产品 / 主美查看
6. (可选) AI 加润色 + 优化建议
```

### 1.2 当前 Web 实现状态

| 模块 | 文件 | 现状 | 差距 |
|---|---|---|---|
| Perfetto trace 上传入口 | `web/server/services/run-ingest-service.ts` `buildPerfettoProfile()` | ✅ 能跑 build_perfetto_profile.py | 仅支持单份 trace 上传, 不支持三份对比 |
| Perfetto profile schema | `web/shared/perf-model.ts` | ✅ 已定义 | 不含 v5.2 新字段(threadsSchedList / aoeHotSlices.selfMs / throttling.thermal / binderPeers.byServerProcess / gcAllocByModule) |
| Perfetto 报告生成 | `web/server/services/single-source-report-builder.ts` `buildPerfettoMarkdown()` line 165-280 | ⚠️ **v3 时期简单格式**, 8 个章节、无视觉化资产 | 需要重写到 v5.2 形态(§-1/§0/§3-§7/§9 + ASCII 缩进树 + 因果链) |
| 旁路文件支持 | (无) | ❌ 不支持 thermal_before/after.txt / collection-manifest.json | 需要新增 `ingestPerfettoSampleDir()` 函数,识别 sample_<stamp>/ 完整目录 |
| 跨次对比 | `run-compare.ts` 已有 unity/simpleperf 跨 run 对比 | ⚠️ 有框架但没接 v5.2 三态对比模板 | 需要新增 perfetto 三态对比 |
| 前端上传页面 | `web/src/pages/Upload.tsx` | ✅ 单文件上传 | 需要新增"批量上传 base/cur/throttle 三份"模式 |

---

## §2 需求清单(可拆分为 Story)

按优先级排列,每条 Story 自带验收标准。

### Story 1: Provider 端能力 → Web Schema 同步 (P0)

**目标**: 把 v5.2 Provider 输出的所有新字段写入 web TS schema,让后端 / 前端能强类型读到。

**实施**:
- 修改 `web/shared/perf-model.ts`,在 `PerfettoDetail` 接口新增字段:
  - `threadsSchedList: ThreadSchedListEntry[]`(含 RHI / LuaMtGC / ECSWorker_N 通用名 + tid + commName + identifiedBy)
  - `aoeHotSlices[].selfMs / .selfPct`(剥洋葱后字段)
  - `throttling.thermal: { zone, before, after, deltaC }`
  - `throttling.collectionManifest: { isRoot, sysfsBefore, sysfsAfter, scalingMaxFreq }`
  - `throttling.perCpu[].cpuinfoMaxMhz / .reachVsCpuinfoPct`
  - `binderPeers: { byTxnName, byServerProcess[].serverProcess + .serverPid }`
  - `gcAllocByModule[]`(已有 schema 上扩展)
  - `offCpuAttribution: { totalOffCpuMs, byState, byReason, wakerTopK }`

**验收**:
1. ✅ TS 编译无报错
2. ✅ 跑 `cd web && npx tsc --noEmit -p tsconfig.server.json` 通过
3. ✅ 前端 `web/src/components/SourceDetailPanel.tsx` 也跟着加字段(可以先只读不展示, 但类型必须对齐)
4. ✅ 旧 perfetto-profile.json (v5.2 之前 Provider 产出的) 仍能被新 schema 解析(用 optional 字段)

**预期工时**: 2-3 小时

---

### Story 2: Perfetto Sample 目录上传支持 (P0)

**目标**: Web UI / API 支持上传完整的 `sample_<stamp>/` 目录(含 .pftrace + 旁路文件),后端识别旁路文件并传给 Provider。

**实施**:
- 后端
  - 新增 `web/server/services/run-ingest-service.ts` `ingestPerfettoSampleDir(dir)` 函数:
    - 识别目录下的 `*.pftrace` (主 trace)
    - 识别 `collection-manifest.json` / `thermal_before.txt` / `thermal_after.txt` / `cpuinfo_max_freq.txt`
    - 把整个目录拷贝到 jobWorkDir,**不要只拷贝 .pftrace**(Provider 端 `_load_sysfs_sidecars` 函数依赖同目录有这些旁路文件)
    - 调用 `buildPerfettoProfile(tracePath, ...)` 跑 Provider
- API
  - 修改 `web/server/services/ingest-job-service.ts` 支持 `multipart/form-data` 多文件上传 (已支持但可能没识别 sample 目录格式)
  - 或新增 `POST /api/ingest/perfetto-sample` 接收 ZIP 压缩包,后端解压到 jobWorkDir
- 前端
  - 修改 `web/src/pages/Upload.tsx` 的"perfetto 上传"区:
    - 选项 A: 拖拽整个 sample_<stamp>/ 目录 (Chrome `webkitdirectory`)
    - 选项 B: 让用户先 ZIP 整个目录再传

**验收**:
1. ✅ 上传单份 `sample_base_20260624_104944/` 目录能成功 ingest, 出富化 summary (含 throttling.thermal 字段)
2. ✅ 上传不含旁路文件的纯 .pftrace 也能 ingest (向后兼容, throttling.thermal=null)
3. ✅ collection-manifest.json 内容能在 web 后端日志里打出 (`[ingest] sample meta: {isRoot: 0, ...}`)
4. ✅ 解析时间 < 4 分钟 (256MB trace 在中端服务器上)

**预期工时**: 4-6 小时

---

### Story 3: V5.2 报告生成器(buildPerfettoMarkdownV52) (P0,核心)

**目标**: 在 `web/server/services/` 新增 `perfetto-v52-report-builder.ts`,套 perfetto-report-template.md 模板生成 v5.2 格式 markdown。

**实施**:

1. **读模板上下文文件** (路径相对 `K:\AI\PerfAnalysisTool_Codebuddy\.claude\skills\perfetto-trace-analysis\`):
   - `SKILL.md` (4 条核心方法论 M1-M4)
   - `references/perfetto-report-template.md` (报告骨架)
   - `references/aoe-watch-spec.yaml` (阈值表)
   - `references/aoe-cpu-analysis-knowledge.md` (业务热点知识库)
   - `references/lessons-learned.md` (反模式列表)

2. **报告章节结构** (严格按模板):
   - §-1 数据采集 · 能力声明 (含 -1.1 数据列表 / -1.2 数据维度矩阵 / -1.3 能/不能回答的问题)
   - §0 结论先行 (引用块 + 加粗 + 缩进树, **禁用对比表格**)
   - §1 采集质量声明 + 数据口径 (含单次 avgMs 公式表)
   - §2 采集元信息表 (含 Choreographer fps vs PlayerLoop fps 跨 vsync 判定)
   - §3 多线程独立分析 (§3.1-§3.7 逐条小节)
   - §4 主线程 off-CPU 归因 (含 §4.4 ASCII 状态分布 + §4.5 因果链)
   - §5 降频时序证据链 (含 §5.2 形态识别 + §5.4 四档判定矩阵)
   - §6 主线程一帧时间去向 (含 §6.2 callTrees 缩进树 + §6.3 子函数下钻 + §6.4 红线清单)
   - §7 渲染链路 + GPU bound 判定 (含 §7.1 单次 Gfx.WaitForPresent vs vsync 阈值)
   - §9 本源能力边界 + 工程化建议 (分四档)

3. **关键算法**:
   - **callTrees 父子链查询** (M1 方法论): 套 `findNode(callTrees[].root, name)` 找节点 totalMs / count, 不要用 atraceSlices LIKE
   - **selfMs 用 aoeHotSlices.selfMs** (Provider 已落)
   - **降频判定级**: 直接读 `throttling.level` 字段, Provider 已四档
   - **GPU-bound 强信号**: `system.gfxWaitForPresent.avgMs > vsyncPeriod` (从 Choreographer fps 反推 vsyncPeriod)
   - **阈值打标**: 读 `aoe-watch-spec.yaml` 的 `systemLevelThresholds` + `moduleSingleCallRedlines`, 给报告里的数字加 🔴🟡🟢 标签

4. **输入**: 1-3 份 PerfettoProfile JSON (单份 → 单源报告; 三份 → base/cur/throttle 三态对比报告)

5. **输出**: markdown 字符串 + 写入 `web/data/runs/<runId>/report.md`

6. **集成**: 在 `single-source-report-builder.ts` line 542 `if (kind === 'perfetto') return buildPerfettoMarkdown(summary);` 改成调 `buildPerfettoMarkdownV52(summary)`(单源模式)。三态对比走 `cross-source-report-builder.ts` 那条路径,新增 `buildPerfettoTriadReport(base, cur, throttle)`。

**验收**:
1. ✅ 单份 trace 生成的 v5.2 报告章节齐全(§-1/§0/§3-§7/§9), 跑通 v5.3 复用验证那个流程(子 agent 写出来的 v5.3 与本工具产出的 v5.3 章节结构一致, 数字误差 < 1%)
2. ✅ 三份 trace (base/cur/throttle) 生成的对比报告含三态缩进树 + 形态演化判定 + 降频时序对照
3. ✅ §0 结论先行用引用块缩进树 (禁用对比表格)
4. ✅ §6.2 主线程 callTrees 缩进树 ASCII 正确, 数字从 callTrees 字段读 (不是 atraceSlices LIKE)
5. ✅ 报告里所有红线数字带 🔴🟡 标签 (从 aoe-watch-spec.yaml 读阈值)
6. ✅ 跑 `K:\AI\PerfAnalysisTool_Codebuddy\output\p1-base24/cur24/throttle24` 三份 summary, 产出的报告与 v5.3 子 agent 版本对齐

**预期工时**: 12-16 小时 (核心,有点复杂)

**实施提示**:
- 参考 v5.2 / v5.3 报告作为黄金样本 (`K:\AI\PerfAnalysisTool_Codebuddy\docs\report\performance-report_perfetto_ULTIMATE_v5.{2,3}.md`)
- 大部分章节是"读字段 + 套字符串模板", 只有 §6.2 缩进树需要递归
- 跨次对比 (Δ%) 用 ms/帧 + totalPct 双口径

---

### Story 4: Web UI 三态采集对比页 (P1)

**目标**: 新增前端页面让用户上传三份 trace 并查看对比报告。

**实施**:
- 新增 `web/src/pages/PerfettoTriad.tsx` (或扩展现有 `RunComparePage.tsx`):
  - 三个上传区 (base / cur / throttle)
  - 提交后 polling 后端 ingest 进度
  - 完成后 render markdown 报告 (用 react-markdown)
- 路由: `/perfetto-triad`

**验收**:
1. ✅ 三个上传区 UI 清晰
2. ✅ 上传后能看到进度条 (跑三份 build_perfetto_profile.py 大约 4-6 分钟)
3. ✅ 完成后 markdown 报告 render 出 ASCII 缩进树 (要用 monospace 字体)
4. ✅ 报告里的图表 (温度时序 / cpu reach% 对照) 用合适的图表库 render (echarts / recharts)

**预期工时**: 6-8 小时

---

### Story 5: 阈值表自动打标 (P1)

**目标**: Provider 自动读 `aoe-watch-spec.yaml` 的阈值, 给 callTrees 节点 / aoeHotSlices 加 severity 字段。报告侧直接用 severity 标 🔴🟡🟢。

**实施**:
- 修改 `scripts/perfetto_provider.py`:
  - 加 `_load_watch_spec()` 函数读 yaml
  - 加 `_apply_thresholds(profile, spec)` 函数,递归 callTrees + aoeHotSlices, 节点 totalMs / 单次 avgMs 触发阈值时加 `severity: critical / warn / info`
  - profile.json 输出时含 severity 字段

**验收**:
1. ✅ 跑 cur24 trace, BattleHeadMgr.OnUpdate 节点 selfMs 1.51ms 触发 redlineMs=1.0 → severity=warn
2. ✅ throttle24 trace, OutSideViewArmyLineMgr 节点 selfMs 2.43ms 触发 criticalMs=2.0 → severity=critical
3. ✅ throttle24 大核 reach=59.2% 触发 throttling-likely-bigreach → 整 throttling 块 severity=critical
4. ✅ 报告生成器 (Story 3) 能直接读 severity 加标签, 不需要重复实现阈值规则

**预期工时**: 4-6 小时

---

### Story 6: 跨 Run 历史对比 (P2)

**目标**: 同一场景(行军压测)跨多次采集对比,看版本演进 / 优化效果。

**实施**:
- 扩展 `web/server/services/run-compare.ts` 增加 perfetto 跨 run 对比 (已有 unity/simpleperf 的实现可参考)
- 前端 `Compare.tsx` 加 perfetto 选项

**验收**:
1. ✅ 选两个不同时间的 cur run, 自动出 Δms/帧 对比表
2. ✅ 报告里突出 "MapSig 单次 avg 从 1.30ms 涨到 1.52ms (+17%) 触红线"

**预期工时**: 4 小时

---

### Story 7: AI 润色层 (P2,可选)

**目标**: V5.2 报告生成器出确定性内容,AI Agent 加一层"业务侧解读 + 个性化优化建议"。

**实施**:
- 新增 `web/server/services/ai-agent-session.ts` 已经有 ai 入口, 加 perfetto 专用 prompt:
  - 读 `SKILL.md` + `aoe-cpu-analysis-knowledge.md` + 当前 v5.2 报告
  - 输出"针对本 run 的具体业务建议"段落, 附在报告 §9.2 之后

**验收**:
1. ✅ 用户开关可控 (有些用户只要确定性报告)
2. ✅ AI 输出的建议引用 v5.2 报告里的具体数字 (不脱节)

**预期工时**: 6 小时

---

## §3 总工时与里程碑

| 里程碑 | Stories | 工时 | 价值 |
|---|---|---|---|
| **M1: 后端能出 v5.2 报告** | 1 + 2 + 3 | 18-25 小时 (~3 工作日) | 后端能力齐, 可命令行测试 |
| **M2: 前端可视化** | 4 | 6-8 小时 | 用户可上传 + 看报告 |
| **M3: 自动化提升** | 5 + 6 | 8-10 小时 | 阈值表打标 + 历史对比 |
| **M4: AI 润色(可选)** | 7 | 6 小时 | 个性化建议 |

**总工时估算**: M1+M2 共 ~32 小时(1 周), M3+M4 共 ~16 小时(2-3 天)。

---

## §4 必读文档清单(交付 agent 时一并提供)

实施前必读:

1. `K:\AI\PerfAnalysisTool_Codebuddy\.claude\skills\perfetto-trace-analysis\SKILL.md` — 核心方法论
2. `K:\AI\PerfAnalysisTool_Codebuddy\.claude\skills\perfetto-trace-analysis\references\perfetto-report-template.md` — 报告模板骨架(必须严格遵循)
3. `K:\AI\PerfAnalysisTool_Codebuddy\.claude\skills\perfetto-trace-analysis\references\aoe-watch-spec.yaml` — 阈值表
4. `K:\AI\PerfAnalysisTool_Codebuddy\.claude\skills\perfetto-trace-analysis\references\lessons-learned.md` — 历史教训, 避免重蹈覆辙
5. `K:\AI\PerfAnalysisTool_Codebuddy\docs\report\performance-report_perfetto_ULTIMATE_v5.2.md` — v5.2 黄金样本
6. `K:\AI\PerfAnalysisTool_Codebuddy\docs\report\performance-report_perfetto_ULTIMATE_v5.3.md` — v5.3 子 agent 验证版 (与 v5.2 章节一致, 证明 sediment 可复用)
7. `K:\AI\PerfAnalysisTool_Codebuddy\scripts\perfetto_provider.py` — Provider 实现 (要看其输出 schema 才能写报告生成器)
8. `K:\AI\PerfAnalysisTool_Codebuddy\web\server\services\single-source-report-builder.ts` — 现有 v3 报告 builder (要替换的模块)
9. `K:\AI\PerfAnalysisTool_Codebuddy\web\shared\perf-model.ts` — TS schema (Story 1 要扩展)

参考样本数据:

10. `K:\AI\PerfAnalysisTool_Codebuddy\output\p1-base24\perfetto-profile-summary.json`
11. `K:\AI\PerfAnalysisTool_Codebuddy\output\p1-cur24\perfetto-profile-summary.json`
12. `K:\AI\PerfAnalysisTool_Codebuddy\output\p1-throttle24\perfetto-profile-summary.json`

---

## §5 关键约束(MUST NOT VIOLATE)

实施 agent 必须遵守:

1. ❌ **不要重新发明 v5.2 报告骨架** — 严格套 perfetto-report-template.md, 不要自创章节
2. ❌ **不要用 atraceSlices LIKE 全 trace 数据当业务模块占帧消耗** — 必须用 callTrees (M1 方法论, lessons-learned #1)
3. ❌ **不要在 §0 第 2 条结论用对比表格** — 必须用层级缩进树 (template 反模式 #2)
4. ❌ **不要双重计数 WaitForPresent + Gfx.WaitForPresent** — 用 selfMs 字段 (Provider 已去重)
5. ❌ **不要把 trace 实际窗口和配置时长当一致** — 三份物理时间不同是预期, 用 ms/帧 + totalPct 归一化
6. ❌ **不要在 GPU 没 busy counter 时硬给"GPU 满载"** — 用单次 Gfx.WaitForPresent > vsync 这个间接强信号
7. ❌ **不要破坏现有 web 接口的向后兼容** — 单份 perfetto trace 上传仍能跑(走 v3 还是 v5.2 都行,但不能崩)
8. ❌ **不要把华为非 root 限制硬编码** — 依据 collection-manifest.json 自适应

---

## §6 验收总清单

**M1 (后端能出 v5.2 报告) 验收脚本**:

```bash
# 1. Provider 能跑 + 输出富化 summary
cd K:\AI\PerfAnalysisTool_Codebuddy
python scripts/build_perfetto_profile.py \
  --trace G:\AOEYZ_Trunk\Tools\AndroidPerfettoScripts\sample_base_20260624_104944\2026-06-24_10-49-c1a652.pftrace \
  --out output/test-base
# 期望: throttling=likely, threadsSchedList 含 RHI/LuaMtGC/ECSWorker_0..3, binderPeers.byServerProcess 非 null

# 2. Web 端能 ingest 并出 v5.2 报告
curl -X POST http://localhost:3000/api/ingest/perfetto-sample \
  -F "sample=@sample_base_20260624_104944.zip"
# 期望: 返回 runId, GET /api/runs/{runId}/report 拿到 v5.2 格式 markdown

# 3. 三态对比报告
curl -X POST http://localhost:3000/api/ingest/perfetto-triad \
  -F "base=@sample_base_20260624_104944.zip" \
  -F "cur=@sample_cur_20260624_105041.zip" \
  -F "throttle=@sample_throttle_20260624_105539.zip"
# 期望: 返回 runId, 报告含三态对比缩进树 (与 v5.2 黄金样本对齐, 章节结构 100% 一致)
```

**M1 报告内容质量验收** (人工 diff v5.2 黄金样本):

| 检查项 | 期望 |
|---|---|
| 章节结构 (§-1/§0/§3-§7/§9 含子节) | 100% 对齐模板 |
| 三态数字 (Run/Sleep/Gfx.WaitForPresent/降频) | 误差 < 1% |
| ASCII 视觉化资产 (§4.4 状态条 + §4.5 因果链 + §6.2 缩进树) | 全员到位 |
| §0 结论形式 | 引用块 + 加粗 + 缩进树, 无对比表格 |
| 红线标签 🔴🟡🟢 | 从 aoe-watch-spec.yaml 自动加 |
| 降频判定 | likely 档完整 (含 thermal Δ°C) |

**M2 (前端可视化) 验收**:

1. 上传三份 ZIP → 后端 polling 进度 → 完成 render → 验证 ASCII 缩进树用 monospace 字体显示
2. 跨次对比表用 echarts / recharts 加柱状图

---

## §7 后续扩展(本交付包之外)

- Provider 端 §9.2 P0-1/P0-3/P0-4 (RHI 子函数下钻 / GC.Alloc 全树 / 每帧时序图) — 见 `docs/perfetto-engineering-roadmap-v5.2.md`
- frame_timeline data source 启用 — 需要重写 record_android_trace.py 调用方式
- 跨设备适配 (PAL-AL00 → 三星 Exynos / Pixel root) — 见 P4-1

---

## 附录 A: 交付 agent 启动 prompt 模板

> 你正在接手 perfetto v5.2 skill 接入 web 平台的开发任务。
>
> **必读文档**:
> 1. `K:\AI\PerfAnalysisTool_Codebuddy\docs\perfetto-skill-web-integration-spec.md` (本文档)
> 2. `K:\AI\PerfAnalysisTool_Codebuddy\.claude\skills\perfetto-trace-analysis\SKILL.md`
> 3. `K:\AI\PerfAnalysisTool_Codebuddy\.claude\skills\perfetto-trace-analysis\references\perfetto-report-template.md`
> 4. `K:\AI\PerfAnalysisTool_Codebuddy\docs\report\performance-report_perfetto_ULTIMATE_v5.2.md` (黄金样本)
>
> **任务**: 完成 Story 1 + Story 2 + Story 3 (M1 里程碑), 让 web 后端能产出 v5.2 格式报告。
>
> **必须遵守的约束**: 见 §5 (8 条 MUST NOT)。
>
> **验收**: 跑 §6 验收脚本通过, 章节结构与 v5.2 黄金样本 diff 一致 (100% 对齐), 三态数字误差 < 1%。
>
> **工时预估**: 18-25 小时, 拆 3 个 Story 分批交付。
>
> 开始前请先用 Glob/Grep 调研 web/server 现有目录结构, 不要凭空生成代码。
