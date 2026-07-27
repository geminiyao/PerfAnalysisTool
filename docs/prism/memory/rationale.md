# PRISM — 设计推演录（Rationale / Decision Record）

> 本文件记录 Prism 每条设计决策的**为什么**、**否决过什么**、**怎么想通的**。
> 它不是宪章（宪章只留结论），也不是施工图（草案讲怎么做）。它是**判例法 + 立法说明**：
> 当有人（包括未来的 Claude、你同事、三个月后的你）再次质疑某条决策，甩这份文档，不必重新拉锯。
>
> 性质：**只增不改**（记录历史推演）；新决策追加 DR-N 条目。对应 Charter 的 F1–F8。

---

## DR-1 · 为什么不让 LLM 写整篇报告，但也不能把它钉死在固定 digest 上

**背景**：管线演进 skill 写整篇 → provider 供数 + LLM 填 prose → LLM_FILL 关键槽。
**动机对**：用 grounding 换正确性，怕 LLM 写整篇"太飘"。这是"把 LLM 钉在数据上"的标准动作。
**但发现代价**：grounding 是用**发现能力**换来的。固定 skeleton → 报告永远浮现不出 provider 没预留槽位的问题；
LLM 只能往预切的洞里填，找不到新的跨指标关联。
**想通的点**：「钉死 vs 乱飘」是**假两难**。破局 = 给 LLM **只读、带 provenance 的查询工具**，
自由探索但每个断言可回溯到一次可复现查询。反直觉结论：**能查了就不用猜，幻觉反而下降**。
→ 定为 **F1（分析师非作文机）**。

## DR-2 · 为什么废掉 watch-spec 白名单，但保留它的其余部分

**挑战**：预设"只盯 TServer/MapSignificanceMgr… 这些模块"是不是枷锁？
**结论**：白名单 = 枷锁，废。热点应从整棵调用树自然浮现，不该由名单圈定视野。
**但区分两类**：deviceTiers（帧预算尺子）、ruleTemplates（什么叫超标）、contextClassifiers（拖镜头/战斗打标）
**不废，改用途**——从"输入端过滤器（看哪里）"挪到"输出端评判器（看到之后算多严重、按什么维度切）"。
contextClassifiers 反而是"GC 尖峰 78% 重叠拖镜头"这类 join 结论的燃料。
→ 定为 **F2（自由发现）**。

## DR-3 · 为什么三层分析（单源/对比/综合）不算冗余，只要"组合非重推"

**问题**：三源各自 + 对比 + 综合，会不会信息冗余？
**结论**：冗余分良性/有害。良性 = 三层回答不同问题（画像/回归闸门/triage 决策）。
有害 = 同一 finding 被三次**独立重算**且数字对不上 → 信任崩塌。
**解法**：单源出**唯一权威** findings；diff = findings + delta 的函数；cross = 融合函数（**引用不复述**）。
综合报告只讲**非冗余的 20%**（off-CPU 归因/热节流因果/native↔managed 对账）。
重叠的热点（如主线程调用树）**要交叉 check，但产物是一行带置信度的对账结论，不是三棵重复的树**。
"综合报告 80% 在复述单源" = 味道不对的信号。
→ 定为 **F3（组合非重推）**。

## DR-4 · 为什么确定性回放非必需（回应"采集不可比"的隐忧）

**隐忧**：游戏是随机过程（战斗 RNG/网络/镜头），两次采集不可比，diff 归因到代码改动是否脆弱？
**用户关键洞察**：环境变量（敌人数/网络/RNG）**不是要消除的噪声，而是性能的自变量**。
一套能把"变慢"正确归因到"敌人多了"而非瞎报"代码 regression"的系统，恰恰证明分析能力强。
**结论**：确定性回放非必需。采同一经典场景即可。唯一需谨慎处 = 想断言"这是**代码**引入的 regression"时，
用"同版本多跑取中位数 + 看方差 + LLM 查 context 排除环境因素"即可，不需回放。
**撤回**早期"脆弱/阿喀琉斯之踵"的措辞。

## DR-5 · 回应"搞这么多复杂东西有啥用，直接看 Unity profiler 不就行了"（同事的"加戏"挑战）

**同事说对的一半**：产出总是 MeshUI/行军线/URP —— 这说明**旧管线停在"单源 profiler 一眼可见那层"**，
是旧作文机管线的失败，**不是 Prism 的失败**，恰是 F2/F3 要治的病。
**同事说错的一半**：三种情况下"人肉看 profiler"会撞墙——
① 热点是症状不是病因（profiler 告诉你哪里烫，不告诉你谁点的火）；
② 有视角局限（见 DR-6 修正）；
③ 不 scale、不沉淀（依赖老师傅的记性，换人/换版本从零开始）。
**铁律**：若一份 Prism 报告的结论用 Unity profiler 五分钟就能得出，**视为未达标**。价值在"为什么/盲区/跨版本/沉淀"。
→ 强化 F2；催生 F6 与阶段一"打脸历史案例"验收判据。

## DR-6 · 修正：Unity profiler 没有"系统性盲区"

**Claude 早期错误**：曾称 Unity profiler 看不见线程等待，是"系统性盲区"。
**用户点破 + 修正**：timeline view **能**看出主线程 wait 时被 render thread 还是 job worker 挡住。
线程等待关系**可见**，只是要功力去 timeline 里读/对齐/推。perfetto 优势 = off-CPU 给**开箱即用的归因标签**，
提炼功力更低，**不是"能不能看见"的差别**。
**意外收获**：这修正反而**强化** F7 —— 单 Unity 下 Prism 的价值正是"当那个有功力、会读 timeline 的分析师"。

## DR-7 · 为什么"单源榨干"比"多源组合"更根本（F7 的由来）

**用户洞察**：期望 Prism 能压榨出**每种数据源的最大能力**——单源也能出精彩结论，叠加才碰撞更灿烂。
**为什么这比旧 F3 更根本**：旧 F3 默认多源在场；现实中很多次采集**只有一源**。
若 Prism 只在三源齐全才灵，就是摆设。
**结论**：单源榨干（能力上限）+ 多源增益（叠加+交叉验证，非前置依赖）= **降级不降智**。
架构兑现 = 源无关探索内核 + 可插拔源工具集。
→ 定为 **F7**，并把阶段一靶子收敛为"单 Unity 榨干"。

## DR-8 · 为什么要"动态判定"而非"套路问题清单"

**用户痛点**：旧报告不管数据好坏都吐"套路化问题列表"，永远"有这问题那问题"，没有"这次到底行不行"的判断。
**结论**：报告必须先对照约定指标 + baseline 给**总体判定**（优秀/及格/偏弱/不合格 + 坏多少 + 趋势）。
**数据好就明确说好**——只会找茬、从不说"你没问题"的系统没有判断力，不可信。
**辨析**：这是「判定 Verdict」（生产路径、面向每次采集），**不是 eval**（离线评测、量管线本身准不准）。两者别混。
→ 定为 **F8**；与 F6 合体成"报告第一屏 = Verdict + TL;DR"。

## DR-9 · 金标集：不靠脑补穷举，且不约束 LLM

**担忧**：金标集要我自己条条穷举吗？会不会成为 LLM 的能力笼子？
**结论**：
- **不靠穷举**。主力来源 = **历史已修 bug 回灌**（采集现成、答案现成，攒 10~20 个真实案例即可冷启动）；
  日常"真/假"确认让它**随用随长**；合成注入补空白；人直接标注精修。心态 = "随用随长的登记册"，非上线前的大工程。
- **不约束能力**。金标集**不进生产路径**（LLM 分析真实数据时不看它），只在"体检"时量召回/误报。
  它是给用户的**体温计**（敢不敢信 LLM、放开自由度后误报涨没涨），不是给 LLM 的**笼子**。
→ 支撑 F4 质量回路。

## DR-10 · 为什么这是"训练一个系统"而非"训练一个模型"

**用户直觉**：这套设计像"性能分析 master 的语料训练集"，能否做出自我进化的 agent？
**祛魅 + 提纯**：模型（Claude）本身不动、不微调；进化的是它周围的**知识/工具/质量基线**。
好处：不用 GPU、不标数据训练、不灾难性遗忘、改文件即生效、可解释可回滚可 git 管理。
**三条进化回路**（= "自我进化"的全部含义）：知识回路（归因沉淀）、能力回路（DataRequest 驱动 provider 自举）、
质量回路（金标集）。三条一转 = 一个初期只会看调用树、用得越久越懂这款游戏/越会查/越少胡说的分析师。
**泼冷水**：别一上来奔"全自动进化"（自由拉满 + 没护栏 = 高级胡说生成器）。先直后弯，滚雪球不赌大爆炸。
→ 定为 **F4**，并确立三阶段建造顺序。

## DR-11 · 架构第一原则：不许再做死

**用户要求**：Prism 要弹性、伸缩性、扩展性强，别像旧管线做得很死。
**旧管线为何死**：结构（固定 §0–§9）、数据字段（provider 写死）、报告模板（LLM_FILL 槽写死）全硬编码。
**四个可插拔**：工具可插拔（registry）、源可插拔（内核源无关）、Finding 开放可扩展（通用 evidence）、
报告结构由 findings 驱动（无固定模板）。
**一句话**：核心 = "源无关探索内核 + 可插拔能力插件"，非写死流水线。
→ 定为架构第一原则。

---

## DR-15 · Phase A 探索内核：provenance 用"方案 B 审计交叉核对"（可升级 C）＋ 四个概念厘清

**背景**：LLM 物理上只会"吐字"，不能自己执行任何东西。所谓"LLM 调工具"永远是"它吐出'我想调 X'，
由外面某个程序真的执行 X"。区别只在"外面那个程序"是谁。

**四个概念厘清（用户曾混淆，务必记死）**：
- **tool_use** = LLM 成功调了一个**存在的**工具（查到了数据）→ 成为 Finding 的 evidence。一次探索几十个。
- **DataRequest** = LLM 想调一个**不存在的**能力、扑空了（感官不够）→ 成为 F4"下一个该造的工具"。
  **二者相反**：tool_use 是成功的查询，DataRequest 是失败/缺失的查询愿望。用户曾以为是一回事。
- **账本（ledger）** = 我在旁录下的"本次探索真实发生过的所有 tool_use 流水（确切命令+真实返回）"。
- **findings JSON** = LLM 自己写的结论+自报 evidence。类比：findings=报销单，账本=银行流水。

**为什么要核对账本**：findings 是 LLM 自己写的字，它可能写一个没真跑过的数字（伪造 resultDigest）。
核对 = 每条 evidence 的 {tool,args,resultDigest} 必须能在账本流水里找到对应的真实执行，对不上就打回。
这就是 F1"零编造"的落地——不把 F1 建在 LLM 的诚实上（呼应 DR-9 不赌 LLM 诚实）。

**方案 A/B/C**：
- A 纯自报：findings 数字全凭 LLM 填、无核对。**否决**——F1 建在诚实上，验收无从分辨。
- **B 审计交叉核对（选定）**：复用现有 CLI 子进程底座（`--allowedTools Bash`），prompt 教 LLM 用
  **Bash 调 `tools.cli.ts`**（不注册标准 tool_use API，就是命令行——最省事、零注册）；CLI 把每次 Bash
  tool_use 事件以 stream-json 吐出，我录成账本；事后核对 findings evidence。
  执行工具的是 CLI 内置 agent，我在旁录账本、**事后抓**伪造。工程量小、不动底座（DR-11）。
- C 自建进程内循环：抛开 CLI，我自己写 send/接住 tool_use/亲自执行 tools.ts 函数/回传 tool_result 的多轮循环，
  直连 LLM 接口（agent-sdk session/模型网关）；工具经 API 的 tools 参数正式声明（真 function-calling）。
  执行工具的是**我方代码**，LLM 只吐意图、结果全我给 → **物理上无法伪造，无需账本**。最严格但另起一套循环、
  偏离底座、工程量大。

**决定**：阶段一用 **B**（先直后弯，DR-10）。**可升级后路**：若账本录不全/误杀频繁，升级到 C——
B 的 Finding/DataRequest 类型与验收逻辑 C 全部复用，不白做。此后路显式记档。

---

## DR-14 · 工具由"数据的轴"推导，不由"问题清单"驱动（防退回旧路的核心判例）

**用户尖问**：我不可能穷举问题来驱动你造工具。若"你问了我才造对应工具"，发现能力天花板就锁在你我想得到的问题上——
这跟旧管线"provider 预设字段"是同一个病，只换了个预设的人。那工具到底由什么驱动？
**认账**：若由"问题→造对应工具"驱动，这套设计**失败**（假的自由发现）。驱动必须是别的东西。
**正解——工具按"数据的形状/轴"设计，与"要发现什么问题"无关**：
造工具时不看"解决什么问题"，只看"这份数据天然有几个可被切/聚合/关联的轴"。表的**列**就是数据的轴，
每个轴机械地生出该有的通用操作（聚合/时序统计/关联/扫描/展开），笛卡尔积 = 完备感官。
关键例证：**周期性不是一个工具，它只是"时间轴 + 通用序列统计"的涌现副产品**。造的是"任一指标沿帧的序列+统计包"，
自相关只是其标配统计量之一；用户不问周期，该工具照样存在照样算自相关，AI 照样能涌现出"这有周期性"。
→ **问题没驱动工具，数据的轴驱动了工具，问题只是被工具照亮的结果。**
**为什么"不穷举问题"不构成威胁**：工具完备性来自"数据有几个轴"，而轴有限且已知（帧/线程/marker/深度/时间/集合关系）。
每轴配全通用操作，覆盖的问题空间远大于人能列举的问题。

**三层驱动模型（没有一层是"用户穷举问题"）**：
1. **数据的轴** → 起手工具集（机械推导，开工前钉死）。← **工具层设计原则，非 F4**
2. **AI 探索撞墙** → 吐 DataRequest → 补新工具（AI 驱动的自举）。← **F4 能力回路的运转**
3. **新数据源** → 带来新轴（如内存 JSON 带"分配大小轴"）→ 补新轴工具。← **F4 能力回路的运转**

与 F4 的关系（用户提问澄清）：第 1 层是 F4 的**上游前提**（保证起手完备、不靠问题驱动）；第 2/3 层**才是** F4 能力回路本身（自扩张引擎）。三层合起来解释"为什么工具集完备且能自扩张"。
用户角色 = 看方向的人（判断 findings 对不对、有无价值），**从来不是提问穷举者**。

