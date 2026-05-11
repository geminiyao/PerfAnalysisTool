# Perfetto Trace Analysis Skill

## 概述

分析 Android Unity 游戏的 Perfetto `.pftrace` 文件，产出系统级性能分析报告（中文 Markdown）。

主要诊断能力：
- CPU 调度问题（大小核分配、核迁移、唤醒延迟）
- 热降频检测（频率变化、throttle events）
- 线程协作问题（Main/Render 并行度、Job Worker 利用率）
- 系统级干扰（surfaceflinger/Binder/thermal 抢占）
- GPU 负载评估（频率/利用率/GPU-bound 判定）
- 性能趋势分析（热降频趋势/burst spike/warmup/持续慢帧）

---

## 分析维度总览

| 维度 | 核心问题 | 数据来源 |
|------|---------|---------|
| A. 帧率与帧稳定性 | 帧率是否达标、帧时序波动模式 | PlayerLoop slice duration |
| B. CPU 大小核调度 | 主/渲染线程是否在大核？频繁迁移？ | sched_slice + cpu_id |
| C. CPU 频率与降频 | 是否存在热降频/限频？哪个核在降？ | cpufreq counter |
| D. 线程调度效率 | Runnable 等待、唤醒延迟、被抢占次数 | thread_state / sched_waking |
| E. 多线程协作 | Main-Render 重叠、Job Worker 利用率 | 线程 slice 时序对比 |
| F. 系统干扰 | 被系统进程抢占情况 | 全系统 sched 数据 |
| G. GPU 负载（如有） | GPU 频率/利用率、GPU-bound 判定 | gpu_counter_track |
| H. 时间段分析 | 性能趋势（热降频/burst/warmup） | 帧数据分段聚合 |

---

## 各维度判定标准

### A. 帧率与帧稳定性

| 指标 | 正常 | 异常 |
|------|------|------|
| 实际 FPS vs 目标 FPS | actual ≥ target | actual < target |
| Jank | 当前帧 / 前3帧均值 < 2x | ≥ 2x (Jank) / ≥ 3x (BigJank) |
| 帧时分布 | Q3-Q1 < 5ms | IQR 大 → 帧时不稳定 |

### B. CPU 大小核调度

| 指标 | 正常 | 异常 |
|------|------|------|
| 大核占比 | > 80% | < 50% 调度不合理 |
| 核迁移频率 | < 5 次/秒 | > 20 次/秒频繁迁移 |
| 关键线程固定 | Main/Render 稳定在大核 | 频繁在大小核间切换 |

### C. CPU 频率与降频

**降频判定两级体系**:

| 级别 | 证据来源 | 判定方式 | 可信度 |
|------|---------|---------|:------:|
| **确认** | sysfs (采集脚本) | `scaling_max_freq < cpuinfo_max_freq` | ⭐⭐⭐ |
| **确认** | sysfs (采集脚本) | `cooling_device state > 0` | ⭐⭐⭐ |
| **推测** | Perfetto cpufreq | 频率可达性/负载背离/全核同步/持续低频 | ⭐~⭐⭐ |

**规则**: 没有 sysfs 数据只给推测结论，标注 [推测]。有 sysfs 以硬件为准。

**推测级方法简述**（无 sysfs 时使用，详见 [thermal-throttling-reference.md](references/thermal-throttling-reference.md)）:

| 方法 | 原理 | 权重 |
|------|------|:----:|
| 负载-频率背离 | CPU 忙碌（>70%）但频率反降 → 被外力限制 | +3 |
| 频率可达性 | trace 期间频率从未达到理论 max 的 95% → 被限制 | +3 |
| 全核同步降频 | 同 cluster 所有大核降到同一低频 → cluster-level thermal cap | +2 |
| 频率上限锁定 | 各时间窗口 max 频率递减 → 天花板被压低 | +2 |
| 持续低频占比 | >30% 时间运行在 <80% max → 长时间被压频 | +2 |
| Thermal Zone | 温度 > 42°C → 设备过热 | +3 |

