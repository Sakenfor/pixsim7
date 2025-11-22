@echo off
REM Database Migration Helper Script
REM Simple wrapper for common Alembic commands

setlocal
set PYTHONPATH=G:\code\pixsim7
set ALEMBIC=G:\code\conda_envs\pixsim7\Scripts\alembic.exe

if "%1"=="" goto :usage
if "%1"=="status" goto :status
if "%1"=="upgrade" goto :upgrade
if "%1"=="downgrade" goto :downgrade
if "%1"=="revision" goto :revision
if "%1"=="history" goto :history
if "%1"=="current" goto :current
if "%1"=="heads" goto :heads
goto :usage

:status
echo Checking migration status...
echo.
%ALEMBIC% current -v
echo.
echo Latest migration:
%ALEMBIC% heads
goto :end

:upgrade
echo Applying pending migrations...
%ALEMBIC% upgrade head
goto :end

:downgrade
if "%2"=="" (
    echo ERROR: Please specify revision ID or -1 for one step back
    echo Example: scripts\db.bat downgrade -1
    exit /b 1
)
echo Downgrading to %2...
%ALEMBIC% downgrade %2
goto :end

:revision
if "%2"=="" (
    echo ERROR: Please provide migration message
    echo Example: scripts\db.bat revision "add user preferences table"
    exit /b 1
)
echo Creating new migration: %2
%ALEMBIC% revision --autogenerate -m %2
goto :end

:history
echo Migration history:
%ALEMBIC% history --verbose
goto :end

:current
echo Current database revision:
%ALEMBIC% current -v
goto :end

:heads
echo Latest migration files:
%ALEMBIC% heads
goto :end

:usage
echo.
echo Database Migration Helper
echo ========================
echo.
echo Usage: scripts\db.bat [command] [options]
echo.
echo Commands:
echo   status              - Show current migration status
echo   upgrade             - Apply all pending migrations
echo   downgrade [rev]     - Downgrade to revision (use -1 for one step back)
echo   revision "message"  - Create new migration with autogenerate
echo   history             - Show full migration history
echo   current             - Show current database revision
echo   heads               - Show latest migration file
echo.
echo Examples:
echo   scripts\db.bat status
echo   scripts\db.bat upgrade
echo   scripts\db.bat revision "add user preferences"
echo   scripts\db.bat downgrade -1
echo.
goto :end

:end
endlocal
