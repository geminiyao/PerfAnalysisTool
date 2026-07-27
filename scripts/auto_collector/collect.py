#!/usr/bin/env python3
"""collect.py - 通用性能采集脚本

使用方式：
    # 简化指令（关键词解析），默认加载 projects/aoeyz/collect.yaml
    python scripts/auto_collector/collect.py "VG对比 60s"

    # 指定项目
    python scripts/auto_collector/collect.py "VG对比 60s" --project aoeyz

    # 显式指定配置文件（YAML 或旧版 JSON 均可）
    python scripts/auto_collector/collect.py --config projects/aoeyz/collect.yaml

    # 结构化参数
    python scripts/auto_collector/collect.py \\
        --label vg_compare \\
        --duration 60 \\
        --scene StressTestBattleSimpleMode \\
        --tools simpleperf,perfetto

配置：projects/<name>/collect.yaml（C1 起，YAML 驱动）
      旧版 scripts/auto_collector/config.json 仍向后兼容
Schema：docs/collector/plan/collect-yaml-schema.md

C2 变更（CL-7/8/9/10）：
  - 采集流程拆成 Driver + Primitive，由 Orchestrator 编排
  - YAML 支持 action.steps 声明 Primitive 组合（C2 可组合模式）
  - 收尾写 runs + runMetrics 表（CL-9）
  - 无 action.steps 时走 legacy 流程（向后兼容 C0/C1）
  - core.py 抽出共享函数，collect.py re-export 保持向后兼容
"""

import argparse
import datetime
import json
import os
import re
import sys
import time

import yaml

# ---------------------------------------------------------------------------
# 路径常量 + sys.path（让同目录模块可被绝对导入）
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
PROJECTS_DIR = os.path.join(PROJECT_ROOT, "projects")
DEFAULT_PROJECT = "aoeyz"
LEGACY_CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")

# C2: 把脚本目录加入 sys.path，使 drivers/primitives/orchestrator/core 等模块
# 可通过绝对导入互相引用（collect.py 作为脚本运行时 __package__ 为空）
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

# ---------------------------------------------------------------------------
# 从 core.py re-export 共享函数（向后兼容 C0/C1 的 from collect import xxx）
# C2 把这些函数抽到 core.py，collect.py re-export 保持外部兼容
# ---------------------------------------------------------------------------
from core import (  # noqa: E402,F401
    adb, adb_shell, get_device_serial, get_pid, get_device_model, get_device_abi,
    get_app_version, check_device_ready,
    push_simpleperf_if_needed, _normalize_symbol_dir,
    start_simpleperf, stop_simpleperf,
    start_perfetto, stop_perfetto,
    parse_mono_ns, parse_frame_count, parse_profile_name, clear_logcat,
    wait_for_profile_end,
    trigger_profile, stop_profile,
    pull_output_files, pull_unity_pdata,
)

# C2: Orchestrator（Driver + Primitive 编排）
from orchestrator import Orchestrator  # noqa: E402


# ---------------------------------------------------------------------------
# 配置加载（C1: YAML 驱动，向后兼容 JSON）
# ---------------------------------------------------------------------------
def _project_collect_yaml_path(project_name):
    """返回 projects/<name>/collect.yaml 的绝对路径。"""
    return os.path.join(PROJECTS_DIR, project_name, "collect.yaml")


def _resolve_config_path(config_path=None, project=None):
    """解析配置文件路径，优先级：显式 config > project > 环境变量 > 默认项目。"""
    if config_path:
        return config_path
    if project:
        p = _project_collect_yaml_path(project)
        if os.path.isfile(p):
            return p
        raise FileNotFoundError(f"项目配置不存在: {p}")
    env_project = os.environ.get("COLLECTOR_PROJECT")
    if env_project:
        p = _project_collect_yaml_path(env_project)
        if os.path.isfile(p):
            return p
    # 默认项目
    p = _project_collect_yaml_path(DEFAULT_PROJECT)
    if os.path.isfile(p):
        return p
    # 兜底：旧版 JSON
    if os.path.isfile(LEGACY_CONFIG_PATH):
        return LEGACY_CONFIG_PATH
    raise FileNotFoundError(
        f"未找到采集配置。请创建 projects/{DEFAULT_PROJECT}/collect.yaml "
        f"或通过 --config 指定配置文件"
    )


