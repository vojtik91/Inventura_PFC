@echo off
cd /d "%~dp0"
echo Aplikace bezi na http://localhost:8080
echo Pro telefon pouzijte IP adresu tohoto pocitace a port 8080.
python -m http.server 8080 --bind 0.0.0.0
pause