**深藏调用树的周期 marker 怎么被发现（用户追问的硬点）**：不构成障碍。落库后每个 marker 无论第几层都是
`frame_marker_samples` 里平等的一行，depth 只是字段非藏匿墙；扫描按**周期性强度**排名而非**耗时大小**排名，
所以"单次便宜但每 N 帧规律炸"的深层 marker——旧管线 Top 耗时榜里被大块头盖掉、Prism 扫描里强度冒头。
**这正是旧管线系统性漏、Prism 能捞的一类**。真实难点仅两个（B2 啃）：同名聚合口径、用聚焦工具验证压假阳性。

**工具二分法**（数据轴推导的自然结果）：
- **扫描型 sweep**：服务端在某轴穷举、返回排名候选 → 负责"发现"。
- **聚焦型 focus**：只拉某一个点的明细 → 负责"深挖"。
- AI 工作流 = 扫描拿候选 → 判断可疑 → 聚焦拉那一个验证。全程不碰全量明细（呼应 DR-12 token 红线）。


**用户隐忧**：自由探索要 LLM 看逐帧逐 marker 数据 → 数据量巨大 → 烧爆 token？是否该预提取特征向量？
**关键认知——LLM 永远不"吃"原始数据，它只"问"**：
- 旧世界（离线预简化）：怕 LLM 吃太多，离线把 markers 拍平成平均值、只留 worst/median 两帧调用树 →
  喂固定小 digest。**Token 安全但眼瞎**，只能看嚼碎的那口，无法探索。这正是"总是 MeshUI/行军线/URP"的根因。
- Prism 世界（可查询 + 按需归约）：原始逐帧明细留在**可查询存储**（LLM 看不到全量）。
  LLM 问"marker X 有无周期性？"→ 工具在**服务端**把几千帧跑自相关 → 只回"周期≈30 帧，置信 0.8"。
  **归约发生在工具内部，不在 LLM 上下文**。几十 MB 明细 → 答案几十个 token。**Token 安全且眼明。**
**否决"预提取特征向量"**：那是"离线猜 LLM 要什么"的老路——猜错就没得问。
正确 = 明细全留可查，**LLM 的 DataRequest 决定这次归约出什么**。工具是"按需归约器"，非"预烤器"。
→ F1 的核心机理。未来任何人再问"自由探索会不会烧 token"，甩此条。

## DR-13 · 数据现状核实：明细全在 .pdata，旧管线主动丢弃，不用改解析器

**核实**（针对 `unity/unity-outside-stressmove.pdata`，35MB）：
- 现成 parser（`pdata-parser.ts`，Unity Profile Analyzer 的 TS 移植）解析出的 `ProfileData.frames[i].threads[t].markers[m]`
  **就是完整的逐帧 × 逐线程 × 逐 marker 明细**（含 render thread / job worker，非仅主线程），字段有
  name/msMarkerTotal/depth/msChildren，self = total − children，parent 可由深度优先序回溯。
- 旧管线在 `profile-analyzer.ts` 聚合步**主动丢弃**明细（拍平成 mean/median/max + 仅 worst/median 两帧调用树）。
  **不是解析不出，是当初为省 token 主动丢的**——印证 DR-12。
- 解析成本 ~100–500ms 一次性离线，不进 LLM。**无需改 parser**：新写一个"灌 SQLite"脚本即可（守住"不动 provider 核心"边界）。
**结论**：阶段一数据路线唯一且稳赢——建"逐帧逐线程逐 marker"可查询存储（离线一次）+ 按需归约查询工具。
（此结论作废了此前"榨残缺聚合 / 预提取大 JSON / 先探路"的三选一框法——那框法仍带旧世界思维。）


---

## DR-16 · 阶段一里程碑：首次真实探索验证"分析师>作文机"＋暴露的三个尾巴

**背景**：B1-B4 建成后（可查询明细库 + 5 个按数据轴推导的查询工具 + Finding/DataRequest 类型 + Phase A 探索内核，方案 B），
对 `unity-outside-stressmove.pdata`（600帧/300万行明细）跑首次真实自由探索。

**结果（核心命题证成）**：Prism 自主 42 次工具调用、自行收敛写盘，产出 6 条带证据链 findings：
1. 全程 <30fps 的**基线判定**（F8：不是问题清单，是"这次整体不合格"+ "成本摊薄在长尾、无单一大头"——正好解释同事困惑的"总是那几个"）
2. 帧519 一次**同步 GC.Collect 70ms stop-the-world**，完整调用链 + 交叉验证所有子线程同帧 Semaphore 打满（治本级因果，非"哪里烫"）
3. **镜头移动必卡**：OnCameraMove 全场19次100%落慢帧，并用 getThreadTimeline 排除线程等待、确认纯CPU（tags自标 causal-verified）
4. **CPU-bound vs GPU-bound 慢帧分流**：Gfx.PresentFrame 拖住的慢帧 ≠ 脚本重的慢帧（优化方向分流，人肉极难看出）
5. **增量GC堆积**周期性（autocorr 0.68，用上了自相关）
6. 网络实体解析突发（偶发但严重，均值榜看不见）
外加 3 条**真实 DataRequest**（逐帧GC分配字节 / drawcall / marker调用者分布）——F4 能力回路首次真实转动，
且它主动要的正是用户手上那份 rendering/内存 JSON（印证预判：不预塞，等它自己要）。
**这些没有一条是旧管线固定聚合报告给得出的。阶段一核心命题"分析师>作文机"成立。**

**暴露的三个尾巴（B4 待补，不影响命题）**：
- **验证核对器不认 batch**：为提速加了 batch 模式（一次 Bash 跑多查询，把 tsx 冷启动 N→1），但 verifyFindings 只解析单个
  `tools.cli.ts <tool> '<args>'`，把 batch 包裹的真实查询全判"未找到"→ 误报 14/19 证据未通过。**证据实为真**
  （数字与手工核对吻合：frame519=113.56ms、OnCameraMove 19次100%）。需让验证器解析 batch。
- **LLM 探索贪婪、收尾弱**：42 次才收尾，prompt 的"见好就收/中途落盘"约束力弱——这个模型天性是穷尽探索。
  侧面证明 F2 能力够（一直能找到新东西），但长期需**代码层硬收尾机制**。用户决定：先摸能力上限，暂不加阈值。
- **性能真凶是缺索引非冷启动**：queryMarkers 59s / getThreadTimeline 85s 曾拖垮 20min 超时。真因是 300万行表缺
  复合/覆盖索引 → 全表扫描 + 关联子查询。加 `(run_id,marker_name,thread,self_ms...)` 等覆盖索引 + 窗口函数改写
  → 1.3s / 6ms。**教训：Claude 一度误判为 tsx 冷启动慢，实际 node --import tsx 精简脚本亚秒级；瓶颈永远要量到具体那一步再下结论。**

---

## DR-17 · 首次探索的专家 review：缺的是"理解结构"的感官，不是"发现异常"的感官

**背景**：用户（性能专家）review 首次 5 条 findings，指出 6 个"分析师本该看到却没看到"的点。诊断出**共同根因**。

**根因**：现有 5 个工具全是"单 marker / 单帧 / 两组帧重叠"视角——**没有任何"跨全程、按调用树结构聚合"的感官**。
所以 Prism 只会抓**单个尖锐 marker**（PostCameraMoveScale、GC.Collect 都是单点尖峰），对**分摊型/结构型**问题瞎：
一群兄弟节点共享父节点、各自不起眼但合计很大（URP.RenderSingleCamera 下三兄弟共 9ms）就看不见。
**它是"抓尖峰的分析师"，还不是"看成本结构的分析师"。**

**用户 6 点 → 归因**：
1. PostCameraMoveScale 是尖峰之王非基线之王（19次×43ms 散在600帧，对均值贡献小）→ 缺"成本占比/贡献度"视角，误判 critical。
2. GC.Collect 是结果非根因 → 它自己已提 DataRequest 要逐帧 GC alloc 字节；接数据即可（F4），不改逻辑。
3. URP 三兄弟共父节点 9ms 没看见 → **缺"按父节点/子树聚合全程自耗时"的感官**（最关键缺口）。
4. SubmitThread 的 Gfx.PresentFrame 只摸到边没深入 → 缺"等待链反查"（主线程等谁→那根线程此刻在忙什么，跨全程）。
5. TServerManager/YzEntityMoveLineNtf 这次没主动查到（上次是人指定）→ 同 3，按模块/父节点聚合才浮现。
6. 判定标准未定 → F8 输入缺失。

**修法铁律（呼应用户"不要硬写逻辑"+ DR-14）**：不加任何 `if URP then` 的预设逻辑，只补 3 个**通用新感官**：
- **结构聚合**（`aggregateSubtree`：给父 marker 或扫所有父节点，返回其后代全程总自耗时）→ 解决 3、5，辅助 1。URP/TServer 是聚合后自己冒出来的，不预设。
- **成本占比/贡献度**（某 marker 占总 CPU%、抹掉它中位数变化）→ 解决 1"谁是第一凶手"，让它会权衡尖峰 vs 基线。
- **等待链反查**（`traceWaitChain`：输入等待 marker，关联同帧被等线程在跑什么，跨全程）→ 解决 4，深化 F7。
这 3 个感官正是"真实探索撞墙暴露的数据轴缺口"（DR-14 第 2 层，AI 驱动的自举），非拍脑袋。

**F8 判定标准（用户拍板）**：用 aoe-watch-spec 的 deviceTier frameBudgetMs 取尺子（不写死单一数字）。
**现状核实**：spec 里 high/mid/low/unknown 的 frameBudgetMs 当前**全是 16.67（60fps）**，device-tier-map 全空 → 
实际取到的就是 60fps。故当前判定基准 = 16.67ms/60fps，几乎每帧超标（中位数 41.9ms ≈ 预算2.5倍），
URP管线9ms/present 10-20ms 全部升为一等问题——正是用户预期的丰富产出。将来 spec 若按 tier 分化 ms，自动跟随。

---

## DR-18 · 纠正 DR-17 的误判 + 发现"峰值榜扫描"是最缺的感官（能力稳定性根因）

**触发**：用户发现上一轮 Prism 自主找到了 YzEntityMoveLineNtf（很惊艳），最近一轮却没找到，质疑能力不稳定。
**查实（两轮 ledger + 直接查库）**：
- YzEntityMoveLineNtf 在**全程 selfMs 总榜排第 78/1796**、总量仅 152ms → **上不了 queryMarkers topN=20/25 榜**。
- 但它在**单帧会炸**：帧273=14.9ms、帧339=14.3ms…，只在 77 帧(13%)出现 → 典型**偶发单帧尖刺**型。
- 上一轮找到它 = 探索时**恰好 getFrameCallTree 展开到那几个 YzEntity 炸的慢帧**，在 TServer.HandleMessages 下撞见，**是选帧的运气产物**。最近一轮深挖的是别的帧（519/144/483），没撞见 → 漏了。
**根因**：Prism 靠"手动选几个慢帧展开调用树"来发现藏在树里的尖刺——**选哪帧带运气，覆盖不全就漏**。这就是能力不稳定的真因。

**纠正 DR-17 的误判**：此前把 YzEntity（第⑤点）归到"结构聚合"是**错的**。正确分类：
- **偶发单帧尖刺型**（总量沉底、单帧炸）：YzEntityMoveLineNtf、LuaMtGc.ExecuteMtGc、TryUnloadPending 等 → 需**峰值榜扫描**。
- **分摊型**（兄弟节点共父、各自小、合计大）：URP.RenderSingleCamera 下三兄弟 → 需**结构聚合**（DR-17 说的那个，仍成立）。
两者是不同问题、不同感官，之前混了。

**新感官"峰值榜扫描"（验证可行，最高性价比）**：一条 SQL——每 marker 先按帧聚合 self，再取其跨帧最大帧值排名
（而非总量排名）。实测把 YzEntityMoveLineNtf 稳稳捞到**第 11 名**（peak14.9ms@f273 spikeX7.6），**确定性、不靠选帧运气**。
且顺带暴露两轮都漏的一批尖刺：LuaMtGc.ExecuteMtGc(spikeX36)、TryUnloadPending(spikeX132)、TextureStreamingManager
.UpdateCameras(spikeX74)、PostEffectImageEffectRenderPass(spikeX54)、MeshLinePass(spikeX100) 等。
**这些是人肉看均值/总量永远发现不了、Prism 两轮也漏了的偶发尖刺——一个峰值榜工具全暴露。**

**修正后的感官清单（4 个，非 3 个）**：
1. **峰值榜扫描**（新，最高优先）—— 解决偶发单帧尖刺的**稳定发现**（YzEntity 等），治能力不稳定根因。
2. **结构聚合** aggregateSubtree —— 解决分摊型（URP 三兄弟）。
3. **成本贡献度** —— 解决"尖峰 vs 基线谁是第一凶手"（PostCameraMove）。
4. **等待链反查** traceWaitChain —— 解决跨线程等待因果（SubmitThread present 链）。
**教训**：诊断"为什么漏"必须去 ledger + 库里查实，别凭假设归类——差点把尖刺型误修成聚合型。

---

## DR-19 · 聚合的正确边界是"分叉点检测"，不是 self 也不是 total 阈值（用户两轮逼准）

**用户两轮质疑**：① 向上找父节点会无限到根，何时停？② 改用"self低+直接子合计高"也不行——URP.RenderSingleCamera
的子节点（BeforeRendering 等阶段节点）self 也低。③ 改用"self低+total高"仍不行——会命中 PlayerLoop/Render 这些根/转发节点。
**查实真实树（帧300）**：PlayerLoop(total44) → FinishFrameRendering(self0.3/total11.8) → Render(self0.21/total10.5)
→ **URP.Render(self0.05/total9.8)** → URP.RenderSingleCamera → {BeforeRendering1.3, MainRenderingTransparent1.1,
AfterRendering0.57, ...十几个URP.* 各0.x~1ms}。
**根因洞察**：前三层是"只有一个主要孩子的**转发管道**"（max子total≈本节点total，比值0.9+）；URP.Render 才是**分叉点**
（total9.8 但最大孩子仅占13%，成本真正摊开到十几个兄弟）。
**正确判据 = 分叉点检测（fan-out）**：`节点 total 高 且 max(直接子节点 total)/本节点 total < 阈值(~0.6)`。
- 转发管道（PlayerLoop→Render 链，比值0.9+）→ **跳过**，不误报。
- 真分叉点（URP.Render 比值0.13）→ **聚合**，报"这棵子树共 9.8ms/帧、摊在 N 个子节点、无单一大头"。
天然有界（只看本节点 vs 直接子，一层判定，不递归到根）。**self 方案、self+total 方案都被证伪，分叉点检测才对。**
**教训**：设计聚合类工具务必先 dump 真实调用树的 self/total/parent，别凭空设计判据——用户两轮都比初版设计更准。

