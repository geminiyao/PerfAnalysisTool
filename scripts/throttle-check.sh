#!/system/bin/sh
# throttle-check.sh — CPU 降频检测脚本（非 root 适用）
# 用法: adb push throttle-check.sh /data/local/tmp/ && adb shell sh /data/local/tmp/throttle-check.sh
# 原理: 冷机跑一次 + 压测后跑一次，对比满载频率差异

echo "========================================"
echo "  CPU Throttle Check"
echo "  $(date)"
echo "========================================"
echo ""

# ---------- 1. 基础信息 ----------
echo "[1/5] Hardware max frequencies (cpuinfo_max_freq)"
echo "------------------------------------------------"
for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
    name=${cpu##*/}
    max=$(cat $cpu/cpufreq/cpuinfo_max_freq 2>/dev/null)
    if [ -n "$max" ]; then
        echo "  $name: $max"
    fi
done
echo ""

# ---------- 2. 尝试读 scaling_max_freq ----------
echo "[2/5] Policy max frequencies (scaling_max_freq)"
echo "------------------------------------------------"
CAN_READ_SMAX=0
for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
    name=${cpu##*/}
    smax=$(cat $cpu/cpufreq/scaling_max_freq 2>/dev/null)
    if [ -n "$smax" ]; then
        echo "  $name: $smax"
        CAN_READ_SMAX=1
    else
        echo "  $name: Permission denied (will use stress test)"
    fi
done
echo ""

# ---------- 3. Thermal 状态 ----------
echo "[3/5] Thermal status"
echo "------------------------------------------------"
# dumpsys 方式
THERMAL_STATUS=$(dumpsys thermalservice 2>/dev/null | grep "Thermal Status:" | head -1)
if [ -n "$THERMAL_STATUS" ]; then
    echo "  $THERMAL_STATUS"
    echo "  (0=NONE  1=LIGHT  2=MODERATE  3=SEVERE  4=CRITICAL  5=EMERGENCY)"
fi
echo ""
# shell 温度
echo "  Key temperatures:"
dumpsys thermalservice 2>/dev/null | grep -E "mName=(shell|CPU|GPU)" | while read line; do
    echo "    $line"
done
echo ""

# ---------- 4. 满载压测 ----------
echo "[4/5] Stress test — loading ALL cores for 5 seconds..."
echo "------------------------------------------------"

# 识别 CPU 拓扑：按 cpuinfo_max_freq 分组
CLUSTERS=""
for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
    freq=$(cat $cpu/cpufreq/cpuinfo_max_freq 2>/dev/null)
    name=${cpu##*/}
    num=${name#cpu}
    if [ -n "$freq" ]; then
        CLUSTERS="$CLUSTERS $num:$freq"
    fi
done

# 在每个核上启动满载进程
PIDS=""
for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
    name=${cpu##*/}
    num=${name#cpu}
    # 用 taskset 绑定到单个核，用 dd+md5sum 产生纯 CPU 负载
    taskset $(printf "%x" $((1 << num))) md5sum /dev/urandom &
    PIDS="$PIDS $!"
done

echo "  PIDs: $PIDS"
echo "  Waiting 5 seconds for frequencies to ramp up..."
sleep 5

# ---------- 5. 读取满载频率 ----------
echo ""
echo "[5/5] Frequencies under full load"
echo "================================================"
printf "  %-6s  %-14s  %-14s  %-10s\n" "Core" "HW Max" "Loaded Freq" "Ratio"
echo "  ------ -------------- -------------- ----------"

for cpu in /sys/devices/system/cpu/cpu[0-9]*; do
    name=${cpu##*/}
    hw_max=$(cat $cpu/cpufreq/cpuinfo_max_freq 2>/dev/null)
    cur=$(cat $cpu/cpufreq/scaling_cur_freq 2>/dev/null)
    if [ -n "$hw_max" ] && [ -n "$cur" ] && [ "$hw_max" -gt 0 ]; then
        ratio=$((cur * 100 / hw_max))
        if [ $ratio -lt 80 ]; then
            flag="  << THROTTLED"
        elif [ $ratio -lt 95 ]; then
            flag="  < mild"
        else
            flag=""
        fi
        printf "  %-6s  %-14s  %-14s  %3d%%%s\n" "$name" "$hw_max" "$cur" "$ratio" "$flag"
    fi
done

echo ""

# 清理满载进程
for pid in $PIDS; do
    kill $pid 2>/dev/null
done
wait 2>/dev/null

# ---------- 6. 再读一次 thermal ----------
echo "Post-stress thermal status:"
THERMAL_STATUS2=$(dumpsys thermalservice 2>/dev/null | grep "Thermal Status:" | head -1)
if [ -n "$THERMAL_STATUS2" ]; then
    echo "  $THERMAL_STATUS2"
fi
echo ""
echo "  Key temperatures after stress:"
dumpsys thermalservice 2>/dev/null | grep -E "mName=(shell|CPU|GPU)" | while read line; do
    echo "    $line"
done

echo ""
echo "========================================"
echo "  Done. Paste the output above for analysis."
echo "========================================"
