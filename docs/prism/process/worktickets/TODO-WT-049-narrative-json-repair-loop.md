# TODO-WT-049 · BK-7 方向 A·narrative JSON 修复回路（v7 前置）

> 状态：TODO ｜ 里程碑：M5 善后（探索成本治理·A）｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：WT-046 v6 验收部分 PASS（FAIL C 平移到 §0 ② URP，记遗留 v7）。v6 重跑 6 次 narrative 只成功 1 次，5 次非法 JSON（raw `"` 在字符串值里 / 未转义换行 / 超时），每次 10-30 分钟，成本失控。**v7 重跑 narrative 前必须先修这个工单**——否则 v7 同样会重跑 6 次才成功 1 次，无法稳定迭代。
>
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§七三段管线 + §八占位符填充）+ 本工单"v6 重跑 6 次失败记录"节

## 背景

WT-046 v6 重跑 narrative 6 次，前 5 次失败，第 6 次成功：

| 次数 | 结果 | 失败原因 |
|---|---|---|
| 1 | 失败 | 超时（10min timeout 太短） |
| 2 | 成功 | narrative OK，harness 2 FAIL（§0 ② URP 子 pass ms + §0 ③ 排序变） |
| 3 | 成功 | narrative OK，harness 1 FAIL（§0 ② 相机移动子节点 56.4ms） |
| 4 | 失败 | narrative JSON 非法（raw `"` 在字符串值里） |
| 5 | 失败 | narrative JSON 非法（同 4） |
| 6 | 成功 | narrative OK，harness 2 FAIL（§0 ② URP + §3 下钻 ② URP 重复） |

**痛点**：
1. **重跑成本失控**：6 次才成功 1 次，每次 10-30 分钟，总共 1-3 小时
2. **非法 JSON 频发**：LLM 在 ASCII 图多行内容里用 raw `"` 和未转义换行，导致 JSON 序列化失败
3. **没有修复回路**：当前 narrative-service.ts:595 `JSON.parse(raw)` 失败直接返回错误，没有"提取错误位置 + 反馈给 LLM 重试"的机制
4. **v7 无法稳定迭代**：v7 要修 §0 ② URP 重复，必须重跑 narrative，但当前架构下重跑 6 次才成功 1 次，无法稳定验证 prompt 约束改动

**根因**：narrative-service.ts 没有 JSON 修复回路——LLM 产出非法 JSON 时，应该自动提取错误位置 + 反馈给 LLM 重试（最多 2 次），不是"重跑整个 narrative"。

## v6 重跑 6 次失败记录（开发 agent 必读）

**v6 工单完工报告摘录**：

> 本工单重跑了 6 次 narrative：
> - 第 1 次：超时（10min timeout 太短）
> - 第 2 次：narrative OK，harness 2 FAIL（§0 ② URP 子 pass ms + §0 ③ 排序变）
> - 第 3 次：narrative OK，harness 1 FAIL（§0 ② 相机移动子节点 56.4ms）
> - 第 4 次：narrative JSON 非法（raw `"` 在字符串值里）
>
> 第 3 次的状态最好（1 FAIL）。让我恢复第 3 次的 narrative.json，接受那个 FAIL，在完工报告里说明。
>
> 但第 3 次的 narrative.json 已经被第 4 次覆盖了。看下有没有备份：
>
> narrative.json 是 20:59（第 4 次），report.html 是 20:46（第 3 次的 render）。第 4 次 narrative 失败后没重跑 render，所以 report.html 还是第 3 次的。
>
> 但 narrative.json 是第 4 次的（非法 JSON）。需要恢复第 3 次的 narrative.json，或者重跑第 5 次。
>
> 让我重跑第 5 次 narrative，希望 LLM 这次产出合规 JSON。

