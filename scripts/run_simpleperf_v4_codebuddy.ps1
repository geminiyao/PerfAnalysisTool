#Requires -Version 5.1

<#

.SYNOPSIS

  simpleperf v4 hybrid: Provider skeleton (95%) + optional CodeBuddy narrative (5%)



.EXAMPLE

  .\scripts\run_simpleperf_v4_codebuddy.ps1 -ProviderOnly



.EXAMPLE

  .\scripts\run_simpleperf_v4_codebuddy.ps1 -EnrichWithAI

#>

param(

    [string]$Base = "D:\Android\android-ndk-r21e-windows-x86_64\simpleperf\perf_aoeyz_base.data",

    [string]$Cur = "D:\Android\android-ndk-r21e-windows-x86_64\simpleperf\perf_aoeyz_stressmove.data",

    [string]$BinaryCache = "D:\Android\android-ndk-r21e-windows-x86_64\simpleperf\binary_cache",

    [string]$OutDir = "docs\report\_intermediate\aoeyz_diff",

    [string]$SceneBase = "野外空场景",

    [string]$SceneCur = "stressmove 行军线压测（约 300 队）",

    [string]$CodebuddyPath = $env:CODEBUDDY_PATH,

    [switch]$SkipProvider,

    [switch]$ProviderOnly,

    [switch]$EnrichWithAI,

    [switch]$SkipValidate,

    [switch]$SkipEnrich

)



$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Set-Location $Root



# 正式交付默认：Provider + AI 润色（可用 -ProviderOnly 跳过 AI）
if (-not $ProviderOnly -and -not $SkipEnrich -and -not $PSBoundParameters.ContainsKey('EnrichWithAI')) {

    $EnrichWithAI = $true

}



function Resolve-CodebuddyCli {

    param([string]$Configured)

    if ($Configured -and (Test-Path -LiteralPath $Configured)) {

        return (Resolve-Path -LiteralPath $Configured).Path

    }

    $npm = Join-Path $env:APPDATA "npm\codebuddy.cmd"

    if (Test-Path -LiteralPath $npm) { return (Resolve-Path -LiteralPath $npm).Path }

    $cmd = Get-Command codebuddy -ErrorAction SilentlyContinue

    if ($cmd -and $cmd.Source) { return $cmd.Source }

    throw "CodeBuddy CLI not found."

}



function Build-EnrichPrompt {

    param([string]$SkillDir, [string]$AbsOut, [string]$ProviderReport, [string]$AiReport)

    return @(

        "Unity Android CPU analyst. HYBRID mode: enrich existing Provider v4 report only."

        ""

        "[SKILL] $SkillDir/SKILL.md"

        "[KNOWLEDGE] docs/aoe-cpu-analysis-knowledge.md"

        ""

        "## Input (READ FIRST, do not regenerate tables)"

        "- Provider skeleton: $ProviderReport"

        "- Summary JSON (numbers authority): $AbsOut/simpleperf-diff-summary.json"

        ""

        "## Task"

        "1. Read Provider skeleton completely."

        "2. Keep ALL tables, mermaid charts, call trees, section headers UNCHANGED."

        "3. ONLY enrich narrative:"

        "   - §0: polish conclusion bullets (no new numbers)"

        "   - §4.3-4.6: add business meaning from knowledge base (Wwise/MeshUI/army/ECS)"

        "   - §3.3: one sentence transitions if needed"

        "4. Write to: $AiReport"

        "5. Copy to: $AbsOut/performance-report.md"

        "6. Do NOT invent §4.1 probe table or duplicate Top-N tables."

    ) -join [Environment]::NewLine

}



Write-Host "[simpleperf v4 hybrid] root: $Root"

$AbsOut = Join-Path $Root $OutDir



if (-not $SkipProvider) {

    if (Test-Path (Join-Path $AbsOut "diff\simpleperf-diff.json")) {

        Write-Host "[1/4] rerender from existing diff JSON"

        & python scripts/rerender_v4_report.py $OutDir

    } else {

        Write-Host "[1/4] full Provider parse"

        & python simpleperf/build_simpleperf_profile.py `

            --base $Base --perf $Cur --binary-cache $BinaryCache `

            --out $OutDir --scene-base $SceneBase --scene-cur $SceneCur --device "MateXs2 (PAL-AL00, aarch64)"

    }

    if ($LASTEXITCODE -ne 0) { throw "Provider failed" }

} else {

    Write-Host "[1/4] skip Provider"

    & python scripts/rerender_v4_report.py $OutDir

}



Write-Host "[2/4] summary JSON"

& python scripts/build_simpleperf_diff_summary.py $OutDir



