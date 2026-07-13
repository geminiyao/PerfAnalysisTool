#Requires -Version 5.1
<#
.SYNOPSIS
  Dispatch a Prism work ticket to CodeBuddy CLI.

.DESCRIPTION
  Mirrors dispatch-ticket.ps1 but targets `codebuddy` instead of Cursor `agent`.
  Prompt is piped via stdin (Windows .cmd wrappers truncate long positional prompts).
  Default model: glm-5.2.

.EXAMPLE
  .\dispatch-ticket-codebuddy.ps1 -Ticket TODO-WT-001-bk17-html-polish.md
  .\dispatch-ticket-codebuddy.ps1 -Latest
  .\dispatch-ticket-codebuddy.ps1 -Latest -DryRun
  .\dispatch-ticket-codebuddy.ps1 -Latest -Model glm-5.0
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Ticket,

    [switch]$Latest,
    [switch]$DryRun,
    [switch]$NoRenameWip,
    [switch]$RawJsonOnly,

    [string]$Model = "glm-5.2",
    [string]$CodeBuddyPath = "",
    [string]$AllowedTools = "Bash,Read,Write,Glob,Grep,Edit",
    [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

function Find-ProjectRoot {
    param([string]$StartDir)
    $dir = $StartDir
    while ($dir) {
        $marker = Join-Path $dir "docs\prism\process\harness.md"
        if (Test-Path $marker) { return $dir }
        $parent = Split-Path $dir -Parent
        if ($parent -eq $dir) { break }
        $dir = $parent
    }
    throw "Project root not found. Use -ProjectRoot."
}

function Resolve-TicketPath {
    param(
        [string]$Root,
        [string]$TicketInput,
        [bool]$PickLatest
    )
    $workDir = Join-Path $Root "docs\prism\process\worktickets"

    if ($PickLatest) {
        $candidates = Get-ChildItem -Path $workDir -Filter "TODO-*.md" -File |
            Sort-Object LastWriteTime -Descending
        if (-not $candidates) {
            throw "No TODO-*.md tickets in worktickets/."
        }
        return $candidates[0].FullName
    }

    if (-not $TicketInput) {
        throw "Specify -Ticket <filename> or -Latest."
    }

    if ([System.IO.Path]::IsPathRooted($TicketInput)) {
        if (-not (Test-Path $TicketInput)) { throw "Ticket not found: $TicketInput" }
        return (Resolve-Path $TicketInput).Path
    }

    $path = Join-Path $workDir $TicketInput
    if (-not (Test-Path $path)) { throw "Ticket not found: $path" }
    return (Resolve-Path $path).Path
}

function Build-DispatchPrompt {
    param(
        [string]$Root,
        [string]$TicketPath,
        [string]$TemplatePath
    )
    if (-not (Test-Path $TemplatePath)) {
        throw "Prompt template not found: $TemplatePath"
    }

    $relHarness = "docs/prism/process/harness.md"
    $relTicket = $TicketPath.Substring($Root.Length).TrimStart('\', '/').Replace('\', '/')
    $template = Get-Content -Path $TemplatePath -Raw -Encoding UTF8

    return $template.Replace('__HARNESS__', $relHarness).Replace('__TICKET__', $relTicket)
}

function Resolve-CodeBuddyExe {
    param([string]$ExplicitPath)

    if ($ExplicitPath) {
        if (-not (Test-Path $ExplicitPath)) {
            throw "CodeBuddyPath not found: $ExplicitPath"
        }
        return (Resolve-Path $ExplicitPath).Path
    }

    if ($env:APPDATA) {
        $npmCmd = Join-Path $env:APPDATA "npm\codebuddy.cmd"
        if (Test-Path $npmCmd) { return $npmCmd }
    }

    $cmd = Get-Command codebuddy.cmd -ErrorAction SilentlyContinue
    if (-not $cmd) {
        $cmd = Get-Command codebuddy -ErrorAction SilentlyContinue
    }
    if ($cmd) {
        $src = $null
        if ($cmd.Source) { $src = $cmd.Source }
        elseif ($cmd.Path) { $src = $cmd.Path }

        if ($src) {
            # Prefer .cmd sibling — ProcessStartInfo cannot run npm's .ps1 shim directly
            if ($src -match '\.ps1$') {
                $siblingCmd = [System.IO.Path]::ChangeExtension($src, ".cmd")
                if (Test-Path $siblingCmd) { return $siblingCmd }
            }
            return $src
        }
    }

    throw "codebuddy command not found on PATH. Install CodeBuddy CLI or pass -CodeBuddyPath."
}

function Invoke-CodeBuddyWithStdin {
    param(
        [string]$Exe,
        [string[]]$CliArgs,
        [string]$Prompt,
        [string]$WorkingDirectory,
        [string]$JsonlFile,
        [string]$LogFile,
        [bool]$RawOnly,
        [System.Text.Encoding]$Utf8
    )

    $argLine = ($CliArgs | ForEach-Object {
        $a = [string]$_
        if ($a -match '[\s"]') {
            '"' + ($a -replace '"', '\"') + '"'
        }
        else {
            $a
        }
    }) -join ' '

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $Exe
    $psi.Arguments = $argLine
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.StandardOutputEncoding = $Utf8
    $psi.StandardErrorEncoding = $Utf8

    # .cmd wrappers need cmd.exe; shell=true equivalent
    if ($Exe -match '\.(cmd|bat)$') {
        $psi.FileName = $env:ComSpec
        if (-not $psi.FileName) { $psi.FileName = "cmd.exe" }
        $quotedExe = '"' + $Exe + '"'
        $psi.Arguments = "/d /c $quotedExe $argLine"
    }

    $proc = New-Object System.Diagnostics.Process
    $proc.StartInfo = $psi

    $stderrBuilder = New-Object System.Text.StringBuilder
    $stderrHandler = {
        if (-not [string]::IsNullOrEmpty($EventArgs.Data)) {
            [void]$Event.MessageData.AppendLine($EventArgs.Data)
        }
    }

    $errEvent = Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived `
        -Action $stderrHandler -MessageData $stderrBuilder

    try {
        [void]$proc.Start()
        $proc.BeginErrorReadLine()

        $proc.StandardInput.Write($Prompt)
        $proc.StandardInput.Close()

        while (-not $proc.StandardOutput.EndOfStream) {
            $line = $proc.StandardOutput.ReadLine()
            if ($null -eq $line) { break }

            [System.IO.File]::AppendAllText($JsonlFile, "$line`r`n", $Utf8)

            if ($RawOnly) {
                Write-Host $line
            }
            else {
                # Format-* Write-Output → capture for .log; Write-Host still prints live
                $formattedLines = @(Format-CodeBuddyStreamLine -JsonLine $line)
                foreach ($f in $formattedLines) {
                    if ($f) {
                        [System.IO.File]::AppendAllText($LogFile, "$f`r`n", $Utf8)
                    }
                }
            }
        }

        $proc.WaitForExit()
        $exitCode = $proc.ExitCode

        $stderrText = $stderrBuilder.ToString().Trim()
        if ($stderrText) {
            $block = "`r`n--- stderr ---`r`n$stderrText`r`n"
            [System.IO.File]::AppendAllText($LogFile, $block, $Utf8)
            Write-Host $stderrText -ForegroundColor DarkYellow
        }

        return $exitCode
    }
    finally {
        if ($errEvent) {
            Unregister-Event -SourceIdentifier $errEvent.Name -ErrorAction SilentlyContinue
            Remove-Job -Id $errEvent.Id -Force -ErrorAction SilentlyContinue
        }
        if (-not $proc.HasExited) {
            try { $proc.Kill() } catch { }
        }
        $proc.Dispose()
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$templatePath = Join-Path $scriptDir "dispatch-prompt-template-codebuddy.txt"
$formatterLib = Join-Path $scriptDir "format-codebuddy-stream.lib.ps1"

if ($ProjectRoot) {
    $root = (Resolve-Path $ProjectRoot).Path
} else {
    $root = Find-ProjectRoot -StartDir $scriptDir
}

if (-not $PSBoundParameters.ContainsKey('Latest') -and -not $PSBoundParameters.ContainsKey('Ticket')) {
    $pickLatest = $true
} else {
    $pickLatest = $Latest.IsPresent
}

$ticketPath = Resolve-TicketPath -Root $root -TicketInput $Ticket -PickLatest $pickLatest
$ticketName = Split-Path $ticketPath -Leaf
$workDir = Split-Path $ticketPath -Parent
$logDir = Join-Path $workDir "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$prompt = Build-DispatchPrompt -Root $root -TicketPath $ticketPath -TemplatePath $templatePath
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$baseName = "cb_${timestamp}_${ticketName}"
$jsonlFile = Join-Path $logDir "$baseName.jsonl"
$logFile = Join-Path $logDir "$baseName.log"
$promptFile = Join-Path $logDir "$baseName.prompt.txt"

$codebuddyExe = Resolve-CodeBuddyExe -ExplicitPath $CodeBuddyPath

Write-Host "Project:  $root"
Write-Host "Ticket:   $ticketName"
Write-Host "CLI:      $codebuddyExe"
Write-Host "Model:    $Model"
Write-Host "Jsonl:    $jsonlFile"
Write-Host "Log:      $logFile"

if ($DryRun) {
    Write-Host ""
    Write-Host "--- DRY RUN: prompt ---"
    Write-Host ""
    Write-Host $prompt
    Write-Host ""
    Write-Host "--- DRY RUN: argv ---"
    Write-Host "codebuddy -p --output-format stream-json -y --dangerously-skip-permissions --model $Model --allowedTools $AllowedTools"
    Write-Host "(prompt via stdin)"
    exit 0
}

if (-not (Test-Path $formatterLib)) {
    throw "Formatter lib not found: $formatterLib"
}

. $formatterLib
Initialize-CodeBuddyStreamConsole

$utf8 = Get-CodeBuddyStreamUtf8Encoding

if (-not $NoRenameWip -and $ticketName.StartsWith("TODO-")) {
    $wipName = "WIP-" + $ticketName.Substring(5)
    $wipPath = Join-Path $workDir $wipName
    if (Test-Path $wipPath) {
        throw "WIP ticket already exists: $wipName"
    }
    Rename-Item -Path $ticketPath -NewName $wipName
    $ticketPath = $wipPath
    $ticketName = $wipName
    Write-Host "Renamed to: $ticketName"
    $prompt = Build-DispatchPrompt -Root $root -TicketPath $ticketPath -TemplatePath $templatePath
    $baseName = "cb_${timestamp}_${ticketName}"
    $jsonlFile = Join-Path $logDir "$baseName.jsonl"
    $logFile = Join-Path $logDir "$baseName.log"
    $promptFile = Join-Path $logDir "$baseName.prompt.txt"
}

Set-Content -Path $promptFile -Value $prompt -Encoding UTF8

$header = @(
    "=== Prism CodeBuddy dispatch $timestamp ==="
    "Ticket: $ticketName"
    "Cwd:    $root"
    "CLI:    $codebuddyExe"
    "Model:  $Model"
    "Jsonl:  $jsonlFile"
    "Prompt: $promptFile"
    ""
) -join "`n"
Set-Content -Path $logFile -Value $header -Encoding UTF8
Set-Content -Path $jsonlFile -Value "" -Encoding UTF8

$cbArgs = @(
    "-p",
    "--output-format", "stream-json",
    "-y",
    "--dangerously-skip-permissions",
    "--model", $Model,
    "--allowedTools", $AllowedTools
)

Write-Host "Dispatching CodeBuddy (cwd=$root, model=$Model)..."
Reset-CodeBuddyStreamState

$exitCode = Invoke-CodeBuddyWithStdin `
    -Exe $codebuddyExe `
    -CliArgs $cbArgs `
    -Prompt $prompt `
    -WorkingDirectory $root `
    -JsonlFile $jsonlFile `
    -LogFile $logFile `
    -RawOnly:$RawJsonOnly.IsPresent `
    -Utf8 $utf8

if ($exitCode -ne 0) {
    throw "codebuddy exited with code $exitCode (see $logFile and $jsonlFile)"
}

Write-Host ""
Write-Host "Done. Check REVIEW- prefix and hand off to main agent."
Write-Host "Readable log: $logFile"
Write-Host "Raw stream:   $jsonlFile"
Write-Host "Prompt archive: $promptFile"
