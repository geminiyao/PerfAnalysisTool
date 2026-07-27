# TODO-WT-037 · harness 防呆：内容厚度回归 + 硬编码自举检查

> 状态：TODO ｜ 里程碑：M5 Perfetto agent 化 ｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：WT-036 验收通过（schema 重构完成，视觉资产从顶层字段移到 `NarrativeItem.visualAsset`）。
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§三对照标杆 + §八 harness 纪律）+ `CODEBUDDY.md`（严禁硬编码）+ WT-036 工单（schema 新形态）。

## 背景

WT-030~035 跑出 v4 报告（`2026-07-16_wt030-035-v4`），相比 v1（`2026-07-16_wt030-035`）内容厚度塌方：

| 字段 | v1 | v4 | 退化 |
|---|---|---|---|
| threadOverview | 8 行（Audio 5 子线程独立） | 4 行（Audio 合并成 1 行） | 丢 5 个线程明细 |
| redlineMatrix | 8 行（细到子模块） | 3 行（只父级） | 丢 5 个红线项 |
| throttlingMatrix | 5 行 | 4 行 | 丢 1 个信号 |
| asciiArt | 4 个 | 3 个 | 丢 §3 byState 图 |
| 核心结论 vs §0 | 不重复 | 重复 | 重复 |

**根因**：harness 只验"字段存在 + ≥1 条"，不验"行数 ≥ 标杆"。开发 agent 交了字段都在、机械指标全 PASS 的 v4，内容厚度却塌了。同时 render-html.ts:554-557 的 `metaInfoMatched`/`threadOverviewMatched`/`throttlingMatrixMatched`/`redlineMatrixMatched` 是 perfetto 特有字段名写死在通用渲染层——硬编码扫描也没断言。

**用户反复纠偏的两个点**：①内容厚度退化 ②硬编码。这两个点必须从人眼检查变成机器 FAIL，否则下次还会退化。本工单不修报告内容，只修 harness 防呆机制。

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §三对照标杆 + §八 harness 纪律（DR-45 教训：验收只看合规性标记 = 漏网）
- `CODEBUDDY.md`（项目根）— 严禁硬编码 + 三段管线硬契约
- WT-036 工单 — schema 新形态（视觉资产在 `NarrativeItem.visualAsset`，不在顶层）
- `web/server/prism/harness.ts` — 当前 harness（WT-035 的 4 类软警告是 warning 不阻塞）

## 任务

### 需求 A：内容厚度回归断言（对标 v1 标杆，不许少）

**文件**：`web/server/prism/harness.ts`

在 `[2] narrative.json 结构契约` 节末尾新增"内容厚度回归"断言组。**对标 v1 标杆**（`data/prism-out/bk26b-perfetto-triad/2026-07-16_wt030-035/narrative.json`），行数不许少。

**WT-036 后 schema 形态**（视觉资产在 `sections[].items[].visualAsset`，不在顶层）：

```ts
// 内容厚度回归断言（对标 v1 标杆，FAIL 不是 warning）
// WT-037 防呆：防 narrative LLM 丢内容

// A1. 多线程覆盖 ≥5 类线程（v1 有 8 行，v4 退化到 4 行）
//     WT-036 后：扫 sections 里 title 含"多线程"的 visualAsset table.rows.length
const threadOverviewAsset = findVisualAssetByTitle(narrative, /多线程/);
assert(threadOverviewAsset && threadOverviewAsset.table.rows.length >= 5,
  '多线程宏观表 ≥5 行（含 Audio 线程池，不许合并）',
  { actual: threadOverviewAsset?.table.rows.length ?? 0 });

// A2. 红线触发清单 ≥5 行（v1 有 8 行细到子模块，v4 退化到 3 行）
const redlineAsset = findVisualAssetByTitle(narrative, /红线/);
assert(redlineAsset && redlineAsset.table.rows.length >= 5,
  '红线触发清单 ≥5 行（细到子模块，不许只到父）',
  { actual: redlineAsset?.table.rows.length ?? 0 });

// A3. 降频判定矩阵 ≥4 行（v1 有 5 行，v4 退化到 4 行）
const throttlingAsset = findVisualAssetByTitle(narrative, /降频/);
assert(throttlingAsset && throttlingAsset.table.rows.length >= 4,
  '降频判定矩阵 ≥4 行',
  { actual: throttlingAsset?.table.rows.length ?? 0 });

// A4. ASCII 图 ≥3 个（v1 有 4 个，v4 退化到 3 个）
const asciiCount = countVisualAssetsByType(narrative, 'ascii');
assert(asciiCount >= 3, 'ASCII 图 ≥3 个', { actual: asciiCount });

// A5. 采集元信息 ≥8 行（v1 有 12 行）
const metaAsset = findVisualAssetByTitle(narrative, /采集元信息/);
assert(metaAsset && metaAsset.table.rows.length >= 8,
  '采集元信息 ≥8 行',
  { actual: metaAsset?.table.rows.length ?? 0 });
```

