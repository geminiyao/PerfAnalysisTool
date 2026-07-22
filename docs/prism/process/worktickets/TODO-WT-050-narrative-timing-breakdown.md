# TODO-WT-050 · narrative timing 细化（llm_call 内部环节分解）

> 状态：TODO · 里程碑：M4 之后优化项 · 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：
> - WT-049 ✅（narrative timing log 已建，9 环节：start/precheck/prompt_inject/cli_resolve/llm_call/artifact_check/json_parse/provenance_check/red_team）
> - WT-046 v7 ✅（真实 timing 验证：llm_call 1,059,624ms 占 99.97%，是绝对大头，但当前只测到"spawn CLI 到进程退出"的总时间，没细分 LLM 推理内部）

## 背景

WT-046 v7 验收时用户问"LLM 的时间过长，可以继续细化 LLM 耗时在哪块么"。当前 `llm_call` 测的是 `runLlmOnce` 从 spawn CLI 子进程到子进程退出的总时间，包含：

1. CLI 进程启动 + 初始化（codebuddy/claude CLI 启动开销）
2. prompt 通过 stdin 传输（92KB prompt，传输时间）
3. LLM 推理（真正的 LLM 思考时间——这是大头？）
4. LLM 调 Write 工具写 narrative.json（工具调用开销）
5. CLI 清理 + 退出（进程清理时间）

**当前无法区分这 5 个环节各占多少**——如果 LLM 推理占 80%+，那 WT-049 的 JSON 修复回路是正确方向；如果 CLI 启动或工具调用占大头，可以优化那些环节。

## 关键发现（v7 验收时分析）

narrative-service.ts 的 `runLlmOnce`（:551-597）当前只收集 stdout 字符串：
```typescript
child.stdout?.on('data', (data: Buffer) => { stdoutBuffer += data.toString(); });
```

但 CLI 用 `--output-format stream-json`（:86, :92），输出是流式 JSON 事件（每行一个 JSON）。**explore-service.ts 已经在解析 stream-json 事件**（:811-833 `handleExploreStreamEvent`），可以把这个模式移植到 narrative-service.ts。

## 目标

把 `llm_call` 细分为 5 个子环节，写入 `narrativeProvenance.timing`：

| 子环节 | 测法 | 期望占比 |
|---|---|---|
| `cli_init` | spawn 到第一个 stream-json 事件 | ~1-5% |
| `llm_first_token` | 第一个事件到第一个 assistant text content | ~5-15% |
| `llm_stream` | assistant 事件累计时间（LLM 推理 + 流式输出） | ~70-85% |
| `tool_call_write` | LLM 调 Write 工具写 narrative.json 的时间 | ~5-10% |
| `cli_cleanup` | 最后一个事件到进程退出 | ~1-3% |

**保留原 `llm_call` 字段**（向后兼容），新增 5 个子环节字段。验收时看 `llm_stream` 是否占 80%+。

## 改哪些文件

- `web/server/prism/narrative-service.ts` — `runLlmOnce` 函数（:551-597）+ `runPrismNarrative` 的 timing 写入（:799-800）

## 具体要求

### 需求 A：runLlmOnce 解析 stream-json 事件 + 记录子环节时间

参考 explore-service.ts:811-833 的模式，把 `runLlmOnce` 的 stdout 处理从"收集字符串"改成"行解析 + 事件处理"：

```typescript
function runLlmOnce(...): Promise<LlmRunnerResult & { subTiming?: Record<string, number> }> {
  // ...
  const subTiming: Record<string, number> = {};
  const marks: Record<string, number> = {};
  const mark = (name: string) => { marks[name] = Date.now(); };
  const measure = (name: string, start: number) => { subTiming[name] = Date.now() - start; };

  let firstEventSeen = false;
  let firstAssistantTextSeen = false;
  let lastEventTime = Date.now();

  // spawn 后立即 mark
  mark('spawn');

  child.stdout?.on('data', (data: Buffer) => {
    jsonBuffer += data.toString();
    const lines = jsonBuffer.split('\n');
    jsonBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(trimmed);
      } catch {
        continue; // Non-JSON line
      }

      if (!firstEventSeen) {
        firstEventSeen = true;
        measure('cli_init', marks['spawn']); // spawn 到第一个事件
        mark('first_event');
      }
      lastEventTime = Date.now();

      // 解析事件类型
      const type = event.type as string;
      if (type === 'assistant') {
        const content = (event.message as Record<string, unknown>)?.content as unknown[];
        if (Array.isArray(content)) {
          for (const block of content) {
            const b = block as Record<string, unknown>;
            if (b.type === 'text' && !firstAssistantTextSeen) {
              firstAssistantTextSeen = true;
              measure('llm_first_token', marks['first_event']); // 第一个事件到第一个 text
              mark('llm_stream_start');
            }
            if (b.type === 'tool_use' && b.name === 'Write') {
              // LLM 调 Write 工具写 narrative.json
              mark('tool_call_write_start');
            }
          }
        }
      }
      if (type === 'user') {
        // tool_result 事件——Write 工具完成
        const content = (event.message as Record<string, unknown>)?.content as unknown[];
        if (Array.isArray(content)) {
          for (const item of content) {
            const r = item as Record<string, unknown>;
            if (r.type === 'tool_result' && marks['tool_call_write_start']) {
              measure('tool_call_write', marks['tool_call_write_start']);
              delete marks['tool_call_write_start'];
            }
          }
        }
      }
    }
  });

  child.on('close', (exitCode) => {
    // ...
    if (firstAssistantTextSeen) {
      measure('llm_stream', marks['llm_stream_start']); // LLM 推理 + 流式输出累计
    }
    measure('cli_cleanup', lastEventTime); // 最后一个事件到进程退出
    // 返回 subTiming
  });
}
```

