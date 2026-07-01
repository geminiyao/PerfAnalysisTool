---
name: simpleperf-native-analysis
description: Simpleperf 单次 native 性能分析（描述性快照）—— so 分层负载 + 主线程 C# vs Lua 对比 + 中间件线程占机 CPU + Native 反向调用栈 + Top-N 热点。不做跨次 diff 判定，定位"CPU 花在哪"的功耗观感。
---

# Simpleperf 单次 Native 性能分析

## When to Use

- 用户给一份 `.data`（simpleperf 采样）+ `binary_cache`
- 想看"这一次跑下来 CPU 花在哪"——业务/引擎/中间件层占比、主线程 C# vs Lua 谁多
- 关键词：simpleperf, perf.data, native CPU 分析, so 占比, libil2cpp, libxlua

不要用于：
- 双版本对比（base vs cur）→ `simpleperf-diff-analysis`
- Unity 帧分析 → `unity-profiler-analysis`
- 调度/降频/off-CPU → `perfetto-trace-analysis`
- 三源融合 → `cross-source-analysis`

## 定位（重要，决定报告形态）

**这是"描述性报告"，不是"诊断性报告"**：
- ✅ 报告告诉你 CPU 花在哪（so/线程/函数级占比）
- ✅ 反向追溯 Top selfPct 函数的上游调用源
- ❌ 不做"性能好坏"判定（采样工具无基线，单次没判定力）
- ❌ 不给"哪些 marker 慢了"（那是 unity 干的事）

读者价值定位：
1. **趋势曲线落地页**：长期版本采集时，趋势图上某个版本 libxlua 占比飙升 → 点进单次报告看明细
2. **Cross-source 单次报告的下钻入口**：cross-source §6 引用本报告的 so 分层数据
3. **功耗审计**：哪条线程在烧 CPU（Wwise / RHI / Job Worker）

## Prerequisites

- simpleperf 自带工具链已配置（项目根目录 `simpleperf/` 下）
- binary_cache 路径有效（默认 `simpleperf/symbols/binary_cache`）

## Execution Flow

### Step 1: Provider — 出数据

```bash
python simpleperf/build_simpleperf_profile.py \
  --perf <perf.data> --out <out_dir> --binary-cache <bcache>
```

产出 `<out_dir>/`：
- `simpleperf-profile.json` — 全量
- `simpleperf-profile-summary.json` — AI 读这个（~30-50KB）

关键字段：
- `metrics[]` — `cpu.thread.<name>.pct` / `cpu.lib.<name>.pct` / `cpu.func.<name>.selfPct`
- `layerBreakdown` — `{ business, engine, runtime, noise }` 四层占比（数字百分比）
- `callTrees[]` — 关键线程的 native 调用树
- `anchors` — `Runtime::Invoke` / `__start_thread` 等锚点子树占比
- `symbolCheck` — 符号化质量自检（appSymbolizedPct / kernelPct / unknownPct / anchorsResolved）
- `threadCpuMs` — 各线程 CPU 时间累计

### Step 2: 读 summary（AI 主战场）

AI 读 `simpleperf-profile-summary.json` 写报告，**禁读全量 JSON**（10MB+）。

### Step 3: 分析口径（依据 [[methodology_gc_alloc_attribution]] / 项目知识包）

1. **so 分层负载**：从 `layerBreakdown` 直接读 business/engine/runtime/middleware/noise 占比
   - **business**：libil2cpp（C# 业务）+ libxlua（Lua VM）+ lib_burst_generated（ECS Burst）+ libAOENative/libTBUNative/libGameNative
   - **engine**：libunity / libGLESv2
   - **middleware**：libAk*（Wwise）/ libfmod / libwwise
   - **runtime**：libc / libm / libart / libdl / libstdc++
   - **noise**：kernel_kallsyms / atrace 埋点
