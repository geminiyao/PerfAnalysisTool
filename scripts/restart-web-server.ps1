param(
  [int]$Port = 3000,
  [switch]$SkipBuild,
  [switch]$NoOpen,
  [switch]$Prod,
  [string]$OpenPage = '/cpu/simpleperf-diff'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot 'web'
$prodEntry = Join-Path $webDir 'dist/server/server/index.js'

# better-sqlite3 原生模块按 Node 主版本编译。Cursor 终端 PATH 里常有 v22，直接 `node` 会 ABI 报错。
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
$npmCmd = Join-Path $nodeDir 'npm.cmd'
$npxCmd = Join-Path $nodeDir 'npx.cmd'
$nodeVersion = & $nodeExe --version
Write-Host "Using Node: $nodeExe ($nodeVersion)"

# npm / npx 与运行时共用同一 Node (避免 Cursor 自带 v22 抢 PATH)
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
  Start-Sleep -Milliseconds 500
}

function Stop-WebDevProcesses([string]$WebRoot) {
  $escaped = [Regex]::Escape($WebRoot)
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and (
        $_.CommandLine -match $escaped -or
        $_.CommandLine -match 'tsx\\dist\\cli\.mjs"\s+watch\s+server/index\.ts' -or
        $_.CommandLine -match 'tsx\s+server/index\.ts'
      )
    }

  foreach ($proc in $procs) {
    Write-Host "Stopping web dev process: node($($proc.ProcessId))"
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
  }

  if ($procs) {
    Start-Sleep -Seconds 2
  }
}

function Ensure-BetterSqlite3 {
  Write-Host 'Rebuilding better-sqlite3 for current Node...'
  $buildDir = Join-Path $webDir 'node_modules\better-sqlite3\build'
  if (Test-Path $buildDir) {
    try {
      Remove-Item $buildDir -Recurse -Force -ErrorAction Stop
    } catch {
      Write-Warning "Cannot remove $buildDir (stop tsx/npm processes using web dir first)"
    }
  }

  $maxAttempts = 3
  for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    & $npmCmd rebuild better-sqlite3
    if ($LASTEXITCODE -eq 0) { return }

    if ($attempt -lt $maxAttempts) {
      Write-Warning "better-sqlite3 rebuild failed (attempt $attempt/$maxAttempts), retrying in 2s..."
      Stop-WebDevProcesses $webDir
      Start-Sleep -Seconds 2
    }
  }

  throw "better-sqlite3 rebuild failed with exit code $LASTEXITCODE. Stop node/tsx processes and retry."
}

function Build-Client {
  Write-Host 'Building frontend (vite only)...'
  & $npxCmd vite build
  if ($LASTEXITCODE -ne 0) {
    throw "Vite build failed with exit code $LASTEXITCODE"
  }
}

function Build-Prod {
  Write-Host 'Building production bundle (vite + tsc)...'
  & $npmCmd run build
  if ($LASTEXITCODE -ne 0) {
    throw "Production build failed with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Path $webDir)) {
  throw "Web directory not found: $webDir"
}

Set-Location $webDir

if (-not (Test-Path (Join-Path $webDir 'node_modules'))) {
  Write-Host '[1/5] Installing dependencies...'
  & $npmCmd install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
} else {
  Write-Host '[1/5] Dependencies ready.'
}

Write-Host "[2/5] Stopping existing server on port $Port..."
Stop-PortProcess $Port
Stop-PortProcess 3001
Stop-PortProcess 5173
Stop-WebDevProcesses $webDir

Write-Host '[3/5] Ensuring native modules match Node version...'
Ensure-BetterSqlite3

if (-not $SkipBuild) {
  if ($Prod) {
    Write-Host '[4/5] Production build...'
    Build-Prod
  } else {
    Write-Host '[4/5] Dev build (client only; server runs via tsx)...'
    Build-Client
  }
} else {
  Write-Host '[4/5] Skipping build.'
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

$url = "http://localhost:$Port$OpenPage"

if (-not $NoOpen) {
  Start-Process $url
}

if ($Prod) {
  if (-not (Test-Path $prodEntry)) {
    throw "Server entry not found: $prodEntry. Run without -SkipBuild or drop -Prod to use tsx dev mode."
  }
  Write-Host "[5/5] Starting production server: http://localhost:$Port/cpu/"
  Write-Host 'Press Ctrl+C to stop.'
  & $nodeExe $prodEntry
} else {
  Write-Host "[5/5] Starting dev server (tsx, no watch): http://localhost:$Port/cpu/"
  Write-Host "Opened: $url"
  Write-Host 'Press Ctrl+C to stop. (Do not use tsx watch for long ingest jobs.)'
  & $npxCmd tsx server/index.ts
}
