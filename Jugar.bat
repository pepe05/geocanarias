@echo off
title GeoCanarias
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Necesitas instalar Node.js para jugar: https://nodejs.org
  echo.
  pause
  exit /b
)

if not exist node_modules (
  echo Instalando dependencias, solo la primera vez...
  call npm install
)

rem Abre el navegador cuando el servidor ya esta arrancado
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
node server.js
pause
