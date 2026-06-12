# Maple ILOpt 性能同步采样方案

> 版本: v1.0 · 日期: 2026-06-11

---

## 目录

1. [背景](#1-背景)
2. [采样工具介绍](#2-采样工具介绍)
3. [同步采样方案设计](#3-同步采样方案设计)
4. [实现细节](#4-实现细节)
5. [使用步骤](#5-使用步骤)
6. [数据分析方法](#6-数据分析方法)
7. [结果解读与结论模板](#7-结果解读与结论模板)

---

## 1. 背景

### 1.1 优化目标

Maple ILOpt 是一项针对 Unity IL（中间语言）的编译期优化，核心手段为：

- **去虚化（devirtualization）**：将虚函数调用替换为直接调用，消除虚表查找开销
- **内联（inlining）**：将频繁调用的小函数内联到调用点，减少函数调用开销
- **常量折叠 / 死码消除**：编译期计算常量表达式，删除不可达分支

优化后的产物为插桩版 `libil2cpp.so`（以下称 **opt 包**），与未优化版本（**base 包**）进行对比。  
**预期收益：libil2cpp.so 的 CPU 消耗下降 4–6%**。

### 1.2 为什么需要同步采样

性能对比实验的核心挑战是**让两次采样的场景完全一致**：

| 挑战 | 说明 |
|---|---|
| 工具时钟不统一 | simpleperf 用 `clock_monotonic`，Unity Profiler 用 `Time.realtimeSinceStartup`，时钟零点不同 |
| 采样窗口不对齐 | 若 simpleperf 早于或晚于 Unity Profiler 启停，采样窗口内容不同，导致数据不可比 |
| 手动操作误差 | 人工观察然后停止工具，误差可达数秒，足以引入大量噪声 |

### 1.3 解决方案：logcat 时间戳裁窗口

**核心思路**：在游戏 Lua 代码的 START/END 日志中追加 `mono_ns`（`clock_monotonic` 纳秒时间戳），  
让 simpleperf 持续运行，采样结束后用 `mono_ns` 精确裁剪出与 Unity Profiler 完全对齐的时间窗口。

```
时间轴（clock_monotonic）：
─────┬──────────────────────────────────────┬─────
     │   [CombinedProfile] START mono_ns_start │
     │                                        │
     │  simpleperf 持续采样（--no-duration）  │
     │  Unity Profiler 采集帧数据            │
     │  atrace marker 写入 ftrace 缓冲区     │
     │                                        │
     │   [CombinedProfile] END mono_ns_end   │
─────┴──────────────────────────────────────┴─────
                 ↓ 分析时
     simpleperf report --time <mono_ns_start>-<mono_ns_end>
     Unity Profiler .pdata（窗口内帧均数据）
     perfetto .pftrace（CombinedProfile_xxx 色块内数据）
```

**三个工具的时间窗口在物理上并非严格对齐，但误差极小，对分析结论无实质影响。**

### 1.4 时间窗口精确边界分析

以下是采样过程中各关键时刻的物理时间顺序（均以 `clock_monotonic` 为基准）：

```
t0  游戏收到 am start Intent，进入 HandleExternalProfileCommand
     ↓ （消息队列调度延迟，与分析无关）
t1  AutoStartSaveProfiler() 执行 → Profiler.enabled = true  ← pdata 录制起点
     ↓ 几行 Lua 代码执行
t2  GetMonotonicNs() 返回 → 写入 logcat mono_ns_start       ← simpleperf 裁剪窗口起点
     ↓ TraceBegin() 通过 JNI 写入 ftrace 缓冲区
t3  atrace CombinedProfile_xxx 色块起点                      ← perfetto 窗口起点

                    ... 游戏运行 ~60s ...

t4  AutoEndSaveProfiler() 执行 → Profiler.enabled = false   ← pdata 录制终点
     ↓ 几行 Lua 代码执行
t5  GetMonotonicNs() 返回 → 写入 logcat mono_ns_end          ← simpleperf 裁剪窗口终点
     ↓ TraceEnd() 通过 JNI 写入 ftrace 缓冲区
t6  atrace 色块终点                                          ← perfetto 窗口终点
```

| 工具 | 窗口起点 | 窗口终点 | 相对 pdata 的误差来源 |
|---|---|---|---|
| **Unity Profiler (.pdata)** | `t1`（AutoStart） | `t4`（AutoEnd） | 基准参考，窗口 = `t1 ~ t4` |
| **simpleperf（裁剪后）** | `t2`（mono_ns_start） | `t5`（mono_ns_end） | 起点晚 `t2-t1`，终点晚 `t5-t4` |
| **perfetto（SQL where 过滤）** | `t3`（atrace start） | `t6`（atrace end） | 起点晚 `t3-t1`（ftrace 写入延迟），终点晚 `t6-t5` |

**各时间间隔说明**：

- **`t2-t1`（AutoStart 到 GetMonotonicNs）**：`AutoStartSaveProfiler` 内部执行 `Profiler.enabled = true`，理论上是异步的（仅设置标志，下一帧生效），后续几行 Lua 代码执行时间极短。该间隔未经测量，可通过在 AutoStart 前后各打一次 `GetMonotonicNs()` 对比获得实测值。
- **`t3-t2`（GetMonotonicNs 到 atrace 色块起点）**：JNI 调用 `TraceBegin` + ftrace 缓冲区写入，通常 < 0.1ms。

**实际影响评估**：即使 `t2-t1` 有 10ms（较悲观的估算），对 60s 采样窗口的帧均误差影响 < 0.017%，远低于 CPU 采样本身的统计噪声（通常 2-5%），**对分析结论无实质影响**。

> **注意**：如需进一步提高 simpleperf 裁剪窗口与 pdata 的对齐精度，可将 `GetMonotonicNs()` 的调用位置移到 `AutoStartSaveProfiler()` **之前**，使 `mono_ns_start` 严格早于 pdata 开始录制。

---

## 2. 采样工具介绍

### 2.1 simpleperf

**定位**：Android 原生 CPU 性能剖析工具（Google 官方，内置于 Android SDK）

**原理**：基于 Linux `perf_event_open` 系统调用，以固定频率（默认 4000Hz）对 CPU 采样，  
记录当前 CPU 上正在执行的函数调用栈（精确到机器码地址，配合符号表还原为函数名）。

**可提供的数据维度**：

| 维度 | 说明 | 对 Maple 的意义 |
|---|---|---|
| **So 级 CPU 占比**（Level 1） | 每个 `.so` 库在各线程的 CPU 时间占比 | `libil2cpp.so` 占比下降 = Maple 核心收益 |
| **函数级 self time**（热点） | 哪些函数是真正的 CPU 消耗点（不含调用链） | 定位 Maple 优化最集中的函数 |
| **调用子树时间**（Anchor 分析） | 以某锚点函数为根的子树总 CPU 时间 | 量化虚函数调用链（Invoke / VirtualInvoke）的总开销 |
| **函数级 A/M/D Diff**（Level 3） | 两个版本间函数时间增/减/消失 | 精确定位 Maple 内联/去虚化改动的函数列表 |
| **线程 CPU 分布** | UnityMain / UnityGfxRenderS / Worker 各占多少 | 验证优化是否只影响主线程 |
| **off-CPU 时间** | `--trace-offcpu` 追踪线程等待/睡眠时间 | 判断主线程是否在等 GPU/锁，补充 CPU 占用数据 |

**采样参数推荐**：
```bash
simpleperf record \
  -e cpu-clock          \  # 实际墙钟时间，跨设备可比（不受 CPU 频率影响）
  --trace-offcpu        \  # 同时记录 off-CPU 时间（等待 / 睡眠）
  --call-graph dwarf    \  # 完整调用栈（DWARF 展开，支持复杂 C++ 场景）
  -f 4000               \  # 采样频率 4000Hz
  --no-duration         \  # 持续运行直到被 PC 脚本停止
  -p <pid>              \  # 目标进程 PID（从 adb shell 获取）
  -o /data/local/tmp/perf.data
```

**分析参数（裁窗口）**：
```bash
simpleperf report \
  --time <mono_ns_start>-<mono_ns_end>  \  # 精确裁剪 CombinedProfile 窗口
  --sort dso,symbol                     \
  --percent-limit 0.1
```

---

### 2.2 Unity Profiler（.pdata）

**定位**：Unity 引擎内置的帧级性能剖析工具

**原理**：Unity 在每帧的各个阶段插入计时器（基于 `UnityEngine.Profiling.Profiler`），  
记录 C# Scripting / Physics / Rendering / Animation 等各阶段的耗时，以帧为单位输出。

**可提供的数据维度**：

| 维度 | 说明 | 对 Maple 的意义 |
|---|---|---|
| **帧均总耗时（ms/frame）** | 最终用户感知的帧时间 | 验证 Maple 是否改善整体帧率 |
| **Scripting 帧均耗时** | C# 托管层总时间（含 il2cpp + xLua） | Maple 直接优化目标，应明显下降 |
| `Scripting.Invoke` 耗时 | C# 方法调用总开销 | 对应 il2cpp Invoke 路径 |
| `GC.Alloc` 次数 + 字节 | 托管内存分配 | Maple 内联可能减少临时对象 |
| **WaitForTargetFPS 耗时** | CPU 空闲等待时间 | 越长说明 CPU 越宽松（间接指标） |
| Physics / Rendering / Animation | 各模块帧均耗时 | 验证 Maple 无副作用 |
| **慢帧占比（>33ms/>50ms）** | 用户可感知的卡顿率 | 验证优化是否改善流畅度 |
| **帧时间 P50/P95/P99** | 帧时间分布尾部 | 极端卡顿改善情况 |

**与 simpleperf 的关系**：  
simpleperf 看 "CPU 在执行什么"，Unity Profiler 看 "每帧各模块花了多少时间"。  
两者方向一致 = 结论高置信度；方向不一致 = 需要排查（如 GPU 瓶颈、温控降频）。

---

### 2.3 perfetto

**定位**：Google 开发的系统级全链路追踪工具，可同时追踪 CPU / GPU / 内存 / 进程调度

**原理**：通过 ftrace（Linux 内核追踪框架）+ atrace（Android 应用层 marker）+ GPU 计数器，  
记录系统中所有线程的调度切换事件、函数区间 marker、硬件计数器，生成完整的时间轴。

**可提供的数据维度**：

#### 2.3.1 帧流水线完整时序（最重要）

```
perfetto 时间轴（ui.perfetto.dev）：

com.tencent.aoeyz / UnityMain：
  |--[Scripting]---|--[Physics]--|--[Render Submit]--|--[WaitGPU]--|
  
RenderThread：
  |                               |--[Submit Draw Calls]--|
  
GPU：
  |                                                  |--[Execute]--|

atrace marker（本方案写入）：
  |━━━━━━━━━━━━━[CombinedProfile_maple_base_001]━━━━━━━━━━━━━━━━━━|
```

**价值**：精确看到每帧的流水线瓶颈是 CPU 计算、CPU 等待 GPU 提交、还是 GPU 执行阶段。  
simpleperf 只看 "CPU 在干什么"，**看不到 "CPU 在等什么"**。

#### 2.3.2 CPU Scheduler 调度数据

```
UnityMain 线程状态（每次调度切换都有记录）：
|Running|Runnable|Sleeping|Running|Sleeping(waiting vsync)|Running|

Running   = 真正在 CPU 上执行
Runnable  = 想运行但被其他线程抢占（CPU 竞争强度指标）
Sleeping  = 主动等待（vsync / GPU fence / 锁）
```

**对 Maple 的价值**：  
- Maple 优化后 Scripting 时间缩短 → UnityMain 的 Running 段应变短
- Sleeping(vsync) 段应变长（更快完成 CPU 计算，提前进入等待状态）
- 与 simpleperf `--trace-offcpu` 交叉验证（perfetto 粒度是每次调度切换，更精细）

#### 2.3.3 GPU 数据

| 维度 | 说明 |
|---|---|
| GPU Frequency | 是否因温控降频（排除数据干扰） |
| GPU 利用率 | 如果 100%，说明 GPU 是瓶颈，CPU 优化收益会被稀释 |
| GPU 内存带宽 | 显存 I/O 压力 |

#### 2.3.4 内存压力

| 维度 | 说明 |
|---|---|
| RSS / PSS | 内存占用变化（Maple 内联导致 `libil2cpp.so` 体积增大，关注 code segment） |
| `ion_alloc` / `mmap` 调用 | 代码膨胀是否导致 Instruction Cache miss 增加的间接指标 |
| LMK 事件 | 低内存杀进程事件（排除内存压力干扰） |

#### 2.3.5 Binder 调用延迟

- UnityMain 发起 Binder 调用次数 + 平均延迟
- 如果 MainThread 频繁等待 system_server 响应，il2cpp 优化效果会被稀释

#### 2.3.6 perfetto 对 Maple 的专项验证问题

| 验证问题 | 对应 perfetto 数据 |
|---|---|
| Maple 是否真正缩短每帧 Scripting 时间 | UnityMain Scripting atrace 色块时长 |
| 优化收益有没有被 GPU 等待稀释 | GPU 利用率 vs CPU Running 占比对比 |
| 代码膨胀是否带来 ICache miss 负面影响 | CPU 硬件计数器（`cache-misses` event） |
| 优化后帧率有无实质提升 | Choreographer 信号间隔 P50/P95/P99 |
| 线程调度是否有变化 | Scheduler trace Running/Runnable 占比对比 |

**atrace marker（`CombinedProfile_xxx` 色块）**：  
在 perfetto 中，本方案通过 Java `android.os.Trace.beginSection/endSection` 向 ftrace 缓冲区写入命名区间。  
打开 `ui.perfetto.dev` 时，该区间显示为一个有名字的色块，精确标出 Unity Profiler 的采样窗口，  
可直接点击色块框选这段时间，无需手动估算时间范围。

---

### 2.4 三工具对比总结

| 维度 | simpleperf | Unity Profiler | perfetto |
|---|---|---|---|
| **数据粒度** | 函数级 CPU 占比 | 帧级模块耗时 | 系统级每次调度切换 |
| **时间对齐** | `mono_ns` 裁窗口（< 1ms 误差） | 采样期间所有帧 | atrace marker 色块（< 1帧误差） |
| **核心价值** | il2cpp 占比 & 函数级 diff | Scripting 帧均 & 慢帧率 | 流水线瓶颈 & GPU & 调度 |
| **交叉验证** | ← 与 Unity Profiler Scripting 方向一致 → | ← 与 simpleperf il2cpp 方向一致 → | 独立视角，排除 GPU 瓶颈干扰 |

---

## 3. 同步采样方案设计

### 3.1 整体架构

```
PC 端（maple_sample.py）
    │
    ├── 1. adb shell 获取进程 PID
    ├── 2. 启动 simpleperf（后台持续采样，--no-duration）
    ├── 3. 启动 perfetto（后台持续录制 trace，--time 0s = 持续运行）
    │       └── 复用 record_android_trace.py
    ├── 4. adb shell am start 触发游戏 Intent
    │       └── 游戏收到 Intent，调用 HandleExternalProfileCommand("start_combined_profile", ...)
    │
    │   [游戏运行中]
    │   ┌──────────────────────────────────────────────────┐
    │   │ ProfileCommandBridge.TraceBegin("CombinedProfile_xxx")     │
    │   │   → atrace marker 写入 ftrace 缓冲区               │
    │   │ ProfilerUtil.AutoStartSaveProfiler(name)           │
    │   │   → Unity Profiler 开始采集                        │
    │   │ logcat: [CombinedProfile] START ... mono_ns=<ns>   │
    │   │                                                    │
    │   │ 游戏运行 duration 秒...                            │
    │   │                                                    │
    │   │ ProfilerUtil.AutoEndSaveProfiler()                 │
    │   │   → Unity Profiler 停止，保存 .pdata               │
    │   │ ProfileCommandBridge.TraceEnd()                    │
    │   │   → atrace marker 结束                             │
    │   │ logcat: [CombinedProfile] END ... mono_ns=<ns>     │
    │   └──────────────────────────────────────────────────┘
    │
    ├── 5. 轮询 logcat，检测到 END 日志
    ├── 6. 立刻停止 simpleperf（kill SIGINT）
    ├── 7. 立刻停止 perfetto
    ├── 8. adb pull perf.data / .pftrace / .pdata
    └── 9. 保存 meta.json（mono_ns_start, mono_ns_end, frameCount, device...）
```

### 3.2 时钟同步方案

**关键：`ProfileCommandBridge.GetMonotonicNs()`**

```java
// Android Java
public static long GetMonotonicNs() {
    return SystemClock.elapsedRealtimeNanos();  // 对应 clock_monotonic
}
```

```lua
-- Lua 调用 Java（通过 xLua C# 桥接）
local monoNs = CS.com.aoe.profile.ProfileCommandBridge.GetMonotonicNs()
mgr.randolfLog:Info("[CombinedProfile] START name=%s mono_ns=%s ...", name, tostring(monoNs))
```

**为什么选 `SystemClock.elapsedRealtimeNanos()`**：
- 对应 Linux `clock_gettime(CLOCK_MONOTONIC)`
- simpleperf 的时间戳也使用 `CLOCK_MONOTONIC`
- 设备重启后从 0 开始，不受系统时间调整影响
- `t2-t1` 间隔（AutoStart 到 GetMonotonicNs）未经测量，实际影响可忽略（详见 [1.4 节时间窗口边界分析](#14-时间窗口精确边界分析)）

### 3.3 atrace marker 方案

**作用**：专为 perfetto 服务，在 ftrace 缓冲区标记 Unity Profiler 的采样窗口。

```java
// 游戏进程内调用（运行在主线程）
android.os.Trace.beginSection("CombinedProfile_" + name);  // START 时
android.os.Trace.endSection();                              // END 时
```

**perfetto 效果**：
```
ui.perfetto.dev 时间轴（游戏进程主线程 Track）：
  |░░░[draw][CombinedProfile_maple_base_001                               ][draw]░░░|
```

可直接点击色块 → 精确框选该时间范围 → 查看所有 CPU/GPU/内存数据。

### 3.4 文件输出约定

每次采样结束后，本地目录结构：

```
output/maple/
  <run_id>/
    perf.data          ← simpleperf 原始采样数据
    perf.data.meta.json← mono_ns_start/end, frameCount, device, pid
    trace.pftrace      ← perfetto 原始 trace
    *.pdata            ← Unity Profiler 数据（从设备拉取）
    meta.json          ← 综合元信息（版本、场景、时长）
```

`run_id` 格式：`<label>_<device>_<date>_<time>`  
例：`maple_base_Pixel7_20260611_1430`

---

## 4. 实现细节

### 4.1 Java: ProfileCommandBridge.java

位置：`AOE3D/Assets/Plugins/Android/libs/ProfileCommandBridge.java`

**注意**：Lua 不能直接调用 Java 类，必须通过 C# 中间层（`AndroidJavaClass.CallStatic`）转发。

```java
package com.aoe.profile;

import android.os.SystemClock;
import android.os.Trace;

// 调用链：Lua → CS.AOE.ProfileCommandBridge（C#）→ AndroidJavaClass.CallStatic → 本类
public class ProfileCommandBridge {

    /** 返回 clock_monotonic 纳秒时间戳（等价于 POSIX clock_gettime(CLOCK_MONOTONIC)）。*/
    public static long GetMonotonicNs() {
        return SystemClock.elapsedRealtimeNanos();
    }

    /** 在 ftrace/atrace 中开启一个命名区间（perfetto 时间轴上可见的色块）。*/
    public static void TraceBegin(String sectionName) {
        Trace.beginSection(sectionName);
    }

    /** 结束最近一个 TraceBegin 开启的区间。必须与 TraceBegin 一一配对。*/
    public static void TraceEnd() {
        Trace.endSection();
    }
}
```

### 4.2 C#: ProfileCommandBridge.cs

位置：`AOE3D/Assets/Scripts/CS/Common/ProfileCommandBridge.cs`

参照项目内 `DisplayHelper.cs` 的 `AndroidJavaClass.CallStatic` 模式（即 Java Plugin 调用的标准姿势），加 `[XLua.LuaCallCSharp]` 标记让 Lua 可通过 `CS.AOE.ProfileCommandBridge` 直接调用。

```csharp
namespace AOE
{
    [XLua.LuaCallCSharp]
    public static class ProfileCommandBridge
    {
        private const string JavaClassName = "com.aoe.profile.ProfileCommandBridge";
        private static AndroidJavaClass _javaClass;

        // Lua: CS.AOE.ProfileCommandBridge.GetMonotonicNs()
        public static long GetMonotonicNs()   { ... AndroidJavaClass.CallStatic<long>("GetMonotonicNs") ... }

        // Lua: CS.AOE.ProfileCommandBridge.TraceBegin("CombinedProfile_xxx")
        public static void TraceBegin(string sectionName) { ... CallStatic("TraceBegin", sectionName) ... }

        // Lua: CS.AOE.ProfileCommandBridge.TraceEnd()
        public static void TraceEnd() { ... CallStatic("TraceEnd") ... }
    }
}
```

### 4.3 Lua 修改：ProfileTestMgr.lua

在 `StartExternalCombinedProfile` 和 `StopExternalCombinedProfile` 中追加 `mono_ns`，
通过 xLua 的 `CS.AOE.ProfileCommandBridge` 调用 C# 层（再由 C# 转发到 Java）。

**START 修改**（追加到 `ProfilerUtil.AutoStartSaveProfiler(profileName)` 之后）：
```lua
-- 获取 clock_monotonic 时间戳并打 atrace marker
local monoNs = CS.AOE.ProfileCommandBridge.GetMonotonicNs()
CS.AOE.ProfileCommandBridge.TraceBegin("CombinedProfile_" .. profileName)

mgr.randolfLog:Info("[CombinedProfile] START name=%s frame=%s time=%.2f duration=%s mono_ns=%s",
    profileName,
    self._externalProfileStartFrame,
    self._externalProfileStartTime,
    dur,
    tostring(monoNs))
```

**END 修改**（在 `ProfilerUtil.AutoEndSaveProfiler()` 之后追加）：
```lua
local monoNsEnd = CS.AOE.ProfileCommandBridge.GetMonotonicNs()
CS.AOE.ProfileCommandBridge.TraceEnd()

mgr.randolfLog:Info("[CombinedProfile] END name=%s startFrame=%s endFrame=%s frameCount=%s elapsed=%.2fs mono_ns=%s",
    tostring(self._externalProfileName),
    tostring(self._externalProfileStartFrame),
    endFrame,
    frameCount,
    elapsed,
    tostring(monoNsEnd))
```

### 4.4 PC 端脚本

| 脚本 | 功能 |
|---|---|
| `scripts/maple_sample.py` | 一键采样：启动 simpleperf + perfetto → 触发游戏 → 等待 END → 停采 → 拉文件 |
| `scripts/maple_compare.py` | 对比分析：调用 simpleperf_analyzer 三级分析 + 读取 pdata + 生成对比报告 |

---

## 5. 使用步骤

### 5.1 环境准备

```bash
# 1. 确认 adb 连接
adb devices

# 2. 确认 simpleperf 在设备上可用（根据 ABI 选择对应版本）
adb shell ls /data/local/tmp/simpleperf
# 如不存在，推送：
adb push simpleperf/bin/android/arm64/simpleperf /data/local/tmp/
adb shell chmod +x /data/local/tmp/simpleperf

# 3. 安装目标 APK（base 包 / opt 包）
adb install -r base.apk   # 或 opt.apk

# 4. 启动游戏并进入测试场景（手动操作，进入 CombinedProfile 适用的场景）
```

### 5.2 采样（只需一条命令）

```bash
# 采样 base 包，标签 maple_base，持续 60 秒
python scripts/maple_sample.py \
    --label maple_base \
    --duration 60 \
    --scene StressTestBattleSimpleMode \
    --tools simpleperf,perfetto

# 换 opt 包重复一次
python scripts/maple_sample.py \
    --label maple_opt \
    --duration 60 \
    --scene StressTestBattleSimpleMode \
    --tools simpleperf,perfetto
```

**脚本自动完成**：启动 simpleperf + perfetto → 发 Intent 触发游戏 → 等待 END → 停采 → 拉文件 → 保存 meta.json

### 5.3 对比分析

```bash
python scripts/maple_compare.py \
    --base  output/maple/maple_base_Pixel7_20260611_1430 \
    --opt   output/maple/maple_opt_Pixel7_20260611_1500 \
    --out   output/maple/report_20260611.txt
```

### 5.4 perfetto 可视化（手动步骤）

1. 打开 [ui.perfetto.dev](https://ui.perfetto.dev)
2. 拖入 `output/maple/<run_id>/trace.pftrace`
3. 在时间轴中找到 `CombinedProfile_maple_base_001` 色块
4. 点击色块 → 右键 → "Select slice" → 所有 Track 自动框选到该时间范围
5. 查看 UnityMain Running/Runnable/Sleeping 分布
6. 查看 GPU 利用率
7. 截图并手动填入 `maple_compare.py` 报告的 `perfetto 验证摘要` 部分

### 5.5 多次采样（提高统计稳定性）

建议每个版本采样 **3 次**，脚本支持自动循环：

```bash
python scripts/maple_sample.py --label maple_base --duration 60 --runs 3
```

对比时用 3 次均值：

```bash
python scripts/maple_compare.py \
    --base  output/maple/maple_base_Pixel7_*/  \   # 通配符，自动聚合
    --opt   output/maple/maple_opt_Pixel7_*/   \
    --out   output/maple/report_final.txt
```

---

## 6. 数据分析方法

### 6.1 simpleperf 三级分析

#### Level 1 — So 级 CPU 占比（最核心，对 Maple 最敏感）

**提取方法**：`simpleperf_analyzer/so_compare.py`

**关键指标**：

| 指标 | 计算方式 | 说明 |
|---|---|---|
| `libil2cpp.so` 在 UnityMain 的 cpu-clock 占比 % | `il2cpp_event / unityMain_total * 100` | Maple 核心收益，预期下降 4–6pp |
| `libil2cpp.so` 总 cpu-clock（ms） | `il2cpp_event / TIME_SCALE_NS` | 绝对时间 |
| `libil2cpp.so` 帧均 cpu-clock（ms/frame） | `il2cpp_ms / frameCount` | 归一化后可跨场景比较 |
| `libxlua.so` 占比 | 同上 | 验证 Maple 不影响 Lua 层 |
| `libunity.so` 占比 | 同上 | 验证 Maple 不影响引擎层 |
| `libGLESv2_adreno.so` 占比 | 同上 | 验证 GPU 驱动侧无变化 |
| 各线程 CPU 分布 | UnityMain / UnityGfxRenderS / Worker | 验证优化只在主线程 |

#### Level 2 — Anchor 子树时间

**提取方法**：`simpleperf_analyzer/anchor_compare.py`（按 anchor 函数裁剪子树）

**关键 anchor**：

| Anchor 函数 | 预期变化 | 说明 |
|---|---|---|
| `il2cpp::vm::Runtime::Invoke` | ↓ 显著下降 | 虚函数调用总入口，Maple 去虚化的核心路径 |
| `il2cpp::vm::Object::VirtualInvoke` | ↓ 显著下降 | 虚表查找开销，Maple 直接消除 |
| `luaV_execute` | ≈ 不变 | Lua 执行，验证无副作用 |

#### Level 3 — 函数级 A/M/D Diff

**提取方法**：`simpleperf_analyzer/func_compare.py`

**关注标记**：

| 标记 | 含义 |
|---|---|
| `[M]` + `delta_ms < 0` | 被优化的函数（时间减少） |
| `[D]` | 完全消失的函数（Maple 内联消除的虚调用路径） |
| `[maybe_inlined]` | self_time ≈ 0 但 subtree_time 大，说明函数被内联，调用开销消失 |

### 6.2 Unity Profiler .pdata 分析

**提取方法**：`pdata-parser.ts`（已有实现）

**关键指标**：

| 指标 | 正常预期 |
|---|---|
| Scripting 帧均耗时 | 与 simpleperf il2cpp 占比下降方向一致 |
| WaitForTargetFPS 帧均 | base → opt 增加（CPU 更宽松） |
| 慢帧（>33ms）占比 | base → opt 下降 |
| 帧时间 P95 | base → opt 下降 |
| GC.Alloc 次数 | 可能略有下降（内联减少临时对象） |

**交叉验证规则**：  
`simpleperf il2cpp 占比变化方向` 必须与 `Unity Profiler Scripting 帧均变化方向` 一致，  
否则需要排查（GPU 瓶颈、温控降频、场景不一致等）。

### 6.3 perfetto .pftrace 分析

**操作方式**：打开 [ui.perfetto.dev](https://ui.perfetto.dev)，点击 `CombinedProfile_xxx` 色块，框选时间范围

**关键指标**：

| 指标 | 获取位置 | 正常预期 |
|---|---|---|
| UnityMain Running 时间占比 | Thread State Track | base → opt 略有下降 |
| UnityMain Runnable 时间占比 | Thread State Track | 说明 CPU 竞争程度 |
| UnityMain Sleeping(vsync) | Thread State Track | base → opt 略有增加 |
| Scripting 色块时长 | atrace 主线程 Track | base → opt 缩短 |
| GPU Frequency 均值 | GPU Track | 验证无降频干扰 |
| GPU 利用率 | GPU Track | 如 > 90%，说明 GPU 是瓶颈 |
| Choreographer 帧间隔 P95 | Choreographer Track | base → opt 下降 |
| Binder 等待占比 | Binder Track | 验证无 Binder 延迟稀释 |

---

## 7. 结果解读与结论模板

### 7.1 maple_compare.py 输出示例

```
========================================
Maple ILOpt 性能对比报告
  base 版本 : maple_base_Pixel7_20260611_1430
  opt  版本 : maple_opt_Pixel7_20260611_1500
  采样时长  : 60s × 3 次均值
  测试场景  : StressTestBattleSimpleMode
  设备      : Pixel 7 (arm64)
========================================

【核心指标】
  指标                                 base           opt        变化
  ─────────────────────────────────────────────────────────────────
  il2cpp 总 cpu-clock (ms)           6836.88        6421.30    ↓  6.08%  ✓
  il2cpp 帧均 (ms/frame)               3.420          3.211    ↓  6.11%  ✓
  il2cpp 占 UnityMain 比例            38.20%         35.90%    ↓  2.30pp ✓
  frameCount（验证场景一致性）          1998           1993     ≈  持平   ✓

【Unity Profiler 交叉验证】
  Scripting 帧均耗时 (ms)              8.21           7.73     ↓  5.85%  ✓ 方向一致
  WaitForTargetFPS 帧均 (ms)           4.31           4.89     ↑ CPU 更宽松 ✓
  慢帧 (>33ms) 占比                   12.3%          10.1%     ↓  2.2pp  ✓
  帧时间 P95 (ms)                     42.1           38.7      ↓  8.1%   ✓

【线程级 So 分布（simpleperf Level 1）】
  [UnityMain]
    libil2cpp.so    base: 38.2%  →  opt: 35.9%   Δ -2.3pp  ✓
    libxlua.so      base:  9.1%  →  opt:  9.2%   Δ +0.1pp  无影响 ✓
    libunity.so     base: 28.4%  →  opt: 28.5%   Δ +0.1pp  无影响 ✓
    libGLESv2...    base:  2.1%  →  opt:  2.1%   Δ  0.0pp  无影响 ✓

【Anchor 子树时间（simpleperf Level 2）】
  il2cpp::vm::Runtime::Invoke     base: 412.3ms → opt: 302.1ms  ↓ 26.7%  ✓
  il2cpp::vm::Object::VirtualInvoke  base: 188.4ms → opt:  91.2ms  ↓ 51.6%  ✓

【函数级变化 Top 10（simpleperf Level 3）】
  [M] il2cpp::vm::Runtime::Invoke          -142.3ms  -2.08%  [maybe_inlined]
  [M] il2cpp::vm::Object::VirtualInvoke     -98.1ms  -1.44%
  [D] VirtualInvokeData::methodPtrForType   -43.2ms          (虚表查找被消除)
  [M] AOE.Battle.ArmySystem::Update         -31.4ms  -0.46%  [maybe_inlined]
  ...

【perfetto 验证摘要（手动填入）】
  UnityMain Running 占比          base: 68.2%  →  opt: 65.1%   ↓ 3.1pp
  GPU 利用率均值                  base: 73.4%  →  opt: 72.8%   ≈ 持平（无 GPU 瓶颈）
  帧时长 P95                      base: 42.1ms →  opt: 38.7ms  ↓ 8.1%
  Binder 等待占比                 base:  1.2%  →  opt:  1.1%   ≈ 持平（无 Binder 稀释）

【结论】
  ✓ il2cpp CPU 消耗下降 6.1%，达到并超出预期（4-6%），两工具方向一致，结论高置信
  ✓ 虚函数调用路径明显优化（Invoke 下降 26.7%，VirtualInvoke 下降 51.6%）
  ✓ Maple 对其他模块（libunity / libxlua / GPU 驱动）无明显副作用
  ✓ 用户可感知帧率改善（慢帧率 -2.2pp，P95 -8.1%）
  ✓ GPU 利用率无明显变化（排除 GPU 瓶颈稀释优化收益）
```

### 7.2 结论置信度判断规则

| 条件 | 结论 |
|---|---|
| simpleperf il2cpp 占比 ↓ AND Unity Profiler Scripting ↓（方向一致） | **高置信度**，Maple 收益真实 |
| simpleperf ↓ 但 Unity Profiler 无变化 | 排查：GPU 瓶颈（perfetto GPU 利用率），或场景不一致（frameCount 差异 > 5%） |
| simpleperf ↓ 但 Unity Profiler ↑ | 重采，可能有温控/其他干扰 |
| frameCount 差异 > 5% | 场景不一致，本次数据无效 |
| GPU 利用率 > 90%（perfetto） | CPU 收益被 GPU 瓶颈稀释，实际帧率提升有限 |
