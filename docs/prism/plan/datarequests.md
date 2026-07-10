# Prism · DataRequest 需求池（F4 能力回路）

> 分析层反向驱动数据/采集层的正式需求清单（宪章 F4）。来源：Prism 探索时吐的 DataRequest + 人工补充。
> 高频复现 / 高价值的，优先固化为 provider 字段 / 新查询工具 / 采集改造。
> 状态：`open`（待办）/ `in-progress` / `done` / `wontfix`。

---

## DR-POOL-1 · per-marker GC.Alloc 字节数（采集层改造，高价值）

- **状态**：open（需 Unity 工程侧配合）
- **想要什么**：每个 marker 节点自己的 GC 分配字节数（不是整帧总量），用于定位"哪个函数/调用点在制造垃圾"。
- **为验证/解决什么**：GC.Collect / CollectIncremental 的**根因钥匙**——当前只能用整帧 gcAllocatedInFrame 判断"这帧是否分配高"，
  无法定位到具体分配源。有了它，能把"帧519 一次 70ms full GC"从"证伪临时分配触发"推进到"到底是谁累积了托管堆"。
- **数据在哪**：`.data`（Unity 原始采集，183MB）里有（RawFrameDataView/iterator 可取 GcAllocBytes），
  但**只能在 Unity Editor 内用 UnityEditor API 读**；Prism(Node/TS) 无法直接解析 .data 私有格式。
- **当前缺口**：导出器 `G:\AOEYZ_Trunk\AOE3D\Assets\Editor\Performance\PerfAnalyzerCounterExporter.cs` 的 ExtractMarkers
  每 marker 只抽 durationMS+depth，未抽 alloc；pdata schema v7 无 alloc 字段。
- **实施路径**：① 导出器 MyMarker 加 gcAlloc 字段 + ExtractMarkers 取 per-marker GcAllocBytes（按 Unity 版本确认 API）
  ② 扩 pdata schema（v8?）写入 alloc ③ 下游 TS parser（pdata-parser.ts readMarker）同步读 ④ 灌进 prism.sqlite 新列 ⑤ 加查询工具。
- **依据**：DR-20。

---

## DR-POOL-2 · per-marker 调用者/负载分布（Prism 自己提的，中价值）

- **状态**：open
- **想要什么**：某 marker 在不同调用路径下的耗时分布 + 单次负载（如 YzEntityMoveLineNtf 被哪类网络消息触发、单次消息实体数）。
- **为验证什么**：同帧同名 marker 两次实例耗时差 18 倍（帧273 的 0.74ms vs 13.26ms），想知道是不是消息内容（批量实体数）导致。
- **来源**：Prism 首轮探索自吐的 DataRequest（DR-16）。
- **备注**：部分可从现有明细按 parent_name 分组近似（调用者维度已有）；单次负载/消息内容不在 pdata 内，需采集层补。

---

## DR-POOL-3 · 逐帧 drawCall 数（低价值，有替代）

- **状态**：wontfix（有替代）
- **想要什么**：逐帧 drawCall 数。
- **现状**：counters.json 的 drawCalls 列全 null（此 Unity 版本未导出），但 **batches(177)/setPassCalls(139) 有值**，
  批次数比 drawcall 更能反映合批效果，够用。故不单独追加。
- **依据**：DR-18 数据核实。