综合评分 `thermalScore`: 0-2 正常 DVFS / 3-4 中等热影响 / ≥5 确认热降频

**输出数据结构**:
```json
{
  "throttleVerdict": {
    "level": "confirmed | suspected | none",
    "source": "sysfs | perfetto_inference",
    "confidence": "high | medium | low"
  },
  "cpuFrequency": {
    "throttleClassification": {
      "thermalScore": 5,
      "evidence": ["负载-频率背离: 20次高负载时降频", "全核同步降频: 12次"],
      "freqReachability": {"reachable": true, "observedMaxMhz": 2035, "theoreticalMaxMhz": 2035},
      "sustainedLow": {"detected": false, "lowFreqPercent": 0.7}
    }
  },
  "thermalSysfs": {
    "available": true,
    "verdict": "confirmed",
    "limitedCpus": [{"cpu": "cpu6", "scaling_max": 1536000, "cpuinfo_max": 2035000}],
    "maxTempC": 45.3
  }
}
```

降频采集工具: [降频观测指南](降频观测指南.md)

### D. 线程调度效率

| 指标 | 正常 | 中等 | 严重 |
|------|------|------|------|
| Runnable 等待 (avg) | < 1ms | 1-3ms | > 3ms |
| 唤醒延迟 (avg) | < 0.5ms | 0.5-2ms | > 2ms |
| 被抢占次数 | 少量 | — | 频繁（结合F分析） |

### E. 多线程协作

| 指标 | 理想 | 异常 |
|------|------|------|
| Main-Render 重叠率 | > 50% | < 20% 基本串行 |
| Render 空闲率 | < 30% | > 60% 严重等待 |
| Job Worker 利用率 | 10-60% | < 10% 未充分使用 / > 60% 可能饱和 |
| Worker 大核占比 | < 30%（不抢占关键线程） | > 60% 竞争大核资源 |

### F. 系统干扰

| 级别 | 条件 | 影响 |
|------|------|------|
| 正常 | 系统进程占帧预算 < 5% | 不影响帧率 |
| 轻微 | 系统进程抢占 1-3ms | 可能导致偶发 Jank |
| 严重 | 系统进程抢占 > 5ms | 明确导致掉帧 |

### G. GPU 负载

| 判定 | 条件 | 置信度 |
|------|------|--------|
| GPU-bound | GPU utilization > 80% + Gfx.WaitForPresent 显著 | 高 |
| GPU-bound | GPU 频率持续 ≥ 95% max + Render 无等待 | 中 |
| 可能 GPU-bound | 无 GPU 数据但 CPU/调度无问题 + WaitForPresent 高 | 低 [推断] |
| 非 GPU-bound | GPU utilization < 50% 或无 WaitForPresent | — |

**注意**: GPU 数据不一定存在于每个 trace 中。无数据时标注"未采集"，不可凭空分析。

### H. 时间段分析

| 模式 | 检测条件 | 建议 |
|------|---------|------|
| 热降频 | 后段 FPS < 前段 × 0.85 + 频率/throttle 恶化 | 降负载/散热/GameMode |
| Burst Spike | 某段 Jank > 其余段之和 × 60% | 分帧/异步/预加载 |
| 预热模式 | 前段帧耗时 > 中后段 × 1.15 | AOT/Shader warmup |
| 持续慢帧 | 连续 ≥ 5 帧 > 帧预算 × 1.5 | 美术降级/逻辑优化 |

---

## 文件结构

```
perfetto-trace-analysis/
├── README.md                      ← 本文件
├── config.json                    ← 配置（进程名、线程名、阈值）
├── skill.md                       ← Claude 执行指令 + 报告模板
├── requirements.txt               ← Python 依赖（perfetto>=47.0）
├── scripts/
│   └── preprocess.py              ← 数据预处理脚本（Python）
└── references/
    ├── perfetto-knowledge.md      ← 分析知识库（ARM/调度/GPU/趋势）
    └── thermal-throttling-reference.md  ← 降频科学参考资料
```

