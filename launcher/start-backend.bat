@echo off
REM Start PixSim7 Backend API

echo.
echo ========================================
echo   Starting PixSim7 Backend API
echo ========================================
echo.

cd /d %~dp0..

set PYTHONPATH=%cd%

echo PYTHONPATH set to: %PYTHONPATH%
echo.
echo Starting backend...
echo API will be available at: http://localhost:8001/docs
echo.
echo Press Ctrl+C to stop
echo.

python pixsim7_backend\main.py
