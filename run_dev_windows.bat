@echo off
FOR /F "tokens=2" %%i IN ('ipconfig ^| findstr /I "IPv4 Address"') DO SET "MY_IP=%%i"
ionic cap run android -l --external --port=5173 --public-host=%MY_IP%

