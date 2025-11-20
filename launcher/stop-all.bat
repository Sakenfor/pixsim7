@echo off
REM Stop all PixSim7 services

echo.
echo ========================================
echo   Stopping PixSim7
echo ========================================
echo.

cd /d %~dp0..

REM Load backend port from .env if present; default to 8001
set BACKEND_PORT=8001
if exist .env (
	for /f "tokens=1,2 delims==" %%G in ('findstr /r /c:"^[A-Za-z0-9_]*=" .env') do (
		if /I "%%G"=="BACKEND_PORT" set BACKEND_PORT=%%H
	)
)

echo Stopping backend...
taskkill /F /FI "WINDOWTITLE eq PixSim7 Backend*" 2>nul
taskkill /F /FI "WINDOWTITLE eq PixSim7 Worker*" 2>nul

REM Fallback: kill any process listening on backend port
set "_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":"%BACKEND_PORT%" ^| findstr LISTENING') do set "_PID=%%P"
if defined _PID (
	echo Found backend PID %_PID% on port %BACKEND_PORT%, killing...
	taskkill /PID %_PID% /T /F 2>nul
)

echo Stopping databases...
docker-compose -f docker-compose.db-only.yml down

echo.
echo All services stopped!
echo.
pause