**注意**：
- 保留原 `stdoutBuffer` 收集逻辑（兼容 mock LLM runner 注入的测试场景）
- `injectedRunner` 分支（:558-566）不需要改（mock LLM 没有 stream-json 事件）
- subTiming 是可选字段（`?`），mock LLM 测试时不返回 subTiming，真实 LLM 返回

### 需求 B：runPrismNarrative 写入 subTiming 到 provenance

在 `runPrismNarrative` 的环节 4（LLM 调用，:743-745）后，把 `llmResult.subTiming` 合并到 `timing` 对象：

```typescript
// 环节 4：LLM 调用
const t4 = Date.now();
const llmResult = await runLlmOnce(cliCommand, args, promptText, llmCtx, opts.llmRunner);
measure('llm_call', t4);

// WT-050: 把 llm_call 细分为 5 个子环节（cli_init/llm_first_token/llm_stream/tool_call_write/cli_cleanup）
if (llmResult.subTiming) {
  Object.assign(timing, llmResult.subTiming);
}
```

**向后兼容**：保留原 `llm_call` 字段（总时间），新增 5 个子环节字段。验收时看 `llm_stream` 是否占 `llm_call` 的 80%+。

### 需求 C：单元测试覆盖 subTiming

在 `narrative-service.test.ts` 加测试用例：
- 真实 LLM 场景（用 mock runner 模拟 stream-json 事件输出）→ 验证 subTiming 5 个字段都有值
- mock LLM 场景（injectedRunner 不返回 subTiming）→ 验证 timing 只有原 9 环节，无 subTiming 字段

## 禁止事项

- **不许改 explore-service.ts**（explore 的 stream-json 解析是参考模式，不动它）
- **不许改 narrative-prompt.txt / 模板文件**（本工单只改 timing 测量，不改 prompt）
- **不许改 harness.ts 的断言**（timing 细化是诊断字段，不阻塞验收）
- **不许删除原 `llm_call` 字段**（向后兼容，只新增子环节）

## 验收标准

1. 通用 harness 不退化（unity 240 PASS / 1 FAIL / 2 WARN，FAIL 是 v7 遗留的 §0 ② OnCameraMove，与本工单无关）
2. perfetto 不退化（239/2/1，2 FAIL 是 WT-037 遗留）
3. 单元测试全 PASS（原 34 + 新增 subTiming 测试用例）
4. 真实 LLM 跑一次 narrative，`narrativeProvenance.timing` 含 5 个子环节字段（cli_init/llm_first_token/llm_stream/tool_call_write/cli_cleanup）
5. `llm_stream` 占 `llm_call` 的比例 > 50%（确认 LLM 推理是大头）
6. 保留原 `llm_call` 字段（向后兼容）

## 验收 harness（必填，开发 agent 完成前自己跑通）

**通用 harness**：
```
cd web && npx tsx server/prism/harness.ts --source unity --dir data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7
```
期望：240 PASS / 1 FAIL / 2 WARN（不退化，FAIL 是 v7 遗留）

**单元测试**：
```
cd web && npx tsx server/prism/narrative-service.test.ts
```
期望：全 PASS

**真实 LLM timing 验证**（可选，如果时间允许）：
```
cd web && npx tsx server/prism/run-unity-pipeline.ts --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt050_timing
```
看 `narrativeProvenance.timing` 是否含 5 个子环节字段 + `llm_stream` 占比。

**perfetto 不退化检查**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
```
期望：239/2/1 不退化

## 完工报告

（开发 agent 填：改了什么、怎么自测的、有无偏离、subTiming 5 个字段的实际值 + llm_stream 占比）

## 验收结论

（主 agent 填：PASS / 打回+原因 + **必看 llm_stream 占比判断 LLM 推理是不是大头**）
