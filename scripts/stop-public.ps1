param([switch]$StopServer)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $projectRoot '.runtime\public-session.json'
if (!(Test-Path -LiteralPath $stateFile)) { Write-Host 'No hay un enlace iniciado por este lanzador.'; exit 0 }
$state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
if ($state.root -ne $projectRoot) { throw 'La sesion no pertenece a este proyecto.' }
function Stop-OwnedProcess($processId, $path, $started) {
    if (!$processId -or !$started) { return }
    $candidate = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($candidate -and $candidate.Path -eq $path -and $candidate.StartTime.ToUniversalTime().ToString('o') -eq $started) { Stop-Process -Id $processId; Write-Host "Proceso del juego detenido: $processId" }
}
Stop-OwnedProcess $state.tunnelPid (Join-Path $projectRoot '.tools\cloudflared.exe') $state.tunnelStart
$state.tunnelPid = $null; $state.tunnelStart = $null; $state.url = $null
if ($StopServer) { Stop-OwnedProcess $state.serverPid (Get-Command node).Source $state.serverStart; $state.serverPid = $null; $state.serverStart = $null }
$state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8
Write-Host 'Enlace publico cerrado.'
