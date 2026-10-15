@echo off
chcp 65001 >nul
title Cai Dat Thu Vien Cho Muse Worker
cd /d "%~dp0"
echo ========================================================
echo   ZTTeam: Cai dat thu vien Node.js cho Muse Worker
echo   Dang cai: puppeteer-core, axios, form-data...
echo ========================================================
echo.
call npm install puppeteer-core axios form-data
echo.
echo ========================================================
echo   CAI DAT HOAN TAT!
echo   Bay gio ban co the chay:
echo     1. start_t2_chrome.bat
echo     2. start_t2_muse_worker.bat
echo ========================================================
pause
