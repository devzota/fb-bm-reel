@echo off
chcp 65001 >nul
title Cai dat thu vien ZTTeam Muse Worker
cd /d "%~dp0"
echo ========================================================
echo   Dang cai dat thu vien can thiet cho Worker...
echo ========================================================
echo.
call npm install
echo.
echo ========================================================
echo   [OK] Da hoan tat cai dat thu vien!
echo   Ban co the bat dau chay cac file start_t2_*.bat ngay bay gio.
echo ========================================================
pause