def _flatten_yaml_config(yaml_cfg):
    """将结构化 collect.yaml 扁平化为旧版 dict 格式，保持采集逻辑不变。

    映射关系详见 docs/collector/plan/collect-yaml-schema.md
    """
    project = yaml_cfg.get("project") or {}
    device = yaml_cfg.get("device") or {}
    tools = yaml_cfg.get("tools") or {}
    simpleperf_cfg = tools.get("simpleperf") or {}
    perfetto_cfg = tools.get("perfetto") or {}
    scenes = yaml_cfg.get("scenes") or {}
    action = yaml_cfg.get("action") or {}
    output = yaml_cfg.get("output") or {}
    symbols = yaml_cfg.get("symbols") or {}
    meta = yaml_cfg.get("meta") or {}

    scenes_default = scenes.get("default") or {}

    flat = {
        # project
        "package": project.get("package", ""),
        "activity": project.get("activity", ""),
        "intentAction": project.get("intentAction", ""),
        "projectName": project.get("name", ""),
        # device
        "deviceSimpleperfPath": device.get("simpleperfPath", ""),
        "devicePdataDir": device.get("pdataDir", ""),
        # tools.simpleperf
        "ndkSimpleperfDir": simpleperf_cfg.get("ndkDir", ""),
        "simpleperfRecordOpts": simpleperf_cfg.get(
            "recordOpts", "-e cpu-clock --call-graph fp --clockid boottime -f 4000"
        ),
        "simpleperfDurationPadding": simpleperf_cfg.get("durationPadding", 15),
        # tools.perfetto
        "perfettoScript": perfetto_cfg.get("script", ""),
        "perfettoBufferSize": perfetto_cfg.get("bufferSize", "64mb"),
        "perfettoDurationPadding": perfetto_cfg.get("durationPadding", 15),
        "perfettoEvents": perfetto_cfg.get("events", []),
        # tools enabled
        "enabledTools": [
            t for t, cfg in [
                ("simpleperf", simpleperf_cfg),
                ("perfetto", perfetto_cfg),
            ] if cfg.get("enabled", True)
        ],
        # scenes
        "sceneAliases": scenes.get("aliases") or {},
        "defaultScene": scenes_default.get("scene", "StressTestBattleSimpleMode"),
        "defaultLabel": scenes_default.get("label", "collect"),
        # action
        "defaultDuration": action.get("defaultDuration", 60),
        # output
        "outputBase": output.get("baseDir", "output/collect"),
        "webApiBase": output.get("webApiBase", ""),
        # symbols
        "symbolLibDir": symbols.get("libDir", ""),
        # meta
        "metaProject": meta.get("project", project.get("name", "")),
    }
    return flat


