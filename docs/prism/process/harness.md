# 开发操作系统（HARNESS）— agent team 怎么协作

> 定义 Prism 项目"怎么开发"的机制：谁定规格、谁施工、谁验收、主 agent 怎么自我调度。
> 目标：**主 agent 随时切会话能秒接上下文、自我调度，不靠用户当监工**（治 DR-28 开发流程层不自省）。

---

## 三个角色

| 角色 | 是谁 | 职责 |
|---|---|---|
| **需求管理 + 验收方** | 主 agent（Opus，就是我） | 定规格出工单、独立验收、跟用户对方向。**不亲自写产品代码、不跑长探索** |
| **施工方** | Cursor（用户搬运，免费）/ 或 Sonnet 子 agent | 按工单改代码，回填完工报告 |
| **拍板方** | 用户 | 看 roadmap/backlog 定方向；把工单搬给 Cursor；说"做完了" |

**关键**：工单是**纯 markdown 自包含规格**，不绑定执行方——用户搬 Cursor、主 agent 派子 agent 都读同一张。适配任意 agent team。

---

## 开发闭环（一个需求从生到验）

```
①主agent写工单 → process/worktickets/BK-XX.md（自包含规格）
   │
   ▼ 用户把工单丢给 Cursor（或主agent派Sonnet子agent）
②施工方按工单改代码 + 在工单末尾回填「完工报告」
   │
   ▼ 用户说"做完了"
③主agent验收 → 读diff + 按工单验收标准逐条核（查关键数字/跑命令，不信自报——DR-36）
   │
   ├─ PASS → 更新 state/now.md + plan/backlog.md 状态 → 下一单
   └─ 打回 → 工单补「返工说明」→ 回到②
```

---

## 工单协议（worktickets/BK-XX.md 的固定结构）

每张工单必须自包含——施工方不需要理解整个项目，只看工单就能干活。模板：

```markdown
# 工单 BK-XX · <标题>

## 背景（为什么做，1-2句，够施工方理解即可）
## 目标（做完什么样，可观测）
## 改哪些文件（精确到文件路径；并行工单之间绝不能重叠）
## 具体要求（分点，越具体越好；给正例/反例）
## 禁止事项（不许碰什么、不许过度设计）
## 验收标准（★客观可核，主agent照此逐条验；这是关键）
## 完工报告（施工方填：改了什么、怎么自测的、有无偏离）
## 验收结论（主agent填：PASS / 打回+原因）
```

**并行铁律**：同批并行的工单**绝不能改同一个文件**（否则施工方互相覆盖）。主 agent 出工单时负责把关，只把文件不重叠的放进同一批。

**验收标准要客观**：不是"报告变好了"，而是"报告里出现了线程账、URP整树、三维判定三项"这种可核对的。**每张工单的验收标准，久了就沉淀成 BK-4 质量清单的雏形。**

---

## 主 agent 自我调度循环（切会话后如何自主运转）

新会话的主 agent 开局，按此循环自我定位、自我驱动，不等用户喂：

```
1. 读 state/now.md + plan/roadmap.md → 定位"当前里程碑 + 上一步 + 下一步"
2. 从 plan/backlog.md 挑当前里程碑该做的需求（按里程碑内优先级）
3. 有在途工单？→ 自查施工状态（REVIEW-前缀/git diff/logs），该验收就验收
   无在途？→ 出下一张工单
4. 【派发是主 agent 自己的活·用现成脚本，别重造】出完 TODO- 工单后，主 agent 自己跑派发脚本
   —— **派发机制已脚本化完备，主 agent 只需「写工单 + 调脚本」，不要另写任何派发逻辑/prompt 构造**：
   powershell -File docs/prism/process/scripts/dispatch-ticket.ps1 -Ticket <TODO-xxx.md>
   （会话进程能读到用户已设的 CURSOR_API_KEY；先加 -DryRun 验一眼，再去掉真发）
   脚本自动：TODO-→WIP- 改名、构造 prompt、发 Cursor、写 .jsonl 原始流 + 可读 .log。
   ⚠️ 编码坑：PS 5.1 直接 -File 跑，**终端回显**会中文乱码，但那只是显示层，传给 Cursor 的 prompt 是干净 UTF-8（脚本内部已在 agent 启动前设好 UTF-8）。想让回显也正常，用强制 UTF-8 控制台跑：
   powershell -NoProfile -Command "chcp 65001 > $null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; & 'docs/prism/process/scripts/dispatch-ticket.ps1' -Ticket <TODO-xxx.md>"
   → Cursor 自动施工 → 主 agent 自查完工 → 验收
5. 验收后：更新 now.md（下一步）+ backlog.md（状态）+ 必要时 roadmap（里程碑进度）
6. 回到 1
```

**默认全自主**：出单→派发→自查→验收→更新→出下一单，主 agent 连轴转，不用用户逐步驱动。
**只在"三种时刻"才打断用户**：①一个里程碑做完了（阶段验收）②某决策会动锚定 Feature（方向）③新里程碑开不开。其余（单张工单的出/发/验）全自主，用户只在阶段节点看结论。

**每次做完一件事、或对话变长快切会话前，主 agent 主动更新 state/now.md**——这是"活战线"不失效的保证。

---

## 主 agent 自查施工状态（不靠用户通知）

施工是否完成，主 agent **自己查客观信号**，不用等用户说"做完了"：

1. **工单文件名前缀**：`ls docs/prism/process/worktickets/` —— `REVIEW-` = 施工方声明完工待验收；`WIP-` = 施工中；`TODO-` = 还没派发。
2. **git 工作区改动**：`git status --short <工单声明的文件>` —— 有改动 = 施工方动过了。
3. **派发日志**：`docs/prism/process/worktickets/logs/` 最新 .log —— 看 Cursor 施工过程和退出码。

**用户跑完派发脚本后，主 agent 主动查这三个信号即可判断进度并启动验收**，无需用户口头通知。验收前必 `git diff` 核对：施工方是否只改了工单声明的文件、有无越界。

## 已知边界

- Cursor 可能无权访问项目外路径（如主 agent 的 `.tclaude/memory/`）——那部分主 agent 自己改。
- 贵的验收（跑40min探索）可先用限定小任务小成本验证（DR-30），不必每次烧完整探索。
