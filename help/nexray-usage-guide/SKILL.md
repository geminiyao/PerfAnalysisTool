---
name: nexray-usage-guide
description: "NexRay CLI 内存分析工具完整指南。当用户需要分析 memgraph 文件、检测内存泄漏、对比内存快照、管理 Skills/MCP 扩展时使用此 Skill。覆盖安装配置、所有分析场景 SOP、fast/deep 分析模式、harness 技能提取、MCP 集成。"
match: nexray,memgraph,内存分析,memory,footprint,harness,mcp,skill
---

# NexRay CLI 内存分析完整指南

NexRay 是一个 AI 驱动的内存分析 CLI 工具（`@tencent/nexray-ai-cli`），用于分析 `.memgraph` 文件并定位内存问题。

核心能力：内存组成分析、泄漏检测、基线对比（Diff）、VMMap 分区异常检测、游戏引擎内存归因、fast/deep 双模式分析、Harness 技能提取、MCP 第三方扩展。

---

## 安装与配置

### 环境检测

```bash
which nexray && nexray --version
```

输出版本号则已安装，可跳到「授权登录」；command not found 则需安装。

### 安装 / 升级

```bash
npm install -g @tencent/nexray-ai-cli --registry https://mirrors.tencent.com/npm/
nexray --version    # 验证
```

也可用内置升级：`nexray upgrade` 或 `nexray upgrade 0.1.30`。

nexray 发布为独立编译二进制，不需要额外运行时。

| 常见安装问题 | 排查 |
|-------------|------|
| npm install 超时 | 检查 `mirrors.tencent.com` 可达，`npm cache clean --force` |
| 命令找不到 | 检查 `npm bin -g` 是否在 PATH 中 |
| node 版本不兼容 | 需要 node >= 18 |
| 权限错误 | macOS/Linux 用 `sudo npm install -g ...` 或配置 npm prefix |

### 授权登录

**⚠️ 登录需要人工在浏览器完成 OAuth 授权，无法全自动化。Agent 无法替代用户完成此步骤。**

```bash
nexray login                  # 自动打开浏览器授权（120 秒超时）
nexray login --force          # 强制重新登录 / 切换账号
nexray login --site <url>     # 登录到指定站点（默认 https://udt.woa.com）
nexray logout                 # 登出，清除本地凭据
```

流程：`nexray login` → 浏览器 OAuth 授权 → CLI 轮询获取凭据 → 保存到 `~/.nexray/config.json`（权限 0600）→ 选择 UDT 项目。

无桌面环境（服务器/CI）会打印授权 URL，需人工复制到本地浏览器完成授权。

**Linux / 无桌面环境推荐使用 config 方式配置**（免去浏览器 OAuth 交互）：

```bash
nexray config --secret-id "YOUR_SECRET_ID" --secret-key "YOUR_SECRET_KEY" --project "PROJECT_ID"
```

- **秘钥对获取**：浏览器访问 https://udt.woa.com/userinfo ，在页面中获取 Secret ID 和 Secret Key
- **项目 ID 获取**：浏览器访问 https://udt.woa.com/project/manage ，项目列表中括号内的即为项目 ID
- 查看当前配置：`nexray config --show`

### 项目管理

```bash
nexray switch-project                           # 交互式切换项目
nexray prompt -m file.memgraph -p "项目关键字"    # 命令中按关键字模糊匹配项目
```

`-p` 模糊匹配规则：完全匹配 > 前缀匹配 > 包含匹配，自动选中最佳结果。

### 配置文件与环境变量

| 路径 | 用途 |
|------|------|
| `~/.nexray/config.json` | 全局配置（凭据、项目、站点） |
| `~/.nexray/reports/` | 分析报告自动保存目录 |
| `~/.nexray/skills/` | 全局 Skill 安装目录 |

| 环境变量 | 说明 | 必需 |
|---------|------|------|
| `OPENAI_BASE_URL` | LLM API 地址 | 否（有内置默认） |
| `OPENAI_API_KEY` | LLM API Key | 否（有内置默认） |
| `OPENAI_MODEL` | 主模型名称 | 否（默认 gpt-4o-mini） |
| `UDT_API_URL` | UDT 平台地址 | 否（默认 https://udt.woa.com） |

