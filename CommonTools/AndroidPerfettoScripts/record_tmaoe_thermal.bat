@echo off
setlocal enabledelayedexpansion

:: ============================================
::   Perfetto + Thermal 一键采集脚本
::   基于 record_tmaoe.bat 增强版
::   增加: 采集前后 thermal/频率限制状态
:: ============================================

set OUTPUT_DIR=output
set TRACE_DURATION=10s
set BUFFER_SIZE=32mb
set GAME_PACKAGE=com.tencent.aoeyz

:: 生成时间戳
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set DATESTAMP=%%a%%b%%c
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TIMESTAMP=%%a%%b
set FILENAME=%DATESTAMP%_%TIMESTAMP%

if not exist %OUTPUT_DIR% mkdir %OUTPUT_DIR%

echo ============================================
echo   Perfetto + Thermal 一键采集
echo   游戏: %GAME_PACKAGE%
echo   时长: %TRACE_DURATION%
echo ============================================
echo.

:: [1/4] 采集前 thermal baseline
echo [1/4] 采集前 thermal baseline...
echo === BEFORE TRACE === > %OUTPUT_DIR%\thermal_before_%FILENAME%.txt
echo --- scaling_max_freq --- >> %OUTPUT_DIR%\thermal_before_%FILENAME%.txt
adb shell "cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq" >> %OUTPUT_DIR%\thermal_before_%FILENAME%.txt 2>nul
echo --- cpuinfo_max_freq --- >> %OUTPUT_DIR%\thermal_before_%FILENAME%.txt
adb shell "cat /sys/devices/system/cpu/cpu*/cpufreq/cpuinfo_max_freq" >> %OUTPUT_DIR%\thermal_before_%FILENAME%.txt 2>nul
echo --- thermal_zone temp --- >> %OUTPUT_DIR%\thermal_before_%FILENAME%.txt
adb shell "for tz in /sys/class/thermal/thermal_zone*; do echo $tz/temp: $(cat $tz/temp 2>/dev/null); done" >> %OUTPUT_DIR%\thermal_before_%FILENAME%.txt 2>nul
echo --- cooling_device state --- >> %OUTPUT_DIR%\thermal_before_%FILENAME%.txt
adb shell "for cd in /sys/class/thermal/cooling_device*; do echo $cd: type=$(cat $cd/type 2>/dev/null) state=$(cat $cd/cur_state 2>/dev/null); done" >> %OUTPUT_DIR%\thermal_before_%FILENAME%.txt 2>nul
echo   Done.

:: [2/4] Perfetto 采集 (增加 power category)
echo.
echo [2/4] 开始 Perfetto 采集 (%TRACE_DURATION%)...
echo   请在手机上操作游戏场景...
"python-3.9.6/python.exe" record_android_trace -t %TRACE_DURATION% -b %BUFFER_SIZE% -o %OUTPUT_DIR%\trace_%FILENAME%.pftrace sched freq idle power am wm gfx view binder_driver hal dalvik camera input res memory -a %GAME_PACKAGE%
echo   Perfetto 采集完成.

:: [3/4] 采集后 thermal 状态
echo.
echo [3/4] 采集后 thermal 状态...
echo === AFTER TRACE === > %OUTPUT_DIR%\thermal_after_%FILENAME%.txt
echo --- scaling_max_freq --- >> %OUTPUT_DIR%\thermal_after_%FILENAME%.txt
adb shell "cat /sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq" >> %OUTPUT_DIR%\thermal_after_%FILENAME%.txt 2>nul
echo --- cpuinfo_max_freq --- >> %OUTPUT_DIR%\thermal_after_%FILENAME%.txt
adb shell "cat /sys/devices/system/cpu/cpu*/cpufreq/cpuinfo_max_freq" >> %OUTPUT_DIR%\thermal_after_%FILENAME%.txt 2>nul
echo --- thermal_zone temp --- >> %OUTPUT_DIR%\thermal_after_%FILENAME%.txt
adb shell "for tz in /sys/class/thermal/thermal_zone*; do echo $tz/temp: $(cat $tz/temp 2>/dev/null); done" >> %OUTPUT_DIR%\thermal_after_%FILENAME%.txt 2>nul
echo --- cooling_device state --- >> %OUTPUT_DIR%\thermal_after_%FILENAME%.txt
adb shell "for cd in /sys/class/thermal/cooling_device*; do echo $cd: type=$(cat $cd/type 2>/dev/null) state=$(cat $cd/cur_state 2>/dev/null); done" >> %OUTPUT_DIR%\thermal_after_%FILENAME%.txt 2>nul
echo   Done.

:: [4/4] 显示结果摘要
echo.
echo [4/4] 结果摘要:
echo ============================================
echo.
echo --- 采集前 频率上限 ---
type %OUTPUT_DIR%\thermal_before_%FILENAME%.txt | findstr "scaling_max_freq cpuinfo_max_freq"
echo.
echo --- 采集后 频率上限 ---
type %OUTPUT_DIR%\thermal_after_%FILENAME%.txt | findstr "scaling_max_freq cpuinfo_max_freq"
echo.
echo ============================================
echo   输出文件:
echo   [TRACE] %OUTPUT_DIR%\trace_%FILENAME%.pftrace
echo   [BEFORE] %OUTPUT_DIR%\thermal_before_%FILENAME%.txt
echo   [AFTER] %OUTPUT_DIR%\thermal_after_%FILENAME%.txt
echo.
echo   降频判定:
echo   - 如果 scaling_max_freq < cpuinfo_max_freq → 系统在限频!
echo   - 如果 cooling_device state > 0 → thermal 已激活!
echo   - 如果采集后温度明显高于采集前 → 设备在发热
echo ============================================

pause
