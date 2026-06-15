param(
  [int]$Port = 3001,
  [switch]$SkipBuild,
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot 'web'
$entry = Join-Path $webDir 'dist/server/server/index.js'

function Stop-PortProcess([int]$LocalPort) {
  $listeners = Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue
  if (-not $listeners) { return }

  $pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pidValue in $pids) {
    $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($proc) {
      Write-Host "Stopping process on port ${LocalPort}: $($proc.ProcessName)($pidValue)"
      Stop-Process -Id $pidValue -Force
    }
  }
}

if (-not (Test-Path $webDir)) {
  throw "Web directory not found: $webDir"
}

Set-Location $webDir

if (-not (Test-Path (Join-Path $webDir 'node_modules'))) {
  Write-Host '[1/4] Installing dependencies...'
  npm install
} else {
  Write-Host '[1/4] Dependencies ready.'
}

Write-Host "[2/4] Stopping existing server on port $Port..."
Stop-PortProcess $Port

if (-not $SkipBuild) {
  Write-Host '[3/4] Building web app...'
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed with exit code $LASTEXITCODE"
  }
} else {
  Write-Host '[3/4] Skipping build.'
}

if (-not (Test-Path $entry)) {
  throw "Server entry not found: $entry. Run without -SkipBuild first."
}

$env:PERF_PORT = [string]$Port
$url = "http://localhost:$Port/cpu/maple-compare"

if (-not $NoOpen) {
  Start-Process $url
}

Write-Host "[4/4] Starting web server: $url"
Write-Host 'Press Ctrl+C to stop.'
node $entry
