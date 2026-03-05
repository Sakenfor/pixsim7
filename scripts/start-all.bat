@echo off
REM Start PixSim7 - All services (databases + backend + worker) - Windows version
REM Uses full docker-compose.yml

echo.
echo Starting PixSim7 (Full Docker)
echo.

REM Change to project root
cd /d %~dp0\..

REM Check if .env exists
if not exist .env (
    echo Creating .env from .env.example...
    copy .env.example .env
    echo .env created - please review settings
    echo.
)

REM Create database data directories
echo Creating data directories...
if not exist data\postgres mkdir data\postgres
if not exist data\redis mkdir data\redis
if not exist data\timescaledb mkdir data\timescaledb

REM Resolve PIXSIM_HOME runtime root
if defined PIXSIM_HOME (
    set "PIXSIM_HOME_DIR=%PIXSIM_HOME%"
) else if defined LOCALAPPDATA (
    set "PIXSIM_HOME_DIR=%LOCALAPPDATA%\PixSim7"
) else (
    set "PIXSIM_HOME_DIR=%USERPROFILE%\PixSim7"
)

if not exist "%PIXSIM_HOME_DIR%\media" mkdir "%PIXSIM_HOME_DIR%\media"
if not exist "%PIXSIM_HOME_DIR%\logs" mkdir "%PIXSIM_HOME_DIR%\logs"
if not exist "%PIXSIM_HOME_DIR%\exports" mkdir "%PIXSIM_HOME_DIR%\exports"
if not exist "%PIXSIM_HOME_DIR%\cache" mkdir "%PIXSIM_HOME_DIR%\cache"
if not exist "%PIXSIM_HOME_DIR%\temp" mkdir "%PIXSIM_HOME_DIR%\temp"
if not exist "%PIXSIM_HOME_DIR%\settings" mkdir "%PIXSIM_HOME_DIR%\settings"
if not exist "%PIXSIM_HOME_DIR%\models" mkdir "%PIXSIM_HOME_DIR%\models"
if not exist "%PIXSIM_HOME_DIR%\automation\screenshots" mkdir "%PIXSIM_HOME_DIR%\automation\screenshots"

echo Data directories ready
echo Runtime data root: %PIXSIM_HOME_DIR%
echo.

REM Start all services
echo Starting all services with Docker Compose...
docker-compose up -d

REM Wait for services
echo Waiting for services to start...
timeout /t 5 /nobreak >nul

REM Check status
echo.
echo Service Status:
docker-compose ps

echo.
echo ========================================
echo All services running!
echo ========================================
echo.
echo Access points:
echo   API:          http://localhost:8001/docs
echo   Admin Panel:  http://localhost:8002
echo   Logs:         http://localhost:8002/logs
echo.
echo Via ZeroTier:
echo   API:          http://10.243.48.125:8001/docs
echo   Admin Panel:  http://10.243.48.125:8002
echo.
echo View logs:
echo   docker-compose logs -f backend
echo   docker-compose logs -f worker
echo.
echo Stop all:
echo   docker-compose down
echo.
