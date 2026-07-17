@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title ZCode Toolbar Wallpaper

set "WP_ROOT=%~dp0"
set "WP_ROOT=%WP_ROOT:~0,-1%"
set "LOG=%WP_ROOT%\.start.log"

echo === start.bat run at %date% %time% === > "%LOG%"

REM ---- Step 0: kill old server (by port 18923) ----
echo [start] Step 0/4: stopping old server ... >> "%LOG%"
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr ":18923" ^| findstr "LISTENING"') do (
  taskkill /PID %%P /F >> "%LOG%" 2>&1
)
ping -n 2 127.0.0.1 >nul 2>nul
echo [start]   done. >> "%LOG%"

REM ---- Step 1: Node.js check ----
echo [start] Step 1/4: checking Node.js ... >> "%LOG%"
where node >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [start]   Node.js NOT FOUND >> "%LOG%"
  goto :eof
)
echo [start]   Node.js OK >> "%LOG%"

REM ---- Step 2: launch ZCode with debug port ----
echo [start] Step 2/4: checking debug port 9222 ... >> "%LOG%"
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:9222/json/version' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
set portrc=!errorlevel!
echo [start]   port check rc=!portrc! >> "%LOG%"
if "!portrc!"=="0" (
  echo [start]   Debug port already up - skipping launch. >> "%LOG%"
  goto step3
)
echo [start]   Launching ZCode ... >> "%LOG%"
call "%WP_ROOT%\bin\launch-zcode.bat" >> "%LOG%" 2>&1
set rc=!errorlevel!
echo [start]   launch rc=!rc! >> "%LOG%"
if not "!rc!"=="0" (
  echo [start]   FAILED rc=!rc! >> "%LOG%"
  goto :eof
)

:step3
REM ---- Step 3: start server (truly independent background process) ----
echo [start] Step 3/4: starting server ... >> "%LOG%"
powershell -NoProfile -Command "Start-Process -FilePath node -ArgumentList @('\"%WP_ROOT%\lib\server.cjs\"') -WorkingDirectory '%WP_ROOT%' -WindowStyle Hidden" >> "%LOG%" 2>&1
ping -n 3 127.0.0.1 >nul 2>nul
echo [start]   Server started >> "%LOG%"

REM ---- Step 4: resize + restore ----
echo [start] Step 4/4: resize + restore ... >> "%LOG%"
node "%WP_ROOT%\lib\resize.cjs" >> "%LOG%" 2>&1
node "%WP_ROOT%\lib\inject.cjs" >> "%LOG%" 2>&1
echo [start]   Done >> "%LOG%"

endlocal
