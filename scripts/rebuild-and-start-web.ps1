param(
  [int]$Port = 3001,
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot 'web'

function Resolve-NodeExe {
  if ($env:NODE_EXE -and (Test-Path $env:NODE_EXE)) {
    return (Resolve-Path $env:NODE_EXE).Path
  }
  $candidates = @(
    'C:\Program Files\nodejs\node.exe',
    "${env:ProgramFiles}\nodejs\node.exe"
  )
  foreach ($p in $candidates) {
    if (Test-Path $p) { return (Resolve-Path $p).Path }
  }
  $fallback = (Get-Command node -ErrorAction SilentlyContinue).Source
  if ($fallback) {
    Write-Warning "未找到 Program Files\nodejs\node.exe，回退 PATH 中的 node: $fallback (若 better-sqlite3 报错请安装 Node 20 或设置 NODE_EXE)"
    return $fallback
  }
  throw '未找到 node.exe。请安装 Node.js 20 或设置环境变量 NODE_EXE 指向 node.exe'
}

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

$nodeExe = Resolve-NodeExe
$nodeDir = Split-Path -Parent $nodeExe
$nodeVersion = & $nodeExe --version
Write-Host "Using Node: $nodeExe ($nodeVersion)"
$sys32 = Join-Path $env:SystemRoot 'System32'
$wbem = Join-Path $sys32 'Wbem'
  if (Test-Path $sys32) { $env:Path = "$sys32;$env:Path" }
  if (Test-Path $wbem) { $env:Path = "$wbem;$env:Path" }
  $ps = Join-Path $sys32 'WindowsPowerShell\v1.0'
  if (Test-Path $ps) { $env:Path = "$ps;$env:Path" }
$env:Path = "$nodeDir;" + ($env:Path -split ';' | Where-Object { $_ -and $_ -notmatch 'cursor[\\/].*[\\/]helpers' }) -join ';'
$npmGlobal = Join-Path $env:APPDATA 'npm'
if ($npmGlobal -and (Test-Path $npmGlobal)) {
  $env:Path = "$npmGlobal;$env:Path"
  Write-Host "Added npm global to PATH: $npmGlobal"
}

Set-Location $webDir

if (-not $SkipInstall) {
  if (-not (Test-Path (Join-Path $webDir 'node_modules'))) {
    Write-Host '[1/4] Installing dependencies...'
    npm install
  } else {
    Write-Host '[1/4] Dependencies ready.'
  }
} else {
  Write-Host '[1/4] Skipping dependency install.'
}

Write-Host "[2/4] Stopping existing server on port $Port..."
Stop-PortProcess $Port

Write-Host '[3/4] Rebuilding web service...'
npm run build

if ($LASTEXITCODE -ne 0) {
  throw "Build failed with exit code $LASTEXITCODE"
}

$entry = Join-Path $webDir 'dist/server/server/index.js'
if (-not (Test-Path $entry)) {
  throw "Server entry not found after build: $entry"
}

$env:PERF_PORT = [string]$Port
$env:PERF_DATA_DIR = Join-Path $webDir 'data'
if (-not $env:PYTHON) {
  foreach ($candidate in @(
    'C:\Program Files\Python313\python.exe',
    'C:\Program Files\Python312\python.exe',
    'C:\Program Files\Python311\python.exe'
  )) {
    if (Test-Path $candidate) {
      $env:PYTHON = $candidate
      Write-Host "Using Python: $candidate"
      break
    }
  }
}
Write-Host "[4/4] Starting service on http://localhost:$Port/cpu/"
Write-Host "P3 compare: http://localhost:$Port/cpu/run-compare?base=run_base_cross&current=run_opt_cross"
Write-Host 'Press Ctrl+C to stop.'
& $nodeExe $entry
