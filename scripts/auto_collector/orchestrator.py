"""orchestrator.py - 采集编排器（C2 CL-7/8/9）

把 collect.py 里硬编码的 if 分支采集流程拆成可组合的 Driver + Primitive。
YAML 声明"用哪些工具 + 做什么动作"，Orchestrator 按序执行。

流程：
  1. 创建 drivers（从 tools 列表 + 隐含 unity-profiler）
  2. Start drivers（按序：simpleperf → perfetto → unity-profiler）
  3. 执行 primitives（如果 YAML 声明了 action.steps）
     - 否则走 legacy 流程（trigger + wait，由 unity-profiler driver 的 stop 处理）
  4. Stop drivers（逆序：unity-profiler → perfetto → simpleperf）
  5. Pull files（所有 driver）
  6. 汇总 results → meta.json
  7. 写 runs + runMetrics（CL-9）
  8. 提交到 web（可选，向后兼容）

向后兼容：
  - 无 action.steps 时，行为与 C1 完全一致
  - args.tools 仍控制 simpleperf/perfetto 启停
  - meta.json 格式不变
"""

import datetime
import json
import os
import time
from typing import Any, Dict, List, Optional

from core import (
    get_pid, get_device_abi, get_app_version,
    clear_logcat,
)
from drivers.base import Driver, DriverContext
from drivers.registry import create_drivers
from primitives.base import PrimitiveContext
from primitives.registry import create_primitive
from runs_writer import RunsWriter