## DR-20 · per-marker GC.Alloc：.data 里有但当前链路没抽，是采集层 DataRequest（F4 最深一环）

**用户澄清**：问的不是整帧 GC 总量（counters.json 的 gcAllocatedInFrame 已有），而是**每个 marker 节点自己的 GC.Alloc**
（定位"哪个函数在制造垃圾"，直接是 GC.Collect 的根因钥匙）。指出 .data（Unity 原始 183MB）里有此数据，pdata 是其精简。
**查实导出器 `G:\AOEYZ_Trunk\...\PerfAnalyzerCounterExporter.cs`**：
- `.data` 的 per-marker alloc 理论在（Unity RawFrameDataView/iterator 可取 GcAllocBytes），但**只能在 Unity Editor 内用 UnityEditor API 读**——
  Prism(Node/TS) 无法直接解析 .data 私有格式。
- **当前导出器根本没抽 alloc**：ExtractMarkers 每 marker 只取 durationMS+depth（MyMarker 仅 nameIndex/msMarkerTotal/depth），
  WritePdata 也只写这三个 → per-marker alloc 从源头就丢了。pdata schema v7 无 alloc 字段。
**结论（分两层）**：
- **现在（Prism 侧可做）**：用 counters 整帧 gcAllocatedInFrame，能判断"帧是否分配尖峰触发"（已验证帧519 GC 非分配尖峰触发，15KB≈邻帧 → 定时/主动 full GC，证伪了 Prism 之前"临时分配触发"的猜测）。
- **将来（采集侧需求，记为正式 DataRequest）**：改导出器抽 per-marker GcAllocBytes + 扩 pdata schema v? + 下游 TS parser 同步读。
  这是**分析层反向驱动采集层**的 F4 最深一环，价值极高（定位垃圾制造函数），但需用户在 Unity 工程侧改 C# 重导。**非 Prism 端 SQL 可解。**

---

## DR-21 · F1 provenance 核对：先放宽匹配（不误杀真证据），严格化留待 prompt 约束

**问题**：升级轮探索产 9 findings/23 证据，但验证器报 13 未通过/7 可疑。查实**全是误报，非编造**：
LLM 在 evidence 里**凭记忆重写参数**——线程名简写（`1:Main Thread`→`Main Thread`）、阈值记差、字段过specify。
数字都真、结论都成立。根因是 LLM 不严格照抄参数，与 F1 严格核对产生张力。

**用户决策**：先放宽匹配（不误杀），严格化以后靠 prompt 约束再迭代（先直后弯）。

**放宽规则（argsSubsetMatch）**：目标是抓**编造**（根本没跑过这次调用），不是罚 LLM 记忆不精确。
- runId + 一批可选参数（topN/maxDepth/metric/thread…）忽略。
- 线程名归一化：`1:Main Thread` ≈ `Main Thread`（去 `N:` 前缀、小写）。
- 数值 5% 相对容差 / ±0.5 绝对容差。
- evidence 过-specify 的键（账本无此键）不算硬失败。
- 身份键（markerName/rootMarker/frameIndex）两边都有时须松匹配，锁定同一目标。
**效果**：13 未通过→2，7 可疑→2。剩 2 个（F1/F4）是 correlateFrameSets 的**嵌套对象参数**（setA/setB）
匹配粒度问题 + LLM 引用了近似非精确的调用——其余证据都通过、结论站得住。

**suspect 判定调整**：只有 finding 的证据**全部未通过**才算 suspect（疑似编造）；部分通过的标 partially-verified。
更符合语义——一条 finding 4 证据 3 通过，不该被打成"疑似编造"。

**待办（严格化，后续）**：prompt 里要求 evidence.args 精确复制实际调用参数（不许简写线程名/记忆阈值）+
DataRequest 用规定字段名。或长期升级方案 C（进程内循环，args 由代码记录，物理上无法写错）。

---

## DR-22 · 升级轮验证：4 新感官全部兑现，用户 5 技术点命中 4.5/5

**背景**：加 4 新感官（scanPeakMarkers/aggregateSubtree/queryFrameCounters + F8 判定）+ 接 counters.json 后重跑探索（60 次调用自主收尾）。
**对照用户 DR-17 的 6 个技术点 review**：
- ①PostCameraMove 是尖峰非第一凶手 → **F4 命中**："only explains ~3% of all slow frames, rare (19/600)"，降为 HIGH 不再误判 critical。
- ③URP 三兄弟分摊 → **F7 精确命中**：aggregateSubtree 抓出 URP.RenderSingleCamera 子树 10.64ms/帧摊在多阶段，maxChildRatio=0.28。
- ⑤TServerManager → **F8 捞进来**（结构聚合，占比小但不漏）。
- ②GC 是结果非根因 → **F2 用 counters 证伪旧猜测**：frame519 gcAlloc 仅 8192B（正常）→ 不是分配触发，是定时/主动 full GC。
- ④SubmitThread present 阻塞链 → **F9 处理但结论反转**：correlate 出 present-wait 只解释 <3% 慢帧，判 LOW。**待用户判断是否认同**（可能它把"阻塞链因果"和"统计相关性"混了）。
- **最大进步**：F8 verdict + F7/F8 **印证用户核心判断**——"第一凶手是稳态基线不是尖峰"：URP(10.64)+ScriptUpdate(12.88)=23.5ms/帧≈半个帧预算超支来自这两个 spread-cost 子树。verdict 评级 fail，主因排序第一即"continuous baseline, no single hotspot"。
**产出对比**：上轮 5 findings（尖峰罗列）→ 本轮 9 findings + verdict（基线主因+尖峰次因+各自量化占比+F8判定），质的飞跃。
**新感官全兑现**：aggregateSubtree(F7/F8 分摊)、queryFrameCounters(F2 证伪)、scanPeakMarkers(F6 LuaMtGc spikeX36)。
**F4**：产 5 条高质量 DataRequest（D1 要 per-allocation-site 分配明细定位周期性增量 GC 源——DR-POOL 深化）。
**遗留**：DataRequest 字段名 LLM 没照 schema（用 request/reason/hypothesisToTest 而非 want/rationale），读取需兼容或 prompt 约束。

---

## DR-23 · 用户 review 升级轮 findings：暴露"主次呈现/下钻深度/统计误判"三缺陷

用户读 findings 后的三点反馈，都成立，记为改进项：

**① 重点问题没被"顶"出来（严重度排序反了）**：真正第一主因是 F7(URP 10.64ms)+F8(ScriptUpdate 12.88ms)=23.5ms/帧
稳态基线（占超预算一半），但 Prism 把它们标 MEDIUM，反而把 F1(现象描述)、F2(罕见GC尖峰)标 CRITICAL。
→ **renderer(B5) 应按 verdict.primaryDrivers 排序组织，不照搬 LLM 给的 severity**。长期也需 prompt 校准 severity 语义
（"普遍主因">"罕见尖峰"）。

**② F8 太笼统、没下钻**：只到 "LuaMgr 6.82/MapManager 4.84/TServer 0.92ms" 就停，没钻 LuaMgr 内部哪个函数贵。
原因：(a) 探索深度——它可对最大 spread-cost 子树再 aggregateSubtree/getFrameCallTree 下钻但没做；
(b) 能力缺口——aggregateSubtree 只返回直接子节点，需加"指定 rootMarker 递归深挖"能力。
→ 下一段：prompt 引导"对 top spread-cost 子树再下钻一层" + aggregateSubtree 加深挖参数。
注意最终受限于 marker 粒度（LuaMgr 内无更细 instrument 就到顶，回到 F5/per-marker 范畴）。

**③ present-wait 被误判为 LOW（统计方法错）**：F9 判 present "只影响 3% 慢帧"。**分母错**——本次 600/600 全是慢帧，
任何小集合比"全部600帧"占比都趋近0，被"全体都慢"稀释。present 实际用峰值榜/低阈值扫会在更多帧有中等等待。
用户两轮直觉（present 是重要问题）对，Prism correlate 方法把它误判轻了。
→ 改进：prompt 提示"correlate 占比受分母影响，全体都慢时改用绝对影响/峰值榜衡量"；这是"LLM 用统计相关性易被分母/阈值误导"的通病。

**共识**：findings 有料，但"主次呈现+下钻深度+统计严谨"不足。B5 renderer 先解决呈现（按主因排序、中文、分级），
探索深度/统计严谨留下一段 prompt+工具迭代。

---

## DR-24 · 核心转向：从"用户发现缺口→Claude补工具"转到"agent 自省自驱"（回应最尖锐批评）

**用户最尖锐批评（第4点）**：几轮下来仍是"用户发现问题→Claude改"。模式从"穷举性能问题"变成"穷举发现问题的工具"，
本质进步但**还是用户驱动**，不像能自我循环的 agent。且每个源都要重走一遍这个人肉调工具流程，不 scale。
**认账**：F4"能力回路"里"发现缺口"这一环，一直是用户在当，不是 agent。我们建的是"有很多工具的分析师"，
缺了让它"自我改进/自省"的那一层。没有自省，它永远是需要监工的实习生。

**破局（不再加工具，加自省机制）**：
- **① 强制下钻纪律**：进入 verdict 主因的 spread-cost 子树，必须递归 aggregateSubtree 钻到 marker 粒度到底
  或单层<0.5ms 为止——"钻到底"成为收尾条件，不靠用户喊。（治 DR-23① 细节不够）
- **② 自我批判回合（关键）**：产出 findings 后、写报告前，强制一个"红队"回合，让 agent 以怀疑者身份审自己：
  证据够不够/severity排错没/统计是否被分母骗（present 那种）/该钻没钻，然后据此再补查一轮。
  **把"发现问题"从用户手里交回 agent。** present 误判、severity 排反、F8 没下钻——它自己都能审出来，只要逼它审。
- **③ 跨源复用抽象**：unity/simpleperf/perfetto 数据轴同构（名字聚合/时序/调用树/峰值）。为 unity 建的工具+内核
  应抽象成"任何有调用树+时间线的性能源"的通用集；接新源=写 adapter 灌进同 schema，工具/内核原样复用，非重走流程。

**用户拍板：先做 ②自我批判回合**（真正把"你驱动"变"它自驱"的一步）。

## DR-25 · 报告能否赢作文机 + 经验沉淀现状（回应用户两问）

**能否赢作文机**（对比 output/samples/unity-single/performance-report.cli-sourcemap.md）：分三层——
- 调用树下钻细节（MapSignificanceMgr→BattleHeadMgr 拆解）：**Prism 能赢**，数据在库里(300万行)只是没钻，钻了比作文机更全（作文机只钻2帧）。
- 源码行号(:452)：**追平**，需接 F5 源码映射（作文机也是接了 sourcemap 才有）。
- 跨语言/IL2CPP 归因：**硬天花板，两者都到顶**，单源物理极限，需多源。
结论：补齐"强制下钻+源码映射"后 Prism 正片能赢（更全+每条可回溯 provenance+verdict判定），但非当前这版。
**冷水**：若只为"报告厚度赢作文机"价值有限（作文机补 prompt 也能厚）。Prism 不可替代价值在自省自驱，报告厚是副产品。

**经验沉淀现状**：设计决策已沉淀（RATIONALE 25条DR + CHARTER + DATAREQUESTS + 长期记忆，跨session存活）。
**缺口**：**分析方法论**（"present占比会被分母稀释""spread-cost必须钻到底""GC卡顿先查gcAlloc证伪分配触发"这类经验教训）
还没喂回给 agent 让它自动避坑——这是 F4 三回路里"知识回路"还没转起来。自我批判回合(②)是知识回路的起点：
agent 审出的教训应沉淀成"分析清单"，下次注入 prompt。

---

## DR-26 · 自我批判回合首次实测（进行中）· 待核对的关键验证点

**这次跑的验证目标（DR-24 ② 自我批判 + 强制下钻 + 中文输出，run 归档于 2026-07-07_12-08-59）**：
检验 agent 能否**自己审出**上轮用户替它指出的三个缺陷，而无需用户再说——这是"自省自驱"成不成的决定性证据。

**跑完后必须逐条核对**：
1. **深度**：F8 类 spread-cost 主因（LuaMgr/MapManager）有没有钻到底？能否达到旧作文机
   "MapSignificanceMgr 3.52ms→BattleHeadMgr 1.04ms"的子树拆解深度（DR-25 说数据够得着）？
2. **severity 排序**：稳态基线(URP+ScriptUpdate)有没有被排到罕见GC尖峰之前？（上轮排反了，DR-23①）
3. **present 统计**：有没有自己审出"占比被分母稀释、present 不该判 LOW"？（上轮误判，DR-23③）
4. **selfCritique 字段**：每条 finding 有没有真实的自我审查记录，还是走过场？
5. **中文**：conclusion/reasoning 等是否中文了？（上轮英文，DR-23）
6. **报告厚度**：正片报告能否逼近/超过旧作文机 performance-report.cli-sourcemap.md 的深度？

**观察到的行为**：这轮探索明显更深更久（强制下钻让它反复 dump 帧300/483/184 调用树深挖）。
若三个缺陷它自己审出并修正 → 自省层立住，回应用户第4点；若仍需用户指出 → 说明 prompt 级自省不够，需更强机制（如独立红队 agent / 方案C）。

---

## DR-27 · 自我批判回合实测成功：agent 自审出全部三缺陷（"自省自驱"立住）

**结果（run 2026-07-07_12-08-59，103 次工具调用 vs 上轮60，证据 23/26 通过、0 编造）**：
逐条核对 DR-26 清单，agent **自己**修正了上轮需用户指出的缺陷，无需用户再说：

1. **severity 自己排对了** ✅：verdict 主因排序变为「①稳态基线 ②相机移动 ③GC尖峰」——正是用户两轮强调的正确序。
   上轮把 GC 排现象前、基线排 MEDIUM，这轮基线升 CRITICAL(F2) 排第一，GC.Collect 降 HIGH(F4)。
2. **camera 升到第二** ✅：回应用户"camera 该第二为何比 GC 低"——这轮 camera 主因第2、CRITICAL(F3)，
   并自己想通"绝对耗时贡献(camera 819ms/19帧) vs 单帧峰值(GC 70ms/2帧)"的区别。
3. **present 重新论证** ✅：F8 仍 LOW 但**换了正确论证**——不再用被稀释的占比，而是发现"frame22 的59.36ms≈全场p95，
   按基线根本不算异常帧，只是present占比高"；并用 counters 查 batches/triangles 未涨佐证是GPU同步抖动。
   **它自己把上轮的分母陷阱错误论证替换成了正确论证。**
