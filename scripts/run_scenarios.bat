@echo off
REM Run scenario tests
REM
REM Usage:
REM   scripts\run_scenarios.bat [options]
REM
REM Options are passed through to the scenario runner

set PYTHONPATH=%CD%
python -m pixsim7_backend.scenarios %*
