@echo off
REM Stop all PixSim7 services

echo.
echo ========================================
echo   Stopping PixSim7
echo ========================================
echo.

cd /d %~dp0

echo Stopping backend...
taskkill /F /FI "WINDOWTITLE eq PixSim7 Backend*" 2>nul
taskkill /F /FI "WINDOWTITLE eq PixSim7 Worker*" 2>nul

echo Stopping databases...
docker-compose -f docker-compose.db-only.yml down

echo.
echo All services stopped!
echo.
pause
