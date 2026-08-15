@echo off
title Jarvis
cd /d "%~dp0.."

if not exist "logs" mkdir logs
set LOG=logs\jarvis-boot.log
echo [%date% %time%] Starting Jarvis > "%LOG%"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required. Install from https://nodejs.org
  echo [%date% %time%] Node.js missing >> "%LOG%"
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
  echo Missing .env with OPENAI_API_KEY. Copy .env.example to .env and add your key.
  echo [%date% %time%] Missing .env >> "%LOG%"
  pause
  exit /b 1
)

REM Bind to loopback so a new public Wi-Fi profile cannot firewall-block boot
set HOST=127.0.0.1

echo [%date% %time%] npm run dev >> "%LOG%"
start "Jarvis" /min cmd /c "npm run dev >> logs\jarvis-boot.log 2>&1"