**辅助函数**（新增到 harness.ts）：
```ts
// WT-037：在 sections[].items[].visualAsset 里按 title 正则找视觉资产
function findVisualAssetByTitle(narrative: NarrativeReport, titleRe: RegExp): VisualAsset | undefined {
  for (const sec of narrative.sections) {
    for (const item of sec.items) {
      if (item.visualAsset && titleRe.test(item.visualAsset.title)) {
        return item.visualAsset;
      }
    }
  }
  return undefined;
}
function countVisualAssetsByType(narrative: NarrativeReport, type: 'table' | 'ascii' | 'matrix'): number {
  let n = 0;
  for (const sec of narrative.sections) {
    for (const item of sec.items) {
      if (item.visualAsset?.type === type) n++;
    }
  }
  return n;
}
```

**关键**：这些断言是 `assert`（FAIL），不是 `warn`（warning）。行数 < 标杆 = harness FAIL = 开发 agent 不能交差。

### 需求 B：硬编码扫描断言（通用层不许有数据源特定字段名）

**文件**：`web/server/prism/harness.ts`

在 `[1] 占位符填充检查` 节后新增"硬编码扫描"断言组：

```ts
// B1. render-html.ts 不许出现 perfetto 特有字段名作为字段名
//     WT-036 修完后这些字段不在顶层，render-html 也不该硬编码引用
const renderHtmlSrc = fs.readFileSync(path.join(__dirname, 'render-html.ts'), 'utf-8');
const forbiddenFieldNames = [
  /metaInfoMatched/, /threadOverviewMatched/, /throttlingMatrixMatched/, /redlineMatrixMatched/,
  /visualAssetKey\s*===\s*['"]metaInfo['"]/,
  /visualAssetKey\s*===\s*['"]threadOverview['"]/,
  /visualAssetKey\s*===\s*['"]throttlingMatrix['"]/,
  /visualAssetKey\s*===\s*['"]redlineMatrix['"]/,
];
for (const re of forbiddenFieldNames) {
  assert(!re.test(renderHtmlSrc), `render-html.ts 无硬编码字段名匹配: ${re.source}`);
}

// B2. narrative-types.ts 顶层 NarrativeReport 不许有 perfetto 特有字段
const typesSrc = fs.readFileSync(path.join(__dirname, 'narrative-types.ts'), 'utf-8');
// 提取 NarrativeReport interface 体
const reportIface = typesSrc.match(/interface NarrativeReport \{[\s\S]*?\}/);
if (reportIface) {
  assert(!/metaInfo\?:/.test(reportIface[0]), 'NarrativeReport 顶层无 metaInfo 字段');
  assert(!/threadOverview\?:/.test(reportIface[0]), 'NarrativeReport 顶层无 threadOverview 字段');
  assert(!/throttlingMatrix\?:/.test(reportIface[0]), 'NarrativeReport 顶层无 throttlingMatrix 字段');
  assert(!/redlineMatrix\?:/.test(reportIface[0]), 'NarrativeReport 顶层无 redlineMatrix 字段');
  assert(!/asciiArt\?:/.test(reportIface[0]), 'NarrativeReport 顶层无 asciiArt 字段');
}

// B3. harness.ts 自身不许硬编码 visualAssetKeys 数组扫顶层字段
//     WT-035 警告 1 的 visualAssetKeys = ['metaInfo', ...] 是过渡方案，WT-036 后应删
assert(!/visualAssetKeys\s*=\s*\[/.test(typesSrc), 'harness.ts 无 visualAssetKeys 顶层字段数组（改为扫 item.visualAsset）');
```

