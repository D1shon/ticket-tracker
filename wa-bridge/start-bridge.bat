@echo off
cd /d c:\Users\Sales5\.gemini\antigravity\scratch\ticket-tracker
:loop
node wa-bridge\bridge.mjs >> wa-bridge\bridge.log 2>&1
echo %date% %time% bridge exited, restarting in 15s >> wa-bridge\bridge.log
timeout /t 15 /nobreak >nul
goto loop
