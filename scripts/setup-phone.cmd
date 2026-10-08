@echo off
rem Confiance Kiosk: set up a phone over USB. Double-click this file. It needs setup-phone.ps1 in the same folder.
rem It asks for the setup code shown on the dashboard (Add phones), downloads the USB tools and the app, and sets up
rem every phone plugged in with USB debugging switched on.
setlocal
title Confiance Kiosk - phone setup
echo.
echo  Confiance Kiosk - phone setup over USB
echo  --------------------------------------
echo  Before continuing: the phone must be freshly reset, set up WITHOUT any Google or Samsung account,
echo  connected to Wi-Fi, with USB debugging switched on, and plugged into this computer with a data cable.
echo.
set /p CODE=Setup code from the dashboard (for example XZUF7-EKXKV): 
if "%CODE%"=="" ( echo No code entered. & pause & exit /b 1 )
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-phone.ps1" -Code "%CODE%"
echo.
echo  Finished. If the phone shows Confiance Kiosk, approve it on the dashboard under Phones.
pause
