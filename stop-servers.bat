@echo off
chcp 65001 >nul
title Detener Servidores del Simulador

echo ==========================================
echo   DETENIENDO SERVIDORES
echo ==========================================
echo.

echo Cerrando procesos de node y vite...
powershell -command "Get-Process -Name 'node' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"

echo Servidores detenidos correctamente.
echo ==========================================
pause