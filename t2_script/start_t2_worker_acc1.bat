@echo off
chcp 65001 >nul
title ZTTeam Muse Worker - Acc 1 (Port 9223)
cd /d "%~dp0"
echo ========================================================
echo   ZTTeam Muse Worker - Tai Khoan 1 (Port 9223)
echo   He thong: https://t2.goxo.us
echo ========================================================
echo.

if not exist "node_modules\puppeteer-core\" if not exist "node_modules\puppeteer\" (
    echo [*] Dang cai dat thu vien can thiet...
    call npm install puppeteer-core axios form-data
    echo [OK] Hoan tat cai dat!
    echo.
)

node ztteam_muse_worker.js --target=https://t2.goxo.us --chrome-port=9223 --worker-name=Acc-1
pause
