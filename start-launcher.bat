@echo off
REM Start PixSim7 Desktop Launcher detached from terminal
REM This allows closing the terminal without stopping services

echo Starting PixSim7 Desktop Launcher (detached)...

REM Find Python executable
set _PY=%cd%\.venv\Scripts\python.exe
if not exist "%_PY%" set _PY=python

REM Check if pythonw.exe exists (Windows GUI Python - no console)
set _PYW=%cd%\.venv\Scripts\pythonw.exe
if not exist "%_PYW%" set _PYW=pythonw

REM Try pythonw first (preferred - no console window)
if exist "%_PYW%" (
    echo Using pythonw.exe - launcher will run without console window
    start "" "%_PYW%" scripts\launcher.py
    echo.
    echo Launcher started! You can safely close this window.
    echo The launcher and its services will continue running.
    timeout /t 3 /nobreak >nul
    exit
)

REM Fallback to regular python with detached start
echo Using python.exe - launcher will have its own console window
start "PixSim7 Launcher" /I "%_PY%" scripts\launcher.py

echo.
echo Launcher started in separate window!
echo You can safely close this window.
echo The launcher and its services will continue running.
timeout /t 3 /nobreak >nul
