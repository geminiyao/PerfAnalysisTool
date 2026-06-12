param(
  [int]$Port = 3001,
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot 'web'

if (-not (Test-Path $webDir)) {
  throw "Web directory not found: $webDir"
}

Set-Location $webDir

if (-not $SkipInstall) {
  if (-not (Test-Path (Join-Path $webDir 'node_modules'))) {
    Write-Host '[1/3] Installing dependencies...'
    npm install
  } else {
    Write-Host '[1/3] Dependencies already installed. Use -SkipInstall to skip this check explicitly.'
  }
} else {
  Write-Host '[1/3] Skipping dependency install.'
}

Write-Host '[2/3] Rebuilding web service...'
npm run build

if ($LASTEXITCODE -ne 0) {
  throw "Build failed with exit code $LASTEXITCODE"
}

$entry = Join-Path $webDir 'dist/server/server/index.js'
if (-not (Test-Path $entry)) {
  throw "Server entry not found after build: $entry"
}

$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listeners) {
  $processes = $listeners | ForEach-Object {
    $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
    if ($process) { "$($_.LocalAddress):$($_.LocalPort) -> $($process.ProcessName)($($process.Id))" }
  }
  throw "Port $Port is already in use:`n$($processes -join "`n")`nPlease run with another port, for example: .\scripts\rebuild-and-start-web.ps1 -Port 3001"
}

$env:PERF_PORT = [string]$Port
Write-Host "[3/3] Starting service on http://localhost:$Port"
Write-Host "If localhost is occupied by another process, try http://127.0.0.1:$Port"
Write-Host 'Press Ctrl+C to stop.'
node $entry