**关键观察**：
- 非法 JSON 主要在 ASCII 图多行内容里——LLM 用 raw `"` 和未转义换行，JSON 序列化失败
- 重跑不一定成功——第 4/5 次都失败，第 6 次才成功
- **加更强 prompt 约束会让非法 JSON 更频繁**——v6 开发 agent 试过加"即使是父模块自身的具体帧单帧数字也不许讲"，结果 LLM 在 ASCII 图里用了更多 `"` 和换行，第 4-5 次失败，已回退

## 必读文档

- `web/server/prism/narrative-service.ts` 第 540-630 行——LLM 调用 + JSON.parse + 错误处理
- `web/server/prism/explore-service.ts`——explore 阶段也有 LLM 调用，可参考其错误重试机制（如有）
- `docs/prism/memory/dev/conventions.md` §七三段管线——narrative 是第二段，narrative.json 必须是 LLM 产的
- `web/server/prism/harness.ts`——验收 harness，加 JSON 修复回路断言

## 任务

### 需求 A：narrative-service.ts 加 JSON 修复回路

**文件**：`web/server/prism/narrative-service.ts`

**当前架构**（第 540-630 行）：

```
spawnCliProcess(cliCommand, args) → child process
  → child.stdin.write(promptText)  // LLM 通过 stdin 拿 prompt
  → child.stdout.on('data') 累积 stdout
  → child.on('close') 检查 exitCode + narrative.json 存在 + JSON.parse(raw)
    → 失败：makeNarrativeError（直接返回错误，无重试）
    → 成功：runNarrativeRedTeam + 写 narrative.json
```

**改动**：在 `child.on('close')` 里 `JSON.parse(raw)` 失败时，加修复回路：

```ts
child.on('close', (exitCode: number | null) => {
  // ... 原有 exitCode / narrativePath 检查 ...

  // 读并校验 narrative.json
  try {
    const raw = fs.readFileSync(narrativePath, 'utf-8');
    const narrative = JSON.parse(raw) as NarrativeReport;
    // ... 原有 provenance 校验 + redTeam ...
  } catch (parseError: any) {
    // ★ 新增：JSON 修复回路
    // 1. 提取错误位置（JSON.parse 错误信息含 line/column）
    // 2. 构造修复 prompt：原 prompt + "上次产出 JSON 解析失败：{错误信息}。错误位置附近：{raw 片段}。请修复并重新产出完整 narrative.json"
    // 3. 重跑 LLM（最多 2 次）
    // 4. 仍失败 → makeNarrativeError
    // 5. 成功 → 继续原有 provenance 校验 + redTeam
    return attemptJsonRepair(raw, parseError, /* retry 0/2 */);
  }
});
```

**修复回路实现要点**：

1. **提取错误位置**：`JSON.parse` 错误信息含 `position` 或 `line:column`，提取出来
2. **截取错误附近 raw 片段**：错误位置前 200 字符 + 后 200 字符，让 LLM 看到错误上下文
3. **构造修复 prompt**：原 prompt + 修复指令（"上次产出 JSON 解析失败：{错误信息}。错误位置附近：{raw 片段}。请修复并重新产出完整 narrative.json，不要产出部分 JSON，必须产出完整可解析的 JSON"）
4. **重跑 LLM**：用相同 cliCommand + args，新 stdin 是修复 prompt
5. **最多 2 次重试**：避免无限循环。2 次后仍失败 → makeNarrativeError
6. **成功时记录修复次数**：写入 `narrativeProvenance.repairCount` 字段（验收时看修复回路是否真的接住了非法 JSON）

**注意**：
- 修复回路是"重跑 LLM"，不是"脚本修复 JSON"——脚本修复 JSON 违反 DR-44（narrative.json 必须是 LLM 产的）
- 修复 prompt 必须包含原 prompt（让 LLM 知道要产什么）+ 错误信息 + 错误位置附近 raw 片段
- 修复回路不改变 narrative.json 的 schema——还是同一个 NarrativeReport 结构
- 修复回路不影响红队回路——成功后继续 runNarrativeRedTeam

### 需求 B：narrativeProvenance 加 repairCount 字段

