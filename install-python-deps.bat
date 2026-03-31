@echo off
REM Install all Python dependencies into the active environment.
REM Works with conda, venv, or system Python.
cd /d "%~dp0"

set _PY=G:\code\conda_envs\pixsim7\python.exe
if not exist "%_PY%" set _PY=%~dp0.venv\Scripts\python.exe
if not exist "%_PY%" set _PY=python

echo ========================================
echo  Installing Python dependencies
echo ========================================
echo.

"%_PY%" -m pip install -r pixsim7/backend/main/requirements.txt
"%_PY%" -m pip install -r pixsim7/client/requirements.txt
"%_PY%" -m pip install -r launcher/requirements.txt

echo.
echo Optional:
echo   pip install -r pixsim7/backend/main/requirements-local-llm.txt  (local LLM support)
echo   pip install -r requirements-docs.txt                             (docs generation)
echo.
echo Done.
pause
