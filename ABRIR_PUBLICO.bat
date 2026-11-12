@echo off
cd /d "%~dp0"
title PORTAL RUSH - Enlace publico y red local
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\open-public.ps1"
pause