$reportDir = Join-Path $AbsOut "report"

$providerReport = Join-Path $reportDir "performance-report_simpleperf_v4.md"

$aiReport = Join-Path $reportDir "performance-report_simpleperf_AI_v4.md"

Copy-Item -LiteralPath $providerReport -Destination (Join-Path $reportDir "provider-report_simpleperf_v4.md") -Force



if (-not $SkipValidate) {

    Write-Host "[3/5] validate + quality compare (Provider)"

    & python scripts/validate_v4_report.py $OutDir

    if ($LASTEXITCODE -ne 0) { throw "Provider validate failed" }

    & python scripts/compare_v4_report_quality.py $providerReport

    if ($LASTEXITCODE -ne 0) { throw "Provider quality compare failed" }

} else {

    Write-Host "[3/5] skip validate"

}



$deliverable = $providerReport

$usedAi = $false

$enrichedReport = Join-Path $reportDir "performance-report_simpleperf_AI_v4.md"

Write-Host "[4/5] enrich_v4_report (narrative)"

& python scripts/enrich_v4_report.py $OutDir

if ($LASTEXITCODE -ne 0) { throw "enrich failed" }

& python scripts/validate_v4_report.py $OutDir

if ($LASTEXITCODE -ne 0) { throw "enriched validate failed" }

& python scripts/compare_v4_report_quality.py $enrichedReport --min-length-ratio=0.92

if ($LASTEXITCODE -eq 0) {

    $deliverable = $enrichedReport

    $usedAi = $true

    Write-Host "enriched PASS (>=0.92x gold)"

} else {

    & python scripts/compare_v4_report_quality.py $enrichedReport --min-length-ratio=0.82

    if ($LASTEXITCODE -eq 0) {

        $deliverable = $enrichedReport

        $usedAi = $true

        Write-Host "enriched PASS (>=0.82x gold)"

    } else {

        Write-Warning "enriched quality gate failed — fallback Provider"

    }

}



if ($ProviderOnly -or $SkipEnrich) {

    Write-Host "[4b/5] skip CLI boost (ProviderOnly)"

} elseif (-not $EnrichWithAI) {

    Write-Host "[4b/5] skip CLI boost"

} else {

    $skillDir = Join-Path $Root ".claude\skills\simpleperf-diff-analysis"

    $cli = Resolve-CodebuddyCli -Configured $CodebuddyPath

    $prompt = Build-EnrichPrompt -SkillDir ($skillDir.Replace('\', '/')) `

        -AbsOut ($AbsOut.Replace('\', '/')) `

        -ProviderReport ($providerReport.Replace('\', '/')) `

        -AiReport ($aiReport.Replace('\', '/'))



    Write-Host "[4b/5] CodeBuddy CLI boost -> $aiReport"

    $logPath = Join-Path $AbsOut "codebuddy-stdout.log"

    $comspec = $env:COMSPEC

    if (-not $comspec) { $comspec = Join-Path $env:SystemRoot "System32\cmd.exe" }

    $cliArgs = @('-p', $prompt, '--output-format', 'stream-json', '-y', '--dangerously-skip-permissions', '--allowedTools', 'Read,Write,Glob,Grep')

    & $comspec /d /s /c $cli @cliArgs *>&1 | Tee-Object -FilePath $logPath

    if ($LASTEXITCODE -ne 0) {

        Write-Warning "CodeBuddy exit $LASTEXITCODE — keep enriched report"

    } elseif (-not (Test-Path $aiReport)) {

        & python scripts/extract_codebuddy_report.py $logPath $aiReport

    }

    if (Test-Path $aiReport) {

        & python scripts/compare_v4_report_quality.py $aiReport --min-length-ratio=0.95

        if ($LASTEXITCODE -eq 0) {

            $deliverable = $aiReport

            $usedAi = $true

            Write-Host "CLI enrich PASS (>=0.95x)"

        } else {

            $cliLines = (Get-Content $aiReport | Measure-Object -Line).Lines

            $enrLines = (Get-Content $enrichedReport | Measure-Object -Line).Lines

            if ($cliLines -gt $enrLines) {

                & python scripts/compare_v4_report_quality.py $aiReport --min-length-ratio=0.82

                if ($LASTEXITCODE -eq 0) {

                    $deliverable = $aiReport

                    $usedAi = $true

                    Write-Host "CLI enrich thicker — using CLI"

                }

            }

        }

    }

}



Copy-Item -LiteralPath $deliverable -Destination (Join-Path $AbsOut "performance-report.md") -Force

Write-Host "[5/5] deliverable: $deliverable (ai=$usedAi)"

Write-Host "done."

exit 0

