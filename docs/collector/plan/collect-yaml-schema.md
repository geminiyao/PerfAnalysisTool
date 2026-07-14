# collect.yaml — 采集配置 Schema（C1）

> **这是 Collector 采集配置 YAML 的格式定义。** 换项目/换场景改 YAML 不改代码。
> 坐标系：[路线图](roadmap.md) · [需求总表](backlog.md) · [设计哲学](../philosophy.md)
> 状态：**C1 已实现**（CL-4/5/6）

---

## 设计原则

1. **C1 只做参数配置化**：把 `collect.py` 里的硬编码常量（包名/Activity/Intent/设备路径/perfetto 事件）抽成 YAML。不搞 Primitive 组合（那是 C2）。
2. **项目级配置**：每个项目一个 `projects/<name>/collect.yaml`，和 `pack.yaml` 并列。换项目只改这个文件。
3. **向后兼容**：`collect.py --config config.json` 仍可加载旧 JSON 配置，平滑迁移。
4. **结构化但不过度**：YAML 分 `project / device / tools / scenes / action / output / symbols / meta` 八段，每段职责单一。

---

## 文件位置

```
projects/
├── _generic/
│   └── collect.yaml          # 通用兜底（无项目特化常量）
└── aoeyz/
    ├── pack.yaml             # 分析侧项目知识包（已有）
    └── collect.yaml          # 采集侧项目配置（C1 新增）
```

加载优先级（`collect.py --config` / `--project`）：
1. `--config <path>` 显式指定 → 加载该文件（YAML 或 JSON 均可）
2. `--project <name>` → 加载 `projects/<name>/collect.yaml`
3. 环境变量 `COLLECTOR_PROJECT=<name>` → 加载 `projects/<name>/collect.yaml`
4. 默认 → `projects/aoeyz/collect.yaml`

---

## Schema 总览

```yaml
# projects/<name>/collect.yaml

# === 项目标识 ===
project:
  name: <string>              # 项目名（对应 projects/ 目录名）
  package: <string>           # Android 包名
  activity: <string>          # 启动 Activity（全限定名）
  intentAction: <string>      # CombinedProfile 触发 Intent action

# === 设备路径 ===
device:
  simpleperfPath: <string>    # 设备上 simpleperf 二进制路径
  pdataDir: <string>          # 设备上 Unity Profiler .pdata/.raw 输出目录

# === 采集工具 ===
tools:
  simpleperf:
    enabled: <bool>           # 是否默认启用
    ndkDir: <string>          # PC 端 NDK simpleperf 目录（含 app_profiler.py）
    recordOpts: <string>      # simpleperf record 选项（不含 --duration）
    durationPadding: <int>    # 采集时长余量（秒），实际录制 = duration + padding
  perfetto:
    enabled: <bool>           # 是否默认启用
    script: <string>          # PC 端 record_android_trace.py 路径
    bufferSize: <string>      # perfetto 缓冲区大小（如 64mb）
    durationPadding: <int>    # 采集时长余量（秒）
    events:                   # perfetto 采集事件列表
      - <string>
      - ...

# === 场景定义 ===
scenes:
  aliases:                    # 自然语言关键词 → (label, scene) 映射
    "<关键词>":
      label: <string>         # 采集标签
      scene: <string>         # 游戏内场景名
  default:                    # 未匹配到别名时的默认值
    label: <string>
    scene: <string>

# === 动作默认值 ===
action:
  defaultDuration: <int>      # 默认采样时长（秒）

# === 输出配置 ===
output:
  baseDir: <string>           # 采集结果输出根目录（相对路径基于仓库根）
  webApiBase: <string>        # Web API 地址（传 none 禁用自动上传）

# === 符号配置 ===
symbols:
  libDir: <string>            # 带调试符号的 .so 目录（相对路径基于仓库根）

# === Meta 默认值 ===
meta:
  project: <string>           # 写入 meta.json 的项目标识
```

---

## 字段详解

### project — 项目标识

从 `config.json` 的 `package` / `activity` / `intentAction` 迁移。这三个值是触发游戏 CombinedProfile 采样的必需参数。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 项目名，对应 `projects/` 下的目录名 |
| `package` | string | 是 | Android 包名，如 `com.tencent.aoeyz` |
| `activity` | string | 是 | 启动 Activity 全限定名 |
| `intentAction` | string | 是 | CombinedProfile 触发 Intent 的 action |

### device — 设备路径

从 `config.json` 的 `deviceSimpleperfPath` / `devicePdataDir` 迁移。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `simpleperfPath` | string | 是 | 设备上 simpleperf 二进制路径，如 `/data/local/tmp/simpleperf` |
| `pdataDir` | string | 是 | 设备上 Unity Profiler 输出目录（含包名路径） |

### tools — 采集工具

从 `config.json` 的 `ndkSimpleperfDir` / `perfettoScript` / `perfettoEvents` 迁移，并新增 `recordOpts` / `bufferSize` / `durationPadding` 可配置项。

