# TODO-WT-031 · 多线程覆盖缺口（DR-45 差距2，explore 重跑）

> 状态：TODO ｜ 里程碑：M5 Perfetto agent 化 ｜ 执行方：Cursor（改 prompt + pipeline）+ 主 agent（跑端到端 LLM）
>
> 前置：**WT-030 验收通过**（render 层 markdown 渲染 bug 已修，表格能正常渲染）。
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§三对照标杆 + §六严禁硬编码）+ `CODEBUDDY.md`（三段管线硬契约）+ `docs/prism/memory/rationale.md` DR-45（差距2）+ `docs/report/performance-report_perfetto_ULTIMATE_v5.3.md` §3（7 类线程标杆）。

## 背景

对照 v5.3 标杆 §3 多线程独立分析，当前报告只有 2 个线程（UnityMain/UnityGfxRenderS），缺 RHI/LuaMtGC/ECSWorker/Audio/Choreographer 共 5 类。

**根因诊断**（已 grep `web/data/prism-out/bk26b-perfetto-triad/2026-07-15_10-36-27/findings.json` 确认）：
- findings.json 里 querySchedState evidence 只有 UnityMain（3 roles）+ UnityGfxRenderS（throttle）
- **explore 阶段没查 RHI/LuaMtGC/ECSWorker/Audio/Choreographer 的 sched 三态**——不是 narrative 没用，是 explore 没查
- perfetto-explore-prompt.txt 第0步"全景地图"写了"querySchedState 各 role 一次"，但 LLM 实际只查了 topN 线程榜（返回 UnityMain + UnityGfxRenderS），没对每个识别线程类型单独查

**v5.3 §3 标杆线程列表**（7 类，对照基准）：
1. UnityMain（主线程，业务/Lua/ECS 调度主入口）
2. Render（UnityGfxRenderS，Unity 命令录制层）
3. RHI（Thread-103，直调 GLES driver）
4. LuaMtGC（UnityMain 同名陷阱，tid=10780，xLua C# GC 线程——用 slice 内容含 "LuaMtGc.ExecuteMtGc" 识别）
5. ECSWorker × 4（Thread-135/137/138/139，Unity Job System Burst Worker 池）
6. Audio 线程池（AudioTrack/AAudio_1/Audio Mixer/Audio Stream/GVoiceRender，三态 Sleep ≥99% 不是瓶颈，但也要查一次写进 findings）
7. Choreographer（vsync 节拍，三态稳定 60Hz）

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §三对照标杆 + §六严禁硬编码
- `CODEBUDDY.md`（项目根）— 三段管线硬契约
- `docs/report/performance-report_perfetto_ULTIMATE_v5.3.md` §3.0-§3.7 — 7 类线程标杆（对照基准）
- `web/server/prism/prompts/perfetto-explore-prompt.txt` — 现有第0步全景地图（line 235-242）

## 任务

### 需求 A：perfetto-explore-prompt 加多线程覆盖铁律

**文件**：`web/server/prism/prompts/perfetto-explore-prompt.txt`

在「先建全景地图」段第0步（line 235-242 区域，"querySchedState 各 role 一次（多线程宏观）" 那条之后）追加：

```
★★★【多线程覆盖铁律·不许跳过】★★★
第0步的 "querySchedState 各 role 一次" 返回的是 topN 线程榜（默认 topN=20）。
你必须从 topN 榜里识别出所有线程类型，然后对每个线程类型单独 querySchedState（带 thread 参数）查三态。

识别的线程类型至少包括：
- UnityMain（主线程，业务/Lua/ECS 调度主入口）
- Render（comm=UnityGfxRenderS，Unity 命令录制层）
- RHI（Thread-XXX，直调 GLES driver，slice 含 Gfx.PresentFrame）
- LuaMtGC（comm=UnityMain 同名陷阱——用 slice 内容含 "LuaMtGc.ExecuteMtGc" 识别，不是 comm 硬匹）
- ECSWorker（Thread-XXX 多线程池，slice 含 "xxxSystem:xxxJob (Burst)"，所有 Worker 都要查）
- Audio 线程池（AudioTrack/AAudio_*/Audio Mixer 等，Sleep ≥99% 不是瓶颈，但也要查一次写进 findings——"已排除"是结论，不是不查）
- Choreographer（vsync 节拍，slice 含 "Choreographer#doFrame"）

对每个识别到的线程类型，至少 querySchedState 三态（base/cur/throttle）各查一次，写进对应 finding 的 evidence。
任何一个线程类型没查 sched = 覆盖不全，narrative §2 多线程宏观会缺整类线程的健康度判定。
```