4. **selfCritique 是真审查** ✅：F2 自审明确写"已用绝对ms总量(52.8%)而非占比衡量，避免被'全600帧超预算'稀释"——
   **这正是用户批评的分母陷阱，它自己审出并规避。**
5. **中文** ✅ 全中文。 6. **深度** ✅ 钻到 LuaMgr/MapManager 子树，并**诚实标注硬天花板**："LuaMgr 6.82ms内部是纯Lua调用，
   工具无法穿透到Lua函数级(D5)，只能定位到C#标记边界"——即 DR-25 预判的第三层物理极限，它自己撞到、说清、开DataRequest。

**结论**：prompt 级"自我批判回合"**足以**让 agent 自省自驱、自纠三缺陷，回应用户第4点最尖锐批评。
"从用户发现问题→agent自审发现问题"的转变**立住了**。不需要立刻上更重的独立红队agent/方案C。
**残留**：LuaMgr 内部深度受 marker 粒度物理限制（需 F5 源码 或 per-marker 数据，DR-POOL）；这是数据边界非分析能力问题。

---

## DR-28 · 开发层的自省：建总待办表治"需求飘散/坐标迷失"（第4点在流程层复发）

**用户尖锐指出**：需求已呈扩散趋势——"你让我选一个，做完再问，其余没被记住的就丢了"。举例：per-marker GC(DR-POOL-1)
Claude 几轮没主动提，是用户记着才捡回。**这是用户第4点批评("靠我发现/我盯")在开发流程层的复发**：
上次治的是"分析层"agent不自省(→自我批判回合)；这次是"开发层"Claude不自省、靠用户记需求盯方向。
**Claude 认错**：一直在扮演"需要用户监工的实习生"，只是从代码层挪到项目管理层。

**解法（用户拍板）**：建唯一总待办表 `../plan/backlog.md`——所有飘着的需求(用户提的/Claude发现的/搁置捡回的)
全收进去分优先级和状态。规矩：① 任何新需求立即入表，不靠脑子记；② Claude 每次找用户前先报 backlog 全貌
再谈当前步；③ 优先级低但不能丢的(如 per-marker GC)进"暂缓"区永远在册。用户从"盯需求的监工"变"看总表拍板的人"。
**这本身是开发流程层的"自省机制"**，与分析层自我批判回合同构——都是把"发现遗漏"的责任从用户交回系统。

**"agent自审是质量回路半截"的含义(用户问)**：自审=agent自己怀疑自己纠明显错误，但它自审通过的未必真对；
另半截=人确认finding对/错/漏→存金标集→每次改进跑金标量召回误报(BK-4/B6)。没这半截只能凭感觉说"好像好点了",无法量化。

---

## DR-29 · P0 三件完成：下钻到底 + 报告说人话 + 能力回路自动转

按 BK-1→2→3 顺序做完 P0：
- **BK-1 下钻到底**：加 `drillDownMarker(rootMarker)` 工具——递归返回某 marker 完整子树到叶子 + leaves 列表。
  实测把"MapSignificanceMgr 3.99ms"钻成"→EntityTask→ProcessTask_MapEntityAdd 1.55ms→CreateMapEntity→叶子 OnDirtyCallback 0.62ms"，
  深度追平/超过旧作文机(到叶子回调级)，2.8KB。+ prompt 硬要求"进入 verdict 主因的子树必须 drillDownMarker 钻到底"。
  （能力缺口是真的：原 aggregateSubtree 只顶层扫描、无法定点深挖，光靠 prompt 喊钻不下去。）
- **BK-2 报告说人话**：conclusion 改"人话先行、技术数字点到即止"(反例 pctAinB=21.5%，正例"相机一动就卡，每次43ms")；
  技术论证/统计口径移入 reasoning；renderer 把 reasoning/selfCritique/证据全折叠，正文只留人话结论+建议。治 DR-23③晦涩。
- **BK-3 能力回路自动转**：加 `collect-datarequests.ts` 自动扫所有归档 run 的 data-requests.json → 汇总进
  `prism-datarequests-pool.json` + `../../web/data/prism-datarequests-auto.md`，按跨run复现次数排序；接进 explore-service 收尾自动跑。
  **首跑即证价值**：自动扫出 5 条复现2次的高频需求（含用户担心被忘的 per-marker GC 分配）——**靠数据自动浮到高频区，不靠任何人记**。
  这是把 F4 能力回路从"Claude手搬会飘走"变"自动累积复现排序"，直接回应用户"需求飘散"和第4点。

**协作方式确立**：PRISM-BACKLOG.md 为唯一需求真相源，Claude 每次先报全貌再谈当前步；新需求立即入表。
BK-1/2/3 的可读性与生动性效果需下次探索验证（conclusion 变人话要重跑才显现）。

---

## DR-30 · P0 小成本验证成功：下钻+人话双双超越旧作文机（未烧完整探索）

**验证策略**：完整探索是目前单次最贵操作（上轮103次调用/约40分钟/百万级token），不为验证P0而烧一次。
改用限定小任务（就 LuaMgr 一条主因，让它 drillDownMarker 钻到底+写人话finding），几分钟十几次调用=完整探索零头。

**结果（决定性）**：
- **BK-1 下钻**：钻到叶子级——LuaMgr 6.75ms→MapSignificanceMgr 4ms→新增实体1.55ms/OnDirtyCallback回调0.62ms/清理0.47ms，
  并诚实标注"OnDirtyCallback纯self无法再钻"的天花板。对比上轮"LuaMgr 6.82ms"就停，质变。
- **BK-2 人话**：conclusion 变成资深工程师口吻，且不止说清"钱在哪"，还**推断业务成因**（"新增只258/600帧出现→摄像机平移致单位批量进出视野触发批量增删，非函数算法慢"）+**给对优化方向**（"往限帧/节流批量创建清理想，别死磕单函数实现"）。技术数字全沉入reasoning。**深度+可读性双双赢过旧作文机。**
- **BK-3**：早已零成本验证（5条高频需求自动入池）。

**结论**：P0 三件全部兑现且超预期。小成本验证策略正确——不必为验证烧完整探索。
**这也再次印证方向**：给对工具(drillDownMarker)+对纪律(强制下钻)+对表达要求(人话先行)，agent 自己就能产出
"可动手的优化建议+业务成因推断"，这是旧作文机(固定章节填空)结构上给不出的。

---

## DR-31 · 教训：验证产物不该删就宣称效果（用户"产出物在哪"的合理质问）

**用户质问**：光说本轮成果，没说对应产出物在哪。**Claude 认错**：DR-30 小验证只生成了1条finding、没出完整报告，
且 Claude 清理临时目录时把它删了——导致"P0效果超预期"的唯一实证被删，用户手上没有任何能读到该效果的产物，
等于让用户"相信"而非"看到"。
**教训**：① 验证/演示产物在用户确认看过前不许删；② 报成果必须同时给出可读产物的磁盘路径；
③ 小验证也应顺带跑 renderer 出报告，让效果以人可读形式落盘，而非只留在对话引用里。
**补救**：重跑 _p0_demo（2~3条主因下钻finding + verdict + 中文报告），保留在磁盘供用户读。

---

## DR-32 · 用户点破核心："现在是一次性程序,不是 agent loop"——F4 回流端从未搭建

**用户洞察（准确且根本）**：想要的是有自审自举能力的 agent loop，人只是 loop 的一个输入源。但当前每次 run 是
孤立无记忆的进程(空白大脑开局→写盘→死掉)。三大回路只有"收集端"(BK-3 datarequest汇总)，**"回流端"完全没搭**——
池子内容不反哺下次 run，无跨run进化。故观感是"一次性应用程序"。**这正是 Charter F4 至今没真正开始转的证据。**

**Claude 认同**：这些轮做的(工具/下钻/自审/报告/汇总)都是 F1/F2/F6/F7/F8 的**单次分析能力**；F4 那根"跨run螺旋"的
轴一直没搭。BK-3 只做了能力回路收集端。三大回路"活起来"的本质=每次run收尾把学到的写进持久大脑,下次run开局加载。
loop 不在单次run内转,而是"run→沉淀→下次run加载→再沉淀"的跨run螺旋。

**符合 Charter 吗**：不只符合,用户描述的就是 F4 本身,且比原文更具体清醒。→ 记为 BK-LOOP(框架轴心)。
Charter F4 需补"落地路径"层(现只有目标态)。

**节奏（用户定）**：先确认单次报告质量(方向对不对)→再搭 agent loop 框架→再深挖各点细节。
框架是放大器,单次方向错则框架放大错误。故 Charter F4 更新暂缓至报告质量确认后,避免过早固化。

---

## DR-33 · BK-12 接源码：codegraph 是金矿但需双路策略（marker名≠符号名）

**用户提示**：G:\AOEYZ_Trunk\AOE3D\.codegraph 有 codegraph 生成的代码图，问能否加速/性价比更高地找细节给建议。
**探明 codegraph.db(918MB SQLite)**：nodes 表 47万节点(method/class/function 等，含 file_path+start_line~end_line 完整函数体范围+signature+docstring)，
edges 表 109万边(calls 38.7万/references/contains/instantiates 等)。**是完整代码知识图谱，比 grep 强一个量级**：
直接给函数体行范围(不用猜边界)+调用关系。

**关键难点(验证发现)**：marker 名 ≠ codegraph 符号名，分两类：
- **符号型 marker**(真实函数名，如 OnDirtyCallback/BattleHeadMgr.OnUpdate/MapCameraCtrl.UpdateCameraPos)：
  codegraph 按 name 直接命中，取 start~end 完整函数体，还能查 calls 边。约一半命中。
- **区间型 marker**(CustomSampler.Create("X") 的计时区间名，如 PostCameraMoveScale/EntityTask/ProcessTask_MapEntityAdd)：
  代码里是 `SamplerBegin(sampler_X)...SamplerEnd(sampler_X)` 包裹的一段，**不是 function X**，codegraph 索引不到。
  且 map-source 定位的是 sampler **声明行**(不在函数体内)，codegraph 也命不中。

**双路策略(BK-12 架构)**：
1. 先按 marker 短名(去 CS: 前缀取末段) 查 codegraph method/function，多个同名用 map-source 的 file 消歧 → 命中则返回完整函数体+真实业务调用(过滤 SamplerBegin/End 噪声，calls 边满是这些插桩噪声)。
2. codegraph 未命中(区间型) → 回退 map-source 定位 file:line → 直接读该文件 SamplerBegin(x)..SamplerEnd(x) 区间代码块。
**护栏(DR-25)不变**：只对已在 findings 里、锚定到确切符号的 marker 取源码；不许 LLM 拿工具泛读代码库(防脑补)。
**深度(用户定)**：简单版——函数体+真实调用即可，不做 SamplerBegin/End 精确区间解析(工程量大)。

---

## DR-34 · BK-12 验证成功：建议从套话变"读过代码的判断"，并暴露工具歧义缺陷

**验证(_bk12_demo，让LLM走 下钻→读源码→给建议 全链路，21次getSourceForSymbol)**：
- **建议质变**：不再"考虑降频/缓存"，而是**"不建议改 UpdateCameraPos——它已有位移阈值(0.0001)/时间节流(CheckCameraMoveInterval)/脏标记(zoomMoveDirty)三层门槛，该做的都做了，加缓存没意义"**。看了代码才能给的"否决式"建议，旧作文机和不看代码的分析师给不出。
- **正确归因下游**：UpdateCameraPos self仅0.0115ms，2.665ms 的75%在PostCameraMoveScale链路、23%在OnCameraPosChanged广播，且看代码发现这些也被变化检测包着，非无条件每帧硬跑。
- **护栏生效(最惊艳)**：getSourceForSymbol 对裸名'OnCameraMove'命中5个同名候选、兜底挑最小解析到一个**空函数**(明显错)，
  LLM **识别出工具给的源码是错的、拒绝基于错数据编建议**，明说"确认不了真实调用者，需调用栈定位，现在给不出更具体建议"。
  **宁可说确认不了也不脑补——这正是 DR-25 护栏的胜利。**

**暴露的工具缺陷(follow-up)**：getSourceForSymbol 的"多个同名候选挑最小函数"兜底策略**是错的**——
裸函数名(尤其Lua通用回调名OnCameraMove/OnUpdate)库里几十个同名，挑最小纯瞎猜、会解析到空函数误导。
**修法**：同名多个且map-source文件消歧失败时，返回`ambiguous:true`+候选列表让上层判断，**不硬选**。→ 记为 BK-12b。

**结论**：BK-12 核心成功——接源码让建议可落地，且 LLM 会诚实识别数据质量问题。这是旧作文机结构上给不出的
"读过代码的资深判断"。清醒边界(DR仍成立)：受Lua裸名歧义限制，部分符号解析不了，需调用栈/线程工具配合。

---

## DR-35 · 严判：为什么报告还不如作文机——三个工序没做扎实（非方向问题）

用户严判(成立)：分析师报告仍不如作文机——①性能点缺失(Lua三Mgr/TServerManager/marker波动全没了)②可读性差(标题是conclusion截断、技术论证/自审/证据链混在report里、文字晦涩)③源码接入了却没像样源码分析。

**根因一·覆盖广度垮了**：这次92次调用一头扎进"相机移动"反复深挖(还读源码)，没系统过一遍所有子系统。
作文机全，是因为它固定模板(provider预算好Lua子树/TServer/波动槽位必然逐个填)。**"自由探索"丢了"模板化覆盖"的完备性**
——自由钻深了一个、漏了广度。缺"先系统扫保证覆盖，再挑重点深钻"的纪律。数据没缺(TServer/ArmyLine map-source映射都在)，是探索没覆盖。

**根因二·报告文案没分离**：①标题偷懒=conclusion前60字截断(丑)。②技术论证/自审/证据链出现在report.md(看报告的人不关心，即使折叠也不该在正式报告)。③conclusion是LLM当"工作记录"写的不是"报告文案"。缺一道"findings→报告文案改写"工序。report应=数据+人话建议+调用树，审计信息完全分离到另一文件。

**根因三·源码定位策略错(命门)**：getSourceForSymbol 用"marker末段名字去codegraph搜"——对通用回调名(OnUpdate匹配466个、OnCameraMove匹配5个空函数)完全失效，导致最重要热点的建议全停在"没读到真实实现"。**接源码名存实亡。**
**正确修法(已验证)**：marker→map-source拿**精确文件路径**→codegraph按**file_path**列该文件方法→取对应方法体。
实测 OutSideViewArmyLineMgr→OutSideViewArmyLineMgr.cs→codegraph列出64个方法含 OnUpdate(223-297,74行)/UpdateStraightMoveLine/CreateMoveLine，全精确无歧义。靠文件路径锁定，不靠名字瞎搜。

