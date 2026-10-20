@echo off
chcp 65001 >nul
title ZTTeam Muse Worker - Acc 3 (Port 9225)
cd /d "%~dp0"
echo ========================================================
echo   ZTTeam Muse Worker - Tai Khoan 3 (Port 9225)
echo   He thong: https://t2.goxo.us
echo ========================================================
echo.

if not exist "node_modules\puppeteer-core\" if not exist "node_modules\puppeteer\" (
    echo [*] Dang cai dat thu vien can thiet...
    call npm install puppeteer-core axios form-data
    echo [OK] Hoan tat cai dat!
    echo.
)

node ztteam_muse_worker.js --target=https://t2.goxo.us --chrome-port=9225 --worker-name=Acc-3
pause
