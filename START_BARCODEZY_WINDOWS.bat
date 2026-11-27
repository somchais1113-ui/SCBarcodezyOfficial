@echo off
cd /d "%~dp0"
where py >nul 2>&1
if errorlevel 1 goto fallback
py -3.11 -c "import sys" >nul 2>&1
if not errorlevel 1 goto run311
py -3.12 -c "import sys" >nul 2>&1
if not errorlevel 1 goto run312
:fallback
where python >nul 2>&1
if errorlevel 1 goto missing
python deep-analysis\launch_local.py
if errorlevel 1 pause
exit /b
:run311
py -3.11 deep-analysis\launch_local.py
if errorlevel 1 pause
exit /b
:run312
py -3.12 deep-analysis\launch_local.py
if errorlevel 1 pause
exit /b
:missing
echo Install 64-bit Python 3.11 or 3.12 from https://www.python.org/downloads/ then reopen this file.
pause
exit /b 1
