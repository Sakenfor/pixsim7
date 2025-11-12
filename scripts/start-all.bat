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

REM Create data directories
echo Creating data directories...
if not exist data\postgres mkdir data\postgres
if not exist data\redis mkdir data\redis
if not exist data\storage mkdir data\storage
if not exist data\logs mkdir data\logs
if not exist data\cache mkdir data\cache
echo Data directories ready
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
