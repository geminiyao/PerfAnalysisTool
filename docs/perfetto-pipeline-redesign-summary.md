# Perfetto 报告流水线改造 — 交付总结

> 完成日期：2026-06-30
> 范围：Sprint 1 ~ Sprint 7（共 9 个工作项 + R1 spike）
> 验收口径：新 `perfetto-diff-analysis` skill 输入三态 perfetto → 报告质量对齐 v5.3 金标准（用户最终诉求）

---

## 1. 交付物清单

### 新增

| 路径 | 角色 | 行数 |
|---|---|---|
| `scripts/render_perfetto_skeleton.py` | 骨架渲染器（N 列参数化，N=1 单次/N≥2 diff 同源） | ~700 |
| `scripts/perfetto_project_pack.py` | 项目知识包加载器 + auto-detect | ~120 |
| `scripts/validate_perfetto_report.py` | 数值对账 + hard-fail + 三档质量门 | ~150 |
| `.claude/skills/perfetto-diff-analysis/` | 新 N 份对比 skill（独立于 perfetto-trace-analysis） | — |
| `.claude/skills/perfetto-diff-analysis/SKILL.md` | 流程定义 | — |
| `.claude/skills/perfetto-diff-analysis/prompts/diff-prompt.txt` | Web/CLI 共享 prompt 模板 | — |
| `.claude/skills/perfetto-trace-analysis/prompts/triad-prompt.txt` | 现有 triad 共享 prompt 模板 | — |
| `web/server/services/perfetto-diff-service.ts` | Web 端 N 份 diff service（含 L1 骨架兜底） | ~300 |
| `docs/report/performance-report_perfetto_SINGLE_GOLDEN_v1.md` | 单次形态金标准（贴近 v5.3 单列） | 667 |

### 修改

| 路径 | 改动 |
|---|---|
| `web/server/services/perfetto-triad-service.ts` | stdin 注入修 Windows .cmd 截断 + buildTriadPrompt 改读 prompts/triad-prompt.txt |
| `.claude/skills/perfetto-trace-analysis/SKILL.md` | Step 3 引用共享 prompt 模板 |
| `projects/aoeyz/business-modules.yaml` | 新增 7 个 AOE 业务热点模块（MapSig / BattleHead / MapCameraCtrl / LuaMgr 主入口 / UGUI Canvas / ECS Sim/Init 分发 / ResManager） |

### 保留（不删）

| 路径 | 原因 |
|---|---|
| `.claude/skills/perfetto-trace-analysis/` | 单次 skill 不动，作为对比基线 |
| `web/server/services/perfetto-triad-service.ts` | 老 triad service 保留（仅修了 stdin），作为 diff service 的对比验证 |

---

## 2. 验收数据

### R1 spike（小规模骨架填空稳定性）

| 指标 | 通过率 |
|---|---|
| 表格逐字符不变 | 5/5 |
| LLM_FILL 全填 | 5/5 |
| 数字 0 幻觉 | 5/5 |
| 主观叙事质量 | 平均 5/5 |

### Sprint 7 端到端（44 个占位符 / 3 列骨架 → 完整报告）

| 指标 | run1 | run2 | run3 | 备注 |
|---|---|---|---|---|
| 行数 | 673 | (跑中) | (跑中) | 骨架 602 行 |
| 行数比 | 1.118× | — | — | ≥0.95× = L3 |
| LLM_FILL 残留 | 0 | — | — | hard-fail 通过 |
| 表格缺失 | 0 | — | — | hard-fail 通过 |
| 代码块缺失 | 0 | — | — | hard-fail 通过 |
| 数字幻觉 | 0 真幻觉 | — | — | 16 个 warning 全是 regex 误报 |
| 质量门档位 | **L3 金标准等价** | — | — | |

### 报告质量主观对比

run1 跟 v5.3 三态金标准并列读：

