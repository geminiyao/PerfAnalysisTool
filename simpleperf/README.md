# Android Native Performance Analysis Toolkit

这是一个**通用**的 Android 游戏 native C++ 性能采集与对比工具，适用于所有需要分析
`libil2cpp.so`、`libunity.so`、`libxlua.so`、`lib_burst_generated.so` 等原生库 CPU
消耗的场景，例如：

- 对比两个编译方案（不同编译器优化、不同 flag、MapleCC/MapleILOpt 等）
- 定位某次发版引入的性能劣化
- 分析任意 Android 游戏 native 热点
- 跟踪多个版本的性能趋势

它提供可导入的 Python 模块（`simpleperf_analyzer`）、CLI 脚本和 Cursor AI Skill，是本
仓库 Unity Profiler `.pdata` 引擎在 native 层的配套工具。

```
simpleperf/
├── README.md                 # 本文件
├── requirements.txt          # 无第三方依赖，只依赖 NDK 自带 simpleperf
├── simpleperf_analyzer/      # 可导入模块
│   ├── config.py             # NDK 路径、anchor 函数、lib token、阈值（唯一需配置的文件）
│   ├── loader.py             # 包装 NDK report_html.RecordData，提供干净的加载 API
│   ├── so_compare.py         # Level 1：按线程统计各 .so CPU 占比并对比
│   ├── anchor_compare.py     # Level 2：anchor 函数子树耗时对比
│   ├── func_compare.py       # Level 3：函数级 A/M/D diff
│   ├── single_profile.py     # 单次分析：热点 / 线程 / so 分解 + folded stack
│   ├── regression.py         # 多版本趋势分析
│   └── reporter.py           # JSON / 文本 / CSV 输出
├── scripts/
│   ├── collect_perf.py       # 采集封装（需真机 + adb）
│   ├── compare.py            # A/B 对比 CLI
│   ├── analyze.py            # 单次分析 CLI
│   └── batch_compare.py      # 多版本回归 CLI
├── legacy/
│   └── aoe_report_diff.py    # 历史脚本归档（见第 10 节）
├── data/                     # 约定：perf.data 放这里
└── result/                   # 约定：分析结果输出到这里
```

---

## 1. 背景与目标

Unity 游戏的热点代码以 native 库形式运行：`libil2cpp.so`（C# 编译产物）、
`libunity.so`（引擎）、`libxlua.so`（Lua VM）、`lib_burst_generated.so`（Burst）。
Unity Profiler `.pdata` 引擎能看到 Marker 耗时，但对这些 .so 内部的 CPU 分布是盲区，
无法验证 native 工具链改动的效果。`simpleperf` 以 PMU 硬件采样原生调用栈，正好填补这个盲区。

工具回答三类问题：

1. 某次采集，CPU 到底花在哪里了？（单次分析）
2. 方案 B 相比方案 A 有没有改善，哪里变好了？（A/B 对比）
3. 某项指标是否在多个版本间持续向好？（回归趋势）

---

## 2. 三层分析策略与 inline 问题

### 为什么不能直接做函数级对比

编译器优化（尤其是内联 inline）会将被调用函数的机器码嵌入调用者，导致被内联的函数在
采样数据中"消失"。若直接做函数名匹配对比，会看到大量"函数被删除"的假信号，噪音极大。

### 三层策略（按可靠性递减排列）

| 层级 | 名称 | 数据来源 | 说明 | 受 inline 影响 |
|------|------|----------|------|----------------|
| **Level 1** | **So 级 CPU 占比** | `threadInfo.libs[].eventCount` | 统计每个线程中各 .so 的采样占比，inline 只在 .so 内部移动时间，不跨库 | 不受影响 |
| **Level 2** | **Anchor 函数子树耗时** | callGraph 中锚点节点的 `subtreeEventCount` | 选取稳定存在的"锚点函数"（如 `ExecutePlayerLoop` 包含主线程整帧逻辑），对比其子树总耗时。无论内部如何 inline，子树总量不变 | 不受影响 |
| **Level 3** | **函数级 A/M/D diff** | callGraph 展开后的函数字典 | 逐函数对比，标记新增(A)/变化(M)/消失(D)。可用于 Level 1/2 定位到问题后的下钻，但不宜作为主要结论依据。疑似被 inline 的函数会标注 `maybe_inlined` | **受影响** |

**默认 anchor 函数**（在 `config.py` 中可修改）：

| Anchor 函数名 | 代表的范围 |
|---------------|-----------|
| `ExecutePlayerLoop` | Unity 主线程完整帧逻辑（最重要的锚点） |
| `ScriptRunBehaviourUpdate` | C# MonoBehaviour.Update() 阶段 |
| `GfxDeviceWorker::RunCommand` | 渲染线程 GPU 提交阶段 |
| `TranscriptScriptableRenderContext::ExecuteScriptableRenderLoop` | SRP 渲染循环 |