### 需求 C：WT-035 软警告升级为 FAIL

**文件**：`web/server/prism/harness.ts`

WT-035 的 4 类软警告里，以下 3 类升级为 `assert`（FAIL），不保留 `warn`：

1. **"视觉资产全空"**（WT-035 警告 1）：改为 `assert(countVisualAssetsByType(narrative, 'table') >= 1, '至少 1 个 table 视觉资产')`——WT-036 后视觉资产在 item 里，扫 item.visualAsset
2. **"多线程覆盖不足"**（WT-035 警告 2）：已由 A1 覆盖（≥5 行 = FAIL）
3. **"topConclusions 无 callTree"**（WT-035 警告 3）：改为 `assert(ratio >= 0.5, 'critical/high topConclusion 挂 callTree/asciiArt 比率 ≥50%')`

**保留 warning**：WT-035 警告 4（callTree 节点无红线标注）保留为 warning（这个是 explore 层问题，不是 narrative 层）。

### 需求 D：核心结论与 §0 不重复检查

**文件**：`web/server/prism/harness.ts`

v4 的问题是 §0 ①②③ 与 topConclusions 1-3 内容重复。加断言：

```ts
// D1. 核心结论与 §0 不重复（v4 退化点）
//     检查 topConclusions 的 problem 文本与 §0 section items 的 title 文本不高度相似
const section0 = narrative.sections.find(s => s.heading.includes('§0') || s.heading.includes('结论先行'));
if (section0) {
  const section0Titles = section0.items.map(i => i.title);
  const topProblems = narrative.topConclusions.map(c => c.problem);
  for (let i = 0; i < topProblems.length; i++) {
    for (const title of section0Titles) {
      const sim = textSimilarity(topProblems[i], title);
      if (sim > 0.7) {
        assert(false, `topConclusion #${i+1} 与 §0 item 高度相似 (sim=${sim.toFixed(2)})`, {
          problem: topProblems[i], section0Title: title,
          hint: '§0 应是结论先行的叙事展开，不是 topConclusions 的复述——narrative LLM 没区分两层的语义角色',
        });
      }
    }
  }
}
```

**辅助函数**：
```ts
// WT-037：简单文本相似度（Jaccard on tokens），不引外部库
function textSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(/[\s,，。；;:：()（）/\\]+/).filter(t => t.length > 1));
  const tokensB = new Set(b.split(/[\s,，。；;:：()（）/\\]+/).filter(t => t.length > 1));
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}
```

### 需求 E：标杆 diff 报告（自举对照）

**文件**：`web/server/prism/harness.ts`

harness 跑完自动 diff 新 report 与 v1 标杆的视觉资产行数，差异 > 20% 直接 FAIL 并打印"哪些字段比标杆少了"：

```ts
// E1. 标杆 diff（自举对照，不靠人眼）
//     对标 v1 标杆 narrative.json，视觉资产行数 diff > 20% = FAIL
const benchmarkPath = path.join(__dirname, '..', '..', 'data', 'prism-out', 'bk26b-perfetto-triad', '2026-07-16_wt030-035', 'narrative.json');
if (fs.existsSync(benchmarkPath)) {
  const benchmark = JSON.parse(fs.readFileSync(benchmarkPath, 'utf-8')) as NarrativeReport;
  // WT-036 后标杆也应该是新 schema，如果还是旧 schema 跳过（兼容期）
  // diff 逻辑：对比 threadOverview/redlineMatrix/throttlingMatrix/asciiArt 的行数
  // ...（实现细节：如果标杆是旧 schema 用顶层字段，新 report 用 item.visualAsset，两边都扫）
}
```

**说明**：E1 是 stretch goal，如果标杆（v1）是旧 schema、新 report 是新 schema，diff 逻辑较复杂。可以先实现 A-D，E1 标 TODO 留到下次。但 A-D 必须全做。

## 硬约束

1. **A-D 必须全做**（E1 可 stretch）：内容厚度回归 + 硬编码扫描 + 警告升级 + 重复检查是核心防呆
2. **断言是 FAIL 不是 warning**：内容厚度/硬编码/重复 = `assert`（FAIL），不许降级为 `warn`
3. **不硬编码业务名**：断言检查的是"行数 ≥ N"和"字段名不出现"，不是"必须含 OutSideViewArmyLineMgr"这种业务名
4. **标杆行数写进断言**：v1 标杆的行数（threadOverview 8/redlineMatrix 8/throttlingMatrix 5/asciiArt 4）是底线，写进 assert 参数
5. **修完 harness 自己跑通**：`npx tsx server/prism/harness.ts --source perfetto --dir <v4 目录>` 应该 FAIL（因为 v4 是退化产物），跑 v1 标杆应该 PASS
6. **不覆盖原报告**：本工单只改 harness.ts，不跑新报告

## 验收 harness（必填，开发 agent 完成前自己跑通）

**通用 harness**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt030-035-v4
```
期望：**FAIL**（v4 是退化产物，WT-037 的 A1-A5/D1 应该抓住 v4 的退化）。这验证防呆机制有效。

