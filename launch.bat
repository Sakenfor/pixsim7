@echo off
REM PixSim7 Launcher - Start everything and open browser
REM Manage everything from the web UI!

echo.
echo ========================================
echo   PixSim7 Complete Launcher
echo ========================================
echo.

cd /d %~dp0

REM Check if .env exists
if not exist .env (
    echo Creating .env from .env.example...
    copy .env.example .env >nul
    echo .env created
    echo.
)

REM Create data directories
if not exist data\postgres mkdir data\postgres
if not exist data\redis mkdir data\redis
if not exist data\storage mkdir data\storage
if not exist data\logs mkdir data\logs
if not exist data\cache mkdir data\cache

REM Start databases (required for backend to work)
echo [1/3] Starting PostgreSQL and Redis...
docker-compose -f docker-compose.db-only.yml up -d

REM Wait for databases
echo Waiting for databases...
timeout /t 5 /nobreak >nul

REM Try to create database (ignore error if exists)
echo Ensuring database exists...
docker-compose -f docker-compose.db-only.yml exec -T postgres psql -U pixsim -c "CREATE DATABASE pixsim7;" 2>nul >nul

REM Start backend in background
echo.
echo [2/3] Starting Backend API...
set PYTHONPATH=%cd%
start "PixSim7 Backend" /min cmd /c "set PYTHONPATH=%cd% && python pixsim7_backend\main.py"

REM Wait for backend to start
echo Waiting for backend to initialize...
timeout /t 3 /nobreak >nul

REM Change to admin directory
cd admin

REM Check if node_modules exists
if not exist node_modules (
    echo.
    echo Installing admin panel dependencies - this may take a few minutes...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed!
        echo Make sure Node.js is installed: https://nodejs.org
        pause
        exit /b 1
    )
    echo.
)

echo.
echo [3/3] Starting Admin Panel...
echo.
echo ========================================
echo   PixSim7 Running!
echo ========================================
echo.
echo   Admin Panel: http://localhost:8002
echo   Backend API: http://localhost:8001/docs
echo.
echo   Via ZeroTier:
echo   Admin Panel: http://10.243.48.125:8002
echo   Backend API: http://10.243.48.125:8001/docs
echo.
echo   From the admin panel you can:
echo   - Start/stop worker
echo   - View service status (Dashboard)
echo   - Monitor logs (Logs page)
echo   - Manage services (Services page)
echo.
echo   Opening browser...
echo   Press Ctrl+C here to stop admin panel
echo   (Backend will keep running in background)
echo.

REM Wait a moment then open browser
timeout /t 2 /nobreak >nul
start http://localhost:8002

REM Start Vite dev server
call npm run dev

REM When user closes admin panel, go back to root
cd ..

echo.
echo ========================================
echo Admin panel stopped.
echo Backend is still running in background.
echo.
echo To stop backend, use Services page or:
echo   taskkill /F /FI "WINDOWTITLE eq PixSim7 Backend"
echo.
echo To stop databases:
echo   docker-compose -f docker-compose.db-only.yml down
echo ========================================
