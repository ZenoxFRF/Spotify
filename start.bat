@echo off
cd /d "%~dp0"
start "" http://127.0.0.1:5000/
python -m http.server 5000 --bind 127.0.0.1
pause
