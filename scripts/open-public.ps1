param([int]$Port = 3000)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $projectRoot '.runtime'
$stateFile = Join-Path $runDir 'public-session.json'
$binary = Join-Path $projectRoot '.tools\cloudflared.exe'
if (!(Test-Path -LiteralPath $binary)) { & (Join-Path $PSScriptRoot 'setup-tunnel.ps1') }
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
$state = @{ root=$projectRoot; port=$Port; serverPid=$null; serverStart=$null; tunnelPid=$null; tunnelStart=$null; url=$null }
if (Test-Path -LiteralPath $stateFile) {
    $previous = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    if ($previous.root -eq $projectRoot -and $previous.port -eq $Port) { foreach ($key in @('serverPid','serverStart','tunnelPid','tunnelStart','url')) { $state[$key] = $previous.$key } }
}
function Save-Session { $state | ConvertTo-Json | Set-Content -LiteralPath $stateFile -Encoding UTF8 }
function Find-OwnedProcess($processId, $path, $started) {
    if (!$processId -or !$started) { return $null }
    $candidate = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($candidate -and $candidate.Path -eq $path -and $candidate.StartTime.ToUniversalTime().ToString('o') -eq $started) { return $candidate }
    return $null
}
$origin = "http://127.0.0.1:$Port"
$health = $null
try { $health = Invoke-RestMethod -Uri "$origin/api/health" -TimeoutSec 2 } catch {}
if ($health -and ($health.app -ne 'portal-rush' -or $health.build -ne 'combat-2026-11-11')) { throw "El puerto $Port usa otra version o aplicacion. Cierra la ventana anterior del juego e intenta de nuevo." }
if (!$health) {
    $node = (Get-Command node -ErrorAction Stop).Source
    $env:PORT = [string]$Port
    $server = Start-Process -FilePath $node -ArgumentList 'server.js' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runDir 'server.log') -RedirectStandardError (Join-Path $runDir 'server-error.log') -PassThru
    $state.serverPid = $server.Id; $state.serverStart = $server.StartTime.ToUniversalTime().ToString('o'); Save-Session
    for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Milliseconds 300; try { $health = Invoke-RestMethod -Uri "$origin/api/health" -TimeoutSec 2 } catch {}; if ($health.app -eq 'portal-rush') { break } }
    if ($health.app -ne 'portal-rush') { throw 'El servidor no pudo arrancar. Revisa .runtime/server-error.log.' }
}
function Test-PublicGame($url) {
    if (!$url -or $url -notmatch '^https://[a-z0-9-]+\.trycloudflare\.com$') { return $false }
    try {
        $response = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 4
        return $response.ok -and $response.app -eq 'portal-rush' -and $response.build -eq 'combat-2026-11-11'
    } catch { return $false }
}
function Clear-Tunnel {
    $owned = Find-OwnedProcess $state.tunnelPid $binary $state.tunnelStart
    if ($owned) { Stop-Process -Id $owned.Id -ErrorAction SilentlyContinue; $owned.WaitForExit(3000) | Out-Null }
    $state.tunnelPid = $null; $state.tunnelStart = $null; $state.url = $null; Save-Session
}
$tunnel = Find-OwnedProcess $state.tunnelPid $binary $state.tunnelStart
$ready = $false
if ($tunnel -and $state.url) {
    Write-Host 'Comprobando el enlace anterior...'
    for ($probe = 0; $probe -lt 3 -and !$ready; $probe++) { $ready = Test-PublicGame $state.url }
}
if (!$ready) {
    # Un proceso vivo no garantiza que Cloudflare conserve su tunel temporal.
    if ($tunnel) { Write-Host 'El enlace anterior no responde. Generando uno nuevo...' -ForegroundColor Yellow }
    Clear-Tunnel
    for ($attempt = 1; $attempt -le 2 -and !$ready; $attempt++) {
        $tunnelLog = Join-Path $runDir 'tunnel.log'
        Set-Content -LiteralPath $tunnelLog -Value '' -Encoding ASCII
        $arguments = @('tunnel','--no-autoupdate','--url',$origin,'--protocol','http2','--logfile',('"{0}"' -f $tunnelLog))
        $tunnel = Start-Process -FilePath $binary -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runDir 'tunnel-output.log') -RedirectStandardError (Join-Path $runDir 'tunnel-error.log') -PassThru
        $state.tunnelPid = $tunnel.Id; $state.tunnelStart = $tunnel.StartTime.ToUniversalTime().ToString('o'); Save-Session
        Write-Host "Conectando con Cloudflare y comprobando HTTPS (intento $attempt de 2)..."
        $deadline = [DateTime]::UtcNow.AddSeconds(50)
        $nextProbe = [DateTime]::UtcNow
        while ([DateTime]::UtcNow -lt $deadline) {
            $tunnel.Refresh()
            if ($tunnel.HasExited) { break }
            $log = [string](Get-Content -LiteralPath $tunnelLog -Raw -ErrorAction SilentlyContinue) + [string](Get-Content -LiteralPath (Join-Path $runDir 'tunnel-error.log') -Raw -ErrorAction SilentlyContinue)
            if ($log -match 'Unauthorized: Tunnel not found') { break }
            if (!$state.url -and $log -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $state.url = $Matches[0] }
            if ($state.url -and [DateTime]::UtcNow -ge $nextProbe) {
                $ready = Test-PublicGame $state.url
                if ($ready) { Save-Session; break }
                $nextProbe = [DateTime]::UtcNow.AddSeconds(1)
            }
            Start-Sleep -Milliseconds 400
        }
        if (!$ready) {
            if (Test-Path -LiteralPath $tunnelLog) { Copy-Item -LiteralPath $tunnelLog -Destination (Join-Path $runDir 'tunnel-last-error.log') -Force }
            Clear-Tunnel
            if ($attempt -lt 2) { Write-Host 'El enlace no estuvo disponible. Renovando el tunel...' -ForegroundColor Yellow }
        }
    }
}
if (!$ready) { throw "No se pudo verificar el acceso por Internet. El juego local sigue en $origin. Revisa .runtime/tunnel-last-error.log y la conexion a Internet." }
Write-Host ''
Write-Host 'PORTAL RUSH - LOCAL Y PUBLICO' -ForegroundColor Green
Write-Host "Este computador: $origin"
Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway } | ForEach-Object { foreach ($address in $_.IPv4Address) { if ($address.IPAddress -ne '127.0.0.1' -and $address.IPAddress -notlike '169.254*') { Write-Host "Misma red: http://$($address.IPAddress):$Port" } } }
Write-Host 'HTTPS verificado: el enlace responde con esta version del juego.' -ForegroundColor Green
Write-Host "ENLACE PARA COMPARTIR: $($state.url)" -ForegroundColor Cyan
Write-Host 'Comparte tambien el codigo de sala que aparece dentro del juego.'
Write-Host 'El enlace funciona mientras este computador y su Internet sigan activos.'
Write-Host 'CERRAR_ENLACE.bat cierra el acceso publico. CERRAR_JUEGO.bat detiene lo iniciado aqui.'
