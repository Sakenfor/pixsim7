@echo off
setlocal enabledelayedexpansion
REM Start PixSim7 Desktop Launcher detached from terminal
REM This allows closing the terminal without stopping services

echo Starting PixSim7 Desktop Launcher (detached)...
echo.

REM Use script's directory, not current directory
cd /d "%~dp0.."

REM Find Python executable
set _PY=%~dp0..\.venv\Scripts\python.exe
if not exist "%_PY%" set _PY=python

REM Check if pythonw.exe exists (Windows GUI Python - no console)
set _PYW=%~dp0..\.venv\Scripts\pythonw.exe
if not exist "%_PYW%" set _PYW=pythonw

REM Verify Python is available
"%_PY%" --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found! Please ensure Python is installed and .venv is set up.
    echo Run: python -m venv .venv
    echo Then: .venv\Scripts\pip install -r requirements.txt
    pause
    exit /b 1
)

REM Check if launcher is already running using PID file
if exist "%~dp0..\data\launcher\launcher.pid" (
    set /p EXISTING_PID=<"%~dp0..\data\launcher\launcher.pid"
    REM Verify the PID is actually running
    tasklist /FI "PID eq !EXISTING_PID!" /NH 2>nul | find "!EXISTING_PID!" >nul 2>&1
    if not errorlevel 1 (
        echo ERROR: Launcher is already running ^(PID: !EXISTING_PID!^)
        echo Please close the existing launcher first.
        echo.
        pause
        exit /b 1
    ) else (
        REM Stale PID file, delete it
        del "%~dp0..\data\launcher\launcher.pid" >nul 2>&1
    )
)

REM Try pythonw first (preferred - no console window)
if exist "%_PYW%" (
    echo Using pythonw.exe - launcher will run without console window
    start "" "%_PYW%" "-m" "launcher.gui.launcher"
    if errorlevel 1 (
        echo ERROR: Failed to start launcher!
        pause
        exit /b 1
    )
    echo.
    echo Launcher started! You can safely close this window.
    echo NOTE: Services will continue running even after closing the launcher.
    echo Use the launcher UI to stop services when done.
    timeout /t 3 /nobreak >nul
    exit /b 0
)

REM Fallback to regular python with detached start
echo Using python.exe - launcher will have its own console window
start "PixSim7 Launcher" /I "%_PY%" "-m" "launcher.gui.launcher"
if errorlevel 1 (
    echo ERROR: Failed to start launcher!
    pause
    exit /b 1
)

echo.
echo Launcher started in separate window!
echo You can safely close this window.
echo NOTE: Services will continue running even after closing the launcher.
echo Use the launcher UI to stop services when done.
timeout /t 3 /nobreak >nul
exit /b 0
