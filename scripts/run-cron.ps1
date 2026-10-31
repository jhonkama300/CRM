param(
  [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
$envPath = Join-Path $PSScriptRoot "..\.env.local"
if (-not (Test-Path -LiteralPath $envPath)) {
  throw "No se encontró .env.local en $envPath"
}

$secretLine = Get-Content -LiteralPath $envPath |
  Where-Object { $_ -match '^AUTOMATION_CRON_SECRET=' } |
  Select-Object -First 1
if (-not $secretLine) {
  throw "AUTOMATION_CRON_SECRET no está configurado en .env.local"
}

$secret = $secretLine.Substring('AUTOMATION_CRON_SECRET='.Length).Trim()
if (-not $secret) {
  throw "AUTOMATION_CRON_SECRET está vacío"
}

$headers = @{ "x-cron-secret" = $secret }
$endpoints = @(
  "/api/automations/cron",
  "/api/flows/cron"
)

foreach ($endpoint in $endpoints) {
  $url = "$($BaseUrl.TrimEnd('/'))$endpoint"
  try {
    $result = Invoke-RestMethod -Method Get -Uri $url -Headers $headers -TimeoutSec 30
    Write-Output "$endpoint OK $($result | ConvertTo-Json -Compress)"
  } catch {
    Write-Output "$endpoint ERROR $($_.Exception.Message)"
  }
}