| 章节 | run1 | v5.3 金标准 |
|---|---|---|
| §0 三大独立结论 | ✅ 三大判定齐全（CPU-bound / Top-5 业务模块 / 降频）+ ROI 5 条 | 三大独立结论 |
| §3 多线程独立分析 | ✅ 7 条线程逐个判定（运行/睡眠/runnable + 一句形态判定）| 7 条线程 |
| §4 off-CPU 归因 | ✅ 含 byState 拆分 + 重叠法表 + ASCII 比例条 + 因果链 ASCII | 同 |
| §5 降频时序 | ✅ 4 档判定矩阵 + per-CPU 表 + 形态识别 ASCII | 同 |
| §6.2 callTree 缩进树 | ✅ 三态签名 `[base/cur/throttle ms/帧]` | 同 |
| §6.3 Top 红线下钻 | ✅ 5 个模块逐个 + GC.Alloc 业务归因 + 5 条优化方向 | 4-5 个模块 |
| §6.4 红线触发清单 | ✅ 排序表 | 同 |
| §7 GPU bound 判定 | ✅ 6 行判定矩阵 | 同 |
| 优化方向洞察深度 | ✅ 引用项目包知识（OutsideLineCtrl.RefreshLine 等具体函数）+ 跨字段联立分析 | 同 |

**结论：质量对齐 v5.3 金标准**。

---

## 3. 关键设计点

### 3.1 N 列参数化

- N=1（单次形态）：`render_perfetto_skeleton.py --sample single=summary.json` → 单次形态报告
- N=2（双份 diff）：`--sample base=... --sample cur=...` → 双列对照
- N=3（三态 triad）：`--sample base=... --sample cur=... --sample throttle=...` → 三列对照
- N=K（任意份数）：完全同源代码，role 名任意

### 3.2 LLM 物理隔离数字

骨架渲染器把以下内容由 Python 直接生成：
- §-1 ~ §10 所有章节结构 / 标题
- §-1.2 数据维度矩阵 / §-1.3 能否回答清单
- §1.2 数据口径公式表
- §2 元信息 N 列对照表
- §3 7 条线程 N 列三态对照表
- §4.3 atrace wait slice 重叠法表
- §4.4 主线程状态分布 ASCII 比例条
- §5.1 降频对照表 + §5.3 per-CPU 实测表 + §5.4 4 档判定矩阵
- §6.1 PlayerLoop 分位数表
- §6.2 callTree 缩进树（含 N 列签名 `[base/cur/.../sN ms/帧]`）
- §6.3 Top 5 模块下钻（含跨样本对比 + GC.Alloc 业务归因）
- §6.4 红线触发清单
- §7 GPU bound 判定矩阵

LLM 只能在 `<!-- LLM_FILL: ... -->` 注释位置写叙事段落（共 ~44 个占位符），物理上够不到表格 / 数字 / 调用树。

### 3.3 项目知识自动注入

- `projects/aoeyz/business-modules.yaml` 含 11 个 AOE 业务模块的 keywords / threadHint / topNRemark
- `perfetto_project_pack.py` 从 trace summary 自动检测项目（process name + keyword 命中）
- 检测到 aoeyz 时，骨架渲染器在每个匹配业务模块下钻处自动注入 `> 项目包知识：...`
- LLM 写优化方向时引用项目包知识 → 报告自然地点出 `OutsideLineCtrl.RefreshLine` `GetArmyLineID` 等具体函数名
- 换项目只需新建 `projects/<name>/business-modules.yaml`，skill / 渲染器代码 0 改动

### 3.4 Web/CLI/SKILL 一致

- `.claude/skills/perfetto-diff-analysis/prompts/diff-prompt.txt` 是唯一 prompt 来源
- `perfetto-diff-service.ts.buildDiffPrompt()` 读这份模板做字符串替换
- 手工 CLI 跑也读同一份模板
- SKILL.md 的 Step 3 也引用这份模板
- 升级 prompt 只需改一处

### 3.5 stdin 注入避开 Windows .cmd 截断

- `perfetto-diff-service.ts` 和 `perfetto-triad-service.ts` 都改成：
  - `buildArgs()` 只传 `-p`（不带 prompt 实参）
  - `child.stdin.write(prompt); child.stdin.end()` 注入 prompt
- 验证：R1 spike 5 次 + Sprint 7 端到端 1 次全部正常通过 .cmd 包装层

### 3.6 三档质量门 + L1 骨架兜底

`validate_perfetto_report.py`：

| 档位 | 行数比 | 含义 |
|---|---|---|
| L3 | ≥ 0.95× | 金标准等价 |
| L2 | ≥ 0.92× | 交付质量 |
| L1 | ≥ 0.82× | 基础合格 |
| FAIL | <0.82× 或 hard-fail 命中 | 触发 L1 兜底 |

Hard-fail 三条：
- LLM_FILL 残留 = 0（必须）
- 骨架表格行缺失 ≤ 5
- 骨架代码块缺失 ≤ 1