---

## 前置依赖

```bash
# Python 3.10+
pip install -r .claude/skills/perfetto-trace-analysis/requirements.txt
```

唯一依赖: `perfetto` Python 包（会自动下载 trace_processor 引擎，约 30MB）。

验证安装:
```bash
python -c "from perfetto.trace_processor import TraceProcessor; print('OK')"
```

---

## 数据管线

```
.pftrace 文件
    │
    ▼
preprocess.py (TraceProcessor SQL 查询)
    │
    ▼
preprocess-result.json (结构化数据)
    │
    ▼
Claude (skill.md + knowledge.md 指导分析)
    │
    ▼
perfetto-report_YYYYMMDDHHmmss.md (最终报告)
```

---

## 使用方式

```bash
# 用户提供 .pftrace 文件后，skill 自动执行：
python .claude/skills/perfetto-trace-analysis/scripts/preprocess.py \
  --input <file.pftrace> \
  --target-fps 30 \
  --output-dir ./output/perfetto
```

报告产出路径: `./output/perfetto/perfetto-report_YYYYMMDDHHmmss.md`

---

## 输出报告结构

| 章节 | 内容 |
|------|------|
| 一、概览 | 基础指标（时长/帧数/FPS/Jank/设备） |
| 二、核心结论 | 2-3 句话总结瓶颈 |
| **三、帧耗时归因** | **PlayerLoop 6 阶段分层 + TOP 函数** |
| 四、CPU 调度分析 | 大小核/Runnable/唤醒延迟/抢占 |
| **五、CPU 频率与降频** | **确认级/推测级两级判定** |
| 六、多线程协作 | Main-Render 并行/瓶颈判定/Job Worker |
| 七、系统干扰 | TOP5 干扰进程/严重度 |
| 八、GPU 负载 | 频率/利用率/GPU-bound 判定 |
| 九、时间段分析 | 前中后段对比/趋势模式 |
| 十、优化建议 | P0/P1/P2 分级 |
| 十一、补充说明 | 数据局限/下一步 |

### 帧耗时归因示例

```
Rendering CPU    12.36ms  30.1%  ████████████
  └─ URP.Render                         923ms
Lua Logic        10.21ms  24.8%  █████████
  └─ CS:AOE.LuaMgr                      369ms
ECS/Job           4.69ms  11.4%  ████
UGUI              3.96ms   9.6%  ███
C# Logic          2.55ms   6.2%  ██
Wait/Sync         1.43ms   3.5%  █
```

### 降频判定

```
confirmed → "确认降频"（有 sysfs 硬件证据）
suspected → "疑似降频 [推测]"（仅 Perfetto 推断）
none      → "未检测到降频"
```

搭配 `record_tmaoe_thermal.bat` 采集可获得确认级判定。

---

## 配置说明 (config.json)

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `targetFps` | 目标帧率 | 30 |
| `gameProcess` | 游戏进程名 | "com.tencent.aoeyz" |
| `jank.jankMultiplier` | Jank 倍数阈值 | 2 |
| `jank.bigJankMultiplier` | BigJank 倍数阈值 | 3 |
| `mainThread.name` | 主线程名 | "UnityMain" |
| `renderThread.name` | 渲染线程名 | "UnityGfxRenderS" |
| `jobWorker.namePatterns` | Worker 线程名匹配模式 | ["Worker Thread", "Job.Worker"] |
| `gpu.utilizationHighThreshold` | GPU-bound 利用率阈值 | 80 |
| `timeSegment.segmentCount` | 时间分段数 | 3 |
| `timeSegment.thermalDegradationThreshold` | 热降频判定阈值(FPS比) | 0.85 |
| `timeSegment.sustainedSlowFrames` | 持续慢帧最少连续帧数 | 5 |
