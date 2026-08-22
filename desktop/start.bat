@echo off
setlocal
cd /d "%~dp0\.."

where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 20+ first.
  pause
  exit /b 1
)

echo Checking MongoDB...
powershell -NoProfile -Command "try { (New-Object Net.Sockets.TcpClient('127.0.0.1',27017)).Close(); exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo MongoDB is not running on this computer.
  echo Install MongoDB Community, start the service, then run this again.
  pause
  exit /b 1
)

call npm install --prefix backend
if errorlevel 1 goto fail
call npm install --prefix frontend
if errorlevel 1 goto fail

call node desktop\launch.cjs
if errorlevel 1 goto fail
exit /b 0

:fail
echo Setup failed.
pause
exit /b 1
