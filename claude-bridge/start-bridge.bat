@echo off
rem claude-bridge: чат с Клодом в HJ Track. Цикл-няня: упал → рестарт через 15с.
title claude-bridge
cd /d "%~dp0"
:loop
node bridge.mjs >> bridge.log 2>&1
echo %date% %time% bridge exited, restarting in 15s >> bridge.log
timeout /t 15 /nobreak >nul
goto loop