2. **主线程 C# vs Lua 对比**：在 business 层下，libil2cpp 占比 vs libxlua 占比
3. **中间件线程占机 CPU**：从 `cpu.thread.*.pct` 找 NativeThread (Wwise) / Audio_Mixer / RHI 各自占比
4. **Native 反向调用栈**：选 Top selfPct 函数（如 `ieee754_powf` / `memcpy` / `XXH32`），从 callTrees 反向追溯祖先链
5. **Top-N 热点函数**：纯展示，按 selfPct 降序，前 10 条

### Step 4: 出报告 + 自检

中文 Markdown，**结论先行**。
文件名 `performance-report.md`（与其它单源 skill 一致）。

## Output Format

```markdown
# Simpleperf 单次 CPU 性能分析报告 · <设备 / 场景>

> 数据：perf.data, cpu-cycles:u, X 万样本, Y 秒
> 符号化：appSymbolizedPct=Z%, anchors A/4, status=PASS/WARN

## §0 一句话总览（描述性，不做判定）

主线程占机 CPU X%（Y），首位是 libil2cpp Z%（C# 业务），Wwise 线程独占 W%。
**注**：本报告不做"性能好坏"判定（单次无基线），如需判定回归请用 simpleperf-diff。

## §1 采集元信息 + 符号化质量

| 项 | 值 |
| 设备 / 进程 / 总样本 / 时长 |
| symbolCheck.status / appSymbolizedPct / anchors |
| layerBreakdown 总占比合计 |

## §2 So 分层负载分布

| 层 | 占比 | 头部 so |
| business | X% | libil2cpp 18.4%, libxlua 5.5% |
| engine   | Y% | libunity 31%, libGLESv2 10.2% |
| ... |

> **C# vs Lua 对比**：libil2cpp / libxlua = 比例 → C# 主导 / Lua 比重偏高

## §3 线程占机 CPU 分布

| 线程 | 占比 | 类别 |
| UnityMain | 41.8% | main |
| Thread-105 | 24.4% | RHI |
| NativeThread | 10.4% | Wwise (中间件) |
| ... |

> **功耗观感**：Wwise X% / Audio Y% → 如果偏高，可考虑战斗音效复杂度审视

## §4 主线程 native 调用树（深 ≤8 层）

```
└─ Runtime::Invoke (27.6%)
  └─ ExecutePlayerLoop (...)
    └─ BehaviourUpdate (...)
      └─ AOE::GameLauncher::Update (10.06%)
```

## §5 Top selfPct 热点函数 + 反向调用栈

每条 top 函数：
- 函数名 + selfPct
- 反向 caller 链（从根到自己）

如：
**ieee754_powf** (selfPct=2.68%) on Thread-105
└─ GfxDeviceWorker::RunCommand (24.4%)
  └─ ...

## §6 局限与可信度

- 单次无基线，相对趋势需配合 diff 报告
- 若 atrace 同时开着，noise 层 / vfprintf / sfvwrite 占比会偏高（观测者效应）
- kernel% 高 / unknown% 高 → 符号化不全，结论打折
```

## 一键命令

```bash
# CLI（统一入口）：
tsx web/server/scripts/analyze-single.ts \
  --mode single-source --source simpleperf \
  --input <perf.data> --binary-cache <dir>

# Web：上传单 perf.data 走 /runs/ingest/simpleperf 路径，自动调本 skill
```

## 自评门（可选）

```bash
node validate-simpleperf-single.js --report <md>
```

检查：
1. 章节覆盖：§0–§6 至少 6 章
2. 必引证据：含 `so 分层` + `business/engine` 关键词、`UnityMain` + 占比、`callTree` 缩进
3. 描述性而非诊断性：不应出现"严重回归 / P0 / 必须优化"这类判定（单次无基线）

## 与三个相关 skill 的关系

| Skill | 输入 | 输出 |
|------|------|------|
| simpleperf-native-analysis (本 skill) | 单 perf.data | 描述性单次快照 |
| simpleperf-diff-analysis | base + cur 两份 | 双版本 diff（hybrid v4）|
| unity-profiler-analysis | 单 .pdata | unity 单次诊断 |
| cross-source-analysis | 三源同次 | 提炼层综合报告（引用本 skill 的 so 分层数据）|
