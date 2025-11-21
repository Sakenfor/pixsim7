@echo off
REM Start PixSim7 in development mode - Windows version
REM Docker for databases only, manual backend/worker

echo.
echo Starting PixSim7 Development Environment
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

REM Start databases with Docker
echo Starting PostgreSQL and Redis...
docker-compose -f docker-compose.db-only.yml up -d

REM Wait for databases
echo Waiting for databases...
timeout /t 3 /nobreak >nul

REM Check status
echo.
echo Checking database health...
docker-compose -f docker-compose.db-only.yml ps

REM Check if database exists
echo.
echo Checking database...
docker-compose -f docker-compose.db-only.yml exec -T postgres psql -U pixsim -lqt | findstr /C:"pixsim7" >nul
if errorlevel 1 (
    echo Database 'pixsim7' does not exist
    echo Creating database...
    docker-compose -f docker-compose.db-only.yml exec -T postgres psql -U pixsim -c "CREATE DATABASE pixsim7;"
    echo Database created
) else (
    echo Database 'pixsim7' exists
)

echo.
echo ========================================
echo Databases ready!
echo ========================================
echo.
echo Next steps:
echo   1. Start backend:  set PYTHONPATH=G:\code\pixsim7 ^&^& python -m pixsim7.backend.main.main
echo   2. Start worker:   set PYTHONPATH=G:\code\pixsim7 ^&^& arq pixsim7.backend.main.workers.arq_worker.WorkerSettings
echo   3. Start admin:    cd admin ^&^& npm run dev
echo.
echo Or open separate terminals for each
echo.
echo Database services:
echo   PostgreSQL: localhost:5434
echo   Redis:      localhost:6380
echo.
echo Stop databases:
echo   docker-compose -f docker-compose.db-only.yml down
echo.
