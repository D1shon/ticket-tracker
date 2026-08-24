@echo off
REM 2GIS-мост: цикл авто-перезапуска (как у WhatsApp-моста). Если node упал или
REM окно браузера закрыли — поднимется заново через 15 секунд. Профиль двумя
REM процессами не открывается: новый запуск стартует только после смерти старого.
cd /d "%~dp0"
:loop
node bridge.mjs >> bridge.log 2>&1
echo %date% %time% bridge exited, restarting in 15s >> bridge.log
timeout /t 15 /nobreak >nul
goto loop
