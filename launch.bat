@echo off
REM PixSim7 Unified Dev Launcher
REM Starts databases, backend (Python), admin (Svelte), and optional React frontends.
REM Uses environment variables for ports. Requires: Python 3.11+, Node.js, Docker.

echo.
echo ========================================
echo   PixSim7 Development Launcher
echo ========================================
echo.

cd /d %~dp0

REM Load env defaults (fallback if missing)
set BACKEND_PORT=8001
set ADMIN_PORT=8002
set FRONTEND_PORT=5173
set GAME_FRONTEND_PORT=5174
if exist .env (
    for /f "tokens=1,2 delims==" %%G in ('findstr /r /c:"^[A-Za-z0-9_]*=" .env') do (
        if /I "%%G"=="BACKEND_PORT" set BACKEND_PORT=%%H
        if /I "%%G"=="ADMIN_PORT" set ADMIN_PORT=%%H
    )
)
echo Using ports: Backend=%BACKEND_PORT% Admin=%ADMIN_PORT% Frontend=%FRONTEND_PORT% Game=%GAME_FRONTEND_PORT%

REM Mode selection: default to interactive if no args
set START_FRONTENDS=0
if /I "%1"=="--with-frontend" (
    set START_FRONTENDS=1
    goto BEGIN_AUTO
)
if /I "%1"=="--auto" goto BEGIN_AUTO
if not "%1"=="" goto BEGIN_AUTO
goto INTERACTIVE

:BEGIN_AUTO

REM Create data directories
if not exist data\postgres mkdir data\postgres
if not exist data\redis mkdir data\redis
if not exist data\storage mkdir data\storage
if not exist data\logs mkdir data\logs
if not exist data\cache mkdir data\cache

REM Start databases (required for backend to work)
echo [1/5] Starting PostgreSQL and Redis...
docker-compose -f docker-compose.db-only.yml up -d

REM Wait for databases
echo Waiting for databases...
timeout /t 5 /nobreak >nul

REM Try to create database (ignore error if exists)
echo Ensuring database exists...
docker-compose -f docker-compose.db-only.yml exec -T postgres psql -U pixsim -c "CREATE DATABASE pixsim7;" 2>nul >nul

REM Start backend in background
echo.
echo [2/5] Preparing Python backend environment...
set PYTHONPATH=%cd%
if not exist .venv (
    echo Creating Python virtual environment...
    python -m venv .venv
)
call .venv\Scripts\activate.bat
echo Installing backend requirements (if needed)...
python -m pip install --upgrade pip >nul
python -m pip install -r pixsim7_backend\requirements.txt >nul
echo Starting Backend API on port %BACKEND_PORT%...
start "PixSim7 Backend" /min cmd /k "call %cd%\.venv\Scripts\activate.bat && set PYTHONPATH=%cd% && set PORT=%BACKEND_PORT% && python pixsim7_backend\main.py"

REM Wait for backend to start
echo Waiting for backend to initialize...
echo Health checking backend...
set /a _healthRetries=0
:health_loop
timeout /t 2 /nobreak >nul
powershell -Command "try { $r=Invoke-WebRequest -UseBasicParsing http://localhost:%BACKEND_PORT%/health; if($r.StatusCode -eq 200){ exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
    set /a _healthRetries+=1
    if %_healthRetries% GEQ 10 (
        echo Backend failed to become healthy.
        goto after_backend
    )
    echo Waiting for backend... (%_healthRetries%)
    goto health_loop
)
echo Backend healthy.
:after_backend

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
echo [3/5] Starting Admin Panel (port %ADMIN_PORT%)...
echo.
echo ========================================
echo   PixSim7 Running!
echo ========================================
echo.
echo   Admin Panel: http://localhost:%ADMIN_PORT%
echo   Backend API: http://localhost:%BACKEND_PORT%/docs
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
start http://localhost:%ADMIN_PORT%

REM Start Vite dev server
call npm run dev

REM When user closes admin panel, go back to root
cd ..

REM Start React Frontend (optional)
if "%START_FRONTENDS%"=="1" (
    echo.
    echo [4/5] Starting React Frontend (port %FRONTEND_PORT%)...
    start "PixSim7 Frontend" cmd /c "set VITE_GAME_URL=http://localhost:%GAME_FRONTEND_PORT% & pnpm -C frontend dev -- --port %FRONTEND_PORT%"
    echo [5/5] Starting Game Frontend (port %GAME_FRONTEND_PORT%)...
    start "PixSim7 Game Frontend" cmd /c "pnpm -C game-frontend dev -- --port %GAME_FRONTEND_PORT%"
)

echo.
echo ========================================
echo Admin panel stopped.
echo Backend is still running in background.
echo.
echo To stop backend:
echo   taskkill /F /FI "WINDOWTITLE eq PixSim7 Backend"
echo.
echo To stop databases:
echo   docker-compose -f docker-compose.db-only.yml down
echo To stop frontends (if started): close their terminal windows.
echo.
echo Usage for full stack: launch.bat --with-frontend
echo ========================================

goto :eof


