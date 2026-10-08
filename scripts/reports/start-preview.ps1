$ErrorActionPreference = 'Stop'
$reportRoot = $PSScriptRoot
$reportUrl = 'http://127.0.0.1:18106'
function Get-ReportPreview {
    try { Invoke-RestMethod -Uri "$reportUrl/__report_preview_health" -TimeoutSec 1 } catch { $null }
}
$reportPreview = Get-ReportPreview
if ($reportPreview -and $reportPreview.root -ne $reportRoot) {
    throw 'Port 18106 is serving another report. Close that preview before starting this one.'
}
if (-not $reportPreview) {
    $reportNode = (Get-Command node -ErrorAction Stop).Source
    $reportServer = Join-Path $reportRoot 'preview-server.cjs'
    Start-Process -FilePath $reportNode -ArgumentList ('"' + $reportServer + '"') -WindowStyle Hidden
    for ($reportAttempt = 0; $reportAttempt -lt 30; $reportAttempt++) {
        Start-Sleep -Milliseconds 200
        $reportPreview = Get-ReportPreview
        if ($reportPreview) { break }
    }
}
if (-not $reportPreview -or $reportPreview.root -ne $reportRoot) {
    throw 'Local preview failed to start. Check that Node.js is installed and port 18106 is available.'
}
Start-Process "$reportUrl/report.html"
