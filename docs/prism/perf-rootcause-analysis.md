# Prism 管线慢的根因分析（基于 raw stream 真实数据）

> 本文档是对 `perf-optimization-task.md` 根因分析的**修正与补充**。
> 原文档的几个关键判断被 raw stream 数据推翻，优化优先级需要重排。
>
> 数据来源：`web/data/prism-out/camera_ab_24072PX77C_20260723_194703/2026-07-24_11-56-38/`
> 分析脚本：`tmp-analyze.js`（根目录，可复跑）

---

## 一、原任务文档的错误判断（必须纠正）

### 错误 1：「LLM 决策思考 13.3 min，占 58%」

**实测**：explore 阶段 LLM 输出总耗时 **30.0 min**（不是 13.3 min），其中：

| 输出内容 | chars | ≈tokens | 占输出 token 比 |
|---------|-------|---------|---------------|
| **thinking（推理草稿）** | 144,417 | 36,104 | **62%** |
| tool_use input（工具参数） | 37,032 | 9,258 | 16% |
| text（给用户的话） | 6,753 | 1,688 | 3% |
| token 化开销（中文等） | - | ~11,075 | 19% |
| **合计 output_tokens** | - | **58,125** | 100% |

**真相**：62% 的输出 token 是 thinking。LLM 每轮工具调用前都写 2K-36K chars 的 thinking 自言自语，单轮最长 36,363 chars（6 分钟）。

### 错误 2：「工具执行只占 10%」

**实测**：工具执行（toolMs 总和）= 2.0 min，但**这不是瓶颈**。真正的瓶颈是 LLM 在等工具结果回来后，要花 100-360s 生成 thinking + 下一步工具调用。

而且 seq 1+2 是并发派发的（ts 几乎相同），说明 LLM 能并发调工具，工具执行时间被高估了。

### 错误 3：「上下文膨胀导致 LLM 思考慢」

部分正确，但**不是主因**。上下文从 43K→142K 确实导致 cache hit 率下降（L24 只有 18.2%），但：

- cache miss 影响的是 **prefill 时间**（输入处理）
- 真正的瓶颈是 **decode 时间**（输出生成），这是 token 速度决定的
- 即使 cache 100% 命中（L80: cacheR=137344/140069=98%），输出速度仍是 25-32 tok/s

### 错误 4：「6 个 30KB tool_result 占 180KB 上下文（73%）」

**实测**：input_tokens 从 43K 涨到 142K，涨了 99K。但其中：
- tool_result 累积：~99K tokens 里确实大部分是 tool_result
- 但 prompt 本身 40KB（文件字节）≈ 10K tokens（中文 3 字节/字，token 效率更高）
- 156 个工具定义 ~25KB ≈ 6K tokens

tool_result 是上下文膨胀主因没错，但**压缩 tool_result 对速度的提升有限**——因为瓶颈在输出 decode，不在输入 prefill。

---

## 二、真正的根因（数据证据）

### 根因 A：glm-5.2 输出速度 32-40 tok/s，是全局硬瓶颈

| 阶段 | 输出 tokens | LLM 耗时 | 速度 |
|------|-----------|---------|------|
| explore | 58,125 | 1800s (30min) | 32.3 tok/s |
| narrative | 30,883 | 771s (12.9min) | 40.1 tok/s |
| **合计** | **89,008** | **2571s** | **34.6 tok/s** |

**89K tokens × 34.6 tok/s = 42.9 min**，与实测 45.9 min（含工具 + 渲染）几乎完全吻合。

**结论**：管线慢 = 输出 token 太多 × 输出速度太慢。任何不减少输出 token 或不提升输出速度的优化，收益都有限。

### 根因 B：thinking 占输出 token 的 62%，且是"必要之恶"

explore 阶段 21 个 thinking block，总 144K chars。典型分布：

