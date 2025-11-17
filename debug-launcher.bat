@echo off
REM Debug version of launcher that shows errors in console
cd /d "%~dp0"

set _PY=%~dp0.venv\Scripts\python.exe
if not exist "%_PY%" set _PY=python

echo ========================================
echo PixSim7 Launcher - DEBUG MODE
echo ========================================
echo.
echo Running launcher with full error output...
echo.

REM Run with python.exe (NOT pythonw.exe) so we can see errors
"%_PY%" -u scripts/launcher.py
echo.
echo ========================================
echo Launcher exited with code: %ERRORLEVEL%
echo ========================================
pause
