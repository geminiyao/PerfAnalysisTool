#Requires -Version 5.1
<#
.SYNOPSIS
  Poll worktickets/ and auto-dispatch TODO- tickets.

.EXAMPLE
  .\watch-worktickets.ps1
  .\watch-worktickets.ps1 -ProcessExisting -IntervalSeconds 30
#>
[CmdletBinding()]
param(
    [switch]$ProcessExisting,
    [int]$IntervalSeconds = 15,
    [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dispatchScript = Join-Path $scriptDir "dispatch-ticket.ps1"

if (-not (Test-Path $dispatchScript)) {
    throw "dispatch-ticket.ps1 not found: $dispatchScript"
}

function Get-ProjectRoot {
    param([string]$StartDir, [string]$ExplicitRoot)
    if ($ExplicitRoot) { return (Resolve-Path $ExplicitRoot).Path }

    $dir = $StartDir
    while ($dir) {
        $marker = Join-Path $dir "docs\prism\process\harness.md"
        if (Test-Path $marker) { return $dir }
        $parent = Split-Path $dir -Parent
        if ($parent -eq $dir) { break }
        $dir = $parent
    }
    throw "Project root not found."
}

$root = Get-ProjectRoot -StartDir $scriptDir -ExplicitRoot $ProjectRoot
$workDir = Join-Path $root "docs\prism\process\worktickets"
$dispatching = $false

function Try-Dispatch {
    param([bool]$Force)

    if ($script:dispatching) { return }

    $wip = Get-ChildItem -Path $workDir -Filter "WIP-*.md" -File -ErrorAction SilentlyContinue
    if ($wip -and -not $Force) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] WIP in progress: $($wip[0].Name)"
        return
    }

    $todo = Get-ChildItem -Path $workDir -Filter "TODO-*.md" -File |
        Sort-Object LastWriteTime |
        Select-Object -First 1

    if (-not $todo) { return }

    $script:dispatching = $true
    try {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Dispatch: $($todo.Name)"
        & $dispatchScript -Ticket $todo.Name -ProjectRoot $root
    }
    catch {
        Write-Error $_
    }
    finally {
        $script:dispatching = $false
    }
}

Write-Host "Watching: $workDir (every ${IntervalSeconds}s)"
Write-Host "Press Ctrl+C to stop"

if ($ProcessExisting) {
    Try-Dispatch -Force $true
}

while ($true) {
    Try-Dispatch -Force $false
    Start-Sleep -Seconds $IntervalSeconds
}