**关键**：不许硬编码线程名清单作为"必须盯防"——上面列的是**识别指引**（怎么从 topN 榜认出这些线程类型），不是"只查这 7 个"。如果 topN 榜里还有其它线程类型（如 AsyncWorker/Binder 线程），也要查。识别用 slice 内容/comm 模式，不用 tid 硬匹。

### 需求 B：narrative-prompt 加多线程宏观覆盖引导

**文件**：`web/server/prism/prompts/narrative-prompt.txt`

在「按主题分群」段（约 line 107-112 后）追加：

```
★【多线程宏观章节必须覆盖 findings 里所有识别线程】
threadOverview 字段必须包含 findings 里出现过的所有线程类型（不只 UnityMain）。
每个 threadOverview 行的 runPct/sleepPct/runnablePct 从 findings 的 querySchedState evidence 取。

规则：
- findings 里 querySchedState 查过的每个线程类型，threadOverview 都要有一行
- 没有 sched 数据的线程不许编——如果 explore 没查某线程，threadOverview 里就不列（但要在 judgmentBoundary.cannotJudge 声明"X 线程未覆盖"）
- Audio/Sleep ≥99% 的线程也要列进 threadOverview，note 标"非瓶颈，Sleep ≥99%"
- 每个线程的 note 给一句话定位（如"主线程，业务/Lua/ECS 调度主入口"/"Render 命令录制层，等主线程发命令"/"RHI 直调 driver，三态 run% 单调下降"）
```

### 需求 C：run-perfetto-pipeline.ts 支持新输出目录（不覆盖原报告）

**文件**：`web/server/prism/run-perfetto-pipeline.ts`

当前 `--skip-explore` 模式（line 70-90）找最新 timestamp 子目录复用 findings，然后 narrative+render 写回**同一目录**（line 109-113 `outputDir: exploreOutputDir`）——会覆盖原 narrative.json 和 report.html。

**改动**：
1. 新增 `--out <new-dir>` flag 解析（line 33-40 区域，已有 `outputDir` 变量但只 explore 用）
2. `--skip-explore` 模式下：
   - 若 `--out` 给定：复用原 findings.json/verdict.json（从最新 timestamp 子目录读），但 narrative.json/report.html 写到 `--out` 指定的新目录
   - 新目录不存在则 `fs.mkdirSync(newDir, {recursive: true})`
   - 复制 findings.json + verdict.json 到新目录（narrative-service 要读 findings.json，新目录要有）
3. 非 `--skip-explore` 模式下：`--out` 行为不变（explore + narrative + render 都写到 --out）
4. 若 `--skip-explore` 但**未给** `--out`：保持原行为但打 warning：
   ```
   [pipeline] WARNING: --skip-explore without --out will overwrite existing narrative.json/report.html in <dir>
   [pipeline] Suggestion: add --out data/prism-out/<runId>/<new-timestamp> to preserve original
   ```

**关键**：不许在 narrative-service.ts 或 render-html.ts 内部做备份逻辑——备份/换目录是 pipeline 入口的职责，service 层只管读 inputDir 写 outputDir。

## 硬约束

1. **三段管线硬契约**：explore LLM → findings.json → narrative LLM → narrative.json → render 纯代码
2. **不硬编码线程名清单**：perfetto-explore-prompt 加的是"识别指引"（怎么从 topN 认出线程类型），不是"必须盯防这 7 个"。识别用 slice 内容/comm 模式，不用 tid 硬匹
3. **不硬编码绝对阈值**：不写"Sleep ≥99% 是健康"这种绝对值——用相对值"Sleep 占比高"
4. **修完 harness 必须 FAIL=0**
5. **不覆盖原报告**：端到端用 `--out` 新目录，原 `2026-07-15_10-36-27/` 全程不动

