@echo off
title Chrome Muse T2 - Tai Khoan 1 (Port 9223)
echo ========================================================
echo   ZTTeam: Khoi dong Google Chrome cho Muse.ai (Tai Khoan 1)
echo   He thong: https://t2.goxo.us (Debug Port: 9223)
echo ========================================================
echo Dang mo Google Chrome Tai Khoan 1 tren Port 9223...
start "" "chrome.exe" --remote-debugging-port=9223 --user-data-dir="%LOCALAPPDATA%\Google\Chrome_Muse_T2_Acc1" https://muse.ai
echo.
echo ========================================================
echo   Vui long dang nhap Muse.ai (Acc 1) tren cua so Chrome vua mo.
echo   Sau khi dang nhap xong, chay file: start_t2_worker_acc1.bat!
echo ========================================================
pause
