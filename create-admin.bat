@echo off
REM Create admin user for PixSim7

echo.
echo ========================================
echo   Create Admin User
echo ========================================
echo.

cd /d %~dp0
set PYTHONPATH=%cd%

python create_admin.py

echo.
pause
