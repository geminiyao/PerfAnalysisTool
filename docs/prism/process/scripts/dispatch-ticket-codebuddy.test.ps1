#Requires -Version 5.1
<#
.SYNOPSIS
  Local unit tests for dispatch-ticket-codebuddy.ps1's Invoke-CodeBuddyWithStdin.

.DESCRIPTION
  Tests process-management robustness using mock-cli.cmd (no real codebuddy).
  Does NOT touch any workticket or project code — only verifies that the
  dispatch function:
    1. Captures all stdout lines even when the CLI pauses (EndOfStream race)
    2. Detects missing result events and writes a diagnostic block
    3. Does not deadlock on heavy stderr
    4. Returns correct exit codes

  Run:
    powershell -NoProfile -File docs\prism\process\scripts\dispatch-ticket-codebuddy.test.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$script:passCount = 0
$script:failCount = 0

function Write-TestResult {
    param([bool]$Pass, [string]$Label, [string]$Detail = "")
    if ($Pass) {
        Write-Host "  PASS: $Label" -ForegroundColor Green
        $script:passCount++
    }
    else {
        $msg = if ($Detail) { "$Label — $Detail" } else { $Label }
        Write-Host "  FAIL: $msg" -ForegroundColor Red
        $script:failCount++
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dispatchScript = Join-Path $scriptDir "dispatch-ticket-codebuddy.ps1"
$formatterLib = Join-Path $scriptDir "format-codebuddy-stream.lib.ps1"
$mockCli = Join-Path $scriptDir "test-fixtures\mock-cli.cmd"
$tempRoot = Join-Path $env:TEMP "dispatch-cb-test-$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

# dot-source dispatch script (guard skips main flow) + formatter lib
. $dispatchScript
. $formatterLib
Initialize-CodeBuddyStreamConsole
$utf8 = Get-CodeBuddyStreamUtf8Encoding

Write-Host "=== dispatch-ticket-codebuddy.ps1 unit tests ==="
Write-Host "Temp dir: $tempRoot"
Write-Host ""

function Invoke-TestCase {
    param(
        [string]$Name,
        [string]$Scenario,
        [int]$ExpectedExitCode,
        [scriptblock]$Assertions
    )
    Write-Host "[$Name] scenario=$Scenario"

    $jsonl = Join-Path $tempRoot "$Name.jsonl"
    $log = Join-Path $tempRoot "$Name.log"
    "" | Set-Content -Path $jsonl -Encoding UTF8
    "" | Set-Content -Path $log -Encoding UTF8

    Reset-CodeBuddyStreamState

    $cliArgs = @($Scenario)
    $exitCode = Invoke-CodeBuddyWithStdin `
        -Exe $mockCli `
        -CliArgs $cliArgs `
        -Prompt "test prompt`n" `
        -WorkingDirectory $tempRoot `
        -JsonlFile $jsonl `
        -LogFile $log `
        -RawOnly:$false `
        -Utf8 $utf8

    & $Assertions -ExitCode $exitCode -JsonlFile $jsonl -LogFile $log
    Write-Host ""
}

# ─────────────────────────── Case 1: normal completion ───────────────────────────
Invoke-TestCase -Name "normal" -Scenario "normal" -ExpectedExitCode 0 -Assertions {
    param($ExitCode, $JsonlFile, $LogFile)

    Write-TestResult ($ExitCode -eq 0) "exit code is 0" "got $ExitCode"

    $lines = @(Get-Content -Path $JsonlFile -Encoding UTF8 | Where-Object { $_ -and $_.Trim() })
    Write-TestResult ($lines.Count -ge 5) "jsonl has >=5 lines" "got $($lines.Count)"

    if ($lines.Count -eq 0) {
        Write-TestResult $false "last line is result event" "no lines in jsonl"
        return
    }
    $lastLine = $lines[-1]
    $lastObj = $null
    try { $lastObj = $lastLine | ConvertFrom-Json -ErrorAction Stop } catch { }
    Write-TestResult ($lastObj -and $lastObj.type -eq "result") "last line is result event" "got: $lastLine"

    $logContent = Get-Content -Path $LogFile -Encoding UTF8 -Raw
    Write-TestResult ($logContent -notmatch 'WARN\] process exited without result event') "no WARN diagnostic" "found WARN block"
}

# ─────────────────────────── Case 2: think-gap (EndOfStream race regression) ───────────────────────────
Invoke-TestCase -Name "think-gap" -Scenario "think-gap" -ExpectedExitCode 0 -Assertions {
    param($ExitCode, $JsonlFile, $LogFile)

    Write-TestResult ($ExitCode -eq 0) "exit code is 0" "got $ExitCode"

    $lines = @(Get-Content -Path $JsonlFile -Encoding UTF8 | Where-Object { $_ -and $_.Trim() })
    # Expected: init + before-think + tool_use + after-think + result = 5 lines
    Write-TestResult ($lines.Count -ge 5) "jsonl has >=5 lines (post-sleep output not lost)" "got $($lines.Count)"

    $hasAfterThink = $false
    foreach ($l in $lines) {
        if ($l -match 'after-think') { $hasAfterThink = $true; break }
    }
    Write-TestResult $hasAfterThink "post-sleep 'after-think' line captured (EndOfStream race fixed)" "line missing"

    if ($lines.Count -eq 0) {
        Write-TestResult $false "last line is result event" "no lines in jsonl"
        return
    }
    $lastLine = $lines[-1]
    $lastObj = $null
    try { $lastObj = $lastLine | ConvertFrom-Json -ErrorAction Stop } catch { }
    Write-TestResult ($lastObj -and $lastObj.type -eq "result") "last line is result event" "got: $lastLine"

    $logContent = Get-Content -Path $LogFile -Encoding UTF8 -Raw
    Write-TestResult ($logContent -notmatch 'WARN\] process exited without result event') "no WARN diagnostic" "found WARN block"
}

# ─────────────────────────── Case 3: no-result (interrupted, diagnostic) ───────────────────────────
Invoke-TestCase -Name "no-result" -Scenario "no-result" -ExpectedExitCode 1 -Assertions {
    param($ExitCode, $JsonlFile, $LogFile)

    Write-TestResult ($ExitCode -eq 1) "exit code is 1 (CLI aborted)" "got $ExitCode"

    $lines = @(Get-Content -Path $JsonlFile -Encoding UTF8 | Where-Object { $_ -and $_.Trim() })
    if ($lines.Count -eq 0) {
        Write-TestResult $false "last line is NOT result event" "no lines in jsonl"
    }
    else {
        $lastLine = $lines[-1]
        $lastObj = $null
        try { $lastObj = $lastLine | ConvertFrom-Json -ErrorAction Stop } catch { }
        Write-TestResult ($lastObj -and $lastObj.type -ne "result") "last line is NOT result event" "got: $lastLine"
    }

    $logContent = Get-Content -Path $LogFile -Encoding UTF8 -Raw
    Write-TestResult ($logContent -match 'WARN\] process exited without result event') "WARN diagnostic block written" "no WARN block"
    Write-TestResult ($logContent -match 'exitCode\s*=\s*1') "diagnostic shows exitCode=1" "exitCode missing"
    Write-TestResult ($logContent -match 'lastType') "diagnostic shows lastType field" "lastType missing"
}

# ─────────────────────────── Case 4: stderr flood (no deadlock) ───────────────────────────
Invoke-TestCase -Name "stderr-flood" -Scenario "stderr-flood" -ExpectedExitCode 0 -Assertions {
    param($ExitCode, $JsonlFile, $LogFile)

    Write-TestResult ($ExitCode -eq 0) "exit code is 0" "got $ExitCode"

    $lines = @(Get-Content -Path $JsonlFile -Encoding UTF8 | Where-Object { $_ -and $_.Trim() })
    Write-TestResult ($lines.Count -ge 3) "jsonl has >=3 lines (stdout not blocked by stderr)" "got $($lines.Count)"

    if ($lines.Count -eq 0) {
        Write-TestResult $false "last line is result event" "no lines in jsonl"
        return
    }
    $lastLine = $lines[-1]
    $lastObj = $null
    try { $lastObj = $lastLine | ConvertFrom-Json -ErrorAction Stop } catch { }
    Write-TestResult ($lastObj -and $lastObj.type -eq "result") "last line is result event" "got: $lastLine"

    $logContent = Get-Content -Path $LogFile -Encoding UTF8 -Raw
    Write-TestResult ($logContent -match 'stderr line') "stderr flood captured" "no stderr lines in log"
    Write-TestResult ($logContent -notmatch 'WARN\] process exited without result event') "no WARN diagnostic" "found WARN block"
}

# ─────────────────────────── Summary ───────────────────────────
Write-Host "=== Summary ==="
Write-Host "PASS: $script:passCount" -ForegroundColor Green
Write-Host "FAIL: $script:failCount" -ForegroundColor $(if ($script:failCount -gt 0) { 'Red' } else { 'Green' })

if ($script:failCount -gt 0) {
    Write-Host ""
    Write-Host "Temp dir kept for inspection: $tempRoot"
    exit 1
}
else {
    Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}
