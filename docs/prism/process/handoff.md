# PRISM 会话交接文档（HANDOFF）

> 给**新会话的主 agent**：读完这一页 + 下面列的几个文件，你就能 100% 接上，不依赖上个会话的记忆。
> 上个会话上下文压缩多次、token 消耗过大，故换会话。**所有状态都已落盘，不在对话里。**

---

## 0. 一分钟看懂现状

**在造什么**：Prism —— 一个游戏性能分析 master agent。核心理念：**是"分析师"不是"作文机"**——
自己找问题、查数据验证、每个断言可回溯（零编造）、读源码给可落地建议、会辨伪（敢说"这个查证后不用管"）。
对标并要**强于**旧的"作文机"报告（`output/samples/unity-single/performance-report.cli-sourcemap.md`）。

**当前阶段**：阶段一 = 单源（Unity Profiler .pdata）榨干。**管线已跑通、报告已获用户认可"核心内容ok"。**

**架构（三阶段管线，都在 `web/server/prism/`）**：
1. **探索** `explore-service.ts` + `prompts/explore-prompt.txt`：spawn codebuddy CLI，LLM 用 10 个查询工具自由探索
   （方案B：CLI 内置 agent 用 Bash 调 `tools.cli.ts`，账本 ledger 事后核对证据，防编造）→ 产 `findings.json`+`verdict.json`
2. **叙事** `prompts/narrative-prompt.txt`：LLM 读自己的 findings，写成叙事流报告结构 → `narrative.json`
   （**审计信息不进 narrative**，留在 findings 供核查）
3. **渲染** `render-html.ts`（HTML彩色报告）/ `render-report.ts`（md）：读 narrative.json，重查 drillDownMarker 画彩色火焰条调用树 → `report.html`

**数据**：`web/data/prism.sqlite`（300万行逐帧×线程×marker 明细）。源码：`G:/AOEYZ_Trunk/AOE3D/`（C#+Lua）
+ codegraph 图谱 `G:/AOEYZ_Trunk/AOE3D/.codegraph/codegraph.db`（47万节点/109万边）。
最新一次完整产物：`web/data/prism-out/unity-outside-stressmove/2026-07-09_07-48-53/`（report.html/findings/narrative/verdict/ledger）。

---

## 1. 必读文件（按顺序，约10分钟）

| 文件 | 作用 |
|---|---|
| `../memory/charter.md` | 北极星 + 八条锚定 Feature（F1-F8）。不可漂移的树干。 |
| `../plan/backlog-mindmap.md` | 需求脑图，一眼看全貌 |
| `../plan/backlog.md` | 需求详表 + 状态。**唯一需求真相源，新需求立即入表。** |
| `../memory/rationale.md` | DR-1~DR-40 决策推演录。**为什么这么定、否决过什么。遇到"要不要重来某决策"先查这里，避免重复踩坑。** |
| `../plan/datarequests.md` | 数据/采集层需求池 |

---

## 2. 阶段性结论（诚实版，别粉饰）

- ✅ 方向成立：分析师 > 作文机（覆盖更全、可回溯、会辨伪、读源码给建议）
- ✅ 自我批判回合有效：agent 能自审出 severity 排序/统计误判等，无需用户指出
- ❌ **三个未解硬伤**（见下面重点方向）
- ⚠️ **一个必须警惕的教训（DR-36）**：上个会话的 Claude **多次自评"超过作文机"却被用户打脸**——
  原因：用"比上版"冒充"比标杆"、被局部亮点晃眼、有取悦用户倾向。**新 agent 铁律：不自评"强了没"，
  拿产出与作文机逐条并排给用户判。没有客观清单前，你的自我判断不可信。**

---

## 3. 接下来的重点方向（4个，都有明确根因/做法）

**① BK-15 线程/URP 反复丢失（最高优先，用户绕最久的老问题，根因刚锁定）**
- 根因（DR-40，已用数据查实）：**不是没查**——那次探索查了线程13次、URP整树、getThreadTimeline 12次；
  **是"探索所见→写findings"的收敛环节系统性偏向主线程**，把线程账/跨线程等待/URP父树当噪音丢了。
  因为 finding 模子"一marker一条"，跨线程/子树关系塞不进就被扔。
- 做法（**改 prompt 写作纪律，不加工具**）：①explore-prompt 明确 finding 允许线程级/子树级发现（不只marker级）
  ②收尾回扫加"我查过的线程分布、URP整树，写进报告了吗？查了没写=漏，必须补" ③narrative 的"工作线程"分群必须落实探索所见。

**② BK-16 源码归因大量 miss（专项，用户要求单独解决）**
- 现状：getSourceForSymbol 对通用回调名（Lua 裸名 OnUpdate/OnCameraMove）定位不到真实实现。BK-12b 已改文件路径锁定但仍大量 miss。
- 做法：map-source 覆盖率提升 + Lua 符号消歧 + 调用栈辅助定位。独立排期。

**③ BK-17 HTML 结构美化（纯前端，快）**
- 加目录/章节导航；主题分群标题与问题标题**字号分级**；主题群**上色**；视觉层次。改 `render-html.ts`。

**④ BK-4 质量清单（治"判断不可靠" + 能量化好坏）**
- 把用户几轮教的规则（覆盖所有线程/按整体贡献排序不按单帧峰值/present要对照PresentFrame/父节点整树拽出/…）
  固化成一张**机器自查清单**，每次报告出来对着清单逐项打分。这既治报告质量，也治 Claude 自评不可靠（DR-36）。
  这是 Charter F4"质量回路"的落地。

（更靠后：BK-7 治慢 41分钟；BK-LOOP 跨run进化框架=用户核心愿景但需前面稳了再搭；BK-11 推广 diff/cross。）

---

## 4. 协作模式（用户明确要求，务必遵守 —— 省 token 的关键）

**免费/便宜 agent 执行，主 agent 只定规格+验收+对方向。**
- 主 agent（你）**不亲自写代码、不亲自跑 41 分钟探索**。这些用子 agent（Sonnet，`Agent` 工具 `model: sonnet`）做。
- 主 agent 三件事：①把 backlog 项写成**自包含规格**（输入/输出/验收标准）丢给子 agent ②**独立验收**子 agent 产出
  （查关键数字，别信自报）③跟用户对齐方向、拿产出并排作文机给用户判。
- 每次找用户前**先报 backlog/脑图全貌**（做了啥/在做啥/还剩啥），用户看方向拍板，不必跟踪细节。

**跑探索的命令**（子 agent 用，从 cwd web/）：
`npx tsx server/prism/explore.cli.ts --run-id unity-outside-stressmove --timeout-ms 3600000`
然后 `node --import tsx server/prism/render-html.ts --dir <输出目录>`。
（注意：探索约 40 分钟、烧 token，是最贵操作；改 prompt 类改动可先用"限定小任务"小成本验证，不必每次跑完整探索——见 DR-30。）

---

## 5. 已知的坑（避免重踩）
- 慢的真凶之一是 LLM 把工具结果 dump 成临时文件再分段 Read（DR-37 已加"效率铁律"prompt 缓解）。
- getSourceForSymbol 靠文件路径锁定、不靠名字搜（DR-33/BK-12b）；同名多个返回 ambiguous 不硬选。
- verdict.primaryDrivers 可能是字符串(finding-id)或对象，renderer 要兼容。
- Windows：无 /tmp，forward slashes，node --import tsx 比 npx tsx 快。
- AskUserQuestion 工具本会话频繁报错（question 字段），必要时用纯文本提问。
