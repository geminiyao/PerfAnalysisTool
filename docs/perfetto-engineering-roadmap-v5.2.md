# Perfetto 单源分析平台 · 工程开发路线图(v5.2 对齐版)

> 本路线图基于 v5.2 报告完成时的状态梳理。
> 原 v4 时期的 [perfetto-skill-engineering-roadmap.md](perfetto-skill-engineering-roadmap.md) 保留作历史参考, **本文档是 v5.2 之后的最新版**, 后续工程开发以本文档为准。

---

## §0 当前状态(v5.2 完成时)

### 0.1 ✅ 已沉淀到 skill(v5.2 完成时落地)

| 维度 | 沉淀位置 |
|---|---|
| 报告骨架(§-1/§0/§3-§7/§9 完整结构 + 视觉化资产) | `references/perfetto-report-template.md` |
| 4 条核心方法论(callTrees 优先 / 温度旁路 likely / slice 反查 / wait wrapper 去重) | `SKILL.md M1-M4` |
| 系统级 + 业务级判定阈值(GPU-bound / 降频四档 / 模块单次红线) | `references/aoe-watch-spec.yaml` |
| 采集脚本配置决策(256MB / 不加 sched_blocked_reason / 温度旁路) | `references/collection-config-rationale.md` |
| 6 个 bug 修复链历史教训 | `references/lessons-learned.md` |

### 0.2 ✅ Provider 已实现的能力

- atrace slice tree(KNOWN_TOP_LEVEL 兜底 PlayerLoop 嵌套问题)
- aoeHotSlices + selfMs 剥洋葱(含 Gfx.WaitForPresent 父子去重)
- threadsSchedList(含识别 RHI / LuaMtGC / ECS Worker × 4)
- offCpuAttribution(byState + byReason 结构, 当前华为非 root 上 byReason null)
- gcAllocByModule(主线程 GC.Alloc 业务子树归因, 次/帧)
- binderPeers.byServerProcess(用 server_pid 反查 process.name)
- throttling 四档判级(confirmed / likely / suspected / none)+ 温度旁路
- frameAnalysis(frameTrees / flags / summary p50/p95/p99)

### 0.3 ✅ 采集脚本 v2 已落地

- `record_aoeyz.bat` 时戳目录 + 采前/采后 thermal_zone 旁路 + cpuinfo_max_freq 旁路 + collection-manifest.json
- root 状态自动探测 + chcp 65001 编码兼容 + PowerShell 时戳替代 wmic

---

## §1 P0:Provider 数据层扩展(下一轮优先)

### P0-1:RHI 子函数下钻 ⭐⭐⭐ 高优先级

**问题**:v5.2 §7.2 留了 ⏳ 占位"RHI 顶层 slice 待 Provider 子函数下钻"。当前 Provider 只识别到 RHI 是哪个 utid, 没有给出该线程上 atrace slice 的累计统计。

**需求**:在 RHI utid 上跑 v4 §7.1 风格的 slice 统计(选定关键 slice 名):

```
slice               count    total ms     avg ms/触发    含义
queueBuffer         122      1843.7       15.11          提交 buffer 到 SurfaceFlinger
Gfx.PresentFrame    61       944.3        15.48          每帧 Present (核心 GPU-bound 信号)
eglSwapBuffers      61       944.3        15.48          GLES 提交完整一帧
waitForever         61       876.6        14.37          Present 后等下一帧信号
RenderLoop.Draw     729      228.5        0.31           实际绘制循环
ForwardRenderPass   363      172.8        0.48           前向渲染
OpaquePass          427      135.0        0.32           不透明 pass
```

**实现**:Provider 加 `_rhi_slice_stats(tp, rhi_utid, win)` 函数, 落到 `detail.perfetto.rhiSlices` 字段。报告 §7.2 自动填表。

**预计工时**:2-3 小时(参考 _aoe_hot_slices 写)。

---

### P0-2:业务模块子函数下钻 ⭐⭐ 中优先级

**问题**:v5.2 §6.3.1-6.3.4 子函数下钻仍然引用 v4 时期手工 SQL 数据(如 `TimeText.7 c=1423/帧`、`ProcessTask_MapEntityAdd 单次 max 3.42ms`), 不是从本次 trace 跑出。新数据上这些数字可能变化。

**需求**:Provider 在 callTrees 深度足够时(slice_max_depth 12+), 自动暴露 Top 4 红线模块的子函数列表(每个父节点的 children 已经在 callTrees 里, 只是没单独提取出来供报告引用)。

**实现选择**:
- (轻量)直接在报告侧从 `callTrees[].root` 找到 Top 4 模块路径, 列出其 children 即可 — **推荐**
- (重量)Provider 端单独建 `topModuleSubtrees` 字段, 把 BattleHeadMgr / MapSig / OutSide / MapCameraCtrl 的子树独立暴露

**预计工时**:轻量方案 0.5 小时(只是报告写法细节)。