| 轮次 | thinking chars | 耗时 | 在想什么 |
|------|---------------|------|---------|
| L4（首轮） | 2,430 | 28.6s | 读 prompt，规划全景查询 |
| L10 | 6,988 | 71.1s | 分析 queryUnityMarkers 结果 |
| L14 | 10,871 | 114.7s | 分析 batch 结果，决定下钻方向 |
| L22 | 13,766 | 131.7s | 多个 marker 的交叉分析 |
| L26 | 20,325 | 186.0s | 深度分析 RecycleGOTask |
| L34 | 19,696 | 175.9s | 分析 LuaMgr 调用链 |
| **L38** | **36,363** | **359.4s (6min)** | **综合所有数据，准备写 findings** |

**关键**：thinking 越往后越长，因为 LLM 要把前面所有 tool_result 重新咀嚼一遍。这是 glm-5.2 的推理风格——靠长 thinking 保证质量。

**但 thinking 不计入 output_tokens 计费？错**。实测 L40 的 usage `out=11618`，而该轮 tool_use input 只有 175 chars。11618 tokens 几乎全是 thinking token。**thinking 是计入 output_tokens 的，是真正的耗时大头。**

### 根因 C：narrative 阶段 12 分钟 = 11.5K thinking + 30K narrative.json

narrative 的 L9 是单个 thinking block：46,132 chars（728.9s = 12.1 min）。LLM 在"打草稿"组织 narrative.json 结构，然后 L12 一次性 Write 出 28,481 chars 的 narrative.json。

**narrative.json 本体 30K tokens 是必要产出**（报告内容），但 11.5K thinking 是"草稿开销"。

### 根因 D：上下文膨胀导致 cache miss（次要因素）

explore 阶段 input_tokens 增长：

| 轮次 | input_tokens | cacheR | cacheC | cache hit % |
|------|-------------|--------|--------|-------------|
| L7（首轮） | 43,926 | 28,608 | 15,318 | 65.1% |
| L16 | 58,702 | 28,608 | 30,094 | 48.7% |
| L24 | 80,483 | 14,656 | 65,827 | **18.2%** |
| L28 | 92,585 | 28,608 | 63,977 | 30.9% |
| L40 | 114,878 | 80,448 | 34,430 | 70.0% |
| L80 | 140,069 | 137,344 | 2,725 | 98.1% |

cache miss 部分（cacheC）要按完整价格走 prefill。L24 的 65K cache miss 意味着那一轮要 prefill 65K tokens。但 prefill 速度通常远快于 decode，所以这是**次要因素**（预估贡献 2-3 min）。

### 根因 E：156 个工具定义加载（已修复，未验证）

baseline run 的 raw stream 第一行显示 156 个工具全加载（crashsight/garyUnityMCP/garyUnrealMCP 等 126 个 MCP 工具 + 30 个标准工具）。

代码已改为 `--tools Bash,Read,Write,Glob,Grep` + `--strict-mcp-config`（explore-service.ts:354-357），但**baseline 是改代码前跑的**，未验证效果。预估省 6K tokens/轮的输入，对 prefill 有帮助，对 decode 无影响。

---

## 三、优化方案重排（按真实收益排序）

### ★ 优化 1：减少 thinking 输出（预估省 8-15 min）—— 收益最大

**依据**：thinking 占 explore 输出 token 的 62%（36K/58K）。如果能砍掉一半 thinking，explore 从 30min → 15min。

**方案**（需实验验证，不能盲砍）：
1. **prompt 显式约束 thinking 长度**：在 explore prompt 加"每次工具调用前的思考不超过 200 字"——但风险是质量下降
2. **改用 non-thinking 模式**（如果 glm-5.2 支持 `thinking_budget` 参数）：直接限制 thinking token 预算
3. **结构化 thinking**：让 LLM 用固定格式（如"假设→验证→结论"三行）替代自由发挥

