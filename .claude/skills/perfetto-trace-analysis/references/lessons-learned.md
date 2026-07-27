# 历史教训 · 报告与 Provider 演进中踩过的 6 个大坑

> 本文件给后续 AI / 开发者**警示**:这 6 个 bug 已经修过, 请不要再犯。
> 配套:[SKILL.md M1-M4 方法论](../SKILL.md) · [perfetto-report-template.md 模板反模式](perfetto-report-template.md#反模式must-not)

---

## 教训 #1:atrace LIKE 全 trace 高估业务模块 4.6× (v5 核心错误)

**故事**:v5 报告里 §0 第 2 条结论说 "**MapSig cur 占整 trace 23.43%(4676ms)**", 这个数字让所有读者都以为 MapSig 是头号瓶颈。

**真相**:用 callTrees 父子链直接读, **MapSig 真实只有 1011ms 占整 trace 5.06%**。差距 4.6 倍。

**根因**:v5 用 `aoeHotSlices` 字段, 它是 `slice.name LIKE '%MapSignificanceMgr%'` 全 trace 累加。这个 LIKE 命中:
- MapSig 在 `OnUpdate` 路径下出现一次 atrace slice
- MapSig.sampler_OnUpdate 子 slice 也带前缀 → 命中 +1
- MapSig.ProcessTasks / EntityTask 等更深的子也带前缀 → 命中 +N
- 最后变成"父 + 所有子"的累加, **跨多层重复计数**

类似规模的高估:
- BattleHead cur 1774ms → 真实 890ms (×2)
- MapCameraCtrl thermal 3158ms → 真实 961ms (×3.3)

**修复**(v5.1 / v5.2):用 `callTrees` 父子链, 沿 `PlayerLoop > Update.ScriptRunBehaviourUpdate > BehaviourUpdate > Core.Update > CS:AOE.LuaMgr > LuaMgr.OnTick&UpdateSchedule > MapSignificanceMgr` 路径找节点, 直接读节点 totalMs。Provider 同时输出 `selfMs`(父 - 直接子)做剥洋葱。

**警示**:
- **永远不要**用 atrace LIKE 全 trace 累加做"模块占帧消耗"判断
- `aoeHotSlices.totalMs` 仅做"模块全 trace 触发频次"参考(count 用得上, totalMs 不要直接当占帧)
- 占帧消耗用 callTrees + selfMs

---

## 教训 #2:wait wrapper 父子双重计数(v5.1 残留 bug)

**故事**:v5.1 跑通后发现 throttle3 上 `WaitForPresent` 累计 16099ms 占整 trace 80.64%, 几乎超出整个 trace 的合理性 — 主线程不可能 80% 时间都在等 GPU。

**真相**:`WaitForPresent` 和 `Gfx.WaitForPresent` 是同一个语义:
- `WaitForPresent` — 父 slice, 包含 sleep 段
- `Gfx.WaitForPresent` — 子 wrapper, 每帧一次

aoeHotSlices LIKE 同时命中两条同语义 slice, 在 selfMs 计算时没建立父子关系 → 双重计数。

**修复**(v5.2 _peel_onion):

```python
PARENT_OF = {
  ...
  "Gfx.WaitForPresent": "WaitForPresent",  # v5.2 新加这一行
}
```

修后 throttle3 实际:`WaitForPresent self = 7610ms`(等于 Gfx.WaitForPresent 7600ms, 不再翻倍)。

**警示**:
- 报告里给"主线程实际等 GPU 时长"指标, **优先用 `Gfx.WaitForPresent.totalMs`**(它是 self, 且每帧一次语义清晰)
- 不要把 `WaitForPresent` 和 `Gfx.WaitForPresent` 一起加, 会双计

---

## 教训 #3:binder serverProcess 永远是 null(v5.1 SQL 错)

**故事**:v5.1 Provider 加了 `INCLUDE PERFETTO MODULE android.binder` 想拿主线程 binder 调用的对端进程, 但所有 trace 跑出来 `byServerProcess.serverProcess` 都是 null。

**真相**:v5.1 SQL 走 `server_utid → upid → process.name` 这条链:

```sql
JOIN thread t ON t.utid = txn.server_utid
JOIN process proc ON proc.upid = t.upid
SELECT proc.name server_proc
```

但 `server_utid → upid` 关联在某些短期 binder 服务端线程上**会丢**(特别是 system_server 子线程, upid 注册晚于 binder 事件), 导致 join 后 proc.name 取到 null。

**修复**(v5.2):用 `server_pid` 直接反查 `process.name`(process 表上 pid 总有, 偶尔 name 为 null 时退化到 `pid=N`):

```sql
SELECT
  COALESCE(p.name, 'pid=' || txn.server_pid) server_proc,
  txn.server_pid pid,
  ...
FROM android_binder_txns txn
LEFT JOIN process p ON p.pid = txn.server_pid
```

修后实测:throttle24 拿到 **system_server (pid=1873)**, base24/cur24 拿到 `pid=1873`(name 注册晚, 但至少不是 null 而是可读 pid)。

**警示**:
- perfetto 表 join 链长则 null 风险高
- `process.name` 字段对内核线程 / 系统服务可能为 null, 必须 COALESCE 退化
- 优先用 `pid` 字段(总有), 不要走 utid → upid 多跳

---

## 教训 #4:PlayerLoop 多重嵌套导致 callTrees 主树缺失(v5.2 中途发现)

**故事**:用新 record_aoeyz.bat v2 采的第一份 trace 跑 Provider, 主线程 `callTrees` 只剩 `UnityGfxRenderS` 那棵, **UnityMain 主线程的 PlayerLoop 整棵树消失了**!

**真相**:那份 trace 里主线程上的 atrace slice 因为 begin/end 在不同帧间跨界配对错乱, 出现"父 PlayerLoop 嵌套子 URP.RenderCameraStack 又嵌套子 PlayerLoop 又嵌套..."的诡异祖先链。我的 `_slice_tree` 用 `parent_id IS NULL` 找 root, 1394952 slice 中只有 7 个孤儿小 slice(dur 都 < 1ms)被当成 root, **真正的 PlayerLoop 们全成了某个孤儿的孙子辈**, 树聚合后 totalPct 太低被剪枝, 返回空 list。

**修复**(v5.2 _slice_tree):加白名单**升级 root 判定**:

```python
KNOWN_TOP_LEVEL = {
    "PlayerLoop",
    "Update.ScriptRunBehaviourUpdate", "PreLateUpdate.ScriptRunBehaviourLateUpdate",
    "PostLateUpdate.FinishFrameRendering", "PostLateUpdate.PlayerUpdateCanvases",
    "InitializationSystemGroup", "SimulationSystemGroup", "PresentationSystemGroup",
    ...
}
# 名字命中 KNOWN_TOP_LEVEL 的 slice, 即使有 parent_id 也作为 root, 同时从原 children_of 列表中移除避免重复
```

修后 PlayerLoop 主树正常出, count 684 totalMs 11368ms, 一切正常。

**警示**:
- atrace 的 begin/end 配对**不保证完美**, 跨帧嵌套是合法但不可预测的形态
- 不要假设 root = `parent_id IS NULL`, Unity Engine atrace 在某些版本/某些采集条件下会让根 slice 跨多层嵌套
- 用业务名字白名单升级 root 是更稳的做法

---

## 教训 #5:ECS Worker LIKE 模式漏空格(v5.2 中途发现)

**故事**:v5.2 第一次跑新 Provider, base/cur/throttle 三份都说 "ECS Worker 0 个识别到", 但人工查 trace 明明 cur 上有 Thread-135/137/138/139 四个 Worker 在跑 `xxxSystem:xxxJob (Burst)` slice。

**真相**:Unity Burst Job slice 的实际名字是 `OutsideLineCtrl:CalculateVertexJob (Burst)` — **`Job` 和 `(Burst)` 之间有一个空格**! 我的 LIKE 模式写成了 `'%Job(Burst)%'` 没空格, 当然命不中。

**修复**(v5.2):

```python
cands = _utids_running_slice(tp, ["%Job (Burst)%", "%Job(Burst)%"], target_pid, ...)
#                                       ^ 有空格        ^ 兼容假设无空格
```

修后实测识别到 4 个 Worker 全员到位。

**警示**:
- atrace slice 名称的细节空格 / 标点直接影响 LIKE 模式
- 实测 LIKE 模式应当**先在 trace_processor 直接查一次**确认存在, 再写进 Provider 代码
- 多模式 OR 兼容(带空格 + 不带空格)是稳妥做法

**附加 bug**:LIKE 模式修对后 ECS Worker 把 RHI(tid=10311 Thread-103)也匹了进去, 因为 RHI 也跑少量 Burst Job(595 个 vs Worker 19000+)。修法是给 `_identify_ecs_workers` 加 `exclude_utids` 参数, 排除已识别的 RHI / LuaMtGC / 主线程 utid。

---

## 教训 #6:cur 高温段降频判定漏判(v5.2 中途发现)

**故事**:v5.2 第一次跑三份, base 是 likely / throttle 是 likely, **cur 反而是 none** — 反直觉, cur 介于 base 和 throttle 之间不可能反而最弱。

**真相**:cur 阶段温度 79.8 → 79.0°C(Δ -0.8°C, **温度负 Δ + 起点已饱和**), 我代码里 `_throttling` 的判定要求"主线程 Run ≥ 80%"+ "reach < 80%"才能 suspected, cur Run 77.82% 不满足前条 → suspected=False → 即使温度阈值触发也走 else → none。

**真实情况**:cur 起点温度 79.8°C 本身就严重过 75°C 高温警戒, 应该独立触发 likely。

**修复**(v5.2 改判级逻辑):

```python
# 高温独立信号 (即使频率没明显被压, 高温本身就是 likely)
high_temp = (thermal_block["after"] >= 75)
if high_temp:
    level = "likely"
    evidence.append("[likely] 采后温度 >= 75°C; 即使本采样段 reach% 尚可, 热预算紧, 后续段大概率降频。")
```

修后 cur 升 likely, 三份统一 likely。

**警示**:
- 降频判定不能只看"频率信号 + 温度上升"双信号, 还要考虑"温度起点已经爆表但本段没继续涨"的情况
- 高温起点 + 0 增量 = "SoC 已经主动降频在压温度"的硬证据(温度不再涨 = 降频生效), 这种情况比"温度还在涨"更说明问题
- 判定逻辑应当多组合:`high_temp_alone || (suspected + thermal_signal) || severe_low_freq_alone`

---

## 总结:6 条教训背后的根方法论

| 教训 | 教训背后的方法论 | 写在哪 |
|---|---|---|
| #1 LIKE 高估 | callTrees 优先, atrace LIKE 慎用 | SKILL.md M1 |
| #2 wait wrapper 双计 | 同语义 slice 必须建父子关系去重 | SKILL.md M4 |
| #3 binder null | perfetto 表 join 链长则 null 风险高, 用 pid 直接反查 | (这条偏 Provider 实现细节, 没专门写) |
| #4 PlayerLoop 嵌套 | atrace begin/end 不保证完美配对, root 识别用业务名字白名单 | (这条偏 Provider 实现细节) |
| #5 LIKE 漏空格 | atrace slice 名细节决定一切, 先实测再写 LIKE | SKILL.md M3 |
| #6 cur 漏判 | 降频判定多组合(温度起点 + 增量 + 频率), 不要单一规则 | SKILL.md M2 |

**最大的元教训**:沉淀到 skill 之前, 先**写错一两个版本是必要的**(v5 的错误数据→v5.1 修业务模块→v5.2 修线程识别)。如果直接奔着完美做, 这 6 个 bug 都不会暴露。

下次遇到新设备 / 新场景, 应当**仍按这种"先写, 跑, 看异常, 再修"的迭代节奏**, 不要假装一次就到位。