---

### P0-3:GC.Alloc 全 callTrees 节点扩展 ⭐⭐ 中优先级

**问题**:当前 `gcAllocByModule` 只对 17 个 AOE_SLICE_PATTERNS 业务模块查 GC.Alloc, 范围太窄。

**需求**:扩展成"对 callTrees 中所有 totalPct ≥ 1% 的节点都查它子树下的 GC.Alloc 次数", 给出 Top 20 全 GC 归因 map。

**实现**:

```python
def _gc_alloc_by_calltree_node(tp, main_utid, win, callTrees, frame_count):
    # 遍历 callTrees, 对 totalPct >= 1% 的节点, 取它的 ts/dur 范围, 跑同 _gc_alloc_by_module 逻辑
    pass
```

落到 `detail.perfetto.gcAllocByCallTreeNode`。

**预计工时**:3-4 小时。

---

### P0-4:每帧 GC.Alloc 时序图 ⭐ 低优先级

**需求**:落 `gcAllocByFrame: [{frameIdx: 1, count: 23, totalMs: 0.45}, ...]`, 让分析能看到 GC 分配在哪些帧爆发(v4 §5.4 报的 thermal_2 上 GC.Collect 集中在 2 帧上的现象, 当前是手工 SQL 才能拿)。

**预计工时**:2 小时。

---

### P0-5:frame_timeline data source 启用 ⭐⭐ 中优先级

**问题**:v5.2 §-1.2 / §2 反复提到 `Choreographer 92.8fps vs PlayerLoop 16.9fps` 形态(屏幕节拍正常但业务跟不上), 这种状态下需要 `actual_frame_timeline_slice` 表才能精确判定每帧的 jank 类型(`AppDeadlineMissed / SurfaceFlingerCpuDeadlineMissed / ...`)。当前采集没启用这个 data source。

**需求**:
1. record_android_trace.py 改用完整 perfetto config 模式(不是 light config), 在 config 里加 `android.surfaceflinger.frametimeline` data source
2. Provider 端读 `actual_frame_timeline_slice` 表, 统计 7 种 jank_type 的占比

**复杂度**:需要重写 record_android_trace.py 的调用方式(从命令行参数模式 → -c <pbtxt> 模式), 工作量较大。

**预计工时**:6-8 小时(含 perfetto config 撰写 + record bat 改造 + Provider 解析)。

---

### P0-6:Provider 自动打标(读 aoe-watch-spec.yaml)⭐⭐⭐ 高优先级

**需求**:让 Provider 读 `references/aoe-watch-spec.yaml` 的 `systemLevelThresholds` 和 `moduleSingleCallRedlines`, 自动给 callTrees 节点 / aoeHotSlices 加 `severity` 字段(critical / warn / info), 报告侧直接用这个字段决定是否标 🔴🟡🟢。

**收益**:
- 报告生成时不再需要 AI 主观判断"哪些是红线"
- 阈值变更只改 YAML, 不改 Provider 代码
- AI 写报告时直接套模板 + 拿 severity 即可

**实现**:

```python
def _apply_thresholds(profile, watch_spec):
    # 读 watch_spec 系统级阈值, 给 system.* 字段加 severity
    # 读 watch_spec 业务模块单次红线, 给 aoeHotSlices / callTrees 节点加 severity
    pass
```

**预计工时**:4-5 小时。

---

## §2 P1:报告自动化(skill 级别)

### P1-1:复用验证 ⭐⭐⭐ 必做

**需求**:让 AI 仅基于 SKILL.md + perfetto-report-template.md + 三份新 trace, 重新生成一份 v5.3 报告, 与 v5.2 对照:

- 章节结构是否一致(§-1/§0/§3-§7/§9)
- 数字是否吻合(误差 < 5%)
- 视觉化资产是否到位(三处 ASCII)
- 结论质量(三大独立结论形态 + ROI 排序)

通过验证 = sediment 有效。

**预计工时**:2 小时(子 agent 跑 + 人工 diff 对照)。

---

### P1-2:报告生成 CLI 工具

**需求**:写 `scripts/generate-perfetto-report.py base/<dir> cur/<dir> throttle/<dir> --out report.md`, 自动调用:

1. 用 Provider 跑三份 → 三份 summary
2. 读三份 summary, 套模板填数据
3. 输出 v5.x 格式 markdown

**收益**:从"AI 手写报告"升级到"工具自动出报告 + AI 加润色"。

**预计工时**:8-12 小时。

---

### P1-3:跨次对比框架

**需求**:三份 trace 的对比逻辑(base/cur/throttle 三态演化)固化成代码:

- 自动生成 §6.2 缩进树的"[base / cur / throttle ms/帧]"列
- 自动检测"thermal-only 路径"(base/cur 占比 < 1%, throttle > 5%)
- 自动给出"瓶颈形态演化"判定(CPU-bound → 混合 → 等待型)