class Orchestrator:
    """采集编排器：协调 Drivers + Primitives 完成一次采集。

    用法：
        orch = Orchestrator(config, yaml_config)
        out_dir = orch.run(args, run_index, device, device_model)
    """

    def __init__(self, config: dict, yaml_config: Optional[dict] = None):
        """
        Args:
            config: 扁平化配置 dict（C1 格式，由 collect.py load_config 产出）
            yaml_config: 原始 YAML dict（含 action.steps 等 C2 扩展字段），可选
        """
        self.config = config
        self.yaml_config = yaml_config or {}

    def run(self, args, run_index: int, device: str, device_model: str) -> str:
        """执行一次完整采集流程。返回 out_dir。

        Args:
            args: argparse Namespace，含 label/duration/scene/tools/runs 等
            run_index: 第几次采集（0-based）
            device: adb 设备 serial
            device_model: 设备型号
        """
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        run_label = f"{args.label}_{device_model}_{ts}"
        if args.runs > 1:
            run_label += f"_run{run_index+1}"

        out_dir = os.path.join(self.config["outputBase"], run_label)
        os.makedirs(out_dir, exist_ok=True)
        print(f"\n{'='*60}")
        print(f"[INFO] 开始采集 run {run_index+1}/{args.runs}: {run_label}")
        print(f"[INFO] 输出目录: {out_dir}")
        print(f"{'='*60}")

        # 1. 获取 PID
        pid = get_pid(self.config["package"], device=device)
        if not pid:
            raise RuntimeError(f"未找到进程 {self.config['package']}，请先启动游戏并进入测试场景")
        print(f"[INFO] 游戏 PID: {pid}")

        # 2. 获取设备信息和游戏版本
        device_abi = get_device_abi(device=device)
        game_version = get_app_version(self.config["package"], device=device)
        if game_version:
            print(f"[INFO] 游戏版本: {game_version}")

        # 3. 清空 logcat
        clear_logcat(device=device)

        # 4. 创建 drivers
        tools = list(args.tools)
        # 确保有 scene 信息
        scene = args.scene or self.config.get("defaultScene", "")
        profile_name = f"{args.label}_{run_index+1:03d}"

        driver_names = list(tools)
        # unity-profiler 不再隐含加入, 由调用方显式选择

        drivers = create_drivers(driver_names)
        print(f"[INFO] Drivers: {[d.name for d in drivers]}")

        # 预计算 action steps 总时长，采样窗口需覆盖全部 primitives
        # 不加余量：primitives 结束后 driver.stop 会立即发 Stop Intent 停采集
        # 注意：只计算真正阻塞执行的 primitive（camera_sweep/wait_duration），
        # stress_test 的 duration 是战斗持续时长（业务参数），不是执行时长
        BLOCKING_PRIMITIVES = {"camera_sweep", "wait_duration"}
        action_steps = self._get_action_steps()
        sample_duration = args.duration
        if action_steps:
            steps_total = sum(
                s.get("params", {}).get("duration", 0)
                for s in action_steps
                if s.get("primitive") in BLOCKING_PRIMITIVES
            )
            if steps_total > sample_duration:
                sample_duration = steps_total
                print(f"[INFO] 采样窗口自动扩展: {args.duration}s → {sample_duration}s"
                      f"（覆盖 {steps_total}s primitives）")

        ctx = DriverContext(
            out_dir=out_dir,
            device=device,
            config=self.config,
            pid=pid,
            duration=sample_duration,
            label=run_label,
            profile_name=profile_name,
            run_index=run_index,
            device_model=device_model,
            device_abi=device_abi,
        )

        # 5. Start drivers（按序）
        for drv in drivers:
            print(f"[INFO] [Driver] start: {drv.name}")
            drv.start(ctx)

        # 6. 执行 primitives（如果 YAML 声明了 action.steps）
        primitive_results = []
        if action_steps:
            print(f"[INFO] 执行 {len(action_steps)} 个 Primitive steps...")
            prim_ctx = PrimitiveContext(
                device=device,
                config=self.config,
                package=self.config.get("package", ""),
                activity=self.config.get("activity", ""),
                intent_action=self.config.get("intentAction", ""),
                scene=scene,
            )
            for step in action_steps:
                prim_name = step.get("primitive", "")
                prim_params = step.get("params", {})
                prim = create_primitive(prim_name, prim_params)
                if prim:
                    print(f"[INFO] [Primitive] {prim_name}: {prim_params}")
                    result = prim.execute(prim_params, prim_ctx)
                    primitive_results.append({"primitive": prim_name, **result})
                else:
                    print(f"[WARN] [Primitive] 跳过未知 primitive: {prim_name}")
                    primitive_results.append({"primitive": prim_name, "ok": False, "detail": "unknown"})
        else:
            # Legacy 模式：无 action.steps，unity-profiler driver 的 stop() 会处理 wait
            print("[INFO] 无 action.steps，使用 legacy 采集流程（trigger + wait）")

        # 7. Stop drivers（逆序）
        for drv in reversed(drivers):
            print(f"[INFO] [Driver] stop: {drv.name}")
            drv.stop(ctx)

        # 8. Pull files（所有 driver）
        all_files: List[str] = []
        file_paths: Dict[str, Any] = {"pdata": []}
        for drv in drivers:
            pulled = drv.pull(ctx)
            all_files.extend(pulled)
            # 按类型归类
            if drv.name == "simpleperf" and drv.results.get("perf_data_path"):
                file_paths["perf_data"] = drv.results["perf_data_path"]
            elif drv.name == "perfetto" and drv.results.get("pftrace_path"):
                file_paths["pftrace"] = drv.results["pftrace_path"]
            elif drv.name == "unity-profiler" and drv.results.get("pdata_paths"):
                file_paths["pdata"] = drv.results.get("pdata_paths", [])

        # 9. 汇总 results → meta.json
        unity_results = {}
        for drv in drivers:
            if drv.name == "unity-profiler":
                unity_results = drv.results

        prof_name = unity_results.get("profile_name", profile_name)
        mono_ns_start = unity_results.get("mono_ns_start")
        mono_ns_end = unity_results.get("mono_ns_end")
        frame_count = unity_results.get("frame_count")
        game_profile_ok = unity_results.get("game_profile_ok", False)

        meta = {
            "project": self.config.get("metaProject", self.config.get("projectName", "")),
            "run_label": run_label,
            "label": args.label,
            "scene": scene,
            "duration_sec": args.duration,
            "profile_name": prof_name,
            "device": device_model,
            "device_serial": device,
            "pid": pid,
            "mono_ns_start": mono_ns_start,
            "mono_ns_end": mono_ns_end,
            "duration_ns": (mono_ns_end - mono_ns_start) if mono_ns_end and mono_ns_start else None,
            "frame_count": frame_count,
            "tools": tools,
            "timestamp": ts,
            "game_profile_ok": game_profile_ok,
            "version": game_version,
            # C2 扩展
            "drivers": [d.name for d in drivers],
            "primitive_results": primitive_results if primitive_results else None,
            "file_paths": {
                "perf_data": file_paths.get("perf_data"),
                "pftrace": file_paths.get("pftrace"),
                "pdata": file_paths.get("pdata", []),
            },
        }
        meta_path = os.path.join(out_dir, "meta.json")
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)
        print(f"\n[INFO] meta.json 已保存: {meta_path}")
        print(f"[INFO] mono_ns_start : {mono_ns_start}")
        print(f"[INFO] mono_ns_end   : {mono_ns_end}")
        print(f"[INFO] duration_ns   : {meta['duration_ns']}")
        print(f"[INFO] frame_count   : {frame_count}")
        print(f"[INFO] game_profile  : {'OK' if game_profile_ok else 'FAILED (降级)'}")
        print(f"[OK]  采集完成: {out_dir}")

        # 10. 写 runs + runMetrics（CL-9）
        writer = RunsWriter()
        writer.write_run(
            run_id=run_label,
            meta=meta,
            file_paths=file_paths,
            tools=tools,
            version=game_version,
        )

        # 11. 提交到 web 服务（向后兼容 C0/C1 的 maple API 上传）
        web_api = getattr(args, 'web_api', self.config.get("webApiBase", ""))
        if web_api and web_api.lower() != 'none':
            self._submit_to_web(out_dir, meta, web_api)

        return out_dir

    def _get_action_steps(self) -> List[dict]:
        """从 YAML 配置读取 action.steps（C2 扩展）。

        优先级：
          1. yaml_config["action"]["steps"] — C2 可组合模式
          2. 无 → 返回空列表（legacy 模式）
        """
        action_cfg = self.yaml_config.get("action") or {}
        steps = action_cfg.get("steps")
        if steps and isinstance(steps, list):
            return steps
        return []

    def _submit_to_web(self, out_dir: str, meta: dict, web_api: str):
        """上传到 web 服务（复用 collect.py 的 submit_to_web 逻辑）。"""
        try:
            from collect import submit_to_web
            submit_to_web(out_dir, meta, web_api)
        except ImportError:
            # collect.py 不在包内时，内联实现
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

                analyze_req = urllib.request.Request(
                    f"{web_api}/maple/runs/{run_id}/analyze",
                    data=b"{}",
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(analyze_req, timeout=10) as resp:
                    print(f"[INFO] 自动分析已触发，在 web 界面查看结果：http://localhost:3000/maple")

            except Exception as e:
                print(f"[WARN] 上传到 web 服务失败（不影响本地数据）: {e}")
