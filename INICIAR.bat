@echo off
chcp 65001 >nul
title TIPSTER PRO v16
cls
echo.
echo  ================================================
echo   TIPSTER PRO v16 - SERVIDOR
echo   FIFA Filter + Props + Arbitraje + Sidebar
echo  ================================================
echo.
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERROR: Node.js no instalado.
    echo  Descarga en: https://nodejs.org
    pause & exit /b 1
)
echo  Node.js OK!
echo.
timeout /t 2 /nobreak >nul
start "" "http://localhost:3001"
node server.js
pause