**预计工时**:4-6 小时。

---

## §3 P2:Web 平台集成

### P2-1:报告自动入库

`web/server/services/run-ingest-service.ts` 已经能把 `perfetto-profile.json` 入库, 但报告本身(`v5.x.md`)没入库。需求:把 markdown 报告也存到 Run.report 字段, 前端直接 render。

### P2-2:跨 Run 对比 UI

Web 端做"选 base/cur/throttle 三个 Run → 自动生成对比报告"的 UI 入口。

### P2-3:阈值表 YAML 编辑器

让产品经理 / 主美能直接编辑 `aoe-watch-spec.yaml`, 不用动代码。

---

## §4 P3:跨设备扩展

### P4-1:其他设备的 collection-manifest 适配

当前 collection-config-rationale.md 只覆盖 PAL-AL00 / 骁龙 888 / 华为非 root。其他设备(三星 Exynos / 联发科 / Pixel root)的 sysfs 可读性矩阵不同, 需要分别探测并落 `device-profile.{deviceModel}.json`。

### P4-2:simpleperf 互补 skill 集成

Wwise 内部 / 函数级 self% 这些 perfetto 不可见的, 走 simpleperf。两个 skill 之间需要打通(共享 PerfProfile 契约, 报告侧能引用对方的发现)。

---

## §5 优先级与执行顺序

| 阶段 | 任务 | 工时估算 | 触发条件 |
|---|---|---|---|
| **下一轮立即** | P1-1 复用验证 | 2h | v5.2 沉淀刚完成 |
| 下一轮立即 | P0-6 Provider 自动打标 | 4-5h | 阈值表已就位 |
| 下一轮立即 | P0-1 RHI 子函数下钻 | 2-3h | v5.2 §7.2 占位等填 |
| 短期 | P0-2 业务模块子函数 | 0.5h | 跟 P0-1 配套 |
| 短期 | P0-3 GC.Alloc 全树扩展 | 3-4h | — |
| 中期 | P0-5 frame_timeline 启用 | 6-8h | 解决 §2 屏幕节拍 vs PlayerLoop 不一致问题 |
| 中期 | P1-2 报告生成 CLI | 8-12h | 跨次对比框架 P1-3 之后 |
| 长期 | P2-1/2/3 Web 集成 | 各 4-8h | CLI 出来后 |
| 长期 | P4-1 跨设备适配 | 持续 | 拿到其他设备数据时按需 |

---

## §6 维护与演进流程

### 6.1 新数据触发的工作流

```
新设备 / 新场景 trace 到手
  ↓
1. 跑 record_aoeyz.bat → 出 sample_<stamp>/ 目录
2. 跑 build_perfetto_profile.py → 出 summary
3. AI 套 perfetto-report-template.md 生成报告
  ↓
报告产出 → 人审 → 发现新现象 / 新 bug
  ↓
4. 如果是数据 bug: 修 Provider, 更新 lessons-learned.md
5. 如果是新方法论: 更新 SKILL.md 的 M1-M4 (扩成 M5...)
6. 如果是新阈值: 更新 aoe-watch-spec.yaml
7. 如果是新章节: 更新 perfetto-report-template.md
```

### 6.2 沉淀边界

下面这些**不沉淀进 skill**:

- 单次报告里的具体数字
- 单次报告里的优化建议(场景特异)
- 单个设备的 sysfs 矩阵(放 device-profile JSON)

下面这些**沉淀进 skill**:

- 方法论(任何"未来再次遇到时应当怎么处理"的规则)
- 报告骨架结构
- 视觉化资产模板
- 阈值表 YAML
- 历史教训(防止重蹈覆辙)

### 6.3 反向不要做的事

- ❌ 不要把单次报告 v5.2 直接塞进 skill 当模板 — 太具体, 容易让下次 AI 抄数字而不是套结构
- ❌ 不要在 Provider 里硬编码 device 型号 — 用 collection-manifest.json 自适应
- ❌ 不要让 AI 即兴决定章节顺序 — 套 template, 强制结构一致
- ❌ 不要在 Provider 报告 message 里给"优化建议" — 那是 AI 解读层做的, Provider 只出数据

---

## §7 v5.2 之后的下一个里程碑:v6 自动化

完成 P0-1/P0-6 + P1-1/P1-2 后, 整条管线变为:

```
adb 设备插上 → 双击 record_aoeyz.bat × 3 (base/cur/throttle 三阶段)
  → 三份 sample_<stamp>/ 目录交平台
  → 后端 build_perfetto_profile.py × 3 自动跑 (后台 ~5 分钟)
  → generate-perfetto-report.py 套模板自动出 v6 报告
  → 平台前端 render markdown
  → 主美 / 性能优化人员直接看报告做决策
```

这条路径上 **AI 写报告变成可选(有 AI 加润色更好, 没有也能用)**, 整体性能分析进入工程化、自助化阶段。