**反证 harness**（跑 v1 标杆，应该 PASS）：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt030-035
```
期望：PASS（v1 是内容厚度达标的标杆，WT-037 断言不应误杀）。

**工单特定断言**：
```bash
# 验 harness.ts 有内容厚度回归断言
grep -c "内容厚度\|多线程宏观表 ≥5\|红线触发清单 ≥5\|降频判定矩阵 ≥4" web/server/prism/harness.ts  # 期望 ≥3

# 验 harness.ts 有硬编码扫描
grep -c "forbiddenFieldNames\|render-html.ts 无硬编码字段名" web/server/prism/harness.ts  # 期望 ≥1

# 验 harness.ts 有 findVisualAssetByTitle 辅助函数
grep -c "function findVisualAssetByTitle" web/server/prism/harness.ts  # 期望 ≥1

# 验 harness.ts 有文本相似度检查
grep -c "function textSimilarity\|核心结论与 §0 不重复" web/server/prism/harness.ts  # 期望 ≥1
```

**端到端冒烟**：本工单只改 harness.ts，不跑新报告。但要用 v4 和 v1 两个目录跑 harness 验证防呆有效。

## 完成标准

1. harness 跑 v4 目录 = FAIL（防呆抓住退化）
2. harness 跑 v1 目录 = PASS（不误杀标杆）
3. 工单特定断言全 PASS
4. 把改动清单告诉主 agent

harness 跑不通就继续改，改到 v4 FAIL + v1 PASS 为止。不要把"两个都 PASS"或"两个都 FAIL"丢给主 agent——那是防呆失效。

---

## 主 agent 验收清单

1. 独立跑 harness 对 v4（应 FAIL）和 v1（应 PASS）
2. 检查 A1-A5/D1 断言是否真的抓住了 v4 的退化（看 FAIL 输出的具体字段）
3. 检查 B1-B3 硬编码扫描是否有效（WT-036 修完后 render-html 不该有 metaInfoMatched 等）
4. 检查断言是 `assert`（FAIL）不是 `warn`（warning）
5. 任一不通过 = 打回

## 注意事项

- **WT-037 依赖 WT-036**：A1-A5 扫的是 `sections[].items[].visualAsset`，WT-036 没做完这字段不存在。如果 WT-036 还没做，WT-037 先做 B（硬编码扫描，不依赖 schema 形态）+ C（警告升级），A/D 等 WT-036 完成后再做。
- **防呆不是一次性的**：WT-037 的断言行数（≥5/≥8/≥4/≥3）对标 v1 标杆，如果未来标杆升级，断言行数也要调。但底线是"不许比标杆少"。
- **不靠人眼**：本工单的核心价值是把"内容厚度"和"硬编码"从人眼检查变成机器 FAIL。开发 agent 交差前 harness 会自动抓住退化，用户不用再纠偏。
- **WT-035 软警告的教训**：WT-035 的 4 类警告是 `warn` 不阻塞，开发 agent 交了带 warning 的 v4。WT-037 把其中 3 类升级为 `assert`（FAIL），就是堵这个漏洞。
