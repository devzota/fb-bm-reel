@echo off
title Chrome Muse T2 - Tai Khoan 2 (Port 9224)
echo ========================================================
echo   ZTTeam: Khoi dong Google Chrome cho Muse.ai (Tai Khoan 2)
echo   He thong: https://t2.goxo.us (Debug Port: 9224)
echo ========================================================
echo Dang mo Google Chrome Tai Khoan 2 tren Port 9224...
start "" "chrome.exe" --remote-debugging-port=9224 --user-data-dir="%LOCALAPPDATA%\Google\Chrome_Muse_T2_Acc2" https://muse.ai
echo.
echo ========================================================
echo   Vui long dang nhap Muse.ai (Acc 2) tren cua so Chrome vua mo.
echo   Sau khi dang nhap xong, chay file: start_t2_worker_acc2.bat!
echo ========================================================
pause
