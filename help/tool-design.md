# PerfAnalysisTool - 性能分析工具设计文档

## 1. 项目概述

基于 Electron + React + ECharts 的 Unity Profiler 数据分析工具，读取 Unity Profile Analyzer 导出的 `.pdata` 文件，提供可视化分析和 AI 辅助诊断能力。

### 技术栈

| 层 | 技术 |
|---|------|
| 框架 | Electron + electron-vite |
| 前端 | React 18 + TypeScript + Ant Design + ECharts |
| 状态管理 | Zustand |
| AI 接入 | @tencent-ai/agent-sdk (CodeBuddy Agent SDK) |
| 构建 | electron-vite (Vite for renderer, esbuild for main) |

### 启动命令

```bash
cd k:\AI\PerfAnalysisTool_Codebuddy
npm run dev      # 开发模式（热重载）
npm run build:win  # 打包 Windows 可执行文件
```

---

## 2. 数据流架构

```
.pdata 文件
    |
    v
[Main Process]
    pdata-parser.ts     -- 二进制解析 -> ProfileData（原始帧/线程/Marker数据）
    profile-analyzer.ts -- 统计分析 -> ProfileAnalysisResult（汇总/排序/直方图）
    agent-service.ts    -- AI 分析 -> 流式响应
    |
    v  (IPC: invoke/handle + stream)
    |
[Renderer Process]
    profilerStore.ts    -- Zustand 全局状态
    ProfilerModule/     -- 可视化组件
```

---

## 3. 数据格式

### 3.1 .pdata vs .data

| 文件 | 来源 | 说明 |
|------|------|------|
| `.data` | Unity Profiler 窗口直接保存 | Unity 内部二进制格式，无法直接读取 |
| `.pdata` | Profile Analyzer 工具保存 | Profile Analyzer 的中间格式，本工具读取此格式 |

**准备 .pdata 的步骤**：
1. Unity Profiler 录制数据（得到 .data）
2. Unity Profiler 窗口 File > Load > 加载 .data
3. 打开 Profile Analyzer (Window > Analysis > Profile Analyzer)
4. 点 "Pull Data" 拉取 Profiler 数据
5. 点 "Save" 保存为 .pdata

### 3.2 解析后的原始数据结构

```typescript
ProfileData {
  frames: ProfileFrame[]        // 每帧数据
  markerNames: string[]         // Marker 名称表（索引引用）
  threadNames: string[]         // 线程名称表（格式: "1:Main Thread"）
}

ProfileFrame {
  msStartTime: number           // 帧起始时间(ms)
  msFrame: number               // 帧总耗时(ms) -- 对应 PlayerLoop 总耗时
  threads: ProfileThread[]      // 每个线程的数据
}

ProfileThread {
  threadIndex: number           // 线程名称索引
  markers: ProfileMarker[]      // 该线程下所有 Marker（深度优先序）
}

ProfileMarker {
  nameIndex: number             // Marker 名称索引
  msMarkerTotal: number         // 该 Marker 总耗时(ms)
  depth: number                 // 调用深度（1=顶层）
  msChildren: number            // 子 Marker 累计耗时
}
```

### 3.3 分析结果数据

```typescript
ProfileAnalysisResult {
  frameSummary: FrameSummary           // 帧统计（min/max/mean/median/分位数）
  markers: MarkerDataResult[]          // 每个 Marker 的聚合统计
  threads: ThreadDataResult[]          // 每个线程的帧耗时统计
  frameTimeline: {frameIndex, ms}[]    // 每帧耗时时间线（用于曲线图）
}

MarkerDataResult {
  name, msTotal, msMean, msMedian, msMin, msMax,  // 耗时统计
  count, presentOnFrameCount,                      // 出现次数
  minDepth, maxDepth,                              // 调用深度范围
  threads: string[],                               // 所在线程
  frames: {frameIndex, ms, count}[]                // 每帧耗时明细
}
```

---

## 4. UI 布局设计

### 4.1 整体布局（从上到下）

```
+------------------------------------------------------------------+
| [Open] [文件名]                        [AI Analyze] [CSV]         |  <- 顶部工具栏
+------------------------------------------------------------------+
| =================== Frame Time Graph ========================== |  <- 帧时间曲线（占满宽度）
| CPU Frame Time (ms) - 600 frames, avg 55 FPS                    |
| [曲线图: 紫色主线 + 橙色 Marker Overlay + 选中竖线/高亮区域]       |
+------------------------------------------------------------------+
| [Threads v] [All Depths v] Self: [x] RefLines: [ ] | Filter ... |  <- 过滤器栏
+------------------------------------------------------------------+
| [Top Markers 条形图]                                              |
+------------------------------------------------------------------+
| Marker Table (65%)           | FrameSummary                     |
| Name | Median | Mean | ...   | MarkerHistogram                  |
| ...                          | ThreadSummary                    |
+------------------------------------------------------------------+
| [StatusBar]                                                       |
+------------------------------------------------------------------+
```

### 4.2 Frame Time Graph 交互

