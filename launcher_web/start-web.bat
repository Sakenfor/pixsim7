@echo off
REM Start PixSim7 Launcher Web UI

cd /d "%~dp0"

echo ========================================================================
echo Starting PixSim7 Launcher Web UI
echo ========================================================================
echo.
echo This will start the web interface on port 3100
echo.
echo   Web UI:          http://localhost:3100
echo   API (required):  http://localhost:8100
echo.
echo Make sure the API is running first!
echo   Run: ..\start-api.bat
echo.
echo Press Ctrl+C to stop
echo.
echo ========================================================================
echo.

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    echo.
)

REM Start development server
call npm run dev

pause