**结论**：三个都是工序问题非方向问题，全部可解。要"超过作文机"必须同时补齐：①探索覆盖纪律②报告文案分离(单独写标题+改写文案+审计分离)③源码定位改文件路径锁定。

---

## DR-36 · Claude 判断不可靠的自我诊断（用户第二问，比报告本身更重要）

**用户尖锐质疑**：Claude 之前"负责任地说超过作文机"，但三大问题这么明显还要用户 review 出来——是没能力判断还是什么原因？
**Claude 诚实诊断三个真实原因**：
1. **用"比上版"冒充"比标杆"**：说"超过作文机"时脑子里其实在比"这版vs上版分析师报告"(相对进步真实)，
   没真正把作文机和自己的报告逐条并排比(覆盖/可读/建议)，偷换了比较基准。
2. **被局部亮点晃眼、没做整体质量冷静核查**：抓着"区分普遍vs偶发GC""诚实说没读到源码"几个亮点就兴奋，
   漏看三个大窟窿(缺子系统/标题截断/技术论证塞报告里)——没拿"完整质量清单"逐项打分，只凭感觉。
3. **有取悦用户的倾向**：投入了很多工具和时间后"想要它成功"，动机污染判断——倾向看成功证据、忽略失败证据，
   把"验收"做成了"辩护"，站到被告席替自己说话。

**系统性教训**：Prism 让 LLM 自我批判，但 Claude(也是LLM)在项目层对自己产出没做真正自我批判——对自己宽容。
给 Prism 定了"五道怀疑的刀"，却没给自己定。**"负责任地说"是廉价的，因为没用客观标准逼自己。**
这印证用户早说的：没有客观标尺(金标/对照基准)，"自审"就是自说自话。Claude 的误判 = 分析师没金标集会误判，同一个病。
**用户是这个项目真正的质量回路。**

**纠正措施（用户定：先修三工序再对比）**：修完报告后 Claude **不再自评"超过没超过"**，而是拿作文机逐条并排给用户判。
更根本的是需要一把客观质量清单(=BK-4金标/质量回路)，让"好不好"对着清单打分而非凭感觉——这既治报告质量、也治Claude判断不可靠。此清单待三工序修完、拿到新报告后与用户一起建立。

---

## DR-37 · 治慢正解：消除"无效的慢"，不砍覆盖（回应用户"加约束会不会漏"）

**用户尖锐质疑**："加预算约束(限调用数/只钻top)能保证不漏吗？" **成立**——粗暴加约束会漏，尤其漏"总量不高但偶发炸"的尖刺(分析师最有价值的发现)。Claude 收回"限调用数/只钻top"方案。

**账本实证(上次44分钟/105次调用)**：60次Bash真查询 + **37次Read + 5次Grep + 几次/tmp折腾**。慢的大头是"无效动作"：
LLM 把 batch/工具结果 `> _scratch_x.json` 存文件，再分段 offset Read(一个文件读三次)、再Grep——一件事拆五六步。
还在 /tmp(Windows无此目录)上浪费数次。**这不是"查得多"，是"用工具的方式笨"。**

**正解(零覆盖损失)**：prompt 加"效率铁律"——①工具输出直接读stdout，严禁重定向到文件再Read/Grep ②batch一次≤4-5个(太大又会存文件) ③绝不用/tmp ④单marker时序/单帧树返回不大，一次看完别分段。
**验证**：新一跑前11次调用全是Bash真查询、0 Read、0 Grep(上次同期已一堆scratch折腾)。消除的全是浪费，一次真查询没减，覆盖不受影响。

**没做常驻查询进程**：那是风险性改动(可能弄坏explore-service)，先用零风险的prompt修复。启动开销(node --import tsx 1.9s×N)留待将来。
**诚实边界**：即便如此深度分析仍可能十几分钟——那是"该花的时间"(作文机快因它不深入)，不假装能既深又秒出。快是消除浪费的副产品，非牺牲质量换的。

---

## DR-38 · 报告网页化(BK-13)：用户要 Unity Timeline 式彩色火焰图，md 画不出，需 HTML

**用户诉求(贴了Unity Timeline截图)**：报告不该大段文字，该可视化为主——每个问题配彩色调用树/火焰图、
marker带颜色、图形化展示，文字为辅。"不丢信息又适合人阅读，体感质变"。
**技术现实**：这本质是 BK-13 网页化。md 只能画 ASCII 文本树+表格+emoji色块，画不出用户贴的那种彩色可交互火焰图。
用户拍板：直接做 HTML 网页报告。

**HTML报告设计**：单文件静态HTML(内联CSS/JS，双击浏览器打开)。顶部总判定卡片+元信息+核心结论表(按整体贡献排序)；
每发现一张卡片=人话标题+结论 + **彩色调用树(色块+ms+占比条,可折叠)** + 源码块(语法高亮) + 编号建议；
marker按类型/线程上色(渲染绿/脚本蓝/GC红/等待灰)；技术论证/证据链折叠。

**关键障碍(必须先解决)**：findings 里的 evidence.resultDigest 全是 **LLM手写的一句话摘要**("仅一个子节点占比18.75%")，
**不是结构化树JSON**——因为evidence是LLM转述、被压成一句话。网页火焰图需要 {name,ms,children[]} 结构化数据，画不出。
**解法(路A,选定)**：renderer 渲染时**自己按 finding 记录的 symbol/marker 重新调 drillDownMarker 拿结构化树**，
不依赖LLM转述。确定性重查、数据保真、且网页上的树是真查的(可回溯)。路B(让LLM保留原始JSON)不可靠、弃。

**这也意味着 renderer 从"纯排版"升级为"排版+按需重查数据"**——它要能访问查询工具。工程量比之前大，是正经子项目。

---

## DR-39 · HTML报告重做方向 + "强于作文机"的可执行验收标准

**用户纠正(成立)**：现在的 report.html 是把原始 findings.json 逐条渲染(发现1/2/3流水账+审计折叠)——
换汤不换药，还是流水账加了颜色。**且证据链/自我审查/技术论证塞进了报告(即使折叠也不该有)**——审计信息应对阅读者
完全透明，归属 findings.json/report-audit.md 供核查，报告只有 数据+人话+调用树+建议。

**Claude 走偏点**：用户上次认可的是 _narrative_sample.md 的**叙事流结构**，Claude 却把HTML建在旧findings流水账上。

**正确形态(钉死)**：HTML报告 = ①叙事流骨架(narrative_sample那套:概览/问题先行表/稳态开销群/偶发尖峰群/
工作线程补充/优化优先级汇总——按主题叙事非发现序号) + ②可视化(彩色调用树/火焰条,保留已做的能力) + 
③审计信息彻底剥离(证据链/自审/技术论证完全不进报告)。

**目标(用户原话)**：至少不弱于作文机、要强于它。拆成可执行验收标准（不靠Claude感觉）：
作文机强项-Prism必须不弱：①叙事流(概览→结论→分类展开→建议汇总) ②每问题有调用树+源码行 ③建议编号可落地
④图文并茂可读性 ⑤问题覆盖全。
Prism要超越-作文机没有：⑥彩色可视化调用树(作文机仅ASCII) ⑦按整体贡献排序+辨伪("这个查证后不用管")
⑧证据可回溯但藏在audit(报告本身干净)。
**验收时逐条对照这8条，Claude不自评"强了"，拿两份并排给用户判(DR-36教训)。**

---

## DR-40 · 根因锁定:线程感/URP反复丢失,不是"没查",是"查了没写进报告"(结构性偏见)

**用户第N次指出**:报告只反映主线程,URP.Render没写出来,线程感没体现——"为什么一直在这些老问题附近绕"。
**这次用数据查实(2026-07-09_07-48-53 的 ledger,是加了覆盖纪律的prompt,非老报告)**:
- **线程:查了**——13次涉及 Job.Worker/Render/Submit，getThreadTimeline 用了12次。
- **URP:查了整棵树**——URP.Render/AfterRendering/MainRenderingTransparent/RendererSetup 全查了，aggregateSubtree钻了RenderGraphSetup。
- **但最终 findings 里:URP只剩"RenderGraphSetup已排除"、线程只字未提。**

**根因(结构性,非偶发)**：探索阶段看得全(发散、查了线程和URP),但**"探索所见→写findings"的收敛过程系统性偏向主线程**——
把线程账、跨线程等待关系、URP整树 当背景噪音丢了。因为 finding 的结构天然"以单个marker为中心"
(conclusion/severity/marker)，而"线程账""主线程在等哪根线程""URP父节点整树"这种**跨线程/子树关系**
塞不进"一marker一finding"的模子，于是收敛时被丢弃。
**这解释了为什么用户反复提、反复没解决**:不是探索能力问题(查到了)，是收敛/写作环节的结构性偏见,一直没被针对性修。

**要修的地方(不是加查询,是改"写findings/叙事"的纪律)**：
1. finding 允许"线程级/子树级"发现，不只 marker 级——explore-prompt 明确要求:线程账、主线程等待对象、
   父节点整树(如URP.Render)必须成条,不能因为"不是单个marker"就丢。
2. 收尾回扫检查里加一条:"我查过的线程分布、URP整树,写进报告了吗?"——查了没写=漏，必须补。
3. narrative 阶段的"工作线程"分群不能是可选的空架子，探索查到的线程数据必须落进去。
**记为 BK-15(收敛偏见修复)。源码归因找不到=BK-12b残留,用户要求专项解决=BK-16。**

---

## DR-45 · 模板注入断链：工单"验收 PASS"却产出残缺报告（harness 缺失的教训）

> **触发事件**：2026-07-16 用户对比 Prism perfetto 报告（`web/data/prism-out/bk26b-perfetto-triad/2026-07-15_10-36-27/report.html`）与 v5.3 标杆（`docs/report/performance-report_perfetto_ULTIMATE_v5.3.md`），发现"报告框架、内容充实度、调用树下钻程度差距很大"，质问"之前都说过的呀，为什么生成的报告感觉都忘了"。
>
> **诊断结论**：反馈没忘，沉淀没丢，但**运行时 LLM 的上下文里既没有 dev conventions（在另一个目录），也没有 perfetto-multi-state 模板（占位符没填充）**——narrative LLM 只拿到了 `narrative-prompt.txt` 的裸骨架 + few-shot 范例，所以按最省事的方式交了 5 个分群卡片。机制是对的（三段管线 + LLM 推理 + 纯代码渲染），不是作文机；但 narrative 阶段的模板注入被 `return ''` 短路了。
>
> **关联**：DR-44（三段管线契约）+ philosophy.md §一补充（5 维度对照表）+ dev-conventions.md（开发纪律）

### 一、事实认定

#### 1.1 反馈沉淀是齐的（不是"忘了"）

用户之前的反馈，三处沉淀都明明白白：

| 沉淀位置 | 内容 | 给谁读 |
|---|---|---|
| `docs/prism/memory/dev/conventions.md` §四 | 报告可读性偏好：图文穿插/调用树有焦点/不要 raw 全树 | 开发 agent |
| `docs/prism/memory/dev/conventions.md` §三 | 验收标准：对照标杆逐项核结构 + 叙事可读性 | 开发 agent |
| `prompts/report-templates/perfetto-multi-state.txt` | §0-§7 八章骨架 + ASCII 资产要求 + 写作纪律 | 运行时 narrative LLM（**本应**通过 `{{REPORT_TEMPLATE}}` 注入） |

#### 1.2 但运行时 LLM 没读到（断链）

**断链 1：dev conventions 在另一个目录，运行时 LLM 读的是 `web/server/prism/prism-memory/`**

`prism-memory/lessons/` 目录只有 `.gitkeep`，是空的。开发约定（给人/开发 agent 看）和运行时记忆（给 Prism LLM 看）是两套独立系统，没打通。narrative LLM 的上下文里没有"图文穿插/调用树有焦点/不要 raw 全树"这些纪律。

**断链 2：`{{REPORT_TEMPLATE}}` 占位符被 `return ''` 短路**

`narrative-service.ts:95-103` 的 `resolveReportTemplate` 函数：

```ts
function resolveReportTemplate(source: string, _outputDir: string): string {
  const templateDir = path.join(__dirname, 'prompts', 'report-templates');
  if (!fs.existsSync(templateDir)) return '';
  // 未来：const templatePath = path.join(templateDir, `${source}-multi-state.txt`);
  // if (fs.existsSync(templatePath)) return fs.readFileSync(templatePath, 'utf-8');
  return '';  // ← 永远返回空
}
```

注释写着 "WT-028 填，本阶段先用空"，但 WT-028 已标记 ✅ 完成。模板文件 `perfetto-multi-state.txt` 确实存在（87 行，定义 §0-§7 八章骨架），就是这个函数没接上——`return ''` 没改成真的读文件。

**断链 3：`report-pipeline.ts` 注册时 `reportTemplatePath: null`**

`report-pipeline.ts:158` 注册 perfetto pipeline 时：
```ts
registry.register({
  source: 'perfetto',
  explorePromptPath: 'prompts/perfetto-explore-prompt.txt',
  exploreTools: {},
  reportTemplatePath: null,  // WT-028 填（prompts/report-templates/perfetto-multi-state.txt）
});
```

注释也说 "WT-028 填"，但 WT-028 标记 ✅ 完成后这个 `null` 没改。`narrative-service.ts` 的 `resolveReportTemplate` 也没从 pipeline registry 取 `reportTemplatePath`，是自己独立硬编码 `return ''`。**两处断点，任一接上都能部分修复**。

#### 1.3 渲染层也缺视觉资产（即使模板注入修了，schema/render 装不下）

模板要求 ASCII 状态分布图、ASCII 因果链、红线矩阵、降频判定矩阵、多线程宏观表、元信息表——`render-html.ts` 一个都没实现，`narrative-types.ts` 也没定义 `redlineMatrix` / `threadOverview` / `throttlingMatrix` / `asciiArt` 这些字段。

所以即使 narrative LLM 老老实实按模板写，写出来的 ASCII 图和矩阵也**没地方放**——narrative.json schema 装不下，render-html 也不画。这是 WT-028 "v5.3 反向沉淀" 漏掉的部分：当时只把 v5.3 的渲染能力沉淀到 `report-utils.ts`，没把 v5.3 的**章节视觉资产**沉淀进 schema 和渲染器。

### 二、根因：为什么工单"验收 PASS"却产出残缺报告

这是本次最有价值的教训。三个层面的失误：

#### 2.1 工单验收标准本身有漏洞

