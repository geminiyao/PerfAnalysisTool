# 使用说明

## Claude Code（推荐）

Skill 已自动注册，直接说需求即可触发：

```
分析 data/压测战斗-行军线优化.pdata，目标帧率 30
```

如果 Step 1/2 已跑完，想省时间：

```
分析 data/压测战斗-行军线优化.pdata，目标帧率 30

注意：
- Step 1 已完成，直接读取 output/preprocess-result.json（只读 frameSummary、markers 前 20 条、jankFrames 的 hotPath、markerSpikes）
- Step 2 已完成，直接读取 output/marker-source-map.json 中 source="grep" 的条目
- Step 3 对找到源码的热点 marker，Read 对应源码文件做根因分析
- Step 4 按需 query-frame
- 每步报告 token 估算
```

---

## 其他 Agent（Cursor / Windsurf / Aider 等）

```
使用 .claude/skills/unity-profiler-analysis 技能，严格按流程分析 {{文件路径}}，目标帧率 {{FPS}}，每步都执行不要跳过。
```

> Agent 应读取该目录下的 `SKILL.md` 获取完整执行流程。

---

## 适用范围

任何能**读取文件 + 执行 Bash 命令**的 Agent 都能用。
不支持执行命令的纯聊天 LLM 无法使用本 Skill。
