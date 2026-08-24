@echo off
REM Синк DWH (посещения, записи, пульсометры, история): раз в СУТКИ + при старте ноутбука.
cd /d c:\Users\Sales5\.gemini\antigravity\scratch\ticket-tracker\dwh-sync
:loop
node hrm-sync.mjs >> hrm-sync.log 2>&1
echo %date% %time% sync done, next run in 24h >> hrm-sync.log
timeout /t 86400 /nobreak >nul
goto loop