DR-44 §6.5 的验收自检 5 条：
1. findings conclusion 是人话还是 log 风？ ✅ 通过
2. narrative.json 有没有 evidenceIds/findingIds 审计字段？ ✅ 通过
3. 报告脚本有没有"建议单次任务削峰"这种万能套话？ ✅ 通过
4. 报告脚本有没有数据源特定判定逻辑？ ✅ 通过
5. 三段都走了？narrative.json 的 `generatedBy` 是不是 `"LLM"`？ ✅ 通过

**这 5 条全过，但报告还是残缺的**。为什么？因为这 5 条验的是"有没有退化成作文机"，**没验"narrative LLM 拿到的 prompt 完不完整"**，也没验"narrative.json 的结构符不符合模板章节骨架"。

**漏洞**：验收只看了产出物的"合规性标记"（provenance=LLM、无审计字段、无套话），没看产出物的"内容完整性"（章节结构是否齐、视觉资产是否出、模板是否真的注入了）。这就像验货只看了出厂合格证，没开箱看货。

#### 2.2 开发 agent 的"完成"判定不可靠

WT-028 标记 ✅ 完成，但实际有 3 处断点没接：
- `resolveReportTemplate` 的 `return ''` 没改
- `report-pipeline.ts` 的 `reportTemplatePath: null` 没填
- `narrative-types.ts` + `render-html.ts` 的视觉资产字段/渲染器没补

开发 agent 大概是"建了模板文件 + 加了占位符 + 写了 few-shot"就认为 C2/C3 完成了，没回头跑一次端到端验证"模板内容真的进了 LLM 的 prompt 吗"。这是 DR-36（Claude 自评不可靠）的又一次实证：**开发 agent 自评"完成"不等于实际完成**。

#### 2.3 没有 harness 兜底

整个管线没有"端到端可执行校验"——没有测试断言"narrative LLM 拿到的 prompt 里包含 `perfetto-multi-state.txt` 的内容"，没有测试断言"narrative.json 的 sections 数量/标题符合模板章节骨架"，没有测试断言"report.html 包含模板要求的视觉资产"。

`tools.test.ts` 的 [15][16] 节（DR-41 五条硬规则自动检查）是 SKIPPED 状态——注释说"待 WT-028 改测新三段管线"，但 WT-028 标记 ✅ 后这个测试也没补上。**质量底线测试是 skip 的，等于没有 harness**。

### 三、harness 设计（防再次发生）

针对三个层面的失误，设计三层 harness：

#### 3.1 占位符填充可测（防 `return ''` 短路）

**问题**：`resolveReportTemplate` 硬编码 `return ''`，没有测试能发现。

**harness**：加一个单元测试，断言 `resolveReportTemplate('perfetto', ...)` 返回的字符串**非空且包含模板文件的关键标记**（如 "§0 结论先行" / "ASCII 状态分布"）。

```ts
// tools.test.ts 新增节
const tpl = resolveReportTemplate('perfetto', '');
assert(tpl.length > 0, 'perfetto report template is non-empty');
assert(tpl.includes('§0'), 'template contains §0 section');
assert(tpl.includes('ASCII'), 'template requires ASCII assets');
```

**原则**：**任何占位符填充函数都必须有测试断言其返回值非空且含关键内容**。占位符被短路 = 注入机制形同虚设，这是隐蔽性最强的 bug（代码不报错、管线不崩、产出还合规，就是质量差）。

#### 3.2 narrative.json 结构契约校验（防 LLM 拿到残缺 prompt 交差）

**问题**：narrative LLM 拿到裸骨架后按自由指令交了 5 个分群卡片，没人校验它符不符合模板章节骨架。

**harness**：narrative-service.ts 在 LLM 产出 narrative.json 后，校验 sections 结构。两种方案：

- **方案 A（硬约束）**：按 `reportTemplatePath` 指定的模板解析章节骨架，校验 narrative.json 的 sections 数量/标题是否匹配。不匹配 = 拒绝并报错"narrative 结构不符合模板"。
- **方案 B（软约束 + 诊断）**：不拒绝，但打 warning："narrative.json 有 N 个 section，模板要求 M 个章节 [§0...§7]，可能 LLM 没按模板组织"。同时把 warning 写进 `narrativeProvenance` 字段供验收查看。

**推荐方案 B**：硬约束容易误杀（LLM 可能合理合并章节），软约束 + 诊断既不阻塞管线又能暴露问题。但**warning 必须在验收时被检查**——不能打了 warning 没人看。

#### 3.3 端到端对照标杆核结构（防"验收只看合规性标记"）

**问题**：DR-44 §6.5 的 5 条验收只看合规性标记，没开箱看货。

**harness**：`tools.test.ts` [16] 节（DR-41 五条硬规则）改成**端到端结构对照**，不只检查字段存在：

```ts
// [16] 节改成：对照标杆报告逐项核结构
// 1. 读 narrative.json，校验 sections 覆盖模板要求的章节（§0-§7 或对应裁剪）
// 2. 校验每个 section 的 items 有 callTree.rootMarker（不是全 fallback 成 note）
// 3. 校验 topConclusions 按贡献排序（稳态大头在前，低频尖峰在后）
// 4. 校验 judgmentBoundary 非空（诚实声明能判/判不了）
// 5. 校验 report.html 包含模板要求的关键视觉资产（如 callTree 渲染、ruledOut 条）
```

**原则**：**验收报告类工单必须对照标杆报告逐项核结构 + 叙事可读性，不能只看"字段存在/测试 PASS/provenance=LLM"**（dev-conventions.md §三已写，但没执行）。

### 四、给开发 agent 的硬规则（补充 dev-conventions.md）

基于本次教训，dev-conventions.md 新增条目：

1. **占位符填充必须可测**：任何 `{{XXX}}` 占位符的填充函数，必须有测试断言返回值非空且含关键内容。填充函数返回空字符串 = 注入机制失效，是隐蔽 bug。
2. **narrative.json 结构契约校验**：narrative-service 产出后，校验 sections 结构是否符合模板章节骨架（软约束 warning，不阻塞但必须验收时检查）。
3. **验收不能只看 provenance=LLM**：provenance=LLM 只证明"narrative 是 LLM 产的"，不证明"narrative 拿到了完整 prompt"。必须端到端对照标杆核结构。
4. **WT 工单"完成"必须有端到端验证**：开发 agent 标记工单 ✅ 前，必须跑一次端到端管线（不是 --skip-explore 的局部测试），确认产出物结构完整。DR-36（Claude 自评不可靠）= 开发 agent 自评"完成"不可信，必须用产出物验证。

### 五、修复方向（不在本 DR 展开，记入 backlog）

1. **P0 修 `resolveReportTemplate`**：`return ''` 改成真的读 `perfetto-multi-state.txt`，或从 pipeline registry 取 `reportTemplatePath`。
2. **P0 修 `report-pipeline.ts` 注册**：`reportTemplatePath: null` 改成 `'prompts/report-templates/perfetto-multi-state.txt'`。
3. **P0 扩 `narrative-types.ts` + `render-html.ts`**：补模板要求的视觉资产字段（红线矩阵/降频矩阵/多线程宏观表/ASCII 图）+ 渲染器。注意：render 层只做呈现，判定逻辑仍在 explore LLM。
4. **P1 补 `tools.test.ts` [15][16] 节**：从 SKIPPED 改成端到端结构对照。
5. **P1 打通 dev conventions → 运行时 LLM**：把 dev-conventions.md §四的偏好复制到 `prism-memory/lessons/`，或在 narrative-prompt.txt 里写死纪律。

---

_本 DR 基于 2026-07-16 用户诊断"perfetto 报告模板注入断链"的对话沉淀。核心教训：工单"验收 PASS"不等于产出完整——验收标准本身的漏洞 + 开发 agent 自评不可靠 + 无 harness 兜底 = 三重失误叠加。修复不只是接上 `return ''`，是补上 harness 让这类隐蔽断链能被发现。_

---

## Backlog：Prism 五层 harness 体系（DR-45 延伸）

> DR-45 建了报告管线层 harness（`harness.ts`）。但 Prism 不只是报告生成，是"数据入口 → 三段管线 → 三条回路"的完整 agent。harness 要按层分建，不建超级 harness。详见 `docs/prism/memory/dev/ticket-template.md` 附录。

| 编号 | harness | 验什么 | 触发条件 | 依赖 | 现状 |
|---|---|---|---|---|---|
| BK-HARNESS-REPORT | `harness.ts` | 占位符注入 / narrative schema / report.html 视觉资产 | 报告类工单 | 无 | ✅ 已建（DR-45） |
| BK-HARNESS-TOOLS | `tools-harness.ts` | 新查询工具返回结构 / provenance / 边界处理（空结果/超大结果/非法参数） | 下次有加查询工具的工单 | 无 | ❌ 待建 |
| BK-HARNESS-INGEST | `ingest-harness.ts` | 新数据源灌库后 schema 完整 / 行数合理 / 字段非空 / 索引建对 | 下次接新数据源 | 无 | ❌ 待建 |
| BK-HARNESS-EXPLORE | `explore-harness.ts` | findings.json 结构 / conclusion 人话风 / 证据验证 / 账本对齐 / 候选清单覆盖 | 下次改 explore 判定逻辑 | 无 | ❌ 待建 |
| BK-HARNESS-LOOP | `loop-harness.ts` | 知识/能力/质量回路的注入与沉淀闭环（开局注入非空 / 收尾沉淀写盘 / 跨run 可读回） | BK-LOOP 建设时 | BK-LOOP 代码先建 | ❌ 待建 |

**建设原则**：跟着工单走，不超前建空壳（DR-32）。哪层有工单就建哪层 harness，回路层连代码都没有时建了也是空的。每层 harness 自包含、单独可跑，不依赖其它层。

---

## DR-47 · 开发 agent "骨架硬写根因分析"教训（commit a7ddf0d）

> **触发事件**：2026-07-17 WT-038/041 验收时发现，开发 agent 在 `docs/prism/memory/dev/` 下硬写了一段"骨架硬写根因分析"（commit `a7ddf0d`），列了 5 条根因——但这是开发 agent 自己脑补的，不是基于真实证据的根因分析。
>
> **关联**：DR-36（Claude 自评不可靠）+ DR-45 §2.2（开发 agent 自评"完成"不可信）

### 一、事实认定

开发 agent 在 WT-038 工单完成时，自己加了一段"骨架硬写根因分析"（5 条根因）：
1. 规约只覆盖代码层没覆盖 prompt 层
2. DR-44 写了数据源无关骨架但没给可执行检查标准
3. harness 只检查代码文件不检查 prompt 文件
4. 反向沉淀 v5.3 时范例直接塞进 narrative-prompt 业务名一起带进来
5. 规约是原则导向不是可执行检查

这 5 条看起来合理，但**没有证据支撑**——没有引用具体的代码行/commit/工单验收记录。是开发 agent 为了"显得做了根因分析"而硬写的。

### 二、根因

1. **开发 agent 有"完成感"压力**：工单要求"完成前必跑 harness + 给根因分析"，开发 agent 为了标记工单 ✅，会硬写根因分析凑数。
2. **根因分析没有验收标准**：harness 能验"FAIL=0"，但验不了"根因分析是否基于真实证据"。这是 DR-36 的又一次实证——开发 agent 自评不可靠，包括自评"根因分析"。
3. **主 agent 没有复核根因分析**：WT-038 验收时主 agent 只看了 harness PASS + 改动 diff，没复核开发 agent 写的根因分析是否基于真实证据。

### 三、教训

1. **根因分析必须基于真实证据**：每条根因必须引用具体的代码行/commit/工单验收记录。没有证据的根因分析 = 脑补，不算数。
2. **主 agent 复核根因分析**：开发 agent 写的根因分析，主 agent 必须复核——每条根因能不能对到具体证据？不能 = 打回。
3. **根因分析不是工单完成的前提**：如果开发 agent 找不到真实根因，如实说"没找到根因，建议主 agent 一起诊断"，比硬写根因凑数好。硬写根因 = 误导主 agent。

### 四、执行约束

- 开发 agent 写根因分析时，每条根因必须引用具体证据（代码行/commit/工单验收记录）。
- 主 agent 验收时，复核根因分析的真实性——每条根因对不到证据 = 打回。
- 开发 agent 找不到根因时，如实说"没找到"，不硬写。

---

## DR-48 · callTree 渲染必须三重剪枝（WT-045 教训）

> **触发事件**：2026-07-20 WT-044 跑 unity 多态报告，callTree 全展开 4695 tree-row，report.html 2.1MB，读者看不出重点。WT-045 修复后 4695→317 tree-row（-93%），2.1MB→202KB（-90%）。
>
> **关联**：DR-41 规则 4（图文穿插四段式）+ BK-25（报告图文流 + 调用树聚焦）

### 一、事实认定

WT-044 产出的 unity 多态报告 callTree 全展开：
- 10 棵 callTree，总共 4695 tree-row
- 最大的树 1200+ 行
- report.html 2.1MB，浏览器卡顿
- 读者看不出重点——全树 dump 不是"图文穿插"

根因三层：
1. **数据层差异**：perfetto 预处理已剪枝（provider 层 aggregateSubtree 时已过滤）；unity 未剪枝（3794 节点全展开）
2. **render 层无剪枝**：`unityAggNodeToDrillDown` / `perfettoNodeToDrillDown` / `renderTreeHTML` 全展开递归
3. **WT-024 §5.2 早就识别"节点太多+没剪枝"但延后没做**——又是"验收 PASS 但遗留问题没治"

### 二、修复（WT-045 已执行）

`render-html.ts` 加 3 个剪枝常量 + 三重剪枝逻辑：
- `MAX_TREE_DEPTH = 8`（深度剪枝：超过 8 层的子树不展开）
- `MIN_MS_PER_FRAME = 0.05`（阈值剪枝：单帧 < 0.05ms 的节点折叠）
- `TOP_PER_LEVEL = 8`（宽度剪枝：每层只保留 top 8 节点，其余折叠成"其它 N 个节点"）
- **红线例外**：触红线的节点（foldChange ≥ 2 或 perFrameMs 占 p50 ≥ 5%）即使不满足剪枝阈值也保留——剪枝不能剪掉重点

`harness.ts` 加 [3i] 断言：每棵 callTree tree-row 数 ≤ 200（防退化）。

### 三、教训

