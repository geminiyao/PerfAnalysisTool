#Requires -Version 5.1
<#
.SYNOPSIS
  Turn agent stream-json (JSONL) into readable console/log output.

.EXAMPLE
  agent -p --trust --output-format stream-json --stream-partial-output "..." |
    .\format-agent-stream.ps1

.EXAMPLE
  .\format-agent-stream.ps1 -InputFile worktickets/logs/run.jsonl
#>
param(
    [string]$InputFile,
    [switch]$ShowThinking,
    [switch]$ShowAssistantStream
)

$lib = Join-Path $PSScriptRoot "format-agent-stream.lib.ps1"
if (-not (Test-Path $lib)) { throw "Missing $lib" }
. $lib
Initialize-AgentStreamConsole

Reset-AgentStreamState

$fmtArgs = @{}
if ($PSBoundParameters.ContainsKey('ShowThinking')) { $fmtArgs.ShowThinking = $ShowThinking }
if ($PSBoundParameters.ContainsKey('ShowAssistantStream')) { $fmtArgs.ShowAssistantStream = $ShowAssistantStream }

if ($InputFile) {
    Get-Content -Path $InputFile -Encoding UTF8 | ForEach-Object {
        Format-AgentStreamLine -JsonLine $_ @fmtArgs
    }
}
else {
    $input | ForEach-Object {
        Format-AgentStreamLine -JsonLine $_ @fmtArgs
    }
}
