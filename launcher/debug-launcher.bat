@echo off
cd /d "%~dp0.."

REM Find Python: conda env > .venv > PATH
set _PY=G:\code\conda_envs\pixsim7\python.exe
if not exist "%_PY%" set _PY=%~dp0..\.venv\Scripts\python.exe
if not exist "%_PY%" set _PY=python

"%_PY%" -u -m launcher --browser
pause