**文件**：`web/server/prism/narrative-types.ts`

**改动**：`NarrativeProvenance` interface 加可选字段 `repairCount?: number`：

```ts
export interface NarrativeProvenance {
  generatedBy: 'LLM';
  // ... 原有字段 ...
  repairCount?: number;  // WT-049: JSON 修复回路重试次数（0 = 一次成功，1-2 = 修复过）
}
```

**理由**：验收时看修复回路是否真的接住了非法 JSON——如果 repairCount > 0，说明 LLM 第一次产出非法 JSON 被修复回路接住了，不是"LLM 一次产出合规 JSON"。

### 需求 C：harness 加 JSON 修复回路断言

**文件**：`web/server/prism/harness.ts`

**改动**：在 [2] 节加 [2d] 节（或合适位置），断言修复回路机制存在：

```ts
// ─────────────────────── 2d. JSON 修复回路断言（WT-049） ───────────────────────
// DR-44: narrative.json 必须是 LLM 产的。LLM 产出非法 JSON 时，修复回路应自动重试，不是直接失败。

console.log('\n[2d] JSON 修复回路断言（WT-049: narrative.json 非法时自动重试）');

// 2d-1. narrative-service.ts 有修复回路代码
const narrativeServiceSrc = fs.readFileSync(path.join(__dirname, 'narrative-service.ts'), 'utf-8');
assert(/attemptJsonRepair|repairJsonLoop|jsonRepairLoop|JSON.*repair/i.test(narrativeServiceSrc),
  'narrative-service.ts 有 JSON 修复回路函数（attemptJsonRepair 或类似）');

// 2d-2. 修复回路有最多重试次数（不是无限循环）
assert(/maxRetries|maxAttempts|retry.*[12]\b|attempts.*[12]\b/i.test(narrativeServiceSrc),
  'narrative-service.ts 修复回路有最多重试次数（≤2，防无限循环）');

// 2d-3. 修复回路是"重跑 LLM"不是"脚本修复 JSON"
assert(/spawnCliProcess|callLLM|runLLM/i.test(narrativeServiceSrc),
  'narrative-service.ts 修复回路是重跑 LLM（不是脚本修复 JSON，违反 DR-44）');

// 2d-4. narrativeProvenance 有 repairCount 字段
const narrativeTypesSrc = fs.readFileSync(path.join(__dirname, 'narrative-types.ts'), 'utf-8');
assert(/repairCount\??\s*:/.test(narrativeTypesSrc),
  'narrative-types.ts NarrativeProvenance 有 repairCount 字段');

// 2d-5. 修复回路成功时记录 repairCount（不是 0 次修复就成功）
assert(/repairCount\s*=|repairCount\s*:/i.test(narrativeServiceSrc),
  'narrative-service.ts 修复回路成功时记录 repairCount（验收时看修复回路是否真的接住了非法 JSON）');
```

### 需求 D：单元测试覆盖修复回路

**文件**：`web/server/prism/narrative-service.test.ts`（新建或扩展）

**测试用例**：

1. **正常路径**：LLM 产出合规 JSON → 修复回路不触发 → repairCount=0
2. **非法 JSON 1 次修复**：LLM 第 1 次产出非法 JSON（mock `JSON.parse` 抛错）→ 修复回路触发 → 第 2 次 LLM 产出合规 JSON → repairCount=1
3. **非法 JSON 2 次修复失败**：LLM 第 1/2/3 次都产出非法 JSON → 修复回路触发 2 次 → 仍失败 → makeNarrativeError
4. **修复 prompt 含原 prompt + 错误信息**：mock LLM 调用，检查 stdin 收到的修复 prompt 含原 prompt 内容 + "JSON 解析失败" + 错误位置附近 raw 片段

**注意**：
- 测试用 mock LLM（不真跑 LLM），mock `spawnCliProcess` 返回预设的 stdout / narrative.json
- 测试要快（< 5 秒），不能真跑 LLM
- 参考 explore-service.test.ts 的 mock 模式（如有）

