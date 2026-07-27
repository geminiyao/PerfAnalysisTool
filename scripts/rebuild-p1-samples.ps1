# rebuild-p1-samples.ps1 — 重建 p1 对标样例 (unity / perfetto / simpleperf)
# 用法: .\scripts\rebuild-p1-samples.ps1 [-OutRoot output\p1-refresh]

param(
    [string]$OutRoot = "output\p1-refresh"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Out = Join-Path $Root $OutRoot
New-Item -ItemType Directory -Force -Path $Out | Out-Null

$MapleBase = Join-Path $Root "output\maple\base_PAL-AL00_20260612_154316"
$SymbolFix = Join-Path $Root "docs\simpleperf_symbol_fix"
$PfTrace = Join-Path $MapleBase "2026-06-12_15-43-be56b7.pftrace"
$PfMeta = Join-Path $MapleBase "meta.json"
# 优先使用 simpleperf_symbol_fix 里 profile.bat 新采的 perf_battle.data（栈 unwind 正常）
$PerfData = Join-Path $SymbolFix "perf_battle.data"
if (-not (Test-Path $PerfData)) {
    $PerfData = Join-Path $MapleBase "perf.data"
}
$BCache = Join-Path $Root "simpleperf\symbols\binary_cache"
$ParsedUnity = Join-Path $Root "output\p3-maple-base\unity\parsed-data.json"

Write-Host "[rebuild] out=$Out"

# Unity
$UnityOut = Join-Path $Out "unity"
New-Item -ItemType Directory -Force -Path $UnityOut | Out-Null
if (Test-Path $ParsedUnity) {
    Push-Location (Join-Path $Root ".claude\skills\unity-profiler-analysis\scripts")
    npx tsx build-profile.ts --input $ParsedUnity --out-dir $UnityOut --device PAL-AL00 --scene StressTestBattleSimpleMode
    Pop-Location
} else {
    Write-Warning "skip unity: $ParsedUnity not found"
}

# Perfetto
$PfOut = Join-Path $Out "perfetto"
New-Item -ItemType Directory -Force -Path $PfOut | Out-Null
if (Test-Path $PfTrace) {
    $args = @("scripts/build_perfetto_profile.py", "--trace", $PfTrace, "--out", $PfOut)
    if (Test-Path $PfMeta) { $args += @("--meta", $PfMeta) }
    python @args
} else {
    Write-Warning "skip perfetto: $PfTrace not found"
}

# Simpleperf
$SpOut = Join-Path $Out "simpleperf"
New-Item -ItemType Directory -Force -Path $SpOut | Out-Null
if (Test-Path $PerfData) {
    $args = @("simpleperf/build_simpleperf_profile.py", "--perf", $PerfData, "--out", $SpOut, "--label", "maple_base")
    if (Test-Path $BCache) { $args += @("--binary-cache", $BCache) }
    python @args
} else {
    Write-Warning "skip simpleperf: $PerfData not found"
}

# Merge cross
$Profiles = @()
if (Test-Path (Join-Path $UnityOut "unity-profile.json")) { $Profiles += (Join-Path $UnityOut "unity-profile.json") }
if (Test-Path (Join-Path $SpOut "simpleperf-profile.json")) { $Profiles += (Join-Path $SpOut "simpleperf-profile.json") }
if (Test-Path (Join-Path $PfOut "perfetto-profile.json")) { $Profiles += (Join-Path $PfOut "perfetto-profile.json") }

if ($Profiles.Count -ge 2) {
    Push-Location (Join-Path $Root "web")
    $mergeArgs = @("tsx", "server/scripts/merge-run.ts", "--out", (Join-Path $Out "cross-profile.json"))
    foreach ($p in $Profiles) { $mergeArgs += @("--profile", $p) }
    npx @mergeArgs
    Pop-Location
}

Write-Host "[rebuild] done -> $Out"
