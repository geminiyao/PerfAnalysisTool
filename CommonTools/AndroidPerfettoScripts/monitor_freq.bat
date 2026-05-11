@echo off
setlocal enabledelayedexpansion

:: ============================================
::   CPU 频率 + 温度 持续监控脚本
::   用途: 游戏运行期间后台采集，产出 CSV 时间线
::   使用: 双击运行，游戏跑完后 Ctrl+C 停止
:: ============================================

set OUTPUT_DIR=output
set INTERVAL=1
if not "%~1"=="" set INTERVAL=%~1

if not exist %OUTPUT_DIR% mkdir %OUTPUT_DIR%

:: 生成文件名
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set DATESTAMP=%%a%%b%%c
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TMSTAMP=%%a%%b
set TMSTAMP=%TMSTAMP: =0%
set CSV_FILE=%OUTPUT_DIR%\freq_monitor_%DATESTAMP%_%TMSTAMP%.csv

echo ============================================
echo   CPU 频率 + 温度 持续监控
echo   采集间隔: %INTERVAL% 秒
echo   输出文件: %CSV_FILE%
echo   按 Ctrl+C 停止采集
echo ============================================
echo.

:: 先采集设备信息
echo [设备信息]
adb shell "cat /proc/cpuinfo | grep 'Hardware\|model'" 2>nul
echo.

:: 获取 CPU 核心数和理论最大频率
echo [CPU 理论最大频率 cpuinfo_max_freq]
adb shell "for i in 0 1 2 3 4 5 6 7; do echo cpu$i: $(cat /sys/devices/system/cpu/cpu$i/cpufreq/cpuinfo_max_freq 2>/dev/null); done" 2>nul
echo.

:: 获取 thermal zone 名称
echo [Thermal Zone 列表]
adb shell "for tz in /sys/class/thermal/thermal_zone*; do echo $(basename $tz): type=$(cat $tz/type 2>/dev/null); done" 2>nul
echo.

:: 写 CSV 头
echo timestamp,cpu0_cur,cpu0_max,cpu4_cur,cpu4_max,cpu6_cur,cpu6_max,cpu7_cur,cpu7_max,thermal_zone0_temp,thermal_zone1_temp,scaling_limited > %CSV_FILE%

echo [开始采集...] 每 %INTERVAL% 秒一行
echo.

:: 循环采集
:loop
adb shell "
  ts=$(date +%%s);
  c0=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq 2>/dev/null || echo 0);
  m0=$(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq 2>/dev/null || echo 0);
  c4=$(cat /sys/devices/system/cpu/cpu4/cpufreq/scaling_cur_freq 2>/dev/null || echo 0);
  m4=$(cat /sys/devices/system/cpu/cpu4/cpufreq/scaling_max_freq 2>/dev/null || echo 0);
  c6=$(cat /sys/devices/system/cpu/cpu6/cpufreq/scaling_cur_freq 2>/dev/null || echo 0);
  m6=$(cat /sys/devices/system/cpu/cpu6/cpufreq/scaling_max_freq 2>/dev/null || echo 0);
  c7=$(cat /sys/devices/system/cpu/cpu7/cpufreq/scaling_cur_freq 2>/dev/null || echo 0);
  m7=$(cat /sys/devices/system/cpu/cpu7/cpufreq/scaling_max_freq 2>/dev/null || echo 0);
  t0=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo 0);
  t1=$(cat /sys/class/thermal/thermal_zone1/temp 2>/dev/null || echo 0);
  mx6=$(cat /sys/devices/system/cpu/cpu6/cpufreq/cpuinfo_max_freq 2>/dev/null || echo 0);
  if [ $m6 -lt $mx6 ] 2>/dev/null; then limited=YES; else limited=NO; fi;
  echo $ts,$c0,$m0,$c4,$m4,$c6,$m6,$c7,$m7,$t0,$t1,$limited
" >> %CSV_FILE%

:: 实时显示最后一行
for /f "usebackq delims=" %%L in (`type %CSV_FILE% ^| findstr /n "." ^| findstr /r "^[0-9]*:" ^| sort /r ^| findstr /r "^"`) do (
    set "LASTLINE=%%L"
    goto :showline
)
:showline
echo %LASTLINE:*:=%

timeout /t %INTERVAL% /nobreak >nul
goto loop
