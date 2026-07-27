# R1 Spike 报告 — 骨架填空可行性验证

**日期**: 2026-06-30
**目的**: 验证 perfetto 报告改造方案的核心假设——给 LLM 一份骨架 markdown（表格 + bullet + LLM_FILL 占位符），LLM 是否能稳守"只填占位符、不动表格 / 不改 bullet / 不造数字"。

## 实验设置

- **骨架素材**: 现有 887 行三态报告的 §3.1 UnityMain 段（22 行，含 8 行 4 列表格 + 3 行 bullet + 2 个 LLM_FILL）
- **CLI**: codebuddy `-p` 模式，`-y --dangerously-skip-permissions --allowedTools "Read,Write,Edit,Bash,Grep"`
- **Prompt 注入方式**: stdin pipe（避开 Windows .cmd 长 prompt 截断风险）
- **重复次数**: 5 次独立调用

## 验收指标 & 结果

| 指标 | A1 | A2 | A3 | A4 | A5 | 通过率 |
|---|---|---|---|---|---|---|
| 表格逐字符不变（9 行 markdown 行） | ✅ | ✅ | ✅ | ✅ | ✅ | **5/5** |
| Bullet 三行逐字符不变 | ✅ | ✅ | ✅ | ✅ | ✅ | **5/5** |
| LLM_FILL 占位符全填（grep 残留=0） | ✅ | ✅ | ✅ | ✅ | ✅ | **5/5** |
| HTML 注释残留 ≤ 0 | ✅ | ✅ | ✅ | ✅ | ✅ | **5/5** |
| diff vs skeleton 行数 = 4（恰好 2 处替换） | ✅ | ✅ | ✅ | ✅ | ✅ | **5/5** |
| 叙事数字 token 全部命中骨架 | ✅ | ✅ | ✅ | ✅ | ✅ | **5/5** |
| 叙事主观质量（1-5 分） | 5 | 5 | 5 | 5 | 5 | 平均 5.0 |

**总通过率: 100%（5/5）**

## 5 次叙事数字 token 一致性

5 次输出的"形态演化"叙事中出现的数字 token 完全一致（顺序排序后完全相同）：
```
0.04% 0.91 ms 17.80 ms 20.40% 38.99% 5.83 ms 56.99% 77.82% 86.94%
```
说明 LLM 严格按 prompt 引用了表格内的 Running%（86.94/77.82/56.99）/ Sleeping%（20.40/38.99）/ Gfx.WaitForPresent 单次 avg（0.91/5.83/17.80）/ binder 占比（0.04%）。

## 叙事质量样本（A1 形态演化原话）

> base 阶段 Running% 高达 86.94%，主线程以 CPU 密集计算为主，Gfx.WaitForPresent 单次均值仅 0.91 ms；进入 cur 后 Running% 降至 77.82%、Sleeping% 升至 20.40%，GPU 等待开始显现，单次均值升至 5.83 ms，呈算力与等待混合态；throttle 阶段 Running% 跌至 56.99%、Sleeping% 进一步扩大至 38.99%，单次均值达 17.80 ms，主线程已演变为半睡眠型 GPU-bound 瓶颈。

跟金标准原句"base CPU-bound 健康（Running 87%，仅少量 vsync 等待）→ cur 算+等混合（Running 下降 9pp，Sleep 多出 8pp，Gfx.Wait 从 0.91ms 涨到 5.83ms）→ throttle 半睡型强 GPU-bound（Running 仅 57%，Sleep 39%，Gfx.Wait 17.8ms 超 vsync 周期）"相比，**信息密度持平、逻辑结构相同、覆盖三态完整**。

## 结论

✅ **R1 假设成立**：在 perfetto 报告骨架填空形态下，codebuddy CLI 跑 LLM 能稳守以下不变性：
- 表格 / Bullet 等"刚性结构"逐字符保留
- 占位符 100% 替换为业务叙事
- 叙事中的数字 100% 来自骨架，**无幻觉数字**
- 叙事质量贴近金标准

## 对后续工程的启示

1. **可以放心进入 Task #6（骨架渲染器）4-5 天工期**——核心假设已实证
2. **prompt 写法是关键变量**：本次 prompt 含 5 条 hard rule + self-check，LLM 严格服从。后续大规模 prompt（覆盖 §-1~§10 全报告）需保持同等约束密度
3. **stdin 注入有效**：1.4KB prompt 通过 stdin 传输无任何截断
4. **执行耗时可接受**：单轮 ~30-90 秒，后续整篇报告（~50 个占位符）预计 5-10 分钟

## 残留风险

1. **本 spike 只测了 1 段（22 行）**，全报告 800+ 行 + 50+ 占位符的规模下 LLM 是否仍 100% 守规矩，需 Task #6 落地后做整篇 e2e 验证
2. **本 spike 用了简单的"形态演化总结"任务**，未测试更难的任务卡片（如"§6.3 红线模块下钻 + ROI 排序"等需要业务判断的位置）
3. **未测试 prompt 中夹带项目特化白名单的注入效果**（C2 项目包剥离后才会用到）

这三个风险不阻塞 Task #6 启动，但需在 Sprint 1 末跑 e2e 时单独标定。

## 工件位置

```
.claude/skills/perfetto-trace-analysis/spike-r1/
├─ skeleton.md                骨架样本（22 行）
├─ prompt-template.txt        prompt 模板
├─ run-spike.sh                runner 脚本
├─ attempt_1/output.md         5 次输出
├─ attempt_2/output.md
├─ attempt_3/output.md
├─ attempt_4/output.md
├─ attempt_5/output.md
└─ R1-SPIKE-REPORT.md         本文档
```