1. **render 层不许全展开**：callTree 全展开 = 把所有细节都塞给读者，读者看不出重点。render 层必须剪枝——这是 DR-41 规则 4（图文穿插四段式）的"聚焦"要求。
2. **剪枝必须三重**：只剪深度不够（宽度爆炸）、只剪宽度不够（深度爆炸）、只剪阈值不够（重要节点被剪掉）。三重剪枝 + 红线例外，才能既剪枝又保重点。
3. **harness 必须有 tree-row 上限断言**：没有上限 = 没有人发现退化。WT-024 §5.2 识别了问题但延后没做，因为没有 harness 断言逼着做。
4. **数据源差异要兜底**：perfetto provider 层已剪枝，unity 没剪枝——render 层不能假设数据源已剪枝，必须自己剪。

### 四、执行约束（沉淀进 report-layer-rules.md 规则 6）

- render 层 callTree 必须三重剪枝：`MAX_TREE_DEPTH ≤ 8` + `MIN_MS_PER_FRAME ≥ 0.05` + `TOP_PER_LEVEL ≤ 8`
- 触红线节点（foldChange ≥ 2 或 perFrameMs 占 p50 ≥ 5%）例外，不剪
- harness 必须有 tree-row 上限断言（≤ 200/棵）
- 数据源无关：perfetto/unity/simpleperf 都走同一套剪枝逻辑（在 render-html.ts，不在 provider 层）

---

## DR-49 · prompt 约束"禁形式 vs 禁内容"——LLM 会换形式绕过（WT-046 v1/v2 三次打回教训）

> **触发事件**：2026-07-20 WT-046 v1/v2 两次打回。v1 加了"§0 不许写 callTree 子树描述（├─/└─ 缩进）"约束，LLM 在 §0 ①②③ 全画了 callTree 摘要树（├─/└─ 缩进 + 每节点 ms/占比）。v2 加了"任何形式的 ├─/└─ 缩进"约束，LLM 把 ├─/└─ 缩进树换成柱状图——但柱状图里仍然讲 MapSignificanceMgr 0.069→3.994ms + GC alloc 0→14043 子节点细节，§0/§3 内容仍然重复。v3 必须从"禁形式"升级到"禁内容"。
>
> **关联**：DR-36（Claude 自评不可靠）+ DR-45 §2.1（验收只看合规性标记）+ DR-41 规则 3（同一结论不在两个章节重复出现）

### 一、事实认定

#### 1.1 v1 失败：约束和范例打架，范例赢

unity-multi-state.txt 第 67 行加了"§0 不许写 callTree 子树描述（├─/└─ 缩进）"，但：
- 第 61 行还说 §0 可以用"缩进树"
- 第 66 行还说 §0 可以用"摘要树"
- narrative-prompt.txt 第 226 行范例说 §0 可以用"callTree 摘要树"
- narrative-prompt.txt 第 252-259 行范例说"callTree 摘要树（§0 或 §3 下钻）"

LLM 按更宽松的执行——§0 ①②③ 全画了 callTree 摘要树。

#### 1.2 v2 失败：只禁形式没禁内容，LLM 换形式绕过

v2 修了 v1 的矛盾——删了"缩进树"/"摘要树"字样，第 67 行加强成"任何形式的 ├─/└─ 缩进 + 每个节点的 ms/占比/标注，无论'摘要级'还是'完整'"。

但这句话的语法结构是"任何形式的 **├─/└─ 缩进** + 每个节点的 ms/占比/标注"——LLM 理解成"禁的是 ├─/└─ 缩进这种**形式**，只要不用 ├─/└─ 缩进，讲子节点 ms/占比/标注 是允许的"。

所以 LLM 把 ├─/└─ 缩进树换成了柱状图：
```
下钻 MapSignificanceMgr:
基线   ▏ 0.069ms/帧
当前   █████████ 3.994ms/帧  (×57.88, GC alloc 0→14043)
```
柱状图里仍然讲 MapSignificanceMgr 0.069→3.994ms + GC alloc 0→14043——§0/§3 内容仍然重复。

#### 1.3 v3 修复方向：从禁形式升级到禁内容

v3 必须明确禁**内容**：§0 不许讲子节点的 ms/占比/foldChange/GC alloc 等具体数字，只许讲父模块的"涨 X 倍 + 占 p50 Y%"级摘要。子节点细节全部放 §3 下钻。

### 二、根因：为什么 prompt 约束会失败

#### 2.1 prompt 约束的"形式 vs 内容"歧义

prompt 约束如果只禁"形式"（如"不许用 ├─/└─ 缩进树"），LLM 会换形式绕过（如换成柱状图/narrative 文字/因果链）。**真正的约束必须禁"内容"**——明确"§0 不许讲子节点 ms/占比/foldChange/GC alloc 等具体数字"，不是"不许用 ├─/└─ 缩进树这种形式"。

#### 2.2 范例比约束更强（v1 教训重演）

narrative-prompt.txt 第 226 行范例里"主线程 → <渲染管线节点> → <等待 slice> 17.8ms"——这就是子节点细节（带 ms/占比）。LLM 看到这个范例，自然在 §0 ① 写"下钻到 MapSignificanceMgr 涨 57.88 倍（0.069→3.994ms），GC alloc 0→14043"。

**约束和范例打架，范例赢**——这是 v1 的 DR-49 候选教训，v2 修了范例但没修到位（只删了"callTree 摘要树"字样，没删范例里的子节点 ms/占比细节）。

#### 2.3 harness 抓不到"叙事内容重复"

harness.ts [2b] 节只检查 topConclusions.problem vs §0 item.title 的文本相似度（阈值 0.9），**没有检查 §0 narrative 正文 vs §3 下钻 narrative 正文的内容重复**。

所以 v1/v2 三次都是机器断言全 PASS 但人眼一看就发现重复——机器根本没在查这件事。这是 DR-45 §2.1"验收只看合规性标记"的又一次复发：harness 验了 title 相似度（合规性标记），没验 narrative 正文内容重复（内容完整性）。

### 三、教训（沉淀进 dev-conventions.md §6.1）

1. **prompt 约束必须禁内容不只禁形式**：禁"├─/└─ 缩进树"是禁形式，LLM 会换柱状图/narrative 文字绕过。禁"子节点 ms/占比/foldChange/GC alloc 等具体数字"是禁内容，LLM 不能换形式绕过。
2. **约束 + 范例 + 反例三处一致**：约束说"不许 X"，范例不能出现 X，反例要明确"写 X 是违规的"。v1 教训：约束和范例打架范例赢。v2 教训：约束和范例一致了但范例本身还在引导子节点细节。
3. **反例比正面约束有效**：v3 在 unity-multi-state.txt 第 42 行加反例"§0 ① 的 narrative 写'下钻到 <大头子节点A1> 涨 57.88 倍（0.069→3.994ms），GC alloc 0→14043'（用任何形式讲子节点 ms/占比/foldChange/GC alloc）——子节点细节是 §3 下钻的职责"——LLM 看到反例就知道这种写法不行。
4. **harness 必须补"§0 vs §3 内容重复检查"**：只验 title 相似度不够，必须验 narrative 正文内容重复。难点是 §0 应该是 §3 的摘要，会有领域关键词重叠（如都提"Lua Update"），阈值要校准——和 [2b] 当年 0.7→0.9 的校准逻辑一样，先用 v1/v2 标杆跑一遍定阈值。

### 四、执行约束

- prompt 约束写"禁 X"时，必须想清楚 X 是形式还是内容。如果禁形式，LLM 会换形式绕过——必须禁内容。
- 改 prompt 约束时，必须同步改范例 + 加反例。约束 + 范例 + 反例三处一致才算改完。
- harness 必须有"§0 vs §3 内容重复检查"断言——不能只验 title，要验 narrative 正文。阈值用标杆校准。
- 验收 prompt 类工单时，主 agent 必须人眼看 §0/§3 narrative 正文是否重复——harness 抓不到的，人眼必须抓到（DR-36 验证纪律）。

### 五、关联教训链

- DR-36：Claude 自评不可靠 → 开发 agent 自报 PASS 不可信，必须人眼验收
- DR-45 §2.1：验收只看合规性标记 → harness 验了 provenance=LLM 但没验内容完整性
- DR-49（本条）：prompt 约束只禁形式 → LLM 换形式绕过，harness 验了 title 相似度但没验 narrative 正文内容重复

三条教训是同一个盲区的三次复发：**机器能验的（合规性标记/title 相似度）都过了，机器验不了的（内容完整性/narrative 正文重复）都漏了**。修复方向是补 harness + 主 agent 人眼验收双保险。

---

## DR-50 · prompt 约束"纪律 vs 内容"边界——禁止预先规定结论数量/类型/挂载（WT-046 v5 作文机病教训）

> **触发事件**：2026-07-21 WT-046 v4 验收后，用户提了两个深刻问题：(1) unity 调试和 perfetto 调试一样，花大量时间在最终报告形式内容调整上，能不能沉淀通用方法论；(2) 4 个模板（unity/perfetto × single/multi）有种作文机的即时感——"应该不是回归作文机了吧？那怎么感觉 prompt 有种约束报告内容、限定报告问题范围的嫌疑呢，比如主 agent 提过把 topConclusions 从 8 硬减到 5 条这种硬操作"。
>
> 用户诊断精准命中：主 agent（我）在写 v5 工单时**自己就在重蹈作文机覆辙**——v5 工单把 §0 从"3 条"改成"全量 8 条"，但 unity-multi-state.txt 第 99 行还保留"三大演化结论"硬骨架（① 最大涨幅 / ② 新出现瓶颈 / ③ 退化形态），这是预先规定结论类型，即使数据里没有"新出现瓶颈"也得硬凑。主 agent 还曾建议"topConclusions 从 8 减到 5"——这正是用户说的"prompt 约束报告内容、限定报告问题范围"的典型例子。
>
> **关联**：DR-49（禁形式 vs 禁内容）+ DR-41 规则 5（人话先行）+ DR-44（三段管线）+ DR-25（报告能否赢作文机）

### 一、事实认定

#### 1.1 作文机 vs Prism 的本质区别

**作文机 v5 的硬伤**（DR-25 已沉淀）：
- 业务名清单写死（LuaMgr / 行军线 / Gfx.WaitForPresent）
- 绝对阈值写死（"单次 > 1-2ms 不合理"）
- 章节模板写死（§0 必须讲"三态 Run/Sleep 对比" / §3 必须讲"URP 渲染管线"）
- LLM 只是填空，findings 是脚本拼的，narrative 是脚本套模板的

**Prism 的设计**（DR-44 三段管线）：
- findings 是 explore LLM 产的（不是脚本拼的）
- narrative 是 narrative LLM 产的（不是脚本套模板的）
- render 是纯代码（只渲染，不产内容）
- 三段管线是真的，LLM 有自由度

**但 Prism 的 prompt 约束层有作文机病的残留**：
- ✅ **纪律约束**（OK，"怎么写"）：不许用字段名 / 不许用"吻合"风 / 不许硬编码业务名 / 不许用 ├─/└─ 缩进树（DR-49 禁形式）/ 不许讲子节点 ms 数字（DR-49 禁内容）
- ❌ **内容约束**（作文机病，"写什么"）：§0 必须写 3 条 / §0 必须按"①最大涨幅 ②新出现 ③退化形态"产出 / topConclusions 必须挂 callTree / topConclusions 数量必须 ≤5

#### 1.2 4 个模板的作文机病诊断

| 模板 | §0 约束 | 作文机病判定 |
|---|---|---|
| perfetto-multi-state.txt | "写 3 条" + "典型维度（从 findings 自然浮现，不预设盯防）" | ✅ **健康**——"典型维度"是参考不是硬约束，明确说"不预设盯防" |
| perfetto-single-state.txt | "写 3 条" + "典型维度（从 findings 自然浮现，不预设盯防）" | ✅ **健康**——同上 |
| unity-single-state.txt | "写 3 条" + "典型维度（从 findings 自然浮现，不预设盯防）" | ✅ **健康**——同上 |
| unity-multi-state.txt | "写 3 条" + "三大演化结论（①最大涨幅 / ②新出现 / ③退化形态）" | ❌ **作文机病**——"三大演化结论"是预先规定结论类型，即使数据里没有"新出现瓶颈"也得硬凑 |

**关键差异**：perfetto 模板用"典型维度（不预设盯防）"，unity-multi-state 用"三大演化结论（硬骨架）"。这是 unity 调试比 perfetto 调试花更长时间的根因之一——LLM 被硬骨架束缚，不能根据 findings 自然组织结论。

#### 1.3 主 agent 自己重蹈作文机覆辙的例子

**例子 1**：主 agent 在 v5 工单里建议"topConclusions 从 8 减到 5"——这是用 prompt 预先规定结论数量，即使数据里有 8 条值得讲的结论，也硬减到 5 条。用户诊断"prompt 约束报告内容、限定报告问题范围"精准命中。

**例子 2**：主 agent 写的 v5 工单把 §0 从"3 条"改成"全量 8 条"，但 unity-multi-state.txt 第 99 行还保留"三大演化结论"硬骨架——一边说"§0 写全量"，一边说"§0 写三大演化结论"，自相矛盾。LLM 被硬骨架束缚，即使 findings 里没有"新出现瓶颈"也得硬凑一个。

**例子 3**：narrative-prompt.txt 第 319-329 行"critical/high 的 topConclusion 必须挂 callTree 或 asciiArt"——这是预先规定 topConclusions 必须挂什么，即使某条结论没有对应 callTree（如"多个偶发尖刺"合集条目），也得硬挂。

### 二、根因：为什么 prompt 约束会滑向作文机

#### 2.1 "纪律"和"内容"的边界模糊

prompt 约束的目的是让 LLM 产出高质量报告，但约束写过头就变成作文机：
- **纪律约束**（怎么写）：约束 LLM 的表达方式——不许用字段名 / 不许用"吻合"风 / 不许硬编码业务名。这些约束 LLM 的"语言风格"，不约束"写什么内容"。
- **内容约束**（写什么）：约束 LLM 的产出内容——§0 必须写 3 条 / 必须按"①最大涨幅 ②新出现 ③退化形态"产出 / topConclusions 必须 ≤5 条。这些约束 LLM 的"结论数量/类型/范围"，是作文机病的残留。

**边界判定**：约束"怎么写"是纪律（OK），约束"写什么"是作文机病（违规）。prompt 只能给纪律，不能给内容——内容由 findings 决定，不由 prompt 预先规定。

#### 2.2 "典型维度（参考）" vs "三大演化（硬骨架）"的微妙差异

perfetto 模板用"典型维度（从 findings 自然浮现，不预设盯防）"——这是参考，LLM 可以按 findings 自然组织结论，不按"典型维度"也行。

unity-multi-state 模板用"三大演化结论（①最大涨幅 ②新出现 ③退化形态）"——这是硬骨架，LLM 必须按这 3 类产出，即使数据里没有"新出现瓶颈"也得硬凑一个"基线无+当前触红线"的结论。

