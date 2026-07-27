@echo off
setlocal enabledelayedexpansion

REM ============================================================================
REM  profile.bat  -  one-shot Unity / IL2CPP simpleperf capture script
REM ----------------------------------------------------------------------------
REM  Purpose: work around two pipeline bugs in the .dbg.so symbol package:
REM    1) .eh_frame is stripped to NOBITS -> simpleperf record-time DWARF
REM       unwind reads empty data -> bogus stack tops like
REM       dummy::SuiteTLSModule_Dummy::...::RunImpl
REM    2) symbol files are named libfoo.dbg.so but binary_cache_builder.py
REM       does exact filename matching for libfoo.so
REM
REM  Strategy:
REM    - record WITHOUT -lib so simpleperf falls back to the device-side
REM      stripped libfoo.so (whose .eh_frame is intact PROGBITS)
REM    - rename symbols/*.dbg.so -> symbols_renamed/*.so for the report stage,
REM      and inject those into binary_cache for symbol resolution
REM
REM  See SIMPLEPERF_TROUBLESHOOTING.md for the full postmortem.
REM
REM  Usage:
REM      profile.bat ^<package_name^> [duration_sec] [output_basename] [symbols_dir]
REM  Examples:
REM      profile.bat com.tencent.aoeyz
REM      profile.bat com.tencent.aoeyz 30
REM      profile.bat com.tencent.aoeyz 10 perf_battle
REM      profile.bat com.tencent.aoeyz 10 perf_battle symbols_aoeyz
REM      profile.bat com.tencent.aoeyz 10 perf D:\some\other\symbols
REM ============================================================================

if "%~1"=="" (
    echo [ERROR] Usage: profile.bat ^<package_name^> [duration_sec=10] [output_basename=perf] [symbols_dir=symbols]
    exit /b 1
)

set PKG=%~1
set DURATION=%~2
if "%DURATION%"=="" set DURATION=10
set OUT=%~3
if "%OUT%"=="" set OUT=perf
set SYMBOLS_ARG=%~4
if "%SYMBOLS_ARG%"=="" set SYMBOLS_ARG=symbols

set SCRIPT_DIR=%~dp0
pushd "%SCRIPT_DIR%"

REM Resolve symbols dir: if absolute path, use as-is; else treat as relative to script dir
if exist "%SYMBOLS_ARG%\" (
    REM Relative path that exists
    for %%I in ("%SYMBOLS_ARG%") do set "SYMBOLS_DIR=%%~fI"
) else if exist "%SCRIPT_DIR%%SYMBOLS_ARG%\" (
    set "SYMBOLS_DIR=%SCRIPT_DIR%%SYMBOLS_ARG%"
) else (
    set "SYMBOLS_DIR=%SYMBOLS_ARG%"
)
set "SYMBOLS_RENAMED=%SCRIPT_DIR%symbols_renamed"
set ADB=D:\Android\android-sdk\platform-tools\adb.exe

if not exist "%ADB%" set ADB=adb

echo.
echo ============================================================
echo   profile.bat
echo   package      : %PKG%
echo   duration(sec): %DURATION%
echo   output       : %OUT%.data / %OUT%.html
echo   symbols dir  : %SYMBOLS_DIR%
echo ============================================================
echo.

REM --- STEP 0: build symbols_renamed/ (rename *.dbg.so -> *.so) ---
echo [STEP 0/4] Preparing symbols_renamed\ ...
if not exist "%SYMBOLS_DIR%" (
    echo [ERROR] symbols dir not found: %SYMBOLS_DIR%
    echo         Place the pipeline-downloaded symbol files in symbols\ first.
    popd & exit /b 1
)

if exist "%SYMBOLS_RENAMED%" rmdir /s /q "%SYMBOLS_RENAMED%"
mkdir "%SYMBOLS_RENAMED%"

for %%F in ("%SYMBOLS_DIR%\*.dbg.so") do (
    set "name=%%~nF"
    set "name=!name:.dbg=!"
    copy /y "%%F" "%SYMBOLS_RENAMED%\!name!.so" >nul
    if errorlevel 1 (
        echo [ERROR] copy failed: %%F
        popd & exit /b 1
    )
    echo   - %%~nxF -^> !name!.so
)

REM Also copy *.so that don't have .dbg suffix
for %%F in ("%SYMBOLS_DIR%\*.so") do (
    set "fname=%%~nxF"
    echo !fname! | findstr /i "\.dbg\.so$" >nul
    if errorlevel 1 (
        copy /y "%%F" "%SYMBOLS_RENAMED%\!fname!" >nul
        echo   - %%~nxF -^> !fname!
    )
)

echo.

REM --- STEP 1: clear device-side native_libs (CRITICAL!) ---
REM   If /data/local/tmp/native_libs/ exists, app_profiler.py auto-adds
REM   --symfs ... and simpleperf will pick the broken .dbg.so even though
REM   we did NOT pass -lib this time. Always clear it first.
echo [STEP 1/4] Clearing /data/local/tmp/native_libs/ on device ...
"%ADB%" shell rm -rf /data/local/tmp/native_libs/
if errorlevel 1 (
    echo [WARN] adb rm failed, continuing anyway
)

echo.

REM --- STEP 2: record WITHOUT -lib ---
echo [STEP 2/4] Recording perf data (no -lib, duration=%DURATION%s) ...
echo.
python app_profiler.py -p "%PKG%" -r "-e cpu-cycles:u -f 1000 -g --duration %DURATION%" -o "%OUT%.data"
if errorlevel 1 (
    echo [ERROR] app_profiler.py failed
    popd & exit /b 1
)

echo.

REM --- STEP 3: inject symbols using symbols_renamed/ ---
echo [STEP 3/4] Injecting symbols into binary_cache (via symbols_renamed\) ...
python binary_cache_builder.py -i "%OUT%.data" -lib "%SYMBOLS_RENAMED%"
if errorlevel 1 (
    echo [ERROR] binary_cache_builder.py failed
    popd & exit /b 1
)

echo.

REM --- STEP 4: generate html report ---
echo [STEP 4/4] Generating html report ...
python report_html.py -i "%OUT%.data" -o "%OUT%.html"
if errorlevel 1 (
    echo [ERROR] report_html.py failed
    popd & exit /b 1
)

echo.

REM --- self-check: distribution of UnityMain outermost frame (must reach __start_thread) ---
echo ============================================================
echo   Self-check: UnityMain outermost-frame distribution
echo   (healthy = high %% of __start_thread, ZERO Testkey_GetPubKey)
echo ============================================================
.\bin\windows\x86_64\simpleperf.exe report-sample --show-callchain --symdir .\binary_cache -i "%OUT%.data" -o "%OUT%.samples.tmp" 2>nul >nul
python "%SCRIPT_DIR%_selfcheck.py" "%OUT%.samples.tmp"
del "%OUT%.samples.tmp" 2>nul
echo ------------------------------------------------------------
echo.

echo ============================================================
echo   DONE
echo   - perf data : %SCRIPT_DIR%%OUT%.data
echo   - flame html: %SCRIPT_DIR%%OUT%.html
echo ============================================================
echo.
echo   Tip: open %OUT%.html in a browser. UnityMain stack top should be
echo        __start_thread (NOT dummy::SuiteTLSModule_Dummy...::RunImpl).
echo.

popd
endlocal
exit /b 0
