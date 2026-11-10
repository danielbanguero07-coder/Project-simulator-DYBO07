@echo off
chcp 65001 >nul
title Simulador A320 - Iniciando servidores...

echo ==========================================
echo   SIMULADOR DE PILOTO COMERCIAL 3D
echo   Iniciando Backend (puerto 3000) + Frontend (puerto 5173)
echo ==========================================
echo.

:: Verificar que estamos en el directorio correcto
if not exist "backend\package.json" (
    echo ERROR: No se encuentra backend\package.json
    echo Ejecuta este archivo desde la raiz del proyecto
    pause
    exit /b 1
)

if not exist "apps\frontend\package.json" (
    echo ERROR: No se encuentra apps\frontend\package.json
    echo Ejecuta este archivo desde la raiz del proyecto
    pause
    exit /b 1
)

echo [1/2] Iniciando Backend NestJS en http://localhost:3000 ...
start "Backend NestJS" cmd /c "cd /d "%~dp0backend" && npm.cmd run start:dev"

echo Esperando 3 segundos para que el backend inicie...
timeout /t 3 /nobreak >nul

echo [2/2] Iniciando Frontend Vite en http://localhost:5173 ...
start "Frontend Vite" cmd /c "cd /d "%~dp0apps\frontend" && npx.cmd vite --host --port 5173"

echo.
echo ==========================================
echo   SERVIDORES INICIADOS
echo ==========================================
echo.
echo Backend:  http://localhost:3000
echo Frontend: http://localhost:5173
echo.
echo Credenciales:
echo   Email:    admin@simulator.com
echo   Password: admin123
echo.
echo Para detener: Cierra las dos ventanas de consola que se abrieron
echo ==========================================
echo.
echo Presiona una tecla para verificar el estado de los servidores...
pause >nul

echo.
echo Verificando servidores...
echo.

:: Verificar backend
echo Probando Backend...
powershell -command "try { $r = Invoke-RestMethod -Uri 'http://localhost:3000/health' -Method Get -TimeoutSec 3; if ($r.success) { Write-Host 'Backend: ONLINE (localhost:3000)' -ForegroundColor Green } else { Write-Host 'Backend: ERROR' -ForegroundColor Red } } catch { Write-Host 'Backend: FUERA DE LINEA' -ForegroundColor Yellow }"

:: Verificar frontend
echo Probando Frontend...
powershell -command "try { $r = Invoke-WebRequest -Uri 'http://localhost:5173' -Method Get -TimeoutSec 3; if ($r.StatusCode -eq 200) { Write-Host 'Frontend: ONLINE (localhost:5173)' -ForegroundColor Green } else { Write-Host 'Frontend: ERROR' -ForegroundColor Red } } catch { Write-Host 'Frontend: FUERA DE LINEA' -ForegroundColor Yellow }"

echo.
echo ==========================================
echo   LISTO PARA USAR
echo ==========================================
echo.
echo Abre tu navegador y visita:
echo   http://localhost:5173
echo.
pause