**结论依据优先级：Level 1 ≥ Level 2 >> Level 3**

---

## 3. 首次配置

所有脚本均从 `simpleperf/` 目录运行。仅需确认一处配置：

打开 `simpleperf_analyzer/config.py`，确认 NDK 路径：

```python
NDK_SIMPLEPERF_DIR = r"D:/Android/android-ndk-r21e-windows-x86_64/simpleperf"
```

如果路径不同，直接修改该值，或在运行前设置环境变量：

```powershell
$env:NDK_SIMPLEPERF_DIR = "D:\你的NDK路径\simpleperf"
```

其余可配置项见第 8 节。

---

## 4. 数据采集

### 输入前提

- 一台通过 USB 连接的 Android 设备（rooted 或 debuggable 的 app）
- adb 在 PATH 中
- 两个构建产物（A 包 = 基线，B 包 = 待验证方案）
- 两个包对应的**未 strip 的 .so**（用于符号解析；strip 版本只能看到地址偏移，看不到函数名）

```powershell
# Step 1: 安装 A 包，启动游戏，进入目标场景（建议固定回放路径）后执行：
python scripts/collect_perf.py `
  --package com.your.game `
  --label baseline `
  --runs 3 `
  --duration 30 `
  --event cpu-cycles:u `
  --freq 1000 `
  --lib D:\path\to\A包的未strip_so目录 `
  --lock-freq

# Step 2: 卸载 A 包，安装 B 包，同样场景下执行：
python scripts/collect_perf.py `
  --package com.your.game `
  --label current `
  --runs 3 `
  --duration 30 `
  --event cpu-cycles:u `
  --freq 1000 `
  --lib D:\path\to\B包的未strip_so目录 `
  --lock-freq
```

**输出**：
- `data/baseline/perf_1.data` … `perf_3.data`（A 包采集文件）
- `data/baseline/binary_cache/`（A 包的 .so 符号缓存）
- `data/current/perf_1.data` … `perf_3.data`（B 包采集文件）
- `data/current/binary_cache/`（B 包的 .so 符号缓存）

**参数说明**：

| 参数 | 说明 |
|------|------|
| `--event cpu-cycles:u` | 采集用户态 CPU cycles，反映真实指令执行量 |
| `--event task-clock:u` | 采集挂钟时间（ms），更直观但受调度影响 |
| `--lock-freq` | 锁定 CPU 频率为 performance 模式，消除 DVFS 干扰（需 root，运行结束后自动恢复） |
| `--runs 3` | 重复采集 3 次，后续可取均值，降低偶发误差 |
| `--duration 30` | 每次采集 30 秒 |
| `--freq 1000` | 采样频率 1000 Hz（每秒 1000 次采样） |
| `--lib` | 未 strip 的 .so 目录，**A/B 包必须分别指向各自的 .so** |

> **A/B 对比控制变量原则**：除了对比的那一个变化（如编译器选项），两次采集使用相同设备、
> 相同场景、相同时长、相同 event 类型，结果才可比。

---

## 5. 使用场景与操作步骤

### 场景一：单次热点分析

**目标**：找出某个构建的 native 性能热点，生成火焰图。

**输入**：
- 一个 `perf.data` 文件（如 `data/baseline/perf_1.data`）
- 对应的 `binary_cache/` 目录（用于符号解析）

```powershell
python scripts/analyze.py data/baseline/perf_1.data `
  --binary-cache data/baseline/binary_cache `
  --out result/analyze_baseline `
  --top 30 `
  --flamegraph UnityMain
```

**输出**：
- `result/analyze_baseline.json` — 机器可读，包含 `hotspots[]`、`threads[]`、`libs[]`
- `result/analyze_baseline.txt` — 人类可读文本摘要
- `result/analyze_baseline.folded` — folded stack 格式，可生成 SVG 火焰图

生成火焰图 SVG（需 Perl 环境）：

```powershell
perl D:\Android\android-ndk-r21e-windows-x86_64\simpleperf\FlameGraph\flamegraph.pl `
  result/analyze_baseline.folded > result/flamegraph.svg
```

---

### 场景二：A/B 对比（验证某项优化是否有收益）

**目标**：精确对比两个构建在 native 层的 CPU 消耗差异，归因到 .so 级别和函数调用链。
典型用途：验证 MapleCC/MapleILOpt、编译器 flag 调整、引擎升级等。

**输入**：
- A 包采集文件（基线）：`data/baseline/perf_1.data`
- B 包采集文件（待验证）：`data/current/perf_1.data`
- B 包的 `binary_cache/`（符号解析；两包共用 B 包的 binary_cache 即可，因函数地址以 B 包为准）

```powershell
# 完整三层分析（Level 1 + Level 2 + Level 3）
python scripts/compare.py `
  data/baseline/perf_1.data `
  data/current/perf_1.data `
  --binary-cache data/current/binary_cache `
  --out result/compare

