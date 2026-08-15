@echo off
title Jarvis
setlocal

REM Keep the boot console off the desktop. Errors still land in logs\jarvis-boot.log.
if /I not "%JARVIS_MINIMIZED%"=="1" (
  set JARVIS_MINIMIZED=1
  start "Jarvis" /min cmd /c ""%~f0" %*"
  exit /b 0
)

REM Optional first argument is the project root discovered by Jarvis.vbs
if not "%~1"=="" (
  cd /d "%~1"
) else (
  cd /d "%~dp0.."
)

if not exist "logs" mkdir logs
set LOG=logs\jarvis-boot.log
echo [%date% %time%] Starting Jarvis from %CD% > "%LOG%"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install from https://nodejs.org
  echo [%date% %time%] Node.js missing >> "%LOG%"
  pause
  exit /b 1
)

if not exist "package.json" (
  echo This folder is not Jarvis(Mark1). Expected package.json in:
  echo   %CD%
  echo [%date% %time%] Missing package.json in %CD% >> "%LOG%"
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing dependencies...
  call npm install >> "%LOG%" 2>&1
  if errorlevel 1 (
    echo Dependency install failed. See logs\jarvis-boot.log
    type "%LOG%"
    pause
    exit /b 1
  )
)

if not exist ".env" (
  echo Missing .env with OPENAI_API_KEY.
  echo Copy .env.example to .env in this folder and add your OpenAI key:
  echo   %CD%\.env
  echo [%date% %time%] Missing .env >> "%LOG%"
  pause
  exit /b 1
)

findstr /C:"OPENAI_API_KEY=" ".env" >nul
if errorlevel 1 (
  echo .env exists but OPENAI_API_KEY is missing. Add it and try again.
  echo [%date% %time%] OPENAI_API_KEY missing from .env >> "%LOG%"
  pause
  exit /b 1
)

REM Bind to loopback so a new public Wi-Fi profile cannot firewall-block boot
set HOST=127.0.0.1

REM Stop a leftover Jarvis so double-click can open a fresh console + windows
taskkill /F /IM electron.exe >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3847" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173" ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

echo [%date% %time%] npm run dev (OpenAI Realtime) from %CD% >> "%LOG%"
echo Starting Jarvis from:
echo   %CD%
echo Companion HUD should appear shortly. Artifacts stays hidden.
echo Boot log: %CD%\%LOG%
call npm run dev
echo [%date% %time%] npm run dev exited %ERRORLEVEL% >> "%LOG%"
if not %ERRORLEVEL%==0 pause
