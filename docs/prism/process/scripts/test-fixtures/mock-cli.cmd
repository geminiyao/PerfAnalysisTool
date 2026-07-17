@echo off
REM mock-cli.cmd - Simulate codebuddy stream-json output for dispatch script testing.
REM
REM Usage: mock-cli.cmd ^<scenario^>
REM   normal       - init + 3 assistant + result, exit 0
REM   think-gap    - init + 2 assistant + sleep 2s + 2 assistant + result, exit 0
REM   no-result    - init + 2 assistant, NO result event, exit 1
REM   stderr-flood - init + assistant + 50 lines stderr + result, exit 0
REM
REM Prompt on stdin is ignored (cmd does not read stdin by default).

setlocal

set "SCENARIO=%~1"
if "%SCENARIO%"=="" set "SCENARIO=normal"

if "%SCENARIO%"=="normal" goto :normal
if "%SCENARIO%"=="think-gap" goto :think_gap
if "%SCENARIO%"=="no-result" goto :no_result
if "%SCENARIO%"=="stderr-flood" goto :stderr_flood
echo {"type":"system","subtype":"init","model":"mock","cwd":"test","session_id":"mock-unknown"}
echo {"type":"result","duration_ms":1,"is_error":true,"result":"unknown scenario: %SCENARIO%"}
exit /b 2

:normal
echo {"type":"system","subtype":"init","model":"mock","cwd":"test","session_id":"mock-normal"}
echo {"type":"assistant","message":{"content":[{"type":"text","text":"start"}]}}
echo {"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"x"}}]}}
echo {"type":"assistant","message":{"content":[{"type":"text","text":"done"}]}}
echo {"type":"result","duration_ms":100,"is_error":false,"result":"ok-normal"}
exit /b 0

:think_gap
echo {"type":"system","subtype":"init","model":"mock","cwd":"test","session_id":"mock-think"}
echo {"type":"assistant","message":{"content":[{"type":"text","text":"before-think"}]}}
echo {"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"x"}}]}}
REM Simulate LLM thinking - stdout buffer empties, EndOfStream race window opens
timeout /t 2 /nobreak >nul
echo {"type":"assistant","message":{"content":[{"type":"text","text":"after-think"}]}}
echo {"type":"result","duration_ms":2000,"is_error":false,"result":"ok-think"}
exit /b 0

:no_result
echo {"type":"system","subtype":"init","model":"mock","cwd":"test","session_id":"mock-noresult"}
echo {"type":"assistant","message":{"content":[{"type":"text","text":"aborted"}]}}
echo {"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"tail"}}]}}
exit /b 1

:stderr_flood
echo {"type":"system","subtype":"init","model":"mock","cwd":"test","session_id":"mock-stderr"}
echo {"type":"assistant","message":{"content":[{"type":"text","text":"start"}]}}
REM Flood stderr - verify async stderr reader does not block stdout
for /l %%i in (1,1,50) do echo stderr line %%i from mock-cli 1>&2
echo {"type":"result","duration_ms":50,"is_error":false,"result":"ok-stderr"}
exit /b 0