| 操作 | 行为 |
|------|------|
| **单击** | 选中该帧，画青色竖线，显示 `Frame N  16.7ms  60FPS` |
| **拖拽** | 实时高亮范围，松手确认，显示 `Frame 100 ~ 200` |
| **点击 "x" 标签** | 清除选中，恢复全量 |
| **dataZoom 滑块** | 缩放/平移时间轴，不影响选中状态 |

**设计要点**：
- yMax 和 Ref Lines (Median/Mean) 从 `fullFrameTimeline` 的固定统计值计算，**选帧后不变**
- 选中竖线的文字**横向显示**，位于竖线顶部偏右；靠右侧时自动切到左侧
- 无动画 (`animation: false`)
- X 轴刻度按 50 的倍数显示（0, 50, 100, 150...）

### 4.3 Marker Overlay 曲线

选中 Marker Table 中的一行后，时间轴叠加该 Marker 的每帧耗时曲线（橙色 `#f59e0b`），再次点击同一行反选（曲线消失）。

- 数据来源：`fullMarkers`（首次加载保存的完整 markers），不受帧范围过滤影响
- 始终显示**全量时间轴**上的 Marker 耗时

### 4.4 状态管理 (Zustand Store)

关键 state 分离：

| State | 用途 | 何时更新 |
|-------|------|----------|
| `analysisData` | 当前分析结果（可能是子集） | 每次 reanalyze |
| `fullFrameTimeline` | 完整帧时间线 | 仅首次加载 |
| `fullMarkers` | 完整 Marker 列表 | 仅首次加载 |
| `selectedFrameRange` | 选中的帧范围 | 用户点击/拖拽 |
| `selectedMarker` | 选中的 Marker 行 | 用户点击表格 |
| `dragRange` | 拖拽中的临时范围 | mousemove (组件内 state) |

---

## 5. 过滤与重分析

### 5.1 过滤器

| 过滤器 | 类型 | 触发时机 |
|--------|------|----------|
| Thread | 多选下拉 | **下拉关闭时**触发 reanalyze（避免每选一个就触发） |
| Depth | 单选下拉 | 选中即触发 |
| Self Times | 开关 | 切换即触发 |
| Name Filter | 输入框 | 仅前端过滤，不触发 reanalyze |
| Ref Lines | 开关 | 仅视觉切换，默认关闭 |

### 5.2 统一 reanalyze

所有 reanalyze 调用统一通过 `doReanalyze()` 函数，始终携带：
- `frameRange`: 当前选中帧范围
- `threadFilters`: 当前线程过滤
- `depthFilter`: 当前深度过滤
- `selfTimes`: 是否 Self 模式

reanalyze 期间显示 Spin loading 遮罩（"Analyzing..."）。

---

## 6. AI 分析接入

### 6.1 SDK 集成

使用 `@tencent-ai/agent-sdk`（本地 vendor 引用），通过 `query()` API 调用 CodeBuddy Agent。

```typescript
// agent-service.ts
import { query } from '@tencent-ai/agent-sdk'

const session = query(prompt, {
  model: config.model,
  maxTurns: config.maxTurns,
  permissionMode: config.permissionMode
})

for await (const event of session) {
  if (event.type === 'text') {
    win.webContents.send('ai:stream', { type: 'delta', content: event.content })
  }
}
```

### 6.2 IPC 通道

| 通道 | 方向 | 用途 |
|------|------|------|
| `ai:analyze` | renderer -> main | 发起分析请求 |
| `ai:abort` | renderer -> main | 中止当前分析 |
| `ai:setConfig` / `ai:getConfig` | renderer -> main | 配置模型参数 |
| `ai:stream` | main -> renderer | 流式返回分析内容 |

---

## 7. 文件结构

```
src/
  main/
    ipc-handlers.ts          # IPC 路由
    profiler/
      pdata-parser.ts        # .pdata 二进制解析
      profile-analyzer.ts    # 统计分析引擎
      types.ts               # 数据类型定义
    ai/
      agent-service.ts       # CodeBuddy Agent SDK 封装
      prompt-builder.ts      # Prompt 构建策略
  preload/
    index.ts                 # preload bridge
    index.d.ts               # 类型声明
  renderer/
    App.tsx                  # 根组件
    store/
      profilerStore.ts       # Zustand 全局状态
    types/
      profiler.ts            # 前端类型定义
    modules/
      ProfilerModule/
        index.tsx            # 主模块（工具栏 + 过滤器 + 布局）
        FrameTimeGraph.tsx   # 帧时间曲线（ECharts）
        MarkerTable.tsx      # Marker 表格（antd Table + virtual scroll）
        FrameSummary.tsx     # 帧摘要卡片
        TopMarkers.tsx       # Top Markers 条形图
        MarkerHistogram.tsx  # Marker 分布直方图
        ThreadSummary.tsx    # 线程摘要
        AiAnalysisPanel.tsx  # AI 分析侧边栏
    styles/
      global.less            # 全局样式（暗色主题）
  vendor/
    agent-sdk/               # @tencent-ai/agent-sdk 本地包
```
