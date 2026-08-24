@echo off
REM Быстрый канал посещений: обновляет "сегодня" каждые 5 минут (пока подключён VPN).
cd /d c:\Users\Sales5\.gemini\antigravity\scratch\ticket-tracker\dwh-sync
:loop
node visits-fast.mjs >> visits-fast.log 2>&1
timeout /t 300 /nobreak >nul
goto loop
