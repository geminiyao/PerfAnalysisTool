# Maple 三源对比分析 Web 功能需求文档

## 任务目标

在 Web 应用中新增 Maple ILOpt 三源性能数据对比分析功能：
1. 用户上传 base 和 opt 两个采样目录的所有文件
2. 服务端调用 `scripts/maple_compare.py` 执行分析
3. 前端展示 [A]~[H] 八个维度结果 + AI Markdown 报告

项目根目录：`k:/AI/PerfAnalysisTool_Codebuddy`

---

## 参考文件（开发前必读）

| 文件 | 用途 |
|------|------|
| `web/server/routes/simpleperf.ts` | 完整后端范例：上传→Python调用→SSE进度→AI报告 |
| `web/src/pages/SimpleperfReport.tsx` | 完整前端范例：SSE进度条+Tab结果展示+AI面板 |
| `web/server/db/schema.ts` | 现有 DB 表结构，了解 Drizzle ORM 用法 |
| `web/server/utils/config.ts` | getConfig() 的使用方式 |
| `docs/maple-analysis-report-20260612.md` | AI 生成报告的 Markdown 格式样例 |
| `scripts/maple_compare.py` | 脚本接口和 JSON 输出结构 |

---

## 分析脚本接口

### 调用方式
```bash
python scripts/maple_compare.py \
    --base  <base采样目录> \
    --opt   <opt采样目录> \
    --out   <输出路径前缀（不含扩展名）>
```

脚本自动在两个目录中查找：`perf.data`、`*.pdata`、`*.pftrace`、`binary_cache/`、`meta.json`

### 输出
- `<out>.md`：Markdown 格式分析报告（格式参考 `docs/maple-analysis-report-20260612.md`）
- `<out>.json`：结构化 JSON，供 Web 前端展示

### JSON 输出结构（full_result）
```json
{
  "meta": { "base": "base", "opt": "opt", "device": "PAL-AL00", "scene": "..." },
  "il2cpp_stats": {
    "base_pct": 28.21, "opt_pct": 22.84, "delta_pp": -5.37,
    "base_ms": 6481.1, "opt_ms": 5207.5,
    "base_ms_per_frame": null, "opt_ms_per_frame": null
  },
  "level1_so_compare": {
    "threads": [
      {
        "name": "UnityMain",
        "baseline_total_event": 12345678, "current_total_event": 11234567,
        "libs": [
          { "name": "libil2cpp.so", "baseline_pct": 28.21, "current_pct": 22.84, "delta_pct": -5.37 }
        ]
      }
    ]
  },
  "level2_anchor_compare": {
    "anchors": [
      { "name": "il2cpp::vm::Runtime::Invoke", "baseline_ms": 15496.5, "current_ms": 14834.75, "delta_pct": -4.27 }
    ]
  },
  "level3_func_diff": {
    "items": [
      {
        "abs_ms": 30000,
        "functions": [
          {
            "func": "MUIControlManager_OnLateUpdate_xxx", "lib": "libil2cpp.so",
            "mask": "D", "delta_ms": -338.25, "delta_pct": -100.0, "maybe_inlined": false
          }
        ]
      }
    ]
  },
  "main_thread_hotspots": {
    "base": [{ "func": "luaV_execute", "lib": "libxlua.so", "self_ms": 676.5, "pct": 6.75 }],
    "opt":  [{ "func": "luaV_execute", "lib": "libxlua.so", "self_ms": 512.25, "pct": 6.35 }],
    "compare": [{ "func": "luaV_execute", "lib": "libxlua.so", "base_ms": 676.5, "opt_ms": 512.25, "delta_pct": -24.3 }]
  },
  "worker_threads": [
    {
      "thread": "UnityGfxRenderS",
      "base_total_event": 4506500000, "opt_total_event": 4884500000,
      "libs": [{ "lib": "libunity.so", "base_pct": 44.1, "opt_pct": 43.9, "delta_pp": -0.2 }]
    }
  ],
  "perfetto": {
    "base": {
      "parse_status": "ok",
      "main_thread_running_pct": 92.55, "main_thread_runnable_pct": 1.26, "main_thread_sleeping_pct": 6.19,
      "cpu_freq_avg_mhz": 1560.2, "gpu_freq_avg_mhz": null, "gpu_busy_pct": null,
      "frame_count": 138, "frame_p50_ms": 16.66, "frame_p95_ms": 16.89, "frame_p99_ms": 17.10,
      "unity_slices": {
        "PlayerLoop":       { "count": 138, "avg_ms": 26.04, "p95_ms": 32.1 },
        "BehaviourUpdate":  { "count": 138, "avg_ms": 7.669, "p95_ms": 11.2 },
        "WaitForTargetFPS": { "count": 138, "avg_ms": 0.221, "p95_ms": 0.5 },
        "GC.Collect":       { "count": 45,  "avg_ms": 8.089, "p95_ms": 15.3 }
      },
      "worker_threads_sched": {
        "UnityGfxRenderS": { "count": 1, "running_pct": 15.88, "runnable_pct": 6.62, "sleeping_pct": 77.50 }
      }
    },
    "opt": { "（同 base 结构）": true }
  },
  "pdata": {
    "base": {
      "frame_count": 370, "frame_ms_median": 26.08, "frame_ms_p95": 35.70,
      "markers": {
        "PlayerLoop":       { "ms_mean": 26.97, "ms_p95": 33.5 },
        "BehaviourUpdate":  { "ms_mean": 8.04,  "ms_p95": 11.44 },
        "WaitForTargetFPS": { "ms_mean": 0.19,  "ms_p95": 0.4 },
        "GC.Collect":       { "ms_mean": 10.28, "ms_p95": 18.2 },
        "Camera.Render":    { "ms_mean": 2.31,  "ms_p95": 4.1 }
      }
    },
    "opt": { "（同 base 结构）": true }
  },
  "frame_counts": { "base": null, "opt": null }
}
```

