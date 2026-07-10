#Requires -Version 5.1
<#
.SYNOPSIS
  Run Cursor agent with readable UTF-8 stream output.

.DESCRIPTION
  Sets console/pipe encoding BEFORE agent starts, then formats stream-json.
  Use this instead of piping agent directly into format-agent-stream.ps1.

.EXAMPLE
  cd K:\AI\PerfAnalysisTool_Codebuddy
  .\docs\prism\process\scripts\run-readable-agent.ps1 `
    -p --trust --mode ask --workspace . `
    --output-format stream-json --stream-partial-output `
    "只读：一句话说明 docs/prism/state/now.md 当前里程碑"
#>
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$AgentArgs
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$lib = Join-Path $scriptDir "format-agent-stream.lib.ps1"
if (-not (Test-Path $lib)) { throw "Missing $lib" }
. $lib

Initialize-AgentStreamConsole
Reset-AgentStreamState

if (-not $AgentArgs -or $AgentArgs.Count -eq 0) {
    throw "Pass agent args after the script name, e.g. .\run-readable-agent.ps1 -p --trust --mode ask --workspace . --output-format stream-json --stream-partial-output `"prompt`""
}

if (-not (Get-Command agent -ErrorAction SilentlyContinue)) {
    throw "agent command not found on PATH."
}

& agent @AgentArgs 2>&1 | ForEach-Object {
    Format-AgentStreamLine -JsonLine $_
}

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
