# 新 Session 收尾指引：perfetto 单次 e2e

> 当前 session（fork 自 cfa148c0）codebuddy CLI 已卡死，单次 e2e 跑不通。
> 这份文档给新 session 用，按 3 步收尾。

## 背景

Sprint 1-7 已完成大半，但 perfetto **单次形态仅做了一半**：
- ✅ `scripts/render_perfetto_skeleton.py`（N=1 已支持）
- ✅ `.claude/skills/perfetto-trace-analysis/prompts/single-prompt.txt`
- ✅ `docs/report/performance-report_perfetto_SINGLE_GOLDEN_v1.md` 单次金标准
- ❌ `buildPerfettoSingleReport` service 没写
- ❌ `runSingleSourceSkillAnalysis(runId, 'perfetto')` 没改走骨架填空
- ❌ Web e2e 没跑

对比形态（N≥2）已基本贯通——`perfetto-diff-service.ts` 写好了，**新 session 照它写一份单次版**即可。

## 步骤 1：写 buildPerfettoSingleReport service（~20 分钟）

新建文件 `web/server/services/perfetto-single-service.ts`，**完全参考 `web/server/services/perfetto-diff-service.ts` 形态**，只改 N=1 部分：

### 关键差异点

| 维度 | diff-service（已有）| single-service（要写） |
|---|---|---|
| 入参 | `samples: PerfettoDiffSample[]`（≥ 2）| `sample: PerfettoSingleSample`（1 份）|
| 校验 | `if (samples.length < 2) throw` | （单份不需要校验）|
| 子目录 | `outputDir/<role>/` × N | `outputDir/single/`（直接放 outputDir 也行）|
| 渲染器调用 | `--sample base=... --sample cur=...`（N≥2 个）| `--sample single=...`（仅 1 个）|
| Prompt 模板 | `.claude/skills/perfetto-diff-analysis/prompts/diff-prompt.txt` | `.claude/skills/perfetto-trace-analysis/prompts/single-prompt.txt` |
| 金标准路径 | `docs/report/performance-report_perfetto_ULTIMATE_v5.3.md` | `docs/report/performance-report_perfetto_SINGLE_GOLDEN_v1.md` |
| stdin 注入 | 同（避开 .cmd 截断）| 同 |
| L1 兜底 | fail → cp skeleton.md | 同 |
| TS 质量门 | `validateDiffReport()` | 写 `validateSingleReport()` 一份对应版 |

### 接口签名建议

```ts
export interface PerfettoSingleSample {
  tracePath: string;
  sampleDir?: string;
  label?: string;
}

export interface PerfettoSingleOptions {
  meta?: IngestMeta;
  perfetto?: PerfettoIngestOptions;
  cliProvider?: CliProvider;
  onLog?: (line: string) => void;
}

export interface PerfettoSingleResult {
  runId: string;
  reportPath: string;
  outputDir: string;
  markdown: string;
  skeletonPath: string;
}

export async function buildPerfettoSingleReport(
  sample: PerfettoSingleSample,
  opts: PerfettoSingleOptions = {}
): Promise<PerfettoSingleResult>;
```

写完后跑 `cd web && npx tsc --noEmit -p server` 验证。

## 步骤 2：改 run-analysis-service.ts（~10 分钟）

`web/server/services/run-analysis-service.ts.runSingleSourceSkillAnalysis()` 在 `source === 'perfetto'` 时 **short-circuit 走骨架填空路径**，其它源（unity_profiler / simpleperf）保持现状。

### 修改思路

在函数顶部加 perfetto 分支：

```ts
async function runSingleSourceSkillAnalysis(runId, source, opts) {
  const run = getRun(runId);
  if (!run) throw new Error(`Run 不存在: ${runId}`);
  const inputPath = findRawPath(run, source);
  if (!inputPath) throw new Error(`Run 无 ${source} 原始文件路径`);

  // ★ perfetto 单次：走骨架填空（不走老 executeCli）
  if (source === 'perfetto') {
    const { buildPerfettoSingleReport } = await import('./perfetto-single-service.js');
    const config = getConfig();
    const outputDir = path.join(config.dataDir, 'results', runId);
    fs.mkdirSync(outputDir, { recursive: true });
    const result = await buildPerfettoSingleReport(
      { tracePath: inputPath, label: run.label },
      {
        meta: { runId, label: run.label, device: run.meta?.device, scene: run.meta?.scene },
        perfetto: opts.perfetto,
        cliProvider: opts.cliProvider,
        onLog: opts.onLog,
      }
    );
    return { markdownPath: result.reportPath, outputDir: result.outputDir };
  }

  // 其它源走老路径...
  const config = getConfig();
  // ...原有逻辑不动
}
```