### 自助发现命令

**nexray 参数可能随版本变化，使用前建议先查帮助：**

```bash
nexray -h                  # 所有命令
nexray prompt -h           # 无头分析参数（最常用）
nexray skill -h            # Skill 管理
nexray mcp -h              # MCP 服务器管理
nexray config -h           # 配置管理
nexray mcp-serve -h        # MCP 服务端
```

---

## nexray prompt 参数速查

`nexray prompt` 是主要的无头分析命令，适用于脚本 / CI / Agent 调用。

| 参数 | 短选项 | 类型 | 说明 |
|------|--------|------|------|
| `--memgraph` | `-m` | string[] | 本地 memgraph 文件路径（可多个） |
| `--memgraph-id` | `-M` | string[] | 远程 memgraph ID，格式 `trace_id:memgraph_id` |
| `--baseline-memgraph` | `-b` | string | 本地基线 memgraph（用于 diff） |
| `--baseline-memgraph-id` | `-B` | string | 远程基线 memgraph ID |
| `--question` | `-q` | string | 自定义分析问题 |
| `--question-file` | `-Q` | string | 从 UTF-8 文件读取分析问题 |
| `--project` | `-p` | string | UDT 项目关键词（模糊匹配） |
| `--output` | `-o` | `stdout` / `md` / `html` | 报告输出模式，默认 `stdout`（打印到终端）；`md`/`html` 写入文件 |
| `--output-dir` | `-d` | string | 报告输出目录 |
| `--verbose` | — | boolean | 思考链和进度输出到 stdout |
| `--format` | — | `text` / `json` | 输出模式，默认 `text` |
| `--interactive` | `-i` | boolean | 分析后进入多轮对话（与 `--format json` 互斥） |
| `--analysis-mode` | — | `fast` / `deep` | 分析深度，默认 `fast`（快速思考）；`deep` 使用更强模型深度分析 |

**输入要求**：至少提供 `-m`、`-M`、`-q`、`-Q` 之一。

**questionOnly 模式**：仅提供 `-q`/`-Q` 而不提供任何 memgraph 文件时，进入纯问答模式（跳过完整报告流水线），适合查询知识或对已有 trace 提问。

**输出约定**：

- **stdout**：最终分析报告（Markdown / HTML）或 JSON 结构化结果
- **stderr**：进度日志（`--verbose` / `--format json`）、错误信息、报告保存路径

**退出码**：

| 码 | 含义 |
|----|------|
| 0 | 分析成功 |
| 1 | 分析失败 / 报告生成失败 |
| 2 | 参数错误（路径不存在、格式错误等） |
| 3 | 认证错误（未登录或凭据过期） |
| 4 | 网络 / 服务错误（无法连接 LLM 或 UDT） |
| 130 | 用户中断（Ctrl+C） |

---

## 分析场景 SOP

### 场景 1：单文件全量分析

拿到一个 memgraph 快照，全面了解内存状况。

```bash
nexray prompt -m /path/to/snapshot.memgraph
nexray prompt -m /path/to/snapshot.memgraph --verbose    # 带实时进度
```

NexRay 自动执行完整的多 Agent 分析流水线，包含以下维度：

1. **内存构成分析（Composition）**
   - Footprint 按「有堆栈内存」和「无堆栈内存」分类
   - 有堆栈内存：可追溯到代码调用栈的分配，便于定位责任模块
   - 无堆栈内存：系统/内核分配、碎片等无法直接归因的部分
   - 无堆栈进一步细分为：系统/内核类、VM 类、malloc 类、非 LiveObject
   - 对 TOP 3-5 无堆栈分区逐一深度分析：虚拟/物理内存差异、压缩情况、脏页、碎片化