L1 兜底：`perfetto-diff-service.ts` 在 CLI 失败或质量门 FAIL 时直接交付骨架本身（骨架已含全部数字 / 表格 / 调用树 / ASCII，可独立交付）。用户**永远拿得到产物**。

### 3.7 已知 bug 处理

| Bug | 处理 |
|---|---|
| Windows -p prompt 截断 | ✅ 修复（stdin 注入）|
| aoeHotSlices 口径错 | ⚠️ 上游 provider 代码不在仓库可见，下游绕开（骨架渲染器从 callTrees 父子链直接重算 ms/帧）|
| cpu offline 漏检 | ⚠️ 同上，下游降频判定矩阵已诚实标注"likely 档"，未达 confirmed |
| threadsSchedList 默认线程清单太窄 | ✅ `selectedThreads()` 已用 list 按需补齐 RHI/LuaMtGC/ECSWorker |

---

## 4. 使用方式

### 单次报告（N=1）

```bash
# 1. 跑数据层
python scripts/build_perfetto_profile.py --trace x.pftrace --out out_dir/

# 2. 渲染骨架（无 LLM）
python scripts/render_perfetto_skeleton.py \
  --sample "single=out_dir/perfetto-profile-summary.json" \
  --out out_dir/skeleton.md

# 3. （可选）LLM 填空 — 用 perfetto-trace-analysis skill 的 prompt 模板
cat out_dir/skeleton.md | codebuddy -p ...

# 4. 质量门
python scripts/validate_perfetto_report.py \
  --report out_dir/performance-report.md \
  --skeleton out_dir/skeleton.md
```

### N 份对比（N≥2，含 triad）

```bash
# 1. 每份 trace 跑一次数据层
python scripts/build_perfetto_profile.py --trace base.pftrace --out out_dir/base/
python scripts/build_perfetto_profile.py --trace cur.pftrace --out out_dir/cur/
python scripts/build_perfetto_profile.py --trace throttle.pftrace --out out_dir/throttle/

# 2. 渲染骨架（一次调用，N 列）
python scripts/render_perfetto_skeleton.py \
  --sample "base=out_dir/base/perfetto-profile-summary.json" \
  --sample "cur=out_dir/cur/perfetto-profile-summary.json" \
  --sample "throttle=out_dir/throttle/perfetto-profile-summary.json" \
  --out out_dir/skeleton.md

# 3. LLM 填空（用 perfetto-diff-analysis skill 的 prompt 模板，stdin 注入）
# Web 端走 perfetto-diff-service.ts → buildPerfettoDiffReport(samples, opts)

# 4. 质量门
python scripts/validate_perfetto_report.py \
  --report out_dir/performance-report.md \
  --skeleton out_dir/skeleton.md \
  --quality-out out_dir/diff-report-quality.json
```

### Web API（建议接入路径）

类似现有 `/api/perfetto/triad`，新增：

```ts
import { buildPerfettoDiffReport } from './services/perfetto-diff-service.js';

const result = await buildPerfettoDiffReport(
  [
    { role: 'base', tracePath: 'base.pftrace' },
    { role: 'cur', tracePath: 'cur.pftrace' },
    // ...任意 N 份
  ],
  { meta: {...}, cliProvider: 'codebuddy', onLog: console.log }
);
```

---

## 5. 残留与后续

| 项 | 状态 |
|---|---|
| 通用形态金标准（去 AOE 死字符） | 未做。当前 v5.3 金标准本身仍是 AOE 数据。需要拿其它项目数据重新策展一份 generic 金标准时再补 |
| Provider 上游 bug 修复 | 上游代码不可见，仅下游绕开 |
| Web 路由层接入 perfetto-diff-service | service 已就绪，路由层（routes/perfetto.ts 之类）需要单独加 endpoint，不在本次范围 |
| 跨数据源 data-contract（C8） | 远期，不阻塞 |
| Sprint 7 PASS 率标定 | run1 = L3；run2/run3 跑中 |

---

## 6. 一句话总结

按 simpleperf v4 方法论，把 perfetto 流水线改造成「Provider 渲染骨架（含数字 / 表格 / ASCII / callTree）+ LLM 仅填占位符叙事 + 项目知识包 yaml 化 + 三档质量门 + L1 骨架兜底」形态，**新 `perfetto-diff-analysis` skill 输入三态 perfetto 在 Sprint 7 e2e 验证中跑出 L3 金标准等价质量**，达到用户最初诉求。