注意 `buildPerfettoSingleReport` 内部应该自己调 `buildPerfettoProfile`（或复用 `runSourceProfileBuild`）做数据层，不要在外层再调一遍。

写完跑 `npx tsc --noEmit -p server`。

## 步骤 3：跑 e2e 验证（~10 分钟）

### 3.1 用现成 trace 跑 service 单元测试

```bash
cd /k/AI/PerfAnalysisTool_Codebuddy/web && \
node --import tsx -e "
import { buildPerfettoSingleReport } from './server/services/perfetto-single-service.js';
const result = await buildPerfettoSingleReport(
  {
    tracePath: 'G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_base_20260624_104944/2026-06-24_10-49-c1a652.pftrace',
    label: 'single_test'
  },
  { onLog: console.log }
);
console.log('OK', result.reportPath, result.markdown.length, 'chars');
"
```

或者用现有 summary（跳过数据层重跑）：

```bash
# 先模拟一个最小 run（只需要 inputPath 字段）
# 直接用 buildPerfettoSingleReport 不走 ingest 也行
```

### 3.2 跑 validate

```bash
cd /k/AI/PerfAnalysisTool_Codebuddy && \
PYTHONIOENCODING=utf-8 python scripts/validate_perfetto_report.py \
  --report <produced-report.md> \
  --skeleton <produced-skeleton.md> \
  --quality-out /tmp/quality.json
cat /tmp/quality.json
```

预期：`"ok": true` + `"tier": "L1"/"L2"/"L3"` + `"llmFillRemaining": 0`。

### 3.3 跑 web e2e（可选，更高保真度）

启动 web server，POST `/runs/ingest/perfetto/local` 上传 `.pftrace`，看：
1. Run 入库
2. 自动触发 `runPostIngestAnalysis` → 走 `runSingleSourceSkillAnalysis(runId, 'perfetto')` → 走 `buildPerfettoSingleReport`
3. 报告落到 `web/data/results/<runId>/performance-report.md`
4. 前端能查看

如果时间紧，3.3 可以跳过——只要 3.1 + 3.2 PASS 就证明 web 端整链路通了（因为 service.ts 是 web 路由的核心）。

## 验收标准

| 项 | PASS 条件 |
|---|---|
| typecheck | `npx tsc --noEmit -p server` 0 错 |
| service 单测 | 产出 `performance-report.md` ~600 行 / LLM_FILL 残留 0 |
| validate | `tier ∈ {L1, L2, L3}` |
| 报告内容 | §0 三大独立**观察**（不写"演化/对比/Δ"）/ §3 各线程单列形态判定 / §6.3 优化方向引用项目包知识 |

## 卡住时的兜底

如果新 session 也跑不通 codebuddy CLI（卡死、stdin 问题、Windows .cmd 截断），临时用骨架兜底验证：

```bash
# 跳过 LLM 直接拿骨架当报告
cp <skeleton.md> <performance-report.md>
python scripts/validate_perfetto_report.py ...
```

骨架本身已含全部数字 / 表格 / 调用树（只是没有 LLM 写的叙事），用户**永远拿得到产物**。这是 L1 兜底设计的初衷。

## 文件位置速查

- 已有的 diff-service（参考）：`web/server/services/perfetto-diff-service.ts`
- 已有的骨架渲染器：`scripts/render_perfetto_skeleton.py`
- 已有的项目包：`projects/aoeyz/`
- 已有的 single prompt：`.claude/skills/perfetto-trace-analysis/prompts/single-prompt.txt`
- 已有的 single 金标准：`docs/report/performance-report_perfetto_SINGLE_GOLDEN_v1.md`
- 老的 single skill：`.claude/skills/perfetto-trace-analysis/`（不动，保留）
- 待写的 single service：`web/server/services/perfetto-single-service.ts`
- 待改的 dispatcher：`web/server/services/run-analysis-service.ts.runSingleSourceSkillAnalysis()`

## 完成后更新文档

收尾后改 `docs/skills-overview.md`：
- 第 10 行 perfetto 那行：把"✅ 已有"改成"✅ Phase E v6 已完成（脚本 + Web e2e PASS）"
- 第 96-108 行 §2.2 perfetto-trace-analysis：在表格末尾加一行 "2026-XX-XX 改造：Web 端 runSingleSourceSkillAnalysis(perfetto) 改走 buildPerfettoSingleReport 骨架填空路径，Web e2e 验证 PASS L<X>"
