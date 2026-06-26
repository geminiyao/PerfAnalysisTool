@echo off
REM aoeyz 正式交付：Provider 加厚 + AI 润色 + 质量门回退
cd /d %~dp0..
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run_simpleperf_v4_codebuddy.ps1 %*
