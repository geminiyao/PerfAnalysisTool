param(
  [int]$Port = 3001,
  [switch]$SkipBuild,
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot 'web'
$entry = Join-Path $webDir 'dist/server/server/index.js'

# better-sqlite3 原生模块按 Node 主版本编译 (当前 node_modules 为 v20 / MODULE 115)。
# Cursor 终端 PATH 里常有 v22，直接 `node` 会 ABI 报错；优先用系统 Node 20。
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

$nodeExe = Resolve-NodeExe
$nodeDir = Split-Path -Parent $nodeExe
$nodeVersion = & $nodeExe --version
Write-Host "Using Node: $nodeExe ($nodeVersion)"

# npm install / build 与运行时共用同一 Node (避免 Cursor 自带 v22 抢 PATH)
$env:Path = "$nodeDir;" + ($env:Path -split ';' | Where-Object { $_ -and $_ -notmatch 'cursor[\\/].*[\\/]helpers' }) -join ';'

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
if (-not $env:PYTHON) {
  $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCmd) {
    $env:PYTHON = $pythonCmd.Source
    Write-Host "Using Python: $($pythonCmd.Source)"
  }
}
$url = "http://localhost:$Port/cpu/maple-compare"

if (-not $NoOpen) {
  Start-Process $url
}

Write-Host "[4/4] Starting web server: $url"
Write-Host 'Press Ctrl+C to stop.'
& $nodeExe $entry