**验证方法**：
- 写单元测试：用 mock LLM runner 跑 explore，对比 thinking 长度和质量
- 跑 harness 验证报告质量不退化：`cd web && npx tsx server/prism/harness.ts --source unity --dir <run-dir>`
- 对比 findings.json 的 evidence 覆盖率（verifyFindings 通过率）

**风险**：thinking 是 glm-5.2 保证质量的手段，砍太多可能导致 findings 编造或漏判。必须对照标杆报告逐项核。

### ★ 优化 2：减少 narrative 的 thinking 草稿（预估省 5-6 min）

**依据**：narrative 的 L9 thinking 46K chars（11.5K tokens，12 min）。LLM 在"打草稿"组织 narrative.json。

**方案**：
1. **在 narrative prompt 里预置结构骨架**：把 narrative.json 的 section 结构直接给 LLM，让它"填空"而不是"从零组织"
2. **把 findings.json 的结构直接映射到 narrative sections**：减少 LLM 重新组织的认知负担

**验证方法**：对比 narrative.json 的结构完整性和可读性。

### ★ 优化 3：减少 explore 轮次（预估省 5-8 min）

**依据**：explore 有 22 轮工具调用，但其中：
- L43-L94（seq 10-22）是写完 findings 后的 13 次无用调用（读回验证、Grep 搜索、Edit 修改），浪费约 8 min
- 前 2-3 轮是固定的全景查询（queryUnityMarkers + scanPeakMarkers + scanMetricOverFrames）

**方案**：
1. **prompt 硬约束**："写完 findings.json 后立即结束，不要读回验证、不要 Edit、不要 Grep 自己写的文件"
2. **预计算初始查询**（原优化 B）：启动前预跑 queryUnityMarkers + scanPeakMarkers，注入 prompt，跳过前 2-3 轮

**验证方法**：对比工具调用次数和总耗时。

### 优化 4：压缩 tool_result（预估省 2-3 min）—— 收益有限

**依据**：6 个 batch 调用各返回 ~20-30KB，累积导致上下文从 43K→142K。但根据根因分析，**上下文膨胀主要影响 prefill（次要），不影响 decode（主要）**。

**方案**（原优化 A）：在 tools.cli.ts 的 batch 模式下对返回结果做摘要。

**验证方法**：对比 input_tokens 增长曲线和 cache hit 率。

**注意**：这个优化收益有限，优先级低于优化 1-3。但和优化 3 配合（减少轮次 + 减少每轮上下文）有叠加效果。

### 优化 5：验证 --tools 效果（预估省 1-2 min）

**依据**：代码已改，baseline 未验证。156→5 个工具定义，省 ~6K tokens/轮。

**方案**（原优化 E）：跑一次新 analysis，看 raw stream 第一行工具定义数量。

**验证方法**：对比 raw stream init 行的 tools 数组长度。

### 优化 6：同 runId 复用 findings（条件性，省 30 min）

**依据**：原优化 D。重复分析时跳过 explore。

**方案**：UI 加"快速重分析"按钮，跳过 explore 直接跑 narrative + render。

**实测**（perf-verify.ts [7]）：skipExplore 后耗时 14.1 min（narrative 12.9 + render 1.2），省 30 min。

**注意**：这是产品层面的优化，不解决首次分析慢的问题。

### 优化 7：explore prompt 精简（预估省 0.5-1 min）

**依据**：explore template 21.5KB，有 32 行分隔线、25 处"严禁/必须"护栏关键词，部分重复。

**实测**（perf-verify.ts [9]）：精简 15% 省 921 tokens（输入侧），对 output 无影响。

**方案**：合并重复的护栏说明，删冗余分隔线。

**风险**：低。护栏精简不能过头，否则 LLM 可能跑偏（读源码/改文件）。

### 优化 8：narrative 结构骨架预置（预估省 1.7-3 min）

**依据**：narrative thinking 46K chars（12 min），LLM 在"打草稿"组织 narrative.json 结构。

**实测**（perf-verify.ts [10]）：骨架预置预估减少 30% thinking = 3964 tokens，按 40 tok/s 省 99s（1.7 min）。

