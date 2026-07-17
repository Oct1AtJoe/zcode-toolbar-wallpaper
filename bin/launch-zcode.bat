@echo off
REM  ============================================================
REM  Launch ZCode with debug port for wallpaper injection.
REM  ============================================================
REM  Step 0: locate ZCode.exe
REM  Step 1: kill any running ZCode (single-instance lock)
REM  Step 2: launch with --remote-debugging-port=9222
REM  Step 3: probe.ps1 loop until debug port + page target ready
REM
REM  Return codes:
REM    0 = ready (port + page target up)
REM    1 = port never came up
REM    2 = port up but no page target
REM    3 = ZCode.exe not found / launch failed
REM  ============================================================
chcp 65001 >nul
setlocal enabledelayedexpansion
title ZCode Launcher

set "WP_ROOT=%~dp0.."
set "DEBUG_PORT=9222"
set "ZCODE_EXE="

echo [launcher] Step 0: locate ZCode.exe
REM  Strategy (in order):
REM    1. ZCODE_EXE env var  (user override)
REM    2. Get-Process         (ZCode is already running)
REM    3. PATH lookup         (where ZCode)
REM    4. Default locations   (common Electron install dirs)
REM    5. Registry            (App Paths key)
REM  First match wins.
if defined ZCODE_EXE if exist "%ZCODE_EXE%" goto :found
for /f "delims=" %%P in ('powershell -NoProfile -Command "try{(Get-Process ZCode -ErrorAction Stop|Select-Object -First 1 -ExpandProperty Path)}catch{}" 2^>nul') do if exist "%%P" (set "ZCODE_EXE=%%P" & goto :found)
for /f "delims=" %%P in ('where ZCode.exe 2^>nul') do if exist "%%P" (set "ZCODE_EXE=%%P" & goto :found)
for %%D in ("%LOCALAPPDATA%\Programs\ZCode\ZCode.exe" "%USERPROFILE%\scoop\apps\zcode\current\ZCode.exe" "C:\Program Files\ZCode\ZCode.exe" "C:\Program Files (x86)\ZCode\ZCode.exe") do if exist %%D (set "ZCODE_EXE=%%~D" & goto :found)
for /f "tokens=2,*" %%A in ('reg query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\ZCode.exe" /ve 2^>nul ^| findstr /i "REG_SZ"') do if exist "%%B" (set "ZCODE_EXE=%%B" & goto :found)
echo [launcher] ERROR: ZCode.exe not found.
echo [launcher] Set ZCODE_EXE env var, or add ZCode to PATH.
exit /b 3
:found
echo [launcher]   Found: %ZCODE_EXE%

echo [launcher] Step 1: stop any running ZCode
tasklist /fi "imagename eq ZCode.exe" 2>nul | find /i "ZCode.exe" >nul
if not errorlevel 1 (
  echo [launcher]   Killing...
  taskkill /f /im ZCode.exe >nul 2>nul
  ping -n 3 127.0.0.1 >nul 2>nul
) else (
  echo [launcher]   Not running, good.
)

echo [launcher] Step 2: launch ZCode with debug port %DEBUG_PORT%
powershell -NoProfile -Command "$p = Start-Process -FilePath '%ZCODE_EXE%' -ArgumentList '--remote-debugging-port=%DEBUG_PORT% --autoplay-policy=no-user-gesture-required' -PassThru; Write-Output ('  PID:' + $p.Id)"
echo [launcher]   Started. Waiting for window...

echo [launcher] Step 3: wait for debug port + page target
set /a tries=0
:wait_ready
set /a tries+=1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0probe.ps1" -Port %DEBUG_PORT% >nul 2>nul
set rc=!errorlevel!
if "!rc!"=="0" goto ready
if %tries% lss 40 (
  ping -n 2 127.0.0.1 >nul 2>nul
  goto wait_ready
)
echo [launcher]   Timeout after %tries% tries (rc=!rc!).
exit /b !rc!

:ready
echo [launcher]   Window ready after %tries% tries.
exit /b 0
