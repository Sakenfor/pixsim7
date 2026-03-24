@echo off
REM PixSim7 Web Launcher — starts API + opens browser
cd /d "%~dp0.."

set _PY=%~dp0..\.venv\Scripts\python.exe
if not exist "%_PY%" set _PY=python

"%_PY%" --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found!
    pause
    exit /b 1
)

REM Build React UI if not already built
if not exist "%~dp0..\apps\launcher\dist\index.html" (
    echo Building React launcher UI...
    pnpm --filter @pixsim7/launcher build
)

echo Starting Launcher API on http://localhost:8100
echo Press Ctrl+C to stop
echo.
start "" "http://localhost:8100"
"%_PY%" -m launcher.api.main
