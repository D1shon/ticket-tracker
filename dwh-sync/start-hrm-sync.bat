@echo off
REM Синк DWH (посещения, записи, пульсометры, история): раз в СУТКИ + при старте ноутбука.
REM При ошибке (нет VPN и т.п.) — повтор через 15 минут, а не через сутки.
cd /d c:\Users\Sales5\.gemini\antigravity\scratch\ticket-tracker\dwh-sync
:loop
node hrm-sync.mjs >> hrm-sync.log 2>&1
if errorlevel 1 (
  echo %date% %time% sync FAILED, retry in 15 min >> hrm-sync.log
  timeout /t 900 /nobreak >nul
  goto loop
)
echo %date% %time% sync done, next run in 24h >> hrm-sync.log
timeout /t 86400 /nobreak >nul
goto loop