---

## 开发任务

### 任务一：DB Schema（修改 `web/server/db/schema.ts`）

在文件末尾添加新表：

```typescript
export const mapleCompareSessions = sqliteTable('maple_compare_sessions', {
  id: text('id').primaryKey(),
  label: text('label').notNull().default(''),
  device: text('device').notNull().default(''),
  scene: text('scene').notNull().default(''),
  baseDir: text('base_dir'),
  optDir: text('opt_dir'),
  status: text('status').notNull().default('pending'),
  // pending | queued | running | ai_analyzing | completed | failed
  error: text('error'),
  resultJsonPath: text('result_json_path'),
  reportMdPath: text('report_md_path'),
  createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
  duration: integer('duration'),
}, table => ({
  statusIdx: index('idx_maple_compare_sessions_status').on(table.status),
  createdAtIdx: index('idx_maple_compare_sessions_created_at').on(table.createdAt),
}));
```

### 任务二：后端路由（新建 `web/server/routes/maple-compare.ts`）

实现以下 API（完全参照 `simpleperf.ts` 的实现模式）：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/maple-compare/upload` | 接收 multipart 文件，保存目录，创建 session |
| POST | `/api/maple-compare/sessions/:id/analyze` | SSE：调用脚本→进度推送→AI报告生成 |
| GET  | `/api/maple-compare/sessions` | 列出所有 sessions |
| GET  | `/api/maple-compare/sessions/:id` | 获取 session 信息 |
| GET  | `/api/maple-compare/sessions/:id/report` | 返回 `{ session, reportJson }` |
| GET  | `/api/maple-compare/sessions/:id/artifact/md` | 返回 report.md 文件内容 |

**上传接口表单字段：**
- `label`、`device`、`scene`：字符串
- `baseFiles[]`：base 目录的所有文件（multipart，含 `webkitRelativePath`）
- `optFiles[]`：opt 目录的所有文件（同上）

**Python 调用方式：**
```typescript
const python = process.env.PYTHON || 'python';
spawn(python, [
  path.join(config.skillProjectPath, 'scripts/maple_compare.py'),
  '--base', baseDir,
  '--opt', optDir,
  '--out', path.join(resultDir, 'report')
], { shell: true })
```

**分析流程（SSE 事件）：**
```
上传完成 → analyze 接口触发 → 实时推送 stdout 行 → 脚本完成后读取 report.json
→ 调用 AI 生成 Markdown 报告（ai_delta 事件流式输出） → 完成
```

**AI 报告生成：**
- 将 `report.json` 的关键数据拼成 prompt，格式参考 `docs/maple-analysis-report-20260612.md`
- 支持 mock/真实模型切换（参考 simpleperf.ts 的 `generateSimpleperfAiReport` 函数）
- 结果保存为 `report.md`，路径存入 DB

**其他约束：**
- `binary_cache/` 子目录要保留目录结构（参考 simpleperf.ts 的 `sanitizeRelativePath`）
- DB 初始化：`CREATE TABLE IF NOT EXISTS` 方式（参考 db/index.ts 的 initDb）

### 任务三：注册路由（修改 `web/server/index.ts`）

import 并注册 `mapleCompareRoutes`，prefix 与其他路由保持一致。

### 任务四：前端页面（新建 `web/src/pages/MapleComparePage.tsx`）

页面包含两个区域：

**区域 1：上传区**
- 两列并排（base / opt），每列有 label/device/scene 输入
- 文件上传：支持 `webkitdirectory` 整目录拖拽，或手动多选各文件
- 显示已选文件列表
- "开始分析"按钮，上传后跳转至 `/maple-compare/:id`

**区域 2：结果区**（路由含 :id 时显示）

分析进度：`上传完成 → 分析中 → AI生成报告 → 完成`（参考 SimpleperfReport.tsx 的 Steps）

结果 Tabs（9 个）：

| Tab | 数据字段 | 展示内容 |
|-----|---------|---------|
| 执行摘要 | il2cpp_stats + pdata + perfetto | 关键指标对比卡片 + 置信度标签 |
| il2cpp [A] | il2cpp_stats | 3 个 Statistic：占比/绝对时间/帧均，Tag显示↑↓ |
| 热点函数 [B] | main_thread_hotspots.compare | 表格：函数/lib/base_ms/opt_ms/delta%（颜色区分正负） |
| So 分布 [C] | level1_so_compare | 每线程水平条形对比图（base vs opt 并排） |
| 虚函数/Diff [C3+C4] | level2_anchor_compare + level3_func_diff | Anchor 表格 + 函数Diff表（D红/A蓝/maybe_inlined黄） |
| perfetto [D-F] | perfetto.base + perfetto.opt | 线程调度饼图对比 + unity_slices帧均表 + P50/P95/P99 |
| pdata [G] | pdata.base + pdata.opt | Marker帧均柱状图 + 帧时长P50/P95/P99 Statistic卡片 |
| 交叉验证 [H] | 综合以上数据 | 三源信号汇总 Alert 列表（✓/!/≈）+ 置信度 Badge |
| AI 分析报告 | reportMd | ReactMarkdown 渲染 + 流式 ai_delta 事件实时显示 + 下载按钮 |

**技术栈：** Ant Design 组件库（已安装）、`echarts-for-react` 图表（已安装）、`react-markdown`（已安装）

### 任务五：路由和菜单

**`web/src/App.tsx`**：
```tsx
<Route path="/maple-compare" element={<MapleComparePage />} />
<Route path="/maple-compare/:id" element={<MapleComparePage />} />
```

**`web/src/components/AppSider.tsx`**：在 Maple 相关菜单项下添加"Maple 三源对比分析"→ `/maple-compare`

---

## 开发约束

1. **不要修改**：`maple.ts`、`maple-analyzer.ts`、`MapleReport.tsx`（轻量流程保留）
2. SSE 事件格式与 simpleperf 保持一致，复用或扩展 `shared/types.ts` 中的类型
3. Python 命令：`process.env.PYTHON || 'python'`
4. 前端使用 Ant Design + echarts-for-react，不引入新依赖
5. AI 报告格式参考 `docs/maple-analysis-report-20260612.md`（四章结构：pdata/simpleperf/perfetto/交叉分析）