:INTERACTIVE
cls
echo.
echo ========================================
echo   PixSim7 Interactive Launcher
echo ========================================
echo Current ports: Backend=%BACKEND_PORT% Admin=%ADMIN_PORT% Frontend=%FRONTEND_PORT% Game=%GAME_FRONTEND_PORT%
echo.
echo  [1] Configure Ports
echo  [2] Start Databases (Postgres, Redis)
echo  [3] Start Backend API
echo  [4] Start Admin Panel (detached)
echo  [5] Start React Frontends (frontend + game-frontend)
echo  [6] Start ALL (DB + Backend + Admin + Frontends)
echo  [7] Stop Databases
echo  [8] Start Desktop Launcher (PySide6)
echo  [9] Quit
echo.
set /p _choice=Select an option [1-8]: 

if "%_choice%"=="1" goto CONFIGURE_PORTS
if "%_choice%"=="2" goto INT_DB_UP
if "%_choice%"=="3" goto INT_BACKEND
if "%_choice%"=="4" goto INT_ADMIN
if "%_choice%"=="5" goto INT_FRONTENDS
if "%_choice%"=="6" goto INT_ALL
if "%_choice%"=="7" goto INT_DB_DOWN
if "%_choice%"=="8" goto START_LAUNCHER
if "%_choice%"=="9" goto :eof
goto INTERACTIVE

:CONFIGURE_PORTS
set "_in="
set /p _in=Enter Backend Port [%BACKEND_PORT%]: 
if not "%_in%"=="" set BACKEND_PORT=%_in%
set "_in="
set /p _in=Enter Admin Port [%ADMIN_PORT%]: 
if not "%_in%"=="" set ADMIN_PORT=%_in%
set "_in="
set /p _in=Enter Frontend Port [%FRONTEND_PORT%]: 
if not "%_in%"=="" set FRONTEND_PORT=%_in%
set "_in="
set /p _in=Enter Game Frontend Port [%GAME_FRONTEND_PORT%]: 
if not "%_in%"=="" set GAME_FRONTEND_PORT=%_in%
echo.
echo Ports updated: Backend=%BACKEND_PORT% Admin=%ADMIN_PORT% Frontend=%FRONTEND_PORT% Game=%GAME_FRONTEND_PORT%
echo.
goto INTERACTIVE

:INT_DB_UP
echo Starting databases...
docker-compose -f docker-compose.db-only.yml up -d
echo Ensuring database exists...
docker-compose -f docker-compose.db-only.yml exec -T postgres psql -U pixsim -c "CREATE DATABASE pixsim7;" 2>nul >nul
echo Done.
goto INTERACTIVE

:INT_BACKEND
echo Preparing Python backend environment...
set PYTHONPATH=%cd%
if not exist .venv (
    echo Creating Python virtual environment...
    python -m venv .venv
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip >nul
python -m pip install -r pixsim7_backend\requirements.txt >nul
echo Starting Backend API on port %BACKEND_PORT%...
start "PixSim7 Backend" /min cmd /k "call %cd%\.venv\Scripts\activate.bat && set PYTHONPATH=%cd% && set PORT=%BACKEND_PORT% && python pixsim7_backend\main.py"
echo Health checking backend...
set /a _healthRetries=0
:ih_loop
timeout /t 2 /nobreak >nul
powershell -Command "try { $r=Invoke-WebRequest -UseBasicParsing http://localhost:%BACKEND_PORT%/health; if($r.StatusCode -eq 200){ exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
    set /a _healthRetries+=1
    if %_healthRetries% GEQ 10 (
        echo Backend failed to become healthy.
        goto INTERACTIVE
    )
    echo Waiting for backend... (%_healthRetries%)
    goto ih_loop
)
echo Backend healthy.
goto INTERACTIVE

:INT_ADMIN
echo Starting Admin Panel on port %ADMIN_PORT% (detached)...
start "PixSim7 Admin" cmd /c "cd /d %cd%\admin && if not exist node_modules npm install && set VITE_ADMIN_PORT=%ADMIN_PORT% & set VITE_BACKEND_URL=http://localhost:%BACKEND_PORT% & npm run dev"
timeout /t 2 /nobreak >nul
start http://localhost:%ADMIN_PORT%
goto INTERACTIVE

:INT_FRONTENDS
echo Starting React Frontend on port %FRONTEND_PORT% (detached)...
start "PixSim7 Frontend" cmd /c "set VITE_GAME_URL=http://localhost:%GAME_FRONTEND_PORT% & pnpm -C frontend dev -- --port %FRONTEND_PORT%"
echo Starting Game Frontend on port %GAME_FRONTEND_PORT% (detached)...
start "PixSim7 Game Frontend" cmd /c "pnpm -C game-frontend dev -- --port %GAME_FRONTEND_PORT%"
goto INTERACTIVE

:INT_ALL
call :INT_DB_UP
call :INT_BACKEND
call :INT_ADMIN
call :INT_FRONTENDS
goto INTERACTIVE

:INT_DB_DOWN
echo Stopping databases...
docker-compose -f docker-compose.db-only.yml down
echo Done.
goto INTERACTIVE

:START_LAUNCHER
echo.
echo Starting Desktop Launcher...
set _PY=%cd%\.venv\Scripts\python.exe
if not exist "%_PY%" set _PY=python
start "PixSim7 Desktop Launcher" cmd /c "%_PY% launcher\gui\launcher.py"
goto INTERACTIVE
