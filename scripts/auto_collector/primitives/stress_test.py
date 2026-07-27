"""stress_test.py - 远征压测 Primitive

通过 Intent cmd=start_combined_profile（白名单通道）+ name=stress_test: 前缀
触发游戏内远征压测（战斗/行军）。
游戏侧 ProfileTestMgr.lua:HandleExternalProfileCommand 识别 stress_test: 前缀，
调用 StartStressTest 发送 AddBattlePressTestScene debug 指令。

name 编码格式（stress_test: 前缀后）：
  battle:armyId,centerX,centerY,rangeGrid,armyCount,duration
  march:armyId,startX,startY,endX,endY,armyCount,radius
"""

import time
from typing import Dict

from core import adb
from primitives.base import Primitive, PrimitiveContext


class StressTestPrimitive(Primitive):
    """远征压测 Primitive。

    params:
      type:       battle | march
      army_id:    部队 ID（默认 1）
      center_grid: [gridX, gridY] 战斗中心坐标（battle 专用）
      range_grid:  范围（格）（battle 专用，默认 20）
      army_count:  单格数量（battle）/ 部队数量（march）
      duration:    战斗持续时长（battle 专用，秒）
      start_grid:  [gridX, gridY] 创建点坐标（march 专用）
      end_grid:    [gridX, gridY] 折返点坐标（march 专用）
      radius:      随机半径（march 专用）
    """

    @property
    def name(self) -> str:
        return "stress_test"

    def execute(self, params: Dict, ctx: PrimitiveContext) -> Dict:
        test_type = params.get("type", "battle")

        if test_type == "battle":
            army_id = params.get("army_id", 1)
            center_grid = params.get("center_grid", [1746, 286])
            range_grid = params.get("range_grid", 20)
            army_count = params.get("army_count", 2)
            duration = params.get("duration", 43200)
            payload = (
                f"battle:{army_id},{center_grid[0]},{center_grid[1]},"
                f"{range_grid},{army_count},{duration}"
            )
            print(f"[INFO] [stress_test] battle armyId={army_id} "
                  f"center={center_grid} range={range_grid} "
                  f"count={army_count} duration={duration}s")

        elif test_type == "march":
            army_id = params.get("army_id", 1)
            start_grid = params.get("start_grid", [1276, 650])
            end_grid = params.get("end_grid", [1330, 650])
            army_count = params.get("army_count", 300)
            radius = params.get("radius", 5)
            payload = (
                f"march:{army_id},{start_grid[0]},{start_grid[1]},"
                f"{end_grid[0]},{end_grid[1]},{army_count},{radius}"
            )
            print(f"[INFO] [stress_test] march armyId={army_id} "
                  f"start={start_grid} end={end_grid} "
                  f"count={army_count} radius={radius}")

        else:
            return {"ok": False, "method": "none",
                    "detail": f"unknown stress test type: {test_type}"}

        # 复用 start_combined_profile 白名单通道，name 加 stress_test: 前缀
        # duration=0：不启动 profiling，只走 stress_test 分支
        name_str = f"stress_test:{payload}"
        extra = f"--es name {name_str} --ei duration 0"
        if self._try_lua_intent("start_combined_profile", ctx, extra):
            # 验证 Lua 侧是否收到并处理了命令
            # Lua 侧用 mgr.log:Error 输出诊断（真机 logcat 可见）；给协程 + 网络一点时间
            time.sleep(4.0)
            # 用宽过滤抓所有含 CombinedProfile/StressTest 的日志（不限 tag/level）
            r = adb("logcat", "-d", "-v", "brief",
                    device=ctx.device, capture=True)
            log_lines = r.stdout.splitlines()

            relevant = [l for l in log_lines
                        if "[CombinedProfile]" in l or "[StressTest]" in l]

            if relevant:
                print(f"[INFO] [stress_test] Lua 侧日志（最近 {len(relevant)} 条）:")
                for line in relevant[-15:]:
                    print(f"  {line.strip()}")
            else:
                print(f"[WARN] [stress_test] logcat 中无任何 CombinedProfile/StressTest 日志")
                print(f"[WARN] [stress_test] Intent 可能未到达 C# 侧，或 mgr.log:Error 未进 logcat")

            stress_found = any(
                "[StressTest]" in l and ("battle start" in l or "march start" in l)
                for l in log_lines
            )
            cmd_sent = any(
                "[StressTest]" in l and "Req_DebugCmd_A2S returned" in l
                for l in log_lines
            )
            # 服务器返回 errorCode=0 才是真的成功
            server_ok = any(
                "[StressTest]" in l and "Req_DebugCmd_A2S returned" in l
                and "errorCode=0" in l
                for l in log_lines
            )
            server_error = any(
                "[StressTest]" in l and "Req_DebugCmd_A2S returned" in l
                and "errorCode=" in l and "errorCode=0" not in l
                for l in log_lines
            )
            command_seen = any(
                "[CombinedProfile] COMMAND" in l and "stress_test:" in l
                for l in log_lines
            )
            wrong_branch = any(
                "[CombinedProfile] START" in l and "stress_test:" in l
                for l in log_lines
            )
            net_not_ready = any(
                "[StressTest]" in l and "net not ready" in l
                for l in log_lines
            )

            if stress_found and server_ok:
                print(f"[INFO] [stress_test] ✅ 服务器已确认执行（errorCode=0）")
            elif stress_found and server_error:
                print(f"[ERROR] [stress_test] 服务器返回错误码（非 0），压测未生效")
            elif stress_found and cmd_sent:
                # 命令已发往服务器：旧版 Lua 无 errorCode 日志时也视为成功
                # （errorCode 日志依赖新版 ProfileTestMgr.lua，未热更时不会出现）
                print(f"[INFO] [stress_test] ✅ 命令已发往服务器（errorCode 日志需新版 Lua）")
            elif stress_found:
                print(f"[WARN] [stress_test] battle/march start 日志已见，但未见 Req_DebugCmd_A2S returned")
                print(f"[WARN] [stress_test] 协程可能未执行或阻塞在网络回包，检查 mgr.co 状态")
            elif command_seen and net_not_ready:
                print(f"[ERROR] [stress_test] COMMAND 已收到但 mgr.net.game 未就绪（未登录游戏？）")
            elif command_seen:
                print(f"[WARN] [stress_test] COMMAND 已收到但无 battle/march start（解析失败或 mgr.co 未初始化）")
            elif wrong_branch:
                print(f"[ERROR] [stress_test] Lua 未热重载！走了 StartExternalCombinedProfile")
            else:
                print(f"[WARN] [stress_test] 未检测到 COMMAND 日志，Intent 可能未到 C# 侧")

            # ok 判定：服务器确认(errorCode=0) 或 命令已发(旧版 Lua 无 errorCode 日志)
            # 失败：服务器返回非0错误码，或 net not ready，或根本没走到 stress_test 分支
            ok = server_ok or (cmd_sent and not server_error)
            return {"ok": ok, "method": "lua",
                    "detail": f"stress_test {test_type} verified={stress_found} server_ok={server_ok}"}

        return {"ok": False, "method": "none",
                "detail": "Lua intent start_combined_profile failed"}