2. **VMMap 分区分析**
   - 按 VM Region 类型展示内存分布（MALLOC、VM_ALLOCATE、IOKit 等，按 Dirty+Swap 排序）
   - 多维指标交叉分析：Dirty、Swapped、Resident、Virtual、Empty、Non-Volatile
   - 碎片化检测：Region Count、Empty/Virtual 比率、Coalesced 合并效率
   - 压缩率分析：Swap/(Dirty+Swap) > 40% 表示内存压力大
   - 僵尸内存检测：Dirty ≈ 0 但 Swap 极高

3. **自定义分区分析（Custom Partition）**
   - 按业务模块划分内存（渲染、Gameplay、资源加载、SDK 等）
   - 基于调用栈将内存归类到具体业务模块
   - 单模块占比 > 25% 重点标记；堆栈覆盖率 < 50% 提示分区配置需优化

4. **堆栈 TOP5 分析**
   - 按内存占用排序展示 Top 堆栈（区分 Malloc Calltree 和 VM Region Calltree 两个维度）
   - 完整调用链、分配模式（循环突发/持续增长/一次性大块）、业务归因
   - 与分区增长交叉验证一致性

5. **风险评估与优化建议**
   - 按严重程度分级：🔴 Critical（可能 OOM）、🟡 Warning（需关注）、🟢 Info（可优化）
   - 可执行建议精确到模块/函数级别，附带预期收益

### 场景 2：对比分析（Diff）

两个 memgraph 快照（不同版本/不同时间点），定位内存增长来源。

```bash
# 本地文件对比（-m 目标快照，-b 基线快照）
nexray prompt -m /path/to/target.memgraph -b /path/to/baseline.memgraph

# 远程文件对比（ID 格式：trace_id:memgraph_id，冒号分隔）
nexray prompt -M "trace_id:target_id" -B "trace_id:baseline_id"

# 混合对比
nexray prompt -M "trace_id:id" -b /path/to/baseline.memgraph
```

Diff 分析维度：

- **场景判定**：同名场景→驻留对比（关注回落是否彻底）；异名场景→转场对比（关注资源预算）；时间倒流→AB 测试对比
- **分区级 Diff**：各 VM Region 和自定义分区的增量/减量，识别 TOP N 增长分区
- **堆栈级 Diff**：新增/消失的堆栈、增长最快的 TOP N 堆栈，完整调用链和业务归因
- **异常判定原则**：增量 < 5MB 视为噪音；需同时满足增长率和绝对增量阈值；Footprint 整体下降时不因小分区微增判异常
- **数据标记**：增长用红色加粗 `**<font color="#ef4444">+XX</font>**`，减少用普通加粗

### 场景 3：自定义问题分析

针对特定问题定向分析。

```bash
nexray prompt -m game.memgraph -q "哪些 Texture 占用了最多内存？"
```

常用分析问题示例：

```bash
# 纹理/GPU 内存
nexray prompt -m game.memgraph -q "分析 Texture/Image 相关的内存占用，包括 GPU 和 CPU 侧"

# 特定模块
nexray prompt -m game.memgraph -q "分析渲染模块内存，重点关注 Shader 和 Material"

# 内存压力 / OOM 风险
nexray prompt -m game.memgraph -q "分析 Swapped 内存情况，评估距 Jetsam 阈值有多远"

# 碎片化
nexray prompt -m game.memgraph -q "分析内存碎片化程度，哪些 Region 类型碎片化最严重"

# UE 引擎专项
nexray prompt -m ue.memgraph -q "按 UE 内存模型分析 UObject 层级、Texture Pool 使用率、Level 卸载残留"

# Unity 引擎专项
nexray prompt -m unity.memgraph -q "分析 Mono 堆和 IL2CPP 分布，检测 AssetBundle 残留"
```

复杂多维度问题从文件读取：

```bash
nexray prompt -m game.memgraph -Q /path/to/question.txt
```

### 场景 4：多轮交互分析

初步分析后追问细节。

```bash
nexray prompt -m game.memgraph -i
```

分析完成后进入对话模式，可追问（如「展开第 2 个堆栈的完整调用链」）。输入 `exit` 退出，`/new` 重置会话。

