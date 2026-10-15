@echo off
chcp 65001 >nul
title ZTTeam Muse Worker - t2.goxo.us (Port 9223)
cd /d "%~dp0"
echo ========================================================
echo   ZTTeam Muse Worker - He Thong Doc Lap t2.goxo.us
echo   Chi phuc vu duy nhat: https://t2.goxo.us (Chrome Port 9223)
echo ========================================================
echo.

if not exist "node_modules\puppeteer-core\" if not exist "node_modules\puppeteer\" (
    echo [*] Phat hien chua cai thu vien Node.js. Dang tu dong cai dat (mat ~5 giay)...
    call npm install puppeteer-core axios form-data
    echo [OK] Cai dat thu vien hoan tat!
    echo.
)

node ztteam_muse_worker.js --target=https://t2.goxo.us --chrome-port=9223
pause
