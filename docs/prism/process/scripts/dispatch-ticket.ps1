#Requires -Version 5.1
<#
.SYNOPSIS
  Dispatch a Prism work ticket to Cursor Agent CLI.

.EXAMPLE
  .\dispatch-ticket.ps1 -Ticket TODO-WT-001-bk17-html-polish.md
  .\dispatch-ticket.ps1 -Latest
  .\dispatch-ticket.ps1 -Latest -DryRun
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Ticket,

    [switch]$Latest,
    [switch]$DryRun,
    [switch]$NoRenameWip,

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

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$templatePath = Join-Path $scriptDir "dispatch-prompt-template.txt"

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
$logFile = Join-Path $logDir "${timestamp}_${ticketName}.log"

Write-Host "Project: $root"
Write-Host "Ticket:  $ticketName"
Write-Host "Log:     $logFile"

if ($DryRun) {
    Write-Host ""
    Write-Host "--- DRY RUN: prompt ---"
    Write-Host ""
    Write-Host $prompt
    exit 0
}

if (-not $env:CURSOR_API_KEY) {
    throw "CURSOR_API_KEY is not set."
}

if (-not (Get-Command agent -ErrorAction SilentlyContinue)) {
    throw "agent command not found on PATH."
}

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
}

Push-Location $root
try {
    Write-Host "Dispatching Cursor Agent..."
    $header = "=== Prism dispatch $timestamp ===`nTicket: $ticketName`nCwd: $root`n`n"
    Set-Content -Path $logFile -Value $header -Encoding UTF8

    & agent -p --trust --force --output-format text $prompt 2>&1 |
        Tee-Object -FilePath $logFile -Append

    if ($LASTEXITCODE -ne 0) {
        throw "agent exited with code $LASTEXITCODE (see $logFile)"
    }

    Write-Host "Done. Check REVIEW- prefix and hand off to main agent."
    Write-Host "Log: $logFile"
}
finally {
    Pop-Location
}