**simpleperf**：
| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `enabled` | bool | 否 | true | 是否默认启用 |
| `ndkDir` | string | 是 | — | PC 端 NDK simpleperf 目录（内含 `app_profiler.py`） |
| `recordOpts` | string | 否 | `"-e cpu-clock --call-graph fp --clockid boottime -f 4000"` | record 选项 |
| `durationPadding` | int | 否 | 15 | 录制时长余量（秒） |

**perfetto**：
| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `enabled` | bool | 否 | true | 是否默认启用 |
| `script` | string | 是 | — | `record_android_trace.py` 路径 |
| `bufferSize` | string | 否 | `64mb` | 缓冲区大小 |
| `durationPadding` | int | 否 | 15 | 录制时长余量（秒） |
| `events` | list[string] | 是 | — | perfetto 采集事件列表 |

### scenes — 场景定义

从 `config.json` 的 `sceneAliases` 迁移，新增 `default` 段。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `aliases` | map | 否 | 关键词 → `{label, scene}` 映射，用于自然语言解析 |
| `default.label` | string | 否 | 未匹配别名时的默认标签（默认 `collect`） |
| `default.scene` | string | 否 | 未匹配别名时的默认场景名 |

### action — 动作默认值

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `defaultDuration` | int | 否 | 60 | 未指定时长时的默认采样秒数 |

> `profileName` 不在 YAML 中写死，运行时自动生成为 `{label}_{run_index:03d}`。

### output — 输出配置

从 `config.json` 的 `outputBase` / `webApiBase` 迁移。

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `baseDir` | string | 否 | `output/collect` | 采集结果输出根目录 |
| `webApiBase` | string | 否 | `http://localhost:3000/api` | Web API 地址 |

> 相对路径基于仓库根目录解析。

### symbols — 符号配置

从 `config.json` 的 `symbolLibDir` 迁移。

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `libDir` | string | 否 | `output/maple/symbols` | 带调试符号的 .so 目录 |

### meta — Meta 默认值

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `project` | string | 否 | 同 `project.name` | 写入 meta.json 的项目标识 |

---

## YAML → 旧 config.json 键映射

`collect.py` 内部将 YAML 扁平化为旧版 dict，保持采集逻辑不变：

| YAML 路径 | 旧 config.json 键 | 代码中访问 |
|-----------|-------------------|-----------|
| `project.package` | `package` | `config["package"]` |
| `project.activity` | `activity` | `config["activity"]` |
| `project.intentAction` | `intentAction` | `config["intentAction"]` |
| `device.simpleperfPath` | `deviceSimpleperfPath` | `config["deviceSimpleperfPath"]` |
| `device.pdataDir` | `devicePdataDir` | `config["devicePdataDir"]` |
| `tools.simpleperf.ndkDir` | `ndkSimpleperfDir` | `config["ndkSimpleperfDir"]` |
| `tools.perfetto.script` | `perfettoScript` | `config["perfettoScript"]` |
| `tools.perfetto.events` | `perfettoEvents` | `config["perfettoEvents"]` |
| `scenes.aliases` | `sceneAliases` | `config["sceneAliases"]` |
| `output.baseDir` | `outputBase` | `config["outputBase"]` |
| `output.webApiBase` | `webApiBase` | `config["webApiBase"]` |
| `symbols.libDir` | `symbolLibDir` | `config["symbolLibDir"]` |

---

## 使用示例

### 基本用法（自然语言）

```bash
# 默认加载 projects/aoeyz/collect.yaml
python scripts/auto_collector/collect.py "VG对比 60s"

# 指定项目
python scripts/auto_collector/collect.py "VG对比 60s" --project aoeyz

# 显式指定配置文件
python scripts/auto_collector/collect.py "VG对比 60s" --config projects/aoeyz/collect.yaml
```

### 结构化参数

```bash
python scripts/auto_collector/collect.py \
    --label vg_compare \
    --duration 60 \
    --scene StressTestBattleSimpleMode \
    --tools simpleperf,perfetto \
    --project aoeyz
```

### 换项目

只需创建 `projects/<new_project>/collect.yaml`，然后：

```bash
python scripts/auto_collector/collect.py "压力测试 30s" --project new_project
```

---

## 向后兼容

- `--config *.json` 仍加载旧版 JSON 配置（键名同 `config.json`）
- 旧 `config.json` 保留在 `scripts/auto_collector/config.json`，但已标记为 deprecated
- 迁移路径：`config.json` → `projects/<name>/collect.yaml`

---

## C2 预留

C1 的 `action` 段目前只有 `defaultDuration`。C2 会扩展为 Primitive 组合：

```yaml
# C2 预留格式（C1 不实现）
action:
  steps:
    - primitive: enter_scene
      params: { scene: WildField, coord: [120, 45] }
    - primitive: camera_sweep
      params: { duration: 30s, pattern: back_forth }
    - primitive: wait_duration
      params: { duration: 30s }
```

C1 不实现上述格式，仅保留 `defaultDuration` 标量。

---

_本文件是 collect.yaml 的格式定义。C1 实现 CL-4/5/6。_
