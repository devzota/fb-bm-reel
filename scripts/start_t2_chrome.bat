@echo off
title Khoi dong Chrome Muse Debugging cho T2
echo ========================================================
echo   ZTTeam: Khoi dong Google Chrome Remote Debugging Port 9222
echo   Dung rieng cho he thong t2.goxo.us
echo ========================================================
echo Dang mo Google Chrome...
start "" "chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome_Muse_T2" https://muse.ai
echo Vui long dang nhap Muse.ai tren tab vua mo truoc khi bat worker!
pause
