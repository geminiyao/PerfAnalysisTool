# smoke-phase1.ps1 — 校验 p1-refresh 样例关键字段
param([string]$Root = "output\p1-refresh")
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
python (Join-Path $ScriptDir "smoke-phase1.py") $Root
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