# 只跑 Level 1（so 占比）和 Level 2（anchor 子树）——更快、inline 完全无干扰
python scripts/compare.py `
  data/baseline/perf_1.data `
  data/current/perf_1.data `
  --binary-cache data/current/binary_cache `
  --out result/compare_l12 --levels 12

# 自定义 anchor 函数（非 Unity 游戏或自定义引擎时使用）
python scripts/compare.py `
  data/baseline/perf_1.data `
  data/current/perf_1.data `
  --binary-cache data/current/binary_cache `
  --out result/compare `
  --anchors MyGameLoop RenderThread::Execute

# 多次采集后合并对比（同一包多 run 取平均）
python scripts/compare.py `
  data/baseline/perf_1.data `
  data/current/perf_1.data `
  --binary-cache data/current/binary_cache `
  --out result/compare `
  --aggregate-by-thread-name
```

**输出**：
- `result/compare.json` — 完整 JSON（见第 7 节格式说明）
- `result/compare.txt` — 人类可读摘要，直接看这个确认结论

**如何读结论**：找 `summary` 字段：

```json
"summary": {
  "il2cpp_delta_pct_unitymain": -4.2,   // libil2cpp.so 在 UnityMain 线程的占比下降 4.2%（绝对值）
  "main_thread_delta_pct": -5.38        // ExecutePlayerLoop 子树耗时下降 5.38%
}
```

- 两个数都是负数 → B 包 native 性能有明确收益
- 仅 `il2cpp_delta_pct` 为负 → il2cpp 优化有效，但主线程其他部分可能有轻微劣化，需看 Level 1 全表
- `maybe_inlined: true` 的函数 → 其 delta 可能是编译器 inline 导致，不宜单独解读

---

### 场景三：多版本回归趋势

**目标**：跟踪某项指标（如 `libil2cpp.so` 占比、`ExecutePlayerLoop` 耗时）在多个版本间的变化趋势，发现性能劣化或确认持续改善。

**输入**：
- 每个版本的若干 `perf.data` 文件（同一版本多次采集用于均值统计）
- 最新版本的 `binary_cache/`（或各版本分别提供）

```powershell
python scripts/batch_compare.py `
  --version v1.0 data/v1.0/perf_1.data data/v1.0/perf_2.data `
  --version v1.1 data/v1.1/perf_1.data data/v1.1/perf_2.data `
  --version v1.2 data/v1.2/perf_1.data `
  --binary-cache data/v1.2/binary_cache `
  --out result/regression
```

**输出**：
- `result/regression.json` — 含每个版本、每项指标的均值 ± 标准差
- `result/regression.txt` — 文本摘要
- `result/regression.csv` — 可直接导入 Excel/Sheets 作图

---

## 6. 输出 JSON 格式（与 Web/Electron 集成契约）

### `compare.py` 输出

```json
{
  "meta": {
    "baseline": "data/baseline/perf_1.data",
    "current": "data/current/perf_1.data",
    "event": "cpu-cycles:u"
  },
  "level1_so_compare": {
    "threads": [
      {
        "name": "UnityMain",
        "baseline_total_event": 5800000,
        "current_total_event": 5400000,
        "libs": [
          {
            "name": "libil2cpp.so",
            "full_path": "/data/app/com.your.game/lib/arm64/libil2cpp.so",
            "baseline_pct": 24.7,
            "current_pct": 9.1,
            "delta_pct": -15.6
          }
        ]
      }
    ]
  },
  "level2_anchor_compare": {
    "anchors": [
      {
        "name": "ExecutePlayerLoop",
        "baseline_ms": 53640.7,
        "current_ms": 52349.1,
        "delta_ms": -1291.6,
        "delta_pct": -2.41
      }
    ]
  },
  "level3_func_diff": {
    "items": [
      {
        "thread_anchor": "UnityMain",
        "delta_ms": -78.1,
        "abs_ms": 52349.1,
        "mask": "M",
        "functions": [
          {
            "func": "lua_pcallk",
            "lib": "libxlua.so",
            "delta_ms": -2136.2,
            "delta_pct": -3.12,
            "mask": "M",
            "maybe_inlined": false
          }
        ]
      }
    ],
    "text": "..."
  },
  "summary": {
    "il2cpp_delta_pct_unitymain": -15.6,
    "main_thread_delta_pct": -2.41
  }
}
```

### `analyze.py` 输出

```json
{ "meta": {...}, "hotspots": [...], "threads": [...], "libs": [...] }
```

