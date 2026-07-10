# docs/prism/ — Prism 开发中枢（新会话从这读起）

> **这是开发 Prism 这个项目的操作台。** 任何 agent（主 agent / 子 agent / 你自己）接手，先读本文，30 秒定位坐标。
> 文件按**四个维度**分目录——记忆(为什么)、规划(做什么)、状态(此刻在哪)、机制(怎么干)。

## 新会话上手顺序（读这三个就够上手）

1. **`state/now.md`** ← **先读这个**。当前在哪个里程碑、上一步做完什么、下一步该干嘛。切会话零重述。
2. **`plan/roadmap.md`** ← 整体路线图 M1-M5，看清大方向和当前所处阶段。
3. **`process/handoff.md`** ← 更详细的上手指南 + 已知的坑。

## 目录地图（按维度找）

```
memory/    长期记忆·为什么这么设计（几乎不变）
  charter.md      北极星 + 八条锚定 Feature F1-F8（宪法条文）
  philosophy.md   设计哲学·成体系的"为什么"（两物种/两层结构/三回路/认识论/含全景图）
  rationale.md    决策史 DR-1~40（判例法，只增不改）

plan/      规划·要做什么
  roadmap.md         整体路线图 M1-M5（战略·里程碑）
  backlog.md         需求总表·唯一真相源（战术·所有 BK）
  backlog.smm        需求脑图（simple-mind-map 打开）
  backlog-mindmap.md 脑图的 md/mermaid 版
  datarequests.md    数据层需求池·人工整理（运行时自动汇总在 web/data/prism-datarequests-auto.md）

state/     状态·此刻在哪（实时变）
  now.md          当前战线：里程碑/工单/下一步/最近决策

process/   机制·怎么干（方法论）
  harness.md      开发操作系统：工单协议 + 验收协议 + 主 agent 自我调度循环
  handoff.md      新会话上手指南 + 已知的坑
  worktickets/    工单流转（发出→施工→完工→验收）

archive/   归档
  stage1-draft.md  旧阶段一草稿
```

## 铁律（协作模式，务必遵守）

- **主 agent 只定规格 + 验收 + 对方向**，不亲自写产品代码、不亲自跑 40 分钟探索——那些出工单派给 Cursor / 子 agent（见 `process/harness.md`）。
- **迁移/文档整理是主 agent 自己的活**，不算开发需求、不走工单。
- **新需求立即入 `plan/backlog.md`**，不靠脑子记。找用户前先报 backlog/roadmap 全貌。
- **不自评"超过作文机没"**——拿产出逐条并排作文机给用户判（DR-36）。

> 注：`web/data/` 下的 prism-datarequests-auto.md / pool.json 是**运行时产物**（代码生成），不在 docs/。docs/ 只放人和 agent 读写的文档。
