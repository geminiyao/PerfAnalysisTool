# 采集脚本配置决策(record_aoeyz.bat v2)

> 本文档记录 record_aoeyz.bat v2 的设计决策, 给后续维护者解释"为什么这么写"。
> 配套:[采集脚本本体](../../../../G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/record_aoeyz.bat) · [perfetto skill SKILL.md](../SKILL.md) · [本设备数据采集矩阵](#数据采集矩阵-pal-al00--骁龙-888--华为非-root-实测)

---

## 关键决策汇总

| 决策项 | 选择 | 理由 |
|---|---|---|
| ring buffer 大小 | **256MB** | 见 §1 ring 容量决策 |
| 采集时长 | **20s 默认, 参数可调** | 见 §2 采集时长决策 |
| atrace 类别 | **10 项精简** (sched freq idle am wm gfx view binder_driver dalvik memory) | 见 §3 类别精简决策 |
| 不加 sched_blocked_reason | **永久排除** (华为非 root 静默丢弃) | 见 §4 |
| 加温度旁路 (thermal_zone) | **采前/采后各一次** | 见 §5 |
| 加 cpuinfo_max_freq 旁路 | 一次性 | 见 §5 |
| 不加 sysfs scaling_max_freq 旁路 | 永久排除 (华为锁了) | 见 §6 |
| 加 collection-manifest.json | 落 root 状态 + 各旁路项可读性 | 见 §7 |
| 时戳目录 sample_<stamp>/ | 每次采集独立目录 | 见 §8 |
| 编码 chcp 65001 + 全英文 | 避免华为/中文 Windows GBK 解析乱码 | 见 §9 |
| 时戳取法用 PowerShell | 替代 wmic (Win11 24H2+ 已移除) | 见 §9 |

---

## §1 ring buffer 容量决策:256MB

事件密度实测约 **17-23 MB/s**(含 sched / atrace / freq), 不同负载略不同。

| 配置 | 实测落盘窗口 | 注意 |
|---|---|---|
| -b 32mb (旧版) | 仅 ~1.3-3.9 秒 | **不可用**, ring 在采集前期就被覆盖 |
| **-b 256mb (v2)** | 11-20 秒 | ✅ 当前选择 |
| -b 512mb | 20-30 秒 | 可选, 文件 500MB+ 解析慢 |
| -b 1gb | 40s+ | 仅"长持续观察"场景 |

**256MB 的折中**:
- 20s 配置下能完整落 13-20 秒(取决于场景帧率)
- 文件大小 230-280MB, perfetto trace_processor 解析约 1-2 分钟
- ✅ 一份正常采样不会被 ring 覆盖到丢头

**重要观察**:同样 -b 256mb -t 20s 在不同负载下实际落盘的物理时间不一致(base 60fps 11s / cur 33fps 14s / throttle 21fps 20s 都在 256MB 上限附近), 这是预期行为, 不是 bug。报告侧用 ms/帧 + totalPct 归一化, 不强求三份物理时间齐。

---

## §2 采集时长决策:20s 默认

知识库观察:

| 时长 | 适用场景 | 不适用场景 |
|---|---|---|
| 5-10s | 复现某个明确卡顿(触发瞬间停) | 跨次稳定性对比, 帧数太少分位数不稳 |
| **20s** | base/cur/throttle 三态对比 (v5.2 默认), 帧数 336+ 稳定 | — |
| 30s+ | 长持续观察, 或 thermal 漫长升温过程 | 需 ring 拉到 512MB 以上 |

20s 的统计稳定性已经足够:

- base 60fps × 20s = 1200 帧 → p50/p95/p99 极稳
- thermal 21fps × 20s = 428 帧 → 仍足够给可信分位数

时长越长不等于结论越准 — 关键看帧数, 20s 最少能保 400+ 帧。

---

## §3 atrace 类别精简决策

**选择的 10 项**(每项必须有具体分析价值, 否则不开):

| 类别 | 用途 | 不开会丢什么 |
|---|---|---|
| `sched` | 线程上下 CPU、Running/Runnable/Sleeping 时间 | 整个 off-CPU 归因没了 |
| `freq` | CPU 频率档位 (per-CPU) | 看不出降频 / thermal throttling |
| `idle` | CPU idle 状态 | 频率/idle 互补判断 |
| `am` | ActivityManager 事件 | 启动 / 切前后台时序 |
| `wm` | WindowManager 事件 | 窗口切换、Surface 创建 |
| `gfx` | SurfaceFlinger / VSync / Choreographer | 帧时间线 |
| `view` | View 渲染 (measure/layout/draw) | UI 卡顿来源 (UGUI 间接) |
| `binder_driver` | Binder 内核事件 | binder peer 分析 (provider 端 INCLUDE PERFETTO MODULE android.binder 拿 server 进程) |
| `dalvik` | GC、JIT、ClassLoad | GC.Alloc / GC.Collect 这条命脉 |
| `memory` | PSS / RSS counter | 内存涨幅与卡顿关联 |

**永久移除的类别**(对 Unity 游戏分析无用, 但事件量大):

- ~~`camera`~~ — Unity 一般不开摄像头
- ~~`input`~~ — 触摸事件已经在 view/gfx 里能间接看到
- ~~`hal`~~ — 硬件抽象层, 与游戏性能无关
- ~~`res`~~ — Android 资源加载, 与 Unity 资源系统无关
- ~~`sched_blocked_reason`~~ — 华为非 root 实测拿不到, 加了浪费 ring buffer (见 §4)

精简后单位时间事件密度降低 ~20-30%, ring buffer 的物理时间利用率相应提升。

---

## §4 不加 sched_blocked_reason 决策

**实测华为非 root 上加了等于没加**:

```
配置:  perfetto -t 3s ... sched/sched_blocked_reason ...
结果:  perfetto cmd 接受配置不报错
       → 但 trace_processor 查询 raw 表 "%blocked_reason%" → 0 行
       → thread_state.blocked_function 列也全是 null
```

根因:华为 EMUI 的 SELinux 策略默认禁止 user shell 写入 `/sys/kernel/tracing/events/sched/sched_blocked_reason/enable`, 但**不会报错, 静默丢弃事件**。

**永久排除**:bat 脚本的类别列表里**永远不要**加 `sched_blocked_reason`, 加了浪费 ring 容量。off-CPU byReason 细分用 atrace wait slice 重叠法替代(SKILL.md M1)。

如果未来在能 root 的设备上采, 可以考虑加。

---

## §5 温度旁路 + cpuinfo_max_freq 旁路决策

**采前 + 采后各一次温度旁路**:

```bash
# thermal_zone 16 个区都试 (不存在的会跳过)
adb shell "for i in 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  t=/sys/class/thermal/thermal_zone$i/type;
  v=/sys/class/thermal/thermal_zone$i/temp;
  if [ -f $t ]; then echo zone$i=$(cat $t):$(cat $v 2>/dev/null); fi;
done" > thermal_before.txt 2>nul
```

PAL-AL00 实测可读的 zone(其他设备会不同):

| zone | type | 用途 |
|---|---|---|
| zone0 | soc_thermal | **SoC 主温度, 降频判定主依据** |
| zone1 | board_thermal | 主板温度 |
| zone2-3 | modem-lte-* | LTE modem 温度 |
| zone8-9 | modem-skin / wifi | 表皮 / wifi |
| 其他 modem-mmw* | mmW 5G 相关, 多数读出 -273000 (传感器未连接) | 自动过滤 |

**判定阈值**(写入 throttling.evidence):
- 采后 ≥ 75°C → 高温警戒(独立触发 likely)
- Δ ≥ 5°C → 温度上升信号 + 频率信号 → likely
- 采后 ≥ 70°C 配合频率信号 → likely 加强

**cpuinfo_max_freq 旁路**(只采前一次, 设备启动后不变):

```bash
adb shell "cat /sys/devices/system/cpu/cpu{0..7}/cpufreq/cpuinfo_max_freq" > cpuinfo_max_freq.txt
```

PAL-AL00 (骁龙 888) 实测:cpu0-3=1804.8 MHz / cpu4-6=2419.2 MHz / cpu7=2841.6 MHz, 经典 1+3+4 大中小架构。

provider 端 reach% 计算用观测 max(perfetto trace 内 cpufreq counter)做分母即可, cpuinfo_max_freq 只是参考"理论上限"。

---

## §6 不加 sysfs scaling_max_freq 旁路决策

实测华为 EMUI:

```bash
adb shell "cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq"
# → cat: ... Permission denied
```

`scaling_max_freq`(动态频率上限, 降频时会被 SoC governor 压低)在华为机器上 **shell 用户权限读不到**, 只有 root / system_server 能读。

这意味着严格"sysfs confirmed 级"降频判定**永远不可达**, 我们停在 likely 档(温度旁路 + cpufreq counter 双信号)。

bat 不再尝试采这一项, 避免 stderr 满屏 "Permission denied" 误导用户。

---

## §7 collection-manifest.json 决策

**记录每次采集的可读性状态**, 让 Provider 端能知道这次采集到了什么:

```json
{
  "stamp": "20260624_104944",
  "duration": "20s",
  "bufferMb": 256,
  "targetApp": "com.tencent.aoeyz",
  "isRoot": 0,
  "categories": "sched freq idle am wm gfx view binder_driver dalvik memory",
  "sysfs": {
    "cpuinfoMaxFreq": 1,
    "thermalBefore": 1,
    "thermalAfter": 1,
    "scalingMaxFreq": false
  },
  "knownLimitations": {
    "schedBlockedReason": "non-root + huawei EMUI denies; raw table 0 rows in practice",
    "gpuCounters": "qcom GPU producer requires root injection",
    "frameTimeline": "needs perfetto config-mode data source (not enabled in this version)",
    "wwiseVisibility": "atrace has no native instrumentation; perfetto blind to wwise; use simpleperf"
  }
}
```

Provider `_load_collection_manifest` 读这个文件, 决定降频判定是否启用 likely 档(thermalBefore=1 & thermalAfter=1 才启用)。

---

## §8 时戳目录 sample_<stamp>/ 决策

**每次采集落到独立时戳目录**, 不污染同名文件:

```
sample_20260624_104944/
├── 2026-06-24_10-49-c1a652.pftrace
├── collection-manifest.json
├── cpuinfo_max_freq.txt
├── thermal_before.txt
└── thermal_after.txt
```

整个目录直接打包发 AI 分析平台。Provider 用 trace 文件路径 + 同目录下的旁路文件名约定自动加载。

---

## §9 编码 + 时戳决策(Windows 兼容)

**chcp 65001 + 全英文注释**:

之前 v1 的 bat 用中文 REM 注释, 在中文 Windows GBK 编码下被 cmd parser 当成乱码命令(`闄嶉鍒ゅ畾...REM 不是内部或外部命令`)。修法两步走:

1. bat 文件顶部 `chcp 65001 >nul` 切换控制台到 UTF-8
2. bat 文件内**所有 REM 注释全部用英文**(中文输出仅在 echo 里, 且必须在 chcp 之后)

**时戳取法 PowerShell**(替代 wmic):

```bat
for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set STAMP=%%I
```

理由:`wmic os get localdatetime /value` 在 **Windows 11 24H2 已默认移除**(已弃用), PowerShell 取时间戳是跨 Win10/Win11 都能跑的稳定方法。

---

## 数据采集矩阵 (PAL-AL00 / 骁龙 888 / 华为非 root 实测)

| 数据项 | 状态 | 说明 |
|---|---|---|
| atrace 业务 slice (Unity Dev Build ProfilerMarker) | ✅ 完整 | Unity 自动转发 ProfilerMarker → atrace |
| 主线程 / Render / RHI / ECS Worker / LuaMtGC 线程调度 | ✅ 完整 | provider 按 atrace slice 内容反查 |
| sched_switch / CPU 频率 / dalvik GC | ✅ 完整 | atrace 标准类别 |
| sysfs cpuinfo_max_freq | ✅ 可读 | 用户权限 |
| sysfs thermal_zone*/temp | ✅ 可读 | 采前/采后两次, 差值作为降频间接证据 |
| sysfs scaling_max_freq | ❌ Permission denied | 华为锁了, **严格 sysfs 确认级降频判定不可达** |
| sched_blocked_reason ftrace | ❌ 静默失败 | EMUI 默默丢弃 → off-CPU byReason 不可用 |
| GPU counters | ❌ 不可采 | 骁龙需 root 注入 producer |
| actual_frame_timeline_slice | ⚠️ 表存在但 0 行 | 需切到 perfetto config 模式 (本版未启用) |
| Wwise 内部线程可见性 | ❌ 结构性不可见 | atrace 没埋点。需 simpleperf 互补 |

如果换其他设备(骁龙 root / 联发科 / 三星等), 上述矩阵需要重新探测。`collection-manifest.json` 设计就是为了让 Provider 端针对不同设备状态自适应。