def load_config(config_path=None, project=None):
    """加载采集配置（YAML 或 JSON），返回扁平化 dict。

    - YAML 文件（collect.yaml）：结构化加载后扁平化
    - JSON 文件（旧版 config.json）：直接加载，向后兼容
    """
    resolved_path = _resolve_config_path(config_path, project)
    if not os.path.exists(resolved_path):
        raise FileNotFoundError(f"配置文件不存在: {resolved_path}")

    ext = os.path.splitext(resolved_path)[1].lower()
    if ext in (".yaml", ".yml"):
        with open(resolved_path, "r", encoding="utf-8") as f:
            yaml_cfg = yaml.safe_load(f) or {}
        cfg = _flatten_yaml_config(yaml_cfg)
    elif ext == ".json":
        with open(resolved_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    else:
        raise ValueError(f"不支持的配置文件格式: {ext}（支持 .yaml/.yml/.json）")

    # 将相对路径解析为相对于 PROJECT_ROOT 的绝对路径
    for key in ("symbolLibDir", "outputBase"):
        val = cfg.get(key, "")
        if val and not os.path.isabs(val):
            cfg[key] = os.path.join(PROJECT_ROOT, val)

    return cfg


def load_yaml_raw(config_path=None, project=None):
    """加载原始 YAML dict（保留 action.steps 等 C2 扩展字段）。

    JSON 配置返回空 dict（不支持 C2 扩展）。
    """
    resolved_path = _resolve_config_path(config_path, project)
    ext = os.path.splitext(resolved_path)[1].lower()
    if ext in (".yaml", ".yml"):
        with open(resolved_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    return {}


# ---------------------------------------------------------------------------
# 提交到 web 服务（保留供 Orchestrator 调用）
# ---------------------------------------------------------------------------
def submit_to_web(out_dir, meta, web_api):
    """将采集结果上传到 web 服务，触发分析。"""
    import urllib.request
    import urllib.error

    try:
        boundary = "----CollectUploadBoundary" + str(int(time.time()))

        def field_part(name, value):
            return (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode()

        def file_part(name, filename, data):
            return (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
                f"Content-Type: application/octet-stream\r\n\r\n"
            ).encode() + data + b"\r\n"

        parts = [field_part("meta", json.dumps(meta))]

        file_map = {
            "perf_data": os.path.join(out_dir, "perf.data"),
            "ptrace": os.path.join(out_dir, "trace.pftrace"),
        }
        for field, fpath in file_map.items():
            if os.path.exists(fpath):
                with open(fpath, "rb") as f:
                    parts.append(file_part(field, os.path.basename(fpath), f.read()))

        pdata_files = [f for f in os.listdir(out_dir) if f.endswith(".pdata")]
        for pf in pdata_files:
            fpath = os.path.join(out_dir, pf)
            with open(fpath, "rb") as f:
                parts.append(file_part(f"pdata_{pf}", pf, f.read()))

        body = b"".join(parts) + f"--{boundary}--\r\n".encode()

        req = urllib.request.Request(
            f"{web_api}/maple/runs",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            run_id = result.get("runId")
            print(f"[INFO] 已上传到 web 服务: runId={run_id}")

        # 触发分析
        analyze_req = urllib.request.Request(
            f"{web_api}/maple/runs/{run_id}/analyze",
            data=b"{}",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(analyze_req, timeout=10) as resp:
            print(f"[INFO] 自动分析已触发，在 web 界面查看结果：http://localhost:3000/maple")

        return run_id

    except Exception as e:
        print(f"[WARN] 上传到 web 服务失败（不影响本地数据）: {e}")
        return None


# ---------------------------------------------------------------------------
# 需求解析（C0: 关键词匹配，C4 升级为 LLM）
# ---------------------------------------------------------------------------
def parse_request(natural_text, config):
    """从自然语言文本解析采集参数。

    C0 阶段：纯关键词匹配。
    - 时长：匹配 "60s" / "60秒" → duration
    - 场景：匹配 config["sceneAliases"] 里的别名 → label + scene
    - 工具：匹配 "simpleperf" / "perfetto" → tools
    - label：如未匹配到场景别名，取文本前几个字做 label
    """
    text = natural_text.strip()
    result = {}

    # 解析时长
    m = re.search(r"(\d+)\s*(?:s|秒)", text)
    if m:
        result["duration"] = int(m.group(1))
    else:
        result["duration"] = config.get("defaultDuration", 60)  # 从 YAML 读默认值

    # 解析场景（从 sceneAliases 匹配）
    result["label"] = None
    result["scene"] = None
    scene_aliases = config.get("sceneAliases", {})
    for alias, mapping in scene_aliases.items():
        if alias in text:
            result["label"] = mapping.get("label", alias)
            result["scene"] = mapping.get("scene", "")
            break

    # 如果没匹配到场景别名，用配置默认值
    if not result["label"]:
        # 去掉时长模式后，取文本中的中英文词作为 label
        text_clean = re.sub(r"\d+\s*(?:s|秒)", "", text)
        words = re.findall(r"[\u4e00-\u9fa5]+", text_clean)
        result["label"] = words[0] if words else config.get("defaultLabel", "collect")
        result["scene"] = config.get("defaultScene", "StressTestBattleSimpleMode")

    # 解析工具
    tools = []
    if "simpleperf" in text.lower():
        tools.append("simpleperf")
    if "perfetto" in text.lower():
        tools.append("perfetto")
    if not tools:
        tools = ["simpleperf", "perfetto"]  # 默认两个都采
    result["tools"] = tools

    return result


# ---------------------------------------------------------------------------
# 单次采集（C2: 委托给 Orchestrator）
# ---------------------------------------------------------------------------
def run_single(args, run_index, device, device_model, config, yaml_config=None):
    """执行一次完整采集流程。

    C2: 委托给 Orchestrator，由它协调 Drivers + Primitives。
    向后兼容：无 yaml_config 或无 action.steps 时走 legacy 流程。
    """
    orch = Orchestrator(config, yaml_config)
    return orch.run(args, run_index, device, device_model)


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="通用性能采集脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    # 位置参数：自然语言指令（与结构化参数二选一）
    parser.add_argument("request", nargs="?", default=None,
                        help='自然语言指令，如 "VG对比 60s"')

    # 结构化参数
    parser.add_argument("--label", default=None,
                        help="本次采集标签")
    parser.add_argument("--duration", type=int, default=None,
                        help="采样时长（秒），默认 60")
    parser.add_argument("--scene", default=None,
                        help="测试场景名")
    parser.add_argument("--tools", default=None,
                        help="采样工具，逗号分隔: simpleperf,perfetto")
    parser.add_argument("--runs", type=int, default=1,
                        help="采样次数，默认 1")
    parser.add_argument("--device", default=None,
                        help="adb 设备 serial")
    parser.add_argument("--symbols", default=None,
                        help="带调试符号的 so 目录")
    parser.add_argument("--web-api", default=None,
                        help="web API 地址；传 none 禁用自动上传")
    parser.add_argument("--project", default=None,
                        help=f"项目名，加载 projects/<name>/collect.yaml "
                             f"（默认 {DEFAULT_PROJECT}）")
    parser.add_argument("--config", default=None,
                        help="配置文件路径（YAML 或 JSON）。优先于 --project")

    args = parser.parse_args()

    # 加载配置（C1: YAML 驱动，向后兼容 JSON）
    config = load_config(args.config, args.project)
    config_source = args.config or _resolve_config_path(args.config, args.project)
    print(f"[INFO] 配置文件: {config_source}")

    # C2: 加载原始 YAML（保留 action.steps 等扩展字段）
    yaml_config = load_yaml_raw(args.config, args.project)

    # 如果传了自然语言指令，解析它
    if args.request:
        parsed = parse_request(args.request, config)
        if args.label is None:
            args.label = parsed["label"]
        if args.duration is None:
            args.duration = parsed["duration"]
        if args.scene is None:
            args.scene = parsed["scene"]
        if args.tools is None:
            args.tools = parsed["tools"]
        print(f"[INFO] 解析指令 '{args.request}'")
        print(f"[INFO]   label={args.label}, duration={args.duration}s, scene={args.scene}, tools={args.tools}")

    # 默认值（从 YAML 配置读）
    if args.label is None:
        args.label = config.get("defaultLabel", "collect")
    if args.duration is None:
        args.duration = config.get("defaultDuration", 60)
    if args.scene is None:
        args.scene = config.get("defaultScene", "StressTestBattleSimpleMode")
    if args.tools is None:
        args.tools = config.get("enabledTools", ["simpleperf", "perfetto"])
    elif isinstance(args.tools, str):
        args.tools = [t.strip() for t in args.tools.split(",")]
    if args.web_api is None:
        args.web_api = config.get("webApiBase", "")
    if args.symbols is None:
        args.symbols = config.get("symbolLibDir")

    # 预检设备
    device = args.device or get_device_serial()
    device_model = get_device_model(device=device)
    print(f"[INFO] 设备: {device_model} ({device})")
    print(f"[INFO] 工具: {args.tools}")
    print(f"[INFO] 采样次数: {args.runs}")

    # C2: 显示 Primitive steps（如果有）
    action_steps = (yaml_config.get("action") or {}).get("steps")
    if action_steps:
        print(f"[INFO] Primitive steps: {len(action_steps)} 个")
        for i, step in enumerate(action_steps):
            print(f"[INFO]   {i+1}. {step.get('primitive', '?')} {step.get('params', {})}")
    else:
        print("[INFO] Primitive steps: 无（legacy 模式）")

    # 确保输出目录存在
    os.makedirs(config["outputBase"], exist_ok=True)

    # 执行采集
    results = []
    for i in range(args.runs):
        out_dir = run_single(args, i, device, device_model, config, yaml_config)
        if out_dir:
            results.append(out_dir)
        if i < args.runs - 1:
            print(f"\n[INFO] 等待 10s 后进行下一次采集...")
            time.sleep(10)

    print(f"\n{'='*60}")
    print(f"[完成] 所有采集结果：")
    for d in results:
        print(f"  {d}")


if __name__ == "__main__":
    main()
