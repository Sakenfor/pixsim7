@echo off
REM dev-up.bat - Start PixSim7 in local development mode (Windows)
REM Starts: databases (Docker) + backend + worker + frontend (all local with hot-reload)

setlocal enabledelayedexpansion

echo.
echo Starting PixSim7 Development Environment
echo.

REM Change to project root
cd /d %~dp0\..
set PROJECT_ROOT=%CD%

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
if not exist data\logs\dev mkdir data\logs\dev
if not exist data\cache mkdir data\cache
echo Data directories ready
echo.

REM Check dependencies
echo Checking dependencies...
where docker-compose >nul 2>&1
if errorlevel 1 (
    echo Error: docker-compose not found. Please install Docker and docker-compose.
    exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
    echo Error: python not found. Please install Python 3.11+
    exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
    echo Warning: pnpm not found. Frontend will not start. Install with: npm install -g pnpm
    set SKIP_FRONTEND=true
) else (
    set SKIP_FRONTEND=false
)
echo Dependencies checked
echo.

REM Start databases with Docker
echo Starting databases (PostgreSQL + Redis)...
docker-compose -f docker-compose.db-only.yml up -d

REM Wait for databases
echo Waiting for databases to initialize...
timeout /t 3 /nobreak >nul

REM Check if database exists
echo Checking database...
docker-compose -f docker-compose.db-only.yml exec -T postgres psql -U pixsim -lqt 2>nul | findstr /C:"pixsim7" >nul
if errorlevel 1 (
    echo Creating database 'pixsim7'...
    docker-compose -f docker-compose.db-only.yml exec -T postgres psql -U pixsim -c "CREATE DATABASE pixsim7;" 2>nul
)
echo Database ready
echo.

echo ==========================================
echo Starting Development Services
echo ==========================================
echo.
echo This will start 3-4 processes in separate windows:
echo   1. Backend API (with hot-reload)
echo   2. Background Worker
echo   3. Main Frontend (admin panel)
echo   4. Game Frontend (optional)
echo.
echo All output will be logged to: data\logs\dev\
echo.

REM Set PYTHONPATH
set PYTHONPATH=%PROJECT_ROOT%

REM Start backend in new window
echo Starting backend API (http://localhost:8001)...
start "PixSim7 Backend" /MIN cmd /c "set PYTHONPATH=%PROJECT_ROOT% && uvicorn pixsim7.backend.main.main:app --host 0.0.0.0 --port 8001 --reload > data\logs\dev\backend.log 2>&1"
echo    Logs: data\logs\dev\backend.log

REM Start worker in new window
echo Starting background worker...
start "PixSim7 Worker" /MIN cmd /c "set PYTHONPATH=%PROJECT_ROOT% && arq pixsim7.backend.main.workers.arq_worker.WorkerSettings > data\logs\dev\worker.log 2>&1"
echo    Logs: data\logs\dev\worker.log

REM Start main frontend
if "%SKIP_FRONTEND%"=="false" (
    echo Starting main frontend (http://localhost:5173)...
    start "PixSim7 Frontend" /MIN cmd /c "cd apps\main && pnpm dev > ..\..\data\logs\dev\frontend-main.log 2>&1"
    echo    Logs: data\logs\dev\frontend-main.log
) else (
    echo Skipping frontend (pnpm not installed)
)

REM Wait for services to start
timeout /t 3 /nobreak >nul

echo.
echo ==========================================
echo All Services Running!
echo ==========================================
echo.
echo Access points:
echo   Backend API:    http://localhost:8001/docs
echo   Admin Panel:    http://localhost:5173
echo   Health Check:   http://localhost:8001/health
echo.
echo View logs:
echo   type data\logs\dev\backend.log
echo   type data\logs\dev\worker.log
echo   type data\logs\dev\frontend-main.log
echo.
echo Services are running in minimized windows.
echo Close the windows or press Ctrl+C to stop services.
echo.
echo To stop databases:
echo   docker-compose -f docker-compose.db-only.yml down
echo.

pause