**方案**：在 narrative prompt 里把 findings → sections 的映射规则写死，减少 LLM 自己组织的思考。

**风险**：中。骨架写过头会退化成作文机（DR-49/50 已警告"纪律 vs 内容边界"）。

---

## 四、目标修正

| 场景 | 当前 | 原目标 | 修正后目标（基于根因） |
|------|------|--------|---------------------|
| 首次分析 | 45.9 min | < 20 min | **< 25 min**（优化 1+2+3+4+5 全做） |
| explore | 30 min | < 12 min | **< 15 min**（thinking 砍半 + 减轮次） |
| narrative | 12.9 min | < 8 min | **< 7 min**（thinking 草稿优化） |
| 重复分析（skipExplore） | 45.9 min | < 15 min | **< 15 min**（narrative + render） |

**原目标 < 20 min 不现实**：89K output tokens @ 35 tok/s = 42 min，要降到 20 min 需要砍掉一半输出 token，这会严重影响质量。修正目标 < 25 min 更合理。

---

## 五、验证方法论

### 单元测试验证（不动真实 LLM）

1. **mock LLM runner 测试**：用 `llmRunner` 注入（narrative-service.ts:52 已支持），mock 返回固定 thinking 长度的响应，验证 prompt 约束是否生效
2. **tool_result 摘要测试**：对 tools.cli.ts 的 batch 模式写单测，验证摘要后结果不含 frameIndices 等大数组
3. **prompt 解析测试**：验证 explore prompt 的 `{{MEMORY_INJECTION}}` 等占位符填充后的大小

### 集成验证（跑真实 LLM）

1. 每次优化后跑一次 full pipeline
2. 对比 `pipeline-timing.json` 的 explore/narrative 耗时
3. 用 `tmp-analyze.js` 跑 raw stream 分析，对比 thinking chars / output_tokens / cache hit 率
4. 跑 harness 验证报告质量：`cd web && npx tsx server/prism/harness.ts --source unity --dir <run-dir>`
5. 对照标杆报告（v5.3/v4）逐项核 findings 覆盖率和叙事可读性

### 关键指标 dashboard

每次优化后记录：
- 总耗时 / explore 耗时 / narrative 耗时
- output_tokens 总数（explore + narrative）
- thinking chars 总数
- 平均输出速度 tok/s
- cache hit 率
- 工具调用次数

---

## 六、关键数据文件索引

| 文件 | 用途 |
|------|------|
| `web/data/prism-out/.../2026-07-24_11-56-38/pipeline-timing.json` | 三阶段精确计时 + 22 次工具调用明细 |
| `web/data/prism-out/.../2026-07-24_11-56-38/explore-raw-stream.jsonl` | explore 阶段完整 LLM stream（95 行，587KB） |
| `web/data/prism-out/.../2026-07-24_11-56-38/narrative-raw-stream.jsonl` | narrative 阶段完整 LLM stream（20 行，167KB） |
| `web/data/prism-out/.../2026-07-24_11-56-38/ledger.json` | 工具调用明细（208KB） |
| `web/server/prism/perf-verify.ts` | 各优化点耗时/省 token 实测脚本 |
| `web/server/prism/quality-verify.ts` | 各优化点质量影响验证脚本 |

---

## 七、实测数据汇总（perf-verify.ts + quality-verify.ts）

### 7.1 各优化点耗时与省 token 实测

| 优化点 | 省时间 | 省 output tokens | 省 input tokens | 风险 |
|--------|--------|-----------------|----------------|------|
| A. --tools 排他 | 1-2 min | 0 | 28000 | 无损 |
| B. 禁止写完 findings 后验证 | 5-8 min | ~8000 | 0 | 低 |
| C. skipExplore 复用 findings | 30 min | 0（跳过 explore） | 0 | 无损 |
| D. thinking 约束到 2000 chars | 17.6 min | 33701 | 0 | **高** |
| E. narrative thinking 砍半 | 2.8 min | 6607 | 0 | 中 |
| F. tool_result 摘要 | 2-3 min | 0 | 24069 | 中 |
| G. narrative 结构骨架预置 | 1.7 min | 3964 | 0 | 中 |
| H. explore prompt 精简 | 0.5-1 min | 0 | 921 | 低 |

