@echo off
REM PixSim7 Process Manager - Windows version
REM Prevents zombie processes by tracking PIDs

setlocal enabledelayedexpansion

set BACKEND_PID_FILE=%TEMP%\pixsim7_backend.pid
set WORKER_PID_FILE=%TEMP%\pixsim7_worker.pid

if "%1"=="start" goto :start
if "%1"=="stop" goto :stop
if "%1"=="restart" goto :restart
if "%1"=="status" goto :status
if "%1"=="cleanup" goto :cleanup

echo Usage: %0 {start^|stop^|restart^|status^|cleanup}
exit /b 1

:start
    call :start_backend
    call :start_worker
    goto :eof

:stop
    call :stop_backend
    call :stop_worker
    goto :eof

:restart
    call :stop_backend
    call :stop_worker
    timeout /t 2 /nobreak >nul
    call :start_backend
    call :start_worker
    goto :eof

:status
    echo === PixSim7 Status ===

    if exist %BACKEND_PID_FILE% (
        set /p BACKEND_PID=<%BACKEND_PID_FILE%
        tasklist /FI "PID eq !BACKEND_PID!" 2>nul | find "!BACKEND_PID!" >nul
        if !errorlevel! equ 0 (
            echo Backend: Running ^(PID: !BACKEND_PID!^)
        ) else (
            echo Backend: Dead ^(stale PID file^)
        )
    ) else (
        echo Backend: Stopped
    )

    if exist %WORKER_PID_FILE% (
        set /p WORKER_PID=<%WORKER_PID_FILE%
        tasklist /FI "PID eq !WORKER_PID!" 2>nul | find "!WORKER_PID!" >nul
        if !errorlevel! equ 0 (
            echo Worker: Running ^(PID: !WORKER_PID!^)
        ) else (
            echo Worker: Dead ^(stale PID file^)
        )
    ) else (
        echo Worker: Stopped
    )
    goto :eof

:cleanup
    echo Killing all pixsim7 processes...
    taskkill /F /FI "WINDOWTITLE eq pixsim7*" 2>nul
    taskkill /F /FI "IMAGENAME eq python.exe" /FI "COMMANDLINE eq *pixsim7*" 2>nul
    if exist %BACKEND_PID_FILE% del %BACKEND_PID_FILE%
    if exist %WORKER_PID_FILE% del %WORKER_PID_FILE%
    echo Cleaned up all processes and PID files
    goto :eof

:start_backend
    if exist %BACKEND_PID_FILE% (
        set /p PID=<%BACKEND_PID_FILE%
        tasklist /FI "PID eq !PID!" 2>nul | find "!PID!" >nul
        if !errorlevel! equ 0 (
            echo Backend already running ^(PID: !PID!^)
            goto :eof
        )
    )

    cd /d %~dp0\..
    echo Starting backend...
    start "PixSim7 Backend" /min cmd /c "set PYTHONPATH=G:\code\pixsim7 && python pixsim7_backend\main.py"

    REM Wait a moment for process to start
    timeout /t 2 /nobreak >nul

    REM Find the PID (this is tricky on Windows, simplified approach)
    echo Backend started ^(check with 'manage.bat status'^)
    goto :eof

:stop_backend
    if exist %BACKEND_PID_FILE% (
        set /p PID=<%BACKEND_PID_FILE%
        tasklist /FI "PID eq !PID!" 2>nul | find "!PID!" >nul
        if !errorlevel! equ 0 (
            taskkill /PID !PID! /F
            echo Backend stopped ^(PID: !PID!^)
        )
        del %BACKEND_PID_FILE%
    ) else (
        echo Backend not running
    )
    goto :eof

:start_worker
    if exist %WORKER_PID_FILE% (
        set /p PID=<%WORKER_PID_FILE%
        tasklist /FI "PID eq !PID!" 2>nul | find "!PID!" >nul
        if !errorlevel! equ 0 (
            echo Worker already running ^(PID: !PID!^)
            goto :eof
        )
    )

    cd /d %~dp0\..
    echo Starting worker...
    start "PixSim7 Worker" /min cmd /c "set PYTHONPATH=G:\code\pixsim7 && arq pixsim7_backend.workers.arq_worker.WorkerSettings"

    REM Wait a moment for process to start
    timeout /t 2 /nobreak >nul

    echo Worker started ^(check with 'manage.bat status'^)
    goto :eof

:stop_worker
    if exist %WORKER_PID_FILE% (
        set /p PID=<%WORKER_PID_FILE%
        tasklist /FI "PID eq !PID!" 2>nul | find "!PID!" >nul
        if !errorlevel! equ 0 (
            taskkill /PID !PID! /F
            echo Worker stopped ^(PID: !PID!^)
        )
        del %WORKER_PID_FILE%
    ) else (
        echo Worker not running
    )
    goto :eof
