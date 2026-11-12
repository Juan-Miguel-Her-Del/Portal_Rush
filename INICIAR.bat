@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PORTAL RUSH - Servidor multijugador
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 20 o superior desde https://nodejs.org y vuelve a abrir este archivo.
  pause
  exit /b 1
)
if not exist "node_modules\socket.io" (
  echo Instalando dependencias por primera vez...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo No se pudieron instalar. Revisa tu conexion a Internet.
    pause
    exit /b 1
  )
)
echo.
powershell -NoProfile -Command "try { $gameState = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 2; if ($gameState.app -eq 'portal-rush' -and $gameState.build -eq 'combat-2026-11-11') { exit 0 }; exit 1 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  echo El juego ya esta abierto en http://localhost:3000
  echo Puedes usar tambien ABRIR_PUBLICO.bat para mostrar el enlace de Internet.
  pause
  exit /b 0
)
echo Abre http://localhost:3000 en Chrome o Edge.
echo Para tus amigos, usa la direccion Wi-Fi que aparece abajo.
echo Si Windows pregunta, permite el acceso en redes privadas.
echo.
node server.js
pause
