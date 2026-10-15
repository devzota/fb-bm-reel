@echo off
title Khoi dong Chrome Muse Debugging cho T2 (Port 9223)
echo ========================================================
echo   ZTTeam: Khoi dong Google Chrome Remote Debugging Port 9223
echo   Dung rieng cho he thong t2.goxo.us (Doc lap, khong xung dot)
echo ========================================================
echo Dang mo Google Chrome tren Port 9223...
start "" "chrome.exe" --remote-debugging-port=9223 --user-data-dir="%LOCALAPPDATA%\Google\Chrome_Muse_T2" https://muse.ai
echo.
echo ========================================================
echo   Vui long dang nhap Muse.ai tren cua so Chrome vua mo.
echo   Sau khi dang nhap xong, chay file start_t2_muse_worker.bat!
echo ========================================================
pause