## 验收 harness（必填，开发 agent 完成前自己跑通）

**通用 harness**（验已有产出物不退化，用原目录）：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-15_10-36-27
```
期望：35 PASS / 0 FAIL（不退化）。

**工单特定断言 A**（验 pipeline --out 不覆盖）：
```
# 跑 --skip-explore --out 新目录，确认原目录 narrative.json/report.html mtime 不变
cd web && npx tsx server/prism/run-perfetto-pipeline.ts --skip-explore --out data/prism-out/bk26b-perfetto-triad/2026-07-16_wt031_smoke
# 然后检查原目录文件未被改动
```
期望：新目录产出 narrative.json + report.html；原目录 narrative.json/report.html 的 mtime 未变（未被覆盖）。

**工单特定断言 B**（验 prompt 改动）：
```
# grep 验证 prompt 文件含新增铁律
grep -c "多线程覆盖铁律" web/server/prism/prompts/perfetto-explore-prompt.txt  # 期望 ≥1
grep -c "多线程宏观章节必须覆盖" web/server/prism/prompts/narrative-prompt.txt  # 期望 ≥1
```

**端到端（重跑 explore，主 agent 跑，Cursor 不跑——LLM 调用耗时）**：
```
cd web && npx tsx server/prism/run-perfetto-pipeline.ts --run-id bk26b-perfetto-triad --out data/prism-out/bk26b-perfetto-triad/2026-07-16_wt031
```
期望（主 agent 跑完后验收）：
- 新 findings.json 里 querySchedState evidence 出现的线程类型 ≥5 类（UnityMain/Render/RHI/LuaMtGC/ECSWorker）
- 新 narrative.json 的 `threadOverview` 数组长度 ≥5
- 原 `2026-07-15_10-36-27/` 全程不动

## 完成标准

1. 通用 harness FAIL=0（35 PASS 不退化）
2. 工单特定断言 A+B 全 PASS
3. 端到端冒烟成功（Cursor 跑 --skip-explore --out 验证不覆盖；主 agent 跑完整端到端验多线程覆盖）
4. 把改动清单告诉主 agent，等主 agent 跑完端到端后验收

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做：

1. 独立跑一遍通用 harness + 工单特定断言 A+B
2. **主 agent 跑端到端**（重跑 explore + narrative + render，新目录）：
   ```
   cd web && npx tsx server/prism/run-perfetto-pipeline.ts --run-id bk26b-perfetto-triad --out data/prism-out/bk26b-perfetto-triad/2026-07-16_wt031
   ```
3. 跑完后 grep 新 findings.json 验多线程覆盖：
   ```
   grep -oE '"thread":\s*"[^"]+"' web/data/prism-out/bk26b-perfetto-triad/2026-07-16_wt031/findings.json | sort -u
   ```
   期望：≥5 类线程
4. 打开新 report.html 看 §2 多线程宏观表（如果 narrative LLM 产了 threadOverview），对照 v5.3 §3 标杆核
5. 任一不通过 = 打回

## 注意事项

- **Cursor 只改 prompt + pipeline 代码，不跑端到端 LLM**：explore 重跑耗时 ~15-20min，Cursor 10min 超时不够。Cursor 跑 --skip-explore --out 验证不覆盖即可，完整端到端主 agent 跑。
- **LuaMtGC 同名陷阱**：comm=UnityMain，必须用 slice 内容含 "LuaMtGc.ExecuteMtGc" 识别，不能用 comm 硬匹——这是 v5.3 §3.0 明确的识别方法。
- **Audio 也要查**：Sleep ≥99% 不是瓶颈，但"已排除"是结论不是不查——explore 要查一次写进 findings，narrative 要列进 threadOverview 标"非瓶颈"。
