$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $projectRoot '.tools'
$binary = Join-Path $toolsDir 'cloudflared.exe'
$metadata = Join-Path $toolsDir 'cloudflared-release.json'
New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null
if ((Test-Path -LiteralPath $binary) -and (Test-Path -LiteralPath $metadata)) {
    $saved = Get-Content -LiteralPath $metadata -Raw | ConvertFrom-Json
    if ((Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLowerInvariant() -eq $saved.sha256) { Write-Host "Cloudflare Tunnel verificado ($($saved.version))."; exit 0 }
}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$release = Invoke-RestMethod -Uri 'https://api.github.com/repos/cloudflare/cloudflared/releases/latest' -TimeoutSec 40
$asset = $release.assets | Where-Object { $_.name -eq 'cloudflared-windows-amd64.exe' } | Select-Object -First 1
if (!$asset -or $asset.digest -notmatch '^sha256:[a-f0-9]{64}$' -or !$asset.browser_download_url.StartsWith('https://github.com/cloudflare/cloudflared/releases/download/')) { throw 'No se pudo verificar el archivo oficial de Cloudflare Tunnel.' }
$temporaryBinary = Join-Path $toolsDir 'cloudflared-download.exe'
Write-Host "Descargando Cloudflare Tunnel $($release.tag_name) desde el repositorio oficial..."
Invoke-WebRequest -UseBasicParsing -Uri $asset.browser_download_url -OutFile $temporaryBinary -TimeoutSec 180
$expected = $asset.digest.Substring(7).ToLowerInvariant()
if ((Get-FileHash -LiteralPath $temporaryBinary -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'La comprobacion SHA256 fallo. No se ejecutara el archivo.' }
Move-Item -LiteralPath $temporaryBinary -Destination $binary -Force
@{ version=$release.tag_name; sha256=$expected; source=$asset.browser_download_url } | ConvertTo-Json | Set-Content -LiteralPath $metadata -Encoding UTF8
Write-Host 'Cloudflare Tunnel descargado y verificado con SHA256.'