### 7.2 baseline findings 质量基线

| 质量维度 | baseline 实测 |
|---------|--------------|
| findings 数量 | 8 |
| evidence 覆盖率 | 100%（8/8 有 evidence） |
| 平均每条 evidence 数 | 3.1 |
| 总 reasoning chars | 3479（平均 435/条） |
| selfCritique 覆盖率 | 88%（7/8 有 selfCritique） |
| 总 recommendation chars | 1719（平均 215/条） |
| 总 symbols 数 | 23 |
| 总 tags 数 | 21 |

### 7.3 高风险优化（D：thinking 约束）的质量退化模拟

| 质量维度 | baseline | 模拟约束后 | 退化 |
|---------|----------|-----------|------|
| reasoning chars | 3479 | 1740（-50%） | -1739 chars |
| selfCritique 覆盖 | 7/8 | 4/8（-50%） | -3 条丢失 |
| recommendation 变套话 | 0 | 2 条（30%） | -2 条 |
| evidence 数量 | 25 | 25 | 0（不受影响） |

**关键结论**：thinking 约束（优化 D）虽然能省 17.6 min，但会导致：
- reasoning 浅化（丢失"分母陷阱"等自审能力，DR-27 实证）
- selfCritique 覆盖率从 88% 降到 50%
- 30% 的 recommendation 退化为套话

**优化 D 必须用 A/B test 验证**：同数据跑两次（有/无 thinking 约束），对比 findings 质量。不能盲上。

### 7.4 组合方案预估

| 组合 | 首次分析 | 重复分析 | 质量风险 |
|------|---------|---------|---------|
| 低风险（A+B+C+H） | 37-41 min | < 15 min | 无损 |
| 中风险（A+B+C+E+F+G+H） | 32-38 min | < 15 min | 中（需验证 narrative 质量） |
| 高风险（全做含 D） | 14-28 min | < 15 min | 高（需 A/B test 验证 findings 质量） |

### 7.5 验证脚本用法

```bash
# 测量各优化点耗时和省 token
cd web && npx tsx server/prism/perf-verify.ts

# 验证各优化点对质量的影响
cd web && npx tsx server/prism/quality-verify.ts

# 验证指定 run 的质量
cd web && npx tsx server/prism/quality-verify.ts --dir data/prism-out/<run-dir>

# 跑 harness 验证报告结构契约
cd web && npx tsx server/prism/harness.ts --source unity --dir <run-dir>
```

---

## 八、给接手 agent 的建议

1. **先跑优化 A**（验证 --tools 效果）：成本最低，1 次跑就能验证，无损
2. **再跑优化 B**（prompt 约束写完 findings 后不验证）：改 prompt，1 次跑验证，低风险
3. **做优化 C**（skipExplore UI）：产品层面，重复分析省 30 min，无损
4. **然后实验优化 E+G**（narrative thinking + 骨架）：中风险，对照标杆报告验证
5. **优化 F**（tool_result 摘要）：和 B 配合有叠加效果
6. **优化 D**（thinking 约束）最后做：风险最高，必须 A/B test

**每次优化后必跑**：
- `npx tsx server/prism/perf-verify.ts` — 确认耗时数据
- `npx tsx server/prism/quality-verify.ts` — 确认质量不退化
- `npx tsx server/prism/harness.ts --source unity --dir <run-dir>` — 确认结构契约

**不要盲信本文档的数字**：本文档基于 1 次 baseline run，建议接手后先跑 1 次新 baseline（带 --tools 修复），用 `perf-verify.ts` 重新分析，建立对比基线。