### 场景 5：远程文件分析

memgraph 已上传到 UDT 平台。

```bash
nexray prompt -M "trace_id:memgraph_id"              # 单文件
nexray prompt -M "tid1:mid1" -M "tid2:mid2"           # 多文件
```

远程 ID 格式 `trace_id:memgraph_id`（冒号分隔），在 UDT 平台 memgraph 详情页获取。

### 场景 6：泄漏检测

多个时间点的 memgraph，检测内存泄漏。

```bash
nexray prompt -m p1.memgraph -m p2.memgraph -m p3.memgraph \
  -q "检测内存泄漏，分析各采样点的增长趋势"
```

泄漏判定：连续 3+ 采样点单调递增、增长率远超业务预期、内存警告后不释放。

| 严重程度 | 条件 |
|---------|------|
| 🔴 Critical | 增长率 > 10 MB/min，或 30 分钟内增长 > 100 MB |
| 🟠 High | 增长率 > 2 MB/min，或 30 分钟内增长 > 30 MB |
| 🟡 Medium | 增长率 > 0.5 MB/min，持续 10 分钟以上 |
| 🔵 Low | 可见增长趋势但速率较慢 |

### 场景 7：趋势分析

多场景切换的采样点序列，分析整体趋势。

```bash
nexray prompt -m lobby.memgraph -m battle.memgraph -m lobby2.memgraph \
  -q "分析场景切换的内存趋势，评估是否有基线抬升"
```

关注：基线是否逐步抬升（回归初始场景后内存无法复原）、场景间净增量和回落率、峰值是否超出安全水位。

### 场景 8：报告输出控制

```bash
nexray prompt -m game.memgraph -d /path/to/output/     # 指定输出目录（文件名含时间戳）
nexray prompt -m game.memgraph -o html                  # HTML 格式
nexray prompt -m game.memgraph --verbose > report.md    # 报告存文件，进度打 stderr
```

JSON 结构化输出（程序化解析）：

```bash
nexray prompt -m game.memgraph --format json
# stdout: { "success": bool, "report": "...", "reportPath": "...", "duration": number }
# stderr: NDJSON 事件流（每行一个 JSON），含实时进度

result=$(nexray prompt -m game.memgraph --format json 2>/dev/null)
echo "$result" | jq -r '.success'
echo "$result" | jq -r '.report'
```

### 场景 9：CI 集成

```bash
#!/bin/bash
set -e

# 确保已安装
if ! command -v nexray &>/dev/null; then
  npm install -g @tencent/nexray-ai-cli --registry https://mirrors.tencent.com/npm/
fi

# 执行分析（CI 需预先配置凭据：nexray config --secret-id ... --secret-key ...）
nexray prompt -m "$MEMGRAPH_FILE" -b "$BASELINE_FILE" -d "$REPORT_DIR" -p "$PROJECT" --verbose
# 退出码: 0=成功, 1=分析失败, 2=参数错误, 3=未登录, 4=网络错误
```

---

## Fast / Deep 分析模式

nexray 提供两种分析深度，可在 TUI 或命令行中切换：

| 模式 | 特点 | 适用场景 |
|------|------|---------|
| **fast**（默认） | 快速思考，优先速度 | 日常巡检、快速定位、CI 流水线 |
| **deep** | 深度分析，使用更强模型 | 复杂问题定位、报告精度要求高、多维交叉分析 |

**切换方式**：

```bash
# 命令行
nexray prompt -m game.memgraph --analysis-mode deep

# TUI 斜杠命令
/mode deep
/mode fast

# TUI 快捷键
Shift+Tab    # 切换 fast ↔ deep
```

---

## Harness — 从对话提取可复用技能

Harness 是 nexray-cli 内置的**技能提取**功能。完成一次成功的分析后，可将对话中的分析模式自动转化为标准 `SKILL.md` 文件，下次遇到类似问题时 Agent 自动加载。

### 使用方式

在 TUI 中完成分析后，输入：

```
/harness
```

### 交互流程