## 硬约束

1. **三段管线硬契约**（DR-44 + dev-conventions.md §七）：本工单改 narrative-service.ts + narrative-types.ts + harness.ts + 新建测试，**不改 explore-service / render-html.ts / prompt 文件 / 模板文件**
2. **修复回路是"重跑 LLM"不是"脚本修复 JSON"**：DR-44 规定 narrative.json 必须是 LLM 产的。脚本修复 JSON 违反 DR-44——脚本只能提取错误位置反馈给 LLM，让 LLM 重新产出完整 JSON
3. **最多 2 次重试**：避免无限循环。2 次后仍失败 → makeNarrativeError（与当前行为一致）
4. **不覆盖原报告产出物**（feedback memory）：本工单不改 report.html/narrative.json 产出路径。如果验收时需要重跑验证，换路径 `2026-07-21_wt049_json_repair/`，不覆盖 v1/v2/v3/v4/v5/v6/wt047/pruned
5. **perfetto 路径不退化**：改 narrative-service.ts 是数据源无关的，不能让 perfetto 报告退化。改完要跑 perfetto harness 确认
6. **不改 prompt 文件**：本工单不改 narrative-prompt.txt / unity-multi-state.txt / perfetto-multi-state.txt——修复回路是工程兜底，prompt 约束治理是 BK-7 方向 B（需 BK-4 配合）
7. **修复回路不影响红队回路**：修复成功后继续 runNarrativeRedTeam，不能跳过

## 验收 harness（必填，开发 agent 完成前自己跑通，不丢给主 agent）

**通用 harness**：
```
cd web && npx tsx server/prism/harness.ts
```
期望：原 199 PASS + 新增 [2d] 节 5 条新 PASS / 0 FAIL（不退化）

**工单特定断言**：

```bash
# 1. narrative-service.ts 有修复回路函数
grep -c "attemptJsonRepair\|repairJsonLoop\|jsonRepairLoop" web/server/prism/narrative-service.ts
# 期望：≥1

# 2. 修复回路有最多重试次数（≤2）
grep -E "maxRetries\s*=\s*[12]|maxAttempts\s*=\s*[12]" web/server/prism/narrative-service.ts
# 期望：命中（≤2）

# 3. 修复回路是重跑 LLM（不是脚本修复）
grep -c "spawnCliProcess\|callLLM" web/server/prism/narrative-service.ts
# 期望：≥2（原有 1 次 + 修复回路 1 次）

# 4. narrative-types.ts 有 repairCount 字段
grep -c "repairCount" web/server/prism/narrative-types.ts
# 期望：≥1

# 5. 修复回路成功时记录 repairCount
grep -c "repairCount" web/server/prism/narrative-service.ts
# 期望：≥1

# 6. 单元测试覆盖修复回路
cd web && npx tsx server/prism/narrative-service.test.ts
# 期望：所有测试 PASS（正常路径 + 1 次修复 + 2 次修复失败 + 修复 prompt 含原 prompt+错误信息）
```

**端到端冒烟**（确认修复回路真的接住非法 JSON）：

这个比较难做——需要让 LLM 真的产出非法 JSON 才能验证修复回路。两种方案：

**方案 A（推荐）**：用单元测试 mock LLM 产出非法 JSON，验证修复回路触发 + 重试 + 成功/失败路径。**不真跑 LLM**。

**方案 B（可选，主 agent 验收时做）**：真跑一次 narrative，如果 LLM 产出非法 JSON，看修复回路是否接住。但这个不可控——LLM 可能一次就产出合规 JSON，无法验证修复回路。

**建议方案 A**——单元测试足够覆盖，不需要真跑 LLM。

