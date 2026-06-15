param(
  [int[]]$Ports = @(5173, 3001, 3000),
  [string]$Path = '/cpu/maple-compare'
)

$ErrorActionPreference = 'Stop'

function Test-HttpUrl([string]$Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -Method Head
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -Method Get
      return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
      return $false
    }
  }
}

foreach ($port in $Ports) {
  $url = "http://localhost:${port}${Path}"
  Write-Host "Checking $url ..."
  if (Test-HttpUrl $url) {
    Write-Host "Opening $url"
    Start-Process $url
    exit 0
  }
}

Write-Host 'No running localhost web service was found.'
Write-Host 'Start dev mode:'
Write-Host '  cd web; npm run dev'
Write-Host 'Or restart production server:'
Write-Host '  .\scripts\restart-web-server.ps1'
exit 1