1. **自动提取**：从对话历史中提取分析模式（名称、描述、触发条件、工具列表）
2. **确认名称**：`y` / 回车确认默认名；或输入新名称（自动添加 `nxr-` 前缀）；`n` 取消
3. **预览内容**：生成完整 `SKILL.md` 并展示预览
4. **保存或迭代**：`y` / `确认` / `保存` 写入文件；或输入修改意见重新生成

保存位置：`~/.nexray/skills/<name>/SKILL.md`

### 示例

```
# 1. 完成一次 ImageIO 泄漏分析
nexray
> /path/to/leak.memgraph 分析 ImageIO 内存泄漏

# 2. 分析完成后提取技能
> /harness

# 3. 确认名称 → nxr-imageio-leak-detection
# 4. 下次分析类似问题时，Agent 自动加载此技能
```

---

## TUI 斜杠命令速查

在 TUI 输入框中输入 `/` 触发命令菜单：

| 命令 | 说明 |
|------|------|
| `/help` | 查看帮助 |
| `/new` | 新建会话（清空上下文） |
| `/clear` | 清空显示内容 |
| `/resume [id]` | 恢复上次会话（可指定会话 ID） |
| `/session` | 查看当前会话状态 |
| `/tools` | 开关工具调用详情显示 |
| `/compact` | 压缩上下文（释放 token 空间，长对话必备） |
| `/model` | 查看当前模型 |
| `/mode [fast\|deep]` | 切换分析模式 |
| `/skill` / `/skills` | 查看可用技能 |
| `/skill delete <name>` | 删除已安装的技能 |
| `/harness` | 从当前对话生成可复用技能 |
| `/share` | 查看最近报告路径 |
| `/project` | 切换 UDT 项目 |
| `/add_webot <url>` | 添加企微机器人 Webhook |
| `/remove_webot` | 移除企微机器人 |
| `/exit` / `/quit` | 退出 |

**快捷键**：

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 提交输入 |
| `Shift+Enter` | 换行 |
| `Shift+Tab` | 切换 fast ↔ deep 模式 |
| `ESC ESC`（连按两次） | 中止当前分析 |
| `Ctrl+V` | 粘贴（支持粘贴复制的文件，自动识别路径） |
| `Ctrl+C` | 退出 |
| `Tab` | 自动补全命令 |
| `↑ / ↓` | 浏览输入历史 |

---

## 第三方 MCP 集成

nexray-cli 支持接入任意 MCP (Model Context Protocol) 服务器，扩展 Agent 能力。采用懒加载元工具架构，上下文开销极低。

### 添加 MCP 服务器

```bash
# HTTP 类型（如 iWiki）
nexray mcp add --name iWiki --type http \
  --url https://prod.mcp.it.woa.com/app_iwiki_mcp/mcp3 \
  --header "Authorization:Bearer <token>"

# stdio 类型（如 GitHub）
nexray mcp add --name github --type stdio \
  --command npx --args "-y @modelcontextprotocol/server-github" \
  --env "GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxx"
```

### 管理

```bash
nexray mcp list                        # 查看服务器列表
nexray mcp enable my-server            # 启用
nexray mcp enable my-server --disable  # 禁用
nexray mcp remove my-server            # 移除
```

### 架构

- 配置持久化：`~/.nexray/mcp-servers.json`
- 工具缓存：`~/.nexray/mcp-tool-catalog.json`
- 懒加载：启动时仅注册 `use_mcp_tool` 元工具（约 1K tokens），首次调用才连接具体服务器
- 仅 Master Agent 可调用 MCP 工具，SubAgent 不持有

---

## Skill 管理

```bash
nexray skill list              # 列出所有可用 skills
nexray skill show <name>       # 查看 skill 内容
nexray skill add <path>        # 从目录/文件安装 skill
nexray skill add --new <name>  # 创建空 skill 模板
nexray skill add --global <path>  # 安装到全局
nexray skill remove <name>     # 移除已安装的 skill
nexray skill init              # 在当前项目初始化 .nexray/skills 目录
```