**perfetto 不退化检查**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
# 期望：原 231 PASS / 2 FAIL / 1 WARN 不退化（2 FAIL 是 WT-037 遗留，与本工单无关）
```

## 完成标准

1. 通用 harness 全 PASS（原 199 + 新增 [2d] 5 条 / 0 FAIL）
2. 工单特定断言 1-6 全 PASS
3. 单元测试覆盖：正常路径 + 1 次修复 + 2 次修复失败 + 修复 prompt 含原 prompt+错误信息
4. **narrative-service.ts 有 attemptJsonRepair 函数**（或类似名）
5. **修复回路最多 2 次重试**（≤2，防无限循环）
6. **修复回路是重跑 LLM**（不是脚本修复 JSON，违反 DR-44）
7. **narrativeProvenance 有 repairCount 字段**（验收时看修复回路是否真的接住了非法 JSON）
8. **perfetto 报告不退化**
9. 把改动 diff + harness 末尾输出 + 单元测试输出告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做（不只信开发 agent 报告的 PASS）：

1. 独立跑一遍通用 harness + 工单特定断言 1-6
2. **打开 narrative-service.ts 看修复回路实现**：
   - attemptJsonRepair 函数是否存在
   - 最多重试 2 次（不是无限循环）
   - 是重跑 LLM 不是脚本修复 JSON
   - 修复 prompt 含原 prompt + 错误信息 + 错误位置附近 raw 片段
3. **打开 narrative-types.ts 看 repairCount 字段**：是否存在，是否可选
4. **跑单元测试**：4 个用例全 PASS（正常路径 + 1 次修复 + 2 次修复失败 + 修复 prompt 含原 prompt+错误信息）
5. **对照 perfetto v5 标杆看 perfetto 报告不退化**
6. 任一不通过 = 打回，不在错误基座上继续堆功能

## 注意事项

- **本工单是 v7 前置**：v7 要修 §0 ② URP 重复，必须重跑 narrative。当前架构下重跑 6 次才成功 1 次，无法稳定迭代。本工单修好后，v7 重跑 narrative 时 JSON 修复回路兜底，不再"6 次才成功 1 次"
- **修复回路是工程兜底，不是 prompt 治理**：本工单不改 prompt 文件——prompt 约束治理是 BK-7 方向 B（需 BK-4 金标集配合）。本工单只解决"LLM 产出非法 JSON 时工程兜底"
- **修复回路不影响红队回路**：修复成功后继续 runNarrativeRedTeam，不能跳过
- **修复回路不改 narrative.json schema**：还是同一个 NarrativeReport 结构，只加 narrativeProvenance.repairCount 字段
- **不覆盖原报告产出物**：本工单不改 report.html/narrative.json 产出路径。如果验收时需要重跑验证，换路径 `2026-07-21_wt049_json_repair/`

## 验收对照表（开发 agent 自检 + 主 agent 复核）

| 检查项 | 当前（v6 痛点） | WT-049 期望 |
|---|---|---|
| narrative.json 非法 JSON 处理 | 直接 makeNarrativeError，无重试 | **修复回路**（最多 2 次重跑 LLM） |
| 修复回路实现 | ❌ 不存在 | ✅ attemptJsonRepair 函数 |
| 修复回路重试次数 | N/A | **≤2**（防无限循环） |
| 修复回路方式 | N/A | **重跑 LLM**（不是脚本修复 JSON，违反 DR-44） |
| narrativeProvenance.repairCount | ❌ 不存在 | ✅ 可选字段，记录修复次数 |
| harness 断言 | ❌ 没有 | ✅ [2d] 节 5 条断言 |
| 单元测试 | ❌ 没有 | ✅ 4 个用例（正常/1 次修复/2 次失败/修复 prompt 内容） |
| 通用 harness | 199 PASS | 199 + 5 = 204 PASS / 0 FAIL |
| perfetto harness | 231/2/1 | 231/2/1（不退化，2 FAIL 是 WT-037 遗留） |

---

## 完工报告

（施工方填：改了什么、怎么自测的、有无偏离）

## 验收结论

（主 agent 填：PASS / 打回+原因）