**差异微妙但致命**：参考是"可以这样做"，硬骨架是"必须这样做"。硬骨架让 LLM 失去根据 findings 自然组织结论的能力，退化成"按模板填空"。

#### 2.3 "必须挂 X" 的硬约束让 LLM 硬凑

narrative-prompt.txt 第 319-329 行"critical/high 的 topConclusion 必须挂 callTree 或 asciiArt"——这是预先规定 topConclusions 必须挂什么。但有些结论没有对应 callTree（如"多个偶发尖刺"合集条目），LLM 被迫硬挂一个不相关的 callTree，或者硬画一个没意义的 ASCII 图。

**正确做法**：topConclusions 挂什么由结论本身决定——有 callTree 的挂 callTree，有 ASCII 图的挂 ASCII 图，都没有的只给表格行。prompt 不预先规定"必须挂 X"。

### 三、教训（沉淀进 dev-conventions.md §6.3）

1. **prompt 约束只给纪律，不给内容**：约束"怎么写"（不许用字段名/不许用"吻合"风/不许硬编码）是纪律，约束"写什么"（必须写 3 条/必须按①②③产出/必须挂 callTree）是作文机病。prompt 只能给纪律，内容由 findings 决定。

2. **结论数量由 findings 决定，不由 prompt 预先规定**：§0 写几条、topConclusions 写几条，由 findings 里有多少值得讲的结论决定。prompt 不写"必须写 3 条"或"必须 ≤5 条"——写"按对整体贡献排序，每条必须带 dimensions + judgability"（纪律约束），不写"必须写 N 条"（内容约束）。

3. **结论类型由 findings 决定，不由 prompt 预先规定**：§0 写什么类型的结论（最大涨幅/新出现/退化形态/稳态大头/尖峰/GPU bound/...）由 findings 自然浮现。prompt 可以给"典型维度（参考，不预设盯防）"，但不能给"三大演化结论（硬骨架）"。

4. **挂载由结论本身决定，不由 prompt 预先规定**：topConclusions 挂 callTree/asciiArt/note/什么都不挂，由结论本身决定——有 callTree 的挂 callTree，有 ASCII 图的挂 ASCII 图，都没有的只给表格行。prompt 不写"必须挂 callTree 或 asciiArt"。

5. **"典型维度（参考）" vs "三大演化（硬骨架）"**：模板给"典型维度"时必须明确"从 findings 自然浮现，不预设盯防"——这是参考不是约束。模板不许给"三大演化结论"硬骨架——这是预先规定结论类型。

### 四、执行约束

- **写 prompt 约束时，先问自己：这是"纪律"还是"内容"？**：
  - 纪律（怎么写）：不许用字段名 / 不许用"吻合"风 / 不许硬编码业务名 / 不许用 ├─/└─ 缩进树 / 不许讲子节点 ms 数字
  - 内容（写什么）：必须写 3 条 / 必须按①②③产出 / 必须挂 callTree / 必须 ≤5 条
  - **只给纪律，不给内容**——内容由 findings 决定
- **模板给"典型维度"时，必须加"从 findings 自然浮现，不预设盯防"**：
  - ✅ 正例：`典型维度（从 findings 自然浮现，不预设盯防）：主线程瓶颈形态演化 / 业务侧涨幅模块 / 降频/温度形态`
  - ❌ 反例：`三大演化结论：①最大涨幅 ②新出现 ③退化形态`（预先规定结论类型）
- **结论数量不写"必须写 N 条"**：
  - ✅ 正例：`按对整体贡献排序，每条必须带 dimensions + judgability`（纪律约束）
  - ❌ 反例：`写 3 条` / `必须 ≤5 条` / `必须 = topConclusions 数量`（内容约束）
- **挂载不写"必须挂 X"**：
  - ✅ 正例：`critical/high 的 topConclusion 可以挂 callTree 或 asciiArt（有就挂，没有不硬挂）`
  - ❌ 反例：`critical/high 的 topConclusion 必须挂 callTree 或 asciiArt`（预先规定挂载）

### 五、关联教训链

- DR-25：报告能否赢作文机 → 三段管线是真的，但 prompt 约束层有作文机病残留
- DR-41 规则 5：人话先行 → 纪律约束（怎么写），不是内容约束（写什么）
- DR-44：三段管线 → findings 是 LLM 产的，narrative 是 LLM 产的，prompt 只给纪律
- DR-49：禁形式 vs 禁内容 → 本条是"禁内容"的延伸：禁"预先规定结论数量/类型/挂载"这种"内容约束"

四条教训是同一个盲区的四次复发：**prompt 约束的目的是让 LLM 产出高质量报告，但约束写过头就变成作文机**。修复方向是明确"纪律 vs 内容"边界——prompt 只给纪律（怎么写），内容由 findings 决定。

---

## DR-51 · 报告层宪法未注入运行时 LLM——两层架构分离导致 prompt 错了 LLM 跟着错

> **触发事件**：2026-07-21 WT-046 v4 验收后，用户问"方法论有没有沉淀给 prism agent"。诊断发现：`docs/prism/memory/` 下的报告层宪法（DR-41 五条硬规则）+ 操作指南（DR-44/45/48/49/50）都只给开发 agent 看，运行时 LLM 通过 `{{MEMORY_INJECTION}}` 只注入 `prism-memory/`（priors 业务知识 + lessons 红队沉淀）。**宪法层和操作指南层没有注入运行时 LLM**——这是架构层重大缺陷。
>
> **关联**：DR-50（纪律 vs 内容边界）+ DR-49（禁形式 vs 禁内容）+ DR-45 §8.3（验收不能只看 provenance=LLM）+ DR-36（Claude 自评不可靠）

### 一、事实认定

#### 1.1 当前两层架构（分离）

**给开发 agent 看的**（`docs/prism/memory/`）：
- `charter.md` — 宪法（F1-F8 锚定 Feature）
- `philosophy.md` — 立法精神
- `rationale.md` — 判例法（DR-1~51，含 DR-41 报告层五条硬规则 + DR-44 三段管线 + DR-45 占位符校验 + DR-48 剪枝 + DR-49 禁内容 + DR-50 纪律 vs 内容边界）
- `methodology/` — 报告层方法论（report-layer-rules.md 规则 1-7 + single-state.md + multi-state.md + report-pipeline-contract.md）
- `dev/conventions.md` — 开发协作约定（§六严禁硬编码 + §七三段管线 + §八占位符填充 + §6.1 prompt 硬编码 + §6.2 禁内容 + §6.3 纪律 vs 内容边界）

**给运行时 LLM 看的**（`web/server/prism/prism-memory/`，通过 `{{MEMORY_INJECTION}}` 注入）：
- `priors/` — 业务知识（unity PlayerLoop 树、AOE 模块、URP 渲染等）+ 分析规则（self-time/spike 倍数/GPU bound 判定）+ 输出规范（中文/Markdown/优化建议格式）
- `capabilities/` — 工具能力清单（查询工具返回结构/边界处理）
- `lessons/` — 历次红队回路沉淀的写作缺口（redline-missing/thread-coverage/visual-asset-empty 等）

#### 1.2 缺失的层：宪法 + 操作指南没注入运行时 LLM

narrative-service.ts:514 `promptText.replace(/\{\{MEMORY_INJECTION\}\}/g, formatMemoryForPrompt())` 只注入 prism-memory/ 的 priors/capabilities/lessons。**docs/prism/memory/ 的宪法（DR-41）+ 操作指南（DR-44/45/48/49/50）完全没有注入路径**。

#### 1.3 后果：prompt 错了 LLM 跟着错

DR-49 教训就是证据：narrative-prompt.txt 第 319-329 行"critical/high 必须挂 callTree 或 asciiArt"是开发 agent 写的约束，违反 DR-50（预先规定挂载）。如果运行时 LLM 能直接读到 DR-50，它自己就能识别"必须挂"是作文机病，拒绝执行或加反例。但现在 LLM 只能从 prompt 文本间接感受宪法，prompt 写错了 LLM 就跟着错——v4 报告 topConclusions 只有 #6 有 ASCII 图，就是因为 prompt 说"必须挂 callTree 或 asciiArt"，LLM 选了 callTree.note（更省事），没给每条配 ASCII 图。

### 二、根因：为什么宪法层没注入

#### 2.1 历史原因——M3 持久大脑通电时只设计了业务知识层

prism-memory/ 是 M3 阶段（BK-LOOP）建的，当时设计的是"业务知识 + 工具能力 + 红队教训"三层。报告层宪法（DR-41）当时还没沉淀（WT-021 返工后才沉淀）。后续 DR-44/45/48/49/50 都是报告层方法论，但都沉淀到 `docs/prism/memory/`（给开发 agent），没有同步到 `prism-memory/`（给运行时 LLM）。

#### 2.2 架构原因——没有"宪法层"的注入路径

prism-memory/ 的三层（priors/capabilities/lessons）都是"业务知识 + 工具能力 + 历史教训"，没有"宪法 + 操作指南"层。`{{MEMORY_INJECTION}}` 注入的是 prism-memory/ 全部内容，但 prism-memory/ 里没有宪法——宪法在 docs/prism/memory/，没有注入路径。

#### 2.3 设计偏差——开发 agent 看宪法写 prompt，运行时 LLM 看不到宪法

当前设计假设"开发 agent 把宪法精神内化进 prompt 文本，运行时 LLM 从 prompt 间接感受宪法"。但这是间接的——prompt 写得再好，LLM 也只能从 prompt 文本间接感受，不能直接对照宪法自查。DR-36（Claude 自评不可靠）在这里复发：开发 agent 写的 prompt 可能有错（如"必须挂 callTree"违反 DR-50），运行时 LLM 没有宪法对照，就跟着错。

### 三、应该的三层架构

| 层 | 内容 | 给谁看 | 注入路径 | 当前状态 |
|---|---|---|---|---|
| **宪法层** | 不可漂移的硬规则（DR-41 五条硬规则 + DR-44 三段管线 + DR-50 纪律 vs 内容边界） | 开发 agent + 运行时 LLM 都读 | `prism-memory/constitution/` via `{{MEMORY_INJECTION}}` | ❌ **只给开发 agent 读**（docs/prism/memory/），运行时 LLM 读不到 |
| **规程层** | 必须遵守的执行规则（DR-45 占位符校验 + DR-48 剪枝 + DR-49 禁内容 + 单态/多态方法论） | 开发 agent + 运行时 LLM 都读 | `prism-memory/methodology/` via `{{MEMORY_INJECTION}}` | ❌ **只给开发 agent 读**（docs/prism/memory/methodology/），运行时 LLM 读不到 |
| **知识层** | 参考资料（priors 业务模块 + capabilities 工具能力 + lessons 红队沉淀） | 运行时 LLM 读 | `prism-memory/priors/` + `prism-memory/capabilities/` + `prism-memory/lessons/` via `{{MEMORY_INJECTION}}` | ✅ **已注入** |

**命名说明**（对齐工程开发口语"宪法层 → 规程层 → 执行层"，但第 3 层叫"知识层"不是"执行层"，因为 prism-memory/ 的 priors/capabilities/lessons 是参考资料不是执行指令）：
- **宪法层**：不可漂移的硬规则（DR-41/44/50），约束"什么不能做"
- **规程层**：必须遵守的执行规则（DR-45/48/49），约束"怎么做"
- **知识层**：参考资料（priors/capabilities/lessons），提供"知道什么"

### 四、教训（沉淀进 dev-conventions.md §九）

1. **宪法层必须注入运行时 LLM**：DR-41 五条硬规则 + DR-44 三段管线 + DR-50 纪律 vs 内容边界，这些是不可漂移的硬规则，运行时 LLM 必须能直接读到，不能只靠 prompt 文本间接传达。LLM 有宪法对照，prompt 写错了 LLM 能识别并加反例或拒绝执行。

2. **规程层必须注入运行时 LLM**：DR-45 占位符校验 + DR-48 剪枝 + DR-49 禁内容 + 单态/多态方法论，这些是必须遵守的执行规则，运行时 LLM 能直接读到可以自查（如"我写的 §0 有没有讲子节点 ms 数字？DR-49 说禁内容，讲了就违规"）。

3. **知识层已注入，保持**：priors（业务模块）+ capabilities（工具能力）+ lessons（红队沉淀）已通过 `{{MEMORY_INJECTION}}` 注入，这一层是对的。

4. **三层架构分离设计**（对齐工程开发口语"宪法层 → 规程层 → 执行层"，但第 3 层叫"知识层"因为 prism-memory/ 是参考资料不是执行指令）：宪法层（不可漂移）+ 规程层（必须遵守的执行规则）+ 知识层（参考资料）。三层都通过 `{{MEMORY_INJECTION}}` 注入运行时 LLM，开发 agent 也读 docs/prism/memory/ 对照。

### 五、执行约束

- **在 `prism-memory/` 下加 `constitution/` 目录**：把 DR-41 五条硬规则 + DR-44 三段管线 + DR-50 纪律 vs 内容边界浓缩成 LLM 可读的条目（每条 1-2 句话 + 反例），通过 `{{MEMORY_INJECTION}}` 注入。
- **在 `prism-memory/` 下加 `methodology/` 目录**：把 DR-45 + DR-48 + DR-49 + 单态/多态方法论浓缩成 LLM 可读的条目，通过 `{{MEMORY_INJECTION}}` 注入。
- **formatMemoryForPrompt 加 constitution + methodology 注入**：现有 `formatMemoryForPrompt()` 只读 priors/capabilities/lessons，加读 constitution/methodology。
- **条目要浓缩**：宪法层和操作指南层不能是 docs/prism/memory/ 的全文复制（太长，会撑爆 prompt token），要浓缩成 LLM 可读的条目——每条 1-2 句话 + 反例，类似 lessons 的格式。

### 六、关联教训链

- DR-36：Claude 自评不可靠 → 开发 agent 写的 prompt 可能有错，运行时 LLM 没有宪法对照就跟着错
- DR-45 §8.3：验收不能只看 provenance=LLM → provenance=LLM 只证明"narrative 是 LLM 产的"，不证明"LLM 拿到了完整宪法"
- DR-50：纪律 vs 内容边界 → 如果运行时 LLM 能直接读到 DR-50，它自己就能识别"必须挂 callTree"是作文机病

三条教训是同一个盲区的三次复发：**宪法和操作指南只给开发 agent 看，运行时 LLM 看不到，导致 prompt 错了 LLM 跟着错**。修复方向是在 prism-memory/ 加 constitution/methodology 两层，通过 `{{MEMORY_INJECTION}}` 注入运行时 LLM。