加载优先级（后覆盖前）：内置 < 项目级（`.nexray/skills/`、`.claude/skills/`、`.agents/skills/`）< 全局（`~/.nexray/skills/`）。可创建同名 Skill 覆盖内置版本。

兼容 Claude/agents 社区 skill 格式，直接复用。

---

## MCP 服务端模式

将 nexray 自身作为 MCP Server 暴露，供 Cursor、Claude Desktop 等 MCP 客户端直接调用 nexray 的分析能力。推荐使用 stdio 传输方式：

```bash
nexray mcp-serve --stdio \
  --secret-id "YOUR_SECRET_ID" \
  --secret-key "YOUR_SECRET_KEY" \
  --project "PROJECT_ID"
```

在 Cursor / Claude Desktop 的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "nexray": {
      "command": "nexray",
      "args": ["mcp-serve", "--stdio", "--secret-id", "YOUR_SECRET_ID", "--secret-key", "YOUR_SECRET_KEY", "--project", "PROJECT_ID"]
    }
  }
}
```

启动后，客户端可直接调用 nexray 提供的所有分析工具（上传 memgraph、VMMap 分析、Diff 对比等），无需手动拼 CLI 命令。

---

## 完整工具参考

### 云端分析工具（memgraph / trace 相关）

| 工具名 | 用途 |
|--------|------|
| `upload_memgraph` | 上传本地 .memgraph，返回 trace_id/memgraph_id |
| `create_trace` | 创建空 trace |
| `bind_memgraph_resource` | 绑定已上传资源到 trace |
| `analyze_stackless_composition` | 内存构成（有栈/无栈分类） |
| `compare_memory_diff` | 两个 memgraph 对比（已集成到 compare_diff） |
| `compare_diff` | 统一 Diff 工具（footprint/composition/vmmap/partition/calltree/vmregion 六种模式） |
| `analyze_vmmap` | VMMap 多维分区报告 |
| `analyze_custom_partition` | 自定义业务分区统计 |
| `analyze_region_swapped` | 各 Region 压缩/Swap 分析 |
| `analyze_region_fragmentation` | 碎片化分析 |
| `analyze_plugin_memory` | 按插件/dylib 汇总堆内存 |
| `analyze_symbol_table` | 符号表与二进制镜像分类 |
| `analyze_memory_trend` | 同 trace 多采样点趋势 |
| `detect_memory_leak` | 泄漏复合检测 |
| `get_full_calltree` | 完整调用树（TOP N 分页） |
| `analyze_partition_stack` | 指定分区的堆栈分析 |
| `analyze_diff_calltree_enhanced` | Diff 堆栈（malloc + vmregion 双树 + 校验） |
| `analyze_vmregion_calltree` | 单样本 VMRegion 堆栈 |
| `compare_vmregion_calltree` | VMRegion Diff 堆栈 |
| `search_and_analyze_calltree` | 按函数名搜索匹配堆栈 |
| `deep_analyze_memory` | 四步深度分析（vmregion diff → malloc diff → 聚合 → 诊断） |
| `collect_all_stacks` | 并行拉取 Malloc + VMRegion TOP N 完整数据 |
| `export_calltree` / `export_diff_calltree` | 调用树 JSON 导出 |
| `cross_version_compare` | 跨版本场景级对比（一次拉齐 VMMap/分区/堆栈） |
| `get_footprint_info` | Footprint 时间线数据 |
| `get_partition_cfg_info` | 分区配置列表 |
| `query_traces` | 统一查询（list/stats/detail/memgraph 四种模式） |
| `get_vmmap_analysis` | 预处理 VMMap 结构化报告 |
| `get_memory_region_details` | 区域详情（五部分构成） |
| `validate_calltree` | Calltree 覆盖率与悖论检测 |
| `diagnose_memory` | 多源诊断与建议 |
| `export_data` / `export_vmmap_raw` | 多格式数据导出 |
| `get_test_basic_info` | 设备/应用/采样点基本信息 |
| `search_calltree` | 按函数关键字搜索 TOP 叶子 |

### 本地工具

| 工具名 | 用途 |
|--------|------|
| `bash` | 执行本地 shell 命令 |
| `read_file` / `write_file` | 文件读写 |
| `list_files` / `glob_files` / `resolve_path` | 文件发现 |
| `generate_html_report` | Markdown → NexRay HTML 报告 |
| `skill` | 按需加载可用 Skill 的内容 |
| `skill_manage` | Skill CRUD（create/patch/edit/delete/write_file/remove_file） |
| `dispatch_subagent` | 调度子 Agent（nexray_base / mem_analysis / report） |
| `send_wecom_notification` | 企微通知（在线链接/HTML/Markdown 三种模式） |
| `use_mcp_tool` | 懒加载元工具——调用第三方 MCP 服务器的任意工具 |

### 工具加载策略

| 优先级 | 说明 | 示例 |
|--------|------|------|
| `always` | 始终加载到 LLM 上下文 | upload_memgraph, compare_diff, dispatch_subagent |
| `standard` | 默认加载，上下文紧张时可省略 | analyze_vmmap, detect_memory_leak |
| `deferred` | 延迟加载，需要时由 Agent 调用 `activate_tool` 激活 | export_calltree, search_calltree |

---

## 内存分析知识库

> 详细参考文档见 `references/` 目录：`ios-memory-model.md`、`vmmap-calltree-guide.md`、`ue-ios-optimization.md`

### iOS 内存模型

- **Footprint** ≈ Dirty + Compressed + IOKit（不含 Clean 页），应用实际内存占用，**OOM 判定的唯一标准**
- **Dirty Size**：脏页（已修改的物理内存页），系统无法回收
- **Swapped Size**：iOS 上指被 Compressor 压缩的内存（**不是磁盘交换**）。解压消耗大量 CPU，导致掉帧
- **Resident Size**：当前驻留物理内存总量。**不能用于判定 OOM 风险**（包含可丢弃的 Clean 页）
- **Virtual Size**：虚拟地址范围，64-bit 下远大于实际占用
- **Non-Volatile Size**：GPU 缓冲区等不可被系统回收的内存
- **Volatile Size**：可丢弃内存（Purgeable），系统紧张时自动回收，但频繁回收导致发热掉帧
- **Clean Size**：只读映射（`__TEXT` 段等），可被系统随时回收
- **Empty Size**：已分配但无存活对象的空间，碎片化核心指标

### OOM 阈值参考

| 设备内存 | 代表机型 | OOM 阈值 (MB) |
|---------|---------|:---:|
| 2GB | iPhone 6s/7/8 | 1449 |
| 3GB | iPhone 7P/8P/X/XR | 1849 |
| 4GB | iPhone XS/11/12/13 | 2097 |
| 6GB | iPhone 12 Pro/13 Pro/14/15 | 3071 |
| 8GB | iPhone 15 Pro/16/17 | 3375 |

### Calltree 两大维度

这两个维度**不能简单相加**，是不同体系的统计：

| 维度 | 视角 | 覆盖范围 | 对复用内存 |
|------|------|---------|-----------|
| VM Region Calltree (vmmap) | 内核视角，关注"地皮" | 每个 VM Region 的创建堆栈 | 看不到复用，永远显示最初申请者 |
| Malloc Calltree (malloc_history) | 应用视角，关注"住户" | 每笔 malloc 的活跃分配 | 看到复用，显示当前持有者 |

**堆栈不一致的常见原因**：
1. **内存缓存**：`free()` 不等于 `munmap`，Allocator 留着复用（最常见）
2. **内存碎片**：Region 里只有一个小对象存活，整块无法释放
3. **元数据开销**：Allocator 自身记账数据在 vmmap 可见但不在 malloc_history 中

### Footprint Size vs CallTree Size

- **CallTree > Footprint**：申请了但未写入（Allocated 但 Clean）
- **Footprint 涨但 CallTree 不涨**：访问了历史 Clean 页使其变 Dirty、碎片化导致更多 Page 被标记

### VMMap 分区交叉分析指标

- **压缩率**：Swap / (Dirty+Swap) > 40% → 内存压力大
- **僵尸内存**：Dirty ≈ 0 但 Swap 极高 → 长期不活跃未释放
- **碎片化**：Empty / Virtual > 30% + Region Count > 500 → 严重碎片化
- **虚拟地址浪费**：Resident / Virtual < 5% → 过度预留
- **GPU 锁定**：Non-Volatile 高 → 不可回收的 GPU 资源

### 碎片率计算

`FRAG_Size = zone_dirty - zone_BytesAllocated`
`% FRAG = (zone_dirty - zone_BytesAllocated) / zone_dirty`

仅对 MallocZone 计算。UE Binned 分配器使用 mmap 自行管理，memgraph 显示碎片率为 0 **不代表没有碎片**。

| 指标 | 正常 | 警告 | 严重 |
|------|------|------|------|
| Frag % | 10%-25% | > 25% | > 50% |
| Region Count | 5K-20K | > 50K | 接近 65,536（系统硬限制，超过直接 OOM） |

### 常见 Region 类型

| Region | 来源 | UE/Unity 对应 | 异常分析 |
|--------|------|-------------|---------|
| VM_ALLOCATE | `vm_allocate` 系统调用 | UE: Binned Allocator; Unity: Mono/IL2CPP | 占比最大且持续增长→泄漏 |
| IOAccelerator / IOKit | GPU/显存驱动 | 纹理、顶点缓冲、RT | 暴涨→高分辨率纹理过多或 RT 未释放 |
| MALLOC_SMALL / TINY | 系统堆（小对象） | Unity: Native 插件; UE: 第三方库 | 碎片率高→C++ 大量临时对象 |
| MALLOC_LARGE (empty) | libmalloc 碎片 | — | Empty 高 + Count 多→严重碎片化 |
| IOSurface | 跨进程共享纹理 | WebView、视频、相机 | 关闭后不释放→检查引用 |
| Performance tool data | malloc stack logging | — | **生产环境不存在**，无需关注 |
| MALLOC metadata | malloc 元数据 | — | 占比 > 2%→分配调用过于频繁 |
| __DATA | 全局/静态变量 | — | Dirty << Resident→COW 优化良好 |
| Stack | 线程栈 | — | Count > 数百→Thread Pool 滥用 |
| owned unmapped memory | 未映射虚拟内存 | — | Resident=0 且 Swap 高→全部压缩 |

### 分析工作流（拿到 memgraph 的 4 步法）

1. **第一眼看 Total (Dirty + Swap)**：离 OOM 阈值还有多远？
2. **第二眼看 Region 分布**：谁是大头？VM_ALLOCATE→引擎对象；IOAccelerator→美术资源；MALLOC_*→C++ 代码/插件
3. **第三眼看 Frag % 和 Region Count**：碎片化？> 25% 或 > 50K 需重构（对象池等）
4. **最后看 Dirty 增长趋势**：场景切换前后不回落→泄漏

---

## 常见问题

| 问题 | 排查 |
|------|------|
| 安装失败 | 检查 `mirrors.tencent.com` 可达；`npm cache clean --force`；node >= 18 |
| 登录超时 | 120 秒限制；确认浏览器可访问 `udt.woa.com`；无桌面环境手动复制 URL |
| 退出码 3（认证错误） | `nexray login` 重新登录 |
| 分析出错 | 确认文件路径正确且文件完整；确认已登录且选了正确项目；`--verbose` 定位阶段 |
| 远程 ID 格式错误 | 必须是 `trace_id:memgraph_id`（冒号分隔） |
| MCP 添加后看不到工具 | `nexray mcp list` 检查连接状态；URL 或认证有误时移除重新添加 |
| deep 模式超时 | deep 使用更强模型，耗时较长；CI 环境建议用 fast |
| /harness 提示无分析记录 | 需先完成至少一次分析后才能提取技能 |
| 上下文过长 | 在 TUI 中使用 `/compact` 压缩上下文，或 `/new` 新建会话 |
| ESC 无法中止 | 连按两次 ESC 才会触发中止 |
