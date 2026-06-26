@echo off
REM One-shot: base+cur simpleperf → v4 report (aoeyz calibration data)
set BASE=D:\Android\android-ndk-r21e-windows-x86_64\simpleperf\perf_aoeyz_base.data
set CUR=D:\Android\android-ndk-r21e-windows-x86_64\simpleperf\perf_aoeyz_stressmove.data
set CACHE=D:\Android\android-ndk-r21e-windows-x86_64\simpleperf\binary_cache
set OUT=docs\report\_intermediate\aoeyz_diff

cd /d %~dp0..
python simpleperf/build_simpleperf_profile.py --base %BASE% --perf %CUR% --binary-cache %CACHE% --out %OUT% --scene-base "野外空场景" --scene-cur "stressmove"
python scripts/validate_v4_report.py %OUT%
python scripts/compare_v4_report_quality.py %OUT%\report\performance-report_simpleperf_v4.md
echo.
echo Report: %OUT%\report\performance-report_simpleperf_v4.md