### `batch_compare.py` 输出

```json
{ "versions": [...], "lib_keys": [...], "anchor_keys": [...], "trends": [...] }
```

---

## 7. Python 模块直接调用（供 Web 后端集成）

```python
import sys
sys.path.insert(0, r"K:\AI\PerfAnalysisTool_Codebuddy\simpleperf")

from simpleperf_analyzer import load_profile, so_compare, anchor_compare, reporter

a = load_profile("data/baseline/perf_1.data", binary_cache="data/baseline/binary_cache")
b = load_profile("data/current/perf_1.data",  binary_cache="data/current/binary_cache")

l1 = so_compare.compare(a, b, min_pct=1.0)
l2 = anchor_compare.compare(a, b)

result = {"level1_so_compare": l1, "level2_anchor_compare": l2}
print(reporter.format_compare_text(result))
```

---

## 8. 配置项说明（`simpleperf_analyzer/config.py`）

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `NDK_SIMPLEPERF_DIR` | `D:/Android/android-ndk-r21e-windows-x86_64/simpleperf` | NDK simpleperf 目录，必须含 `report_html.py` |
| `DEFAULT_ANCHOR_FUNCS` | 见第 2 节表格 | Level 2 锚点函数列表，子串匹配 |
| `DEFAULT_LIB_TOKENS` | `libil2cpp.so` 等 | 用于从 perf.data 的 libList 自动识别感兴趣的库 |
| `CPU_EVENT_NAMES` | `cpu-clock`, `cpu-cycles:u` 等 | 被视为 CPU 时间的 event 名称集合 |
| `TIME_THRESHOLD_MS` | `5.0` | Level 3 中 \|delta\| 低于此值的函数不输出（ms） |
| `MIN_FUNC_PERCENT` | `0.01` | 传给 RecordData.limit_percents 的函数最小占比 |
| `DEFAULT_TOP_N` | `30` | 单次分析默认输出 top-N 热点数 |

所有配置项也可通过同名环境变量覆盖（如 `$env:NDK_SIMPLEPERF_DIR=...`）。

---

## 9. 集成路径（未来规划）

两个客户端都消费同一份 JSON 契约：

- **Web Dashboard（`web/`）** — 新增 `web/server/routes/simpleperf.ts`，
  路由 `/api/simpleperf/upload|compare|history|trends`，复用已有的
  `cli-executor.ts` 通过 subprocess 调用 Python 脚本，SSE 流式推送进度；
  新增页面 `web/src/pages/SimpleperfCompare.tsx` / `SimpleperfReport.tsx`。
- **Electron App（`src/`）** — `src/main/simpleperf/` TypeScript 封装层通过
  `child_process.execFile` 调用脚本，新增 IPC handler
  `simpleperf:compare|analyze|regression`，渲染层新增
  `src/renderer/modules/simpleperf/` 模块提供 ECharts 对比图表。

---

## 10. `legacy/aoe_report_diff.py` 说明

`legacy/aoe_report_diff.py` 是本工具包 Level 3 逻辑的演进起点，归档于此供参考。

**为什么放 legacy 而不是直接使用？**

因为它已有完整的平替实现，且存在若干阻塞性问题，这些问题在新工具中均已修复：

| 问题 | 位置 | 状态 |
|------|------|------|
| `__main__` 块无条件调用 `debugpy.wait_for_client()`，无调试器时脚本永久阻塞 | 第 503 行 | 已在新工具中移除 |
| "Deleted" 检测循环用 `cur_func_name`（上轮遗留变量）代替 `prev_func_name` 作为查找 key，导致 D 条目实际上永不触发 | 第 224 行 | 已在 `func_compare.py` 中修复 |
| lib 白名单硬编码了 `com.tencent.tmaoe-X3WjWodWzsg71IGeo9qnRw==` 路径，换包即失效 | 第 13-44 行 | 已改为自动从 perf.data 的 libList 识别 |
| 仅输出文本，无百分比，无结构化数据 | 全局 | 已改为 JSON + 百分比输出 |
| 只有函数级 diff（Level 3），无 so 级占比（Level 1）和 anchor 子树（Level 2）分析 | 整体设计 | 新工具三层全覆盖 |

legacy 文件的文件头保留了上述每处 bug 的行号标注，可作为对照演进历史。

---

## 11. 验证状态

以下模块已使用 NDK 自带的真实采集样本（`perf_empty_before.data` vs
`perf_battle_after.data`）端到端验证，输出结果合理：
- `loader.py`、`so_compare.py`、`anchor_compare.py`、`func_compare.py`、
  `single_profile.py`、`regression.py`
- `scripts/compare.py`、`scripts/analyze.py`

`collect_perf.py` 需连接真机，无法在主机验证，已在代码注释中标注。
